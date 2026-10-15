export const MAX_PRESETS = 24;

export function columnsForWidth(count, width) {
  return Math.min(Math.max(1, count), Math.max(1, Math.floor((width + 8) / 88)));
}

export function parseValue(raw) {
  if (typeof raw === "string" && !raw.trim()) return null;
  const value = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) return null;
  return Number(value.toFixed(6));
}

export function starter() {
  return {
    presets: [5, 10, 15].map((value, index) => ({id: `preset-${index + 1}`, value})),
    selectedId: "preset-1",
  };
}

export function normalizeConfig(raw, selectedValue) {
  const fallback = starter();
  if (!raw || typeof raw !== "object") return fallback;
  const ids = new Set();
  const presets = [];
  for (const item of Array.isArray(raw.presets) ? raw.presets.slice(0, MAX_PRESETS) : []) {
    const value = parseValue(item?.value);
    if (value === null) continue;
    let id = String(item?.id || `preset-${presets.length + 1}`).slice(0, 64);
    while (ids.has(id)) id += "-copy";
    ids.add(id);
    presets.push({id, value});
  }
  if (!presets.length) return fallback;
  const selected = presets.find(item => item.id === raw.selectedId) ||
    presets.find(item => item.value === parseValue(selectedValue)) || presets[0];
  return {presets, selectedId: selected.id};
}

export function formatValue(value) {
  return String(value);
}
