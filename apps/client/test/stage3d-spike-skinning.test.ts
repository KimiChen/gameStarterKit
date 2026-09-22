/** SC0 layout ownership checks. GPU texture identity/rendering remain Creator gates. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { AnimationClip, Material, Node, Prefab } from "cc";

type Layout = { textureLength: number; contents: { skeleton: number; clips: number[] }[] };
class FakePool {
    readonly calls: Layout[][] = [];
    fail = false;
    registerCustomTextureLayouts(layouts: Layout[]): void {
        this.calls.push(structuredClone(layouts));
        if (this.fail) throw new Error("GPU allocation failed");
    }
    clear(): never { throw new Error("must not clear the engine's shared pool"); }
}
class FakeAnimation {
    useBakedAnimation = false;
    readonly added: AnimationClip[] = [];
    played: string | null = null;
    constructor(public clips: (AnimationClip | null)[]) {}
    addClip(clip: AnimationClip): void { if (!this.clips.includes(clip)) this.clips.push(clip); this.added.push(clip); }
    play(name: string): void { this.played = name; }
    stop(): void { this.played = null; }
}
class FakeRenderer {
    sharedMaterials: Material[] = [];
    constructor(readonly skeleton: { hash: number; joints: string[] }) {}
    setMaterial(material: Material, index: number): void { this.sharedMaterials[index] = material; }
}
class FakeNode {
    isValid = true;
    constructor(readonly renderer: FakeRenderer, readonly animation: FakeAnimation) {}
    getComponentsInChildren(Type: unknown): unknown[] {
        return Type === FakeRenderer ? [this.renderer] : Type === FakeAnimation ? [this.animation] : [];
    }
}
const fakeDirector: { root: { dataPoolManager: { jointTexturePool: FakePool } } | null } = { root: null };
let api: typeof import("../src/view/scene3d/spikeSkinning") | undefined;
async function loadApi(): Promise<NonNullable<typeof api>> {
    if (api) return api;
    const moduleApi = createRequire(import.meta.url)("node:module") as {
        _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const original = moduleApi._load;
    moduleApi._load = function (request, parent, isMain) {
        if (request === "cc") return { director: fakeDirector, Node: FakeNode, SkeletalAnimation: FakeAnimation, SkinnedMeshRenderer: FakeRenderer };
        return original.call(this, request, parent, isMain);
    };
    try { api = await import("../src/view/scene3d/spikeSkinning"); }
    finally { moduleApi._load = original; }
    return api;
}
function usePool(): FakePool {
    const pool = new FakePool();
    fakeDirector.root = { dataPoolManager: { jointTexturePool: pool } };
    return pool;
}
// Type stubs model clips as Assets; these layout-only fixtures still never load cc.
class FakeClip implements AnimationClip {
    readonly uuid: string;
    isValid = true;
    private references = 0;
    constructor(public name: string, readonly hash: number) { this.uuid = `fixture-clip-${hash}`; }
    get refCount(): number { return this.references; }
    addRef(): this { this.references++; return this; }
    decRef(_autoRelease?: boolean): this { this.references = Math.max(0, this.references - 1); return this; }
    destroy(): boolean { this.isValid = false; return true; }
}
function fixture(alternate = false, skeletonHash = 77): { data: FakeNode } {
    const clips = alternate
        ? [new FakeClip("sway-b", 21), new FakeClip("bow-b", 22)]
        : [new FakeClip("sway-main", 11), new FakeClip("bow-main", 12)];
    return { data: new FakeNode(new FakeRenderer({ hash: skeletonHash, joints: ["Root", "Root/Upper"] }), new FakeAnimation(clips)) };
}
const asPrefab = (value: { data: FakeNode }): Prefab => value as unknown as Prefab;

test("SC0 shares main clips in one custom texture, keeps alternate clips in a second, and reuses both for 20 opens", async () => {
    const { prepareSpikeSkinningLayouts } = await loadApi();
    const pool = usePool();
    for (let cycle = 0; cycle < 20; cycle++) {
        // Different asset objects simulate release/reload; clip array order must not allocate another layout.
        const main = fixture();
        const alternate = fixture(true);
        if (cycle % 2) { main.data.animation.clips.reverse(); alternate.data.animation.clips.reverse(); }
        const plan = prepareSpikeSkinningLayouts(asPrefab(main), asPrefab(alternate));
        assert.equal(plan.summary.registeredNow, cycle === 0);
        assert.equal(plan.summary.skeletonHash, 77);
        assert.equal(plan.summary.defaultPoseLayout, 1);
        assert.equal(plan.summary.layoutCount, 2);
    }
    assert.deepEqual(pool.calls, [[
        { textureLength: 72, contents: [{ skeleton: 77, clips: [11, 12] }] },
        { textureLength: 72, contents: [{ skeleton: 77, clips: [21, 22] }] },
    ]]);
    const otherPool = usePool();
    assert.equal(prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true))).summary.registeredNow, true);
    assert.equal(otherPool.calls.length, 1, "a new runtime pool needs its own layouts");
    assert.equal(pool.calls.length, 1, "switching pools must not clear or modify the previous pool");
});

test("SC0 custom layouts keep every two-bone clip joint in one shader row for float and RGBA8", async () => {
    const { prepareSpikeSkinningLayouts } = await loadApi();
    const pool = usePool();
    const plan = prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true)));
    // Imported fixture: two 1-second clips sampled at 30 Hz. Creator includes
    // the last frame (ceil(sample * duration) + 1), and allocates 48 bytes/joint.
    const frames = Math.ceil(30 * 1) + 1;
    const joints = 2;
    const mismatches = (width: number, pixelsPerJoint: number) => {
        const failures: { frame: number; joint: number; expected: number; sampled: number }[] = [];
        // The second custom atlas also holds a two-joint default pose. Cover
        // clips with/without that allocation and both consecutive clip offsets.
        for (const initialOffset of [0, joints * pixelsPerJoint]) {
            for (let clip = 0; clip < 2; clip++) {
                const offset = initialOffset + clip * frames * joints * pixelsPerJoint;
                for (let frame = 0; frame < frames; frame++) for (let joint = 0; joint < joints; joint++) {
                    const first = offset + (frame * joints + joint) * pixelsPerJoint;
                    // CCGetJointTextureCoords applies floor once; LBS samples
                    // all joint pixels at this same y with a POINT/CLAMP sampler.
                    const y = Math.floor((first + 0.1) / width);
                    const x = Math.floor(first + 0.1 - y * width);
                    for (let component = 0; component < pixelsPerJoint; component++) {
                        const expected = first + component;
                        const sampled = y * width + Math.min(x + component, width - 1);
                        if (sampled !== expected) failures.push({ frame, joint, expected, sampled });
                        assert.ok(expected < width * width, "both clips and default pose must fit the selected atlas");
                    }
                }
            }
        }
        return failures;
    };
    for (const layout of pool.calls[0]!) {
        assert.equal(layout.textureLength, plan.summary.textureLength);
        assert.deepEqual(mismatches(layout.textureLength, 3), [], "RGBA32F joint must not cross a texture row");
        assert.deepEqual(mismatches(layout.textureLength * 2, 12), [], "RGBA8 joint must not cross a texture row");
    }
    assert.ok(mismatches(64, 3).some((failure) => failure.frame === 10 && failure.joint === 1), "old float layout must reproduce the hidden cross-row failure");
    assert.ok(mismatches(128, 12).some((failure) => failure.frame === 5 && failure.joint === 0 && failure.expected === 128 && failure.sampled === 127), "old RGBA8 layout must reproduce CLAMP reading the previous row's last pixel");
});

test("SC0 attaches both alternate clips to the main instance without mutating either source Prefab", async () => {
    const { prepareSpikeSkinningLayouts, attachSpikeSkinningClips } = await loadApi();
    usePool();
    const main = fixture();
    const alternate = fixture(true);
    const plan = prepareSpikeSkinningLayouts(asPrefab(main), asPrefab(alternate));
    const instance = fixture().data;
    const animation = attachSpikeSkinningClips(instance as unknown as Node, plan);
    assert.equal(animation, instance.animation);
    assert.equal(animation.useBakedAnimation, true);
    assert.deepEqual(animation.clips.map((clip) => clip?.hash), [11, 12, 21, 22]);
    assert.equal(main.data.animation.clips.length, 2);
    assert.equal(alternate.data.animation.clips.length, 2);
    attachSpikeSkinningClips(instance as unknown as Node, plan);
    assert.equal(instance.animation.added.length, 2, "reattaching must not recreate states");
    assert.throws(() => attachSpikeSkinningClips(fixture(true).data as unknown as Node, plan), /main biped/u);
});

test("SC0 rejects incompatible or colliding fixtures before allocating GPU layouts", async () => {
    const { prepareSpikeSkinningLayouts } = await loadApi();
    const pool = usePool();
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true, 88))), /skeleton and joint paths/u);
    const wrongPaths = fixture(true);
    wrongPaths.data.renderer.skeleton.joints[1] = "OtherRoot/Upper";
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(wrongPaths)), /joint paths/u);
    const duplicate = fixture(true);
    duplicate.data.animation.clips[0] = new FakeClip("duplicate", 11);
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(duplicate)), /distinct nonzero clip hashes/u);
    assert.equal(pool.calls.length, 0);
});

test("SC0 never retries a partially failed registration into the same pool", async () => {
    const { prepareSpikeSkinningLayouts } = await loadApi();
    const pool = usePool();
    pool.fail = true;
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true))), /GPU allocation failed/u);
    pool.fail = false;
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true))), /failed previously/u);
    assert.equal(pool.calls.length, 1);
    fakeDirector.root = null;
    assert.throws(() => prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true))), /live joint texture pool/u);
});

test("SC0 cross-atlas switching isolates parent materials and restores shared ones without per-switch cloning", async () => {
    const { prepareSpikeSkinningLayouts, createSpikeSkinningSwitcher } = await loadApi();
    usePool();
    const plan = prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true)));
    const instance = fixture().data;
    const sibling = fixture().data;
    const mainMaterial = { name: "main", pass: {} } as unknown as Material;
    const alternateMaterial = { name: "atlas-b", pass: {} } as unknown as Material;
    instance.renderer.sharedMaterials = [mainMaterial, mainMaterial];
    sibling.renderer.sharedMaterials = [mainMaterial];
    let clones = 0;
    const play = createSpikeSkinningSwitcher(instance as unknown as Node, plan, (source) => {
        assert.equal(source, mainMaterial);
        clones++;
        return alternateMaterial;
    });
    for (let cycle = 0; cycle < 20; cycle++) {
        play("atlasB", 0);
        assert.deepEqual(instance.renderer.sharedMaterials, [alternateMaterial, alternateMaterial]);
        assert.deepEqual(sibling.renderer.sharedMaterials, [mainMaterial]);
        assert.equal(instance.animation.played, "sway-b");
        play("atlasB", 1);
        assert.equal(instance.animation.played, "bow-b");
        play("main", 1);
        assert.deepEqual(instance.renderer.sharedMaterials, [mainMaterial, mainMaterial]);
        assert.equal(instance.animation.played, "bow-main");
    }
    assert.equal(clones, 1, "one clone per distinct source when binding, never when switching");
    instance.isValid = false;
    assert.throws(() => play("atlasB", 0), /after node destruction/u);
    const invalid = fixture().data;
    invalid.renderer.sharedMaterials = [mainMaterial];
    assert.throws(() => createSpikeSkinningSwitcher(invalid as unknown as Node, plan, (source) => source), /independent parent Material/u);
});

test("SC0 realtime sample installs non-instanced materials before model replacement and restores baked before shared passes", async () => {
    const { prepareSpikeSkinningLayouts, createSpikeRealtimeSwitcher } = await loadApi();
    usePool();
    const plan = prepareSpikeSkinningLayouts(asPrefab(fixture()), asPrefab(fixture(true)));
    const instance = fixture().data, sibling = fixture().data;
    const baked = { instancing: true } as unknown as Material, realtime = { instancing: false } as unknown as Material;
    instance.renderer.sharedMaterials = [baked]; sibling.renderer.sharedMaterials = [baked];
    let bakedMode = true, swaps = 0, clones = 0;
    Object.defineProperty(instance.animation, "useBakedAnimation", {
        get: () => bakedMode,
        set: (value: boolean) => {
            assert.equal(instance.animation.played, null, "stop the previous clip before rebuilding its model");
            assert.equal(instance.renderer.sharedMaterials[0], realtime, "both replacements must begin with the safe non-instanced material");
            bakedMode = value;
        },
    });
    const change = createSpikeRealtimeSwitcher(instance as unknown as Node, plan, (source) => {
        assert.equal(source, baked); clones++; return realtime;
    }, () => { swaps++; });
    for (let cycle = 0; cycle < 20; cycle++) {
        change(true);
        assert.equal(bakedMode, false);
        assert.equal(instance.renderer.sharedMaterials[0], realtime);
        assert.equal(instance.animation.played, "sway-main");
        assert.equal(sibling.renderer.sharedMaterials[0], baked);
        change(false);
        assert.equal(bakedMode, true);
        assert.equal(instance.renderer.sharedMaterials[0], baked);
    }
    assert.equal(clones, 1); assert.equal(swaps, 40);
    instance.isValid = false;
    assert.throws(() => change(true), /expired/u);
});

test("SC0 replaces the evaluator-free baked state once after switching mode and reuses its live curves for 20 transitions", async () => {
    const { prepareSpikeSkinningLayouts, createSpikeRealtimeSwitcher } = await loadApi();
    usePool();
    const source = fixture(), alternate = fixture(true);
    const plan = prepareSpikeSkinningLayouts(asPrefab(source), asPrefab(alternate));
    const instance = fixture().data;
    // Use the actual plan clip objects, as the imported instance does.
    instance.animation.clips.splice(0, instance.animation.clips.length, ...plan.mainClips);
    instance.renderer.sharedMaterials = [{} as Material];
    let baked = true;
    let state = { doNotCreateEval: true, curvesInitialized: false, hasEvaluator: false };
    Object.defineProperty(instance.animation, "useBakedAnimation", {
        get: () => baked,
        set: (value: boolean) => {
            baked = value;
            if (!value && !state.curvesInitialized) {
                // Exact 3.8.8 failure: setUseBaked(false) calls super.initialize,
                // but fails to update the flag established during baked initialize.
                state.hasEvaluator = !state.doNotCreateEval;
                state.curvesInitialized = true;
            }
        },
    });
    let creations = 0;
    instance.animation.addClip = (clip) => {
        assert.equal(baked, false, "state initialization must observe realtime mode");
        assert.equal(instance.animation.played, null, "the old state must be stopped before public replacement");
        assert.equal(clip, plan.mainClips[0]);
        assert.equal(state.hasEvaluator, false, "only the original evaluator-free state may be replaced");
        if (!instance.animation.clips.includes(clip)) instance.animation.clips.push(clip);
        state = { doNotCreateEval: baked, curvesInitialized: !baked, hasEvaluator: !baked };
        creations++;
    };
    const change = createSpikeRealtimeSwitcher(instance as unknown as Node, plan, () => ({} as Material), () => {});
    let time = 0, upperJoint = 0;
    const sample = (): number => {
        time += 0.125;
        if (instance.animation.played && !baked && state.hasEvaluator) upperJoint = Math.sin(time);
        return upperJoint;
    };
    for (let cycle = 0; cycle < 20; cycle++) {
        change(true);
        assert.equal(state.hasEvaluator, true);
        assert.notEqual(sample(), sample(), "playing time without a curve evaluator cannot change the joint");
        change(false);
    }
    assert.equal(creations, 1, "reuse the initialized realtime evaluator instead of retaining new pose bindings each switch");
    assert.equal(instance.animation.clips.length, 2);
    assert.equal(source.data.animation.clips.length, 2);
});
