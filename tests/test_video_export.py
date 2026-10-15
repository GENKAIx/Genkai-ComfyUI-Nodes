"""Exercise the actual MP4 export with a short synthetic video and audio."""

import math
import os
import hashlib
from fractions import Fraction
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

try:
    import av
    import numpy as np
except ImportError:
    av = None
    np = None

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from h3_media.video_export import export_video
from h3_media import media_io


@unittest.skipUnless(av is not None, "PyAV and NumPy are required")
class VideoExportTest(unittest.TestCase):
    def test_trim_crop_and_soundtrack(self):
        with tempfile.TemporaryDirectory() as directory:
            source = os.path.join(directory, "source.mp4")
            target = os.path.join(directory, "edited.mp4")
            with av.open(source, "w") as output:
                video = output.add_stream("mpeg4", rate=24)
                video.width, video.height = 64, 48
                video.pix_fmt = "yuv420p"
                audio = output.add_stream("aac", rate=48000)
                audio.layout = "stereo"
                for index in range(48):
                    pixels = np.zeros((48, 64, 3), dtype=np.uint8)
                    pixels[:, :32, 0] = 180
                    pixels[:, 32:, 2] = 180
                    frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
                    frame.pts = index
                    for packet in video.encode(frame):
                        output.mux(packet)
                for packet in video.encode(None):
                    output.mux(packet)

                for index in range(0, 96000, 1024):
                    length = min(1024, 96000 - index)
                    t = np.arange(index, index + length, dtype=np.float32)
                    signal = 0.2 * np.sin(t * (2 * math.pi * 440 / 48000))
                    frame = av.AudioFrame.from_ndarray(
                        np.stack([signal, signal]), format="fltp", layout="stereo")
                    frame.sample_rate = 48000
                    frame.pts = index
                    frame.time_base = Fraction(1, 48000)
                    for packet in audio.encode(frame):
                        output.mux(packet)
                for packet in audio.encode(None):
                    output.mux(packet)

            original_hash = hashlib.sha256(Path(source).read_bytes()).digest()
            width, height, frames, has_audio = export_video(
                source, target, start=0.5, end=1.5,
                crop={"x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5},
                mirror=True, rotate=90, resize=32)
            self.assertEqual((width, height), (16, 16))
            self.assertEqual(frames, 24)
            self.assertTrue(has_audio)
            self.assertEqual(hashlib.sha256(Path(source).read_bytes()).digest(),
                             original_hash)
            with av.open(target) as result:
                self.assertEqual(len(result.streams.video), 1)
                self.assertEqual(len(result.streams.audio), 1)
                self.assertEqual(len(list(result.decode(video=0))), 24)
            with av.open(target) as result:
                samples = [frame.to_ndarray() for frame in result.decode(audio=0)]
                self.assertGreater(len(samples), 0)
                self.assertGreater(max(float(np.abs(chunk).max()) for chunk in samples),
                                   0.01)
            with mock.patch.object(media_io, "folder_paths", None):
                reference = media_io.load_video_frames(
                    source, start=0.5, end=1.5,
                    crop={"x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5},
                    mirror=True, rotate=90, resize=32)
            self.assertEqual(tuple(reference.shape[1:3]), (height, width))

            silent = os.path.join(directory, "silent.mp4")
            self.assertFalse(export_video(source, silent, start=0.5, end=1.5,
                                          include_audio=False)[-1])
            with av.open(silent) as result:
                self.assertEqual(len(result.streams.audio), 0)


if __name__ == "__main__":
    unittest.main()
