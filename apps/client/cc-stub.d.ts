/**
 * cc 引擎类型桩（仅供 `npm run typecheck:client:legacy` 用，不入 Cocos 运行时/构建；回流自 Arthur）。
 *
 * Creator 运行时用真 cc；这里只声明**客户端实际用到**的 cc API 面，让 tsc 能离线对
 * apps/client/src 做类型/导入路径检查（CI 不开 Creator 也能跑）。这是 legacy 配置的桩；完整
 * `npm run typecheck:client` 探针使用 `client-test-stubs.d.ts`，还会覆盖客户端 tests；根
 * `npm run typecheck` 会同时运行两个探针。
 * SC1-B1 另按 Creator 3.8.8 预声明 SC1–SC4 已明确的 3D 消费面，签名/只读属性由类型契约检验。
 * 新用到的 cc API 若报「没有该成员」，在相应桩中补一行即可；真实引擎仍由 Creator 侧把关。
 *
 * ⚠ 不要给 Component 声明生命周期（onLoad/start/update…）：子类以 protected/public 自由
 *   覆写，框架靠鸭子类型调用，声明了反而与子类覆写修饰符冲突（Arthur 实测教训）。
 */
declare module "cc" {
    /** SC1-B3: strict mode rejects objects already queued for destruction (cc.d.ts:23415). */
    export function isValid(value: unknown, strictMode?: boolean): boolean;
    export const screen: { readonly windowSize: { width: number; height: number } };
    export class Vec2 { constructor(x?: number, y?: number); x: number; y: number; }
    /** ⚠ 给 Material.setProperty 设 vec4 uniform 用：⛔ 传 JS 数组设不进去（静默失败）。 */
    export class Vec4 { constructor(x?: number, y?: number, z?: number, w?: number);
        x: number; y: number; z: number; w: number; }
    export class Vec3 { constructor(x?: number, y?: number, z?: number); x: number; y: number; z: number; set(x: number, y: number, z?: number): this; }
    export class Color { constructor(r?: number, g?: number, b?: number, a?: number); r: number; g: number; b: number; a: number; }
    export class Rect { constructor(x?: number, y?: number, width?: number, height?: number); x: number; y: number; width: number; height: number; }

    export class EventTouch { getUILocation(out?: Vec2): Vec2; getID(): number; propagationStopped: boolean; }
    export class EventMouse { getUILocation(out?: Vec2): Vec2; getButton(): number; getScrollY(): number; }

    export class UITransform {
        setContentSize(width: number, height: number): void;
        width: number;
        height: number;
        anchorX: number;
        anchorY: number;
        convertToNodeSpaceAR(world: Vec3, out?: Vec3): Vec3;
    }
    export class BlockInputEvents extends Component {}
    export class Button extends Component {}

    export class Graphics {
        static LineJoin: { BEVEL: number; ROUND: number; MITER: number };
        static LineCap: { BUTT: number; ROUND: number; SQUARE: number };
        node: Node;
        lineWidth: number;
        lineJoin: number;
        lineCap: number;
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

    export class Texture2D extends Asset {
        width: number; height: number;
        reset(info: { width: number; height: number; format?: number; mipmapLevel?: number }): void;
        uploadData(source: Uint8Array): void;
        destroy(): boolean;
        /** ⚠ 权重图要 LINEAR：默认可能是 POINT，放大后会露出烘焙分辨率的方块。 */
        setFilters(min: number, mag: number): void;
        setWrapMode(s: number, t: number): void;
        static Filter: { NONE: number; LINEAR: number; NEAREST: number };
        static WrapMode: { REPEAT: number; CLAMP_TO_EDGE: number };
        static PixelFormat: { RGBA8888: number };
    }
    export class JsonAsset extends Asset { json: unknown; }
    /** ⚠ `.bytes` / `.bin` 资源导入成它；mapOriginal 的 16 类地形显示层走这条（塞不进 shared）。 */
    export class BufferAsset extends Asset { buffer(): ArrayBuffer; }
    export class SpriteFrame extends Asset { texture: Texture2D | null; rect: Rect; rotated: boolean;
        insetTop: number; insetBottom: number; insetLeft: number; insetRight: number;
        /** ⚠ 引擎侧只有 getter：赋值会抛 TypeError，故声明为 readonly 让 typecheck 拦下。 */
        readonly pivot: Vec2;
        /** ⚠ 动态图集打包开关；⛔ 自建的纯色帧必须置 false，否则会打崩渲染循环，见 view/uiPlate.ts。 */
        packable: boolean; destroy(): boolean; }
    export class Sprite extends Component {
        spriteFrame: SpriteFrame | null; color: Color; sizeMode: number; type: number;
        static SizeMode: { CUSTOM: number; TRIMMED: number; RAW: number };
        static Type: { SIMPLE: number; SLICED: number; TILED: number; FILLED: number };
    }
    export class Label extends Component {
        string: string; fontSize: number; color: Color; horizontalAlign: number; verticalAlign: number;
        lineHeight: number; overflow: number; enableWrapText: boolean; isBold: boolean;
        static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
        static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
        static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
    }
    export class EditBox extends Component {
      string: string; placeholder: string; maxLength: number; textLabel: Label | null; placeholderLabel: Label | null;
      static EventType: { EDITING_DID_BEGAN: string; TEXT_CHANGED: string; EDITING_DID_ENDED: string; EDITING_RETURN: string };
    }
    export class AudioClip extends Asset { duration: number; }
  /** 动态网格的逐帧几何。⚠ 索引字段叫 indices16/indices32，⛔ 没有 indices。 */
  export interface DynamicGeometry {
    positions: Float32Array;
    uvs?: Float32Array;
    colors?: Float32Array;
    indices16?: Uint16Array;
    minPos?: Vec3;
    maxPos?: Vec3;
  }
  export class Mesh extends Asset {
    /** ⚠ 只有 createDynamicMesh 造出的网格能更新；静态网格会被引擎 warnID(14200) 拒绝。 */
    updateSubMesh(primitiveIndex: number, geometry: DynamicGeometry): void;
    destroy(): boolean;
  }
  export class Material extends Asset {
    copy(source: Material, overrides?: { defines?: Record<string, boolean | number> }): void;
    initialize(options: {
      /** ⚠ 内置 effect 用名字；**自定义 .effect 必须传 effectAsset**（名字查不到）。 */
      effectName?: string;
      effectAsset?: EffectAsset;
      technique?: number;
      defines?: Record<string, unknown>;
      states?: Record<string, unknown>;
    }): void;
    setProperty(name: string, value: unknown): void;
    destroy(): boolean;
  }
  export class EffectAsset extends Asset {
    static get(name: string): { techniques: ReadonlyArray<{ name?: string }> } | null;

  }
  /**
   * ⚠ 引擎侧的 UIMeshRenderer **既没有 mesh 也没有 material**——它只是 UI 桥，在 onLoad 里查一次
   * 同节点的 ModelRenderer。⛔ 别再往它身上写这两个字段（那是 S5-05 记录的 F2 缺陷）。
   */
  export class UIMeshRenderer extends Component {}
  /** ⚠ 在 cc 模块里导出，但**不在** cc 全局对象上（全局那份的旧名是 ModelComponent）。 */
  export class MeshRenderer extends Component {
      sharedMaterials: (Material | null)[];
      setMaterial(material: Material | null, index: number): void;
      mesh: Mesh | null; material: Material | null;
      /** ⚠ 每次 mesh.updateSubMesh 之后必须调用：它才会把新的顶点/索引数同步进 InputAssembler。 */
      onGeometryChanged(): void;
    }
  export namespace gfx {
    const CullMode: { NONE: number; FRONT: number; BACK: number };
  }
  export const utils: {
    MeshUtils: {
      /** ⚠ options 是整体默认、不是逐字段合并，三个字段必须一起给全。 */
      createDynamicMesh(
        primitiveIndex: number,
        geometry: DynamicGeometry,
        out: Mesh | undefined,
        options: { maxSubMeshes: number; maxSubMeshVertices: number; maxSubMeshIndices: number },
      ): Mesh;
    };
  };
    export class AudioSource extends Component { playOneShot(clip: AudioClip, volumeScale?: number): void; play(): void; stop(): void; }
    export const resources: AssetManager.Bundle;

    export class Node {
        lookAt(target: Readonly<Vec3>, up?: Readonly<Vec3>): void;
        rotation: Readonly<Quat>; worldPosition: Readonly<Vec3>;
        setRotation(rotation: Readonly<Quat>): void;
        setRotation(x: number, y: number, z: number, w: number): void;
        setWorldPosition(position: Vec3): void;
        setWorldPosition(x: number, y: number, z: number): void;
        setRotationFromEuler(x: number, y: number, z: number): void;
        getComponentsInChildren<T>(type: new (...args: never[]) => T): T[];
        pauseSystemEvents(recursive?: boolean): void;
        resumeSystemEvents(recursive?: boolean): void;
        getChildByName(name: string): Node | null;
        constructor(name?: string);
        name: string;
        layer: number;
        active: boolean;
        activeInHierarchy: boolean;
        dispatchEvent(event: unknown): void;
        parent: Node | null;
        children: Node[];
        isValid: boolean;
        position: Vec3;
        scale: Vec3;
        angle: number;
        static EventType: { TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string; SIZE_CHANGED: string;
          MOUSE_DOWN: string; MOUSE_MOVE: string; MOUSE_UP: string; MOUSE_WHEEL: string; MOUSE_LEAVE: string };
        addChild(child: Node): void;
        insertChild(child: Node, index: number): void;
        removeFromParent(): void;
        destroy(): boolean;
        setSiblingIndex(index: number): void;
        setPosition(position: Vec3): void; setPosition(x: number, y: number, z?: number): void;
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

    export class ScrollView extends Component {
        content: Node | null; horizontal: boolean; vertical: boolean;
        inertia: boolean; brake: number; elastic: boolean; cancelInnerEvents: boolean;
        getScrollOffset(): Vec2;
        getMaxScrollOffset(): Vec2;
        scrollToOffset(offset: Vec2, timeInSecond?: number, attenuated?: boolean): void;
        scrollToTop(timeInSecond?: number): void;
        stopAutoScroll(): void;
    }
    export class Mask extends Component {
        static Type: { GRAPHICS_RECT: number };
        type: number;
    }
    export class Canvas extends Component {}

        /** 引擎内置资源表；⚠ `default-spriteframe` 是共用的 2×2 全白图，见 view/uiPlate.ts。 */
    export const builtinResMgr: { get<T>(name: string): T };
    export const director: {
      on(type: string, callback: () => void, target?: unknown): void;
      off(type: string, callback: () => void, target?: unknown): void;
      root: { dataPoolManager: { jointTexturePool: {
        registerCustomTextureLayouts(layouts: { textureLength: number; contents: { skeleton: number; clips: number[] }[] }[]): void;
      } } } | null;
      once(type: string, callback: () => void): void;
      /** Creator 3.8.8 Scene.globals is present; getScene may return null before launch. */
      getScene(): Scene | null;
    };
    export const view: {
        on(type: string, callback: () => void, target?: unknown): void;
        off(type: string, callback: () => void, target?: unknown): void;
        setDesignResolutionSize(width: number, height: number, policy: unknown): void;
        getVisibleSize(): { width: number; height: number };
        getVisibleOrigin(): Vec2;
        getViewportRect(): Rect;
        getScaleX(): number;
        getScaleY(): number;
    };
    export const ResolutionPolicy: { FIXED_WIDTH: unknown };
    export const sys: {
        getSafeAreaRect(): { x: number; y: number; width: number; height: number };
        localStorage: Storage;
    };

    /** cc.d.ts:25278–25357; custom names use nameToLayer, never an open enum index. */
    export const Layers: {
        Enum: { NONE: number; IGNORE_RAYCAST: number; GIZMOS: number; EDITOR: number; UI_3D: number;
            SCENE_GIZMO: number; UI_2D: number; PROFILER: number; DEFAULT: number; ALL: number };
        nameToLayer(name: string): number;
    };

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
            MOUSE_DOWN: string;
            MOUSE_MOVE: string;
            MOUSE_UP: string;
            MOUSE_WHEEL: string;
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
        isAncestorOf(object: GObject): boolean;
        opaque: boolean;
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
        inputProcessor: { enabled: boolean; getAllTouches(): number[]; cancelClick(id: number): void };
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
    export class GTextField extends GObject { text: string; fontSize: number; color: import("cc").Color; }
    export class GRichTextField extends GTextField {}
    export class GGroup extends GObject {}
    export class GProgressBar extends GComponent { min: number; max: number; value: number; }

    export class Event {
        constructor(type: string, bubbles?: boolean);
        static CLICK_ITEM: string; static STATUS_CHANGED: string; static TOUCH_END: string;
        touchId: number; button: number; pos: { x: number; y: number }; initiator: GObject;
    }
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

/**
 * SC1–SC4 3D consumer surface, checked against Creator 3.8.8 cc.d.ts.
 * See stage3dTypes.test.ts for both probes and misuse checks. Keep the two
 * declarations equal here; this is type-only and never supplies engine runtime.
 */
declare module "cc" {
    /** cc.d.ts:28644,28809–28832: addRef/decRef return Asset, not the subclass. */
    export class Asset {
        constructor(name?: string);
        name: string;
        readonly uuid: string;
        readonly refCount: number;
        readonly isValid: boolean;
        addRef(): Asset;
        decRef(autoRelease?: boolean): Asset;
        destroy(): boolean;
    }
    export class Prefab extends Asset { constructor(); data: Node; }
    export class AnimationClip extends Asset { readonly hash: number; }
    export class Skeleton extends Asset { readonly hash: number; readonly joints: string[]; }
    export class TextureCube extends Asset { readonly width: number; readonly height: number; }
    export function instantiate(prefab: Prefab): Node;
    export function instantiate<T extends Node>(original: T): T;

    /** cc.d.ts:30981,31132–31135,31383–31419; only the typed loading forms are needed. */
    export namespace AssetManager {
        export class Bundle {
            readonly name: string;
            readonly deps: string[];
            load<T extends Asset>(path: string, type: (new (...args: never[]) => T) | null,
                onComplete?: ((error: Error | null, asset: T) => void) | null): void;
            load<T extends Asset>(paths: string[], type: (new (...args: never[]) => T) | null,
                onComplete?: ((error: Error | null, assets: T[]) => void) | null): void;
            load<T extends Asset>(path: string, onComplete?: ((error: Error | null, asset: T) => void) | null): void;
            get<T extends Asset>(path: string, type?: (new (...args: never[]) => T) | null): T | null;
            release(path: string, type?: (new (...args: never[]) => Asset) | null): void;
            releaseAll(): void;
        }
    }
    export class AssetManager {
        getBundle(name: string): AssetManager.Bundle | null;
        loadBundle(nameOrUrl: string, onComplete?: ((error: Error | null, bundle: AssetManager.Bundle) => void) | null): void;
        loadBundle(nameOrUrl: string, options: { version?: string } | null,
            onComplete?: ((error: Error | null, bundle: AssetManager.Bundle) => void) | null): void;
        removeBundle(bundle: AssetManager.Bundle): void;
    }
    export const assetManager: AssetManager;

    /** cc.d.ts:15566–15846. Structural quaternion arguments retain generic output identity. */
    export class Quat {
        constructor(other: Quat);
        constructor(x?: number, y?: number, z?: number, w?: number);
        x: number; y: number; z: number; w: number;
        static IDENTITY: Readonly<Quat>;
        static copy<Out extends { x: number; y: number; z: number; w: number }>(out: Out,
            value: { x: number; y: number; z: number; w: number }): Out;
        static fromEuler<Out extends { x: number; y: number; z: number; w: number }>(out: Out,
            x: number, y: number, z: number): Out;
        static slerp<Out extends { x: number; y: number; z: number; w: number }>(out: Out,
            from: { x: number; y: number; z: number; w: number },
            to: { x: number; y: number; z: number; w: number }, ratio: number): Out;
        clone(): Quat;
        set(other: Quat): Quat;
        set(x?: number, y?: number, z?: number, w?: number): Quat;
    }
    /** cc.d.ts:18382–18485,18789–18954; picking uses explicit origin and direction. */
    export namespace geometry {
        export class Ray {
            constructor(ox?: number, oy?: number, oz?: number, dx?: number, dy?: number, dz?: number);
            o: Vec3; d: Vec3;
            static fromPoints(out: Ray, origin: Vec3, target: Vec3): Ray;
            computeHit(out: { x: number; y: number; z: number }, distance: number): void;
        }
        export class AABB {
            constructor(px?: number, py?: number, pz?: number, hw?: number, hh?: number, hl?: number);
            center: Vec3; halfExtents: Vec3;
            static fromPoints(out: AABB, min: { x: number; y: number; z: number },
                max: { x: number; y: number; z: number }): AABB;
            getBoundary(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): void;
            clone(): AABB;
        }
    }
    export namespace renderer {
        export namespace scene {
            export enum CameraProjection { ORTHO = 0, PERSPECTIVE = 1 }
        }
    }
    export namespace gfx {
        export enum ClearFlagBit { NONE = 0, COLOR = 1, DEPTH = 2, STENCIL = 4, DEPTH_STENCIL = 6, ALL = 7 }
    }
    /** cc.d.ts:27003–27247. Component ray arguments differ from renderer.scene.Camera. */
    export class Camera extends Component {
        /** SC1-B3: same-frame picks refresh the public renderer camera (cc.d.ts:27090,11313). */
        readonly camera: { update(forceUpdate?: boolean): void };
        static ProjectionType: typeof renderer.scene.CameraProjection;
        static ClearFlag: { SKYBOX: number; SOLID_COLOR: gfx.ClearFlagBit; DEPTH_ONLY: gfx.ClearFlagBit; DONT_CLEAR: gfx.ClearFlagBit };
        projection: renderer.scene.CameraProjection; priority: number; visibility: number; fov: number; orthoHeight: number;
        near: number; far: number; clearFlags: gfx.ClearFlagBit; clearColor: Readonly<Color>; rect: Rect;
        screenPointToRay(x: number, y: number, out?: geometry.Ray): geometry.Ray;
        worldToScreen(worldPosition: Vec3 | Readonly<Vec3>, out?: Vec3): Vec3;
        screenToWorld(screenPosition: Vec3, out?: Vec3): Vec3;
    }
    /** cc.d.ts:4909–4951; global shadow settings remain on SceneGlobals. */
    export class DirectionalLight extends Component {
        illuminance: number; color: Readonly<Color>; shadowEnabled: boolean; shadowBias: number;
        shadowNormalBias: number; shadowDistance: number;
    }
    export class AnimationState {
        constructor(clip: AnimationClip, name?: string);
        readonly clip: AnimationClip; readonly name: string;
        time: number; speed: number; readonly isPlaying: boolean;
    }
    /** cc.d.ts:6461,6500,6530,51756–51833. play returns void, not a state. */
    export class Socket { constructor(path?: string, target?: Node | null); path: string; target: Node | null; }
    export class SkeletalAnimation extends Component {
        static Socket: typeof Socket;
        useBakedAnimation: boolean;
        clips: (AnimationClip | null)[];
        sockets: Socket[];
        addClip(clip: AnimationClip, name?: string): AnimationState;
        getState(name: string): AnimationState;
        play(name?: string): void;
        stop(): void;
        createSocket(path: string): Node | null;
    }
    export class SkinnedMeshRenderer extends MeshRenderer {
        skeleton: Skeleton | null; skinningRoot: Node | null;
        uploadAnimation(clip: AnimationClip | null): void;
        setUseBakedAnimation(value?: boolean, force?: boolean): void;
    }
    /** cc.d.ts:5328–5405; batch renderer is available but does not imply cross-atlas instancing. */
    export class SkinnedMeshUnit {
        mesh: Mesh | null; skeleton: Skeleton | null; material: Material | null;
        offset: Vec2; size: Vec2; copyFrom: SkinnedMeshRenderer | null;
    }
    export class SkinnedMeshBatchRenderer extends SkinnedMeshRenderer {
        atlasSize: number; batchableTextureNames: string[]; units: SkinnedMeshUnit[];
        cook(): void;
    }
    /** cc.d.ts:46592–46880. Set capacity before activating the component. */
    export class ParticleSystem extends Component {
        play(): void; stop(): void; stopEmitting(): void; clear(): void;
        capacity: number; loop: boolean; duration: number; playOnAwake: boolean;
        processor: { getDefaultMaterial(): Material | null };
    }
    /** cc.d.ts:5407–5554; optional engine LOD surface, not the framework's distance policy. */
    export class LOD {
        screenUsagePercentage: number; renderers: readonly MeshRenderer[];
    }
    export class LODGroup extends Component {
        readonly lodCount: number; objectSize: number; LODs: readonly LOD[];
        insertLOD(index: number, screenUsagePercentage?: number, lod?: LOD): LOD;
        getLOD(index: number): LOD | null;
        forceLOD(lodLevel: number): void;
        recalculateBounds(): void;
    }
    /** cc.d.ts:46504–46526. */
    export class Billboard extends Component { texture: Texture2D | null; width: number; height: number; rotation: number; }

    /** cc.d.ts:26408–26970. Use readable color properties for snapshot/restore. */
    export class AmbientInfo {
        skyLightingColor: Color; groundLightingColor: Color; skyIllum: number;
    }
    export class SkyboxInfo {
        enabled: boolean; useIBL: boolean; useHDR: boolean; applyDiffuseMap: boolean;
        envmap: TextureCube | null; diffuseMap: TextureCube | null; reflectionMap: TextureCube | null;
        skyboxMaterial: Material | null; rotationAngle: number;
    }
    export class FogInfo {
        static FogType: { LINEAR: number; EXP: number; EXP_SQUARED: number; LAYERED: number };
        enabled: boolean; accurate: boolean; type: number; fogColor: Readonly<Color>;
        fogDensity: number; fogStart: number; fogEnd: number; fogAtten: number; fogTop: number; fogRange: number;
    }
    export class ShadowsInfo {
        enabled: boolean; type: number; shadowColor: Readonly<Color>; planeDirection: Readonly<Vec3>;
        planeHeight: number; planeBias: number; maxReceived: number; shadowMapSize: number;
    }
    export class PostSettingsInfo { toneMappingType: number; }
    export class SceneGlobals {
        skybox: SkyboxInfo; fog: FogInfo; shadows: ShadowsInfo; postSettings: PostSettingsInfo; ambient: AmbientInfo;
    }
    export class Scene extends Node { constructor(name: string); readonly globals: SceneGlobals; }

    /** cc.d.ts:55707–56115. Subset for entity/Vfx transforms with typed property names. */
    export interface ITweenOption<T extends object> {
        easing?: "linear" | "quadIn" | "quadOut" | "quadInOut" | ((ratio: number) => number);
        onStart?: (target?: T) => void;
        onUpdate?: (target?: T, ratio?: number) => void;
        onComplete?: (target?: T) => void;
    }
    type TweenProperties<T> = {
        [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]?: T[K];
    };
    export class Tween<T extends object = object> {
        constructor(target?: T | null);
        to(duration: number, props: TweenProperties<T>, options?: ITweenOption<T>): Tween<T>;
        by(duration: number, props: TweenProperties<T>, options?: ITweenOption<T>): Tween<T>;
        set(props: TweenProperties<T>): Tween<T>;
        delay(duration: number): Tween<T>;
        call(callback: (target?: T) => void): Tween<T>;
        start(time?: number): Tween<T>;
        stop(): Tween<T>;
        readonly running: boolean;
        static stopAllByTarget<T extends object>(target?: T): void;
    }
    export function tween<T extends object = object>(target?: T): Tween<T>;
    export const Director: { EVENT_AFTER_DRAW: string; EVENT_AFTER_UPDATE: string; EVENT_BEFORE_SCENE_LAUNCH: string };
}
