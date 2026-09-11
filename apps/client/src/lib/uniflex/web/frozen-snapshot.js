/** Paint retained raster surfaces once into the same low-resolution target as Cocos. */
export function paintSnapshotElement(context, element, origin, width, height) {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
        return;
    const bounds = element.getBoundingClientRect();
    const x = ((bounds.x - origin.x) * width) / origin.width;
    const y = ((bounds.y - origin.y) * height) / origin.height;
    const w = (bounds.width * width) / origin.width;
    const h = (bounds.height * height) / origin.height;
    if (w <= 0 || h <= 0 || style.clipPath === 'inset(100%)')
        return;
    context.save();
    context.globalAlpha *= Number(style.opacity);
    if (style.overflow === 'hidden' || style.overflow === 'clip' || style.overflow === 'auto') {
        context.beginPath();
        context.rect(x, y, w, h);
        context.clip();
    }
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        context.fillStyle = style.backgroundColor;
        context.fillRect(x, y, w, h);
    }
    if (element.tagName === 'CANVAS') {
        const canvas = element;
        if (canvas.width > 0 && canvas.height > 0)
            context.drawImage(canvas, x, y, w, h);
    }
    else if (element.tagName === 'INPUT') {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.fillStyle = style.color;
        context.textAlign = style.textAlign;
        context.textBaseline = 'middle';
        context.fillText(element.value, x + w / 2, y + h / 2, w);
    }
    const children = Array.from(element.children).filter((child) => child instanceof element.ownerDocument.defaultView.HTMLElement);
    children.sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    for (const child of children)
        paintSnapshotElement(context, child, origin, width, height);
    context.restore();
}
