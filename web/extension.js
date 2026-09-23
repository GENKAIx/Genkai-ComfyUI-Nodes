import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";
import {createViewer} from "./viewer.js";
import {applyTextReplacements} from "../../scripts/utils.js";
import {settingSchema, normalizeSettings} from "./settings.js";
import {createSaveControls} from "./save_controls.js";
import {createExecutionTiming} from "./execution_timing.js";

const executionTiming = createExecutionTiming(api);

const names = {
    GenkaiVideoPromptViewer: "PromptSync (genkai)",
    GenkaiVideoPromptViewerSave: "PromptSync + Save (genkai)",
    GENKAI_FolderSearch: "Folder Search (genkai)",
    ImageExpandWithFill: "Image Expand With Fill (genkai)",
};

app.registerExtension({
    name: "GENKAI.VideoPromptViewer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!names[nodeData.name]) return;
        const priorConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = priorConfigure?.apply(this, arguments);
            const title = this.title || names[nodeData.name];
            this.title = title.replace(/^GENKAI\s*[·:—-]\s*/i, "").replace(/\s*\(genkai\)\s*$/i, "").trim() + " (genkai)";
            if (nodeData.name === "GenkaiVideoPromptViewer" || nodeData.name === "GenkaiVideoPromptViewerSave") this.title = names[nodeData.name];
            return result;
        };
        if (nodeData.name !== "GenkaiVideoPromptViewer" && nodeData.name !== "GenkaiVideoPromptViewerSave") return;
        const schema = settingSchema(nodeData);
        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            // Run before ComfyUI's legacy forceInput migration, which otherwise
            // mistakes the extra DOM value for a hidden prompt and drops the FPS.
            const normalized = normalizeSettings(info, schema);
            const result = configure.call(this, normalized.info);
            if (normalized.reset) {
                app.extensionManager?.toast?.add({
                    severity: "warn", summary: names[nodeData.name],
                    detail: "Damaged saved settings were reset. Check frame rate, filename prefix and encoding settings before running.",
                    life: 15000,
                });
            }
            return result;
        };
        const serialized = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            const result = serialized?.apply(this, arguments);
            // Some frontend versions inspect widget.serialize, others inspect
            // widget.options.serialize. Also keep a named copy for future loads.
            const values = info.widgets_values ?? [];
            info.widgets_values = schema.map(field => values[this.widgets.findIndex(w => w.name === field.name)]);
            info.widgets_values_named = Object.fromEntries(schema.map((field, index) => [field.name, info.widgets_values[index]]));
            return result;
        };
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            this.properties ||= {};
            if (nodeData.name === "GenkaiVideoPromptViewerSave") {
                const prefix = this.widgets.find(w => w.name === "filename_prefix");
                prefix.serializeValue = () => applyTextReplacements(app, prefix.value);
                this.genkaiSaveControls = createSaveControls(this, schema);
            }
            this.genkaiViewer = createViewer({
                enablePromptStyles: true,
                enablePlaybackSettings: nodeData.name === "GenkaiVideoPromptViewerSave",
                resolveVideo: descriptor => api.apiURL(`/view?${new URLSearchParams({...descriptor})}`),
                resolveWaveform: descriptor => api.apiURL(`/genkai/audio-waveform?${new URLSearchParams({...descriptor})}`),
                preferences: this.properties.genkaiPreferences,
                onPreferences: value => { this.properties.genkaiPreferences = value; this.graph?.change(); },
            });
            const previewWidget = this.addDOMWidget("genkai_timeline", "GENKAI_VIDEO_READER", this.genkaiViewer.element, {
                serialize: false, hideOnZoom: false,
                getMinHeight: () => 420,
                getMaxHeight: () => Infinity,
            });
            previewWidget.serialize = false;
            this.setSize([1120, nodeData.name === "GenkaiVideoPromptViewerSave" ? 1100 : 860]);
            return result;
        };
        const executed = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = executed?.apply(this, arguments);
            const data = message?.genkai_preview?.[0];
            if (data) {
                if (nodeData.name === "GenkaiVideoPromptViewerSave") data.execution = executionTiming.capture();
                this.properties.genkaiPreview = data;
                this.genkaiViewer?.setData(data);
                this.setDirtyCanvas(true, true);
            }
            return result;
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = configured?.apply(this, arguments);
            this.genkaiViewer?.setPreferences(this.properties?.genkaiPreferences);
            this.genkaiSaveControls?.apply();
            if (this.properties?.genkaiPreview) this.genkaiViewer?.setData(this.properties.genkaiPreview);
            return result;
        };
        const removed = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this.genkaiViewer?.dispose();
            return removed?.apply(this, arguments);
        };
    },
});
