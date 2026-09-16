"""GENKAI registration for the bundled MIT-licensed H3 media nodes."""
from .h3_media.nodes import MiniMaxH3MediaLoader, MiniMaxH3ReferenceSplitter
from .h3_media import web_api


class GenkaiMediaBank(MiniMaxH3MediaLoader):
    CATEGORY = "GENKAI/Media"


class GenkaiReferenceSplitter(MiniMaxH3ReferenceSplitter):
    CATEGORY = "GENKAI/Media"


NODE_CLASS_MAPPINGS = {
    "GenkaiMediaBank": GenkaiMediaBank,
    "GenkaiReferenceSplitter": GenkaiReferenceSplitter,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "GenkaiMediaBank": "H3 Media Loader (genkai)",
    "GenkaiReferenceSplitter": "H3 Reference Splitter (genkai)",
}
