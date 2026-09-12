import fnmatch
import os


class AnyType(str):
    def __ne__(self, other):
        return False


ANY_TYPE = AnyType("*")


def search_folder(folder_path, pattern, recursive, full_path, include_directories, relative_filenames):
    if relative_filenames is True:
        relative_root = folder_path
    elif relative_filenames is False:
        relative_root = ""
    else:
        relative_root = relative_filenames
    entries = os.scandir(folder_path)

    try:
        for entry in entries:
            if fnmatch.fnmatch(entry.name, pattern):
                if entry.is_file() or (include_directories and entry.is_dir()):
                    if full_path:
                        yield entry.path
                    elif relative_root:
                        yield os.path.relpath(entry.path, relative_root)
                    else:
                        yield entry.name

            if entry.is_dir() and recursive:
                yield from search_folder(
                    entry.path,
                    pattern,
                    recursive,
                    full_path,
                    include_directories,
                    relative_root,
                )
    finally:
        entries.close()


class GenkaiFolderSearch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": (
                    "STRING",
                    {
                        "default": "/",
                        "defaultInput": False,
                        "tooltip": "Folder to search for files within",
                    },
                ),
                "search_mask": (
                    "STRING",
                    {
                        "default": "*.*",
                        "defaultInput": False,
                        "tooltip": "Pattern to match the found files against",
                    },
                ),
                "output_type": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "Full file list",
                        "label_off": "Current file",
                        "tooltip": "How the output should be returned, ALL files or one file at a time",
                    },
                ),
                "recursive": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Specifies whether subfolders should be scanned as well",
                    },
                ),
                "include_directories": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Specifies whether directories should be included in the results",
                    },
                ),
                "return_full_path": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Specifies whether the full file path should be returned or only the file name and extension",
                    },
                ),
                "relative_filenames": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Return filenames with their parent folder relative to the search directory",
                    },
                ),
                "infinite_loop": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "Loop forever",
                        "label_off": "Stop after last file",
                        "tooltip": "After the last result, continue again from the first result",
                    },
                ),
            },
            "optional": {
                "save_output_to": (
                    "STRING",
                    {
                        "default": "",
                        "defaultInput": False,
                        "tooltip": "Optional output file to save found files to",
                    },
                ),
            },
        }

    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("output",)
    OUTPUT_TOOLTIPS = ("All files found or the current file, based on Output_Type",)
    FUNCTION = "scan_folder"
    OUTPUT_NODE = True
    CATEGORY = "GENKAI nodes"
    DESCRIPTION = """Scans a folder using the same inputs and output behavior as Folder Search.

When Output_Type is Current file, one result is returned per execution. If Infinite_Loop is enabled, execution continues from the first result immediately after the final result instead of returning an empty string.
"""

    SCANNER = None
    OPTIONS = None
    FINISHED = True
    MODE = "w"

    @staticmethod
    def _scanner_options(kwargs):
        return dict(kwargs)

    def _reset(self, kwargs):
        self.SCANNER = search_folder(
            kwargs["folder_path"],
            kwargs["search_mask"],
            kwargs["recursive"],
            kwargs["return_full_path"],
            kwargs["include_directories"],
            kwargs["relative_filenames"],
        )
        self.OPTIONS = self._scanner_options(kwargs)
        self.FINISHED = False
        self.MODE = "reset"

    def scan_folder(self, **kwargs):
        print(
            ">> GENKAI FOLDER SCAN:",
            f"PATH='{kwargs['folder_path']}'",
            f"MASK='{kwargs['search_mask']}'",
            f"TYPE={kwargs['output_type']}",
            f"RECURSIVE={kwargs['recursive']}",
            f"FULL_PATH={kwargs['return_full_path']}",
            f"INCLUDE_DIRS={kwargs['include_directories']}",
            f"RELATIVE={kwargs['relative_filenames']}",
            f"INFINITE_LOOP={kwargs['infinite_loop']}",
            f"SAVE='{kwargs.get('save_output_to', '')}'",
        )

        options = self._scanner_options(kwargs)
        if self.FINISHED or options != self.OPTIONS:
            print(">> GENKAI FOLDER SCAN RESET!")
            self._reset(kwargs)

        if kwargs["output_type"]:
            result = list(self.SCANNER)
            self.FINISHED = True
            self.MODE = "w"
        else:
            result = next(self.SCANNER, None)

            if result is None and kwargs["infinite_loop"]:
                self._reset(kwargs)
                result = next(self.SCANNER, None)

            if result is None:
                print(">> FINAL FILE REACHED!")
                self.FINISHED = True
                return ("",)

            self.MODE = "w" if self.MODE == "reset" else "a+"

        save_output_to = kwargs.get("save_output_to", "")
        if save_output_to:
            lines = result if isinstance(result, list) else [result]
            with open(save_output_to, self.MODE, encoding="utf-8") as output_file:
                for line in lines:
                    output_file.write(f"{line}\n")

        return (result,)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "GENKAI_FolderSearch": GenkaiFolderSearch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GENKAI_FolderSearch": "Folder Search (genkai)",
}
