// Measure from ComfyUI execution start until the video reaches this node.
export function createExecutionTiming(api, now = () => performance.now()) {
    let current = null;
    let recent = null;
    api.addEventListener("execution_start", ({detail}) => {
        recent = null;
        current = {id: detail.prompt_id, started: now()};
    });
    function finish(detail, status) {
        if (!current || detail.prompt_id !== current.id) return;
        recent = {...current, status, finishedAt: now()};
        current = null;
    }
    api.addEventListener("execution_success", ({detail}) => finish(detail, "completed"));
    api.addEventListener("execution_error", ({detail}) => finish(detail, "failed"));
    api.addEventListener("execution_interrupted", ({detail}) => finish(detail, "interrupted"));
    return {
        capture() {
            // The frontend may deliver onExecuted after execution_success.
            // Keep that run briefly, but never reuse it for a later execution.
            const run = current || (recent?.status === "completed" && now() - recent.finishedAt < 60000 ? recent : null);
            return run ? {seconds: Math.max(0, (now() - run.started) / 1000), status: "completed"} : null;
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
