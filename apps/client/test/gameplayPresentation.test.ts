import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { GameplayRegistry, RoomController } from "../src/logic/gameplay";

type LoaderModule = {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

class FakeNode {
    layer = 7;
    destroyed = false;
    parent: FakeNode | null = null;
    readonly children: FakeNode[] = [];
    readonly components: unknown[] = [];
    position = { x: 0, y: 0, z: 0 };

    constructor(readonly name = "node") {}

    addChild(child: FakeNode): void {
        child.parent?.removeChild(child);
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: FakeNode): void {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        if (child.parent === this) child.parent = null;
    }

    addComponent<T>(Constructor: new () => T): T {
        const component = new Constructor() as T & { node?: FakeNode };
        if ("node" in component) component.node = this;
        this.components.push(component);
        return component;
    }

    /** 视图会给「离开」按钮取 host 的 UITransform 并摆位、挂 TOUCH_END——桩要覆盖这三个面。 */
    getComponent<T>(Constructor: new () => T): T | null {
        return (this.components.find((component) => component instanceof Constructor) as T | undefined) ?? null;
    }

    setPosition(x: number, y: number, z = 0): void {
        this.position = { x, y, z };
    }

    on(): void {}

    off(): void {}

    destroy(): void {
        this.destroyed = true;
        this.parent?.removeChild(this);
    }
}

class FakeGraphics {
    node!: FakeNode;
}

class FakeUITransform {
    width = 0;
    height = 0;
    convertToNodeSpaceAR(value: FakeVec3): FakeVec3 { return value; }
}

class FakeLabel {
    string = "";
    fontSize = 0;
    lineHeight = 0;
    color: unknown = null;
}

class FakeVec3 {
    x = 0;
    y = 0;
    z = 0;

    set(x: number, y: number, z: number): this {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
}

class FakeColor {
    constructor(
        readonly r: number,
        readonly g: number,
        readonly b: number,
        readonly a: number,
    ) {}
}

type Listener = { callback: (...args: any[]) => void; target: unknown };

function makeInput() {
    const listeners = new Map<string, Listener[]>();
    const input = {
        on(type: string, callback: (...args: any[]) => void, target: unknown): void {
            const entries = listeners.get(type) ?? [];
            entries.push({ callback, target });
            listeners.set(type, entries);
        },
        off(type: string, callback: (...args: any[]) => void, target: unknown): void {
            const entries = listeners.get(type) ?? [];
            listeners.set(type, entries.filter((entry) => entry.callback !== callback || entry.target !== target));
        },
        emit(type: string, ...args: any[]): void {
            for (const entry of [...(listeners.get(type) ?? [])]) entry.callback.apply(entry.target, args);
        },
        count(): number {
            return [...listeners.values()].reduce((sum, entries) => sum + entries.length, 0);
        },
    };
    return input;
}

function makeRoom() {
    const listener = () => () => {};
    return {
        roomId: "ball-room",
        sessionId: "self",
        dropping: false,
        onWelcome: listener,
        onPong: listener,
        onChat: listener,
        onSkillResult: listener,
        onError: listener,
        observePlayers: listener,
        move() {},
        clearMove() {},
        ping() {},
    };
}

test("gameplay catalog：正向动态 presentation factory 可挂载并在 stop 时卸载", async () => {
    const input = makeInput();
    const fakeCc = {
        Color: FakeColor,
        EventTouch: class {},
        Graphics: FakeGraphics,
        Input: {
            EventType: {
                TOUCH_START: "touch-start",
                TOUCH_MOVE: "touch-move",
                TOUCH_END: "touch-end",
                TOUCH_CANCEL: "touch-cancel",
            },
        },
        Label: FakeLabel,
        Node: Object.assign(FakeNode, { EventType: { TOUCH_END: "touch-end" } }),
        UITransform: FakeUITransform,
        Vec3: FakeVec3,
        input,
    };
    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;
    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
        if (request === "cc") return fakeCc;
        return originalLoad.call(this, request, parent, isMain);
    };

    const host = new FakeNode("host");
    const dispatched: unknown[] = [];
    const room = makeRoom();
    let leaveCalls = 0;
    const joiner = {
        join: () => ({
            ready: Promise.resolve(room),
            async leave() { leaveCalls++; },
        }),
    };
    let unregister: (() => void) | null = null;
    try {
        // Import the gameplay module only after the cc loader is installed. The
        // module itself must stay free of a static BallMoveView dependency
        // (BallMoveView 经字面量动态 import 挂接——铁律 10)。
        const { createGameplayModule } = await import("../src/gameplay/modes/ballMove/index");
        const { registerGameplayModule } = await import("../src/logic/gameplay/GameplayModule");
        const { createGameplayServices } = await import("../src/gameplay/services");
        const registry = new GameplayRegistry<any, any>();
        const controller = new RoomController<any, any>();
        // §7.7：View 输入回流经 generation-fenced GameplayInstanceHost → controller 桥。
        const services = createGameplayServices({
            controllerBridge: {
                currentGeneration: () => controller.currentGeneration,
                dispatchInput: (input) => {
                    dispatched.push(input);
                    return controller.input(input);
                },
                requestStop: (reason) => controller.stop(reason),
            },
            presentationHost: { node: host as never, dispatchInput: (value) => dispatched.push(value) },
        });
        unregister = registerGameplayModule(registry, {
            ...createGameplayModule(services),
            joiner,
        }, services.controllerBridge);
        assert.deepEqual(await controller.startRegistered(registry, "ballMove"), {
            status: "started",
            generation: 1,
            pluginId: "ballMove",
        });
        assert.equal(host.children.length, 1, "动态 factory 必须创建并挂载 BallMoveView layer");
        assert.equal(input.count(), 4, "BallMoveView mount 必须登记四个触摸监听");

        input.emit("touch-start", { getUILocation: () => ({ x: 12, y: 34 }) });
        assert.equal(dispatched.length, 1, "挂载后的 presentation 必须把触摸转发给 host");
        assert.equal((dispatched[0] as { type: string }).type, "target");

        await controller.stop({ kind: "manual" });
        assert.equal(host.children.length, 0, "stop 必须卸载动态创建的 view layer");
        assert.equal(input.count(), 0, "stop 必须释放 BallMoveView 的全部触摸监听");
        assert.equal(leaveCalls, 1, "stop 必须释放本次 room capability");
        input.emit("touch-start", { getUILocation: () => ({ x: 50, y: 60 }) });
        assert.equal(dispatched.length, 1, "卸载后不得继续转发触摸");
    } finally {
        await unregister?.();
        moduleApi._load = originalLoad;
    }
});
