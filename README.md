**English** | [Русский](README.ru.md)

# Genkai ComfyUI Nodes

A custom node pack for **ComfyUI** by [GENKAI](https://github.com/GENKAIx): synchronized video and prompt playback, video saving, file search, and image canvas expansion.

The node interface is in English. No additional models or cloud services are required.

Follow GENKAI on [Telegram · @genkai_ai](https://t.me/genkai_ai).

## PromptSync

https://github.com/user-attachments/assets/b0ac1e71-b139-49ce-98a5-c3e015adcd86

Watch a generated video alongside its original timed prompt. Check whether actions, camera cuts, and dialogue happen at the intended moments.

- **Left:** video player, clickable timeline markers, and an audio waveform.
- **Right:** the original prompt, preserving its order, spacing, and line breaks. Markdown remains part of the original text.
- The current timed section is highlighted; general camera, style, lighting, and sound directions use a separate color treatment.
- Choose a reading style from **Style** beside **Auto-scroll**. The selection is saved with the workflow and can be changed without restarting playback.
- Optional auto-scroll follows playback.
- Click a time marker or the waveform to seek through the video.
- Drag the node's bottom-right corner to make more room for the player and prompt.

[Supported timing syntax and prompt examples](#supported-timing-syntax)

### Reading styles

Available in **both PromptSync versions**:

| Style | Appearance |
| --- | --- |
| **Spotlight · Serif** (default) | Full-width warm highlight for the active scene, serif text, and a timestamp in the left margin. |
| **Cards · Sans** | Separate scene cards, a sans-serif font, and a gold border around the active card. |
| **Script · Mono** | Compact monospaced text with a blue active-scene background. |
| **Classic · Inline** | Original serif layout with gold highlighting behind active text lines. |

Styles change the presentation, keeping the original prompt text and timing intact.

### Connections

Connect text to `prompt` and **one** video source:

| Input | Source | Behavior |
| --- | --- | --- |
| `video` | A `VIDEO` output, such as Load Video | Creates a temporary MP4 preview, using the source video's audio. |
| `images` | An `IMAGE` frame batch | Creates a temporary MP4 at the selected `fps`; connect `audio` to include sound. |
| `filenames` | VHS Video Combine's `Filenames` output | Reuses the saved video without encoding it again. |

`fps` only applies to `images`. In this version, the separate `audio` input is used when assembling image frames; `video` and `filenames` play the audio already present in the video.

The waveform is decoded locally from the actual audio. A missing audio track and a silent track are labeled separately. Temporary previews may become unavailable after the `temp` directory is cleared.

## PromptSync + Save

![PromptSync + Save node with video preview, timed prompt, and audio waveform](docs/images/promptsync-save.png)

A separate output node that combines the PromptSync viewer with video saving through **VHS Video Combine**.

Includes the same [four reading styles](#reading-styles), auto-scroll, and audio waveform. [See supported timing syntax and examples](#supported-timing-syntax).

Connect `prompt` and one source: `images`, `video`, or `filenames`. For latents on `images`, also connect `vae`. The `audio` input adds sound to image frames or overrides the source video's audio.

Each completed save keeps **one final MP4**. Metadata is embedded in the video: no separate metadata PNG or silent intermediate remains alongside the result. If neither the source nor the `audio` input provides sound, the result has no audio track.

The `Filenames` output is compatible with `VHS_FILENAMES` and contains only the final video's path. Previously saved results are not deleted.

### Save settings

| Setting | Purpose |
| --- | --- |
| `frame_rate` | Output FPS. Match an existing video's original FPS to preserve its speed and prompt timing. |
| `loop_count` | Repetition count, following VHS behavior. Default: `0`. |
| `filename_prefix` | Filename and subfolder relative to `output` or `temp`. Date tokens such as `GENKAI/%date:yyyy-MM-dd%/%date:hhmmss%` work when queued from the ComfyUI interface. |
| `format` | MP4 with H.264 or H.265. H.264 is preferred for browser playback compatibility. |
| `pix_fmt` | `yuv420p` or `yuv420p10le`; supported combinations depend on the codec and FFmpeg build. |
| `crf` | Compression level. Lower values mean higher quality and larger files. Default: `19`. |
| `save_metadata` | Always enabled. Embeds the available workflow, generation parameters, and original timed prompt. |
| `trim_to_audio` | Trims the video to audio using VHS. |
| `pingpong` | Plays the frame sequence forward and backward. |
| `save_output` | `true`: save in `output`; `false`: save in `temp`. |

The original timed prompt is stored as `genkai_timed_prompt` metadata. Existing videos are decoded and encoded again when saved. Looping and `pingpong` change the duration without automatically rewriting the prompt's timestamps.

### VHS Batch Manager

The `meta_batch` input supports processing image/latent batches in parts. Set `loop_count=0` and `pingpong=false`.

**Automatic requeue requires support in VHS.** In VHS versions where `requeue_workflow` in `videohelpersuite/utils.py` only counts `VHS_VideoCombine` output nodes, add `GenkaiVideoPromptViewerSave` to that list. This package does not patch VHS automatically. Ordinary saves without `meta_batch` do not need this change. Check compatibility again after updating VHS.

## Folder Search

![Folder Search node and its file scanning settings](docs/images/folder-search.png)

Find files in a directory and pass the results to the next node. Useful for processing a collection of images, videos, or other files one at a time.

- `folder_path`: directory to search.
- `search_mask`: a pattern such as `*.mp4`, `*.png`, or `*.*`.
- `output_type`: return the entire list (`Full file list`) or one path per execution (`Current file`).
- `recursive`: include subfolders.
- `include_directories`: include directories in the results.
- `return_full_path`: return absolute paths.
- `relative_filenames`: return paths relative to the search directory when full paths are disabled.
- `infinite_loop`: immediately return to the first file after the last result in single-file mode.
- `save_output_to`: optional text file for writing the found paths.

The `output` contains a list or a string, depending on the mode. Without `infinite_loop`, the node returns an empty string after the last result; the next execution starts a new pass. It advances when executed, but does not queue ComfyUI runs by itself. Results follow filesystem traversal order without additional sorting.

## Image Expand With Fill

![Image Expand With Fill node with padding and fill settings](docs/images/image-expand-with-fill.png)

Expand the canvas by adding pixels on the `left`, `right`, `top`, and `bottom`. Works with individual images and `IMAGE` batches.

- `stretch_fill=true`: extend the image's border pixels outward.
- `stretch_fill=false`: fill the added area with zeros, producing black borders for ordinary RGB images.
- `image` output: the expanded image.

The original image area is not resized. This node does not perform generative outpainting or invent new details. Expansion converts through an 8-bit image; with all padding values set to zero, the input is returned without this conversion.

## Installation

Run this inside `ComfyUI/custom_nodes`:

```bash
git clone https://github.com/GENKAIx/Genkai-ComfyUI-Nodes.git
```

Restart ComfyUI and refresh your browser with **Ctrl+F5**. Search for the nodes by name. Viewers are in `GENKAI/Video`; the other nodes are in `GENKAI nodes`.

Use a current ComfyUI installation with `VIDEO` and `comfy_api.latest` support. The pack uses PyTorch, NumPy, PyAV, and aiohttp from the ComfyUI environment.

For **PromptSync + Save**, also install [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) and its dependencies. VHS Video Combine handles encoding, and FFmpeg must support the selected codec. The standard PromptSync viewer only needs VHS when using a `VHS_FILENAMES` source.

If you already have the pack installed as `GENKAI_nodes`, update or replace that installation. Do not keep two active copies: they register the same node identifiers.

## Supported timing syntax

Both viewers share the same parser. It recognizes common MiniMax H3, Seedance, and other video prompt structures through explicit time cues, independently of the model's name.

Examples:

```text
0.0–2.5 sec: A character enters the room.
2.5–6.0 sec: The camera moves closer.

Camera:
Soft cinematic light, slow movement.
```

```text
SHOT 1 (00:00–00:04) — Opening
A flame appears.

SHOT 2 (00:04–00:08) — Orbit
The camera circles the character.
```

```json
[
  {"start": 0, "end": 4, "prompt": "A flame appears."},
  {"start_time": "00:04", "duration": 4, "prompt": "The camera circles the character."}
]
```

Other supported forms include `MM:SS` and `HH:MM:SS` timestamps, decimal seconds with a dot or comma, Markdown headings and tables, numbered shots, `At` / `From` cues, H3 `[Shot N]` blocks, and JSON `timestamp` / `time_range` fields.

General sections such as `Camera`, `Lighting`, `Style`, `Effects`, `Audio`, `overall_soundscape`, and `non_diegetic_music` are separated from actions using the text's structure. For predictable results, introduce a global section after a blank line at the same indentation level as the shot headings. Indented directions inside a shot remain part of that shot.

Parsing is rule-based: ambiguous text without clear boundaries can be misclassified. A model name alone does not guarantee support for every prompt it produces. Untimed prompts are displayed in full without invented scene durations.

## Updates and troubleshooting

Run `git pull` inside the installed pack directory, restart ComfyUI, and refresh your browser with **Ctrl+F5**.

- **NaN or shifted fields after loading an old workflow:** the current version fixes settings serialization. If previous values have already been lost, defaults are restored with a notification. Check FPS, filename prefix, and encoding settings before running.
- **Video does not play:** try H.264 with `yuv420p` and check that the source file still exists.
- **No waveform:** check that the resulting video contains an audio track.
- **Video source error:** connect only one of `images`, `video`, or `filenames`.
- **Save error:** check VideoHelperSuite, codec availability, and that `filename_prefix` stays inside `output`/`temp`.

More details: [PromptSync technical notes](README_VideoPromptViewer.md).

## Credits

- [ComfyUI](https://github.com/Comfy-Org/ComfyUI): runtime, graph, and data types.
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite): video encoding for PromptSync + Save.

Pack author: **GENKAI** · [GitHub](https://github.com/GENKAIx)
