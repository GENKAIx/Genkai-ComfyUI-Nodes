import {app} from "../../scripts/app.js";
import {createSlots} from "./seed_slots_view.js";

app.registerExtension({
    name: "GENKAI.SeedSlots",
    async beforeRegisterNodeDef(nodeType, data) {
        if (data.name !== "GenkaiSeedSlots") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            this.properties ||= {};
            const seed = this.widgets.find(w => w.name === "seed");
            const lock = this.widgets.find(w => w.name === "lock_seed");
            for (const widget of [seed, lock]) {
                widget.type = "converted-widget";
                widget.computeSize = () => [0, -4];
                widget.draw = () => {};
            }
            this.seedSlots = createSlots({
                read: () => ({seed: seed.value, locked: lock.value, ledger: this.properties.seedSlotsLedger, history: this.properties.seedSlotsHistory ?? []}),
                change: (value, locked) => {
                    seed.value = value; lock.value = locked;
                    this.graph?.change();
                    this.setDirtyCanvas(true, true);
                },
                remember: ledger => { this.properties.seedSlotsLedger = ledger; this.graph?.change(); this.setDirtyCanvas(true, true); },
            });
            const widget = this.addDOMWidget("seed_slots_display", "GENKAI_SEED_SLOTS", this.seedSlots.element, {
                serialize: false, hideOnZoom: false, getMinHeight: () => 650, getMaxHeight: () => Infinity,
            });
            widget.serialize = false;
            this.setSize([800, 840]);
            return result;
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = configured?.apply(this, arguments);
            this.seedSlots?.restore();
            return result;
        };
        const executed = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = executed?.apply(this, arguments);
            const event = message?.seed_slots?.[0];
            if (Number.isSafeInteger(event?.seed)) this.seedSlots?.receive(event);
            return result;
        };
        const removed = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this.seedSlots?.dispose();
            return removed?.apply(this, arguments);
        };
    },
});
