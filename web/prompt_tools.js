import { app } from "../../scripts/app.js";

const sheet = document.createElement("link");
sheet.rel = "stylesheet";
sheet.href = new URL("./prompt_tools.css", import.meta.url).href;
document.head.append(sheet);

const BANK = "GenkaiPromptBank";
const MERGE = "GenkaiPromptMerge";
const BUNDLE = "GENKAI_PROMPTS";
const views = new Set();

function el(tag, cls, text) {
    const result = document.createElement(tag);
    result.className = cls;
    if (text !== undefined) result.textContent = text;
    return result;
}
function read(widget, fallback) {
    try { return JSON.parse(widget.value); } catch { return fallback; }
}
function hide(widget) {
    widget.type = "converted-widget";
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
}
function touch(node) {
    node.graph?.change();
    node.setDirtyCanvas(true, true);
    for (const view of views) view.sync();
}
function bankSource(node, seen = new Set()) {
    if (!node || seen.has(node)) return null;
    seen.add(node);
    if (node.comfyClass === BANK) return node;
    const input = node.inputs?.find(i => i.name === "prompts") ?? (node.type === "Reroute" ? node.inputs[0] : null);
    const link = node.graph?.links[input?.link];
    return link ? bankSource(node.graph.getNodeById(link.origin_id), seen) : null;
}

function editor(node, kind) {
    const root = el("div", `gk-prompts ${kind}`);
    const content = el("div", "gk-prompt-content");
    root.append(content);
    let height = 260;
    let pending = 0;
    node.widgets_start_y = 32;
    const widget = node.addDOMWidget("prompt_editor", "GENKAI_PROMPTS", root, {
        serialize: false, hideOnZoom: false,
        getMinHeight: () => height, getMaxHeight: () => Infinity,
    });
    widget.serialize = false;
    const compute = node.computeSize;
    node.computeSize = function (out) {
        const size = compute.call(this, out);
        return [Math.max(380, size[0]), height + 48];
    };
    function measure() {
        pending = 0;
        if (!root.isConnected || !root.clientWidth) return;
        for (const field of content.querySelectorAll("textarea")) {
            field.style.height = "auto";
            field.style.height = `${field.scrollHeight + 2}px`;
        }
        height = content.offsetHeight + 40;
        if (Math.abs(node.size[1] - height - 48) > 1) {
            node.setSize([Math.max(380, node.size[0]), height + 48]);
            node.setDirtyCanvas(true, true);
        }
    }
    function schedule() { if (!pending) pending = requestAnimationFrame(measure); }
    const observer = new ResizeObserver(schedule);
    observer.observe(root); observer.observe(content);
    const resized = node.onResize;
    node.onResize = function () { const result = resized?.apply(this, arguments); schedule(); return result; };
    node.setSize([480, height + 48]);
    return { content, schedule, dispose() { observer.disconnect(); cancelAnimationFrame(pending); } };
}

function createBank(node) {
    const state = node.widgets.find(w => w.name === "prompts_json");
    hide(state);
    const layout = editor(node, "gk-bank");
    const rows = el("div", "gk-prompt-rows");
    const add = el("button", "gk-add-prompt", "+ Add Prompt");
    const merge = el("button", "gk-add-merge", "+ Add Prompt Merge");
    layout.content.append(rows, add, merge);
    let items = [];
    function save() { state.value = JSON.stringify(items); touch(node); layout.schedule(); }
    function render() {
        rows.replaceChildren();
        items.forEach((item, index) => {
            const card = el("div", "gk-bank-card");
            const heading = el("div", "gk-prompt-heading");
            const remove = el("button", "gk-remove-prompt", "×");
            remove.setAttribute("aria-label", `Remove prompt ${index + 1}`);
            remove.title = `Remove prompt ${index + 1}`;
            remove.disabled = items.length === 1;
            heading.append(el("span", "", `PROMPT ${String(index + 1).padStart(2, "0")}`), remove);
            const field = el("textarea", "gk-bank-text");
            field.rows = 3; field.value = item.text; field.placeholder = "Write a prompt…";
            field.setAttribute("aria-label", `Prompt ${index + 1}`);
            field.addEventListener("input", () => { item.text = field.value; save(); });
            remove.addEventListener("click", () => { items.splice(index, 1); save(); render(); });
            card.append(heading, field); rows.append(card);
        });
        layout.schedule();
    }
    add.addEventListener("click", () => {
        items.push({id: crypto.randomUUID(), text: ""}); save(); render();
        rows.lastElementChild.querySelector("textarea").focus();
    });
    merge.addEventListener("click", () => {
        if (!node.graph) return;
        const target = LiteGraph.createNode(MERGE);
        target.pos = [node.pos[0] + node.size[0] + 100, node.pos[1]];
        const occupied = node.graph._nodes.filter(n => n !== node);
        while (occupied.some(n => Math.abs(n.pos[0] - target.pos[0]) < 100 && Math.abs(n.pos[1] - target.pos[1]) < n.size[1] + 30)) {
            target.pos[1] += 80;
        }
        node.graph.add(target);
        node.connect(0, target, target.inputs.findIndex(i => i.name === "prompts"));
        target.genkaiPrompts.sync(); touch(node);
        requestAnimationFrame(() => {
            app.canvas.selectNode(target);
            app.canvas.centerOnNode(target);
        });
    });
    function restore() {
        items = read(state, [""]).map((item, index) => typeof item === "string" ? {id: crypto.randomUUID(), text: item} : item);
        if (!items.length) items = [{id: crypto.randomUUID(), text: ""}];
        state.value = JSON.stringify(items);
        render();
    }
    restore();
    return { items: () => items, restore, sync() {}, dispose: layout.dispose };
}

function createMerge(node) {
    const state = node.widgets.find(w => w.name === "rows_json");
    const separator = node.widgets.find(w => w.name === "separator");
    hide(state); hide(separator);
    const layout = editor(node, "gk-merge");
    const rows = el("div", "gk-prompt-rows");
    const separatorLabel = el("label", "gk-separator");
    const field = el("textarea", "");
    field.rows = 1; field.setAttribute("aria-label", "Separator");
    field.title = "Exact text between prompts. Enter inserts a new line. Leave empty to join without a separator.";
    separatorLabel.append(el("span", "", "Separator"), field);
    const output = el("textarea", "gk-output-preview");
    output.rows = 3; output.readOnly = true; output.setAttribute("aria-label", "Output preview");
    const note = el("div", "gk-prompt-note");
    layout.content.append(rows, separatorLabel, el("div", "gk-output-label", "OUTPUT PREVIEW"), output, note);
    let settings = {};
    let items = [];
    let signature = "";
    let cached = null;
    let cachedLink = null;
    function save() { state.value = JSON.stringify(settings); node.graph?.change(); node.setDirtyCanvas(true, true); }
    function preview() {
        output.value = items.filter(p => settings[p.id]?.enabled !== false && p.text.trim()).map(p => p.text).join(separator.value);
        note.textContent = items.length ? `${items.filter(p => settings[p.id]?.enabled !== false).length} of ${items.length} prompts enabled` : "No Prompt Bank connected";
        layout.schedule();
    }
    function render() {
        rows.replaceChildren();
        items.forEach((item, index) => {
            const config = settings[item.id] ??= {name: `Prompt ${index + 1}`, enabled: true};
            const card = el("div", "gk-merge-card"); card.dataset.id = item.id; card.dataset.enabled = String(config.enabled);
            const heading = el("div", "gk-merge-heading");
            const name = el("textarea", "gk-row-name"); name.rows = 1; name.value = config.name;
            name.setAttribute("aria-label", `Name for prompt ${index + 1}`);
            name.addEventListener("input", () => { config.name = name.value; save(); layout.schedule(); });
            const toggleGroup = el("div", "gk-row-toggle");
            const toggle = el("button", "gk-switch");
            toggle.setAttribute("role", "switch"); toggle.setAttribute("aria-checked", String(config.enabled));
            toggle.setAttribute("aria-label", `Enable prompt ${index + 1}`);
            const toggleLabel = el("span", "gk-toggle-label", config.enabled ? "ON" : "OFF");
            toggle.addEventListener("click", () => {
                config.enabled = !config.enabled;
                toggle.setAttribute("aria-checked", String(config.enabled)); card.dataset.enabled = String(config.enabled);
                toggleLabel.textContent = config.enabled ? "ON" : "OFF"; save(); preview();
            });
            toggleGroup.append(toggle, toggleLabel); heading.append(name, toggleGroup);
            card.append(heading); rows.append(card);
        });
        save(); preview();
    }
    function sync(force = false) {
        if (app.configuringGraph && !force) return;
        const source = bankSource(node);
        const link = node.inputs.find(i => i.name === "prompts")?.link;
        items = source?.genkaiPrompts?.items() ?? (link != null && cachedLink === link ? cached : null) ?? [];
        const next = JSON.stringify([source?.id ?? link, items.map(p => p.id)]);
        if (force || next !== signature) { signature = next; render(); } else preview();
    }
    field.addEventListener("input", () => { separator.value = field.value; save(); preview(); });
    function restore() { settings = read(state, {}); field.value = separator.value; sync(true); }
    const view = { restore, sync,
        receive(message) {
            cached = message?.genkai_merge?.[0]?.items ?? null;
            cachedLink = node.inputs.find(i => i.name === "prompts")?.link;
            sync();
        },
        dispose() { views.delete(view); layout.dispose(); },
    };
    views.add(view); restore();
    return view;
}

// Convert the first release's individual Bank → Merge wires to the bundle.
function migrate(graph) {
    if (!graph) return;
    const banks = graph._nodes.filter(n => n.comfyClass === BANK);
    const merges = graph._nodes.filter(n => n.comfyClass === MERGE);
    const reconnect = [];
    for (const merge of merges) {
        const oldInputs = merge.inputs.filter(i => i.name.startsWith("prompts."));
        if (!oldInputs.length) continue;
        const widget = merge.widgets.find(w => w.name === "rows_json");
        const oldSettings = read(widget, {});
        const settings = {};
        let bank = null;
        for (const input of oldInputs) {
            const link = graph.links[input.link];
            const source = link && graph.getNodeById(link.origin_id);
            if (source?.comfyClass !== BANK) continue;
            bank ??= source;
            if (source !== bank) continue;
            const item = bank.genkaiPrompts.items()[link.origin_slot];
            if (item) settings[item.id] = oldSettings[input.name.slice(8)] ?? {name: `Prompt ${link.origin_slot + 1}`, enabled: true};
        }
        for (let i = merge.inputs.length - 1; i >= 0; i--) {
            if (merge.inputs[i].name.startsWith("prompts.")) merge.removeInput(i);
        }
        if (!merge.inputs.some(i => i.name === "prompts")) merge.addInput("prompts", BUNDLE);
        widget.value = JSON.stringify(settings);
        if (bank) reconnect.push([bank, merge]);
    }
    for (const bank of banks) {
        if (bank.outputs.length === 1 && bank.outputs[0].type === BUNDLE) continue;
        while (bank.outputs.length) bank.removeOutput(bank.outputs.length - 1);
        bank.addOutput("PROMPTS", BUNDLE);
    }
    for (const [bank, merge] of reconnect) bank.connect(0, merge, merge.inputs.findIndex(i => i.name === "prompts"));
    for (const node of [...banks, ...merges]) node.genkaiPrompts.restore();
}

app.registerExtension({
    name: "GENKAI.PromptTools",
    async beforeRegisterNodeDef(nodeType, data) {
        if (![BANK, MERGE].includes(data.name)) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            this.genkaiPrompts = data.name === BANK ? createBank(this) : createMerge(this);
            const connections = this.onConnectionsChange;
            this.onConnectionsChange = function () {
                const result = connections?.apply(this, arguments);
                requestAnimationFrame(() => { for (const view of views) view.sync(); });
                return result;
            };
            return result;
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = configured?.apply(this, arguments);
            this.genkaiPrompts?.restore(); return result;
        };
        const executed = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = executed?.apply(this, arguments);
            this.genkaiPrompts?.receive?.(message); return result;
        };
        const removed = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this.genkaiPrompts?.dispose(); return removed?.apply(this, arguments);
        };
    },
    afterConfigureGraph() { migrate(app.graph); },
});
