"""Local video preview with a synchronized timed prompt."""

from fractions import Fraction
from pathlib import Path
from uuid import uuid4

import folder_paths
from comfy_api.latest import InputImpl, Types


VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv", ".m4v", ".ogv"}


def view_descriptor(filename):
    """Only expose files served by ComfyUI's existing /view endpoint."""
    path = Path(filename).resolve()
    for kind, directory in (
        ("output", folder_paths.get_output_directory()),
        ("input", folder_paths.get_input_directory()),
        ("temp", folder_paths.get_temp_directory()),
    ):
        root = Path(directory).resolve()
        if path.is_relative_to(root):
            if not path.is_file():
                raise FileNotFoundError(f"GENKAI: video no longer exists: {path.name}")
            if path.suffix.lower() not in VIDEO_EXTENSIONS:
                raise ValueError("GENKAI: connect a saved video, not an image or a folder.")
            relative = path.relative_to(root)
            return {"filename": relative.name, "subfolder": relative.parent.as_posix() if relative.parent != Path('.') else "", "type": kind}
    raise ValueError("GENKAI: video must be inside ComfyUI input, output or temp.")


class GenkaiVideoPromptViewer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True, "default": "", "tooltip": "Timed generation prompt: timestamps, time ranges or JSON segments."}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01, "tooltip": "Frame rate for IMAGE input only. Saved videos keep their original timing and audio."}),
            },
            "optional": {
                "filenames": ("VHS_FILENAMES", {"tooltip": "Connect VHS Video Combine → Filenames. Reuses the saved video including audio."}),
                "video": ("VIDEO",),
                "images": ("IMAGE",),
                "audio": ("AUDIO",),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "preview"
    CATEGORY = "GENKAI/Video"
    OUTPUT_NODE = True
    DESCRIPTION = "Video on the left, timed prompt on the right. Click a chapter to seek; the current prompt follows playback. Connect exactly one video source."

    def preview(self, prompt, fps=24.0, filenames=None, video=None, images=None, audio=None):
        sources = sum(value is not None for value in (filenames, video, images))
        if sources != 1:
            raise ValueError("GENKAI: connect exactly one source: filenames, video or images.")
        if filenames is not None:
            # VHS returns (save_output, [metadata image, silent video, muxed video]).
            if not isinstance(filenames, (tuple, list)) or len(filenames) != 2 or not isinstance(filenames[1], (tuple, list)):
                raise ValueError("GENKAI: filenames must come from VHS Video Combine.")
            candidates = [p for p in filenames[1] if isinstance(p, str) and Path(p).suffix.lower() in VIDEO_EXTENSIONS]
            if not candidates:
                raise ValueError("GENKAI: VHS did not return a video. Select an MP4/WebM video format in Video Combine.")
            descriptor = view_descriptor(candidates[-1])
        else:
            if images is not None:
                if len(images) == 0:
                    raise ValueError("GENKAI: image batch is empty.")
                video = InputImpl.VideoFromComponents(Types.VideoComponents(images=images, audio=audio, frame_rate=Fraction(str(fps))))
            directory = Path(folder_paths.get_temp_directory()) / "genkai_prompt_viewer"
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / f"preview_{uuid4().hex}.mp4"
            video.save_to(str(target), format=Types.VideoContainer.MP4, codec=Types.VideoCodec.H264)
            descriptor = view_descriptor(target)
        return {"ui": {"genkai_preview": [{"video": descriptor, "prompt": str(prompt)}]}, "result": ()}


NODE_CLASS_MAPPINGS = {"GenkaiVideoPromptViewer": GenkaiVideoPromptViewer}
NODE_DISPLAY_NAME_MAPPINGS = {"GenkaiVideoPromptViewer": "PromptSync (genkai)"}
