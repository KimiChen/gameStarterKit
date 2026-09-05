/**
 * Node-side type-only stubs for the Cocos/FairyGUI surface used by Main and
 * view/*.ts. These declarations are referenced only by tsconfig.test.json;
 * Creator builds use the real engine declarations.
 */
declare module "cc" {
  export class Vec2 { constructor(x?: number, y?: number); x: number; y: number; }
  export class Vec3 { constructor(x?: number, y?: number, z?: number); x: number; y: number; z: number; set(x: number, y: number, z?: number): this; }
  export class Color { constructor(r?: number, g?: number, b?: number, a?: number); r: number; g: number; b: number; a: number; }
  export class Rect { constructor(x?: number, y?: number, width?: number, height?: number); x: number; y: number; width: number; height: number; }
  export class Node {
    getChildByName(name: string): Node | null;
    constructor(name?: string);
    name: string; layer: number; active: boolean; parent: Node | null; children: Node[]; isValid: boolean;
    position: Vec3; scale: Vec3; angle: number;
    static EventType: { TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string };
    addChild(child: Node): void; removeFromParent(): void; destroy(): boolean; setSiblingIndex(index: number): void;
    setPosition(x: number, y: number, z?: number): void; setScale(x: number, y: number, z?: number): void;
    on(type: string, callback: (...args: any[]) => unknown, target?: unknown): void;
    off(type: string, callback: (...args: any[]) => unknown, target?: unknown): void;
    getComponent<T>(type: new (...args: never[]) => T): T | null;
    getComponentInChildren<T>(type: new (...args: never[]) => T): T | null;
    addComponent<T>(type: new (...args: never[]) => T): T;
  }
  export class Component { node: Node; enabled: boolean; destroy(): boolean; }
  export class UITransform {
    width: number; height: number; anchorX: number; anchorY: number;
    convertToNodeSpaceAR(world: Vec3, out?: Vec3): Vec3;
  }
  export class Graphics {
    node: Node; lineWidth: number; fillColor: Color; strokeColor: Color;
    clear(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
    stroke(): void; fill(): void; circle(x: number, y: number, radius: number): void;
    rect(x: number, y: number, width: number, height: number): void;
  }
  export class Texture2D { width: number; height: number; }
  export class JsonAsset { json: unknown; }
  export class SpriteFrame { texture: Texture2D | null; rect: Rect; rotated: boolean;
      /** ⚠ 引擎侧只有 getter：赋值会抛 TypeError，故声明为 readonly 让 typecheck 拦下。 */
      readonly pivot: Vec2; }
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
  /** 动态网格的逐帧几何。⚠ 索引字段叫 indices16/indices32，⛔ 没有 indices。 */
  export interface DynamicGeometry {
    positions: Float32Array;
    uvs?: Float32Array;
    colors?: Float32Array;
    indices16?: Uint16Array;
    minPos?: Vec3;
    maxPos?: Vec3;
  }
  export class Mesh {
    /** ⚠ 只有 createDynamicMesh 造出的网格能更新；静态网格会被引擎 warnID(14200) 拒绝。 */
    updateSubMesh(primitiveIndex: number, geometry: DynamicGeometry): void;
    destroy(): boolean;
  }
  export class Material {
    initialize(options: {
      effectName: string;
      technique?: number;
      defines?: Record<string, unknown>;
      states?: Record<string, unknown>;
    }): void;
    setProperty(name: string, value: unknown): void;
    destroy(): boolean;
  }
  export class EffectAsset {
    static get(name: string): { techniques: ReadonlyArray<{ name?: string }> } | null;
  }
  /**
   * ⚠ 引擎侧的 UIMeshRenderer **既没有 mesh 也没有 material**——它只是 UI 桥，在 onLoad 里查一次
   * 同节点的 ModelRenderer。⛔ 别再往它身上写这两个字段（那是 S5-05 记录的 F2 缺陷）。
   */
  export class UIMeshRenderer extends Component {}
  /** ⚠ 在 cc 模块里导出，但**不在** cc 全局对象上（全局那份的旧名是 ModelComponent）。 */
  export class MeshRenderer extends Component {
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
  export const resources: {
    load<T>(path: string, type: new (...args: never[]) => T, callback: (error: Error | null, asset: T) => void): void;
  };
  export class Canvas extends Component {}
  export class EventTouch { getUILocation(out?: Vec2): Vec2; getID(): number; }
  export const input: {
    on(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
    off(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
  };
  export const Input: { EventType: { TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string } };
  export const _decorator: {
    ccclass(name?: string): ClassDecorator;
    property(options?: unknown): PropertyDecorator;
  };
  export const view: {
    setDesignResolutionSize(width: number, height: number, policy: unknown): void;
    getVisibleSize(): { width: number; height: number };
  };
  export const ResolutionPolicy: { FIXED_WIDTH: unknown };
  export const director: {
    /** ⚠ 场景根同时挂着渲染全局设置；`globals` 在部分宿主下可能缺席，调用方需可选取值。 */
    getScene(): (Node & { globals?: { postSettings?: { toneMappingType: number } } }) | null;
  };
  export const sys: {
    getSafeAreaRect(): { x: number; y: number; width: number; height: number };
    localStorage: Storage;
  };
  export const Layers: { Enum: { UI_2D: number; DEFAULT: number; [key: string]: number } };
  export const game: {
    on(type: string, callback: () => void, target?: unknown): unknown;
    off(type: string, callback: () => void, target?: unknown): unknown;
  };
  export const Game: { EVENT_HIDE: string; EVENT_SHOW: string };
}

declare module "cc/env" {
  export const MINIGAME: boolean;
  export const DEV: boolean;
  export const EDITOR: boolean;
  export const PREVIEW: boolean;
}

declare module "db://fairygui-cc/fairygui.mjs" {
  export class GObject {
    name: string; parent: GComponent | null; node: import("cc").Node;
    x: number; y: number; width: number; height: number; visible: boolean;
    touchable: boolean; grayed: boolean; enabled: boolean; title: string; icon: string;
    onClick(callback: (...args: any[]) => unknown, target?: unknown): void;
    on(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
    off(type: unknown, callback: (...args: any[]) => unknown, target?: unknown): void;
    removeFromParent(): void; dispose(): void;
    get asCom(): GComponent;
  }
  export class GComponent extends GObject {
    static inst: GComponent;
    numChildren: number; width: number; height: number;
    addChild(child: GObject): GObject; setChildIndex(child: GObject, index: number): void;
    getChild<T extends GObject = GObject>(name: string): T; getChildAt<T extends GObject = GObject>(index: number): T;
    setSize(width: number, height: number): void;
    addRelation(target: GObject, relation: number): void;
    getController(name: string): { selectedIndex: number };
  }
  export class GRoot extends GComponent {
    static inst: GRoot; inputProcessor: { enabled: boolean }; onWinResize(): void;
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

declare module "@colyseus/sdk" {
  export class Client {
    auth: { token: string };
    constructor(endpoint: string);
    joinOrCreate<T = any>(roomName: string, options?: Record<string, unknown>): Promise<Room<T>>;
  }
  export class Room<T = any> {
    roomId: string; sessionId: string; state: T;
    onMessage(type: string, callback: (message: any) => void): void;
    onStateChange(callback: (state: T) => void): void;
    onLeave(callback: (code: number, reason?: string) => void): void;
    send(type: string, message?: unknown): void;
    leave(consented?: boolean): Promise<void>;
  }
}

declare module "*.mjs" {
  export const DEFAULT_PORT: number;
  export function devEnvPort(file: string): number;
  export function devEnvContent(file: string): string;
  export const FINGERPRINT_FILE: string;
  export function computeFingerprint(root?: string): string;
  // scripts/protocol-fingerprint.mjs（§4.8 拆分后：两个协议身份整数 + 新锁行解析）
  export function parseProtocolVersions(source: string): { gameRoom: number; lobby: number };
  export function readProtocolVersions(root?: string): { gameRoom: number; lobby: number };
  export function parseFingerprintLock(text: string): { gameRoom: number; lobby: number; hash: string };
  export function runCli(argv: readonly string[]): number;
  export const BREAKER_MIN: number;
  export const BREAKER_RATIO: number;
  export function breakerTripped(args: { removed: number; srcCount: number }): boolean;
  export function forceRequested(argv?: string[]): boolean;
  export function breakerMessage(tag: string, removed: number, srcCount: number): string;
  export function packageNames(args: { name: string; scope?: string | null }): Record<string, string>;
  export function assertPackageNames(metadata: { name: string; scope?: string | null; packages?: Record<string, string> }): void;
  export function verifyProjectMetadata(root: string): { ok: boolean; errors: string[]; metadata?: unknown };
  // scripts/verify-toolchain.mjs 导出的验证图声明表（单源，toolchainContract 直接 import）
  export const ROOT_TOOL_DEPENDENCIES: string[];
  export const TYPECHECK_COMMANDS: string[];
  export const VERIFY_SYNC_COMMANDS: string[];
  export const VERIFY_CORE_COMMANDS: string[];
  export const VERIFY_ALL_COMMANDS: string[];
  export const CLIENT_TEST_COMMAND: string;
  export const FGUI_TEST_COMMAND: string;
  export const INVENTORY_TEST_COMMAND: string;
  export const LAUNCHER_MATRIX_COMMAND: string;
  export const NPM_REFERENCE_MATRIX_COMMAND: string;
  export const AGGREGATE_CHAIN_MATRIX_COMMAND: string;
  export const SYNC_MIRROR_MATRIX_COMMAND: string;
  export const TOOLCHAIN_RUNTIME_MATRIX_COMMAND: string;
  export const CHAIN_SCRIPTS: Record<string, string[]>;
  export const EXACT_SCRIPTS: Record<string, string>;
  // scripts/protected-paths-lock.mjs（受保护手写路径的字节锁）
  export const LOCK_RELATIVE: string;
  export function collectLockedFiles(root?: string): string[];
  export function computeLockEntries(root?: string): Map<string, string>;
  export function parseLock(text: string): Map<string, string>;
  export function renderLock(entries: Map<string, string>): string;
  export function diffLock(locked: Map<string, string>, current: Map<string, string>): string[];
}
