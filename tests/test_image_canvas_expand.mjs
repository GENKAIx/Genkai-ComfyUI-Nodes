import assert from "node:assert/strict";
import {test} from "node:test";
import {
  dragMargins, expandedSize, normalizeMargins, parseHexColor,
} from "../web/image_canvas_expand_core.mjs";

test("expanded dimensions include all four margins", () => {
  const margins = normalizeMargins({left: 40, right: 60, top: 20, bottom: 30});
  assert.deepEqual(expandedSize(512, 768, margins), {width: 612, height: 818});
});

test("dragging inward crops while dragging outward expands", () => {
  const start = {left: 20, right: 10, top: 30, bottom: 0};
  assert.deepEqual(dragMargins(start, "top-left", -40, -20, 2, 512, 768),
    {left: 40, right: 10, top: 40, bottom: 0});
  assert.equal(dragMargins(start, "left", 100, 0, 2, 512, 768).left, -30);
  assert.deepEqual(expandedSize(512, 768, {left: -30, right: 10, top: 0, bottom: 0}),
    {width: 492, height: 768});
  assert.equal(dragMargins({left: 0, right: 0, top: 0, bottom: 0},
    "left", 1000, 0, 1, 512, 768).left, -511);
});

test("custom colors accept short and long hex, rejecting other text", () => {
  assert.equal(parseHexColor("#f8a"), "#FF88AA");
  assert.equal(parseHexColor("4a5c6d"), "#4A5C6D");
  assert.equal(parseHexColor("red"), null);
});
