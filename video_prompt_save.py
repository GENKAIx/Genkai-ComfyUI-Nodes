"""Timed prompt viewer with encoding delegated to the installed VHS Video Combine."""

from copy import deepcopy
from pathlib import Path

import folder_paths
import nodes
from comfy_api.latest import InputImpl

from .video_prompt_viewer import VIDEO_EXTENSIONS, view_descriptor


FORMATS = ("video/h264-mp4", "video/h265-mp4")


class GenkaiVideoPromptViewerSave:
    @classmethod
    def INPUT_TYPES(cls):
        vhs = nodes.NODE_CLASS_MAPPINGS.get("VHS_VideoCombine")
        images_type = vhs.INPUT_TYPES()["required"]["images"] if vhs else ("IMAGE,LATENT",)
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True, "default": ""}),
                "frame_rate": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01, "tooltip": "Output FPS. For existing videos, use their original FPS to preserve timing."}),
                "loop_count": ("INT", {"default": 0, "min": 0, "max": 100}),
                "filename_prefix": ("STRING", {"default": "GENKAI/%date:yyyy-MM-dd%/%date:hhmmss%", "tooltip": "Path relative to ComfyUI output (or temp when save_output is false). Date tokens work as in VHS."}),
                "format": (list(FORMATS), {"default": FORMATS[0]}),
                "pix_fmt": (["yuv420p", "yuv420p10le"], {"default": "yuv420p"}),
                "crf": ("INT", {"default": 19, "min": 0, "max": 51, "tooltip": "Lower values mean higher quality and larger files."}),
                "save_metadata": ("BOOLEAN", {"default": True, "tooltip": "Embed the workflow, generation parameters and timed prompt in the saved video."}),
                "trim_to_audio": ("BOOLEAN", {"default": False}),
                "pingpong": ("BOOLEAN", {"default": False}),
                "save_output": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "images": images_type,
                "audio": ("AUDIO",),
                "meta_batch": ("VHS_BatchManager",),
                "vae": ("VAE",),
                "video": ("VIDEO",),
                "filenames": ("VHS_FILENAMES",),
            },
            "hidden": {"workflow_prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("VHS_FILENAMES",)
    RETURN_NAMES = ("Filenames",)
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "GENKAI/Video"
    DESCRIPTION = "Save a video using VHS Video Combine and review it against the original timed prompt. Connect one source. Requires VideoHelperSuite."

    def save(self, prompt, frame_rate=24.0, loop_count=0, filename_prefix="GENKAI/video", format="video/h264-mp4", pix_fmt="yuv420p", crf=19, save_metadata=True, trim_to_audio=False, pingpong=False, save_output=True, images=None, audio=None, meta_batch=None, vae=None, video=None, filenames=None, workflow_prompt=None, extra_pnginfo=None, unique_id=None):
        vhs = nodes.NODE_CLASS_MAPPINGS.get("VHS_VideoCombine")
        if vhs is None:
            raise RuntimeError("Install or enable ComfyUI-VideoHelperSuite, then restart ComfyUI to use + Save.")
        if format not in FORMATS or pix_fmt not in ("yuv420p", "yuv420p10le"):
            raise ValueError("Unsupported video format or pixel format.")
        if sum(value is not None for value in (images, video, filenames)) != 1:
            raise ValueError("Connect exactly one source: images, video or filenames.")
        if meta_batch is not None and (images is None or pingpong or loop_count):
            raise ValueError("Batch Manager requires images/latents with pingpong off and loop_count set to 0.")
        directory = Path(folder_paths.get_output_directory() if save_output else folder_paths.get_temp_directory()).resolve()
        # Validate before VHS creates directories or files; absolute paths outside the root are not accepted.
        prefix_path = Path(filename_prefix)
        if not (directory / prefix_path).resolve().is_relative_to(directory):
            raise ValueError("filename_prefix must stay inside the ComfyUI output/temp directory.")
        if filenames is not None:
            if not isinstance(filenames, (tuple, list)) or len(filenames) != 2 or not isinstance(filenames[1], (tuple, list)):
                raise ValueError("filenames must come from VHS Video Combine.")
            candidates = [p for p in filenames[1] if isinstance(p, str) and Path(p).suffix.lower() in VIDEO_EXTENSIONS]
            if not candidates:
                raise ValueError("No saved video was received from VHS.")
            view_descriptor(candidates[-1])
            video = InputImpl.VideoFromFile(candidates[-1])
        if video is not None:
            components = video.get_components()
            images = components.images
            if audio is None:
                audio = components.audio
            vae = None
        metadata = deepcopy(extra_pnginfo or {})
        metadata.setdefault("workflow", {}).setdefault("extra", {}).update(VHS_MetadataImage=False, VHS_KeepIntermediate=False)
        metadata["genkai_timed_prompt"] = str(prompt)
        # VHS skips the metadata PNG and removes the silent intermediate after audio muxing succeeds.
        result = vhs().combine_video(
            images=images, frame_rate=frame_rate, loop_count=loop_count,
            filename_prefix=filename_prefix, format=format, pingpong=pingpong,
            save_output=save_output, audio=audio, meta_batch=meta_batch, vae=vae,
            prompt=workflow_prompt, extra_pnginfo=metadata, unique_id=unique_id,
            pix_fmt=pix_fmt, crf=crf, save_metadata=save_metadata, trim_to_audio=trim_to_audio,
        )
        output = result["result"] if isinstance(result, dict) else result
        ui = {}
        if isinstance(result, dict) and result.get("ui", {}).get("unfinished_batch"):
            ui["unfinished_batch"] = result["ui"]["unfinished_batch"]
        elif output[0][1]:
            descriptor = view_descriptor(output[0][1][-1])
            ui["genkai_preview"] = [{"video": descriptor, "prompt": str(prompt)}]
            output = ((output[0][0], [output[0][1][-1]]),)
        return {"ui": ui, "result": output}


NODE_CLASS_MAPPINGS = {"GenkaiVideoPromptViewerSave": GenkaiVideoPromptViewerSave}
NODE_DISPLAY_NAME_MAPPINGS = {"GenkaiVideoPromptViewerSave": "PromptSync + Save (genkai)"}
