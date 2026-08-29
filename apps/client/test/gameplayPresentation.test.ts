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
        return component;
    }

    destroy(): void {
        this.destroyed = true;
        this.parent?.removeChild(this);
    }
}

class FakeGraphics {
    node!: FakeNode;
}

class FakeUITransform {
    convertToNodeSpaceAR(value: FakeVec3): FakeVec3 { return value; }
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
        Node: FakeNode,
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
        // Import the catalog only after the cc loader is installed. The catalog
        // itself must stay free of a static BallMoveView dependency.
        const { registerDefaultGameplays } = await import("../src/gameplay/catalog");
        const registry = new GameplayRegistry<any, any>();
        unregister = registerDefaultGameplays(registry, {
            presentationHost: { node: host as never, dispatchInput: (value) => dispatched.push(value) },
            ballMoveJoiner: joiner,
            idleJoiner: {
                join: () => ({ ready: Promise.resolve({ kind: "idle", pulse() {} }), async leave() {} }),
            },
        });
        const controller = new RoomController<any, any>();
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
