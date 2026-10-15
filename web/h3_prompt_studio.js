import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  MODES, SECTIONS, GLOSSARY, CATEGORY_NAMES, templateFor, diagnose,
  addMissing, referenceLabels, subjectPictureBindings, classifyLine, tokensInLine, outline, outlineSectionRange,
  createPromptHistory,
} from "./h3_prompt_studio_core.mjs";

const NAME = "GenkaiH3PromptStudio";
const LOADER = "GenkaiMediaBank";
const sheet = document.createElement("link");
sheet.rel = "stylesheet";
sheet.href = new URL("./h3_prompt_studio.css?v=9", import.meta.url).href;
document.head.append(sheet);

const translations = {
  ru: {
    template: "Шаблон", sections: "Секции", references: "Референсы", dialogue: "Реплика",
    missing: "Добавить пропущенные", settings: "Настройки", language: "Язык подсказок",
    style: "Стиль", rich: "Цветная разметка", outline: "Навигация",
    used: "Используемые референсы", noRefs: "Подключите H3 Media Loader к входу references.",
    noUsed: "В промпте пока нет меток подключённых референсов.",
    ready: "Структура секций заполнена", free: "Свободный формат: проверка секций выключена",
    missingCount: "Не хватает секций", order: "Порядок секций отличается от шаблона",
    replace: "Заменить текущий промпт шаблоном?", missingRef: "Нет такого активного референса в H3 Media Loader",
    image: "Изображение", video: "Видео", audio: "Аудио", subject: "Субъект",
    glossary: "Монтаж и камера", insert: "Вставить в промпт",
    undo: "Отменить изменение (Ctrl+Z)", redo: "Повторить изменение (Ctrl+Y)",
  },
  en: {
    template: "Template", sections: "Sections", references: "References", dialogue: "Dialogue",
    missing: "Add missing", settings: "Settings", language: "Tooltip language",
    style: "Style", rich: "Rich highlighting", outline: "Outline",
    used: "Used references", noRefs: "Connect H3 Media Loader to the references input.",
    noUsed: "No connected reference labels are used in the prompt yet.",
    ready: "Required sections present", free: "Free text: section checks are off",
    missingCount: "Missing sections", order: "Section order differs from the template",
    replace: "Replace the current prompt with a template?", missingRef: "No such active reference in H3 Media Loader",
    image: "Picture", video: "Video", audio: "Audio", subject: "Subject",
    glossary: "Editing and camera", insert: "Insert into prompt",
    undo: "Undo change (Ctrl+Z)", redo: "Redo change (Ctrl+Y)",
  },
};

function el(tag, cls = "", text) {
  const result = document.createElement(tag);
  result.className = cls;
  if (text !== undefined) result.textContent = text;
  return result;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value; item.textContent = label;
  return item;
}

function viewURL(annotated) {
  let name = String(annotated || ""), type = "input";
  const match = name.match(/^(.*)\s\[(input|output|temp)\]$/);
  if (match) { name = match[1]; type = match[2]; }
  const slash = name.lastIndexOf("/");
  const subfolder = slash < 0 ? "" : name.slice(0, slash);
  name = slash < 0 ? name : name.slice(slash + 1);
  return api.apiURL(`/view?filename=${encodeURIComponent(name)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`);
}

function sourceNode(node, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (node.comfyClass === LOADER || node.type === LOADER) return node;
  const input = node.inputs?.find(input => input.name === "references") ??
    (node.type === "Reroute" ? node.inputs?.[0] : null);
  const link = node.graph?.links?.[input?.link];
  return link ? sourceNode(node.graph.getNodeById(link.origin_id), seen) : null;
}

function mediaState(node) {
  const source = sourceNode(node);
  const raw = source?.widgets?.find(widget => widget.name === "media_state")?.value;
  try {
    const parsed = JSON.parse(raw);
    return {source, items: Array.isArray(parsed) ? parsed : []};
  }
  catch { return {source, items: []}; }
}

function hideNative(widget) {
  widget.type = "converted-widget";
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
}

function editableText(root, trimBlockEnd = true) {
  function read(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeName === "BR") return "\n";
    let result = "";
    for (const child of node.childNodes) result += read(child);
    if (node !== root && /^(DIV|P)$/.test(node.nodeName) && !result.endsWith("\n")) result += "\n";
    return result;
  }
  const value = read(root);
  const hasBlockChild = [...root.childNodes].some(child => /^(DIV|P)$/.test(child.nodeName));
  return trimBlockEnd && hasBlockChild ? value.replace(/\n$/, "") : value;
}

function editorOffset(editor, container, offset) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(container, offset);
  return editableText(range.cloneContents(), false).length;
}

function editorPoint(editor, index) {
  const target = Math.max(0, index);
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node, passed = 0;
  while ((node = walker.nextNode())) {
    const length = node.nodeValue?.length || 0;
    if (target <= passed + length) return {node, offset:target - passed};
    passed += length;
  }
  return {node:editor, offset:editor.childNodes.length};
}

function makeEditableValue(editor) {
  let savedStart = 0, savedEnd = 0;
  const selectionRange = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode) ||
        !editor.contains(selection.focusNode)) return [savedStart, savedEnd];
    const range = selection.getRangeAt(0);
    savedStart = editorOffset(editor, range.startContainer, range.startOffset);
    savedEnd = editorOffset(editor, range.endContainer, range.endOffset);
    return [savedStart, savedEnd];
  };
  Object.defineProperties(editor, {
    value: {
      get: () => editableText(editor),
      set: value => {
        const top = editor.scrollTop;
        const text = String(value ?? "");
        editor.replaceChildren(...(text ? [document.createTextNode(text)] : []));
        editor.dataset.empty = String(!text);
        editor.scrollTop = top;
      },
    },
    selectionStart: {get: () => selectionRange()[0]},
    selectionEnd: {get: () => selectionRange()[1]},
  });
  editor.setSelectionRange = (start, end = start) => {
    const textLength = editor.value.length;
    savedStart = Math.min(textLength, Math.max(0, Number(start) || 0));
    savedEnd = Math.min(textLength, Math.max(savedStart, Number(end) || 0));
    const a = editorPoint(editor, savedStart), b = editorPoint(editor, savedEnd);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
  };
  editor.setRangeText = (replacement, start, end, mode = "end") => {
    const value = editor.value;
    const updated = value.slice(0, start) + replacement + value.slice(end);
    editor.value = updated;
    const after = start + replacement.length;
    editor.setSelectionRange(mode === "start" ? start : after);
  };
  return selectionRange;
}

function studio(node) {
  const promptWidget = node.widgets?.find(widget => widget.name === "prompt");
  if (!promptWidget) throw new Error("Prompt widget not found");
  hideNative(promptWidget);
  node.properties ||= {};
  const prefs = node.properties.genkaiH3Studio ||= {};
  prefs.mode ||= "free";
  prefs.style ||= "obsidian";
  prefs.language ||= "ru";
  prefs.rich = prefs.rich !== false;
  prefs.fontSize = Number.isFinite(prefs.fontSize) ? prefs.fontSize : 14;

  const root = el("div", "gkh3studio");
  root.dataset.style = prefs.style;
  root.dataset.editing = "false";
  const top = el("div", "gkh3s-top");
  const heading = el("div", "gkh3s-heading", "H3 PROMPT STUDIO");
  const status = el("span", "gkh3s-status");
  top.append(heading, status);
  const toolbar = el("div", "gkh3s-toolbar");
  const mode = el("select", "gkh3s-select");
  MODES.forEach(([id, label]) => mode.append(option(id, label)));
  const template = el("button", "", "Template");
  const section = el("select", "gkh3s-select gkh3s-action-select");
  const reference = el("select", "gkh3s-select gkh3s-action-select");
  const dialogue = el("button", "", "Dialogue");
  const add = el("button", "", "Add missing");
  const rich = el("button", "gkh3s-rich", "Rich text");
  const undoButton = el("button", "gkh3s-history-button", "↶");
  const redoButton = el("button", "gkh3s-history-button", "↷");
  const smaller = el("button", "", "A−");
  const larger = el("button", "", "A+");
  const settingsButton = el("button", "gkh3s-settings-button", "⚙ Settings");
  toolbar.append(mode, template, section, reference, dialogue, add, rich,
    undoButton, redoButton, smaller, larger, settingsButton);
  const settings = el("div", "gkh3s-settings");
  settings.hidden = true;
  const language = el("select", "gkh3s-select");
  language.append(option("ru", "Русский"), option("en", "English"));
  const style = el("select", "gkh3s-select");
  style.append(option("obsidian", "Obsidian"), option("filmstrip", "Filmstrip"),
    option("signal", "Signal Lab"), option("screenplay", "Screenplay"));
  const languageLabel = el("label", "");
  const styleLabel = el("label", "");
  const languageText = el("span", "gkh3s-language-label");
  const styleText = el("span", "gkh3s-style-label");
  languageLabel.append(languageText, language);
  styleLabel.append(styleText, style);
  settings.append(languageLabel, styleLabel);

  const body = el("div", "gkh3s-body");
  const frame = el("div", "gkh3s-frame");
  const input = el("div", "gkh3s-input");
  const overlay = input;
  input.contentEditable = "true";
  input.spellcheck = false;
  input.setAttribute("role", "textbox");
  input.setAttribute("aria-multiline", "true");
  input.setAttribute("aria-label", "MiniMax H3 prompt");
  input.dataset.placeholder = "Write a MiniMax H3 prompt…";
  makeEditableValue(input);
  frame.append(input);
  const side = el("aside", "gkh3s-side");
  const outlineTitle = el("div", "gkh3s-side-title");
  const outlineBox = el("div", "gkh3s-outline");
  const refsTitle = el("div", "gkh3s-side-title");
  const refsBox = el("div", "gkh3s-refs");
  side.append(outlineTitle, outlineBox, refsTitle, refsBox);
  body.append(frame, side);
  const diagnostics = el("div", "gkh3s-diagnostics");
  const tooltip = el("div", "gkh3s-tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  root.append(top, toolbar, settings, body, diagnostics);

  const domWidget = node.addDOMWidget("h3_prompt_studio", "GENKAI_H3_STUDIO", root, {
    serialize: false, hideOnZoom: false,
    getMinHeight: () => Math.max(530, node.size?.[1] - 70 || 530),
    getMaxHeight: () => Infinity,
  });
  domWidget.serialize = false;
  node.widgets_start_y = 32;
  node.setSize([Math.max(node.size?.[0] || 0, 940), Math.max(node.size?.[1] || 0, 690)]);

  let labels = [];
  let mediaSignature = "";
  let connected = false;
  let raf = 0;
  let composing = false;
  let flashRange = null;
  let flashTimer = 0;
  const history = createPromptHistory(String(promptWidget.value ?? ""));
  const t = () => translations[prefs.language] || translations.ru;

  function hideTooltip() { tooltip.hidden = true; tooltip.replaceChildren(); }
  function showTooltip(event, title, description, media) {
    tooltip.replaceChildren();
    tooltip.append(el("strong", "", title));
    if (description) tooltip.append(el("p", "", description));
    if (media?.item?.file && media.kind === "picture") {
      const img = el("img"); img.src = viewURL(media.item.file);
      img.alt = title; tooltip.append(img);
    }
    if (media?.item?.file && media.kind === "video") {
      const video = el("video"); video.src = viewURL(media.item.file);
      video.muted = true; video.preload = "metadata"; video.currentTime = 0;
      tooltip.append(video);
    }
    tooltip.hidden = false;
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = `${Math.min(rect.left, window.innerWidth - 330)}px`;
    tooltip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - tooltip.offsetHeight - 8)}px`;
  }

  function insert(text) {
    input.focus();
    const start = input.selectionStart, end = input.selectionEnd;
    input.setRangeText(text, start, end, "end");
    save(false);
  }

  function goTo(index, line = null) {
    const row = line === null ? null : overlay.children[line];
    const rowTop = row ? row.getBoundingClientRect().top -
      overlay.getBoundingClientRect().top + overlay.scrollTop : null;
    const previousScroll = input.scrollTop;
    input.focus({preventScroll: true});
    input.setSelectionRange(index, index);
    requestAnimationFrame(() => {
      if (rowTop !== null && input.scrollTop === previousScroll &&
          (rowTop < previousScroll || rowTop > previousScroll + input.clientHeight)) {
        input.scrollTop = Math.max(0, rowTop - input.clientHeight / 3);
      }
      overlay.scrollTop = input.scrollTop;
      overlay.scrollLeft = input.scrollLeft;
    });
  }

  function decorate(text) {
    const focused = document.activeElement === input;
    const start = focused ? input.selectionStart : null;
    const end = focused ? input.selectionEnd : null;
    const top = input.scrollTop, left = input.scrollLeft;
    const fragment = document.createDocumentFragment();
    const lines = text.split("\n");
    const subjectBindings = subjectPictureBindings(text);
    let lineOffset = 0;
    lines.forEach((line, lineIndex) => {
      const row = el("span", prefs.rich ?
        `gkh3s-line gkh3s-line-${classifyLine(line)}` : "gkh3s-line");
      if (flashRange && Date.now() < flashRange.until &&
          lineIndex >= flashRange.start && lineIndex < flashRange.end)
        row.classList.add("gkh3s-line-flash");
      if (!prefs.rich) row.append(line);
      else if (line) {
        let cursor = 0;
        for (const token of tokensInLine(line)) {
          if (token.start < cursor) continue;
          row.append(line.slice(cursor, token.start));
          if (token.kind === "time") {
            row.append(token.text);
            cursor = token.end;
            continue;
          }
          const subject = subjectBindings.get(token.text);
          const pictureToken = subject && subject.firstOffset !== lineOffset + token.start
            ? subject.pictureToken : null;
          const label = labels.find(item => item.token === (pictureToken || token.text));
          const special = token.text.startsWith("<|") || token.text === "<d>" || token.text === "</d>";
          const unresolved = token.kind === "reference" && !special &&
            !token.text.startsWith("<Subject") && connected && !label;
          const chip = el("span", `gkh3s-chip gkh3s-chip-${special ? "special" : token.kind}` +
            (unresolved ? " gkh3s-unresolved" : ""), token.text);
          if (label?.kind === "picture" && label.item.file) {
            chip.classList.add("gkh3s-chip-has-preview");
            const preview = el("img", "gkh3s-chip-preview");
            preview.src = viewURL(label.item.file);
            preview.alt = "";
            preview.contentEditable = "false";
            preview.loading = "lazy";
            preview.decoding = "async";
            preview.addEventListener("error", () => {
              const current = chip.textContent;
              chip.classList.remove("gkh3s-chip-has-preview");
              chip.textContent = current;
            }, {once: true});
            chip.replaceChildren(preview, el("span", "gkh3s-chip-preview-label", token.text));
          }
          if (token.kind === "technique" || token.kind === "reference") {
            chip.addEventListener("mouseenter", event => {
              const description = token.kind === "technique"
                ? GLOSSARY[token.text]?.[prefs.language === "ru" ? 0 : 1]
                : unresolved ? t().missingRef : (label?.item?.name || label?.item?.file || "");
              showTooltip(event, token.text, description, label);
            });
            chip.addEventListener("mouseleave", hideTooltip);
          }
          row.append(chip);
          cursor = token.end;
        }
        row.append(line.slice(cursor));
      }
      fragment.append(row);
      if (lineIndex < lines.length - 1) fragment.append(document.createTextNode("\n"));
      lineOffset += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
    });
    input.replaceChildren(...(text ? [fragment] : []));
    input.dataset.empty = String(!text);
    if (focused) input.setSelectionRange(start, end);
    input.scrollTop = top;
    input.scrollLeft = left;
  }

  function renderOutline(text) {
    outlineBox.replaceChildren();
    const rows = outline(text);
    rows.forEach((entry, entryIndex) => {
      const button = el("button", `gkh3s-outline-item gkh3s-outline-${entry.kind}`, entry.label);
      button.title = entry.label;
      button.addEventListener("click", () => {
        const lines = text.split("\n");
        const index = lines.slice(0, entry.line).reduce((n, line) => n + line.length + 1, 0);
        clearTimeout(flashTimer);
        flashRange = {...outlineSectionRange(rows, entryIndex, lines.length), until:Date.now() + 3000};
        [...input.children].forEach((line, lineIndex) =>
          line.classList.toggle("gkh3s-line-flash",
            lineIndex >= flashRange.start && lineIndex < flashRange.end));
        flashTimer = setTimeout(() => {
          flashRange = null;
          for (const line of input.children) line.classList.remove("gkh3s-line-flash");
        }, 3000);
        goTo(index, entry.line);
      });
      outlineBox.append(button);
    });
    if (!rows.length) outlineBox.append(el("div", "gkh3s-muted", "—"));
  }

  function renderReferences(text) {
    refsBox.replaceChildren();
    if (!connected) { refsBox.append(el("p", "gkh3s-muted", t().noRefs)); return; }
    const used = labels.filter(item => text.includes(item.token));
    if (!used.length) { refsBox.append(el("p", "gkh3s-muted", t().noUsed)); return; }
    for (const item of used) {
      const card = el("button", "gkh3s-ref-card");
      if (item.kind === "picture" && item.item.file) {
        const img = el("img"); img.src = viewURL(item.item.file); img.alt = item.token;
        img.loading = "lazy"; card.append(img);
      } else if (item.kind === "video" && item.item.file) {
        const video = el("video"); video.src = viewURL(item.item.file);
        video.muted = true; video.preload = "metadata"; card.append(video);
      } else card.append(el("span", "gkh3s-audio-icon", "♫"));
      const name = el("span", "gkh3s-ref-name");
      name.append(el("strong", "", item.token), el("small", "", item.item.name || item.item.file || ""));
      card.append(name);
      card.title = t().insert;
      card.addEventListener("click", () => insert(item.token));
      refsBox.append(card);
    }
  }

  function renderDiagnostics(text) {
    const result = diagnose(text, prefs.mode);
    const message = prefs.mode === "free" ? t().free :
      result.missing.length ? `${t().missingCount}: ${result.missing.join(", ")}` :
      result.outOfOrder ? t().order : t().ready;
    diagnostics.textContent = message;
    diagnostics.dataset.warning = String(Boolean(result.missing.length || result.outOfOrder));
    status.textContent = `${text.length.toLocaleString()} chars · ${prefs.mode.toUpperCase()}`;
    add.disabled = !result.missing.length;
  }

  function renderText() {
    raf = 0;
    const text = input.value;
    if (!composing) decorate(text);
    renderOutline(text); renderReferences(text); renderDiagnostics(text);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(renderText); }
  function updateHistoryButtons() {
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
  }
  function syncText() {
    promptWidget.value = input.value;
    node.graph?.change(); node.setDirtyCanvas(true, true);
    schedule();
  }
  function save(grouped = false) {
    history.push(input.value, grouped);
    updateHistoryButtons();
    syncText();
  }
  function travel(direction) {
    const text = direction === "undo" ? history.undo() : history.redo();
    if (text === null) return;
    const caret = Math.min(input.selectionStart, text.length);
    input.value = text;
    input.focus(); input.setSelectionRange(caret, caret);
    updateHistoryButtons(); syncText();
  }

  function renderControls() {
    const strings = t();
    mode.value = prefs.mode; language.value = prefs.language; style.value = prefs.style;
    root.dataset.style = prefs.style;
    root.dataset.rich = String(prefs.rich);
    root.style.setProperty("--studio-font-size", `${prefs.fontSize}px`);
    template.textContent = strings.template;
    template.disabled = prefs.mode === "free";
    dialogue.textContent = strings.dialogue;
    add.textContent = strings.missing;
    rich.textContent = strings.rich;
    rich.setAttribute("aria-pressed", String(prefs.rich));
    undoButton.title = strings.undo;
    undoButton.setAttribute("aria-label", strings.undo);
    redoButton.title = strings.redo;
    redoButton.setAttribute("aria-label", strings.redo);
    settingsButton.textContent = `⚙ ${strings.settings}`;
    languageText.textContent = strings.language;
    styleText.textContent = strings.style;
    outlineTitle.textContent = strings.outline;
    refsTitle.textContent = strings.used;
    section.replaceChildren(option("", strings.sections));
    const options = new Set([...(SECTIONS[prefs.mode] || []), ...Object.values(SECTIONS).flat(), ...CATEGORY_NAMES]);
    for (const name of options) section.append(option(name, name));
    reference.replaceChildren(option("", strings.references));
    for (const item of labels) reference.append(option(item.token, item.token));
    schedule();
  }

  function refreshMedia() {
    if (!root.isConnected) return;
    const state = mediaState(node);
    const signature = `${state.source?.id || "none"}:${JSON.stringify(state.items)}`;
    if (signature === mediaSignature) return;
    mediaSignature = signature;
    connected = Boolean(state.source);
    labels = referenceLabels(state.items);
    renderControls();
  }

  input.addEventListener("input", event => {
    save(["insertText", "deleteContentBackward", "deleteContentForward", "insertCompositionText"].includes(event.inputType));
  });
  input.addEventListener("beforeinput", event => {
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault();
      travel(event.inputType === "historyUndo" ? "undo" : "redo");
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      input.setRangeText("\n", input.selectionStart, input.selectionEnd);
      save(false);
    }
  });
  input.addEventListener("paste", event => {
    event.preventDefault();
    input.setRangeText(event.clipboardData?.getData("text/plain") || "",
      input.selectionStart, input.selectionEnd);
    save(false);
  });
  input.addEventListener("copy", event => {
    const start = input.selectionStart, end = input.selectionEnd;
    if (start === end) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", input.value.slice(start, end));
  });
  input.addEventListener("cut", event => {
    const start = input.selectionStart, end = input.selectionEnd;
    if (start === end) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", input.value.slice(start, end));
    input.setRangeText("", start, end, "start");
    save(false);
  });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; schedule(); });
  input.addEventListener("focus", hideTooltip);
  input.addEventListener("blur", () => {
    composing = false;
    schedule();
  });
  input.addEventListener("scroll", () => {
    hideTooltip();
  });
  mode.addEventListener("change", () => { prefs.mode = mode.value; renderControls(); node.graph?.change(); });
  template.addEventListener("click", () => {
    const next = templateFor(prefs.mode);
    if (input.value.trim() && !confirm(t().replace)) return;
    input.value = next; save(false); input.focus();
  });
  section.addEventListener("change", () => {
    if (!section.value) return;
    insert(`${input.value && !input.value.endsWith("\n") ? "\n\n" : ""}${section.value}:\n`);
    section.value = "";
  });
  reference.addEventListener("change", () => {
    if (reference.value) insert(reference.value);
    reference.value = "";
  });
  dialogue.addEventListener("click", () => insert("<d>[English] dialogue</d>"));
  add.addEventListener("click", () => { input.value = addMissing(input.value, prefs.mode); save(false); });
  rich.addEventListener("click", () => { prefs.rich = !prefs.rich; renderControls(); node.graph?.change(); });
  undoButton.addEventListener("click", () => travel("undo"));
  redoButton.addEventListener("click", () => travel("redo"));
  smaller.addEventListener("click", () => { prefs.fontSize = Math.max(11, prefs.fontSize - 1); renderControls(); node.graph?.change(); });
  larger.addEventListener("click", () => { prefs.fontSize = Math.min(24, prefs.fontSize + 1); renderControls(); node.graph?.change(); });
  settingsButton.addEventListener("click", () => { settings.hidden = !settings.hidden; });
  language.addEventListener("change", () => { prefs.language = language.value; hideTooltip(); renderControls(); node.graph?.change(); });
  style.addEventListener("change", () => { prefs.style = style.value; renderControls(); node.graph?.change(); });
  input.addEventListener("keydown", event => {
    if (!event.isComposing && (event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        travel(key === "y" || event.shiftKey ? "redo" : "undo");
        return;
      }
    }
    if (event.key === "Tab") { event.preventDefault(); insert("    "); }
  });

  const timer = setInterval(refreshMedia, 800);
  const nativeCompute = node.computeSize;
  node.computeSize = function (out) {
    const size = nativeCompute.call(this, out);
    return [Math.max(size[0], 700), Math.max(size[1], 560)];
  };
  const nativeResize = node.onResize;
  node.onResize = function (size) {
    size[0] = Math.max(700, size[0]); size[1] = Math.max(560, size[1]);
    return nativeResize?.apply(this, arguments);
  };

  function restore() {
    const restored = node.properties?.genkaiH3Studio || prefs;
    Object.assign(prefs, restored);
    node.properties.genkaiH3Studio = prefs;
    if (!MODES.some(([id]) => id === prefs.mode)) prefs.mode = "free";
    if (!["obsidian", "filmstrip", "signal", "screenplay"].includes(prefs.style)) prefs.style = "obsidian";
    if (!["ru", "en"].includes(prefs.language)) prefs.language = "ru";
    prefs.fontSize = Math.min(24, Math.max(11, Number(prefs.fontSize) || 14));
    input.value = String(promptWidget.value ?? "");
    history.reset(input.value); updateHistoryButtons();
    refreshMedia(); renderControls();
  }
  restore();
  return {restore, refreshMedia, dispose() {
    clearInterval(timer); clearTimeout(flashTimer); cancelAnimationFrame(raf);
    hideTooltip(); tooltip.remove();
  }};
}

app.registerExtension({
  name: "GENKAI.H3PromptStudio",
  async beforeRegisterNodeDef(nodeType, data) {
    if (data.name !== NAME) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      try { this.genkaiH3Studio = studio(this); }
      catch (error) { console.error("[GENKAI H3 Prompt Studio] UI setup failed:", error); }
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured?.apply(this, arguments);
      setTimeout(() => this.genkaiH3Studio?.restore(), 0);
      return result;
    };
    const connected = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = connected?.apply(this, arguments);
      setTimeout(() => this.genkaiH3Studio?.refreshMedia(), 0);
      return result;
    };
    const removed = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this.genkaiH3Studio?.dispose();
      return removed?.apply(this, arguments);
    };
  },
});
