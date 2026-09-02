import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

type LoaderModule = {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

class FakeVec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}

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
        readonly a = 255,
    ) {}
}

class FakeRect {
    constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
    ) {}
}

class FakeUITransform {
    node!: FakeNode;
    width = 100;
    height = 100;

    convertToNodeSpaceAR(value: FakeVec3): FakeVec3 {
        let worldX = 0;
        let worldY = 0;
        let current: FakeNode | null = this.node;
        while (current) {
            worldX += current.position.x;
            worldY += current.position.y;
            current = current.parent;
        }
        return new FakeVec3(value.x - worldX, value.y - worldY, value.z);
    }
}

class FakeGraphics {
    node!: FakeNode;
    fillColor: FakeColor | null = null;
    strokeColor: FakeColor | null = null;
    lineWidth = 0;

    clear(): void {}
    rect(_x: number, _y: number, _width: number, _height: number): void {}
    circle(_x: number, _y: number, _radius: number): void {}
    moveTo(_x: number, _y: number): void {}
    lineTo(_x: number, _y: number): void {}
    fill(): void {}
    stroke(): void {}
}

class FakeLabel {
    node!: FakeNode;
    string = "";
    fontSize = 0;
    horizontalAlign = 0;
    color: FakeColor | null = null;
}

class FakeTexture2D {
    constructor(readonly width = 328, readonly height = 328) {}
}

class FakeSpriteFrame {
    texture: FakeTexture2D | null = null;
    rect: FakeRect | null = null;
}

class FakeSprite {
    node!: FakeNode;
    enabled = true;
    spriteFrame: FakeSpriteFrame | null = null;
    color: FakeColor | null = null;
}

class FakeNode {
    static readonly EventType = { TOUCH_END: "touch-end" };

    layer = 7;
    active = true;
    angle = 0;
    destroyed = false;
    parent: FakeNode | null = null;
    readonly children: FakeNode[] = [];
    readonly position = new FakeVec3();
    readonly scale = new FakeVec3(1, 1, 1);
    private readonly components: unknown[] = [];

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

    getComponent<T>(Constructor: new () => T): T | null {
        return (this.components.find((component) => component instanceof Constructor) as T | undefined) ?? null;
    }

    setPosition(x: number, y: number, z: number): void {
        this.position.set(x, y, z);
    }

    setScale(x: number, y: number, z: number): void {
        this.scale.set(x, y, z);
    }

    on(_type: string, _callback: (...args: unknown[]) => void, _target: unknown): void {}

    destroy(): void {
        this.destroyed = true;
        this.parent?.removeChild(this);
    }
}

type Listener = { callback: (...args: any[]) => void; target: unknown };

function makeInput() {
    const listeners = new Map<string, Listener[]>();
    return {
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
}

function findNode(root: FakeNode, name: string): FakeNode | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = findNode(child, name);
        if (found) return found;
    }
    return null;
}

test("SnakeWorldView：Texture2D 使用 /texture 子资源，控件可见且触摸回流", async () => {
    const loadedPaths: string[] = [];
    const input = makeInput();
    const resources = {
        load(
            path: string,
            _Type: typeof FakeTexture2D,
            callback: (error: Error | null, asset?: FakeTexture2D) => void,
        ): void {
            loadedPaths.push(path);
            if (!path.endsWith("/texture")) {
                callback(new Error(`not a Texture2D resource: ${path}`));
                return;
            }
            callback(null, new FakeTexture2D());
        },
    };
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
        Node: FakeNode,
        Rect: FakeRect,
        Sprite: FakeSprite,
        SpriteFrame: FakeSpriteFrame,
        Texture2D: FakeTexture2D,
        UITransform: FakeUITransform,
        Vec3: FakeVec3,
        gfx: {
            Attribute: class {},
            AttributeName: {},
            Format: {},
        },
        Material: class {},
        Mesh: class {},
        UIMeshRenderer: class {},
        utils: { createMesh: () => ({}) },
        input,
        resources,
        view: { getVisibleSize: () => ({ width: 750, height: 1624 }) },
    };

    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;
    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
        if (request === "cc") return fakeCc;
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        const { SnakeWorldView } = await import("../src/view/rooms/snake/SnakeWorldView");
        const host = new FakeNode("host");
        // Creator 的 Canvas 锚点在可见区中心，触摸坐标则以左下角为原点。
        host.setPosition(375, 812, 0);
        const dispatched: unknown[] = [];
        const presentation = new SnakeWorldView(host as never, (value) => dispatched.push(value), () => {});

        presentation.mount();
        await new Promise<void>((resolve) => setImmediate(resolve));

        assert.deepEqual(loadedPaths, [
            "snakeoff/snake_skin_classic_1/texture",
            "snakeoff/snake_skin_classic_2/texture",
            "snakeoff/snake_skin_classic_3/texture",
            "snakeoff/snake_control_joystick_base/texture",
            "snakeoff/snake_control_joystick_knob/texture",
            "snakeoff/snake_control_boost/texture",
            "snakeoff/snake_result_bg/texture",
            "snakeoff/snake_btn_blue/texture",
        ]);
        for (const name of ["SnakeWorld.JoystickBase", "SnakeWorld.JoystickKnob", "SnakeWorld.Boost"]) {
            const node = findNode(host, name);
            const sprite = node?.getComponent(FakeSprite);
            assert.ok(sprite?.spriteFrame?.texture, `${name} 必须挂载已加载纹理的 Sprite`);
        }
        assert.equal(input.count(), 4, "mount 必须登记完整触摸监听");

        const touch = (x: number, y: number) => ({
            getID: () => 1,
            getUILocation: () => ({ x, y }),
        });

        // 可见区 750×1624 时摇杆中心是 UI 坐标 (170, 220)。中心落点只取得
        // pointer ownership，死区内不发方向；随后四向移动必须保持屏幕/世界同轴。
        input.emit("touch-start", touch(170, 220));
        assert.equal(dispatched.length, 0, "摇杆中心落点位于死区，不应改变方向");

        const assertDirection = (x: number, y: number, dirX: number, dirY: number): void => {
            input.emit("touch-move", touch(x, y));
            const steer = dispatched[dispatched.length - 1] as {
                type: string;
                dirX: number;
                dirY: number;
                boost: boolean;
            };
            assert.equal(steer.type, "steer");
            assert.ok(Math.abs(steer.dirX - dirX) < 1e-9, `dirX 应为 ${dirX}，实际 ${steer.dirX}`);
            assert.ok(Math.abs(steer.dirY - dirY) < 1e-9, `dirY 应为 ${dirY}，实际 ${steer.dirY}`);
            assert.equal(steer.boost, false);
        };
        assertDirection(60, 220, -1, 0); // 左
        assertDirection(280, 220, 1, 0); // 右
        assertDirection(170, 330, 0, 1); // 上
        assertDirection(170, 110, 0, -1); // 下

        input.emit("touch-end", touch(170, 110));
        assert.equal(dispatched.length, 4);

        presentation.unmount();
        assert.equal(input.count(), 0, "unmount 必须释放全部触摸监听");
    } finally {
        moduleApi._load = originalLoad;
    }
});
