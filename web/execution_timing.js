// Measure ComfyUI's complete execution, excluding time waiting in the queue.
export function createExecutionTiming(api, now = () => performance.now()) {
    let current = null;
    api.addEventListener("execution_start", ({detail}) => {
        current = {id: detail.prompt_id, timestamp: detail.timestamp, started: now(), listeners: new Set()};
    });
    function finish(detail, status) {
        if (!current || detail.prompt_id !== current.id) return;
        const run = current; current = null;
        const milliseconds = Number.isFinite(run.timestamp) && Number.isFinite(detail.timestamp)
            ? detail.timestamp - run.timestamp : now() - run.started;
        const timing = {seconds: Math.max(0, milliseconds / 1000), status};
        for (const listener of run.listeners) listener(timing);
        run.listeners.clear();
    }
    api.addEventListener("execution_success", ({detail}) => finish(detail, "completed"));
    api.addEventListener("execution_error", ({detail}) => finish(detail, "failed"));
    api.addEventListener("execution_interrupted", ({detail}) => finish(detail, "interrupted"));
    return {
        watch(listener) {
            if (!current) { listener(null); return () => {}; }
            const run = current;
            run.listeners.add(listener);
            listener({seconds: null, status: "running"});
            return () => run.listeners.delete(listener);
        },
    };
}

export function formatExecutionTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "—";
    const ms = Math.round(seconds * 1000);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor(ms / 60000) % 60;
    const remainder = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
    return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes).padStart(2, "0")}:${remainder}`;
}
