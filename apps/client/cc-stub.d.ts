/**
 * cc 引擎类型桩（仅供 `npm run typecheck:client:legacy` 用，不入 Cocos 运行时/构建；回流自 Arthur）。
 *
 * Creator 运行时用真 cc；这里只声明**客户端实际用到**的 cc API 面，让 tsc 能离线对
 * apps/client/src 做类型/导入路径检查（CI 不开 Creator 也能跑）。这是 legacy 配置的桩；完整
 * `npm run typecheck:client` 探针使用 `client-test-stubs.d.ts`，还会覆盖客户端 tests；根
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
    export class Rect { constructor(x?: number, y?: number, width?: number, height?: number); x: number; y: number; width: number; height: number; }

    export class EventTouch { getUILocation(out?: Vec2): Vec2; getID(): number; }

    export class UITransform {
        width: number;
        height: number;
        anchorX: number;
        anchorY: number;
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

    export class Texture2D { width: number; height: number; }
    export class JsonAsset { json: unknown; }
    export class SpriteFrame { texture: Texture2D | null; rect: Rect; }
    export class Sprite extends Component {
        spriteFrame: SpriteFrame | null; color: Color; sizeMode: number; type: number;
        static SizeMode: { CUSTOM: number; TRIMMED: number; RAW: number };
    }
    export class Label extends Component {
        string: string; fontSize: number; color: Color; horizontalAlign: number; verticalAlign: number;
        lineHeight: number; overflow: number; enableWrapText: boolean;
        static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
        static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
        static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
    }
    export class EditBox extends Component {
      string: string; placeholder: string; maxLength: number; textLabel: Label | null; placeholderLabel: Label | null;
      static EventType: { EDITING_DID_BEGAN: string; TEXT_CHANGED: string; EDITING_DID_ENDED: string; EDITING_RETURN: string };
    }
    export class AudioClip { duration: number; }
  export class Mesh { subMeshes: Array<{ update(): void }>; }
  export class Material {
    initialize(options: { effectName: string; defines?: Record<string, unknown> }): void;
    setProperty(name: string, value: unknown): void;
  }
  export class UIMeshRenderer extends Component { mesh: Mesh | null; material: Material | null; }
  export namespace gfx {
    class Attribute { constructor(name: string, format: number); }
    const AttributeName: { ATTR_POSITION: string; ATTR_TEX_COORD: string; ATTR_COLOR: string };
    const Format: { RGB32F: number; RG32F: number; RGBA32F: number };
  }
  export const utils: {
    createMesh(data: {
      attributes: gfx.Attribute[];
      positions: Float32Array;
      uvs?: Float32Array;
      colors?: Float32Array;
      indices?: Uint16Array;
    }): Mesh;
  };
    export class AudioSource extends Component { playOneShot(clip: AudioClip, volumeScale?: number): void; play(): void; stop(): void; }
    export const resources: {
        load<T>(path: string, type: new (...args: never[]) => T, callback: (error: Error | null, asset: T) => void): void;
    };

    export class Node {
        getChildByName(name: string): Node | null;
        constructor(name?: string);
        name: string;
        layer: number;
        active: boolean;
        parent: Node | null;
        children: Node[];
        isValid: boolean;
        position: Vec3;
        scale: Vec3;
        angle: number;
        static EventType: { TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string };
        addChild(child: Node): void;
        removeFromParent(): void;
        destroy(): boolean;
        setSiblingIndex(index: number): void;
        setPosition(x: number, y: number, z?: number): void;
        setScale(x: number, y: number, z?: number): void;
        on(type: string, callback: (...args: never[]) => unknown, target?: unknown): void;
        off(type: string, callback: (...args: never[]) => unknown, target?: unknown): void;
        getComponent<T>(type: new (...args: never[]) => T): T | null;
        getComponentInChildren<T>(type: new (...args: never[]) => T): T | null;
        addComponent<T>(type: new (...args: never[]) => T): T;
    }

    export class Component {
        node: Node;
        enabled: boolean;
        destroy(): boolean;
    }

    export class Canvas extends Component {}

    export const director: { getScene(): Node | null };
    export const view: {
        setDesignResolutionSize(width: number, height: number, policy: unknown): void;
        getVisibleSize(): { width: number; height: number };
    };
    export const ResolutionPolicy: { FIXED_WIDTH: unknown };
    export const sys: {
        getSafeAreaRect(): { x: number; y: number; width: number; height: number };
        localStorage: Storage;
    };

    export const Layers: { Enum: { UI_2D: number; DEFAULT: number; [k: string]: number } };

    /** 宿主前后台事件面（app/CocosLifecycleBridge 用）。 */
    export const game: {
        on(type: string, callback: () => void, target?: unknown): unknown;
        off(type: string, callback: () => void, target?: unknown): unknown;
    };
    export const Game: { EVENT_HIDE: string; EVENT_SHOW: string };

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

/**
 * Minimal FairyGUI declarations for the legacy probe. The Creator extension
 * supplies the runtime and its full declarations; keeping this small surface
 * local lets the ES2017 probe type-check every view without importing Creator's
 * generated `cc` declarations.
 */
declare module "db://fairygui-cc/fairygui.mjs" {
    import type { Node } from "cc";

    export class GObject {
        name: string;
        parent: GComponent | null;
        node: Node;
        x: number;
        y: number;
        width: number;
        height: number;
        visible: boolean;
        touchable: boolean;
        grayed: boolean;
        enabled: boolean;
        title: string;
        icon: string;
        onClick(callback: (...args: any[]) => unknown, target?: unknown): void;
        on(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
        off(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
        removeFromParent(): void;
        dispose(): void;
        readonly asCom: GComponent;
    }

    export class GComponent extends GObject {
        static inst: GComponent;
        numChildren: number;
        width: number;
        height: number;
        addChild(child: GObject): GObject;
        setChildIndex(child: GObject, index: number): void;
        getChild<T extends GObject = GObject>(name: string): T;
        getChildAt<T extends GObject = GObject>(index: number): T;
        setSize(width: number, height: number): void;
        addRelation(target: GObject, relation: number): void;
        getController(name: string): { selectedIndex: number };
    }

    export class GRoot extends GComponent {
        static inst: GRoot;
        inputProcessor: { enabled: boolean };
        onWinResize(): void;
    }

    export class GButton extends GComponent { selected: boolean; }
    export class GList extends GComponent {
        numItems: number;
        itemRenderer: ((index: number, object: GObject) => void) | null;
        getChildIndex(object: GObject): number;
        childIndexToItemIndex(index: number): number;
        setVirtual(): void;
    }
    export class GLoader extends GObject { url: string; }
    export class GLoader3D extends GLoader {}
    export class GTextField extends GObject { text: string; }
    export class GRichTextField extends GTextField {}
    export class GGroup extends GObject {}
    export class GProgressBar extends GComponent { min: number; max: number; value: number; }

    export const Event: { CLICK_ITEM: string; STATUS_CHANGED: string };
    export const RelationType: { Size: number };
    export const UIPackage: {
        getByName(name: string): unknown;
        loadPackage(path: string, callback: (error: unknown) => void): void;
        createObject(pkg: string, comp: string): GObject | null;
    };
}

declare module "cc/env" {
    /** 微信小游戏等小游戏平台构建时为 true */
    export const MINIGAME: boolean;
    export const DEV: boolean;
    export const EDITOR: boolean;
    export const PREVIEW: boolean;
}
