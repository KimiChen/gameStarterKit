/**
 * cc 引擎类型桩（仅供 `npm run typecheck:client:legacy` 用，不入 Cocos 运行时/构建；回流自 Arthur）。
 *
 * Creator 运行时用真 cc；这里只声明**客户端实际用到**的 cc API 面，让 tsc 能离线对
 * apps/client/src 做类型/导入路径检查（CI 不开 Creator 也能跑）。这是 legacy 配置的桩；完整
 * `npm run typecheck:client` 探针使用 `client-test-stubs.d.ts`，会覆盖 Main/View/tests；根
 * `npm run typecheck` 会同时运行两个探针。
 * 新用到的 cc API 若报「没有该成员」，在相应桩中补一行即可；真实引擎仍由 Creator 侧把关。
 *
 * ⚠ 不要给 Component 声明生命周期（onLoad/start/update…）：子类以 protected/public 自由
 *   覆写，框架靠鸭子类型调用，声明了反而与子类覆写修饰符冲突（Arthur 实测教训）。
 */
declare module "cc" {
    export class Vec2 { constructor(x?: number, y?: number); x: number; y: number; }
    export class Vec3 { constructor(x?: number, y?: number, z?: number); x: number; y: number; z: number; set(x: number, y: number, z?: number): this; }
    export class Color { constructor(r?: number, g?: number, b?: number, a?: number); r: number; g: number; b: number; a: number; }

    export class EventTouch { getUILocation(out?: Vec2): Vec2; }

    export class UITransform {
        width: number;
        height: number;
        convertToNodeSpaceAR(world: Vec3, out?: Vec3): Vec3;
    }

    export class Graphics {
        node: Node;
        lineWidth: number;
        fillColor: Color;
        strokeColor: Color;
        clear(): void;
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        stroke(): void;
        fill(): void;
        circle(x: number, y: number, radius: number): void;
        rect(x: number, y: number, width: number, height: number): void;
    }

    export class Node {
        constructor(name?: string);
        name: string;
        layer: number;
        active: boolean;
        parent: Node | null;
        addChild(child: Node): void;
        destroy(): boolean;
        getComponent<T>(type: new (...args: never[]) => T): T | null;
        addComponent<T>(type: new (...args: never[]) => T): T;
    }

    export class Component {
        node: Node;
        enabled: boolean;
        destroy(): boolean;
    }

    export const Layers: { Enum: { UI_2D: number; DEFAULT: number; [k: string]: number } };

    export const input: {
        on(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
        off(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
    };

    export const Input: {
        EventType: {
            TOUCH_START: string;
            TOUCH_MOVE: string;
            TOUCH_END: string;
            TOUCH_CANCEL: string;
        };
    };

    /** 装饰器（_decorator.ccclass / property 等）——桩里全部宽松声明 */
    export const _decorator: {
        ccclass(name?: string): ClassDecorator;
        property(opts?: unknown): PropertyDecorator;
        [k: string]: (...args: never[]) => unknown;
    };
}

declare module "cc/env" {
    /** 微信小游戏等小游戏平台构建时为 true */
    export const MINIGAME: boolean;
    export const DEV: boolean;
    export const EDITOR: boolean;
    export const PREVIEW: boolean;
}
