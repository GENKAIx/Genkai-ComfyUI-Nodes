import assert from "node:assert/strict";
import {test} from "node:test";
import {MAX_PRESETS, columnsForWidth, normalizeConfig, parseValue, starter} from "../web/float_presets_core.mjs";

test("tiles share each row and grow with available width", () => {
  assert.equal(columnsForWidth(5, 170), 2);
  assert.equal(columnsForWidth(5, 400), 4);
  assert.equal(columnsForWidth(5, 900), 5);
});

test("generic starter selects a plain number", () => {
  const initial = starter();
  assert.deepEqual(initial.presets.map(item => item.value), [5, 10, 15]);
  assert.equal(initial.presets.find(item => item.id === initial.selectedId).value, 5);
});

test("workflow preset state restores its selected float", () => {
  const saved = {
    title: "Length", unit: "s", selectedId: "ten",
    presets: [{id: "five", value: 5}, {id: "ten", label: "Long", value: 10}],
  };
  const restored = normalizeConfig(saved, 10);
  assert.equal(restored.selectedId, "ten");
  assert.equal(restored.presets[1].value, 10);
  assert.deepEqual(restored.presets[1], {id: "ten", value: 10});
  assert.equal("unit" in restored, false);
});

test("invalid values cannot reach the FLOAT widget", () => {
  assert.equal(parseValue("0,75"), 0.75);
  assert.equal(parseValue(""), null);
  assert.equal(parseValue("Infinity"), null);
  assert.equal(parseValue("1000000001"), null);
  const restored = normalizeConfig({presets:[{id:"bad",value:"NaN"},{id:"good",value:2}]});
  assert.deepEqual(restored.presets.map(item => item.id), ["good"]);
  assert.ok(MAX_PRESETS >= 12);
});
