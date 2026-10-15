"""Stream a Media Loader video edit to a downloadable MP4 using PyAV."""

from fractions import Fraction


EXPORT_FPS = 24  # The H3 loader samples video references at this rate.
EXPORT_AUDIO_RATE = 48000


def _crop_bounds(width, height, crop):
    if not crop:
        return 0, 0, width, height
    x = float(crop.get("x", 0))
    y = float(crop.get("y", 0))
    w = float(crop.get("w", 1))
    h = float(crop.get("h", 1))
    if not all(0 <= value <= 1 for value in (x, y, w, h)) or not w or not h:
        raise ValueError("invalid crop rectangle")
    x0 = max(0, min(width - 16, round(x * width)))
    y0 = max(0, min(height - 16, round(y * height)))
    x1 = min(width, max(x0 + 16, round((x + w) * width)))
    y1 = min(height, max(y0 + 16, round((y + h) * height)))
    return x0, y0, x1, y1


def _video_frame(frame, target, rotate, mirror, crop):
    import av
    import numpy as np

    if target:
        pixels = frame.to_ndarray(format="rgb24", width=target[0], height=target[1])
    else:
        pixels = frame.to_ndarray(format="rgb24")
    if rotate:
        pixels = np.rot90(pixels, k=-(rotate // 90))
    if mirror:
        pixels = pixels[:, ::-1]
    height, width = pixels.shape[:2]
    x0, y0, x1, y1 = _crop_bounds(width, height, crop)
    pixels = np.ascontiguousarray(pixels[y0:y1, x0:x1])
    # H.264 yuv420p needs even dimensions; duplicate only the final edge.
    if pixels.shape[0] % 2 or pixels.shape[1] % 2:
        pixels = np.pad(pixels, ((0, pixels.shape[0] % 2),
                                 (0, pixels.shape[1] % 2), (0, 0)), mode="edge")
    return av.VideoFrame.from_ndarray(pixels, format="rgb24")


def _audio_samples(frame):
    """Return planar float32 samples, including packed input layouts."""
    import numpy as np

    data = frame.to_ndarray()
    if data.ndim == 1:
        data = data[None, :]
    if data.shape[0] == 1 and frame.samples and data.shape[1] > frame.samples:
        channels = data.shape[1] // frame.samples
        data = data.reshape(frame.samples, channels).T
    if data.dtype.kind == "i":
        data = data.astype(np.float32) / max(abs(np.iinfo(data.dtype).min),
                                              np.iinfo(data.dtype).max)
    elif data.dtype.kind == "u":
        maximum = np.iinfo(data.dtype).max
        data = (data.astype(np.float32) - (maximum + 1) / 2) / ((maximum + 1) / 2)
    else:
        data = data.astype(np.float32)
    if data.shape[0] > 2:
        data = data[:2]
    return np.ascontiguousarray(data)


def export_video(source, destination, *, start=0, end=None, crop=None,
                 mirror=False, rotate=0, resize=0, include_audio=True):
    """Encode only the selected span, preserving its soundtrack when requested.

    Frames use the same 24 FPS sampling and resize/turn/mirror/crop order as
    H3 references. Work is streaming per frame; the original is never written.
    Returns (width, height, frame_count, has_audio).
    """
    import av
    import numpy as np
    from . import media_io

    start = float(start or 0)
    end = float(end) if end is not None else None
    rotate = int(rotate or 0) % 360
    resize = int(resize or 0)
    if start < 0 or (end is not None and end <= start):
        raise ValueError("end must be after start")
    if rotate not in (0, 90, 180, 270) or resize < 0:
        raise ValueError("invalid rotation or size")

    with av.open(source) as input_file:
        video = next((s for s in input_file.streams if s.type == "video"), None)
        if video is None:
            raise ValueError("source has no video stream")
        audio = next((s for s in input_file.streams if s.type == "audio"), None)
        has_audio = bool(include_audio and audio is not None)
        video.thread_type = "AUTO"
        target = media_io._scaled_size(video.codec_context.width,
                                       video.codec_context.height, resize)
        with av.open(destination, "w", options={"movflags": "+faststart"}) as output:
            out_video = output.add_stream("libx264", rate=EXPORT_FPS)
            out_video.pix_fmt = "yuv420p"
            out_video.options = {"crf": "19", "preset": "medium"}
            out_audio = output.add_stream("aac", rate=EXPORT_AUDIO_RATE) if has_audio else None
            if out_audio is not None:
                out_audio.layout = "stereo"
            count = 0
            want = start
            grid = 1 / EXPORT_FPS
            dimensions = None
            if start:
                input_file.seek(int(start / video.time_base), stream=video,
                                backward=True, any_frame=False)
            for frame in input_file.decode(video):
                t = frame.time
                if t is None:
                    continue
                if end is not None and t >= end:
                    break
                if t < want - grid / 2:
                    continue
                edited = _video_frame(frame, target, rotate, mirror, crop)
                if dimensions is None:
                    dimensions = (edited.width, edited.height)
                    out_video.width, out_video.height = dimensions
                edited.pts = count
                edited.time_base = Fraction(1, EXPORT_FPS)
                for packet in out_video.encode(edited):
                    output.mux(packet)
                count += 1
                want += grid
            if not count:
                raise ValueError("selected range contains no video frames")
            for packet in out_video.encode(None):
                output.mux(packet)

            if has_audio:
                resampler = av.AudioResampler(format="fltp", layout="stereo",
                                              rate=EXPORT_AUDIO_RATE)
                fifo = av.AudioFifo()
                sample_cursor = 0
                fallback_time = 0.0

                def write_resampled(chunks):
                    nonlocal sample_cursor
                    for chunk in chunks:
                        chunk.pts = sample_cursor
                        chunk.time_base = Fraction(1, EXPORT_AUDIO_RATE)
                        sample_cursor += chunk.samples
                        fifo.write(chunk)
                        while fifo.samples >= 1024:
                            for packet in out_audio.encode(fifo.read(1024)):
                                output.mux(packet)

                # A new decoder starts at zero; only selected samples are kept.
                with av.open(source) as audio_file:
                    audio_stream = audio_file.streams.audio[0]
                    if start:
                        audio_file.seek(int(start / audio_stream.time_base),
                                        stream=audio_stream, backward=True,
                                        any_frame=False)
                    for frame in audio_file.decode(audio_stream):
                        rate = frame.sample_rate
                        t = frame.time if frame.time is not None else fallback_time
                        fallback_time = t + frame.samples / rate
                        left = max(0, round((start - t) * rate))
                        right = min(frame.samples, round(((end if end is not None
                                                           else fallback_time) - t) * rate))
                        if right <= left:
                            if end is not None and t >= end:
                                break
                            continue
                        samples = _audio_samples(frame)[:, left:right]
                        if samples.shape[0] == 1:
                            samples = np.repeat(samples, 2, axis=0)
                        in_frame = av.AudioFrame.from_ndarray(samples,
                                                              format="fltp", layout="stereo")
                        in_frame.sample_rate = rate
                        write_resampled(resampler.resample(in_frame))
                        if end is not None and fallback_time >= end:
                            break
                write_resampled(resampler.resample(None))
                if fifo.samples:
                    for packet in out_audio.encode(fifo.read(fifo.samples, partial=True)):
                        output.mux(packet)
                for packet in out_audio.encode(None):
                    output.mux(packet)
            return (*dimensions, count, has_audio)
