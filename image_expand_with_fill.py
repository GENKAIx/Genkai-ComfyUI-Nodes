import numpy as np
import torch


class ImageExpandWithFill:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "left": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "right": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "top": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "bottom": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "stretch_fill": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "expand"
    CATEGORY = "GENKAI nodes"

    @staticmethod
    def _to_numpy_uint8(img_tensor: torch.Tensor) -> np.ndarray:
        img = img_tensor.detach().cpu().numpy()
        img = np.clip(img * 255.0, 0.0, 255.0).astype(np.uint8)
        return img

    @staticmethod
    def _to_tensor_float(img_np: np.ndarray) -> torch.Tensor:
        out = img_np.astype(np.float32) / 255.0
        return torch.from_numpy(out)

    @staticmethod
    def _expand_single(img_np: np.ndarray, left: int, right: int, top: int, bottom: int, stretch_fill: bool) -> np.ndarray:
        h, w, c = img_np.shape
        new_h = h + top + bottom
        new_w = w + left + right

        if stretch_fill:
            # Edge-stretch style fill: repeats border-adjacent content outward.
            padded = np.pad(
                img_np,
                ((top, bottom), (left, right), (0, 0)),
                mode="edge",
            )
            return padded

        # Transparent/black style fill when stretch is disabled.
        canvas = np.zeros((new_h, new_w, c), dtype=np.uint8)
        canvas[top : top + h, left : left + w, :] = img_np
        return canvas

    def expand(self, image, left, right, top, bottom, stretch_fill):
        if left == 0 and right == 0 and top == 0 and bottom == 0:
            return (image,)

        batch = []
        for i in range(image.shape[0]):
            img_np = self._to_numpy_uint8(image[i])
            expanded = self._expand_single(img_np, left, right, top, bottom, stretch_fill)
            batch.append(self._to_tensor_float(expanded))

        output = torch.stack(batch, dim=0)
        return (output,)


NODE_CLASS_MAPPINGS = {
    "ImageExpandWithFill": ImageExpandWithFill,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageExpandWithFill": "Image Expand With Fill (genkai)",
}
