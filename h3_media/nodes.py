# Adapted from Fantastic MiniMax H3 PromptBuilder 1.7.1.
# Copyright (c) 2026 Adudeguyman. MIT license: see LICENSE in this directory.

import json
from . import media_io

PICTURES = 9
VIDEOS = 3
VIDEO_AUDIOS = 3
AUDIOS = 3

def _media_names():
    """Ordered media slot names; index in this list + 1 == output slot index.

    Mirrors the native node's four groups: ref_images, ref_videos,
    ref_video_audios (the soundtrack paired with the same-numbered video),
    and ref_audios (standalone).
    """
    return (
        [f"picture_{i}" for i in range(1, PICTURES + 1)]
        + [f"video_{i}" for i in range(1, VIDEOS + 1)]
        + [f"video_audio_{i}" for i in range(1, VIDEO_AUDIOS + 1)]
        + [f"audio_{i}" for i in range(1, AUDIOS + 1)]
    )



class MiniMaxH3MediaLoader:
    """Drag-and-drop / file-picker loader for H3 reference media.

    Emits one `references` bundle for the Prompt Builder, plus individual
    pass-throughs so it can drive MiniMaxH3ReferenceToVideo on its own.
    """

    CATEGORY = "conditioning/video_models"
    DESCRIPTION = (
        "Load MiniMax H3 reference media by drag-and-drop or file picker. "
        "Wire 'references' to the Prompt Builder, and to the Reference Splitter "
        "when you also want individual slots for MiniMaxH3ReferenceToVideo. "
        "A video's soundtrack can be split off and paired with it automatically."
    )

    RETURN_TYPES = ("H3_REFS",)
    RETURN_NAMES = ("references",)
    FUNCTION = "load"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # JSON list of media items, written by the node's panel.
                "media_state": ("STRING", {"multiline": False, "default": "[]"}),
            },
            "hidden": {"prompt": "PROMPT", "unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def IS_CHANGED(cls, media_state="[]", **kwargs):
        return media_state

    @classmethod
    def VALIDATE_INPUTS(cls, media_state="[]", **kwargs):
        try:
            items = json.loads(media_state or "[]")
        except Exception:
            return "Media Loader state is corrupt; clear the node and re-add media."
        if not isinstance(items, list):
            return "Media Loader state is corrupt; clear the node and re-add media."
        pics = sum(1 for i in items if i.get("kind") == "picture")
        vids = sum(1 for i in items if i.get("kind") == "video")
        if pics > PICTURES:
            return f"{pics} pictures loaded; H3 accepts {PICTURES}."
        if vids > VIDEOS:
            return f"{vids} videos loaded; H3 accepts {VIDEOS}."
        return True

    # -- ordering ---------------------------------------------------------

    @staticmethod
    def _partition(items):
        """Split items into the four native groups, preserving list order.

        A video's split audio goes to the paired group (its <Audio N> is
        emitted just before its <Video N>) or to the standalone group,
        depending on the item's audio_mode.
        """
        pictures, videos, video_audios, audios = [], [], [], []
        for item in items:
            # Items switched off in the loader are kept in the list but never
            # reach the model, so the tag numbering closes up around them.
            if isinstance(item, dict) and item.get("enabled") is False:
                continue
            kind = item.get("kind")
            if kind == "picture":
                pictures.append(item)
            elif kind == "video":
                mode = item.get("audio_mode", "paired")
                has_audio = bool(item.get("has_audio"))
                videos.append(item)
                if has_audio and mode == "paired":
                    video_audios.append(item)
                else:
                    video_audios.append(None)
                if has_audio and mode == "standalone":
                    audios.append(item)
            elif kind == "audio":
                audios.append(item)
        return pictures, videos, video_audios, audios

    def load(self, media_state="[]", prompt=None, unique_id=None):
        try:
            items = json.loads(media_state or "[]")
        except Exception:
            items = []

        pictures, videos, video_audios, audios = self._partition(items)

        def _trim(i):
            t = i.get("trim") if isinstance(i, dict) else None
            if not isinstance(t, dict):
                return None, None
            def num(v):
                try:
                    v = float(v)
                    return v if v > 0 else None
                except (TypeError, ValueError):
                    return None
            return num(t.get("start")), num(t.get("end"))

        pic_t = [media_io.load_image(i["file"], crop=i.get("crop"),
                                     mirror=bool(i.get("mirror")),
                                     rotate=i.get("rotate") or 0,
                                     resize=i.get("resize") or 0)
                 for i in pictures[:PICTURES]]
        vid_t = [media_io.load_video_frames(i["file"], start=_trim(i)[0],
                 end=_trim(i)[1], crop=i.get("crop"),
                 mirror=bool(i.get("mirror")),
                 resize=i.get("resize"))
                 for i in videos[:VIDEOS]]
        vaud_t = [
            media_io.extract_audio(i["file"], start=_trim(i)[0], end=_trim(i)[1]) if i else None
            for i in video_audios[:VIDEO_AUDIOS]
        ]
        aud_t = []
        for i in audios[:AUDIOS]:
            if i.get("kind") == "video":
                aud_t.append(media_io.extract_audio(i["file"],
                    start=_trim(i)[0], end=_trim(i)[1]))
            else:
                aud_t.append(media_io.load_audio(i["file"],
                    start=_trim(i)[0], end=_trim(i)[1]))

        bundle = {
            "pictures": pic_t,
            "videos": vid_t,
            "video_audios": vaud_t,
            "audios": aud_t,
            "items": items,
        }

        def _brief(a):
            if a is None:
                return "None"
            if not (isinstance(a, dict) and "waveform" in a):
                return f"unexpected type {type(a).__name__}"
            try:
                w = a["waveform"]
                rms = float((w ** 2).mean() ** 0.5)
                return f"{list(w.shape)}@{a['sample_rate']}Hz rms={rms:.4f}"
            except Exception as exc:
                return f"unreadable ({exc})"

        print(f"[MiniMaxH3 Loader] {len(items)} item(s) in state -> "
              f"{len(pic_t)} picture(s), {len(vid_t)} video(s), "
              f"{sum(1 for x in vaud_t if x is not None)} soundtrack(s), "
              f"{len(aud_t)} standalone audio")
        for i, a in enumerate(vaud_t):
            if a is not None:
                print(f"[MiniMaxH3 Loader]   video_audio_{i+1}: {_brief(a)}")
        for i, a in enumerate(aud_t):
            print(f"[MiniMaxH3 Loader]   audio_{i+1}: {_brief(a)}")

        return (bundle,)



def _pad(seq, n):
    return list(seq or []) + [None] * (n - len(seq or []))



class MiniMaxH3ReferenceSplitter:
    """Fan a `references` bundle out into individual slots.

    Keeps the Media Loader short: add this only when you want to wire media
    straight into MiniMaxH3ReferenceToVideo. Slot order matches the tags the
    Prompt Builder shows — video_audio_N is the soundtrack of video_N.
    """

    CATEGORY = "conditioning/video_models"
    DESCRIPTION = (
        "Split a MiniMax H3 references bundle into individual picture / video / "
        "video_audio / audio slots for MiniMaxH3ReferenceToVideo."
    )
    RETURN_TYPES = (
        ("IMAGE",) * PICTURES
        + ("IMAGE",) * VIDEOS
        + ("AUDIO",) * VIDEO_AUDIOS
        + ("AUDIO",) * AUDIOS
    )
    RETURN_NAMES = tuple(_media_names())
    FUNCTION = "split"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"references": ("H3_REFS",)}}

    def split(self, references=None):
        b = references or {}
        return (
            tuple(_pad(b.get("pictures"), PICTURES))
            + tuple(_pad(b.get("videos"), VIDEOS))
            + tuple(_pad(b.get("video_audios"), VIDEO_AUDIOS))
            + tuple(_pad(b.get("audios"), AUDIOS))
        )
