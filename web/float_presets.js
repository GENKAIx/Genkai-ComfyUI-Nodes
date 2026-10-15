import {app} from "../../scripts/app.js";
import {MAX_PRESETS, columnsForWidth, formatValue, normalizeConfig, parseValue} from "./float_presets_core.mjs";

const NODE = "GenkaiFloatPresets";
if (!document.querySelector('link[data-genkai-float-presets]')) {
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("./float_presets.css?v=4", import.meta.url).href;
  sheet.dataset.genkaiFloatPresets = "";
  document.head.append(sheet);
}

function el(tag, className = "", text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createView(node) {
  const native = node.widgets?.find(widget => widget.name === "selected");
  if (!native) throw new Error("Float Presets value widget was not created");
  native.type = "converted-widget";
  native.computeSize = () => [0, -4];
  native.draw = () => {};
  node.properties ||= {};

  const root = el("div", "gkfp");
  const deck = el("div", "gkfp-deck");
  root.append(deck);
  let config = normalizeConfig(node.properties.genkaiFloatPresets, native.value);
  let measuredHeight = 90;
  let resizeFrame = 0;
  let disposed = false;
  node.widgets_start_y = 28;
  const widget = node.addDOMWidget("float_presets_panel", "GENKAI_FLOAT_PRESETS", root, {
    serialize: false, hideOnZoom: false,
    getMinHeight: () => measuredHeight,
    getMaxHeight: () => Infinity,
  });
  widget.serialize = false;

  function touch() {
    node.properties.genkaiFloatPresets = config;
    node.graph?.change();
    node.setDirtyCanvas(true, true);
  }

  function scheduleSize() {
    if (resizeFrame || disposed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!root.isConnected) return;
      const available = deck.clientWidth;
      if (!available) return;
      const columns = columnsForWidth(config.presets.length + 1, available);
      deck.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      const tileWidth = (available - (columns - 1) * 8) / columns;
      deck.style.setProperty("--gkfp-number-size", `${Math.min(36, Math.max(20, tileWidth * .23))}px`);
      measuredHeight = Math.max(56, Math.ceil(deck.getBoundingClientRect().height));
      const width = Math.max(210, node.size?.[0] || 420);
      const height = measuredHeight + 56;
      if (Math.abs((node.size?.[1] || 0) - height) > 2 || node.size?.[0] < 210) {
        node.setSize([width, height]);
        node.setDirtyCanvas(true, true);
      }
    });
  }

  function selectedPreset() {
    return config.presets.find(item => item.id === config.selectedId) || config.presets[0];
  }

  function editValue(preset, valueText) {
    const input = el("input", "gkfp-value-input");
    input.type = "text";
    input.inputMode = "decimal";
    input.spellcheck = false;
    input.value = formatValue(preset.value);
    input.setAttribute("aria-label", "Edit value");
    valueText.replaceWith(input);
    let finished = false;
    function finish(save) {
      if (finished) return;
      if (save) {
        const value = parseValue(input.value);
        if (value === null) {
          input.setCustomValidity("Enter a finite number from -1000000000 to 1000000000");
          input.reportValidity();
          input.setCustomValidity("");
          input.focus();
          return;
        }
        preset.value = value;
        touch();
      }
      finished = true;
      renderDeck();
    }
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("pointerdown", event => event.stopPropagation());
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }

  function renderDeck() {
    native.value = selectedPreset().value;
    deck.replaceChildren();
    config.presets.forEach((preset, index) => {
      const tile = el("div", "gkfp-tile");
      tile.setAttribute("role", "button");
      tile.tabIndex = 0;
      tile.setAttribute("aria-pressed", String(preset.id === config.selectedId));
      tile.setAttribute("aria-label", `Select ${formatValue(preset.value)}`);
      tile.title = "Click the tile to select; click the number to edit";
      const valueText = el("span", "gkfp-tile-value", formatValue(preset.value));
      valueText.title = "Edit value";
      valueText.addEventListener("click", event => {
        event.stopPropagation();
        editValue(preset, valueText);
      });
      const remove = el("button", "gkfp-remove", "×");
      remove.type = "button";
      remove.title = "Remove value";
      remove.setAttribute("aria-label", `Remove value ${formatValue(preset.value)}`);
      remove.disabled = config.presets.length === 1;
      remove.addEventListener("click", event => {
        event.stopPropagation();
        config.presets.splice(index, 1);
        if (config.selectedId === preset.id)
          config.selectedId = config.presets[Math.min(index, config.presets.length - 1)].id;
        touch();
        renderDeck();
      });
      tile.append(valueText, remove);
      const select = () => {
        if (config.selectedId === preset.id) return;
        config.selectedId = preset.id;
        touch();
        renderDeck();
      };
      tile.addEventListener("click", select);
      tile.addEventListener("keydown", event => {
        if (event.target !== tile || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        select();
      });
      deck.append(tile);
    });
    const add = el("button", "gkfp-add", "+");
    add.type = "button";
    add.title = "Add value";
    add.setAttribute("aria-label", "Add value");
    add.disabled = config.presets.length >= MAX_PRESETS;
    add.addEventListener("click", () => {
      if (config.presets.length >= MAX_PRESETS) return;
      const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const value = parseValue(selectedPreset().value + 1) ?? selectedPreset().value;
      config.presets.push({id, value});
      config.selectedId = id;
      touch();
      renderDeck();
      deck.querySelector(".gkfp-tile:last-of-type .gkfp-tile-value")?.click();
    });
    deck.append(add);
    scheduleSize();
  }

  for (const event of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "keydown"])
    root.addEventListener(event, evt => evt.stopPropagation());
  const observer = new ResizeObserver(scheduleSize);
  observer.observe(root);
  const previousResize = node.onResize;
  node.onResize = function (size) {
    if (size) size[0] = Math.max(210, size[0]);
    const result = previousResize?.apply(this, arguments);
    scheduleSize();
    return result;
  };
  node.setSize([Math.max(420, node.size?.[0] || 0), 140]);

  function restore() {
    config = normalizeConfig(node.properties?.genkaiFloatPresets, native.value);
    node.properties.genkaiFloatPresets = config;
    renderDeck();
  }
  restore();
  return {
    restore,
    dispose() {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    },
  };
}

app.registerExtension({
  name: "GENKAI.FloatPresets",
  async beforeRegisterNodeDef(nodeType, data) {
    if (data.name !== NODE) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      try { this.genkaiFloatPresets = createView(this); }
      catch (error) { console.error("[GENKAI Float Presets] UI setup failed:", error); }
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured?.apply(this, arguments);
      setTimeout(() => this.genkaiFloatPresets?.restore(), 0);
      return result;
    };
    const removed = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this.genkaiFloatPresets?.dispose();
      return removed?.apply(this, arguments);
    };
  },
});
