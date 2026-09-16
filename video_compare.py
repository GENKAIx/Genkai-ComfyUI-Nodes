"""Two-video comparison with an optional prompt carried by the loader."""
import hashlib
import json
from pathlib import Path

import av
import folder_paths

from .video_prompt_viewer import view_descriptor


def local_file(descriptor):
    roots = {"input": folder_paths.get_input_directory(), "output": folder_paths.get_output_directory(), "temp": folder_paths.get_temp_directory()}
    if not isinstance(descriptor, dict) or descriptor.get("type") not in roots:
        raise ValueError("Select a local media file in the loader.")
    root = Path(roots[descriptor['type']]).resolve()
    path = (root / descriptor.get('subfolder', '') / descriptor.get('filename', '')).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Media file is missing or outside the ComfyUI media folders.")
    return path


def inspect_video(descriptor):
    path = local_file(descriptor)
    descriptor = view_descriptor(path)
    with av.open(str(path)) as media:
        if not media.streams.video:
            raise ValueError(f"{path.name} has no video stream.")
        stream = media.streams.video[0]
        duration = float(stream.duration * stream.time_base) if stream.duration else float(media.duration or 0) / av.time_base
        return {"video": descriptor, "has_audio": bool(media.streams.audio), "width": stream.width, "height": stream.height, "duration": duration}


class GenkaiVideoCompareLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"media_json": ("STRING", {"default": "{}"})}}

    RETURN_TYPES = ('GENKAI_VIDEO_PAIR',)
    RETURN_NAMES = ('videos',)
    FUNCTION = 'load'
    CATEGORY = 'GENKAI/Video'
    DESCRIPTION = 'Load two videos and an optional shared prompt, then connect them to PromptSync Video Compare with one link.'

    @classmethod
    def IS_CHANGED(cls, media_json):
        state = json.loads(media_json)
        stamps = []
        for key in ('a', 'b'):
            path = local_file(state.get(key, {}).get('video'))
            stat = path.stat(); stamps.append((str(path), stat.st_size, stat.st_mtime_ns))
        return hashlib.sha256(json.dumps([state, stamps], sort_keys=True).encode()).hexdigest()

    def load(self, media_json):
        state = json.loads(media_json)
        result = {'prompt': str(state.get('prompt') or '')}
        for key in ('a', 'b'):
            item = state.get(key, {})
            if not item.get('video'):
                raise ValueError(f"Load video {key.upper()} first.")
            result[key] = {**inspect_video(item['video']), 'name': str(item.get('name') or key.upper())}
        return (result,)


class GenkaiVideoCompare:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {'videos': ('GENKAI_VIDEO_PAIR',)}}

    RETURN_TYPES = ()
    FUNCTION = 'compare'
    CATEGORY = 'GENKAI/Video'
    OUTPUT_NODE = True
    DESCRIPTION = 'Compare the loader’s videos in stacked or wipe mode, with an optional timed prompt and separate audio controls.'

    def compare(self, videos):
        if not isinstance(videos, dict):
            raise ValueError('Connect Video Compare Loader to the videos input.')
        result = {'prompt': str(videos.get('prompt') or '')}
        for key in ('a', 'b'):
            if key not in videos:
                raise ValueError(f'Load video {key.upper()} in Video Compare Loader first.')
            result[key] = {**inspect_video(videos[key]['video']), 'name': videos[key].get('name', key.upper())}
        return {'ui': {'genkai_compare': [result]}, 'result': ()}


NODE_CLASS_MAPPINGS = {'GenkaiVideoCompareLoader': GenkaiVideoCompareLoader, 'GenkaiVideoCompare': GenkaiVideoCompare}
NODE_DISPLAY_NAME_MAPPINGS = {'GenkaiVideoCompareLoader': 'Video Compare Loader (genkai)', 'GenkaiVideoCompare': 'PromptSync Video Compare (genkai)'}
