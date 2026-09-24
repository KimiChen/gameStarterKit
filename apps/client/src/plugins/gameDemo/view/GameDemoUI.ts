import { Color, EditBox, EventTouch, Graphics, Label, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform, resources } from 'cc';
import { createSolidPlate } from '../../../view/uiPlate';
import { resourceMap } from '../../../ui-uniflex/generated/resource-map';
export const ink = new Color(243, 240, 232);
export const card = new Color(255, 252, 244);
export const jade = new Color(104, 73, 149);
export const gold = new Color(99, 66, 135);
export const muted = new Color(131, 122, 145);
export const white = new Color(237, 244, 237);
export const body = new Color(63, 50, 84);
export const red = new Color(220, 113, 112);
export function node(parent: Node, name: string, x = 0, y = 0): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    return n;
}
export function plate(
    parent: Node,
    x: number,
    y: number,
    w: number,
    h: number,
    color = card,
    name = 'card',
): Node {
    if (color === card && w >= 44 && h >= 44) return themedImage(parent, 'ui/alliance/join-row-bg', x, y, w, h, name);
    return createSolidPlate(parent, w, h, color, x, y, name);
}
export function text(
    parent: Node,
    value: string,
    x: number,
    y: number,
    w: number,
    size = 26,
    color = body,
    align = Label.HorizontalAlign.CENTER,
    height = size * 1.6,
): Label {
    const n = node(parent, value.slice(0, 20), x, y);
    n.addComponent(UITransform).setContentSize(w, height);
    const l = n.addComponent(Label);
    l.string = value;
    l.fontSize = size;
    l.lineHeight = size * 1.5;
    l.color = color;
    l.horizontalAlign = align;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    l.enableWrapText = true;
    return l;
}
export type NavigationIcon = 'hero' | 'shop' | 'alchemy' | 'boss' | 'more';
type Icon = NavigationIcon | 'pill' | 'arrow';
const skins = new Map<string, SpriteFrame>();
const fullWhite = new Color(255, 255, 255);
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Small cached RGBA frames: no DOM, external assets or per-button Graphics buffers. */
function skin(key: string, size: number, inset: number,
    pixel: (x: number, y: number) => readonly number[]): SpriteFrame {
    const previous = skins.get(key);
    if (previous) return previous;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const rgba = pixel(x + 0.5, y + 0.5);
        for (let i = 0; i < 4; i++) data[(y * size + x) * 4 + i] = Math.round(rgba[i]);
    }
    const texture = new Texture2D();
    texture.reset({ width: size, height: size });
    texture.uploadData(data);
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(0, 0, size, size);
    // Raw uploaded bytes cannot be repacked through the HTML image dynamic-atlas path.
    frame.packable = false;
    frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = inset;
    skins.set(key, frame);
    return frame;
}
const themeIds = ['ui/button/confirm', 'ui/button/cancel', 'ui/button/cyan',
    'ui/mail/header', 'ui/mail/tab-active', 'ui/mail/tab-inactive',
    'ui/alliance/input-bg', 'ui/alliance/join-row-bg'] as const;
type ThemeId = typeof themeIds[number];
const themeFrames = new Map<ThemeId, SpriteFrame>();
let themeReady: Promise<void> | null = null;
/** Shared ThemeClassic resources, loaded before mounting interactive controls. */
export function loadGameDemoTheme(): Promise<void> {
    if (!themeReady) themeReady = Promise.all(themeIds.map(id => new Promise<void>((resolve, reject) => {
        if (themeFrames.has(id)) { resolve(); return; }
        resources.load(resourceMap[id].path, SpriteFrame, (error, frame) => {
            if (error) { reject(error); return; }
            // This bounded application-wide skin cache owns a reference independently of
            // UniFlex popup leases. Closing Confirm must not release our shared textures.
            frame.addRef();
            themeFrames.set(id, frame);
            resolve();
        });
    }))).then(() => {}, error => { themeReady = null; throw error; });
    return themeReady;
}
export function themedImage(parent: Node, id: ThemeId, x: number, y: number,
    w: number, h: number, name: string = id): Node {
    const frame = themeFrames.get(id);
    if (!frame) throw new Error(`gameDemo theme is not loaded: ${id}`);
    return image(parent, name, x, y, w, h, frame, fullWhite, true);
}
export function outline(label: Label, color = new Color(89, 61, 132)): Label {
    label.enableOutline = true;
    label.outlineWidth = 2;
    label.outlineColor = color;
    return label;
}
function image(parent: Node, name: string, x: number, y: number, w: number, h: number,
    frame: SpriteFrame, tint = fullWhite, sliced = false): Node {
    const n = node(parent, name, x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    const s = n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    s.spriteFrame = frame;
    s.color = tint;
    return n;
}
/** Original outline icons rasterized once; all navigation instances share the same frames. */
export function icon(parent: Node, kind: Icon, x: number, y: number, size = 42, tint = jade): Node {
    const frame = skin('icon-' + kind, 64, 0, (px, py) => {
        const line = (ax: number, ay: number, bx: number, by: number) => {
            const dx = bx - ax, dy = by - ay;
            const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
            return Math.hypot(px - ax - t * dx, py - ay - t * dy) - 2;
        };
        const ring = (cx: number, cy: number, r: number) => Math.abs(Math.hypot(px - cx, py - cy) - r) - 2;
        let d = 64;
        const path = (...points: number[][]) => {
            for (let i = 1; i < points.length; i++) d = Math.min(d, line(...points[i - 1] as [number, number], ...points[i] as [number, number]));
        };
        if (kind === 'hero') {
            d = ring(32, 20, 10);
            path([12, 54], [12, 47], [17, 38], [25, 35], [39, 35], [47, 38], [52, 47], [52, 54]);
        } else if (kind === 'shop') {
            path([10, 29], [15, 12], [49, 12], [54, 29], [10, 29]);
            path([15, 33], [15, 53], [49, 53], [49, 33]);
            path([28, 53], [28, 39], [39, 39], [39, 53]);
            path([25, 12], [23, 29]); path([39, 12], [41, 29]);
        } else if (kind === 'alchemy') {
            path([35, 7], [39, 25], [46, 20], [51, 32], [50, 43], [43, 53], [30, 57], [19, 52], [12, 42], [14, 31], [24, 20], [35, 7]);
            path([32, 34], [39, 45], [34, 52], [26, 48], [26, 42], [32, 34]);
        } else if (kind === 'boss') {
            path([12, 53], [48, 17], [52, 8], [43, 12], [8, 48]);
            path([11, 36], [28, 53]); path([36, 11], [53, 28]);
            path([12, 8], [53, 49]); path([8, 12], [49, 53]);
        } else if (kind === 'more') {
            d = Math.min(...[14, 32, 50].map(cx => Math.hypot(px - cx, py - 32) - 3.5));
        } else if (kind === 'pill') {
            d = Math.hypot(px - 32, py - 32) - 23;
        } else {
            path([12, 32], [50, 32]); path([36, 17], [51, 32], [36, 47]);
        }
        return [255, 255, 255, clamp(0.5 - d) * 255];
    });
    return image(parent, 'icon-' + kind, x, y, size, size, frame, tint);
}
function bindPress(target: Node, visual: Node, action: () => void): void {
    let pressed = false;
    target.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        pressed = true;
        visual.setPosition(0, -3);
        visual.setScale(0.98, 0.98, 1);
    });
    const reset = () => { pressed = false; visual.setPosition(0, 0); visual.setScale(1, 1, 1); };
    target.on(Node.EventType.TOUCH_CANCEL, reset);
    target.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        event.propagationStopped = true;
        const invoke = pressed;
        reset();
        if (invoke) action();
    });
}
export function button(
    parent: Node, value: string, x: number, y: number, w: number, action: () => void,
    primary = false, h = 88, enabled = true,
): Node {
    const n = node(parent, value, x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    const cancel = /取消|拒绝|离开|提前结束/.test(value);
    const id = primary ? 'ui/button/confirm' : cancel ? 'ui/button/cancel' : 'ui/button/cyan';
    const visual = themedImage(n, id, 0, 0, w, h, 'button-skin');
    if (!enabled) visual.getComponent(Sprite)!.color = new Color(165, 165, 165);
    outline(text(visual, value, 0, 4, w - 26, 28, white),
        primary ? new Color(100, 62, 20) : cancel ? new Color(78, 120, 59) : new Color(46, 90, 104));
    if (enabled) bindPress(n, visual, action);
    return n;
}
export function navigationButton(parent: Node, value: string, kind: NavigationIcon,
    x: number, y: number, action: () => void, selected: boolean): Node {
    const n = node(parent, value, x, y);
    n.addComponent(UITransform).setContentSize(132, 110);
    const visual = node(n, 'nav-content');
    themedImage(visual, selected ? 'ui/mail/tab-active' : 'ui/mail/tab-inactive', 0, 0, 136, 110, 'nav-selected');
    icon(visual, kind, 0, 19, 43, selected ? jade : body);
    text(visual, value, 0, -29, 120, 22, selected ? jade : body);
    bindPress(n, visual, action);
    return n;
}
export function bar(
    parent: Node,
    x: number,
    y: number,
    w: number,
    h: number,
    color = jade,
): (ratio: number) => void {
    const back = plate(parent, x, y, w, h, new Color(201, 192, 213), 'health-track');
    const fill = plate(back, 0, 0, w, h, color, 'health-fill');
    return (ratio) => {
        const width = w * Math.max(0, Math.min(1, ratio));
        fill.active = width > 0;
        fill.getComponent(UITransform)!.width = width;
        fill.setPosition((width - w) / 2, 0);
    };
}
export function input(
    parent: Node,
    value: string,
    hint: string,
    y: number,
    max: number,
    changed: (value: string) => void,
): void {
    const n = themedImage(parent, 'ui/alliance/input-bg', 0, y, 630, 90, '输入框');
    const l = text(n, '', 0, 0, 590, 26);
    const placeholder = text(n, hint, 0, 0, 590, 24, muted);
    const edit = n.addComponent(EditBox);
    edit.textLabel = l;
    edit.placeholderLabel = placeholder;
    edit.maxLength = max;
    edit.string = value;
    n.on(EditBox.EventType.TEXT_CHANGED, () => changed(edit.string));
}
export function polygon(g: Graphics, points: number[][], color: Color): void {
    g.fillColor = color;
    g.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
    g.lineTo(points[0][0], points[0][1]);
    g.fill();
}
export function circle(g: Graphics, x: number, y: number, radius: number, color: Color): void {
    g.fillColor = color;
    g.circle(x, y, radius);
    g.fill();
}
/** One shared scene Graphics for silhouettes; rectangles always use shared sprite plates. */
export function avatar(g: Graphics, x: number, y: number, r: number, tint = jade): void {
    circle(g, x, y, r + 4, tint);
    circle(g, x, y, r, new Color(18, 35, 43));
    polygon(
        g,
        [
            [x - r * 0.7, y - r * 0.6],
            [x - r * 0.4, y],
            [x + r * 0.4, y],
            [x + r * 0.7, y - r * 0.6],
        ],
        tint,
    );
    circle(g, x, y + r * 0.18, r * 0.41, new Color(215, 191, 158));
    polygon(
        g,
        [
            [x - r * 0.47, y + r * 0.2],
            [x - r * 0.3, y + r * 0.65],
            [x + r * 0.27, y + r * 0.62],
            [x + r * 0.46, y + r * 0.1],
            [x, y + r * 0.34],
        ],
        new Color(22, 32, 40),
    );
    circle(g, x, y + r * 0.77, r * 0.15, new Color(27, 37, 42));
}
