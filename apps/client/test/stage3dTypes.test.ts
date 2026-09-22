/** SC1-B1: type-only 3D consumers; neither this test nor its probe imports cc at runtime. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const CLIENT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

// These are consumer operations, not a runnable fake implementation. Checking
// an output ray, a loaded Prefab and scene snapshots catches API-shape mistakes
// before the adapters exist; expected errors keep permissive stubs from hiding them.
const CONSUMER = `
import {
    Asset, AssetManager, Camera, DirectionalLight, Layers, Node, Quat, Rect, Vec3, Color,
    Prefab, instantiate, resources, assetManager, SceneGlobals, Scene, director, TextureCube,
    SkeletalAnimation, AnimationClip, AnimationState, SkinnedMeshRenderer, SkinnedMeshBatchRenderer,
    SkinnedMeshUnit, ParticleSystem, LOD, LODGroup, Billboard, geometry, tween, Tween,
} from "cc";

export function openStage(parent: Node, prefab: Prefab, globals: SceneGlobals): void {
    const root = instantiate(prefab);
    parent.addChild(root);
    // @ts-expect-error Engine scenes require a name; the stub must not inherit Node's optional constructor.
    new Scene();
    const camera = root.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.rect = new Rect(0, 0, 1, 1);
    camera.priority = 0;
    camera.visibility = Layers.Enum.DEFAULT | Layers.nameToLayer("Overlay");
    camera.fov = 45;
    camera.clearFlags = Camera.ClearFlag.SKYBOX;
    camera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
    camera.clearColor = new Color(0, 0, 0, 255);
    const ray: geometry.Ray = camera.screenPointToRay(30, 40, new geometry.Ray());
    const hit = new Vec3();
    ray.computeHit(hit, 2);
    const box = geometry.AABB.fromPoints(new geometry.AABB(), ray.o, hit);
    box.getBoundary(new Vec3(), new Vec3());
    root.setRotation(Quat.fromEuler(new Quat(), 0, 90, 0));
    root.setRotation(Quat.slerp(new Quat(), root.rotation, Quat.IDENTITY, 0.5));
    root.setPosition(hit);
    const light = root.addComponent(DirectionalLight);
    light.illuminance = 65000;
    light.color = new Color(255, 255, 255, 255);
    light.shadowEnabled = false;
    const savedToneMapping: number = globals.postSettings.toneMappingType;
    const savedAmbient: Color = globals.ambient.skyLightingColor;
    globals.ambient.skyIllum = 20000;
    globals.ambient.skyLightingColor = savedAmbient;
    globals.fog.enabled = true;
    globals.fog.fogStart = 1;
    globals.fog.fogEnd = 40;
    globals.shadows.enabled = false;
    globals.skybox.envmap = new TextureCube();
    globals.postSettings.toneMappingType = savedToneMapping;
    const scene = director.getScene();
    if (scene) scene.globals.fog.enabled = false;
    // @ts-expect-error The component takes x/y first, unlike renderer.scene.Camera.
    camera.screenPointToRay(ray, 30, 40);
    // @ts-expect-error Camera clearColor is readonly; assign a color instead of mutating it.
    camera.clearColor.r = 255;
    // @ts-expect-error The scene owns globals; a snapshot must not replace the Scene.globals object.
    if (scene) scene.globals = globals;
    // @ts-expect-error An unknown layer must not silently become a number through an index signature.
    camera.visibility = Layers.Enum.TypoLayer;
}

export function loadUnit(bundle: AssetManager.Bundle): void {
    // @ts-expect-error Prefab declares a no-argument constructor, unlike Asset.
    new Prefab("biped");
    bundle.load("biped/scene", Prefab, (error, prefab) => {
        if (error) return;
        const held: Asset = prefab.addRef();
        const count: number = held.refCount;
        instantiate(prefab);
        if (count > 0) held.decRef();
        // @ts-expect-error Reference counts belong to the engine, not a lease's write path.
        held.refCount = 0;
    });
    const cached: Prefab | null = bundle.get("biped/scene", Prefab);
    if (cached) instantiate(cached);
    resources.load("stage3d/biped/scene", Prefab, (error, prefab) => {
        if (!error) instantiate(prefab);
    });
    assetManager.loadBundle("kit-fixture", { version: "hash" }, (error, loaded) => {
        if (!error) loaded.load("biped/scene", Prefab, () => {});
    });
    // @ts-expect-error Components are not Asset types accepted by a bundle loader.
    bundle.load("biped/scene", Camera, () => {});
}

export function animate(root: Node, clip: AnimationClip): void {
    const animation = root.addComponent(SkeletalAnimation);
    animation.useBakedAnimation = true;
    animation.addClip(clip, "walk");
    // @ts-expect-error An animation state cannot be constructed without its source clip.
    new AnimationState();
    animation.play("walk");
    animation.getState("walk").speed = 1;
    animation.createSocket("hip/hand");
    const renderer = root.addComponent(SkinnedMeshRenderer);
    renderer.skinningRoot = root;
    renderer.uploadAnimation(clip);
    const batch = root.addComponent(SkinnedMeshBatchRenderer);
    const unit = new SkinnedMeshUnit();
    unit.copyFrom = renderer;
    batch.units = [unit];
    batch.atlasSize = 1024;
    batch.cook();
    const particles = root.addComponent(ParticleSystem);
    particles.capacity = 50;
    particles.playOnAwake = false;
    particles.play();
    particles.stop();
    particles.clear();
    const lod = new LOD();
    lod.renderers = [renderer];
    const group = root.addComponent(LODGroup);
    group.LODs = [lod];
    group.forceLOD(0);
    const billboard = root.addComponent(Billboard);
    billboard.width = 1;
    billboard.height = 2;
    const movement: Tween<Node> = tween(root).to(0.2, { position: new Vec3(1, 0, 1) }, { easing: "quadOut" });
    movement.start().stop();
    Tween.stopAllByTarget(root);
    // @ts-expect-error play returns void; obtain the animation state with getState.
    animation.play("walk").speed = 2;
    // @ts-expect-error Methods cannot be tween targets.
    tween(root).to(0.2, { destroy: () => true });
    // @ts-expect-error A misspelled transform must not be accepted as an arbitrary tween property.
    tween(root).to(0.2, { positon: new Vec3() });
}
`;

for (const [configName, stubName] of [
    ["tsconfig.json", "cc-stub.d.ts"],
    ["tsconfig.test.json", "client-test-stubs.d.ts"],
] as const) {
    test(`SC1 3D types compile consumers and reject misuse with ${configName}`, () => {
        const configPath = join(CLIENT_ROOT, configName);
        const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
        assert.equal(loaded.error, undefined);
        const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, CLIENT_ROOT, undefined, configPath);
        assert.deepEqual(config.errors, []);
        const stubPath = join(CLIENT_ROOT, stubName);
        assert.ok(config.fileNames.includes(stubPath), `${configName} must consume ${stubName}`);
        const temp = mkdtempSync(join(tmpdir(), "stage3d-types-"));
        try {
            const probe = join(temp, "consumer.ts");
            writeFileSync(probe, CONSUMER);
            // Compile just the contract and its selected stub with each real
            // configuration. Full source checks remain in the two typecheck commands.
            const program = ts.createProgram([stubPath, probe], config.options);
            const diagnostics = ts.getPreEmitDiagnostics(program);
            assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")), []);
        } finally {
            rmSync(temp, { recursive: true, force: true });
        }
    });
}
