const COLORS = ["#ffd16d", "#ffac73", "#ff8fae", "#b7a1ff", "#82dfff", "#90edcb"];
const LEVEL = {win: 1, rare: 2, epic: 3, jackpot: 4};
const mod = (value, size) => ((value % size) + size) % size;

// Discrete travelling banks, with a short blackout between each new pattern.
// Only a subset of the perimeter is bright at any one time.
export function bulbFrame(tier, elapsed, count = 40) {
    const level = LEVEL[tier] || 1;
    const beat = Math.floor(elapsed / (150 - level * 12));
    const scene = Math.floor(elapsed / 1600);
    const pause = elapsed % 1600 > 1430;
    return Array.from({length: count}, (_, index) => {
        let bright = false, tail = false;
        const pattern = scene % (level > 1 ? 4 : 2);
        if (pattern < 2) {
            const heads = level > 2 ? 4 : 2;
            const spacing = count / heads;
            const direction = pattern === 0 ? 1 : -1;
            const distance = mod(direction * index - beat, spacing);
            bright = distance < 2;
            tail = distance >= spacing - 2;
        } else if (pattern === 2) {
            // Opposite sides answer each other in short, separated banks.
            const side = index < 12 ? 0 : index < 20 ? 1 : index < 32 ? 2 : 3;
            bright = side % 2 === Math.floor(beat / 3) % 2 && mod(index + beat, 5) < 2;
        } else {
            // Two counter-rotating heads with occasional isolated sparkles.
            bright = mod(index - beat, count) < 3 || mod(index + beat - count / 2, count) < 3;
            tail = level === 4 && mod(index * 7 + beat * 3, 19) === 0;
        }
        return {
            state: pause ? "off" : bright ? "bright" : tail ? "tail" : "off",
            color: level < 3 ? COLORS[0] : COLORS[mod(Math.floor(index / 5) + scene + (level === 4 ? Math.floor(beat / 5) : 0), COLORS.length)],
        };
    });
}

export function createCelebration(root, lamps) {
    const bulbs = [...lamps.children];
    const layer = document.createElement("div");
    layer.className = "ss-confetti";
    layer.setAttribute("aria-hidden", "true");
    root.append(layer);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, timeout, particles = [];

    function stop() {
        cancelAnimationFrame(frame); frame = 0;
        clearTimeout(timeout);
        delete root.dataset.win;
        bulbs.forEach(bulb => { delete bulb.dataset.glow; bulb.style.removeProperty("--lamp-color"); });
        particles.forEach(animation => animation.cancel()); particles = [];
        layer.replaceChildren();
    }

    function confetti(level) {
        const width = root.clientWidth, height = root.clientHeight;
        for (let i = 0; i < 36 + level * 14; i++) {
            const piece = document.createElement("i");
            const side = i % 2 ? 1 : -1;
            const startX = width * (side === 1 ? .07 : .93);
            const startY = height * .60;
            const travel = side * width * (.18 + Math.random() * .58);
            const peakY = height * (.02 + Math.random() * .22);
            const rotation = Math.random() * 360;
            const turn = (Math.random() - .5) * 1400;
            piece.style.background = COLORS[i % COLORS.length];
            piece.style.width = `${4 + Math.random() * 5}px`;
            piece.style.height = `${3 + Math.random() * 8}px`;
            piece.style.borderRadius = i % 5 === 0 ? "50%" : "1px";
            layer.append(piece);
            const transform = (x, y, spin, scale) => `translate3d(${x}px,${y}px,0) rotate(${spin}deg) scaleX(${scale})`;
            const animation = piece.animate([
                {offset: 0, transform: transform(startX, startY, rotation, 1), opacity: 0},
                {offset: .06, transform: transform(startX + travel * .12, startY - height * .12, rotation + turn * .06, 1), opacity: 1},
                {offset: .33, transform: transform(startX + travel * .5, peakY, rotation + turn * .33, .45), opacity: 1, easing: "ease-in"},
                {offset: .68, transform: transform(startX + travel * .8, height * .45, rotation + turn * .68, 1), opacity: 1},
                {offset: 1, transform: transform(startX + travel, height + 20, rotation + turn, .35), opacity: 0},
            ], {duration: 2600 + Math.random() * 1500, delay: Math.random() * 380, fill: "both"});
            particles.push(animation);
            animation.onfinish = () => {
                piece.remove();
                particles = particles.filter(item => item !== animation);
            };
        }
    }

    function play(tier, score) {
        stop();
        if (tier === "none") return;
        root.dataset.win = tier;
        const duration = tier === "jackpot" ? 10000 : tier === "epic" ? 7500 : 4800;
        if (motion.matches) {
            bulbs.forEach((bulb, index) => { if (index % 4 === 0) bulb.dataset.glow = "tail"; });
        } else {
            const start = performance.now();
            let lastBeat = -1;
            const tick = now => {
                const elapsed = now - start;
                if (elapsed >= duration) { stop(); return; }
                const beat = Math.floor(elapsed / 75);
                if (beat !== lastBeat) {
                    lastBeat = beat;
                    bulbFrame(tier, elapsed, bulbs.length).forEach((state, index) => {
                        bulbs[index].dataset.glow = state.state;
                        bulbs[index].style.setProperty("--lamp-color", state.color);
                    });
                }
                frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
            if (score > 50) confetti(LEVEL[tier] || 1);
        }
        timeout = setTimeout(stop, duration);
    }

    motion.addEventListener("change", stop);
    return {play, stop, dispose() { stop(); motion.removeEventListener("change", stop); layer.remove(); }};
}
