import assert from "node:assert/strict";
import {test} from "node:test";
import {
  addMissing, classifyLine, createPromptHistory, diagnose, outline, outlineSectionRange, referenceLabels,
  subjectPictureBindings,
  templateFor, tokensInLine,
} from "../web/h3_prompt_studio_core.mjs";

test("visual classification preserves prompt text and finds sections, times and film terms", () => {
  const text = "AUDIO:\nSHOT 1 — 0:00–0:02\nHARD CUT to <Picture 1>.";
  assert.equal(classifyLine("AUDIO:"), "category");
  assert.equal(classifyLine("At 00:03.000, cut to a wide shot."), "timing");
  assert.equal(classifyLine("SHOT 1 — 0:00–0:02"), "timing");
  assert.equal(classifyLine("[Shot 1]: 0:00–0:02"), "timing");
  assert.equal(classifyLine("overall_soundscape:"), "section");
  assert.deepEqual(outline(text).map(entry => entry.kind), ["category", "timing"]);
  assert.deepEqual(tokensInLine(text.split("\n")[2]).map(token => token.kind), ["technique", "reference"]);
  assert.equal(tokensInLine("SHOT 2 — 1.9–3.3 s")[0].text, "SHOT 2");
  assert.deepEqual(tokensInLine("Use LEADING LINES and a HARD CUT.").map(token => token.kind),
    ["technique", "technique"]);
});

test("navigation sections include their body and timed shots stop at the next shot", () => {
  const lines = ["REFERENCE USAGE", "image", "SCENE GOAL", "goal", "TIMELINE",
    "[Shot 1] — 0–3 s", "action one", "[Shot 2] — 3–6 s", "action two", "AUDIO", "sound"];
  const entries = outline(lines.join("\n"));
  assert.deepEqual(outlineSectionRange(entries, 0, lines.length), {start: 0, end: 2});
  assert.deepEqual(outlineSectionRange(entries, 2, lines.length), {start: 4, end: 9});
  assert.deepEqual(outlineSectionRange(entries, 3, lines.length), {start: 5, end: 7});
  assert.deepEqual(outlineSectionRange(entries, 5, lines.length), {start: 9, end: 11});
});

test("section assistance only appends missing headings", () => {
  const text = "integrated_multimodal_description:\nA figure walks.\n";
  const updated = addMissing(text, "t2va");
  assert.match(updated, /overall_soundscape:/);
  assert.match(updated, /non_diegetic_music:/);
  assert.equal(updated.match(/integrated_multimodal_description:/g).length, 1);
  assert.deepEqual(diagnose(updated, "t2va"), {missing: [], outOfOrder: false});
  assert.deepEqual(diagnose(templateFor("ref2va"), "ref2va"), {missing: [], outOfOrder: false});
});

test("reference ordinals follow enabled media and paired audio order", () => {
  const items = [
    {kind: "picture", file: "a.png"},
    {kind: "picture", file: "off.png", enabled: false},
    {kind: "video", file: "v.mp4", has_audio: true, audio_mode: "paired"},
    {kind: "audio", file: "standalone.wav"},
  ];
  assert.deepEqual(referenceLabels(items).map(item => item.token),
    ["<Picture 1>", "<Video 1>", "<Audio 1>", "<Audio 2>"]);
});

test("subjects use the first picture in their own definition paragraph", () => {
  const text = "REFERENCE USAGE\n<Subject 1> comes from <Picture 1> and <Picture 4>.\n\n" +
    "<Subject 2> comes from <Picture 2>. <Subject 1> follows.\n\n" +
    "<Subject 4> uses the look from <Picture 2>.\n\n" +
    "SCENE GOAL\n<Subject 1> looks at <Subject 2>.";
  const bindings = subjectPictureBindings(text);
  assert.equal(bindings.get("<Subject 1>").pictureToken, "<Picture 1>");
  assert.equal(bindings.get("<Subject 2>").pictureToken, "<Picture 2>");
  assert.equal(bindings.get("<Subject 4>").pictureToken, "<Picture 2>");
  assert.equal(bindings.get("<Subject 1>").firstOffset, text.indexOf("<Subject 1>"));
});

test("undo and redo keep ordinary typing together and discrete insertions separate", () => {
  const history = createPromptHistory("before");
  history.push("before a", true, 1000);
  history.push("before ab", true, 1100);
  history.push("before ab <Picture 1>", false, 1200);
  assert.equal(history.undo(), "before ab");
  assert.equal(history.undo(), "before");
  assert.equal(history.redo(), "before ab");
  history.push("replacement", false, 1300);
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), "before ab");
});
