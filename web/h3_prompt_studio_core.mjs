/** Text classification only. All decorations leave the stored prompt intact. */
export const MODES = [
  ["free", "Free"], ["t2va", "T2VA"], ["i2va", "I2VA"],
  ["fl2va", "FL2VA"], ["l2va", "L2VA"], ["ref2va", "Ref2VA"],
];

export const SECTIONS = {
  free: [],
  t2va: ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"],
  i2va: ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"],
  fl2va: ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"],
  l2va: ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"],
  ref2va: ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"],
};

export const GLOSSARY = {
  "HARD CUT": ["Мгновенная смена одного кадра другим без перехода.", "An immediate switch between shots without a transition."],
  "MATCH CUT": ["Склейка двух кадров по похожей форме, движению или композиции.", "A cut connecting shots through similar shape, motion, or composition."],
  "SMASH CUT": ["Резкая склейка с сильным контрастом звука или изображения.", "An abrupt cut with a strong visual or audio contrast."],
  "J-CUT": ["Звук следующего кадра начинается до смены изображения.", "Audio from the next shot begins before its image appears."],
  "L-CUT": ["Звук предыдущего кадра продолжается после смены изображения.", "Audio from the previous shot continues after the image changes."],
  "CROSSFADE": ["Плавное наложение конца одного кадра на начало другого.", "One shot gradually dissolves into the next."],
  "WHIP PAN": ["Очень быстрый поворот камеры с заметным смазыванием движения.", "A very fast camera pan with strong motion blur."],
  "DOLLY IN": ["Камера физически движется вперёд к объекту.", "The camera physically moves forward toward the subject."],
  "PUSH IN": ["Камера приближается к объекту для усиления акцента.", "The camera moves closer to emphasize the subject."],
  "RACK FOCUS": ["Перевод резкости с одного объекта на другой внутри кадра.", "A focus shift between subjects within a shot."],
  "TRACKING SHOT": ["Камера перемещается вместе с объектом, следуя за ним.", "The camera moves with and follows the subject."],
  "HANDHELD": ["Съёмка с рук с естественным движением камеры.", "Camera movement that feels naturally handheld."],
  "OVER-THE-SHOULDER": ["Ракурс из-за плеча персонажа на другого персонажа или действие.", "A shot framed from behind one character's shoulder."],
  "FADE IN": ["Плавное появление изображения из чёрного.", "The image gradually appears from black."],
  "FADE OUT": ["Плавное исчезновение изображения в чёрный.", "The image gradually disappears into black."],
  "RULE OF THIRDS": ["Важные объекты расположены вдоль линий или на пересечениях сетки из третей кадра.", "Key subjects align with the lines or intersections of a three-by-three frame grid."],
  "CENTERED COMPOSITION": ["Главный объект расположен по центру кадра.", "The main subject is placed at the center of the frame."],
  "SYMMETRICAL COMPOSITION": ["Элементы кадра уравновешены относительно центральной оси.", "The frame is balanced around a central axis."],
  "LEADING LINES": ["Линии в кадре направляют взгляд зрителя к главному объекту.", "Lines in the frame guide the viewer's eye toward the subject."],
  "NEGATIVE SPACE": ["Свободное пространство вокруг объекта подчёркивает его и настроение кадра.", "Open space around a subject adds emphasis or atmosphere."],
  "DUTCH ANGLE": ["Камера наклонена относительно горизонта, создавая ощущение неустойчивости.", "A tilted camera horizon creates a sense of imbalance."],
  "LOW ANGLE": ["Камера смотрит на объект снизу вверх.", "The camera looks upward at the subject."],
  "HIGH ANGLE": ["Камера смотрит на объект сверху вниз.", "The camera looks downward at the subject."],
  "WIDE SHOT": ["Общий план показывает персонажа и значительную часть окружения.", "A wide view shows the subject in its surrounding space."],
  "CLOSE-UP": ["Крупный план выделяет лицо или отдельную деталь.", "A close view emphasizes a face or small detail."],
  "ESTABLISHING SHOT": ["Вводный общий план обозначает место действия и обстановку.", "An opening wide shot establishes the setting."],
};

export const CATEGORY_NAMES = [
  "AUDIO", "REFERENCE USAGE", "VISUAL", "VIDEO", "CAMERA", "LIGHTING",
  "DIALOGUE", "SOUND", "MUSIC", "TIMELINE", "SCENE GOAL", "STYLE",
  "ENVIRONMENT", "CHARACTER", "MOTION", "ACTION", "COMPOSITION",
];

const starters = {
  free: "",
  t2va: "",
  i2va: "For the target video, at 0.00 seconds into the target video, use <Picture 1> as the opening-frame reference.\n\n",
  fl2va: "How the reference pictures align with the target video: <Picture 1> is the first frame; <Picture 2> is the last frame.\n\n",
  l2va: "How the reference pictures align with the target video: <Picture 1> is the last frame.\n\n",
  ref2va: "",
};

export function templateFor(mode) {
  return (starters[mode] ?? "") + (SECTIONS[mode] ?? []).map(s => `${s}:\n`).join("\n");
}

export function diagnose(text, mode) {
  const expected = SECTIONS[mode] ?? [];
  const found = [...String(text).matchAll(/^([a-z][a-z0-9_]*):/gm)].map(m => m[1]);
  const missing = expected.filter(name => !found.includes(name));
  const existing = found.filter(name => expected.includes(name));
  const outOfOrder = existing.some((name, i) => i && expected.indexOf(name) < expected.indexOf(existing[i - 1]));
  return {missing, outOfOrder};
}

export function addMissing(text, mode) {
  const missing = diagnose(text, mode).missing;
  return String(text).trimEnd() + (text.trim() && missing.length ? "\n\n" : "") +
    missing.map(name => `${name}:\n`).join("\n");
}

export function referenceLabels(items) {
  const enabled = (Array.isArray(items) ? items : []).filter(x => x && x.enabled !== false);
  const pictures = enabled.filter(x => x.kind === "picture").slice(0, 9);
  const videos = enabled.filter(x => x.kind === "video").slice(0, 3);
  const standalone = enabled.filter(x => x.kind === "audio" ||
    (x.kind === "video" && x.has_audio && x.audio_mode === "standalone")).slice(0, 3);
  const result = [];
  pictures.forEach((item, i) => result.push({token: `<Picture ${i + 1}>`, kind: "picture", item}));
  videos.forEach((item, i) => result.push({token: `<Video ${i + 1}>`, kind: "video", item}));
  let audio = 0;
  videos.forEach(item => {
    if (item.has_audio && (item.audio_mode || "paired") === "paired")
      result.push({token: `<Audio ${++audio}>`, kind: "audio", item});
  });
  standalone.forEach(item => result.push({token: `<Audio ${++audio}>`, kind: "audio", item}));
  return result;
}

export function subjectPictureBindings(text) {
  const source = String(text);
  const bindings = new Map();
  for (const match of source.matchAll(/<Subject\s+\d+>/g)) {
    if (bindings.has(match[0])) continue;
    const following = source.slice(match.index + match[0].length);
    const paragraphEnd = following.search(/\n\s*\n/);
    const nextSubject = following.search(/<Subject\s+\d+>/);
    const limits = [paragraphEnd, nextSubject].filter(index => index >= 0);
    const description = following.slice(0, limits.length ? Math.min(...limits) : undefined);
    const pictureToken = description.match(/<Picture\s+\d+>/)?.[0] || null;
    bindings.set(match[0], {pictureToken, firstOffset: match.index});
  }
  return bindings;
}

const tokenPattern = /<(?:Picture|Video|Audio|Subject)\s+\d+>|<\|(?:cutoff|lyrics_start|lyrics_end|caption_start|caption_end)\|>|<\/?d>|\b(?:HARD CUT|MATCH CUT|SMASH CUT|J-CUT|L-CUT|CROSSFADE|WHIP PAN|DOLLY IN|PUSH IN|RACK FOCUS|TRACKING SHOT|HANDHELD|OVER-THE-SHOULDER|FADE IN|FADE OUT|RULE OF THIRDS|CENTERED COMPOSITION|SYMMETRICAL COMPOSITION|LEADING LINES|NEGATIVE SPACE|DUTCH ANGLE|LOW ANGLE|HIGH ANGLE|WIDE SHOT|CLOSE-UP|ESTABLISHING SHOT)\b|\b(?:SHOT|SCENE)\s+\d+\b|\b(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?|\d+(?:\.\d+)?\s*s(?:ec(?:onds?)?)?)\b/g;

export function classifyLine(line) {
  const trimmed = line.trim();
  if (/^[a-z][a-z0-9_]*:\s*$/.test(trimmed)) return "section";
  if (CATEGORY_NAMES.some(x => trimmed === x || trimmed.startsWith(`${x}:`) || trimmed.startsWith(`${x} —`))) return "category";
  if (/^(?:\[?(?:SHOT|SCENE)\s+\d+\b|At\s+\d{1,2}:\d{2}\b)/i.test(trimmed) || /^\[?\d{1,2}:\d{2}(?:\.\d+)?\s*[-–—]\s*\d{1,2}:\d{2}/.test(trimmed)) return "timing";
  return "text";
}

export function tokensInLine(line) {
  return [...String(line).matchAll(tokenPattern)].map(m => ({text: m[0], start: m.index, end: m.index + m[0].length,
    kind: m[0].startsWith("<") ? "reference" : GLOSSARY[m[0]] ? "technique" : "time"}));
}

export function outline(text) {
  const result = [], lines = String(text).split("\n");
  lines.forEach((line, index) => {
    const kind = classifyLine(line);
    if (kind !== "text") result.push({kind, line: index, label: line.trim()});
  });
  return result;
}

export function outlineSectionRange(entries, selectedIndex, lineCount) {
  const selected = entries[selectedIndex];
  if (!selected) return null;
  let end = lineCount;
  for (const entry of entries.slice(selectedIndex + 1)) {
    if (selected.kind === "timing" || entry.kind !== "timing") {
      end = entry.line;
      break;
    }
  }
  return {start: selected.line, end};
}

export function createPromptHistory(initial = "", limit = 100) {
  let entries = [String(initial)];
  let cursor = 0;
  let lastAt = 0;
  let lastGrouped = false;
  return {
    reset(text) {
      entries = [String(text)]; cursor = 0; lastAt = 0; lastGrouped = false;
    },
    push(text, grouped = false, now = Date.now()) {
      text = String(text);
      if (text === entries[cursor]) return false;
      entries = entries.slice(0, cursor + 1);
      if (grouped && lastGrouped && cursor > 0 && now - lastAt < 700) {
        entries[cursor] = text;
      } else {
        entries.push(text); cursor += 1;
        if (entries.length > limit) { entries.shift(); cursor -= 1; }
      }
      lastAt = now; lastGrouped = grouped;
      return true;
    },
    undo() {
      if (!cursor) return null;
      lastGrouped = false;
      return entries[--cursor];
    },
    redo() {
      if (cursor >= entries.length - 1) return null;
      lastGrouped = false;
      return entries[++cursor];
    },
    get canUndo() { return cursor > 0; },
    get canRedo() { return cursor < entries.length - 1; },
  };
}
