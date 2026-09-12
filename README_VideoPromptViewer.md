# PromptSync (genkai)

## + Save

`PromptSync + Save (genkai)` is a separate output node. It uses the installed VHS Video Combine encoder, with frame_rate, loop_count, filename_prefix, format, pix_fmt, crf, save_metadata, trim_to_audio, pingpong and save_output. It supports MP4/H.264 and MP4/H.265. H.264 is the default for browser playback. AV1 is not exposed because the installed FFmpeg does not include the encoder required by the VHS AV1 preset.

Connect the timed prompt and exactly one source: images/latents (with VAE when needed), VIDEO, or VHS_FILENAMES. AUDIO overrides an existing video's audio when connected. Existing videos are decoded and encoded with the selected settings; use their original FPS to keep the original speed. `save_output=true` writes to ComfyUI output; false writes to temp. The Filenames output uses the VHS type and contains only the final video. Date tokens in filename_prefix are expanded by ComfyUI when queued from the UI.

VHS Batch Manager is supported on the images/latents path, with loop_count=0 and pingpong=false. Automatic requeue requires the VHS `videohelpersuite/utils.py` output counter to recognize `GenkaiVideoPromptViewerSave` alongside `VHS_VideoCombine`. This package does not patch VHS automatically. Check that support before connecting Batch Manager, and again after VHS updates. Ordinary saves without Batch Manager do not require this change.

PromptSync + Save keeps only the final MP4: no metadata PNG and no silent intermediate alongside the audio result. Metadata is always embedded, including the available workflow/API prompt and the original timed prompt (`genkai_timed_prompt`). The `save_metadata` widget stays enabled for compatibility with saved workflows. The Filenames output contains only the final file. Audio is included when supplied by the source video or the AUDIO input; a source without audio remains silent. Previously generated files are not removed.

Looping or ping-pong changes the saved duration; prompt timestamps still refer to the saved video's absolute time. No automatic rewrite of the prompt is performed.

## Original viewer and shared timeline

Connect the original prompt to `prompt` and one video source: VHS Video Combine `filenames`, a core `VIDEO`, or an `IMAGE` batch with optional `audio`. `fps` applies only to image batches. VHS files are reused without encoding; other inputs create a temporary MP4.

The original prompt stays in its original order, including spacing, line breaks, headings and markup. The current timed action is highlighted in gold. General directions are blue. Auto-scroll follows playback and can be disabled. Time buttons sit below the seek bar at their actual positions; closely spaced labels use separate rows. Resize the node from its bottom-right corner to expand both columns and the prompt area.

Timing formats include decimal-second ranges, `MM:SS` / `HH:MM:SS` timestamps, Markdown headings and tables, numbered shot lists, inline `At`/`From` cues, H3 `[Shot N]` sections, and JSON objects with `start`/`end`, `start_time`/`end_time`, `timestamp`, or `time_range` fields. Explicit JSON duration is supported. The first H3 shot begins at zero; later cut timestamps define subsequent shots.

H3 reference alignment instructions, `overall_soundscape` and `non_diegetic_music` are kept outside the action timeline. Standalone sections such as Camera, Lighting, Style, Effects and Audio are separated when introduced at the action-heading indentation after a blank line. Indented camera directions inside a shot stay with that shot. General sections end when another timed action begins. Timing is based on explicit text structure; ambiguous unlabelled prose cannot always distinguish a global instruction from a shot-local instruction. Untimed prompts are displayed unchanged, without invented scene durations.

No local-upload, prompt-editor, or fullscreen toolbar is added by this node. Standard browser video controls remain available. The last executed result is restored from node properties; temporary videos may expire after restarting ComfyUI.

After changing the node files, refresh ComfyUI with Ctrl+F5. If installing the node for the first time, restart ComfyUI too. The viewer uses the libraries bundled with ComfyUI and no external services or models. The + Save version additionally requires VideoHelperSuite and its encoding dependencies.

Both PromptSync versions show the video audio waveform below the timeline. Click or drag the waveform to seek; its playhead follows the video and prompt. The waveform resizes with the node. Silent audio and videos without an audio track are labelled separately. Audio is decoded locally without changing the video or sending it to external services.
