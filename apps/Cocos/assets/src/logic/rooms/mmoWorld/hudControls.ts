/**
 * mmoWorld 竖屏操作模型（MG1-B1；纯 TS，无头单测）——kit 默认 HUD 三件套的几何与节流，View 只做节点与触摸转发：
 *  - 摇杆（左下，固定圆心）：手指相对圆心的位移 → movement 面 `dirFromJoystick`（死区 + 归一化）→ `IntentThrottle` 限频合并 → `move` 意图；
 *    抬手 ⇒ `stop`（从未发过非零方向就不发）；
 *  - 点选目标（世界层轻点：按下与抬起相距 ≤ MMO_HUD_TAP_SLOP_PX）：按屏幕距离在实体表里挑最近命中（排除本人）⇒ `target`，再点同一目标 ⇒ 清除；
 *    点空地 ⇒ `moveTo` 世界坐标；
 *  - 技能轮盘（右下）：职业技能表沿圆弧分槽（正上 → 正左等分；相邻槽弦长 ≥ 槽尺寸，放不下溢到外圈）；点槽 ⇒ `cast`。
 * 屏幕坐标 = 世界层节点局部坐标（原点屏幕中心、y 向上，px）；世界坐标 y 向下（服务端口径）——两处换算只在本文件（`screenToWorld` / `worldToScreen`）。
 * 渲染归 ../../../view/rooms/mmoWorld/MmoWorldView.ts；⛔ 不 import cc（铁律 9）。
 */
import { IntentThrottle, dirFromJoystick, type IVec2 } from "../../../kits/mmo/api/movement/index";
import type { MmoWorldEntityView, MmoWorldInput } from "./MmoWorldGameplay";

/** 世界单位 → 屏幕像素（相机跟随本人的正交投影） */
export const MMO_HUD_WORLD_SCALE = 0.35;
/** 轻点判定：按下与抬起的屏幕距离（px）不超过它 */
export const MMO_HUD_TAP_SLOP_PX = 12;
/** 点选目标的最小命中半径（px；小实体也好点） */
export const MMO_HUD_PICK_MIN_PX = 24;
/** 轮盘每圈的半径倍率增量（内圈放不下时溢到外圈） */
const WHEEL_RING_STEP = 0.62;
/** 轮盘最多几圈（超出的槽挤在最外圈） */
const WHEEL_MAX_RINGS = 3;

export interface HudCircle { readonly x: number; readonly y: number; readonly radius: number }

export interface HudLayout {
    /** 摇杆：圆心 / 半径 / 旋钮半径 */
    readonly joystick: HudCircle & { readonly knobRadius: number };
    /** 技能轮盘：圆心（hub）/ 内圈半径 / 槽边长 / hub 边长 */
    readonly wheel: HudCircle & { readonly slotSize: number; readonly hubSize: number };
    /** 底部中列动作钮（停 / 拾取）的边长与列 x */
    readonly actionSize: number;
    readonly actionX: number;
    /** 屏幕底边（含安全区）y */
    readonly bottom: number;
}

/** 竖屏布局（屏幕局部坐标；`safeBottom` 为底部安全区高度 px）。数字按 750×1624 基线取比例，横屏也不越界。 */
export function hudLayout(width: number, height: number, safeBottom = 0): HudLayout {
    const unit = Math.min(width, height * 0.5);
    const bottom = -height * 0.5 + Math.max(0, safeBottom);
    const radius = unit * 0.15;
    const wheelRadius = unit * 0.26;
    const slotSize = unit * 0.13;
    const joystick = { x: -width * 0.5 + radius + unit * 0.08, y: bottom + radius + unit * 0.1, radius, knobRadius: radius * 0.42 };
    const wheel = { x: width * 0.5 - unit * 0.12, y: bottom + unit * 0.14, radius: wheelRadius, slotSize, hubSize: unit * 0.16 };
    return {
        joystick,
        wheel,
        actionSize: unit * 0.12,
        actionX: ((joystick.x + radius) + (wheel.x - wheelRadius - slotSize * 0.5)) * 0.5,
        bottom,
    };
}

export interface JoystickFrame { readonly knob: IVec2; readonly dir: IVec2 }

/** 手指点 → 旋钮位置（钳在半径内）与方向意图（死区内为零向量；屏幕 y 向上 → 世界 y 向下）。 */
export function joystickFrame(origin: IVec2, point: IVec2, radius: number): JoystickFrame {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const length = Math.hypot(dx, dy);
    const k = length > radius ? radius / length : 1;
    const dir = dirFromJoystick(dx / radius, -dy / radius);
    // `-dy` 在 dy = 0 时是 -0：+0 归一，免得意图键 / 线上载荷带负零
    return { knob: { x: origin.x + dx * k, y: origin.y + dy * k }, dir: { x: dir.x + 0, y: dir.y + 0 } };
}

/** 一次按下到抬手的摇杆会话：方向经 IntentThrottle 限频合并；死区内且尚未动过 ⇒ 什么都不发。 */
export class JoystickSession {
    private moving = false;

    constructor(readonly origin: IVec2, readonly radius: number, private readonly throttle: IntentThrottle = new IntentThrottle()) {}

    /** 手指移动：旋钮位置 + 本次应发的方向（限频 / 未变 / 未动过的死区 ⇒ null）。 */
    move(point: IVec2, nowMs: number): { readonly knob: IVec2; readonly send: IVec2 | null } {
        const frame = joystickFrame(this.origin, point, this.radius);
        const zero = frame.dir.x === 0 && frame.dir.y === 0;
        if (zero && !this.moving) return { knob: frame.knob, send: null };
        const send = this.throttle.shouldSend(nowMs, frame.dir) ? frame.dir : null;
        if (send) this.moving = !zero;
        return { knob: frame.knob, send };
    }

    /** 抬手 / 取消：是否需要发停（本会话发过非零方向且未停 ⇒ true）。 */
    end(): boolean {
        const stop = this.moving;
        this.moving = false;
        this.throttle.reset();
        return stop;
    }
}

/**
 * 轮盘分槽位置（相对 hub 圆心）：内圈从正上（90°）到正左（180°）等分，相邻槽弦长 ≥ 槽边长 × 1.05；放不下的溢到外圈
 * （半径 × (1 + 0.62·圈序)，弧只到 x 不超出内圈最左的角度 acos(−R/r)，⛔ 越过内圈往中间挤），最多三圈（再多就挤在最外圈）。单槽放弧的中点。
 */
export function wheelSlotPositions(count: number, radius: number, slotSize: number): readonly IVec2[] {
    const out: IVec2[] = [];
    let remaining = Math.max(0, Math.floor(count));
    for (let ring = 0; remaining > 0; ring++) {
        const r = radius * (1 + WHEEL_RING_STEP * ring);
        const start = Math.PI * 0.5;
        const end = ring === 0 ? Math.PI : Math.acos(-radius / r);
        const minAngle = 2 * Math.asin(Math.min(1, (slotSize * 1.05) / (2 * r)));
        const capacity = Math.max(1, Math.floor((end - start) / minAngle) + 1);
        const n = ring >= WHEEL_MAX_RINGS - 1 ? remaining : Math.min(remaining, capacity);
        for (let i = 0; i < n; i++) {
            const angle = n === 1 ? (start + end) * 0.5 : start + ((end - start) * i) / (n - 1);
            out.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
        }
        remaining -= n;
    }
    return out;
}

/** 屏幕局部坐标 → 世界坐标（相机中心 `center` 为世界坐标）。 */
export function screenToWorld(local: IVec2, center: IVec2, scale = MMO_HUD_WORLD_SCALE): IVec2 {
    return { x: center.x + local.x / scale, y: center.y - local.y / scale };
}

/** 世界坐标 → 屏幕局部坐标。 */
export function worldToScreen(world: IVec2, center: IVec2, scale = MMO_HUD_WORLD_SCALE): IVec2 {
    return { x: (world.x - center.x) * scale, y: -(world.y - center.y) * scale };
}

/** 轻点判定。 */
export function isTap(start: IVec2, end: IVec2, slopPx = MMO_HUD_TAP_SLOP_PX): boolean {
    return Math.hypot(end.x - start.x, end.y - start.y) <= slopPx;
}

/** 点选：按屏幕距离挑最近的非本人实体（命中半径 = max(最小半径, 表现尺寸 × 0.7)）；没有 ⇒ null。 */
export function pickEntity(entities: readonly MmoWorldEntityView[], worldPoint: IVec2, scale = MMO_HUD_WORLD_SCALE, minPx = MMO_HUD_PICK_MIN_PX): MmoWorldEntityView | null {
    let best: MmoWorldEntityView | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of entities) {
        if (entity.isSelf) continue;
        const distance = Math.hypot((entity.x - worldPoint.x) * scale, (entity.y - worldPoint.y) * scale);
        if (distance <= Math.max(minPx, entity.presentation.size * 0.7) && distance < bestDistance) {
            best = entity;
            bestDistance = distance;
        }
    }
    return best;
}

/** 世界层轻点 → 输入：命中实体 ⇒ target（已是目标 ⇒ 清除）；空地 ⇒ moveTo。 */
export function resolveWorldTap(entities: readonly MmoWorldEntityView[], targetId: string | null, worldPoint: IVec2, scale = MMO_HUD_WORLD_SCALE): MmoWorldInput {
    const hit = pickEntity(entities, worldPoint, scale);
    if (hit) return { type: "target", entityId: hit.id === targetId ? null : hit.id };
    return { type: "moveTo", x: worldPoint.x, y: worldPoint.y };
}

/** 冷却文案：剩余毫秒 → 向上取整的秒；就绪 ⇒ 空串。 */
export function cooldownLabel(remainingMs: number | undefined): string {
    return remainingMs !== undefined && remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)}s` : "";
}
