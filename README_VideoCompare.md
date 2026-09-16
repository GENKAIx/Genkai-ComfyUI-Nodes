# Video Compare Loader + PromptSync Video Compare

Compare two generated videos against the same timed prompt, or compare the videos on their own. Both nodes are under **GENKAI / Video**.

## Quick start

1. Add **Video Compare Loader (genkai)**. Load or drop a video into each slot and optionally name the variants.
2. Click **+ Add PromptSync Video Compare** to create and connect the comparison node.
3. Optionally enter the shared prompt in **PROMPT · OPTIONAL** below the loader's videos. The field grows up to 12 lines, then scrolls internally. Leave it empty to compare videos only.
4. Run the workflow, then press **Play** in the comparison panel.

An empty connected example is included in [examples/Video Compare.json](examples/Video%20Compare.json).

## Comparison

- **Stacked A / B** shows the videos one above the other.
- **Wipe A / B** overlays them with a draggable vertical divider. Both images retain their aspect ratio; videos with different proportions may have black bars.
- Play, pause, seek, scene markers and looping control both videos together. A shorter video holds its last frame while the longer video finishes.
- A nonempty prompt appears on the right with timed section highlighting and optional auto-scroll. An empty prompt hides the panel.
- **Obsidian** and **Gold** change the panel appearance. Resize the node to give the videos and prompt more room.

## Audio

**AUDIO A** and **AUDIO B** show separate waveforms below the shared timeline in both comparison modes. Their playheads follow playback; click or drag either waveform to seek both videos. Both lanes use the same time scale, so a shorter audio track ends earlier. The waveforms remain visible when sound is muted. A video without audio displays **No audio track**.

Open **Audio tracks** to enable each video's sound independently and adjust its volume. Tracks start disabled at 25% volume. Both videos' sound can be enabled together.

The comparison node has one **videos** input. Connect the loader's **videos** output to it: both video files, their names and the optional shared prompt travel through this connection.

## Files and saved settings

Use browser-compatible video and audio. MP4 with H.264 video and AAC audio is a suitable choice. The loader does not automatically transcode incompatible uploaded files.

Names, the optional prompt, comparison mode, divider position, theme and audio settings are saved with the workflow. Uploaded video files must still exist on the ComfyUI machine when reopening it.

Playback uses a shared timeline with drift correction, rather than a frame-by-frame comparison export.
