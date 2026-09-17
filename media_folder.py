"""Folder gallery backed by ordinary H3 media references; source files are read-only."""
import asyncio
import hashlib
import os
from pathlib import Path
import shutil
import threading
from uuid import uuid4

from aiohttp import web
import folder_paths
from server import PromptServer
from .h3_media import media_io, web_api

SUBFOLDER = 'genkai_media_folder'
_copy_lock = threading.Lock()


def import_reference(path):
    """Reuse media in ComfyUI roots; cache an immutable copy of external media."""
    path = Path(path).resolve(strict=True)
    kind = web_api.kind_for(path.name)
    if not kind or not path.is_file():
        raise ValueError('Unsupported media file.')
    annotated = None
    for label, root in [('input', folder_paths.get_input_directory()), ('output', folder_paths.get_output_directory()), ('temp', folder_paths.get_temp_directory())]:
        root = Path(root).resolve()
        if path.is_relative_to(root):
            annotated = f'{path.relative_to(root).as_posix()} [{label}]'
            break
    stat = path.stat()
    if annotated is None:
        stamp = hashlib.sha256(f'{path}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()[:24]
        cache = Path(folder_paths.get_input_directory()) / SUBFOLDER
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / (stamp + path.suffix.lower())
        with _copy_lock:
            if not target.is_file():
                partial = cache / f'{uuid4().hex}.part'
                try:
                    shutil.copyfile(path, partial)
                    partial.replace(target)
                finally:
                    partial.unlink(missing_ok=True)
        annotated = f'{SUBFOLDER}/{target.name} [input]'
    info = media_io.probe(annotated) if kind != 'picture' else {}
    if kind == 'picture':
        from PIL import Image
        with Image.open(media_io.resolve(annotated)) as image:
            info.update(width=image.width, height=image.height)
    return dict(info, kind=kind, file=annotated, name=path.name,
                folder_source=str(path), folder_version=f'{stat.st_size}:{stat.st_mtime_ns}',
                enabled=True, audio_mode='off')


def scan_folder(directory, recursive=False, offset=0, limit=24):
    raw = str(directory or '').strip().strip('"').strip("'")
    if not raw:
        raise ValueError('Enter a folder path on the ComfyUI machine.')
    root = Path(raw).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError('The path must point to a folder.')
    offset = max(0, int(offset))
    limit = max(1, min(256, int(limit)))
    cache = (Path(folder_paths.get_input_directory()) / SUBFOLDER).resolve()
    found, truncated = [], False
    for current, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not (Path(current)/d).is_symlink() and (Path(current)/d).resolve() != cache)
        for name in sorted(names, key=str.casefold):
            path = Path(current)/name
            if not web_api.kind_for(name) or path.is_symlink():
                continue
            real = path.resolve()
            if real.is_relative_to(root) and not real.is_relative_to(cache):
                found.append(real)
        if not recursive:
            break
    found.sort(key=lambda p: str(p.relative_to(root)).casefold())
    items, errors = [], []
    batch = found[offset:offset+limit]
    for path in batch:
        try:
            item = import_reference(path)
            item['name'] = str(path.relative_to(root))
            items.append(item)
        except (OSError, ValueError) as exc:
            errors.append(f'{path.name}: {exc}')
    next_offset = offset + len(batch)
    return {'directory': str(root), 'items': items, 'total': len(found),
            'next': next_offset if next_offset < len(found) else None,
            'truncated': truncated, 'errors': errors}


@PromptServer.instance.routes.post('/genkai/media_folder/scan')
@web_api._guard()
async def folder_scan(request):
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError('Expected a folder path.')
        result = await asyncio.to_thread(scan_folder, body.get('directory'), body.get('recursive') is True, body.get('offset', 0), body.get('limit', 24))
        return web.json_response(result)
    except (OSError, ValueError, TypeError) as exc:
        return web.json_response({'error': str(exc)}, status=400)


class GenkaiMediaFolder:
    CATEGORY = 'GENKAI/Media'
    DESCRIPTION = 'Browse folder media and drag thumbnails to and from H3 Media Loader. This gallery has no workflow output.'
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = 'load'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'folder_path': ('STRING', {'default': ''}),
            'recursive': ('BOOLEAN', {'default': False}),
            'media_state': ('STRING', {'default': '[]'}),
        }}

    def load(self, folder_path='', recursive=False, media_state='[]'):
        return ()


NODE_CLASS_MAPPINGS = {'GenkaiMediaFolder': GenkaiMediaFolder}
NODE_DISPLAY_NAME_MAPPINGS = {'GenkaiMediaFolder': 'Media Folder (genkai)'}
