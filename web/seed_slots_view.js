import {createCelebration} from "./seed_slots_effects.js";
import {scoreSeed, normalizeLedger, recordDraw} from "./seed_slots_score.js";

const sheet = new URL("./seed_slots.css", import.meta.url).href;
if (!document.querySelector('link[data-genkai-slots]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = sheet; link.dataset.genkaiSlots = ""; document.head.append(link);
}
const MAX_SEED = 9999999999;
function randomSeed() {
    const values = new Uint32Array(2);
    const limit = Math.floor(2 ** 53 / (MAX_SEED + 1)) * (MAX_SEED + 1);
    let value;
    do {
        crypto.getRandomValues(values);
        value = (values[0] & 0x1fffff) * 2 ** 32 + values[1];
    } while (value >= limit);
    return value % (MAX_SEED + 1);
}

export function createSlots({read, change, remember}) {
    const root = document.createElement("div");
    root.className = "gk-slots"; root.lang = "en";
    root.innerHTML = `
      <div class="ss-lights" aria-hidden="true"></div><div class="ss-content">
      <div class="ss-machine">
        <div class="ss-marquee"><span>✦</span><h3>LUCKY SEED</h3><span>✦</span></div>
        <div class="ss-housing"><div class="ss-drums" aria-hidden="true"></div><div class="ss-pointers" aria-hidden="true"></div></div>
        <button class="ss-lever" type="button" aria-label="Pull lever to draw a seed" title="Pull to draw a seed"><i></i><b></b></button>
        <div class="ss-readout"><label>CURRENT SEED<input class="ss-number" aria-label="Current seed" inputmode="numeric" maxlength="10" spellcheck="false"></label></div>
        <div class="ss-scoreboard"><div><span>COMBO SCORE</span><strong class="ss-score">0</strong></div><div><span>TOTAL SCORE</span><strong class="ss-total">0</strong></div></div>
        <div class="ss-combos"></div>
        <div class="ss-status" role="status" aria-live="polite"></div>
      </div>
      <div class="ss-controls">
        <button class="ss-spin" type="button"><span>⟳</span> SPIN</button>
        <div class="ss-secondary"><button class="ss-lock" type="button" aria-pressed="false"><i></i>Lock seed</button>
        <button class="ss-sound" type="button" aria-label="Enable sound" aria-pressed="false" title="Sound off">♪<span>×</span></button></div>
      </div>
      <details class="ss-history"><summary>RECENT SEEDS <span class="ss-history-count">0 draws</span></summary><div class="ss-history-items"></div></details>
      <details class="ss-rules"><summary>COMBINATIONS & POINTS</summary><div class="ss-paytable">
        <p>Adjacent repeats: 2 → 25 · 3 → 100 · 4 → 300 · 5 → 1,000 · 6 → 3,000 · 7 → 7,500 · 8 → 15,000 · 9 → 40,000 · 10 → 100,000.</p>
        <p>A run of three or more 7s adds 500. Each maximal repeat is counted once.</p>
        <p>Ascending or descending runs of 4+ digits: 150 points for four, doubled for each extra digit. No 9-to-0 wrap.</p>
        <p>Mirror: +1,000 · Identical five-digit halves: +600 · Alternating two digits: +1,500. These bonuses require at least two different digits. Bonuses add together.</p>
        <p>Combo multiplier: 2 matches → ×1.5 · 3 → ×2 · 4+ → ×3. Each listed combination or bonus counts as one match. The multiplier applies to their total, rounded to the nearest whole point.</p>
        <p>All ten displayed digits count, including leading zeros. Only new random draws add to TOTAL SCORE. Editing, recalling, and replaying a locked seed add no points. Scores are just for fun.</p>
      </div></details>
      <div class="ss-hint">New seed on run · Lock to reuse · Edit the number to set your own</div></div>`;
    const number = root.querySelector(".ss-number");
    const status = root.querySelector(".ss-status");
    const lock = root.querySelector(".ss-lock");
    const spin = root.querySelector(".ss-spin");
    const lever = root.querySelector(".ss-lever");
    const soundButton = root.querySelector(".ss-sound");
    const history = root.querySelector(".ss-history-items");
    const abort = new AbortController();
    const on = (item, event, fn) => item.addEventListener(event, fn, {signal: abort.signal});
    const drums = [];
    let animations = [], timer, sound = false, audio, disposed = false, shown = 0;
    let ledger = normalizeLedger(read().ledger, read().history);
    const scoreDisplay = root.querySelector(".ss-score");
    const totalDisplay = root.querySelector(".ss-total");
    const combosDisplay = root.querySelector(".ss-combos");
    const formatPoints = value => value.toLocaleString("en-US");
    const dateFormat = new Intl.DateTimeFormat("en-GB", {day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false});
    const lamps = root.querySelector(".ss-lights");
    const positions = [];
    for (let i = 0; i < 12; i++) positions.push([5 + i * 90 / 11, 0]);
    for (let i = 0; i < 8; i++) positions.push([100, 7 + i * 86 / 7]);
    for (let i = 11; i >= 0; i--) positions.push([5 + i * 90 / 11, 100]);
    for (let i = 7; i >= 0; i--) positions.push([0, 7 + i * 86 / 7]);
    positions.forEach(([x, y], i) => {
        const bulb = document.createElement("i");
        bulb.style.left = `${x}%`; bulb.style.top = `${y}%`;
        bulb.style.setProperty("--bulb-index", i); lamps.append(bulb);
    });
    const celebration = createCelebration(root, lamps);
    function showScore(value, earned = false) {
        const result = scoreSeed(value);
        scoreDisplay.textContent = formatPoints(result.score);
        totalDisplay.textContent = formatPoints(ledger.total);
        combosDisplay.replaceChildren();
        if (!result.combos.length) combosDisplay.textContent = "No combination this time";
        for (const combo of result.combos) {
            const badge = document.createElement("span");
            badge.textContent = `${combo.name} +${formatPoints(combo.points)}`;
            combosDisplay.append(badge);
        }
        if (result.multiplier > 1) {
            const multiplier = document.createElement("span");
            multiplier.className = "ss-multiplier";
            multiplier.textContent = `×${result.multiplier} COMBO MULTIPLIER`;
            multiplier.title = `${formatPoints(result.baseScore)} × ${result.multiplier} = ${formatPoints(result.score)} points`;
            combosDisplay.append(multiplier);
        }
        combosDisplay.title = earned ? "Added to total score" : "Combination preview — total score unchanged";
        if (earned && result.score > 0) {
            status.textContent = `${result.tier.toUpperCase()} · +${formatPoints(result.score)} POINTS`;
            celebration.play(result.tier, result.score);
        }
    }
    for (let i = 0; i < 10; i++) {
        const reel = document.createElement("div"); reel.className = "ss-reel";
        const strip = document.createElement("div"); strip.className = "ss-strip";
        for (let digit = 0; digit < 40; digit++) {
            const cell = document.createElement("span"); cell.textContent = String(digit % 10); strip.append(cell);
        }
        reel.append(strip); root.querySelector(".ss-drums").append(reel); drums.push(strip);
    }
    function tone(frequency = 170) {
        if (!sound || !audio || audio.state !== "running") return;
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = "triangle"; osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.025, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.06);
        osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.07);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    function controls() {
        const {locked} = read();
        lock.setAttribute("aria-pressed", String(Boolean(locked)));
        spin.disabled = Boolean(locked); lever.disabled = Boolean(locked);
        status.textContent = locked ? "SEED LOCKED" : "READY FOR THE NEXT DRAW";
    }
    function showHistory() {
        history.replaceChildren();
        root.querySelector(".ss-history-count").textContent = `${ledger.history.length} saved`;
        if (!ledger.history.length) {
            const empty = document.createElement("span"); empty.className = "ss-empty"; empty.textContent = "Your lucky numbers will appear here"; history.append(empty);
        }
        for (const entry of ledger.history) {
            const button = document.createElement("button"); button.type = "button";
            const seedText = document.createElement("strong"); seedText.textContent = String(entry.seed).padStart(10, "0");
            const date = document.createElement("time");
            date.textContent = entry.at && Number.isFinite(Date.parse(entry.at)) ? dateFormat.format(new Date(entry.at)) : "Date unavailable";
            if (entry.at) date.dateTime = entry.at;
            const points = document.createElement("span"); points.className = "ss-history-score";
            points.textContent = `${formatPoints(entry.score)} pts${entry.awarded ? "" : " · preview"}`;
            button.append(seedText, date, points);
            button.title = `Reuse and lock seed ${entry.seed}`;
            button.onclick = () => { change(entry.seed, true); draw(entry.seed, true); };
            history.append(button);
        }
    }
    function record(event) {
        const next = recordDraw(ledger, event);
        if (next === ledger) return false;
        ledger = next; remember(ledger); showHistory();
        return event.awarded;
    }
    function draw(value, animate = false, earned = false) {
        shown = value; clearTimeout(timer); celebration.stop(); animations.forEach(a => a.cancel()); animations = [];
        controls(); number.value = String(value).padStart(10, "0"); number.setCustomValidity("");
        const digits = String(value).padStart(10, "0");
        animate = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        root.classList.toggle("ss-spinning", animate);
        if (animate) { status.textContent = "DRAWING YOUR SEED…"; scoreDisplay.textContent = "…"; combosDisplay.textContent = "Finding combinations…"; }
        drums.forEach((strip, index) => {
            const height = strip.firstElementChild.offsetHeight || 76;
            const digit = Number(digits[index]), end = -(20 + digit) * height;
            strip.style.transform = `translateY(${end}px)`;
            if (animate) {
                const animation = strip.animate([
                    {transform: `translateY(${-digit * height}px)`},
                    {transform: `translateY(${end}px)`},
                ], {duration: 850 + index * 95, easing: "cubic-bezier(.16,.65,.18,1)"});
                animation.onfinish = () => { if (!disposed) tone(150 + index * 24); };
                animations.push(animation);
            }
        });
        const finish = () => {
            root.classList.remove("ss-spinning"); controls(); showScore(value, earned);
        };
        if (animate) timer = setTimeout(finish, 1770); else finish();
    }
    function roll() {
        if (read().locked) return;
        const value = randomSeed(); change(value, false);
        const earned = record({seed:value, id:crypto.randomUUID(), at:new Date().toISOString(), awarded:true});
        draw(value, true, earned); tone(110);
    }
    on(spin, "click", roll); on(lever, "click", roll);
    on(lock, "click", () => { change(shown, !read().locked); controls(); });
    on(number, "change", () => {
        if (!/^\d{1,10}$/.test(number.value)) { number.setCustomValidity("Enter an integer from 0 to 9999999999."); number.reportValidity(); return; }
        const value = Number(number.value);
        if (value === shown && read().locked) { draw(value); return; }
        change(value, true);
        record({seed:value, id:crypto.randomUUID(), at:new Date().toISOString(), awarded:false}); draw(value);
    });
    on(number, "keydown", event => { if (event.key === "Enter") { number.dispatchEvent(new Event("change")); number.blur(); } });
    on(soundButton, "click", async () => {
        sound = !sound;
        if (sound) {
            try { audio ||= new AudioContext(); await audio.resume(); }
            catch { sound = false; }
        }
        soundButton.setAttribute("aria-pressed", String(sound));
        soundButton.setAttribute("aria-label", sound ? "Disable sound" : "Enable sound");
        soundButton.title = sound ? "Sound on" : "Sound off"; tone(260);
    });
    for (const event of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "keydown"]) on(root, event, e => e.stopPropagation());
    let lastWidth = 0;
    const resize = new ResizeObserver(() => {
        if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; draw(shown); }
    });
    resize.observe(root);
    function restore() {
        const state = read(); ledger = normalizeLedger(state.ledger, state.history);
        const value = Number(state.seed);
        showHistory(); draw(Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEED ? value : 0);
    }
    restore();
    return {
        element: root, restore,
        receive(event) {
            change(event.seed, read().locked);
            const earned = event.id && event.awarded ? record(event) : false;
            draw(event.seed, true, earned);
        },
        dispose() { disposed = true; clearTimeout(timer); celebration.dispose(); abort.abort(); resize.disconnect(); animations.forEach(a => a.cancel()); audio?.close(); root.remove(); },
    };
}
