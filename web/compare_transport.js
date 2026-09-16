// The longer video is the clock. Followers are corrected without stretching the timeline.
export function createTransport(videos, tracks, update, report) {
    let position = 0, wanted = false, buffering = false, starting = false, version = 0;
    let repeat = true, disposed = false, frame = 0;
    const duration = () => Math.max(0, ...videos.map(v => Number.isFinite(v.duration) ? v.duration : 0));
    const master = () => [...videos].sort((a,b) => (b.duration || 0) - (a.duration || 0))[0];
    const all = () => [...new Set([...videos, ...tracks().filter(t => t.enabled).map(t => t.media)])];
    const active = () => all().filter(m => Number.isFinite(m.duration) && position < m.duration - .025 && !m.error);
    const stopMedia = () => { for (const m of all()) m.pause(); };
    const ready = () => videos.every(v => Number.isFinite(v.duration) && v.duration > 0 && !v.error);
    function align(force = false) {
        for (const m of all()) {
            if (!(m.duration > 0)) continue;
            const target = Math.min(position, Math.max(0, m.duration - .001));
            const drift = target - m.currentTime;
            if (force || Math.abs(drift) > .18) m.currentTime = target;
            m.playbackRate = Math.abs(drift) > .035 && Math.abs(drift) <= .18 ? (drift > 0 ? 1.03 : .97) : 1;
            if (position >= m.duration - .025) m.pause();
        }
    }
    async function start() {
        if (disposed || !wanted || starting || !ready()) return;
        const stamp = ++version;
        starting = true; align(true);
        try {
            await Promise.all(active().map(m => m.play()));
            if (stamp === version && wanted) buffering = false;
        } catch (error) {
            if (stamp === version) {
                wanted = false; stopMedia();
                report(error.name === 'NotAllowedError' ? 'Press Play to start playback with sound.' : 'Playback failed. Try an MP4 with H.264 and AAC audio.');
            }
        } finally { if (stamp === version) starting = false; }
    }
    function seek(time) {
        position = Math.max(0, Math.min(duration(), Number(time) || 0));
        ++version; starting = false; buffering = false; stopMedia(); align(true);
        update(position, duration(), wanted, buffering);
        if (wanted) start();
    }
    function pause() {
        if (wanted && !buffering && !starting) position = Math.min(duration(), master().currentTime || position);
        wanted = false; buffering = false; ++version; starting = false; stopMedia(); align(true);
        update(position, duration(), false, false);
    }
    function play() {
        if (!ready()) { report('Wait for both videos to load.'); return; }
        report(''); wanted = true;
        if (position >= duration() - .03) position = 0;
        start();
    }
    function tick() {
        if (disposed) return;
        if (wanted && !starting && ready()) {
            if (buffering) {
                if (active().every(m => m.readyState >= 3)) start();
            } else {
                position = Math.min(duration(), master().currentTime || 0);
                if (position >= duration() - .025 || master().ended) {
                    if (repeat) seek(0); else { position = duration(); pause(); }
                } else if (active().some(m => m.readyState < 3 || m.seeking)) {
                    buffering = true; stopMedia(); align(true);
                } else {
                    align();
                    for (const m of active()) if (m.paused) m.play().catch(() => { pause(); report('Press Play to resume.'); });
                }
            }
        }
        update(position, duration(), wanted, buffering || starting);
        frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return {play, pause, seek, toggle: () => wanted ? pause() : play(), setRepeat: value => { repeat = value; },
        refresh: () => seek(position), reset: () => { pause(); position = 0; update(0, duration(), false, false); },
        get time() { return position; }, get playing() { return wanted; },
        dispose() { pause(); disposed = true; cancelAnimationFrame(frame); }};
}
