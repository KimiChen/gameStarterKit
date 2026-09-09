/**
 * 设置页的程序化皮肤：小尺寸 RGBA 纹理 + 共享 SpriteFrame，无外部图片、DOM 或 FGUI。
 * 圆角底板使用九宫拉伸；图标由几何图形栅格化后缓存，避免每张卡片创建 Graphics 缓冲。
 */
import { Color, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform } from "cc";

export type SettingsSurfaceKind = "panel" | "header" | "card" | "cardDisabled" | "cardPressed"
    | "iconTile" | "switchOn" | "switchOff" | "knob";

type Point = readonly [number, number];
type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];
type Shape = (x: number, y: number) => boolean;

const SURFACE_SIZE = 96;
const ICON_SIZE = 64;
const surfaceFrames = new Map<SettingsSurfaceKind, SpriteFrame>();
const iconFrames = new Map<string, SpriteFrame>();
const WHITE = new Color(255, 255, 255, 255);

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const blend = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function circle(x: number, y: number, cx: number, cy: number, radius: number): boolean {
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function rect(x: number, y: number, left: number, top: number, right: number, bottom: number): boolean {
    return x >= left && x <= right && y >= top && y <= bottom;
}

/** 距离圆角矩形外缘的有符号距离；负值在形状内。 */
function roundDistance(x: number, y: number, left: number, top: number, right: number, bottom: number, radius: number): number {
    const qx = Math.abs(x - (left + right) / 2) - (right - left) / 2 + radius;
    const qy = Math.abs(y - (top + bottom) / 2) - (bottom - top) / 2 + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function roundRect(x: number, y: number, left: number, top: number, right: number, bottom: number, radius: number): boolean {
    return roundDistance(x, y, left, top, right, bottom, radius) <= 0;
}

function line(x: number, y: number, ax: number, ay: number, bx: number, by: number, width: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= width / 2;
}

function polygon(x: number, y: number, points: readonly Point[]): boolean {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[previous];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
}

/** 2×2 超采样，边缘预乘后合成再还原，透明区不会出现黑边。 */
function raster(size: number, pixel: (x: number, y: number) => Rgba): Uint8Array {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            for (const dy of [0.25, 0.75]) {
                for (const dx of [0.25, 0.75]) {
                    const color = pixel(x + dx, y + dy);
                    red += color[0] * color[3];
                    green += color[1] * color[3];
                    blue += color[2] * color[3];
                    alpha += color[3];
                }
            }
            const offset = (y * size + x) * 4;
            data[offset] = alpha ? Math.round(red / alpha) : 255;
            data[offset + 1] = alpha ? Math.round(green / alpha) : 255;
            data[offset + 2] = alpha ? Math.round(blue / alpha) : 255;
            data[offset + 3] = Math.round(alpha / 4);
        }
    }
    return data;
}

function makeFrame(size: number, data: Uint8Array, inset: number): SpriteFrame {
    const texture = new Texture2D();
    // Creator 3.8.8 reset 的缺省格式为 RGBA8888，过滤缺省 LINEAR、无 mipmap。
    texture.reset({ width: size, height: size });
    texture.uploadData(data);
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(0, 0, size, size);
    // 直接上传的 ArrayBufferView 不交给动态图集按 HTMLImageElement 再次打包。
    frame.packable = false;
    frame.insetLeft = inset;
    frame.insetRight = inset;
    frame.insetTop = inset;
    frame.insetBottom = inset;
    return frame;
}

function surfacePixel(kind: SettingsSurfaceKind, x: number, y: number): Rgba {
    if (kind === "iconTile") {
        // 截图里的淡紫色图标底：左侧圆角，右侧为柔和箭头轮廓。
        const right = 80 + 14 * (1 - Math.abs(y - 48) / 48);
        const inside = roundRect(x, y, 1, 1, 94, 95, 14) && x <= right;
        if (!inside) return [255, 255, 255, 0];
        const rgb = blend([235, 227, 247], [244, 239, 249], x / 96);
        return [...rgb, 255];
    }

    const isSwitch = kind === "switchOn" || kind === "switchOff";
    const knob = kind === "knob";
    const header = kind === "header";
    const radius = isSwitch || knob ? 44 : kind === "panel" || header ? 27 : 18;
    const bottom = isSwitch || knob ? 94 : 92;
    // Header 下边是直边，左右上角与面板圆角同形。
    const distance = header && y > 48
        ? Math.max(2 - x, x - 94, y - 96)
        : roundDistance(x, y, 2, 2, 94, bottom, radius);
    if (distance > 0) {
        if (header || isSwitch) return [255, 255, 255, 0];
        const shadow = roundDistance(x, y, 2, 5, 94, 95, radius);
        return [99, 77, 129, clamp((1 - Math.max(0, shadow) / 2) * 27, 0, 27)];
    }

    let topColor: Rgb;
    let bottomColor: Rgb;
    let border: Rgb;
    if (header) {
        topColor = [168, 143, 218];
        bottomColor = [123, 98, 179];
        border = [201, 181, 235];
    } else if (kind === "panel") {
        topColor = [250, 247, 241];
        bottomColor = [243, 238, 233];
        border = [179, 160, 205];
    } else if (kind === "cardDisabled") {
        topColor = [246, 244, 245];
        bottomColor = [238, 234, 239];
        border = [203, 194, 212];
    } else if (kind === "cardPressed") {
        topColor = [237, 226, 249];
        bottomColor = [226, 212, 243];
        border = [151, 123, 188];
    } else if (kind === "switchOn") {
        topColor = [155, 131, 204];
        bottomColor = [121, 96, 173];
        border = [118, 92, 164];
    } else if (kind === "switchOff") {
        topColor = [214, 206, 223];
        bottomColor = [197, 187, 208];
        border = [185, 174, 200];
    } else if (knob) {
        topColor = [255, 255, 255];
        bottomColor = [242, 236, 248];
        border = [250, 247, 255];
    } else {
        topColor = [255, 255, 255];
        bottomColor = [250, 247, 249];
        border = [193, 176, 211];
    }

    const edgeWidth = header ? 2.2 : knob ? 1 : 1.5;
    let rgb = distance > -edgeWidth ? border : blend(topColor, bottomColor, clamp(y / 96, 0, 1));
    if (distance < -edgeWidth && distance > -edgeWidth - 1.2) {
        rgb = blend(rgb, [255, 255, 255], header ? 0.2 : 0.7);
    }
    return [...rgb, 255];
}

function surfaceFrame(kind: SettingsSurfaceKind): SpriteFrame {
    const previous = surfaceFrames.get(kind);
    if (previous) return previous;
    const inset = kind === "knob" || kind === "switchOn" || kind === "switchOff" ? 46 : 30;
    const frame = makeFrame(SURFACE_SIZE, raster(SURFACE_SIZE, (x, y) => surfacePixel(kind, x, y)), inset);
    surfaceFrames.set(kind, frame);
    return frame;
}

const SHIELD: readonly Point[] = [[32, 7], [52, 15], [50, 35], [44, 46], [32, 56], [20, 46], [14, 35], [12, 15]];
const SHIELD_INNER: readonly Point[] = [[32, 14], [45, 20], [43, 33], [39, 41], [32, 48], [25, 41], [21, 33], [19, 20]];
const BELL: readonly Point[] = [[15, 43], [20, 38], [20, 27], [22, 19], [27, 15], [37, 15], [42, 19], [44, 27], [44, 38], [49, 43]];
const DOCUMENT: readonly Point[] = [[14, 9], [39, 9], [50, 20], [50, 54], [14, 54]];
const FOLD: readonly Point[] = [[38, 10], [38, 22], [50, 22]];
const SPEAKER: readonly Point[] = [[10, 25], [21, 25], [35, 13], [35, 51], [21, 39], [10, 39]];
const GAMEPAD: readonly Point[] = [[18, 18], [46, 18], [52, 22], [58, 45], [56, 51], [49, 51], [40, 41], [24, 41], [15, 51], [8, 51], [6, 45], [12, 22]];
const TROPHY: readonly Point[] = [[20, 9], [44, 9], [43, 26], [39, 35], [32, 40], [25, 35], [21, 26]];

function documentShape(x: number, y: number): boolean {
    return polygon(x, y, DOCUMENT) && !polygon(x, y, FOLD)
        && !rect(x, y, 22, 27, 41, 30) && !rect(x, y, 22, 35, 41, 38)
        && !rect(x, y, 22, 43, 35, 46);
}

function iconShape(kind: string): Shape {
    switch (kind) {
        case "general": return (x, y) => {
            const dx = x - 32;
            const dy = y - 32;
            const radius = Math.hypot(dx, dy);
            if (radius < 9 || radius > 27) return false;
            if (radius < 21) return true;
            const angle = Math.atan2(dy, dx) + Math.PI / 16;
            const turn = ((angle / (Math.PI / 4)) % 1 + 1) % 1;
            return turn < 0.48;
        };
        case "language": return (x, y) =>
            roundRect(x, y, 11, 12, 53, 21, 3)
            || rect(x, y, 11, 18, 17, 26) || rect(x, y, 47, 18, 53, 26)
            || rect(x, y, 28, 19, 36, 49) || roundRect(x, y, 21, 47, 43, 54, 2);
        case "push": return (x, y) => polygon(x, y, BELL)
            || roundRect(x, y, 12, 42, 52, 48, 3) || circle(x, y, 32, 51, 5) || circle(x, y, 32, 12, 4);
        case "terms": return documentShape;
        case "privacy": return (x, y) => polygon(x, y, SHIELD) && !polygon(x, y, SHIELD_INNER)
            || line(x, y, 24, 30, 30, 36, 5) || line(x, y, 30, 36, 41, 24, 5);
        case "logUpload": return (x, y) => {
            if (rect(x, y, 31, 28, 57, 59)) {
                return line(x, y, 45, 54, 45, 35, 7)
                    || line(x, y, 36, 43, 45, 34, 6) || line(x, y, 45, 34, 54, 43, 6);
            }
            return documentShape(x, y);
        };
        case "arenaHub": return (x, y) => polygon(x, y, TROPHY)
            || line(x, y, 32, 36, 32, 48, 6) || roundRect(x, y, 20, 47, 44, 53, 3)
            || (circle(x, y, 18, 21, 10) && !circle(x, y, 18, 20, 5) && x < 23)
            || (circle(x, y, 46, 21, 10) && !circle(x, y, 46, 20, 5) && x > 41);
        case "redeem": return (x, y) => {
            const box = roundRect(x, y, 11, 28, 53, 55, 2) && !rect(x, y, 29, 28, 35, 55);
            const lid = roundRect(x, y, 8, 22, 56, 30, 2) && !rect(x, y, 29, 22, 35, 30);
            const bow = ((circle(x, y, 23, 15, 9) && !circle(x, y, 23, 14, 4))
                || (circle(x, y, 41, 15, 9) && !circle(x, y, 41, 14, 4))) && y < 23;
            return box || lid || bow;
        };
        case "snake": return (x, y) => {
            const body = line(x, y, 19, 49, 41, 49, 11) || line(x, y, 41, 49, 46, 44, 11)
                || line(x, y, 46, 44, 46, 38, 11) || line(x, y, 46, 38, 40, 32, 11)
                || line(x, y, 40, 32, 23, 32, 11) || line(x, y, 23, 32, 17, 26, 11)
                || line(x, y, 17, 26, 17, 19, 11) || line(x, y, 17, 19, 23, 14, 11)
                || roundRect(x, y, 23, 6, 48, 23, 8);
            return body && !circle(x, y, 40, 11, 2.1);
        };
        case "tally": return (x, y) => {
            const radius = Math.hypot(x - 32, y - 32);
            return radius <= 25 && radius >= 20 || radius <= 14 && radius >= 9 || radius <= 4
                || line(x, y, 32, 4, 32, 11, 4) || line(x, y, 32, 53, 32, 60, 4)
                || line(x, y, 4, 32, 11, 32, 4) || line(x, y, 53, 32, 60, 32, 4);
        };
        case "musicOn": return (x, y) => circle(x, y, 19, 48, 8) || circle(x, y, 43, 43, 8)
            || rect(x, y, 22, 14, 27, 48) || rect(x, y, 46, 9, 51, 43)
            || polygon(x, y, [[22, 14], [51, 8], [51, 19], [22, 25]]);
        case "sfxOn": return (x, y) => {
            const radius = Math.hypot(x - 33, y - 32);
            return polygon(x, y, SPEAKER) || x > 41 && (radius > 14 && radius < 19 || radius > 24 && radius < 29)
                && y > 11 && y < 53;
        };
        case "close": return (x, y) => line(x, y, 16, 16, 48, 48, 10) || line(x, y, 48, 16, 16, 48, 10);
        case "back": return (x, y) => line(x, y, 36, 13, 17, 32, 7) || line(x, y, 17, 32, 36, 51, 7)
            || line(x, y, 19, 32, 51, 32, 7);
        case "chevron": return (x, y) => line(x, y, 24, 15, 42, 32, 6) || line(x, y, 42, 32, 24, 49, 6);
        default: return (x, y) => polygon(x, y, GAMEPAD)
            && !rect(x, y, 16, 28, 30, 32) && !rect(x, y, 21, 23, 25, 37)
            && !circle(x, y, 43, 27, 3) && !circle(x, y, 49, 33, 3);
    }
}

function iconFrame(kind: string): SpriteFrame {
    // 未登记的玩法共享同一枚通用手柄，避免插件 id 变多时重复分配相同纹理。
    const supported = ["general", "language", "push", "terms", "privacy", "logUpload", "arenaHub", "redeem", "snake", "tally",
        "musicOn", "sfxOn", "close", "back", "chevron"];
    const resolved = supported.includes(kind) ? kind : "gamepad";
    const previous = iconFrames.get(resolved);
    if (previous) return previous;
    const shape = iconShape(resolved);
    const frame = makeFrame(ICON_SIZE, raster(ICON_SIZE, (x, y) => [255, 255, 255, shape(x, y) ? 255 : 0]), 0);
    iconFrames.set(resolved, frame);
    return frame;
}

function spriteNode(parent: Node, width: number, height: number, x: number, y: number, name: string,
    frame: SpriteFrame, sliced: boolean, color: Color): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    const transform = node.addComponent(UITransform);
    transform.width = width;
    transform.height = height;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const sprite = node.addComponent(Sprite);
    // 必须在赋帧之前 CUSTOM，否则会用 96×96/64×64 覆盖布局尺寸。
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    sprite.spriteFrame = frame;
    sprite.color = color;
    return node;
}

export function createSettingsSurface(parent: Node, width: number, height: number, x: number, y: number,
    kind: SettingsSurfaceKind, name = `settings-${kind}`): Node {
    return spriteNode(parent, width, height, x, y, name, surfaceFrame(kind), kind !== "iconTile" && kind !== "knob", WHITE);
}

export function createSettingsIcon(parent: Node, size: number, x: number, y: number, kind: string, color: Color): Node {
    return spriteNode(parent, size, size, x, y, `icon-${kind}`, iconFrame(kind), false, color);
}
