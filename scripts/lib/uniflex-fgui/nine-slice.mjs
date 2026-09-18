/** UniFlex [left, top, right, bottom] insets → FairyGUI center-rect scale9grid. */
export function toScale9Grid(nineSlice, width, height) {
    if (!Array.isArray(nineSlice) || nineSlice.length !== 4) return null;
    const [left, top, right, bottom] = nineSlice.map(Number);
    if (![left, top, right, bottom, width, height].every(Number.isFinite)) return null;
    const w = width - left - right;
    const h = height - top - bottom;
    if (w <= 0 || h <= 0) {
        throw new Error(`nineSlice center is empty: [${nineSlice.join(",")}] on ${width}×${height}`);
    }
    return { x: left, y: top, width: w, height: h, attr: `${left},${top},${w},${h}` };
}
