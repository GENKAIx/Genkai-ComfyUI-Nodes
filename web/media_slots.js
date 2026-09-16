export const SLOT_COUNT = 15;
export function preferredSlots(kind) {
  const start = kind === "picture" ? 0 : kind === "video" ? 9 : 12;
  const count = kind === "picture" ? 9 : 3;
  return [...Array.from({length: count}, (_, i) => start + i), ...Array.from({length: SLOT_COUNT}, (_, i) => i).filter(i => i < start || i >= start + count)];
}
export function arrangeSlots(items) {
  const occupied = new Set();
  const pending = [];
  for (const item of items) {
    if (Number.isInteger(item.genkai_slot) && item.genkai_slot >= 0 && item.genkai_slot < SLOT_COUNT && !occupied.has(item.genkai_slot)) occupied.add(item.genkai_slot);
    else pending.push(item);
  }
  for (const item of pending) {
    const slot = preferredSlots(item.kind).find(i => !occupied.has(i));
    if (slot !== undefined) {item.genkai_slot = slot; occupied.add(slot);}
  }
  items.sort((a, b) => a.genkai_slot - b.genkai_slot);
  return items;
}
export function exchangeSlots(items, uid, target) {
  if (!Number.isInteger(target) || target < 0 || target >= SLOT_COUNT) return false;
  arrangeSlots(items);
  const source = items.find(item => item.uid === uid);
  if (!source || source.genkai_slot === target) return false;
  const other = items.find(item => item.genkai_slot === target);
  if (other) other.genkai_slot = source.genkai_slot;
  source.genkai_slot = target;
  arrangeSlots(items);
  return true;
}
