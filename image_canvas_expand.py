"""Load an image and crop or extend its canvas by editable edge offsets."""

from __future__ import annotations

import hashlib
import os
import re

import numpy as np
import torch
from PIL import Image, ImageOps

import folder_paths


MAX_MARGIN = 8192
MAX_DIMENSION = 16384
MAX_PIXELS = 64_000_000


def parse_color(mode: str, custom: str) -> tuple[int, int, int]:
    if mode == "black":
        return (0, 0, 0)
    if mode == "white":
        return (255, 255, 255)
    if mode != "custom":
        raise ValueError("Fill must be black, white, or custom")
    match = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", custom.strip())
    if not match:
        raise ValueError("Custom color must be a hex color such as #7F8A90")
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(ch * 2 for ch in digits)
    return tuple(int(digits[i : i + 2], 16) for i in (0, 2, 4))


def geometry_error(width: int, height: int, left: int, right: int, top: int, bottom: int) -> str | None:
    offsets = (left, right, top, bottom)
    if any(not -MAX_MARGIN <= value <= MAX_MARGIN for value in offsets):
        return f"Each edge offset must be between -{MAX_MARGIN} and {MAX_MARGIN} pixels"
    out_width = width + left + right
    out_height = height + top + bottom
    if (out_width < 1 or out_height < 1 or left <= -width or right <= -width
            or top <= -height or bottom <= -height):
        return "Cropping must leave at least one source pixel and a positive output size"
    if (out_width > MAX_DIMENSION or out_height > MAX_DIMENSION
            or out_width * out_height > MAX_PIXELS):
        return (f"Output image exceeds {MAX_DIMENSION}px on an edge "
                f"or {MAX_PIXELS:,} total pixels")
    return None


class GenkaiImageCanvasExpand:
    CATEGORY = "GENKAI/Image"
    DESCRIPTION = "Load an image, crop or expand its canvas in the editor, and fill new areas with a color."
    FUNCTION = "expand"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    @classmethod
    def INPUT_TYPES(cls):
        margin = {"default": 0, "min": -MAX_MARGIN, "max": MAX_MARGIN, "step": 1}
        return {
            "required": {
                "image_file": ("STRING", {"default": ""}),
                "left": ("INT", margin.copy()),
                "right": ("INT", margin.copy()),
                "top": ("INT", margin.copy()),
                "bottom": ("INT", margin.copy()),
                "fill": (["black", "white", "custom"], {"default": "black"}),
                "custom_color": ("STRING", {"default": "#808080"}),
            }
        }

    @classmethod
    def VALIDATE_INPUTS(cls, image_file, left, right, top, bottom, fill, custom_color):
        if not image_file or not folder_paths.exists_annotated_filepath(image_file):
            return "Load an image into Image Canvas Expand first"
        try:
            with Image.open(folder_paths.get_annotated_filepath(image_file)) as source:
                width, height = source.size
                if source.getexif().get(274) in (5, 6, 7, 8):
                    width, height = height, width
        except (OSError, ValueError) as exc:
            return f"Could not read image: {exc}"
        error = geometry_error(width, height, left, right, top, bottom)
        if error:
            return error
        try:
            parse_color(fill, custom_color)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, image_file, **_):
        if not image_file:
            return ""
        path = folder_paths.get_annotated_filepath(image_file)
        try:
            stat = os.stat(path)
        except OSError:
            return ""
        return hashlib.sha256(
            f"{image_file}:{stat.st_mtime_ns}:{stat.st_size}".encode()
        ).hexdigest()

    def expand(self, image_file, left, right, top, bottom, fill, custom_color):
        path = folder_paths.get_annotated_filepath(image_file)
        color = parse_color(fill, custom_color)
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")

        width, height = image.size
        error = geometry_error(width, height, left, right, top, bottom)
        if error:
            raise ValueError(error)
        out_width = width + left + right
        out_height = height + top + bottom

        canvas = Image.new("RGB", (out_width, out_height), color)
        canvas.paste(image, (left, top))
        pixels = np.asarray(canvas, dtype=np.float32) / 255.0
        return (torch.from_numpy(pixels).unsqueeze(0),)


NODE_CLASS_MAPPINGS = {"GenkaiImageCanvasExpand": GenkaiImageCanvasExpand}
NODE_DISPLAY_NAME_MAPPINGS = {
    "GenkaiImageCanvasExpand": "Image Canvas Expand (genkai)"
}
