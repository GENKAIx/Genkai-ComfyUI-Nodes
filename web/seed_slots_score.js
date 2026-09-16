export function scoreSeed(seed) {
    const digits = String(seed).padStart(10, "0");
    const combos = [];
    const add = (name, points) => combos.push({name, points});
    const repeats = [0, 0, 25, 100, 300, 1000, 3000, 7500, 15000, 40000, 100000];
    for (const run of digits.matchAll(/(\d)\1+/g)) {
        add(`${run[0].length} × ${run[1]}`, repeats[run[0].length]);
        if (run[1] === "7" && run[0].length >= 3) add("Lucky sevens", 500);
    }
    for (let i = 0; i < digits.length - 1;) {
        const step = Number(digits[i + 1]) - Number(digits[i]);
        let end = i + 1;
        if (Math.abs(step) === 1) {
            while (end < digits.length && Number(digits[end]) - Number(digits[end - 1]) === step) end++;
            const length = end - i;
            if (length >= 4) add(`Straight ${digits.slice(i, end)}`, 150 * 2 ** (length - 4));
        }
        i = Math.max(i + 1, end - 1);
    }
    if (new Set(digits).size > 1) {
        if (digits === [...digits].reverse().join("")) add("Mirror", 1000);
        if (digits.slice(0, 5) === digits.slice(5)) add("Twin halves", 600);
        if (digits === digits.slice(0, 2).repeat(5)) add("Alternating", 1500);
    }
    const baseScore = combos.reduce((sum, combo) => sum + combo.points, 0);
    const multiplier = combos.length >= 4 ? 3 : combos.length === 3 ? 2 : combos.length === 2 ? 1.5 : 1;
    const score = Math.round(baseScore * multiplier);
    const tier = score >= 5000 ? "jackpot" : score >= 1000 ? "epic" : score >= 150 ? "rare" : score > 0 ? "win" : "none";
    return {score, tier, combos, baseScore, multiplier};
}

export function normalizeLedger(saved, legacy = []) {
    if (saved?.version === 2 && Array.isArray(saved.history)) return saved;
    if (saved?.version === 1 && Array.isArray(saved.history)) {
        let adjustment = 0;
        const history = saved.history.map(entry => {
            const score = scoreSeed(entry.seed).score;
            if (entry.awarded) adjustment += score - entry.score;
            return {...entry, score};
        });
        // Only the last 50 draws are retained. Preserve older earned points;
        // update known draws once, without inventing lost draw information.
        return {...saved, version: 2, total: saved.total + adjustment, history};
    }
    return {version: 2, total: 0, seen: [], history: legacy.filter(seed => Number.isSafeInteger(seed) && seed >= 0 && seed <= 9999999999).map((seed, i) => ({id:`legacy-${i}`, seed, at:null, score:scoreSeed(seed).score, awarded:false}))};
}

export function recordDraw(ledger, event) {
    if (ledger.seen.includes(event.id)) return ledger;
    const score = scoreSeed(event.seed).score;
    return {
        version: 2,
        total: ledger.total + (event.awarded ? score : 0),
        seen: [event.id, ...ledger.seen].slice(0, 256),
        history: [{...event, score}, ...ledger.history].slice(0, 50),
    };
}
