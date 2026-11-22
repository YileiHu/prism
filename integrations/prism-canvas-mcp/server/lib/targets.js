"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leafName = leafName;
exports.targetTitle = targetTitle;
exports.normalizeTargetUrl = normalizeTargetUrl;
function leafName(path) {
    const name = path.split(/[\\/]/).pop() ?? path;
    return name.replace(/\.(md|canvas\.json|json)$/i, "");
}
function targetTitle(target) {
    if (!target)
        return "";
    if (target.kind === "url")
        return target.url;
    return target.title || leafName(target.kind === "pdf" ? target.relPath : target.path);
}
// Only allow schemes the OS can hand off safely; anything else (javascript:,
// file:, data:) is rejected before it reaches shell.openExternal.
function normalizeTargetUrl(raw) {
    const value = raw.trim();
    if (!value)
        return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
            ? withScheme
            : null;
    }
    catch {
        return null;
    }
}
