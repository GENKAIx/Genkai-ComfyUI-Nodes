"""A workflow-saved selector that emits one ordinary FLOAT value."""


class GenkaiFloatPresets:
    CATEGORY = "GENKAI/Utilities"
    DESCRIPTION = (
        "Choose a saved number with one click. Click a number to edit it."
    )
    FUNCTION = "select"
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("value",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected": ("FLOAT", {
                    "default": 5.0, "min": -1_000_000_000.0,
                    "max": 1_000_000_000.0, "step": 0.01,
                    "round": 0.000001,
                }),
            },
        }

    def select(self, selected):
        return (float(selected),)


NODE_CLASS_MAPPINGS = {"GenkaiFloatPresets": GenkaiFloatPresets}
NODE_DISPLAY_NAME_MAPPINGS = {"GenkaiFloatPresets": "Float Presets (genkai)"}
