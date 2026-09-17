# Media Folder (genkai)

A folder gallery for browsing pictures, videos and audio and dragging references to or from **H3 Media Loader (genkai)**. The gallery has no workflow output, splitter or presets.

1. Paste a folder path on the computer running ComfyUI and click **Load folder**, or press Enter. Enable **Subfolders** to include nested folders.
2. All files are loaded automatically in background batches. By default, the gallery shows 30 files per page.
3. Use **Settings** to choose the style, resize options and files per page. **Unlimited files per page** is disabled by default. Enable it to show every file on one scrollable page. The default style is **Obsidian**.
4. **Load files…**, **Unload media** and **Settings** are next to each other. Each picture has only a drag handle and a remove button; click its thumbnail for a larger preview. Files are always active, with no enable/disable switches.

Use the **All / Images / Videos / Audio** filter tags to choose what is displayed. Each tag shows its file count. Filtering keeps all files in the gallery, applies before pagination and is saved in the workflow. Video and audio cards have playback controls and duration labels; double-click a video for a larger preview. Switching filters stops playback. Browser playback depends on the file's codec; an unsupported preview does not prevent transferring the reference to H3 Media Loader.

Drag between nodes to copy references and their processing settings. Dropping onto an occupied slot replaces that reference; within one node, dragging swaps occupied slots or moves to an empty slot. H3 Media Loader still applies its own reference limits. Media Folder has no H3 selection limits.

The path, gallery contents and settings are stored in the workflow. Reloading the same folder updates matching references while keeping existing edits and references; changing the folder or Subfolders option replaces the gallery on the next load.

External media is copied into `ComfyUI/input/genkai_media_folder` for compatibility with H3 Media Loader. Media inside ComfyUI input/output/temp is reused. Removing thumbnails and unloading the gallery do not delete files on disk. Dragging into the gallery does not save files into the source folder. Symbolic links are skipped.

## Русский

Вставьте путь к папке и нажмите **Load folder** или Enter. **Subfolders** включает подпапки. Все файлы подгружаются автоматически и по умолчанию отображаются по 30 на странице.

В **Settings** находятся стиль, размер ноды и текста, а также настройка количества файлов на странице. По умолчанию **Files per page** — **30**, **Unlimited files per page** выключено, стиль — **Obsidian**. Включите галочку, чтобы показывать все файлы на одной странице с прокруткой.

У галереи нет выхода, сплиттера, пресетов и переключателей активности. У картинок остаются просмотр по клику, ручка переноса и крестик. Кнопки **Load files…**, **Unload media** и **Settings** расположены рядом.

Теги **All / Images / Videos / Audio** показывают все файлы, только картинки, видео или аудио. Рядом с каждым тегом указано количество файлов. Фильтр сохраняется в workflow и влияет только на отображение и перелистывание. У видео и аудио есть плеер и длительность; двойной клик по видео открывает увеличенный просмотр. При переключении фильтра воспроизведение останавливается.

Перетаскивание между Media Folder и H3 Media Loader копирует референс с настройками обработки, внутри одной ноды — меняет слоты местами. Исходные файлы не перемещаются и не удаляются. Обратное перетаскивание в галерею не записывает файл в исходную папку.
