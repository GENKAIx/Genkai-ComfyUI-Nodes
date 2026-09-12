import {parseTimeline, activeIndex, formatTime} from "./timeline.js";
import {createWaveform} from "./waveform.js";

const stylesheet = new URL("./viewer.css", import.meta.url).href;
if (!document.querySelector('link[data-genkai-viewer]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = stylesheet; link.dataset.genkaiViewer = "";
    document.head.append(link);
}
function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
}

export function createViewer({resolveVideo, resolveWaveform, preferences = {}, onPreferences = () => {}, enablePromptStyles = false}) {
    const root = element("div", "gk-video-reader"); root.tabIndex = 0; root.lang = "en";
    const controller = new AbortController();
    const on = (target, event, handler) => target.addEventListener(event, handler, {signal: controller.signal});
    let prompt = "", segments = [], fragments = [], buttons = [], active = -2, disposed = false, frame = 0;
    const left = element("section", "gk-left");
    const video = element("video"); video.controls = true; video.preload = "metadata"; video.playsInline = true;
    const stage = element("div", "gk-stage"); stage.append(video);
    const status = element("div", "gk-status", "Connect a video and run the node.");
    const timeline = element("div", "gk-timeline");
    const track = element("div", "gk-track");
    const progress = element("div", "gk-progress"); track.append(progress);
    const seek = element("input", "gk-seek");
    seek.type = "range"; seek.min = "0"; seek.max = "1"; seek.step = "0.001"; seek.value = "0";
    seek.setAttribute("aria-label", "Video position"); seek.disabled = true;
    const ruler = element("div", "gk-ruler");
    const clock = element("div", "gk-clock", "0:00 / 0:00");
    timeline.append(track, seek, ruler);
    left.append(element("div", "gk-label", "VIDEO"), stage, status, timeline, clock);
    const waveform = resolveWaveform ? createWaveform({resolveWaveform, jump}) : null;
    if (waveform) timeline.after(waveform.element);
    const right = element("section", "gk-right");
    const heading = element("div", "gk-prompt-header");
    const autoLabel = element("label", "gk-auto");
    const auto = element("input"); auto.type = "checkbox"; auto.checked = preferences.autoScroll !== false;
    autoLabel.append(auto, document.createTextNode(" Auto-scroll"));
    heading.append(element("span", "gk-label", "PROMPT"), autoLabel);
    const styles = [
        ["spotlight", "Spotlight · Serif"],
        ["cards", "Cards · Sans"],
        ["script", "Script · Mono"],
        ["classic", "Classic · Inline"],
    ];
    let styleSelect;
    if (enablePromptStyles) {
        const controls = element("div", "gk-prompt-controls");
        const styleLabel = element("label", "gk-style-label");
        styleLabel.append(document.createTextNode("Style"));
        styleSelect = element("select", "gk-style-select");
        styleSelect.setAttribute("aria-label", "Prompt style");
        for (const [value, label] of styles) {
            const option = element("option", "", label); option.value = value; styleSelect.append(option);
        }
        styleLabel.append(styleSelect); controls.append(styleLabel, autoLabel); heading.append(controls);
    }
    const legend = element("div", "gk-legend");
    legend.append(element("span", "gk-timed-key", "Timed action"), element("span", "gk-global-key", "General direction"));
    const warning = element("div", "gk-warning"); warning.hidden = true;
    const panel = element("div", "gk-prompt");
    const prose = element("div", "gk-prose"); panel.append(prose);
    right.append(heading, legend, warning, panel);
    root.append(left, right);

    function savePreferences() {
        preferences = {...preferences, autoScroll: auto.checked};
        if (enablePromptStyles) preferences.promptStyle = styleSelect.value;
        onPreferences(preferences);
    }
    function applyStyle(value) {
        if (!enablePromptStyles) return;
        const position = panel.scrollTop / Math.max(1, panel.scrollHeight - panel.clientHeight);
        const style = styles.some(([id]) => id === value) ? value : "spotlight";
        styleSelect.value = style; root.dataset.promptStyle = style;
        // Preserve the reading position when auto-scroll is off.
        if (auto.checked) scrollActive(false);
        else panel.scrollTop = position * Math.max(0, panel.scrollHeight - panel.clientHeight);
    }

    function scrollActive(smooth) {
        if (!auto.checked) return;
        const item = fragments.find(f => f.segmentId === segments[active]?.id)?.element;
        if (!item) return;
        // An inline fragment may span multiple lines. Scroll to its first line.
        const rect = item.getClientRects()[0];
        if (!rect) return;
        const scale = panel.getBoundingClientRect().height / panel.clientHeight || 1;
        const top = panel.scrollTop + (rect.top - panel.getBoundingClientRect().top) / scale;
        panel.scrollTo({top: Math.max(0, top - panel.clientHeight * 0.2), behavior: smooth ? "smooth" : "instant"});
    }
    function update(smooth = true) {
        const duration = video.duration, time = video.currentTime || 0;
        seek.value = String(time);
        progress.style.width = `${duration > 0 ? Math.min(100, time / duration * 100) : 0}%`;
        clock.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
        waveform?.update(time, duration);
        const index = activeIndex(segments, time === duration ? Math.max(0, time - 0.00001) : time);
        if (index === active) return;
        active = index;
        for (const f of fragments) f.element.classList.toggle("is-active", f.segmentId === segments[active]?.id);
        for (const b of buttons) {
            const selected = b.time === segments[active]?.start;
            b.element.classList.toggle("is-active", selected);
            if (selected) b.element.setAttribute("aria-current", "true"); else b.element.removeAttribute("aria-current");
        }
        scrollActive(smooth);
    }
    function jump(time) {
        if (!(video.duration > 0)) return;
        video.currentTime = Math.max(0, Math.min(video.duration, time)); update(false);
    }
    function placeLabels() {
        const width = ruler.clientWidth;
        const rows = [];
        const total = video.duration > 0 ? video.duration : Math.max(segments.at(-1)?.start + 1, 1);
        for (const button of buttons) {
            const x = 7 + (width - 14) * button.time / total;
            const size = button.element.offsetWidth;
            const left = Math.max(0, Math.min(width - size, x - size / 2));
            let row = rows.findIndex(end => end + 5 <= left);
            if (row < 0) row = rows.length;
            rows[row] = left + size;
            button.element.style.left = `${left}px`;
            button.element.style.top = `${12 + row * 29}px`;
            button.tick.style.left = `${x}px`;
            button.tick.style.height = `${10 + row * 29}px`;
        }
        ruler.style.height = `${buttons.length ? 14 + rows.length * 29 : 0}px`;
    }
    const resize = new ResizeObserver(() => placeLabels()); resize.observe(ruler);
    function render() {
        const parsed = parseTimeline(prompt, video.duration);
        segments = parsed.segments; active = -2; fragments = []; buttons = [];
        prose.replaceChildren(); ruler.replaceChildren();
        warning.textContent = parsed.warning; warning.hidden = !parsed.warning;
        for (const part of parsed.parts) {
            const span = element("span", part.kind === "timed" ? "gk-fragment" : "gk-global", part.text);
            if (part.kind === "timed") {
                fragments.push({element: span, segmentId: part.segmentId});
                if (enablePromptStyles) span.dataset.time = formatTime(segments.find(s => s.id === part.segmentId).start);
            }
            if (enablePromptStyles && !part.text.trim()) span.classList.add("gk-whitespace");
            prose.append(span);
        }
        const times = [...new Set([0, ...segments.flatMap(s => [s.start, ...(Number.isFinite(s.explicitEnd) ? [s.explicitEnd] : [])])])].filter(time => !(video.duration > 0) || time <= video.duration).sort((a, b) => a - b);
        for (const time of times) {
            const label = time < 60 ? `${Math.round(time * 1000) / 1000}s` : formatTime(time);
            const button = element("button", "gk-time-button", label); button.type = "button";
            button.title = `Seek to ${formatTime(time)}`; button.setAttribute("aria-label", button.title);
            button.onclick = () => jump(time);
            const tick = element("span", "gk-tick"); tick.setAttribute("aria-hidden", "true");
            ruler.append(tick, button); buttons.push({element: button, tick, time});
        }
        placeLabels(); update(false);
    }
    function animate() { update(); if (!video.paused && !disposed) frame = requestAnimationFrame(animate); }
    on(video, "play", () => { cancelAnimationFrame(frame); animate(); });
    on(video, "pause", () => { cancelAnimationFrame(frame); update(); });
    on(video, "ended", () => { cancelAnimationFrame(frame); update(); });
    on(video, "timeupdate", () => update()); on(video, "seeking", () => update(false));
    on(video, "loadedmetadata", () => { seek.max = String(video.duration || 1); seek.disabled = !(video.duration > 0); status.hidden = true; render(); });
    on(video, "error", () => { status.hidden = false; status.textContent = "Video unavailable. Check the file or use MP4/H.264."; });
    on(seek, "input", () => jump(Number(seek.value)));
    on(auto, "change", () => { savePreferences(); scrollActive(false); });
    if (styleSelect) on(styleSelect, "change", () => { applyStyle(styleSelect.value); savePreferences(); });
    for (const name of ["pointerdown", "pointerup", "click", "dblclick", "wheel"]) on(root, name, e => e.stopPropagation());
    on(root, "keydown", async e => {
        e.stopPropagation();
        if (/INPUT|TEXTAREA|BUTTON|SELECT|OPTION/.test(e.target.tagName)) return;
        if (e.code === "Space") {
            e.preventDefault();
            if (!video.paused) video.pause();
            else if (video.src) {
                try { await video.play(); }
                catch (error) { if (!disposed && error.name !== "AbortError") { status.hidden = false; status.textContent = "Playback unavailable. Check the video file."; } }
            }
        }
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") { e.preventDefault(); jump(video.currentTime + (e.code === "ArrowRight" ? 5 : -5)); }
    });
    applyStyle(preferences.promptStyle);
    render();
    return {
        element: root,
        setData(data) {
            prompt = String(data?.prompt ?? "");
            if (data?.video) { video.pause(); status.hidden = true; video.src = resolveVideo(data.video); video.load(); }
            waveform?.load(data?.video);
            render();
        },
        setPreferences(value) { preferences = value ?? {}; auto.checked = preferences.autoScroll !== false; applyStyle(preferences.promptStyle); },
        dispose() { disposed = true; waveform?.dispose(); controller.abort(); resize.disconnect(); cancelAnimationFrame(frame); video.pause(); video.removeAttribute("src"); video.load(); root.remove(); },
    };
}
