# Adapted from Fantastic MiniMax H3 PromptBuilder 1.7.1.
# Copyright (c) 2026 Adudeguyman. MIT license: see LICENSE in this directory.

"""HTTP routes backing the Media Loader's drag-drop and file picker."""


import hashlib


import hmac


import json


import os


import re


import secrets


import time


from . import media_io


try:
    from server import PromptServer
    from aiohttp import web
except Exception:  # pragma: no cover - only outside ComfyUI
    PromptServer = None
    web = None


try:
    import folder_paths
except Exception:  # pragma: no cover
    folder_paths = None


SUBFOLDER = "genkai_h3_media"


_TOKEN = secrets.token_urlsafe(32)


TOKEN_HEADER = "X-Genkai-H3-Token"


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg"}


AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"}


def kind_for(name):
    ext = os.path.splitext(name)[1].lower()
    if ext in IMAGE_EXT:
        return "picture"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return None


def _safe(name):
    name = os.path.basename(name or "")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "upload"
    return name[:120]


def _target_dir():
    base = folder_paths.get_input_directory() if folder_paths else "input"
    path = os.path.join(base, SUBFOLDER)
    os.makedirs(path, exist_ok=True)
    return path


def _storage_base():
    """The user-data root every store hangs off: user dir, else output dir,
    else the pack dir (dev fallback — wiped on update, better than nothing)."""
    base = None
    if folder_paths is not None:
        for getter in ("get_user_directory", "get_output_directory"):
            fn = getattr(folder_paths, getter, None)
            if callable(fn):
                try:
                    base = fn()
                    break
                except Exception:
                    continue
    return base


def _preset_dir():
    """Presets live with the user's data so they survive extension updates."""
    base = _storage_base()
    if not base:
        base = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base, "genkai_h3_media_presets")
    os.makedirs(path, exist_ok=True)
    return path


def _pack_version():
    """Version from pyproject.toml, so the UI can report the running build.

    A bug report that says "1.5.4" is only useful if 1.5.4 means one thing;
    reading it from the file the registry publishes keeps them in step.
    """
    try:
        import tomllib
    except Exception:                       # Python < 3.11
        try:
            import tomli as tomllib
        except Exception:
            return "unknown"
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "pyproject.toml")
        with open(path, "rb") as fh:
            return str(tomllib.load(fh)["project"]["version"])
    except Exception:
        return "unknown"


def _host_port(value):
    """('host', port or None) from a Host header or an Origin's authority.

    Parsed by hand rather than with a URL library: a browser only ever sends
    `host[:port]` or `[ipv6]:port`, and anything else is refused rather
    than guessed at. Userinfo never appears in either header."""
    v = (value or "").strip().lower()
    if not v or "@" in v:
        return "", None
    if v.startswith("["):                       # [ipv6] or [ipv6]:port
        end = v.find("]")
        if end < 0:
            return "", None
        host, rest = v[1:end], v[end + 1:]
    else:
        host, sep, port = v.partition(":")
        rest = (":" + port) if sep else ""
    if not host:
        return "", None
    if not rest:
        return host, None
    if not rest.startswith(":") or not rest[1:].isdigit():
        return "", None
    return host, int(rest[1:])


def _same_authority(origin, host_header):
    """Does an Origin header name the host this request arrived at?

    `Origin: null` (an opaque or sandboxed origin) never matches. A default
    port left implicit on one side still matches the same port stated on
    the other, so `http://host` and `Host: host:80` agree."""
    origin = (origin or "").strip()
    if not origin or origin.lower() == "null":
        return False
    scheme, sep, rest = origin.partition("://")
    if not sep:
        return False
    o_host, o_port = _host_port(rest.split("/", 1)[0])
    h_host, h_port = _host_port(host_header)
    if not o_host or not h_host or o_host != h_host:
        return False
    default = 443 if scheme.strip().lower() == "https" else 80
    return (o_port or default) == (h_port or default)


def _contained(path, directory):
    """True when `path` resolves to a file strictly inside `directory`.

    _slug() already strips separators, so these paths cannot escape today —
    but that guarantee lives two functions away from the os.remove that
    depends on it. Asserting it again where the path is minted (and once more
    beside each destructive call) keeps the property local and survivable
    through refactors.
    """
    real = os.path.realpath(path)
    root = os.path.realpath(directory)
    return real.startswith(root + os.sep)


DRAFT_CAP = 25          # LRU by updated stamp; abandoned drafts fall off


def _canonical_items(items):
    """The comparable shape of a media set, order preserved because
    reference numbering is positional.

    Compares EFFECTIVE values, not literal ones. A field that is absent and
    a field that holds its default describe the same reference set, and the
    two turn up on opposite sides constantly: presets/load backfills
    audio_mode and probe data into items whose stored form never had them,
    so a freshly loaded preset would otherwise never match the file it came
    from — every load reported itself as edited."""
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        row = {"kind": it.get("kind"), "file": it.get("file"),
               "name": it.get("name") or it.get("file")}
        # Absent means on; only "enabled": false switches an item off.
        row["enabled"] = it.get("enabled") is not False
        # nodes.py reads a missing audio_mode as "paired"; so must this.
        if it.get("kind") == "video":
            row["audio_mode"] = it.get("audio_mode") or "paired"
        # Empty edits are the same as no edits.
        for k in ("trim", "crop", "size"):
            v = it.get(k)
            if v:
                row[k] = v
        for k in ("rotate", "mirror"):
            v = it.get(k)
            if v:
                row[k] = v
        out.append(row)
    return out


def _set_digest(items):
    blob = json.dumps(_canonical_items(items), sort_keys=True,
                      separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def _write_json(path, record):
    """Write via a sibling tmp file: a crash mid-write must not corrupt the
    file, because the readers treat corrupt JSON as "no entry" and the prompt
    or preset silently vanishes from its list."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=1)
    os.replace(tmp, path)


def _read_prompt(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _preset_path(name):
    safe = re.sub(r"[^A-Za-z0-9 ._-]+", "_", str(name or "")).strip(" ._-")
    if not safe:
        return None, None
    directory = _preset_dir()
    path = os.path.join(directory, safe[:80] + ".json")
    if not _contained(path, directory):
        return None, None
    return safe[:80], path


def _unique(directory, name):
    stem, ext = os.path.splitext(name)
    candidate = name
    if os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{stem}_{int(time.time() * 1000) % 100000}{ext}"
    return candidate


if PromptServer is not None and web is not None:

    routes = PromptServer.instance.routes


    def _cross_site(request):
        """Is this request provably from another web origin?

        ComfyUI core's origin_only_middleware rejects Sec-Fetch-Site:
        cross-site, but its Host/Origin comparison is deliberately limited to
        loopback hosts — on a `--listen` LAN install only the Sec-Fetch-Site
        half applies, and every route here mutates state, so each carries its
        own guard rather than inheriting one from core.

        Modern browsers always send Sec-Fetch-Site; when it is present it is
        authoritative. The Origin/Host comparison is the fallback for older
        browsers that omit it. Requests with neither header (curl, scripts,
        the queue itself) are not browser-mediated and pass.
        """
        sfs = (request.headers.get("Sec-Fetch-Site") or "").strip().lower()
        if sfs:
            return sfs == "cross-site"
        origin = (request.headers.get("Origin") or "").strip()
        if not origin:
            return False
        return not _same_authority(origin, request.headers.get("Host"))


    def _guard(json_only=True):
        """Route decorator: refuse cross-site or token-less requests before
        the handler runs.

        Three checks, cheapest first. The Sec-Fetch-Site/Origin test rejects
        anything a browser marks as another site. The token check rejects
        anything that did not first read /genkai/h3_media/token from this origin
        — which is every cross-site page, and every request that simply
        omits browser headers. `json_only` additionally requires
        Content-Type: application/json, which makes the request non-"simple"
        under CORS so a cross-origin page cannot send it without a preflight
        these routes never approve.
        """
        def wrap(handler):
            async def inner(request):
                if _cross_site(request):
                    return web.json_response(
                        {"error": "cross-site request refused"}, status=403)
                sent = request.headers.get(TOKEN_HEADER) or ""
                if not hmac.compare_digest(sent, _TOKEN):
                    return web.json_response(
                        {"error": "missing or stale session token",
                         "token_required": True}, status=403)
                if json_only:
                    ctype = (request.headers.get("Content-Type") or "") \
                        .split(";")[0].strip().lower()
                    if ctype != "application/json":
                        return web.json_response(
                            {"error": "expected Content-Type: application/json"},
                            status=415)
                return await handler(request)
            inner.__name__ = handler.__name__
            inner.__doc__ = handler.__doc__
            return inner
        return wrap


    @routes.get("/genkai/h3_media/token")
    async def token(request):
        """Hand the session token to same-origin callers only.

        The cross-site check matters here even though this is a GET: with
        `--enable-cors-header` a permissive CORS policy would otherwise let
        another origin read this response and defeat the token.
        """
        if _cross_site(request):
            return web.json_response(
                {"error": "cross-site request refused"}, status=403)
        return web.json_response({"token": _TOKEN},
                                 headers={"Cache-Control": "no-store"})


    @routes.post("/genkai/h3_media/upload")
    @_guard(json_only=False)
    async def upload(request):
        """Accept one file, store it under input/minimax_h3, return its metadata."""
        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"error": "expected multipart form data"},
                                     status=400)
        field = await reader.next()
        while field is not None and field.name != "file":
            field = await reader.next()
        if field is None:
            return web.json_response({"error": "no file field in request"}, status=400)

        original = field.filename or "upload"
        kind = kind_for(original)
        if kind is None:
            return web.json_response(
                {"error": f"unsupported file type: {os.path.splitext(original)[1]}"},
                status=400)

        directory = _target_dir()
        name = _unique(directory, _safe(original))
        path = os.path.join(directory, name)
        size = 0
        try:
            with open(path, "wb") as fh:
                while True:
                    chunk = await field.read_chunk()
                    if not chunk:
                        break
                    size += len(chunk)
                    fh.write(chunk)
        except Exception as exc:
            if os.path.exists(path):
                os.remove(path)
            return web.json_response({"error": f"write failed: {exc}"}, status=500)

        annotated = f"{SUBFOLDER}/{name} [input]"
        info = media_io.probe(annotated) if kind in ("video", "audio") else {}
        return web.json_response({
            "file": annotated,
            "name": name,
            "original": original,
            "kind": kind,
            "size": size,
            "duration": info.get("duration"),
            "has_audio": bool(info.get("has_audio")),
            "width": info.get("width"),
            "height": info.get("height"),
        })


    @routes.post("/genkai/h3_media/extract_audio")
    @_guard()
    async def extract_audio_route(request):
        """Write the trimmed audio of an existing item out as its own WAV.

        Decoding goes through media_io, so this inherits the same channel and
        scale handling as every other audio path in the pack.
        """
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)

        annotated = str(body.get("file") or "")
        if not annotated:
            return web.json_response({"error": "no file given"}, status=400)
        try:
            start = float(body.get("start") or 0.0)
        except (TypeError, ValueError):
            start = 0.0
        end = body.get("end")
        try:
            end = float(end) if end is not None else None
        except (TypeError, ValueError):
            end = None

        kind = kind_for(annotated)
        try:
            if kind == "video":
                data = media_io.extract_audio(annotated, start=start, end=end)
            else:
                data = media_io.load_audio(annotated, start=start, end=end)
        except Exception as exc:
            return web.json_response(
                {"error": f"couldn't read audio from that clip: {exc}"}, status=400)

        wave = data.get("waveform")
        rate = int(data.get("sample_rate") or 0)
        if wave is None or not rate:
            return web.json_response({"error": "that clip has no audio"}, status=400)

        try:
            import numpy as np

            arr = wave.detach().cpu().numpy() if hasattr(wave, "detach") else wave
            arr = np.asarray(arr)
            while arr.ndim > 2:                 # [1, C, N] -> [C, N]
                arr = arr[0]
            if arr.ndim == 1:
                arr = arr[None, :]
            if arr.shape[1] == 0:
                return web.json_response({"error": "that range is empty"}, status=400)
            peak = float(np.abs(arr).max()) or 1.0
            if peak > 1.0:                      # belt and braces; media_io guards too
                arr = arr / peak
            pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype("<i2")
            interleaved = pcm.T.reshape(-1)     # [C, N] -> L,R,L,R...
        except Exception as exc:
            return web.json_response({"error": f"conversion failed: {exc}"}, status=500)

        base = os.path.splitext(os.path.basename(annotated.split(" [")[0]))[0]
        span = f"{start:.2f}".replace(".", "-")
        directory = _target_dir()
        name = _unique(directory, _safe(f"{base}_audio_{span}s.wav"))
        path = os.path.join(directory, name)
        try:
            import wave as wavemod

            with wavemod.open(path, "wb") as fh:
                fh.setnchannels(int(arr.shape[0]))
                fh.setsampwidth(2)
                fh.setframerate(rate)
                fh.writeframes(interleaved.tobytes())
        except Exception as exc:
            if os.path.exists(path):
                os.remove(path)
            return web.json_response({"error": f"write failed: {exc}"}, status=500)

        out = f"{SUBFOLDER}/{name} [input]"
        info = media_io.probe(out)
        print(f"[MiniMaxH3] extracted audio -> {name} "
              f"({arr.shape[0]}ch {rate}Hz {arr.shape[1] / rate:.2f}s)")
        return web.json_response({
            "file": out, "name": name, "original": name, "kind": "audio",
            "duration": info.get("duration"), "has_audio": True,
        })


    @routes.post("/genkai/h3_media/bake")
    @_guard()
    async def bake(request):
        """Write a resized copy of a picture and hand back the new file.

        Explicit only: nothing calls this on upload or on render. The source
        file is left exactly as it was — the copy is a new entry in the input
        folder, so the original stays usable elsewhere.
        """
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)

        annotated = str(body.get("file") or "")
        try:
            cap = int(body.get("resize") or 0)
        except (TypeError, ValueError):
            cap = 0
        if not annotated:
            return web.json_response({"error": "no file given"}, status=400)
        has_edit = bool(body.get("crop") or body.get("mirror")
                        or int(body.get("rotate") or 0) % 360)
        if cap <= 0 and not has_edit:
            return web.json_response(
                {"error": "nothing to write: set a size, crop, rotation or "
                          "mirror first"}, status=400)

        try:
            from PIL import Image, ImageOps

            path = media_io.resolve(annotated)
            img = Image.open(path)
            img = ImageOps.exif_transpose(img).convert("RGB")
            was = img.size
            turn = int(body.get("rotate") or 0) % 360
            if turn in (90, 180, 270):
                img = img.rotate(-turn, expand=True)
            if body.get("mirror"):
                img = ImageOps.mirror(img)
            crop = body.get("crop")
            if isinstance(crop, dict):
                W, H = img.size
                x0 = max(0, min(W - 16, int(round(float(crop.get("x", 0)) * W))))
                y0 = max(0, min(H - 16, int(round(float(crop.get("y", 0)) * H))))
                x1 = min(W, max(x0 + 16,
                         int(round((float(crop.get("x", 0)) + float(crop.get("w", 1))) * W))))
                y1 = min(H, max(y0 + 16,
                         int(round((float(crop.get("y", 0)) + float(crop.get("h", 1))) * H))))
                if (x0, y0, x1, y1) != (0, 0, W, H):
                    img = img.crop((x0, y0, x1, y1))
            w, h = img.size
            # cap == 0 means "no size cap" — a crop-only copy. Without the
            # cap > 0 test the scale factor became 0 and every copy came out
            # as the 16px floor.
            if cap > 0 and max(w, h) > cap:
                k = cap / float(max(w, h))
                img = img.resize((max(16, int(round(w * k))),
                                  max(16, int(round(h * k)))), Image.LANCZOS)
        except Exception as exc:
            return web.json_response({"error": f"couldn't read that picture: {exc}"},
                                     status=400)

        base = os.path.splitext(os.path.basename(annotated.split(" [")[0]))[0]
        name = _unique(_target_dir(), _safe(f"{base}_{img.size[0]}x{img.size[1]}.png"))
        out_path = os.path.join(_target_dir(), name)
        try:
            img.save(out_path, "PNG")
        except Exception as exc:
            if os.path.exists(out_path):
                os.remove(out_path)
            return web.json_response({"error": f"couldn't write: {exc}"}, status=500)

        out = f"{SUBFOLDER}/{name} [input]"
        print(f"[MiniMaxH3] baked {was[0]}x{was[1]} -> {img.size[0]}x{img.size[1]} "
              f"as {name}")
        return web.json_response({
            "file": out, "name": name,
            "width": img.size[0], "height": img.size[1],
            "was": [was[0], was[1]],
        })


    @routes.get("/genkai/h3_media/capabilities")
    async def capabilities(request):
        caps = media_io.backends()
        caps["video"] = media_io.can_decode_video()
        caps["version"] = _pack_version()
        return web.json_response(caps)


    @routes.get("/genkai/h3_media/presets")
    async def list_presets(request):
        """Presets with their categories.

        Categories are a VIEW over one flat namespace, never folders: a
        prompt links to a preset by name and the filename is the name, so
        two presets sharing a name in different categories would collide on
        disk and make the link ambiguous. Same rule the prompt library
        follows."""
        entries, categories = [], set()
        base = _preset_dir()
        try:
            names = [f[:-5] for f in os.listdir(base) if f.endswith(".json")]
        except Exception:
            names = []
        for n in sorted(names, key=str.lower):
            data = _read_prompt(os.path.join(base, n + ".json")) or {}
            cat = (data.get("category") or "").strip()
            if cat:
                categories.add(cat)
            items = [i for i in (data.get("items") or []) if isinstance(i, dict)]
            entries.append({
                "name": n,
                "category": cat,
                "count": len(items),
                "counts": {k: sum(1 for i in items
                                  if i.get("kind") == k
                                  and i.get("enabled") is not False)
                           for k in ("picture", "video", "audio")},
            })
        return web.json_response({
            "presets": entries,
            # Kept so an older client (or a stale browser cache) still gets
            # a usable list rather than an empty picker.
            "names": [e["name"] for e in entries],
            "categories": sorted(categories, key=str.lower),
        })


    @routes.post("/genkai/h3_media/presets/save")
    @_guard()
    async def save_preset(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        name, path = _preset_path(body.get("name"))
        if not path:
            return web.json_response({"error": "give the preset a name"}, status=400)
        items = body.get("items")
        if not isinstance(items, list):
            return web.json_response({"error": "items must be a list"}, status=400)
        previous = _read_prompt(path) or {}
        # Absent category means "leave it alone" — re-saving a set from the
        # loader shouldn't silently strip the category someone filed it under.
        category = body.get("category")
        if category is None:
            category = previous.get("category") or ""
        record = {"version": 1, "items": items,
                  "category": str(category).strip()}
        try:
            _write_json(path, record)
        except Exception as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        return web.json_response({"name": name, "count": len(items),
                                  "category": record["category"]})


    @routes.post("/genkai/h3_media/presets/meta")
    @_guard()
    async def preset_meta(request):
        """Set one preset's category without touching its items.

        Without this the only way to file an existing preset is to load it
        and save it again, which is a lot of ceremony for a label — and it
        rewrites the items, so it can't be done safely from a picker."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        name, path = _preset_path(body.get("name"))
        if not path or not os.path.exists(path):
            return web.json_response({"error": "preset not found"}, status=404)
        data = _read_prompt(path)
        if not data:
            return web.json_response({"error": "preset unreadable"}, status=500)
        data["category"] = str(body.get("category") or "").strip()
        try:
            _write_json(path, data)
        except Exception as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        return web.json_response({"name": name, "category": data["category"]})


    @routes.post("/genkai/h3_media/presets/category")
    @_guard()
    async def preset_category(request):
        """Rename a category across every preset, or clear it (to = "")."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        src_cat = (body.get("from") or "").strip()
        dst_cat = (body.get("to") or "").strip()
        if not src_cat:
            return web.json_response({"error": "missing category"}, status=400)
        base = _preset_dir()
        changed = 0
        try:
            names = [f[:-5] for f in os.listdir(base) if f.endswith(".json")]
        except Exception:
            names = []
        for n in names:
            p = os.path.join(base, n + ".json")
            data = _read_prompt(p)
            if not data or (data.get("category") or "").strip() != src_cat:
                continue
            data["category"] = dst_cat
            try:
                _write_json(p, data)
                changed += 1
            except Exception:
                pass
        return web.json_response({"changed": changed})


    @routes.post("/genkai/h3_media/presets/match")
    @_guard()
    async def match_preset(request):
        """Which saved preset, if any, IS this media set?

        Asked server-side on purpose: the client would otherwise need its own
        digest implementation that has to agree with this one forever, and
        that kind of cross-language parity is where silent drift lives."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        items = body.get("items")
        if not isinstance(items, list):
            return web.json_response({"error": "items must be a list"}, status=400)
        want = _set_digest(items)
        base = _preset_dir()
        try:
            names = [f[:-5] for f in os.listdir(base) if f.endswith(".json")]
        except Exception:
            names = []
        for n in sorted(names, key=str.lower):
            data = _read_prompt(os.path.join(base, n + ".json")) or {}
            if _set_digest(data.get("items")) == want:
                return web.json_response({"name": n, "digest": want})
        return web.json_response({"name": None, "digest": want})


    @routes.post("/genkai/h3_media/presets/load")
    @_guard()
    async def load_preset(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        name, path = _preset_path(body.get("name"))
        if not path or not os.path.exists(path):
            return web.json_response({"error": "preset not found"}, status=404)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            return web.json_response({"error": f"unreadable preset: {exc}"},
                                     status=500)
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return web.json_response({"error": "preset has no item list"},
                                     status=500)
        # Report files that have since been deleted rather than failing later.
        kept, missing = [], []
        for item in items:
            target = item.get("file") if isinstance(item, dict) else None
            if not target:
                continue
            try:
                present = os.path.exists(media_io.resolve(target))
            except Exception:
                present = False     # resolve() now rejects out-of-bounds paths
            if present:
                kept.append(item)
            else:
                missing.append(item.get("name") or target)
        # Presets saved before dimensions/duration were stored carry items
        # with no width/height — the panel then shows thumbnails with no
        # aspect data and leans on per-image learners to fill the gaps.
        # Heal the data here instead: probe never raises, and items that
        # already carry their metadata cost nothing.
        for item in kept:
            kind = item.get("kind")
            needs = (not item.get("width") or not item.get("height")
                     or (kind in ("video", "audio") and not item.get("duration"))
                     or (kind == "video" and "has_audio" not in item))
            if needs:
                info = media_io.probe(item["file"])
                if not item.get("width") and info.get("width"):
                    item["width"] = info["width"]
                if not item.get("height") and info.get("height"):
                    item["height"] = info["height"]
                if not item.get("duration") and info.get("duration"):
                    item["duration"] = info["duration"]
                if kind == "video" and "has_audio" not in item:
                    item["has_audio"] = bool(info.get("has_audio"))
            # nodes.py treats a missing audio_mode as "paired"; make that
            # explicit so every client-side count agrees with what is sent.
            if kind == "video" and item.get("has_audio") \
                    and not item.get("audio_mode"):
                item["audio_mode"] = "paired"
        return web.json_response({"name": name, "items": kept,
                                 "missing": missing,
                                 "category": (data.get("category") or "").strip(),
                                 "digest": _set_digest(items)})


    @routes.post("/genkai/h3_media/presets/delete")
    @_guard()
    async def delete_preset(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "expected JSON body"}, status=400)
        name, path = _preset_path(body.get("name"))
        if not path or not os.path.exists(path):
            return web.json_response({"error": "preset not found"}, status=404)
        # The guarantee _preset_path gives is re-asserted here, beside the
        # destructive call it protects, so no refactor can separate them.
        if not _contained(path, _preset_dir()):
            return web.json_response({"error": "refused"}, status=400)
        try:
            os.remove(path)
        except Exception as exc:
            return web.json_response({"error": f"delete failed: {exc}"}, status=500)
        return web.json_response({"deleted": name})
