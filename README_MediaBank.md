# H3 Media Loader and Reference Splitter

These two nodes are a bundled port of **Fantastic H3 Media Loader** and **Fantastic H3 Reference Splitter** from [ComfyUI-Fantastic-MiniMaxH3-PromptBuilder](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder), installed upstream version **1.7.1**, by **Adudeguyman**. The original MIT license and copyright notice are included in `h3_media/LICENSE`.

Find **H3 Media Loader (genkai)** and **H3 Reference Splitter (genkai)** under **GENKAI → Media**. The original custom node pack is not required: the loader UI, decoder and all required HTTP handlers are bundled here.

The original interface and behavior are retained: nine picture slots, three video slots, three standalone audio slots, drag-and-drop and file picker, previews, ordering, enable switches, video sound routing (off / paired / standalone), named media presets and categories, size controls, trim/crop editing, frame capture, audio extraction and edited picture copies. **+ Native-output splitter** creates the splitter and connects it.

The splitter outputs `picture_1`–`picture_9`, `video_1`–`video_3`, `video_audio_1`–`video_audio_3`, and `audio_1`–`audio_3`. Pictures/video frames use standard IMAGE data; audio uses AUDIO. The original `H3_REFS` bundle format is preserved. Connect output 1 to the corresponding native H3 input 0 and continue in order.

GENKAI registration and labels, HTTP/CSS namespaces, browser preference keys, and upload/preset directories prevent collisions when the original pack is also installed. New uploads live in `input/genkai_h3_media`; presets live in `user/genkai_h3_media_presets`. Existing files referenced from the ComfyUI input/output/temp directories remain usable.

## GENKAI layout controls

- Drag a preview or its handle onto another slot. An occupied slot swaps with the source; an empty slot receives it and leaves the source empty. Pictures, videos and audio can exchange positions across both columns. File types and the splitter's output types do not change. References of each type are numbered in visual slot order, left grid first, then the right sections; disabled references are skipped.
- Hover over a slot and press **Ctrl+V** to insert an image from the clipboard. Pasting or dropping a new file on an occupied slot replaces that reference. Regular paste into text fields is unaffected.
- **Style**, immediately left of **Size**, offers Original, Gold (default), Obsidian, Light Studio and High Contrast. Obsidian uses near-black surfaces, graphite controls and platinum hover accents.
- Drag the vertical divider to adjust the space given to each column. Double-click it to restore equal widths. A focused divider also supports the arrow keys.
- In **Size**, enable **Resize contents with node** to make the panel and slots follow the node's corner resize handle. This option is enabled by default; an explicitly saved off setting is preserved. Node/text size controls remain available.

Slot placement is saved in workflows and media presets. Style, column width and responsive resizing are saved with the node in the workflow. Media limits remain nine pictures, three videos and the original H3 audio/reference budgets. Refresh ComfyUI with **Ctrl+F5** after updating the frontend.

Add a fresh pair or load `examples/Media Bank and Reference Splitter.json` after restarting ComfyUI and refreshing the browser.

Implementation provenance and original file hashes are recorded in `h3_media/UPSTREAM.json`. The Python node implementations and decoder are unchanged. The frontend includes the documented namespace substitutions and GENKAI layout additions above. Prompt Builder and RefMod nodes are not registered or required by this port.
