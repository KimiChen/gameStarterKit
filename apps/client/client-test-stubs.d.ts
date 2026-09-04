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
    width: number; height: number;
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
  export class SpriteFrame { texture: Texture2D | null; rect: Rect; }
  export class Sprite extends Component { spriteFrame: SpriteFrame | null; color: Color; sizeMode: number; type: number; }
  export class Label extends Component { string: string; fontSize: number; color: Color; horizontalAlign: number; }
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
  export const director: { getScene(): Node | null };
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
