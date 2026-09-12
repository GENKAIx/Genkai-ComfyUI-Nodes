"""Small audio envelopes for the original viewer, decoded locally in bounded memory."""

import asyncio
from pathlib import Path

import av
import numpy as np
from aiohttp import web
import folder_paths
from server import PromptServer

from .video_prompt_viewer import VIDEO_EXTENSIONS


def audio_peaks(filename, bins=2048):
    with av.open(str(filename)) as media:
        if not media.streams.audio:
            return {"has_audio": False, "duration": 0, "peaks": []}
        video = media.streams.video[0] if media.streams.video else None
        audio = media.streams.audio[0]
        origin = float(video.start_time * video.time_base) if video is not None and video.start_time is not None else (media.start_time or 0) / av.time_base
        duration = float(video.duration * video.time_base) if video is not None and video.duration else (media.duration or 0) / av.time_base
        if duration <= 0:
            raise ValueError("Video duration is unavailable.")
        peaks = np.zeros(bins, dtype=np.float32)
        converter = av.AudioResampler(format="fltp", layout=audio.layout)
        next_time = float(audio.start_time * audio.time_base) if audio.start_time is not None else origin
        for frame in media.decode(audio):
            for planar in converter.resample(frame):
                start = float(planar.pts * planar.time_base) if planar.pts is not None else next_time
                samples = np.max(np.abs(planar.to_ndarray()), axis=0)
                times = start - origin + np.arange(len(samples)) / planar.sample_rate
                indices = np.floor(times * bins / duration).astype(np.int64)
                valid = (indices >= 0) & (indices < bins)
                np.maximum.at(peaks, indices[valid], samples[valid])
                next_time = start + len(samples) / planar.sample_rate
        return {"has_audio": True, "duration": duration, "peaks": np.round(np.clip(peaks, 0, 1), 4).tolist()}


@PromptServer.instance.routes.get("/genkai/audio-waveform")
async def audio_waveform(request):
    roots = {"input": folder_paths.get_input_directory(), "output": folder_paths.get_output_directory(), "temp": folder_paths.get_temp_directory()}
    directory = roots.get(request.query.get("type", "output"))
    if directory is None:
        raise web.HTTPBadRequest(text="Invalid video location.")
    root = Path(directory).resolve()
    path = (root / request.query.get("subfolder", "") / request.query.get("filename", "")).resolve()
    if not path.is_relative_to(root) or path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise web.HTTPForbidden(text="Invalid video path.")
    if not path.is_file():
        raise web.HTTPNotFound(text="Video no longer exists.")
    try:
        result = await asyncio.to_thread(audio_peaks, path)
    except (av.FFmpegError, OSError, ValueError):
        raise web.HTTPUnprocessableEntity(text="Could not read the audio track.") from None
    return web.json_response(result, headers={"Cache-Control": "no-store"})
