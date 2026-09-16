# Seed Slots (genkai)

A local slot-machine seed generator for ComfyUI. Find it under GENKAI/Seeds.
Connect its INT seed output to the sampler seed input (convert the sampler widget to an input if needed).

- Each workflow execution draws a new integer from 0 to 9,999,999,999 when Lock seed is off.
- Lock seed reuses the number shown on the display. Cached runs may skip replaying the animation.
- SPIN and the lever draw a preview without starting a workflow. Lock the result to use that number on the next run; otherwise the next run draws again.
- Expand RECENT SEEDS and click one of the last 50 entries to restore and lock it.
- Edit CURRENT SEED to enter your own number; manual entry locks it.
- Sound is optional and off when opened. Enable it with the music button.
- COMBO SCORE shows the sum of matching combinations; TOTAL SCORE accumulates points from new random draws. Manual entries, history recalls, locked replays, and repeated result messages add no points.
- The 40 perimeter bulbs celebrate wins with travelling light banks, reverse chases, alternating sides, and short pauses. Larger wins add multicolour patterns. New draws scoring more than 50 points also launch confetti; the amount increases with the win tier. Effects stop automatically and never retrigger on a history recall or duplicate result.
- RECENT SEEDS is collapsed when opened. Entries show the original local date/time and combination score; old history entries without timestamps say Date unavailable.
- Open COMBINATIONS & POINTS for the payout guide. Adjacent repeats, 7s, digit sequences, mirrors, twin halves, and alternating digits earn bonuses; all ten displayed digits count. Scores do not improve generation quality.
- Seed, lock state, history, and total score are saved in the workflow. The actual executed seed is also provided as genkai_seed_slots metadata to downstream savers that use EXTRA_PNGINFO.
- Animation is cosmetic and never delays backend execution. Reduced-motion browser preferences are respected.

The example workflow connects Seed Slots to Preview as Text for a quick check without models.
Restart ComfyUI and refresh the browser with Ctrl+F5 after installation.

## Scoring update

Adjacent repeats pay 25 / 100 / 300 / 1,000 / 3,000 / 7,500 / 15,000 / 40,000 / 100,000 points for runs of 2–10 digits. Four-digit straights start at 150, doubling for every additional digit. Other bonuses are unchanged.

Two matching combinations or bonuses multiply the subtotal by 1.5; three by 2; four or more by 3. The final score is rounded to the nearest whole point. The multiplier is displayed alongside the combinations.

Saved history is updated to these rules on load. TOTAL SCORE receives the difference for awarded draws still in the last 50 history entries; older points are preserved because their original seeds are no longer stored. Manual seed entries and duplicate events award no points; random draws through SPIN do.
