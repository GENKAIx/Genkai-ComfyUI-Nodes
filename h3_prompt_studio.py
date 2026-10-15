"""MiniMax H3 prompt editor: the runtime contract is ordinary prompt text."""


class GenkaiH3PromptStudio:
    CATEGORY = "GENKAI/Text"
    DESCRIPTION = (
        "Write MiniMax H3 prompts with visual sections, timing, reference previews "
        "and bilingual film-term hints. Connect H3 Media Loader references for "
        "authoring; the output remains the exact prompt text as STRING."
    )
    FUNCTION = "run"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "default": "", "dynamicPrompts": True}),
            },
            # The editor reads the loader's saved media_state in the graph.
            # Neither the loader's decoded media nor its output is needed to
            # pass through the prompt, so keep this link out of execution.
            "optional": {"references": ("H3_REFS", {"rawLink": True, "lazy": True})},
        }

    def check_lazy_status(self, prompt, references=None):
        return []

    def run(self, prompt, references=None):
        return (prompt,)


NODE_CLASS_MAPPINGS = {"GenkaiH3PromptStudio": GenkaiH3PromptStudio}
NODE_DISPLAY_NAME_MAPPINGS = {"GenkaiH3PromptStudio": "H3 Prompt Studio (genkai)"}
