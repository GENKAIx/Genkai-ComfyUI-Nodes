export function createWaveform({resolveWaveform, jump}) {
    const element = document.createElement("div"); element.className = "gk-waveform";
    const label = document.createElement("div"); label.className = "gk-waveform-label"; label.textContent = "AUDIO";
    const lane = document.createElement("div"); lane.className = "gk-waveform-lane"; lane.tabIndex = 0;
    lane.setAttribute("role", "slider"); lane.setAttribute("aria-label", "Audio waveform position"); lane.setAttribute("aria-valuemin", "0");
    const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
    const playhead = document.createElement("div"); playhead.className = "gk-waveform-playhead";
    const status = document.createElement("span"); status.className = "gk-waveform-status";
    lane.append(canvas, playhead, status); element.append(label, lane);
    let peaks = [], audioDuration = 0, duration = 0, time = 0, request = null, disposed = false;
    const events = new AbortController();
    const on = (name, action) => lane.addEventListener(name, action, {signal: events.signal});

    function draw() {
        const width = lane.clientWidth, height = lane.clientHeight;
        if (!width || !height) return;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
        const middle = height / 2;
        ctx.strokeStyle = "#23617a"; ctx.beginPath(); ctx.moveTo(0, middle); ctx.lineTo(width, middle); ctx.stroke();
        if (!peaks.length) return;
        const end = Math.min(width, width * audioDuration / (duration || audioDuration));
        const bars = Math.max(1, Math.floor(end / 2));
        ctx.fillStyle = "#38b5df";
        for (let i = 0; i < bars; i++) {
            const first = Math.floor(i * peaks.length / bars), last = Math.max(first + 1, Math.floor((i + 1) * peaks.length / bars));
            let peak = 0;
            for (let j = first; j < last; j++) peak = Math.max(peak, peaks[j]);
            const amplitude = peak * (middle - 5);
            if (amplitude > 0) ctx.fillRect(i * end / bars, middle - amplitude, Math.max(1, end / bars - 0.6), amplitude * 2);
        }
    }
    function message(text) { status.textContent = text; status.hidden = !text; }
    function seekPointer(event) {
        if (!(duration > 0)) return;
        const rect = lane.getBoundingClientRect();
        jump(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration);
    }
    on("pointerdown", event => {
        if (event.button !== 0 || !(duration > 0)) return;
        event.preventDefault(); lane.focus(); lane.setPointerCapture(event.pointerId); seekPointer(event);
    });
    on("pointermove", event => { if (lane.hasPointerCapture(event.pointerId)) seekPointer(event); });
    on("pointerup", event => { if (lane.hasPointerCapture(event.pointerId)) lane.releasePointerCapture(event.pointerId); });
    on("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        jump(event.key === "Home" ? 0 : event.key === "End" ? duration : time + (event.key === "ArrowLeft" ? -1 : 1));
    });
    const resize = new ResizeObserver(draw); resize.observe(lane);
    message("Connect a video to see its audio.");
    return {
        element,
        update(position, length) {
            time = position;
            const nextDuration = Number.isFinite(length) && length > 0 ? length : 0;
            if (duration !== nextDuration) { duration = nextDuration; draw(); }
            playhead.hidden = !duration;
            playhead.style.left = `${duration ? Math.min(100, time / duration * 100) : 0}%`;
            lane.setAttribute("aria-valuemax", String(duration)); lane.setAttribute("aria-valuenow", String(time));
            lane.setAttribute("aria-disabled", String(!duration));
        },
        async load(descriptor) {
            request?.abort(); request = new AbortController();
            const pending = request;
            peaks = []; audioDuration = 0; draw();
            message(descriptor ? "Loading audio waveform…" : "Connect a video to see its audio.");
            if (!descriptor) return;
            try {
                const response = await fetch(resolveWaveform(descriptor), {signal: pending.signal, cache: "no-store"});
                if (!response.ok) throw new Error("Audio unavailable");
                const data = await response.json();
                if (disposed || pending !== request) return;
                peaks = data.peaks; audioDuration = data.duration;
                message(data.has_audio ? (peaks.some(value => value > 0) ? "" : "Silent audio track") : "No audio track");
                draw();
            } catch (error) {
                if (!disposed && pending === request && error.name !== "AbortError") message("Audio waveform unavailable");
            }
        },
        dispose() { disposed = true; request?.abort(); events.abort(); resize.disconnect(); peaks = []; element.remove(); },
    };
}
