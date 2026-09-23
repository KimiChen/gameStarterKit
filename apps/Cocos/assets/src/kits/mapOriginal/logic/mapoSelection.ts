/** 普通点选 2080 的 UI 拼片；根节点中心对准格心，XML 的 y 向下。 */
import { MAPO_CHOOSE } from "../../../shared/kits/mapOriginal/content/choose.data";
import { mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { MapoSpriteInput } from "./mapoMesh";

interface Track {
    readonly time: string;
    readonly duration?: string;
    readonly startValue: string;
    readonly endValue?: string;
}

function sample(tracks: readonly Track[], frame: number, color: boolean): number[] {
    const track = [...tracks].reverse().find((t) => Number(t.time) <= frame) ?? tracks[0];
    const decode = (s: string): number[] => color
        ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
        : s.split(",").map(Number);
    const a = decode(track.startValue), b = decode(track.endValue ?? track.startValue);
    const t = Math.min(1, Math.max(0, (frame - Number(track.time)) / (Number(track.duration) || 1)));
    // 原包 UI XML importer 0x4d6a98：缺省缓动为 Quad.Out。
    const f = 1 - (1 - t) * (1 - t);
    return a.map((v, i) => v + (b[i] - v) * f);
}

export function mapoSelectionSprites(seconds: number): MapoSpriteInput[] {
    const duration = MAPO_CHOOSE.durationFrames;
    const frame = ((seconds * MAPO_CHOOSE.frameRate) % duration + duration) % duration;
    const scale = sample(MAPO_CHOOSE.scaleTracks, frame, false);
    const [width, height] = MAPO_CHOOSE.size;
    const [aw, ah] = MAPO_CHOOSE.atlasSize;
    return MAPO_CHOOSE.pieces.map((p) => {
        const [tx, ty, w, h] = p.rect;
        const color = sample(MAPO_CHOOSE.colorTracks.filter((t) => t.target === p.id), frame, true);
        const flipX = p.flip === "hz" || p.flip === "both", flipY = p.flip === "vt" || p.flip === "both";
        return { row: 0, col: 0, pivot: [0.5, 0.5],
            x: mapoOriginalPxToWorld((p.xy[0] + w / 2 - width / 2) * scale[0]),
            y: mapoOriginalPxToWorld((height / 2 - p.xy[1] - h / 2) * scale[1]),
            w: mapoOriginalPxToWorld(w * scale[0]), h: mapoOriginalPxToWorld(h * scale[1]),
            rgba: [color[0], color[1], color[2], 1],
            uv: [(tx + (flipX ? w : 0)) / aw, (ty + (flipY ? h : 0)) / ah,
                 (flipX ? -w : w) / aw, (flipY ? -h : h) / ah] };
    });
}
