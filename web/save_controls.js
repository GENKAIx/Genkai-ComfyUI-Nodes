export function createSaveControls(node, schema) {
    const sound = node.addWidget("toggle", "Sound only on hover", true, value => {
        node.properties.genkaiPreferences = {...node.properties.genkaiPreferences, soundOnHover: value};
        node.genkaiViewer?.setPreferences(node.properties.genkaiPreferences);
        node.graph?.change();
    }, {serialize: false});
    sound.serialize = false;
    sound.options.on = "Hover";
    sound.options.off = "Always";
    const repeat = node.addWidget("toggle", "Repeat preview", true, value => {
        node.properties.genkaiPreferences = {...node.properties.genkaiPreferences, repeatPreview: value};
        node.genkaiViewer?.setPreferences(node.properties.genkaiPreferences);
        node.graph?.change();
    }, {serialize: false});
    repeat.serialize = false;
    repeat.options.on = "Loop";
    repeat.options.off = "Once";
    const toggle = node.addWidget("button", "Save settings", null, () => {
        node.properties.genkaiSaveSettingsOpen = !node.properties.genkaiSaveSettingsOpen;
        apply(); node.graph?.change();
    }, {serialize: false});
    toggle.serialize = false;
    const fields = node.widgets.filter(widget => schema.some(field => field.name === widget.name) || widget === sound || widget === repeat)
        .map(widget => ({widget, type: widget.type, computeSize: widget.computeSize, draw: widget.draw}));
    function apply() {
        const open = node.properties.genkaiSaveSettingsOpen === true;
        sound.value = node.properties.genkaiPreferences?.soundOnHover !== false;
        repeat.value = node.properties.genkaiPreferences?.repeatPreview !== false;
        toggle.name = open ? "▾ Hide save settings" : "▸ Save settings";
        for (const field of fields) {
            const {widget} = field;
            widget.type = open ? field.type : "converted-widget";
            if (open) {
                if (field.computeSize) widget.computeSize = field.computeSize; else delete widget.computeSize;
                if (field.draw) widget.draw = field.draw; else delete widget.draw;
            } else {
                widget.computeSize = () => [0, -4];
                widget.draw = () => {};
            }
        }
        node.setSize(node.size);
        node.setDirtyCanvas(true, true);
    }
    apply();
    return {apply};
}
