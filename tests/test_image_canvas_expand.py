import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


MODULE_PATH = Path(__file__).resolve().parents[1] / "image_canvas_expand.py"


class ImageCanvasExpandTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        directory = self.temp.name
        paths = types.SimpleNamespace(
            get_annotated_filepath=lambda name: os.path.join(directory, name),
            exists_annotated_filepath=lambda name: os.path.isfile(os.path.join(directory, name)),
        )
        old = sys.modules.get("folder_paths")
        sys.modules["folder_paths"] = paths
        self.addCleanup(
            lambda: sys.modules.pop("folder_paths", None)
            if old is None else sys.modules.__setitem__("folder_paths", old)
        )
        spec = importlib.util.spec_from_file_location("test_expand_module", MODULE_PATH)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        image = Image.new("RGB", (2, 2), (10, 20, 30))
        image.save(os.path.join(directory, "source.png"))
        pattern = Image.new("RGB", (3, 2))
        for y in range(2):
            for x in range(3):
                pattern.putpixel((x, y), (x * 40, y * 80, 10))
        pattern.save(os.path.join(directory, "pattern.png"))

    def test_custom_fill_and_dimensions(self):
        tensor, = self.module.GenkaiImageCanvasExpand().expand(
            "source.png", left=1, right=2, top=1, bottom=0,
            fill="custom", custom_color="#f0a",
        )
        self.assertEqual(tuple(tensor.shape), (1, 3, 5, 3))
        pixels = np.rint(tensor.numpy()[0] * 255).astype(np.uint8)
        np.testing.assert_array_equal(pixels[0, 0], [255, 0, 170])
        np.testing.assert_array_equal(pixels[1, 1], [10, 20, 30])

    def test_white_fill_and_invalid_custom_color(self):
        tensor, = self.module.GenkaiImageCanvasExpand().expand(
            "source.png", left=0, right=1, top=0, bottom=0,
            fill="white", custom_color="ignored",
        )
        np.testing.assert_allclose(tensor.numpy()[0, 0, 2], [1, 1, 1])
        self.assertIn("hex color", self.module.GenkaiImageCanvasExpand.VALIDATE_INPUTS(
            "source.png", 0, 0, 0, 0, "custom", "red",
        ))

    def test_crop_and_expand_match_requested_edges(self):
        tensor, = self.module.GenkaiImageCanvasExpand().expand(
            "pattern.png", left=-1, right=2, top=-1, bottom=1,
            fill="white", custom_color="ignored",
        )
        self.assertEqual(tuple(tensor.shape), (1, 2, 4, 3))
        pixels = np.rint(tensor.numpy()[0] * 255).astype(np.uint8)
        np.testing.assert_array_equal(pixels[0, 0], [40, 80, 10])
        np.testing.assert_array_equal(pixels[0, 1], [80, 80, 10])
        np.testing.assert_array_equal(pixels[0, 2], [255, 255, 255])

    def test_crop_cannot_remove_entire_source(self):
        error = self.module.GenkaiImageCanvasExpand.VALIDATE_INPUTS(
            "pattern.png", -3, 3, 0, 0, "black", "ignored",
        )
        self.assertIn("at least one source pixel", error)
        with self.assertRaisesRegex(ValueError, "at least one source pixel"):
            self.module.GenkaiImageCanvasExpand().expand(
                "pattern.png", -3, 3, 0, 0, "black", "ignored",
            )


if __name__ == "__main__":
    unittest.main()
