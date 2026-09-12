const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const CLOCK = String.raw`\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d+)?`;
const UNIT = String.raw`(?:seconds?|secs?|s|сек(?:унд(?:а|ы|е|у)?)?|с|秒)`;
const VALUE = `(?:${CLOCK}|${NUMBER})`;
const RANGE = `${VALUE}\\s*(?:${UNIT}\\.?)?\\s*(?:-->|[-–—→~～]|to|through|and|до|至)\\s*${VALUE}\\s*(?:${UNIT}\\.?)?`;
const SINGLE = `(?:${CLOCK}|${NUMBER}\\s*${UNIT}\\.?)`;
const TIME = `(?:${RANGE}|${SINGLE})`;
const SHOT = String.raw`\[?(?:shot|scene|segment|beat|кадр|сцена)\s*#?\d+\]?`;
const GLOBAL = /^(?:(?:global|overall)\s+)?(?:camera(?:\s+(?:movement|motion|settings|direction|work))?|cinematography|lighting|visual[ _]style|style|aesthetics|look|colou?r(?:[ _]grading|[ _]palette)?|effects|vfx|sfx|audio|sound(?:[ _]design|scape)?|overall_soundscape|non_diegetic_music|music|negative(?:[ _]prompt)?|constraints|rules|requirements|notes|technical(?:[ _]settings|[ _]details)?|settings|references?|reference[ _](?:images|alignment)|character(?:[ _]description|[ _]consistency)?|environment|aspect[ _]ratio|resolution|duration|fps|камера|свет|стиль|эффекты|звук|музыка)\s*(?::|$)/iu;
const NARRATIVE = /(?:integrated_multimodal_description|(?:action[ _])?timeline|shot[ _]list|sequence|storyboard|timed[ _](?:prompt|actions))\s*:/iu;

export function seconds(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : NaN;
    const text = String(value ?? "").trim().replace(/,/g, ".").replace(new RegExp(`\\s*${UNIT}\\.?$`, "iu"), "");
    if (!/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(text)) return NaN;
    const parts = text.split(":").map(Number);
    if (parts.slice(1).some(n => n >= 60)) return NaN;
    return parts.reduce((sum, n) => sum * 60 + n, 0);
}

export function formatTime(value) {
    const ms = Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1000);
    const whole = Math.floor(ms / 1000), fraction = ms % 1000;
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${fraction ? "." + String(fraction).padStart(3, "0").replace(/0+$/, "") : ""}`;
}

function interval(text) {
    const tokens = String(text).match(new RegExp(VALUE, "gu")) ?? [];
    return {start: seconds(tokens[0]), end: tokens.length > 1 ? seconds(tokens[1]) : NaN};
}

// Locate objects without reformatting JSON: offsets refer to the original prompt.
function jsonSegments(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { if (error instanceof SyntaxError) return null; throw error; }
    if (!parsed || typeof parsed !== "object") return null;
    const stack = [], objects = [];
    let quoted = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === "{") stack.push(i);
        else if (c === "}") {
            const from = stack.pop(), to = i + 1;
            const object = JSON.parse(text.slice(from, to));
            const rawTime = object.start ?? object.start_time ?? object.time ?? object.timestamp ?? object.time_range;
            const timing = typeof rawTime === "string" ? interval(rawTime) : {start: seconds(rawTime), end: NaN};
            timing.end = seconds(object.end ?? object.end_time) || timing.end;
            if (!Number.isFinite(timing.end) && Number.isFinite(seconds(object.duration))) timing.end = timing.start + seconds(object.duration);
            if (Number.isFinite(timing.start)) objects.push({from, to, ...timing});
        }
    }
    return objects.sort((a, b) => a.from - b.from).filter((item, i, all) => !all.some((parent, j) => j !== i && parent.from < item.from && parent.to > item.to));
}

function finish(original, raw, duration) {
    const starts = [...new Set(raw.map(s => s.start))].sort((a, b) => a - b);
    const segments = raw.map((s, id) => ({...s, id,
        explicitEnd: s.end,
        end: Math.min(Number.isFinite(s.end) ? s.end : Infinity, starts.find(start => start > s.start) ?? Infinity, duration > 0 ? duration : Infinity),
    })).filter(s => s.end > s.start && s.to > s.from);
    const parts = [];
    let cursor = 0;
    for (const segment of [...segments].sort((a, b) => a.from - b.from)) {
        if (segment.from > cursor) parts.push({kind: "global", text: original.slice(cursor, segment.from)});
        parts.push({kind: "timed", segmentId: segment.id, text: original.slice(segment.from, segment.to)});
        cursor = segment.to;
    }
    if (cursor < original.length) parts.push({kind: "global", text: original.slice(cursor)});
    return {original, segments, parts, warning: segments.length ? "" : "No explicit timing found. The original prompt is shown below."};
}

export function parseTimeline(input, duration = 0) {
    const original = String(input ?? "");
    if (!original.trim()) return {original, segments: [], parts: [], warning: "Connect a timed prompt to begin."};
    const json = jsonSegments(original);
    if (json) return finish(original, json, duration);
    const events = [];
    const lines = [...original.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter(m => m[0]);
    const header = new RegExp(`^(?:\\s*(?:[-*•]|\\d+[.)]|\\|)\\s+)?\\s*[#*\\[\\s]*(?:${SHOT}[^\\r\\n\\d]{0,50}?)?[(*\\[\\s]*(?<time>${TIME})(?=\\s|[)\\]*:|.,-]|$)`, "iu");
    const inline = new RegExp(`(?:${SHOT}\\s*[:(—–-]?\\s*(?:at\\s+)?(?<shotTime>${TIME}|${NUMBER}(?=\\s*\\)))|\\b(?:At|From|Between)\\s+(?<time>${TIME}))`, "giu");
    const shotOne = new RegExp(`${SHOT}`, "iu");
    let inGlobal = false, lastIndent = 0, narrativeStart = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i][0], pos = lines[i].index;
        const indent = /^\s*/.exec(line)[0].replace(/[\r\n]/g, "").length;
        const clean = line.trim().replace(/^[#*\s]+|[*\s]+$/g, "");
        const narrative = NARRATIVE.exec(line);
        if (narrative) {
            const from = pos + narrative.index + narrative[0].length;
            events.push({kind: "global", pos});
            narrativeStart = from; inGlobal = false;
        }
        const match = !narrative && header.exec(line);
        if (match) {
            events.push({kind: "time", pos, indent, ...interval(match.groups.time)});
            lastIndent = indent; inGlobal = false;
            continue;
        }
        const isHeading = GLOBAL.test(clean.replace(/\*\*/g, ""));
        const blankBefore = i === 0 || !lines[i - 1][0].trim();
        const strongGlobal = /^(?:overall_|non_diegetic_|global\b|negative\b)/i.test(clean);
        const reference = /^(?:How the reference pictures align|For the target video,)/i.test(clean);
        if (reference || (isHeading && indent <= lastIndent && (blankBefore || strongGlobal || inGlobal || !events.some(e => e.kind === "time")))) {
            events.push({kind: "global", pos}); inGlobal = true;
            continue;
        }
        if (inGlobal) continue;
        const scanFrom = narrative ? narrative.index + narrative[0].length : 0;
        const text = line.slice(scanFrom);
        const firstShot = shotOne.exec(text);
        if (firstShot && /(?:shot|scene|segment|beat|кадр|сцена)\s*#?1\b/i.test(firstShot[0]) && !events.some(e => e.kind === "time")) {
            events.push({kind: "time", pos: pos + scanFrom + firstShot.index, indent, start: 0, end: NaN});
        }
        for (const match of text.matchAll(inline)) {
            const before = text.slice(0, match.index);
            if (!match.groups.shotTime && /^[a-z]/.test(match[0]) && before.trim() && !/[.!?;]\s*$/.test(before)) continue;
            events.push({kind: "time", pos: pos + scanFrom + match.index, indent, ...interval(match.groups.shotTime ?? match.groups.time)});
        }
    }
    events.sort((a, b) => a.pos - b.pos || (a.kind === "global" ? -1 : 1));
    // Keep increasing action times. A backward time reference does not start a new action.
    const accepted = [];
    let latest = -1;
    for (const event of events) {
        if (event.kind === "global") accepted.push(event);
        else if (event.start > latest && (!Number.isFinite(event.end) || event.end > event.start)) {
            accepted.push(event); latest = event.start;
        }
    }
    const first = accepted.find(e => e.kind === "time");
    if (first?.start > 0) {
        const previousGlobal = accepted.filter(e => e.kind === "global" && e.pos < first.pos).at(-1);
        const from = narrativeStart !== null && narrativeStart < first.pos ? narrativeStart : previousGlobal ? null : 0;
        if (from !== null && original.slice(from, first.pos).trim()) accepted.push({kind: "time", pos: from, start: 0, end: first.start});
    }
    accepted.sort((a, b) => a.pos - b.pos);
    const raw = accepted.flatMap((event, i) => event.kind === "time" ? [{from: event.pos, to: accepted[i + 1]?.pos ?? original.length, start: event.start, end: event.end}] : []);
    return finish(original, raw, duration);
}

export function activeIndex(segments, currentTime) {
    return segments.findIndex(s => currentTime >= s.start && currentTime < s.end);
}
