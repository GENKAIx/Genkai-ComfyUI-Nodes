import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";
import {
  dragMargins, expandedSize, normalizeMargins, parseHexColor,
} from "./image_canvas_expand_core.mjs";

const NODE = "GenkaiImageCanvasExpand";
const MAX_DIMENSION = 16384;
const MAX_PIXELS = 64_000_000;
const NODE_HEIGHT = 430;
const PANEL_HEIGHT = 350;

if (!document.querySelector('link[data-genkai-canvas-expand]')) {
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("./image_canvas_expand.css?v=3", import.meta.url).href;
  sheet.dataset.genkaiCanvasExpand = "";
  document.head.append(sheet);
}

function el(tag, className = "", text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, className = "") {
  const element = el("button", className, label);
  element.type = "button";
  return element;
}

function imageDescriptor(imageFile) {
  const relative = String(imageFile || "").replace(/ \[input\]$/, "").replaceAll("\\", "/");
  const parts = relative.split("/");
  const filename = parts.pop() || "";
  return {filename, subfolder: parts.join("/"), type: "input"};
}

function imageURL(imageFile) {
  const params = new URLSearchParams(imageDescriptor(imageFile));
  return api.apiURL(`/view?${params}`);
}

function fillColor(mode, custom) {
  if (mode === "white") return "#FFFFFF";
  if (mode === "custom") return parseHexColor(custom) || "#808080";
  return "#000000";
}

function makeView(node) {
  const names = ["image_file", "left", "right", "top", "bottom", "fill", "custom_color"];
  const widgets = Object.fromEntries(names.map(name => [name, node.widgets?.find(w => w.name === name)]));
  if (names.some(name => !widgets[name])) throw new Error("Image Canvas Expand widgets are missing");
  for (const widget of Object.values(widgets)) {
    widget.type = "converted-widget";
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
  }
  node.widgets_start_y = 28;

  const root = el("div", "gkce-node");
  const toolbar = el("div", "gkce-toolbar");
  const loadButton = button("Load image…", "gkce-button");
  const editButton = button("Crop / expand", "gkce-button gkce-primary");
  editButton.disabled = true;
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
  fileInput.hidden = true;
  toolbar.append(loadButton, editButton, fileInput);

  const preview = el("div", "gkce-preview");
  const previewCanvas = el("canvas", "gkce-preview-canvas");
  const empty = el("div", "gkce-empty", "Drop an image, choose a file, or hover here and press Ctrl+V");
  preview.append(previewCanvas, empty);
  const metrics = el("div", "gkce-metrics");
  const original = el("span", "", "Original —");
  const expanded = el("span", "", "Output —");
  metrics.append(original, el("span", "gkce-arrow", "→"), expanded);
  const status = el("div", "gkce-status");
  status.setAttribute("role", "status");
  root.append(toolbar, preview, metrics, status);

  let source = null;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let loadingToken = 0;
  let uploadToken = 0;
  let modal = null;
  let closeModal = null;
  let disposed = false;
  const abort = new AbortController();
  const on = (target, event, handler) => target.addEventListener(event, handler, {signal: abort.signal});

  const domWidget = node.addDOMWidget("canvas_expand_panel", "GENKAI_CANVAS_EXPAND", root, {
    serialize: false, hideOnZoom: false,
    getMinHeight: () => PANEL_HEIGHT,
    getMaxHeight: () => PANEL_HEIGHT,
  });
  domWidget.serialize = false;

  function margins() {
    return normalizeMargins({
      left: widgets.left.value, right: widgets.right.value,
      top: widgets.top.value, bottom: widgets.bottom.value,
    });
  }

  function touch() {
    node.graph?.change();
    node.setDirtyCanvas(true, true);
  }

  function drawInline() {
    if (!source || !previewCanvas.isConnected) return;
    const box = preview.getBoundingClientRect();
    const width = Math.max(1, Math.floor(box.width));
    const height = Math.max(1, Math.floor(box.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    previewCanvas.width = Math.round(width * ratio);
    previewCanvas.height = Math.round(height * ratio);
    const ctx = previewCanvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const pads = margins();
    const out = expandedSize(sourceWidth, sourceHeight, pads);
    if (out.width < 1 || out.height < 1) return;
    const scale = Math.min((width - 20) / out.width, (height - 20) / out.height);
    const x = (width - out.width * scale) / 2;
    const y = (height - out.height * scale) / 2;
    ctx.fillStyle = fillColor(widgets.fill.value, widgets.custom_color.value);
    ctx.fillRect(x, y, out.width * scale, out.height * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, out.width * scale, out.height * scale);
    ctx.clip();
    ctx.drawImage(source, x + pads.left * scale, y + pads.top * scale,
      sourceWidth * scale, sourceHeight * scale);
    ctx.restore();
    ctx.strokeStyle = "#8d9bad";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, out.width * scale - 1, out.height * scale - 1);
  }

  function updateMetrics() {
    const ready = Boolean(source);
    empty.hidden = ready;
    previewCanvas.hidden = !ready;
    editButton.disabled = !ready;
    original.textContent = ready ? `Original ${sourceWidth} × ${sourceHeight}` : "Original —";
    const out = ready ? expandedSize(sourceWidth, sourceHeight, margins()) : null;
    expanded.textContent = out ? `Output ${out.width} × ${out.height}` : "Output —";
    drawInline();
  }

  function loadPreview() {
    const token = ++loadingToken;
    source = null;
    sourceWidth = sourceHeight = 0;
    updateMetrics();
    const imageFile = widgets.image_file.value;
    if (!imageFile) return;
    const image = new Image();
    image.onload = () => {
      if (disposed || token !== loadingToken) return;
      source = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
      status.textContent = "";
      updateMetrics();
    };
    image.onerror = () => {
      if (disposed || token !== loadingToken) return;
      status.textContent = "Could not preview this image.";
      updateMetrics();
    };
    image.src = imageURL(imageFile);
  }

  async function upload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) {
      status.textContent = "Choose an image file.";
      return;
    }
    const token = ++uploadToken;
    loadButton.disabled = true;
    status.textContent = "Uploading image…";
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("type", "input");
      form.append("subfolder", "genkai_canvas_expand");
      const response = await api.fetchApi("/upload/image", {method: "POST", body: form});
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const result = await response.json();
      if (disposed || token !== uploadToken) return;
      widgets.image_file.value = [result.subfolder || "", result.name].filter(Boolean).join("/");
      for (const side of ["left", "right", "top", "bottom"]) widgets[side].value = 0;
      touch();
      loadPreview();
      status.textContent = "Image loaded. Open the editor to crop or expand it.";
    } catch (error) {
      if (!disposed && token === uploadToken) status.textContent = error.message;
    } finally {
      if (token === uploadToken) loadButton.disabled = false;
      fileInput.value = "";
    }
  }

  function openEditor() {
    if (!source || modal) return;
    const draft = {
      margins: margins(),
      fill: widgets.fill.value || "black",
      custom: widgets.custom_color.value || "#808080",
    };
    modal = el("div", "gkce-backdrop");
    const panel = el("div", "gkce-editor");
    const header = el("div", "gkce-editor-header");
    const title = el("div", "");
    title.append(el("strong", "", "CROP / EXPAND CANVAS"),
      el("small", "", `Original ${sourceWidth} × ${sourceHeight}`));
    const closeButton = button("×", "gkce-close");
    closeButton.setAttribute("aria-label", "Close editor");
    header.append(title, closeButton);

    const stage = el("div", "gkce-stage");
    const stageCanvas = el("canvas", "gkce-stage-canvas");
    stage.append(stageCanvas);
    const sideControls = el("div", "gkce-controls");
    const sizeLine = el("div", "gkce-size-line");
    const sideFields = el("div", "gkce-side-fields");
    const sideInputs = {};
    for (const side of ["left", "right", "top", "bottom"]) {
      const label = el("label", "gkce-field");
      label.append(el("span", "", side[0].toUpperCase() + side.slice(1)));
      const input = el("input");
      input.type = "number";
      input.min = "-8192";
      input.max = "8192";
      input.step = "1";
      input.value = String(draft.margins[side]);
      sideInputs[side] = input;
      label.append(input);
      sideFields.append(label);
    }
    const fillHeading = el("div", "gkce-section-heading", "NEW AREA FILL");
    const fillRow = el("div", "gkce-fill-row");
    const modeButtons = {};
    for (const [mode, label] of [["black", "Black"], ["white", "White"], ["custom", "Custom"]]) {
      const control = button(label, "gkce-mode");
      control.dataset.mode = mode;
      modeButtons[mode] = control;
      fillRow.append(control);
    }
    const colorInput = el("input", "gkce-color-input");
    colorInput.type = "text";
    colorInput.maxLength = 7;
    colorInput.value = draft.custom;
    colorInput.placeholder = "#808080";
    colorInput.setAttribute("aria-label", "Custom hex color");
    fillRow.append(colorInput);
    const hint = el("div", "gkce-hint", "Drag handles inward to crop or outward to expand. Negative edge values crop pixels.");
    const warning = el("div", "gkce-warning");
    sideControls.append(sizeLine, sideFields, fillHeading, fillRow, hint, warning);
    const footer = el("div", "gkce-editor-footer");
    const cancelButton = button("Cancel", "gkce-button");
    const applyButton = button("Apply", "gkce-button gkce-primary");
    footer.append(cancelButton, applyButton);
    panel.append(header, stage, sideControls, footer);
    modal.append(panel);
    document.body.append(modal);

    let drag = null;
    let geometry = null;
    let closed = false;
    const handles = ["top-left", "top", "top-right", "right",
      "bottom-right", "bottom", "bottom-left", "left"];
    const modalObserver = new ResizeObserver(drawStage);
    modalObserver.observe(stage);

    function isValid() {
      const out = expandedSize(sourceWidth, sourceHeight, draft.margins);
      const colorValid = draft.fill !== "custom" || Boolean(parseHexColor(draft.custom));
      const cropValid = out.width >= 1 && out.height >= 1
        && draft.margins.left > -sourceWidth && draft.margins.right > -sourceWidth
        && draft.margins.top > -sourceHeight && draft.margins.bottom > -sourceHeight;
      const sizeValid = out.width <= MAX_DIMENSION && out.height <= MAX_DIMENSION
        && out.width * out.height <= MAX_PIXELS;
      warning.textContent = !colorValid ? "Enter a hex color such as #7F8A90."
        : !cropValid ? "Cropping must leave at least one source pixel."
        : !sizeValid ? "Output image is too large (limit: 16384px per edge, 64 million pixels)."
        : "";
      applyButton.disabled = !colorValid || !cropValid || !sizeValid;
      return !applyButton.disabled;
    }

    function refreshControls() {
      for (const side of Object.keys(sideInputs)) {
        sideInputs[side].value = String(draft.margins[side]);
        const horizontal = side === "left" || side === "right";
        const dimension = horizontal ? sourceWidth : sourceHeight;
        const opposite = {left: "right", right: "left", top: "bottom", bottom: "top"}[side];
        sideInputs[side].min = String(Math.max(-8192, 1 - dimension,
          1 - dimension - draft.margins[opposite]));
      }
      for (const [mode, control] of Object.entries(modeButtons))
        control.setAttribute("aria-pressed", String(draft.fill === mode));
      colorInput.hidden = draft.fill !== "custom";
      const out = expandedSize(sourceWidth, sourceHeight, draft.margins);
      sizeLine.textContent = `${sourceWidth} × ${sourceHeight}  →  ${out.width} × ${out.height} px`;
      isValid();
      drawStage();
    }

    function fitGeometry(width, height) {
      const minX = Math.min(0, -draft.margins.left);
      const minY = Math.min(0, -draft.margins.top);
      const maxX = Math.max(sourceWidth, sourceWidth + draft.margins.right);
      const maxY = Math.max(sourceHeight, sourceHeight + draft.margins.bottom);
      const scale = Math.min((width - 90) / (maxX - minX),
        (height - 90) / (maxY - minY), 4);
      const x = (width - (maxX - minX) * scale) / 2 - minX * scale;
      const y = (height - (maxY - minY) * scale) / 2 - minY * scale;
      return {x, y, scale};
    }

    function rectFor(geo) {
      const {x, y, scale} = geo;
      return {
        left: x - draft.margins.left * scale,
        top: y - draft.margins.top * scale,
        right: x + (sourceWidth + draft.margins.right) * scale,
        bottom: y + (sourceHeight + draft.margins.bottom) * scale,
      };
    }

    function handlePositions(rect) {
      const middleX = (rect.left + rect.right) / 2;
      const middleY = (rect.top + rect.bottom) / 2;
      return {
        "top-left": [rect.left, rect.top], top: [middleX, rect.top],
        "top-right": [rect.right, rect.top], right: [rect.right, middleY],
        "bottom-right": [rect.right, rect.bottom], bottom: [middleX, rect.bottom],
        "bottom-left": [rect.left, rect.bottom], left: [rect.left, middleY],
      };
    }

    function drawStage() {
      if (closed || !stageCanvas.isConnected) return;
      const box = stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(box.width));
      const height = Math.max(1, Math.floor(box.height));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      stageCanvas.width = Math.round(width * ratio);
      stageCanvas.height = Math.round(height * ratio);
      const ctx = stageCanvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const geo = drag?.geometry || fitGeometry(width, height);
      geometry = geo;
      const rect = rectFor(geo);
      ctx.fillStyle = "#0c0f14";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 0.32;
      ctx.drawImage(source, geo.x, geo.y, sourceWidth * geo.scale, sourceHeight * geo.scale);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.clip();
      ctx.fillStyle = fillColor(draft.fill, draft.custom);
      ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.drawImage(source, geo.x, geo.y, sourceWidth * geo.scale, sourceHeight * geo.scale);
      ctx.restore();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#9ba8b780";
      ctx.lineWidth = 1;
      ctx.strokeRect(geo.x, geo.y, sourceWidth * geo.scale, sourceHeight * geo.scale);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#80c7e8";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      for (const point of Object.values(handlePositions(rect))) {
        ctx.fillStyle = "#a8e1f6";
        ctx.fillRect(point[0] - 5, point[1] - 5, 10, 10);
        ctx.strokeStyle = "#122430";
        ctx.lineWidth = 1;
        ctx.strokeRect(point[0] - 5, point[1] - 5, 10, 10);
      }
    }

    function pointerPoint(event) {
      const box = stageCanvas.getBoundingClientRect();
      return [event.clientX - box.left, event.clientY - box.top];
    }

    function hitHandle(point) {
      if (!geometry) return null;
      const positions = handlePositions(rectFor(geometry));
      for (const handle of handles) {
        const [x, y] = positions[handle];
        if (Math.abs(point[0] - x) <= 14 && Math.abs(point[1] - y) <= 14) return handle;
      }
      return null;
    }

    function close() {
      if (closed) return;
      closed = true;
      modalObserver.disconnect();
      if (drag && stageCanvas.hasPointerCapture(drag.pointerId))
        stageCanvas.releasePointerCapture(drag.pointerId);
      modal.remove();
      modal = null;
      closeModal = null;
      editButton.focus();
    }
    closeModal = close;

    for (const side of Object.keys(sideInputs)) {
      sideInputs[side].addEventListener("change", () => {
        draft.margins[side] = Math.max(Number(sideInputs[side].min),
          normalizeMargins({[side]: sideInputs[side].value})[side]);
        refreshControls();
      });
    }
    for (const [mode, control] of Object.entries(modeButtons)) {
      control.addEventListener("click", () => {
        draft.fill = mode;
        refreshControls();
      });
    }
    colorInput.addEventListener("input", () => {
      draft.custom = colorInput.value;
      isValid();
      drawStage();
    });
    stageCanvas.addEventListener("pointerdown", event => {
      const point = pointerPoint(event);
      const handle = hitHandle(point);
      if (!handle) return;
      event.preventDefault();
      stageCanvas.setPointerCapture(event.pointerId);
      drag = {
        pointerId: event.pointerId, handle, start: {...draft.margins},
        point, geometry: {...geometry},
      };
    });
    stageCanvas.addEventListener("pointermove", event => {
      const point = pointerPoint(event);
      if (drag && drag.pointerId === event.pointerId) {
        draft.margins = dragMargins(drag.start, drag.handle,
          point[0] - drag.point[0], point[1] - drag.point[1], drag.geometry.scale,
          sourceWidth, sourceHeight);
        refreshControls();
      } else {
        const handle = hitHandle(point);
        stageCanvas.style.cursor = !handle ? "default"
          : handle === "top-right" || handle === "bottom-left" ? "nesw-resize"
          : handle.includes("left") || handle.includes("right")
            ? (handle.includes("top") || handle.includes("bottom") ? "nwse-resize" : "ew-resize")
            : "ns-resize";
      }
    });
    const endDrag = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      stageCanvas.releasePointerCapture(event.pointerId);
      drawStage();
    };
    stageCanvas.addEventListener("pointerup", endDrag);
    stageCanvas.addEventListener("pointercancel", endDrag);
    closeButton.addEventListener("click", close);
    cancelButton.addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    modal.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Escape") close();
    });
    applyButton.addEventListener("click", () => {
      if (!isValid()) return;
      for (const side of Object.keys(sideInputs)) widgets[side].value = draft.margins[side];
      widgets.fill.value = draft.fill;
      widgets.custom_color.value = parseHexColor(draft.custom) || "#808080";
      touch();
      updateMetrics();
      close();
    });
    for (const event of ["pointerdown", "pointerup", "wheel", "dblclick"])
      modal.addEventListener(event, e => e.stopPropagation());
    refreshControls();
    closeButton.focus();
  }

  on(loadButton, "click", () => fileInput.click());
  on(fileInput, "change", () => upload(fileInput.files?.[0]));
  on(editButton, "click", openEditor);
  on(root, "dragover", event => {
    event.preventDefault();
    event.stopPropagation();
    root.classList.add("is-dragging");
  });
  on(root, "dragleave", () => root.classList.remove("is-dragging"));
  on(root, "drop", event => {
    event.preventDefault();
    event.stopPropagation();
    root.classList.remove("is-dragging");
    upload(event.dataTransfer.files?.[0]);
  });
  document.addEventListener("paste", event => {
    if (disposed || !root.isConnected ||
        (!root.matches(":hover") && !modal?.matches(":hover")) ||
        event.target?.closest?.("input, textarea, [contenteditable='true']")) return;
    const file = [...(event.clipboardData?.items || [])]
      .find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
      || [...(event.clipboardData?.files || [])].find(item => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const extension = {
      "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
      "image/bmp": "bmp", "image/tiff": "tiff",
    }[file.type] || "png";
    const pasted = new File([file], `clipboard-${Date.now()}.${extension}`,
      {type: file.type || "image/png"});
    closeModal?.();
    upload(pasted);
  }, {capture: true, signal: abort.signal});
  for (const event of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "keydown"])
    on(root, event, e => e.stopPropagation());
  const resizeObserver = new ResizeObserver(drawInline);
  resizeObserver.observe(preview);
  const previousCompute = node.computeSize;
  node.computeSize = function (out) {
    const size = previousCompute?.call(this, out) || this.size || [430, NODE_HEIGHT];
    return [Math.max(340, size[0]), NODE_HEIGHT];
  };
  const previousResize = node.onResize;
  node.onResize = function (size) {
    if (size) {
      size[0] = Math.max(340, size[0]);
      size[1] = NODE_HEIGHT;
    }
    return previousResize?.apply(this, arguments);
  };
  node.setSize([Math.max(430, node.size?.[0] || 0), NODE_HEIGHT]);

  function restore() {
    loadPreview();
    node.setSize([Math.max(340, node.size?.[0] || 0), NODE_HEIGHT]);
    node.setDirtyCanvas(true, true);
  }
  restore();
  return {
    restore,
    dispose() {
      disposed = true;
      ++loadingToken;
      ++uploadToken;
      abort.abort();
      resizeObserver.disconnect();
      closeModal?.();
    },
  };
}

app.registerExtension({
  name: "GENKAI.ImageCanvasExpand",
  async beforeRegisterNodeDef(nodeType, data) {
    if (data.name !== NODE) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      try { this.genkaiCanvasExpand = makeView(this); }
      catch (error) { console.error("[GENKAI Image Canvas Expand]", error); }
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured?.apply(this, arguments);
      setTimeout(() => this.genkaiCanvasExpand?.restore(), 0);
      return result;
    };
    const removed = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this.genkaiCanvasExpand?.dispose();
      return removed?.apply(this, arguments);
    };
  },
});
