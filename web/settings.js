// Keep settings separate from the preview DOM widget and legacy forceInput slots.
export function settingSchema(nodeData) {
    return Object.entries(nodeData.input.required).filter(([, definition]) => !definition[1]?.forceInput)
        .map(([name, [type, options = {}]]) => ({
            name, type, ...options, default: options.default ?? (Array.isArray(type) ? type[0] : undefined),
        }));
}

function valid(value, field) {
    if (Array.isArray(field.type)) return field.type.includes(value);
    if (field.type === "STRING") return typeof value === "string";
    if (field.type === "BOOLEAN") return typeof value === "boolean";
    if (field.type === "FLOAT" || field.type === "INT") {
        return typeof value === "number" && Number.isFinite(value)
            && (field.type !== "INT" || Number.isInteger(value))
            && (field.min === undefined || value >= field.min)
            && (field.max === undefined || value <= field.max);
    }
    return false;
}

export function normalizeSettings(info, schema) {
    const positional = info.widgets_values ?? [];
    const named = info.widgets_values_named;
    const candidates = [
        named && schema.map(field => named[field.name]),
        positional.slice(0, schema.length),
        // Older ComfyUI workflows could serialize a hidden prompt before the settings.
        typeof positional[0] === "string" && positional.length === schema.length + 1
            ? positional.slice(1) : null,
    ];
    const recovered = candidates.find(values => values?.length === schema.length
        && schema.every((field, index) => valid(values[index], field)));
    const values = recovered ?? schema.map(field => field.default);
    return {
        reset: !recovered && (positional.length > 0 || !!named),
        info: {...info, widgets_values: values,
            widgets_values_named: Object.fromEntries(schema.map((field, index) => [field.name, values[index]]))},
    };
}
