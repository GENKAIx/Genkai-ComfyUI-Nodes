import secrets
from datetime import datetime, timezone
from uuid import uuid4


MAX_SEED = 9_999_999_999


class GenkaiSeedSlots:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": MAX_SEED, "control_after_generate": False}),
                "lock_seed": ("BOOLEAN", {"default": False}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "draw"
    CATEGORY = "GENKAI/Seeds"
    DESCRIPTION = "A slot-machine seed generator. New seed on each run; lock to reuse a chosen seed."

    @classmethod
    def IS_CHANGED(cls, seed, lock_seed, **kwargs):
        return seed if lock_seed else float("nan")

    def draw(self, seed, lock_seed, unique_id=None, extra_pnginfo=None):
        selected = int(seed) if lock_seed else secrets.randbelow(MAX_SEED + 1)
        if extra_pnginfo is not None:
            extra_pnginfo.setdefault("genkai_seed_slots", {})[str(unique_id)] = selected
        event = {
            "seed": selected,
            "id": str(uuid4()),
            "at": datetime.now(timezone.utc).isoformat(),
            "awarded": not lock_seed,
        }
        return {"ui": {"seed_slots": [event]}, "result": (selected,)}


NODE_CLASS_MAPPINGS = {"GenkaiSeedSlots": GenkaiSeedSlots}
NODE_DISPLAY_NAME_MAPPINGS = {"GenkaiSeedSlots": "Seed Slots (genkai)"}
