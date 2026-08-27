/**
 * Node-side type-only stubs for the Cocos/FairyGUI surface used by Main and
 * view/*.ts. These declarations are referenced only by tsconfig.test.json;
 * Creator builds use the real engine declarations.
 */
declare module "cc" {
  export class Vec2 { constructor(x?: number, y?: number); x: number; y: number; }
  export class Vec3 { constructor(x?: number, y?: number, z?: number); x: number; y: number; z: number; set(x: number, y: number, z?: number): this; }
  export class Color { constructor(r?: number, g?: number, b?: number, a?: number); r: number; g: number; b: number; a: number; }
  export class Node {
    constructor(name?: string);
    name: string; layer: number; active: boolean; parent: Node | null; children: Node[]; isValid: boolean;
    addChild(child: Node): void; destroy(): boolean; setSiblingIndex(index: number): void;
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
  export class Canvas extends Component {}
  export class EventTouch { getUILocation(out?: Vec2): Vec2; }
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
  export function computeFingerprint(): string;
  export function parseProtocolVersion(source: string): number;
  export function readProtocolVersion(): number;
  export const BREAKER_MIN: number;
  export const BREAKER_RATIO: number;
  export function breakerTripped(args: { removed: number; srcCount: number }): boolean;
  export function forceRequested(argv?: string[]): boolean;
  export function breakerMessage(tag: string, removed: number, srcCount: number): string;
}
