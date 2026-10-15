export const MAX_MARGIN = 8192;

export function clampMargin(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-MAX_MARGIN, Math.min(MAX_MARGIN, Math.round(number)));
}

export function normalizeMargins(raw = {}) {
  return {
    left: clampMargin(raw.left),
    right: clampMargin(raw.right),
    top: clampMargin(raw.top),
    bottom: clampMargin(raw.bottom),
  };
}

export function expandedSize(width, height, margins) {
  return {
    width: width + margins.left + margins.right,
    height: height + margins.top + margins.bottom,
  };
}

export function dragMargins(start, handle, dx, dy, scale, width, height) {
  const next = {...normalizeMargins(start)};
  if (!Number.isFinite(scale) || scale <= 0) return next;
  if (handle.includes("left")) next.left = clampMargin(start.left - dx / scale);
  if (handle.includes("right")) next.right = clampMargin(start.right + dx / scale);
  if (handle.includes("top")) next.top = clampMargin(start.top - dy / scale);
  if (handle.includes("bottom")) next.bottom = clampMargin(start.bottom + dy / scale);
  if (Number.isFinite(width) && width > 0) {
    if (handle.includes("left")) next.left = Math.max(next.left, 1 - width, 1 - width - next.right);
    if (handle.includes("right")) next.right = Math.max(next.right, 1 - width, 1 - width - next.left);
  }
  if (Number.isFinite(height) && height > 0) {
    if (handle.includes("top")) next.top = Math.max(next.top, 1 - height, 1 - height - next.bottom);
    if (handle.includes("bottom")) next.bottom = Math.max(next.bottom, 1 - height, 1 - height - next.top);
  }
  return next;
}

export function parseHexColor(raw) {
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(String(raw).trim());
  if (!match) return null;
  const digits = match[1].length === 3
    ? [...match[1]].map(letter => letter + letter).join("")
    : match[1];
  return `#${digits.toUpperCase()}`;
}
