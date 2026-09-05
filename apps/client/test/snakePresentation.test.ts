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
    constructor(readonly width = 2048, readonly height = 2048) {}
}

class FakeJsonAsset {
    json: unknown = {
        recipeVersion: 1,
        logicalName: "magnet-active",
        animation: {
            durationSeconds: 1 / 3,
            wrapMode: "loop",
            tracks: [{
                nodePath: "x_lighting01",
                properties: [{ property: "opacity", keyframes: [{ time: 0, value: 255 }, { time: 1 / 3, value: 0 }] }],
            }],
        },
        root: {
            name: "SnakeMagnet", opacity: 255,
            transform: {
                eulerDegrees: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            },
            components: [],
            children: [{
                name: "x_lighting01", opacity: 255, children: [],
                transform: {
                    eulerDegrees: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 40, z: 0 }, scale: { x: 1, y: 1, z: 1 },
                },
                components: [{ type: "sprite", texture: "x_lighting01" }],
            }],
        },
        textureDependencies: [
            "x_lighting01", "x_lighting02", "x_lighting03", "xt_s_lighting", "xt_s_lighting02",
        ].map((logicalName) => ({
            logicalName,
            textureAsset: `snakeoff/snake_magnet_aura_${logicalName}`,
            frame: {
                sourceFrameName: logicalName,
                rect: { x: 0, y: 0, width: 16, height: 16 },
                pivot: { x: 0.5, y: 0.5 },
                trimOffset: { x: 0, y: 0 },
                originalSize: { width: 16, height: 16 },
                rotated: false,
                trimmed: false,
            },
        })),
    };
}

class FakeAudioClip {}

class FakeAudioSource {
    node!: FakeNode;
    plays = 0;

    playOneShot(_clip: FakeAudioClip, _volume = 1): void { this.plays += 1; }
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

class FakeMesh {
    readonly subMeshes = [{ update: () => undefined }];
}

class FakeMaterial {
    initialize(_options: unknown): void {}
    setProperty(_name: string, _value: unknown): void {}
}

class FakeUIMeshRenderer {
    node!: FakeNode;
    mesh: unknown;
    material: unknown;
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

function countNodes(root: FakeNode, name: string): number {
    return (root.name === name ? 1 : 0) + root.children.reduce((sum, child) => sum + countNodes(child, name), 0);
}

test("SnakeWorldView：Texture2D 使用 /texture 子资源，控件可见且触摸回流", async () => {
    const loadedPaths: string[] = [];
    const input = makeInput();
    const game = makeInput();
    const storage = new Map<string, string>();
    const missingResources = new Set<string>();
    const resources = {
        load(
            path: string,
            Type: typeof FakeTexture2D | typeof FakeJsonAsset | typeof FakeAudioClip,
            callback: (error: Error | null, asset?: FakeTexture2D | FakeJsonAsset | FakeAudioClip) => void,
        ): void {
            loadedPaths.push(path);
            if (missingResources.has(path)) {
                callback(new Error(`missing test resource: ${path}`));
                return;
            }
            if (Type === FakeJsonAsset && path === "snakeoff/snake_magnet_aura") {
                callback(null, new FakeJsonAsset());
                return;
            }
            if (Type === FakeAudioClip && path === "snakeoff/snake_sfx_collect_magnet") {
                callback(null, new FakeAudioClip());
                return;
            }
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
        Game: { EVENT_HIDE: "game-hide" },
        Graphics: FakeGraphics,
        Input: {
            EventType: {
                TOUCH_START: "touch-start",
                TOUCH_MOVE: "touch-move",
                TOUCH_END: "touch-end",
                TOUCH_CANCEL: "touch-cancel",
            },
        },
        JsonAsset: FakeJsonAsset,
        AudioClip: FakeAudioClip,
        AudioSource: FakeAudioSource,
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
        Material: FakeMaterial,
        Mesh: FakeMesh,
        UIMeshRenderer: FakeUIMeshRenderer,
        utils: { createMesh: () => new FakeMesh() },
        input,
        game,
        resources,
        sys: {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => { storage.set(key, value); },
            },
        },
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
        const { CLIENT_SNAKE_PRESENTATION_CATALOG, SNAKE_ENTITY_PRESENTATION_CATALOG } = await import("../src/logic/rooms/snake/SnakePresentationCatalog");
        const host = new FakeNode("host");
        // Creator 的 Canvas 锚点在可见区中心，触摸坐标则以左下角为原点。
        host.setPosition(375, 812, 0);
        const dispatched: unknown[] = [];
        let sfxEnabled = true;
        const presentation = new SnakeWorldView(host as never, (value) => dispatched.push(value), () => {}, () => sfxEnabled);

        presentation.mount();
        await new Promise<void>((resolve) => setImmediate(resolve));

        assert.equal(loadedPaths.length, CLIENT_SNAKE_PRESENTATION_CATALOG.length + 16);
        assert.ok(loadedPaths.filter((path) => path !== "snakeoff/snake_magnet_aura"
            && path !== "snakeoff/snake_sfx_collect_magnet")
            .every((path) => path.endsWith("/texture")));
        for (const required of [
            "snakeoff/snake_foods_new/texture",
            "snakeoff/snake_control_joystick_base/texture",
            "snakeoff/snake_control_joystick_knob/texture",
            "snakeoff/snake_control_boost/texture",
            "snakeoff/snake_magnet_tools/texture",
            "snakeoff/snake_magnet_aura",
            "snakeoff/snake_sfx_collect_magnet",
            "snakeoff/snake_speed_fx/texture",
            "snakeoff/snake_extras/texture",
        ]) assert.ok(loadedPaths.includes(required), `缺少 ${required}`);
        for (const name of ["SnakeWorld.JoystickBase", "SnakeWorld.JoystickKnob", "SnakeWorld.S4"]) {
            const node = findNode(host, name);
            const sprite = node?.getComponent(FakeSprite);
            assert.ok(sprite?.spriteFrame?.texture, `${name} 必须挂载已加载纹理的 Sprite`);
        }
        assert.equal(input.count(), 4, "mount 必须登记完整触摸监听");

        presentation.render({
            tick: 0,
            envelopeTick: 0,
            seq: 1,
            snakes: [],
            foods: [
                { id: 1, kind: 0, variant: 7, x: 10, y: 20 },
                { id: 2, kind: 1, variant: 1, x: -10, y: -20 },
            ],
            wrecks: [],
            tools: [],
            runs: [],
            displayRank: [],
        }, {
            countdownSeconds: 0,
            inStartCountdown: false,
            hasRoomDeadline: false,
            entries: [],
            selfAlive: false,
            selfBoost: false,
            runState: null,
            magnetRemainingTicks: 0,
            protectionRemainingTicks: 0,
        }, null);
        assert.equal(countNodes(host, "snake-food-batch"), 1,
            "Dot/Star 必须共享一个 atlas mesh，不能按食物创建节点");

        const snakeFrame = (magnetCollected: number) => ({
            tick: 20 + magnetCollected,
            envelopeTick: 20 + magnetCollected,
            seq: 2 + magnetCollected,
            snakes: [{
                id: "self", name: "我", skinId: 403, ai: false, aiLevel: null, alive: true,
                score: 10, length: 80, boost: magnetCollected > 0, bodyScale: 1,
                magnetUntilTick: magnetCollected > 0 ? 100 : null, protectUntilTick: magnetCollected > 0 ? 100 : null,
                points: [{ x: 10, y: 0 }, { x: 2, y: 0 }, { x: -6, y: 0 }],
            }],
            foods: [], wrecks: [], tools: [],
            runs: [{
                id: "self", runId: "run-self", state: "active", stateVersion: 2,
                deathSeq: 0, deathCause: "", magnetCollected, starCollected: 0,
                magnetUntilTick: magnetCollected > 0 ? 100 : null,
            }],
            displayRank: [{ rank: 1, id: "self", name: "我", score: 10, length: 80, ai: false, self: true }],
        });
        const activeHud = {
            countdownSeconds: 0, inStartCountdown: false, hasRoomDeadline: false,
            entries: [{ rank: 1, id: "self", name: "我", score: 10, isSelf: true, isAi: false }],
            selfAlive: true, selfBoost: false, runState: "active" as const,
            magnetRemainingTicks: 0, protectionRemainingTicks: 0,
        };
        presentation.render(snakeFrame(0) as never, activeHud as never, null);
        assert.ok(findNode(host, "snake-head-self"), "head 必须由同一稳定 skinId 的动态帧创建");
        assert.ok(findNode(host, "snake-tail-self"), "有 tail 的 skin 403 必须消费 tail track");
        presentation.render(snakeFrame(1) as never, { ...activeHud, magnetRemainingTicks: 79 } as never, null);
        assert.ok(findNode(host, "snake-magnet-aura"), "magnet-active 必须实例化 recipe 节点树而非猜测圆环");
        assert.ok(findNode(host, "snake-boost-self"), "boost 必须消费 presentation effect 帧");
        assert.ok(findNode(host, "snake-protection-self"), "保护期必须消费 presentation protection 帧");
        assert.equal(findNode(host, "SnakeWorld")?.getComponent(FakeAudioSource)?.plays, 1,
            "magnetCollected 单调增加时播放一次 catalog collect-magnet 音效");
        sfxEnabled = false;
        presentation.render(snakeFrame(2) as never, { ...activeHud, magnetRemainingTicks: 78 } as never, null);
        assert.equal(findNode(host, "SnakeWorld")?.getComponent(FakeAudioSource)?.plays, 1,
            "sfxOn=false 时 magnetCollected 增长也必须静默");
        // ── identity：把 View 的可观察行为绑到 presentation catalog 的声明值 ──────────────
        // ⚠ 这三段（self.outline / self.nameplate / otherHuman.nameplate）此前只有 catalog 侧的
        // 值校验，View 侧是各写各的本地常量——改了目录 View 不会跟着变，也没人会发现。本用例补上这条绑定。
        const identity = SNAKE_ENTITY_PRESENTATION_CATALOG.identity;
        assert.equal(identity.self.outline, "fine-white", "目录改了自机轮廓口径就必须同步改 SnakeWorldView");
        assert.equal(identity.self.nameplate, "none", "自机 ⛔ 不挂名牌");
        assert.equal(identity.otherHuman.nameplate, "text", "他人靠名字识别");
        assert.equal(identity.ai.nameplate, "text", "AI 同样靠名字识别");

        const twoSnakes = {
            ...snakeFrame(0),
            tick: 30, envelopeTick: 30, seq: 9,
            snakes: [
                { ...snakeFrame(0).snakes[0] },
                {
                    id: "rival", name: "对手", skinId: 401, ai: false, aiLevel: null, alive: true,
                    score: 5, length: 80, boost: false, bodyScale: 1,
                    magnetUntilTick: null, protectUntilTick: null,
                    points: [{ x: 200, y: 0 }, { x: 192, y: 0 }, { x: 184, y: 0 }],
                },
            ],
        };
        presentation.render(twoSnakes as never, activeHud as never, null);
        assert.equal(findNode(host, "label-我"), null,
            "identity.self.nameplate=none：自机 ⛔ 不得出现世界内名牌");
        assert.ok(findNode(host, "label-对手"),
            "identity.otherHuman.nameplate=text：他人必须有世界内名牌");

        presentation.render({ ...snakeFrame(2), tick: 23, envelopeTick: 23, seq: 5, snakes: [] } as never,
            { ...activeHud, entries: [], selfAlive: false } as never, null);
        assert.equal(findNode(host, "snake-head-self"), null, "实体从 frame 消失后必须清理 head");
        assert.equal(findNode(host, "snake-tail-self"), null, "实体从 frame 消失后必须清理 tail");
        assert.equal(findNode(host, "snake-mesh-self"), null, "实体从 frame 消失后必须清理 mesh");

        const touch = (id: number, x: number, y: number) => ({
            getID: () => id,
            getUILocation: () => ({ x, y }),
        });

        // 可见区 750×1624 时摇杆中心是 UI 坐标 (375, 220)。中心落点只取得
        // pointer ownership，死区内不发方向；随后四向移动必须保持屏幕/世界同轴。
        input.emit("touch-start", touch(1, 375, 220));
        assert.equal(dispatched.length, 0, "摇杆中心落点位于死区，不应改变方向");

        const assertDirection = (x: number, y: number, dirX: number, dirY: number): void => {
            input.emit("touch-move", touch(1, x, y));
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
        assertDirection(265, 220, -1, 0); // 左
        assertDirection(485, 220, 1, 0); // 右
        assertDirection(375, 330, 0, 1); // 上
        assertDirection(375, 110, 0, -1); // 下

        input.emit("touch-start", touch(2, 620, 410));
        assert.equal((dispatched.at(-1) as { boost: boolean }).boost, true, "第二指按住 S4 加速");
        input.emit("touch-move", touch(1, 375, 330));
        assert.equal((dispatched.at(-1) as { boost: boolean }).boost, true, "转向与加速可持续并行");
        input.emit("touch-end", touch(2, 620, 410));
        assert.deepEqual(dispatched.at(-1), { type: "release-boost" });
        input.emit("touch-end", touch(1, 375, 110));

        presentation.unmount();
        assert.equal(input.count(), 0, "unmount 必须释放全部触摸监听");
        assert.equal(game.count(), 0, "unmount 必须释放失焦监听");

        missingResources.add("snakeoff/snake_magnet_tools/texture");
        const failedHost = new FakeNode("failed-host");
        failedHost.setPosition(375, 812, 0);
        const missingMagnet = new SnakeWorldView(failedHost as never, () => {}, () => {});
        missingMagnet.mount();
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.ok(findNode(failedHost, "SnakeWorld.RequiredResourceFailure"),
            "required magnet world texture 缺失必须阻断 V2 战斗，而不是画猜测占位");
        assert.equal(findNode(failedHost, "SnakeWorld.Controls")?.active, false);
        missingMagnet.unmount();
        assert.equal(input.count(), 0);
        assert.equal(game.count(), 0);
    } finally {
        moduleApi._load = originalLoad;
    }
});

test("目录里每个 frame 的 pivot 必须居中——SnakeWorldView 删除 pivot 转写的前提", async () => {
    // ⚠ 这条用例守的是 SnakeWorldView.definedFrame 里那段注释的前提，不是目录自身的美学约束。
    // Cocos 3.8 的 SpriteFrame.pivot 只有 getter，⛔ 不可赋值；引擎按节点 anchorPoint 摆放精灵。
    // 只要目录里所有 pivot 都等于默认锚点 (0.5, 0.5)，「不转写 pivot」就是行为等价的。
    // 真出现偏心 pivot 时本用例转红，那时必须把 pivot 转写到消费节点的 UITransform.anchorPoint 上，
    // ⛔ 而不是把断言放宽。
    const { CLIENT_SNAKE_PRESENTATION_CATALOG, SNAKE_ENTITY_PRESENTATION_CATALOG } =
        await import("../src/logic/rooms/snake/SnakePresentationCatalog");

    const offenders: string[] = [];
    let seen = 0;
    const walk = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${path}[${index}]`));
            return;
        }
        if (!value || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        const pivot = record.pivot as { x?: unknown; y?: unknown } | undefined;
        if (pivot && typeof pivot.x === "number" && typeof pivot.y === "number") {
            seen += 1;
            if (pivot.x !== 0.5 || pivot.y !== 0.5) {
                const name = typeof record.sourceFrameName === "string" ? record.sourceFrameName : path;
                offenders.push(`${name} pivot=(${pivot.x}, ${pivot.y})`);
            }
        }
        for (const [key, child] of Object.entries(record)) walk(child, `${path}.${key}`);
    };
    walk(CLIENT_SNAKE_PRESENTATION_CATALOG, "skins");
    walk(SNAKE_ENTITY_PRESENTATION_CATALOG, "entities");

    // 非空闸：walk 若因目录结构变动而没走到任何 frame，断言会恒真——这里先证明它确实遍历到了。
    assert.ok(seen >= 100, `pivot 遍历只命中 ${seen} 处，远少于预期，walk 可能没走到目录深处`);
    assert.deepEqual(offenders, [], "存在偏心 pivot：必须转写到消费节点的 anchorPoint，不能直接忽略");
});
