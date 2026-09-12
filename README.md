<a name="english"></a>

**English** | [Русский](#russian)

# Genkai ComfyUI Nodes

A custom node pack for **ComfyUI** by [GENKAI](https://github.com/GENKAIx): synchronized video and prompt playback, video saving, file search, and image canvas expansion.

The node interface is in English. No additional models or cloud services are required.

## PromptSync

https://github.com/user-attachments/assets/8b462f83-214d-4984-9c3d-f86ad55bd60a

Watch a generated video alongside its original timed prompt. Check whether actions, camera cuts, and dialogue happen at the intended moments.

- **Left:** video player, clickable timeline markers, and an audio waveform.
- **Right:** the original prompt, preserving its order, spacing, and line breaks. Markdown remains part of the original text.
- The current timed section is highlighted in **gold**; general camera, style, lighting, and sound directions are shown in **blue**.
- Optional auto-scroll follows playback.
- Click a time marker or the waveform to seek through the video.
- Drag the node's bottom-right corner to make more room for the player and prompt.

### Connections

Connect text to `prompt` and **one** video source:

| Input | Source | Behavior |
| --- | --- | --- |
| `video` | A `VIDEO` output, such as Load Video | Creates a temporary MP4 preview, using the source video's audio. |
| `images` | An `IMAGE` frame batch | Creates a temporary MP4 at the selected `fps`; connect `audio` to include sound. |
| `filenames` | VHS Video Combine's `Filenames` output | Reuses the saved video without encoding it again. |

`fps` only applies to `images`. In this version, the separate `audio` input is used when assembling image frames; `video` and `filenames` play the audio already present in the video.

The waveform is decoded locally from the actual audio. A missing audio track and a silent track are labeled separately. Temporary previews may become unavailable after the `temp` directory is cleared.

## PromptSync + Save

![PromptSync + Save node with video preview, timed prompt, and audio waveform](docs/images/promptsync-save.png)

A separate output node that combines the PromptSync viewer with video saving through **VHS Video Combine**.

Connect `prompt` and one source: `images`, `video`, or `filenames`. For latents on `images`, also connect `vae`. The `audio` input adds sound to image frames or overrides the source video's audio.

Each completed save keeps **one final MP4**. Metadata is embedded in the video: no separate metadata PNG or silent intermediate remains alongside the result. If neither the source nor the `audio` input provides sound, the result has no audio track.

The `Filenames` output is compatible with `VHS_FILENAMES` and contains only the final video's path. Previously saved results are not deleted.

### Save settings

| Setting | Purpose |
| --- | --- |
| `frame_rate` | Output FPS. Match an existing video's original FPS to preserve its speed and prompt timing. |
| `loop_count` | Repetition count, following VHS behavior. Default: `0`. |
| `filename_prefix` | Filename and subfolder relative to `output` or `temp`. Date tokens such as `GENKAI/%date:yyyy-MM-dd%/%date:hhmmss%` work when queued from the ComfyUI interface. |
| `format` | MP4 with H.264 or H.265. H.264 is preferred for browser playback compatibility. |
| `pix_fmt` | `yuv420p` or `yuv420p10le`; supported combinations depend on the codec and FFmpeg build. |
| `crf` | Compression level. Lower values mean higher quality and larger files. Default: `19`. |
| `save_metadata` | Always enabled. Embeds the available workflow, generation parameters, and original timed prompt. |
| `trim_to_audio` | Trims the video to audio using VHS. |
| `pingpong` | Plays the frame sequence forward and backward. |
| `save_output` | `true`: save in `output`; `false`: save in `temp`. |

The original timed prompt is stored as `genkai_timed_prompt` metadata. Existing videos are decoded and encoded again when saved. Looping and `pingpong` change the duration without automatically rewriting the prompt's timestamps.

### VHS Batch Manager

The `meta_batch` input supports processing image/latent batches in parts. Set `loop_count=0` and `pingpong=false`.

**Automatic requeue requires support in VHS.** In VHS versions where `requeue_workflow` in `videohelpersuite/utils.py` only counts `VHS_VideoCombine` output nodes, add `GenkaiVideoPromptViewerSave` to that list. This package does not patch VHS automatically. Ordinary saves without `meta_batch` do not need this change. Check compatibility again after updating VHS.

## Folder Search

![Folder Search node and its file scanning settings](docs/images/folder-search.png)

Find files in a directory and pass the results to the next node. Useful for processing a collection of images, videos, or other files one at a time.

- `folder_path`: directory to search.
- `search_mask`: a pattern such as `*.mp4`, `*.png`, or `*.*`.
- `output_type`: return the entire list (`Full file list`) or one path per execution (`Current file`).
- `recursive`: include subfolders.
- `include_directories`: include directories in the results.
- `return_full_path`: return absolute paths.
- `relative_filenames`: return paths relative to the search directory when full paths are disabled.
- `infinite_loop`: immediately return to the first file after the last result in single-file mode.
- `save_output_to`: optional text file for writing the found paths.

The `output` contains a list or a string, depending on the mode. Without `infinite_loop`, the node returns an empty string after the last result; the next execution starts a new pass. It advances when executed, but does not queue ComfyUI runs by itself. Results follow filesystem traversal order without additional sorting.

## Image Expand With Fill

![Image Expand With Fill node with padding and fill settings](docs/images/image-expand-with-fill.png)

Expand the canvas by adding pixels on the `left`, `right`, `top`, and `bottom`. Works with individual images and `IMAGE` batches.

- `stretch_fill=true`: extend the image's border pixels outward.
- `stretch_fill=false`: fill the added area with zeros, producing black borders for ordinary RGB images.
- `image` output: the expanded image.

The original image area is not resized. This node does not perform generative outpainting or invent new details. Expansion converts through an 8-bit image; with all padding values set to zero, the input is returned without this conversion.

## Installation

Run this inside `ComfyUI/custom_nodes`:

```bash
git clone https://github.com/GENKAIx/Genkai-ComfyUI-Nodes.git
```

Restart ComfyUI and refresh your browser with **Ctrl+F5**. Search for the nodes by name. Viewers are in `GENKAI/Video`; the other nodes are in `GENKAI nodes`.

Use a current ComfyUI installation with `VIDEO` and `comfy_api.latest` support. The pack uses PyTorch, NumPy, PyAV, and aiohttp from the ComfyUI environment.

For **PromptSync + Save**, also install [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) and its dependencies. VHS Video Combine handles encoding, and FFmpeg must support the selected codec. The standard PromptSync viewer only needs VHS when using a `VHS_FILENAMES` source.

If you already have the pack installed as `GENKAI_nodes`, update or replace that installation. Do not keep two active copies: they register the same node identifiers.

## Supported timing syntax

Both viewers share the same parser. It recognizes common MiniMax H3, Seedance, and other video prompt structures through explicit time cues, independently of the model's name.

Examples:

```text
0.0–2.5 sec: A character enters the room.
2.5–6.0 sec: The camera moves closer.

Camera:
Soft cinematic light, slow movement.
```

```text
SHOT 1 (00:00–00:04) — Opening
A flame appears.

SHOT 2 (00:04–00:08) — Orbit
The camera circles the character.
```

```json
[
  {"start": 0, "end": 4, "prompt": "A flame appears."},
  {"start_time": "00:04", "duration": 4, "prompt": "The camera circles the character."}
]
```

Other supported forms include `MM:SS` and `HH:MM:SS` timestamps, decimal seconds with a dot or comma, Markdown headings and tables, numbered shots, `At` / `From` cues, H3 `[Shot N]` blocks, and JSON `timestamp` / `time_range` fields.

General sections such as `Camera`, `Lighting`, `Style`, `Effects`, `Audio`, `overall_soundscape`, and `non_diegetic_music` are separated from actions using the text's structure. For predictable results, introduce a global section after a blank line at the same indentation level as the shot headings. Indented directions inside a shot remain part of that shot.

Parsing is rule-based: ambiguous text without clear boundaries can be misclassified. A model name alone does not guarantee support for every prompt it produces. Untimed prompts are displayed in full without invented scene durations.

## Updates and troubleshooting

Run `git pull` inside the installed pack directory, restart ComfyUI, and refresh your browser with **Ctrl+F5**.

- **NaN or shifted fields after loading an old workflow:** the current version fixes settings serialization. If previous values have already been lost, defaults are restored with a notification. Check FPS, filename prefix, and encoding settings before running.
- **Video does not play:** try H.264 with `yuv420p` and check that the source file still exists.
- **No waveform:** check that the resulting video contains an audio track.
- **Video source error:** connect only one of `images`, `video`, or `filenames`.
- **Save error:** check VideoHelperSuite, codec availability, and that `filename_prefix` stays inside `output`/`temp`.

More details: [PromptSync technical notes](README_VideoPromptViewer.md).

## Credits

- [ComfyUI](https://github.com/Comfy-Org/ComfyUI): runtime, graph, and data types.
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite): video encoding for PromptSync + Save.

Pack author: **GENKAI** · [GitHub](https://github.com/GENKAIx)

---

<a name="russian"></a>

[English](#english) | **Русский**

# Genkai ComfyUI Nodes

Авторский пак кастомных нод для **ComfyUI** от [GENKAI](https://github.com/GENKAIx): просмотр видео с синхронизированным промптом, сохранение видео, поиск файлов и расширение изображения.

Интерфейс нод — на английском. Дополнительные модели и облачные сервисы не требуются.

## PromptSync

https://github.com/user-attachments/assets/8b462f83-214d-4984-9c3d-f86ad55bd60a

Просмотрщик для сопоставления сгенерированного видео и промпта с таймингами. Помогает проверить, совпадают ли действия, смены планов и реплики с заданными моментами.

- Слева — видео, таймлайн с кликабельными метками и звуковая волна.
- Справа — исходный промпт с сохранением порядка, пробелов и переносов строк. Markdown остаётся частью исходного текста.
- Текущий временной фрагмент подсвечивается золотым; общие указания по камере, стилю, свету и звуку — синим.
- Автопрокрутка следует за воспроизведением; её можно отключить.
- Нажатие на метку времени или звуковую волну перематывает видео.
- Размер ноды можно менять за нижний правый угол, увеличивая пространство для видео и промпта.

### Подключение

Подайте текст в `prompt` и подключите **один** источник видео:

| Вход | Источник | Поведение |
| --- | --- | --- |
| `video` | Нода, выдающая `VIDEO`, например Load Video | Создаётся временный MP4 для просмотра; используется звук исходного видео. |
| `images` | Последовательность кадров `IMAGE` | Кадры собираются во временный MP4 с частотой `fps`; звук можно подать через `audio`. |
| `filenames` | Выход `Filenames` из VHS Video Combine | Просматривается уже сохранённый видеофайл, без повторного кодирования. |

`fps` применяется только к входу `images`. Отдельный `audio` в этой версии используется при сборке кадров; для `video` и `filenames` воспроизводится звук самого видео.

Звуковая волна строится локально по реальному аудио. Отсутствие аудиодорожки и дорожка с тишиной обозначаются отдельно. Временные файлы могут стать недоступны после очистки папки `temp`.

## PromptSync + Save

![PromptSync + Save](docs/images/promptsync-save.png)

Отдельная выходная нода с тем же просмотрщиком и сохранением видео через **VHS Video Combine**.

Подключите `prompt` и один источник: `images`, `video` или `filenames`. Для латентов на входе `images` подключите `vae`. Вход `audio` добавляет звук к кадрам или заменяет звук исходного видео.

После завершения сохраняется **один итоговый MP4**. Метаданные встроены в видео: отдельная PNG с метаданными и промежуточное видео без звука не остаются рядом с результатом. Если у источника нет звука и вход `audio` не подключён, итоговое видео будет без звука.

Выход `Filenames` совместим с `VHS_FILENAMES` и содержит путь только к итоговому видео. Ранее сохранённые результаты не удаляются.

### Настройки сохранения

| Параметр | Назначение |
| --- | --- |
| `frame_rate` | Частота кадров результата. Для готового видео задайте исходный FPS, чтобы сохранить скорость и соответствие таймингам. |
| `loop_count` | Количество повторов в соответствии с поведением VHS. По умолчанию — `0`. |
| `filename_prefix` | Имя и подпапка относительно `output` или `temp`. Поддерживаются шаблоны даты, например `GENKAI/%date:yyyy-MM-dd%/%date:hhmmss%`, при запуске из интерфейса ComfyUI. |
| `format` | MP4 с H.264 или H.265. Для совместимости с браузерным плеером предпочтителен H.264. |
| `pix_fmt` | Формат пикселей: `yuv420p` или `yuv420p10le`; доступность комбинации зависит от кодека и FFmpeg. |
| `crf` | Уровень сжатия: меньшее значение повышает качество и размер файла. По умолчанию — `19`. |
| `save_metadata` | Всегда включено. Встраивает доступный workflow, параметры генерации и исходный тайминговый промпт. |
| `trim_to_audio` | Подрезка видео по аудио средствами VHS. |
| `pingpong` | Воспроизведение последовательности вперёд и обратно. |
| `save_output` | `true` — сохранить в `output`; `false` — сохранить в `temp`. |

Исходный тайминговый промпт записывается в метаданные как `genkai_timed_prompt`. Готовое видео при сохранении декодируется и кодируется заново. Повторы и `pingpong` меняют длительность, но не переписывают тайминги в тексте автоматически.

### VHS Batch Manager

Вход `meta_batch` предусмотрен для последовательной обработки кадров/латентов. Для него нужны `loop_count=0` и `pingpong=false`.

**Автоматическая постановка следующих частей в очередь требует совместимости со стороны VHS.** В версиях VHS, где `requeue_workflow` в `videohelpersuite/utils.py` считает только выходные ноды `VHS_VideoCombine`, в этот список нужно добавить `GenkaiVideoPromptViewerSave`. Этот репозиторий не изменяет файлы VHS автоматически; обычное сохранение без `meta_batch` такой правки не требует. После обновления VHS совместимость нужно проверить повторно.

## Folder Search

![Folder Search](docs/images/folder-search.png)

Ищет файлы в выбранной папке и передаёт результаты дальше по воркфлоу. Подходит для последовательной обработки набора изображений, видео или других файлов.

- `folder_path` — папка поиска.
- `search_mask` — маска, например `*.mp4`, `*.png` или `*.*`.
- `output_type` — весь список (`Full file list`) или один путь за выполнение (`Current file`).
- `recursive` — поиск во вложенных папках.
- `include_directories` — включение папок в результаты.
- `return_full_path` — выдача полного пути.
- `relative_filenames` — путь относительно папки поиска, если полный путь выключен.
- `infinite_loop` — после последнего файла сразу вернуться к первому в режиме по одному файлу.
- `save_output_to` — необязательный текстовый файл для записи найденных путей.

Выход `output` содержит список или строку в зависимости от режима. Без `infinite_loop` после последнего результата возвращается пустая строка; следующий запуск начинает новый проход. Нода выдаёт следующий файл при очередном выполнении, но сама не запускает очередь ComfyUI. Порядок результатов соответствует обходу файловой системы, без дополнительной сортировки.

## Image Expand With Fill

![Image Expand With Fill](docs/images/image-expand-with-fill.png)

Увеличивает холст, добавляя указанное число пикселей слева (`left`), справа (`right`), сверху (`top`) и снизу (`bottom`). Работает с одиночным изображением и пачкой `IMAGE`.

- `stretch_fill=true` — продолжает крайние пиксели изображения наружу.
- `stretch_fill=false` — заполняет добавленную область нулями: для обычного RGB-изображения это чёрные поля.
- Выход `image` — изображение с расширенным холстом.

Исходная область не масштабируется. Нода не выполняет генеративный outpainting и не дорисовывает новые детали. При расширении используется преобразование через 8-битное изображение; при нулевых полях вход возвращается без этого преобразования.

## Установка

В папке `ComfyUI/custom_nodes` выполните:

```bash
git clone https://github.com/GENKAIx/Genkai-ComfyUI-Nodes.git
```

Перезапустите ComfyUI и обновите страницу браузера через **Ctrl+F5**. Ноды доступны через поиск по названию; просмотрщики находятся в категории `GENKAI/Video`, остальные — в `GENKAI nodes`.

Используйте актуальную установку ComfyUI с поддержкой типа `VIDEO` и `comfy_api.latest`. Пак использует библиотеки среды ComfyUI: PyTorch, NumPy, PyAV и aiohttp.

Для **PromptSync + Save** дополнительно установите [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) и его зависимости. Кодирование выполняет VHS Video Combine; FFmpeg должен поддерживать выбранный кодек. Для обычного PromptSync VHS нужен только при использовании источника `VHS_FILENAMES`.

Если пак уже установлен под именем `GENKAI_nodes`, обновляйте существующую установку или замените её новой. Не оставляйте одновременно две активные копии: у них одинаковые идентификаторы нод.

## Какие тайминги понимает PromptSync

Обе версии используют один разборщик. Он распознаёт распространённые текстовые структуры промптов MiniMax H3, Seedance и других генераторов по явным временным меткам, независимо от названия модели.

Примеры поддерживаемой записи:

```text
0.0–2.5 sec: A character enters the room.
2.5–6.0 sec: The camera moves closer.

Camera:
Soft cinematic light, slow movement.
```

```text
SHOT 1 (00:00–00:04) — Opening
A flame appears.

SHOT 2 (00:04–00:08) — Orbit
The camera circles the character.
```

```json
[
  {"start": 0, "end": 4, "prompt": "A flame appears."},
  {"start_time": "00:04", "duration": 4, "prompt": "The camera circles the character."}
]
```

Также поддерживаются метки `MM:SS` и `HH:MM:SS`, десятичные секунды с точкой или запятой, Markdown-заголовки и таблицы, нумерованные сцены, конструкции `At` / `From`, блоки H3 `[Shot N]` и JSON-поля `timestamp` / `time_range`.

Общие разделы вроде `Camera`, `Lighting`, `Style`, `Effects`, `Audio`, `overall_soundscape` и `non_diegetic_music` отделяются от сцен по структуре текста. Для предсказуемого результата начинайте общий раздел после пустой строки, на том же уровне отступа, что и заголовки сцен. Указания с отступом внутри сцены остаются частью сцены.

Разбор основан на правилах: двусмысленный текст без явных границ может быть распознан неточно. Название модели само по себе не гарантирует поддержку любого её промпта. Промпт без таймингов отображается целиком, без выдуманных временных отрезков.

## Обновление и устранение проблем

В папке установленного пака выполните `git pull`, перезапустите ComfyUI и обновите браузер через **Ctrl+F5**.

- **NaN или сдвинутые поля после открытия старой схемы:** текущая версия исправляет сериализацию параметров. Если прежние значения уже потеряны, они сбрасываются к стандартным с уведомлением; проверьте FPS, имя файла и параметры кодирования перед запуском.
- **Видео не воспроизводится:** попробуйте H.264 с `yuv420p` и проверьте, что исходный файл ещё существует.
- **Звуковая волна отсутствует:** убедитесь, что итоговое видео содержит аудиодорожку.
- **Ошибка источника:** подключайте только один из входов `images`, `video`, `filenames`.
- **Ошибка сохранения:** проверьте установку VideoHelperSuite, доступность выбранного кодека и путь `filename_prefix` внутри `output`/`temp`.

Подробнее о просмотрщиках на английском: [PromptSync technical notes](README_VideoPromptViewer.md).

## Используемые проекты

- [ComfyUI](https://github.com/Comfy-Org/ComfyUI) — среда выполнения, граф и типы данных.
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) — кодирование видео для PromptSync + Save.

Автор пака: **GENKAI** · [GitHub](https://github.com/GENKAIx)
