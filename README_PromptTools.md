# Prompt Bank and Prompt Merge

Find both nodes under **GENKAI → Text**. Restart ComfyUI and refresh the browser after updating.

## Prompt Bank (genkai)

- Write separate prompts in a column. Fields start at three lines and grow with their text.
- **+ Add Prompt** adds a field; **×** removes it.
- One **PROMPTS** output sends the entire ordered list to Prompt Merge.
- **+ Add Prompt Merge** creates a Merge node, connects it and brings it into view.

## Prompt Merge (genkai)

- One **prompts** input receives the whole Bank, including prompts added later.
- Rename each row and switch it on or off. Enabled rows are green; disabled rows are gray.
- Names wrap onto multiple lines. They are labels and are not added to the output text.
- The single **STRING** output joins enabled, nonblank prompts in Bank order.
- **Separator** is a text field, defaulting to exactly `,` (no automatic space). Enter any text, add a real line break, or leave it empty.
- Names and switches remain attached to their prompts when other prompts are removed.
- The output preview updates while editing. All settings and texts are saved in the workflow.

No additional models or custom node packs are required.

Drag `examples/Prompt Bank and Merge.json` into ComfyUI for an example. The Camera row is disabled.

The original multiple-wire Bank-to-Merge connection is converted automatically when loading an old workflow. Save the workflow after conversion. The Bank now carries a prompt collection; connect ordinary text consumers to Merge's STRING output.
