import json


def parse_prompts(value):
    entries = json.loads(value)
    if not isinstance(entries, list):
        raise ValueError("Prompt Bank expects an array of prompts.")
    result = []
    for index, item in enumerate(entries):
        if isinstance(item, str):
            item = {"id": f"legacy_{index}", "text": item}
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("text"), str):
            raise ValueError("Each prompt must contain an id and text.")
        result.append({"id": item["id"], "text": item["text"]})
    if len({item["id"] for item in result}) != len(result):
        raise ValueError("Prompt IDs must be unique within a Prompt Bank.")
    return result


class GenkaiPromptBank:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"prompts_json": ("STRING", {"default": '[""]'})}}

    RETURN_TYPES = ("GENKAI_PROMPTS",)
    RETURN_NAMES = ("PROMPTS",)
    FUNCTION = "run"
    CATEGORY = "GENKAI/Text"
    DESCRIPTION = "Keep separate prompts and send all of them to Prompt Merge through one connection."

    def run(self, prompts_json):
        return (parse_prompts(prompts_json),)


class GenkaiPromptMerge:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "rows_json": ("STRING", {"default": "{}"}),
                "separator": ("STRING", {"default": ","}),
            },
            "optional": {"prompts": ("GENKAI_PROMPTS",)},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("STRING",)
    FUNCTION = "run"
    CATEGORY = "GENKAI/Text"
    OUTPUT_NODE = True
    DESCRIPTION = "Enable and name prompts from a Prompt Bank. Join enabled, nonblank prompts in Bank order with your exact separator."

    def run(self, rows_json="{}", separator=",", prompts=None):
        settings = json.loads(rows_json)
        if not isinstance(settings, dict):
            raise ValueError("Prompt Merge expects an object with prompt settings.")
        items = prompts or []
        text = separator.join(item["text"] for item in items
                              if settings.get(item["id"], {}).get("enabled", True)
                              and item["text"].strip())
        return {"result": (text,), "ui": {"genkai_merge": [{"text": text, "items": items}]}}


NODE_CLASS_MAPPINGS = {"GenkaiPromptBank": GenkaiPromptBank, "GenkaiPromptMerge": GenkaiPromptMerge}
NODE_DISPLAY_NAME_MAPPINGS = {
    "GenkaiPromptBank": "Prompt Bank (genkai)",
    "GenkaiPromptMerge": "Prompt Merge (genkai)",
}
