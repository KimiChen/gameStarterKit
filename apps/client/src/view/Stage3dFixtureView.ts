/** DEV acceptance page for the production Stage3D port; content remains fixed greybox. */
import { Billboard, instantiate, Material, MeshRenderer, Node, ParticleSystem, Prefab, SkeletalAnimation } from "cc";
import { DEV } from "cc/env";
import { CocosView } from "./CocosView";
import type { ViewLifecycleContext } from "./ViewBase";
import type { Stage3DPort } from "./scene3d/Stage3D";
import { beginFixtureSession, countFixtureReference } from "./scene3d/fixtureSession";
import { AssetLease } from "./scene3d/AssetLease";
import type { AssetBatch, AssetRequest } from "./scene3d/AssetLease";
import { cocosAssetLoader } from "./scene3d/cocosAssetLoader";
import { createSpikeRealtimeSwitcher, createSpikeSkinningSwitcher, prepareSpikeSkinningLayouts } from "./scene3d/spikeSkinning";
import { captureOwnedBillboard, OwnedRenderingRetirement } from "./scene3d/ownedRendering";

/** Observe the production lease boundary, including cancelled/late callbacks. */
const fixtureAssets = new AssetLease({
    ...cocosAssetLoader,
    addRef: (asset) => { cocosAssetLoader.addRef(asset); countFixtureReference(1); },
    decRef: (asset) => { try { cocosAssetLoader.decRef(asset); } finally { countFixtureReference(-1); } },
});

export class Stage3dFixtureView extends CocosView {
    private opening: ViewLifecycleContext | undefined;
    private releaseStage: (() => void) | undefined;

    protected onOpen(context: ViewLifecycleContext): void {
        if (!DEV) throw new Error("Stage3D fixture is only available in development");
        this.opening = context;
    }

    /** Inject the actual application's port via ViewHandle.run/open setup. */
    async setup(ports: { readonly stage3d: Stage3DPort }, context: ViewLifecycleContext): Promise<void> {
        if (this.opening !== context || !context.isActive()) throw new Error("Fixture setup cancelled");
        if (this.releaseStage) throw new Error("Fixture already has a stage");
        const lease = ports.stage3d.acquire(context, { clearColor: { r: 28, g: 40, b: 58, a: 255 } });
        const session = beginFixtureSession(), logic = session.logic, world = lease.root;
        const owner = { generation: context.generation, signal: lease.signal, isActive: () => context.isActive() && !lease.signal.aborted };
        let assets: AssetBatch<readonly AssetRequest<Prefab>[]> | undefined;
        const retirement = new OwnedRenderingRetirement();
        const materials = new Map<Material, Material>();
        const atlasBMaterials = new Map<Material, Material>();
        const realtimeMaterials = new Map<Material, Material>();
        let detachInput: (() => void) | undefined;
        let releaseBillboard: (() => void) | undefined;
        const releaseStage = this.releaseStage = () => lease.release();
        // Stage3D aborts its signal BEFORE destroying nodes, including host/scene
        // disposal. Capture old descriptors here, not in the later View close hook.
        lease.signal.addEventListener("abort", () => {
            detachInput?.();
            session.switchSkinningClip = null;
            session.switchRealtimeSkinning = null;
            session.ready = false;
            session.nodeCount = 0;
            if (this.releaseStage === releaseStage) this.releaseStage = undefined;
            retirement.capture(world);
            retirement.finish(() => {
                releaseBillboard?.();
                for (const material of [...materials.values(), ...atlasBMaterials.values(), ...realtimeMaterials.values()]) material.destroy();
                materials.clear(); atlasBMaterials.clear(); realtimeMaterials.clear();
                assets?.release(); assets = undefined;
            });
        }, { once: true });
        try {
            // Fixed portrait framing retained for the SC0 render/performance comparisons.
            lease.camera.setPose({ x: 0, y: 110, z: 145 }, { x: 0, y: 0, z: 0 });
            lease.light.setDirection({ x: 0.211309, y: -0.866025, z: -0.453154 });
            detachInput = this.subscribeRawInput(owner, {
                touch: (phase, event) => {
                    const id = event.getID();
                    if (id === null) return;
                    const p = event.getUILocation();
                    logic.pointer(id, phase, p.x, p.y);
                    lease.camera.setPose({ x: logic.x * -0.03, y: 110, z: 145 + logic.y * 0.03 }, { x: 0, y: 0, z: 0 });
                },
                wheel: () => { logic.wheels++; },
                cancel: () => logic.cancelAll(),
            });
            const acquired = await fixtureAssets.acquire([
                ...["greybox-plane", "greybox-cube", "greybox-biped", "greybox-biped-atlas-b"]
                    .map((name) => `stage3d/${name}/${name}`),
                "stage3d/P_Stage3d_Baked",
            ].map((path) => ({ bundle: "resources", path, type: Prefab })), { signal: owner.signal });
            if (!owner.isActive()) { acquired.release(); throw new Error("Fixture setup cancelled"); }
            assets = acquired;
            const [plane, cube, biped, atlasB, baked] = acquired.assets;
            // Register before any instance can request a baked joint texture.
            const skinning = prepareSpikeSkinningLayouts(biped!, atlasB!);
            session.skinning = skinning.summary;
            world.addChild(instantiate(plane!));
            for (let i = 0; i < 500; i++) {
                const node = instantiate(cube!);
                node.name = `Stage3dSpike.Cube.${i}`;
                node.setPosition((i % 25 - 12) * 2.3, 0.5, (Math.floor(i / 25) - 10) * 2.3);
                world.addChild(node);
                this.enableInstancing(node, materials);
            }
            for (let i = 0; i < 100; i++) {
                const node = instantiate(biped!);
                node.name = i === 99 ? "Stage3dSpike.CrossAtlas" : `Stage3dSpike.Biped.${i}`;
                node.setPosition((i % 10 - 4.5) * 3, 1.1, (Math.floor(i / 10) - 4.5) * 3);
                world.addChild(node);
                for (const animation of node.getComponentsInChildren(SkeletalAnimation)) {
                    animation.useBakedAnimation = true;
                    animation.play(skinning.mainClips[i % 2]!.name);
                }
                this.enableInstancing(node, materials);
                if (i === 99) {
                    session.switchSkinningClip = createSpikeSkinningSwitcher(node, skinning, (source) => {
                        let material = atlasBMaterials.get(source);
                        if (!material) {
                            material = new Material();
                            atlasBMaterials.set(source, material);
                            material.copy(source, { defines: { USE_INSTANCING: true } });
                        }
                        return material;
                    });
                    session.switchRealtimeSkinning = createSpikeRealtimeSwitcher(node, skinning, (source) => {
                        let material = realtimeMaterials.get(source);
                        if (!material) {
                            material = new Material();
                            realtimeMaterials.set(source, material);
                            material.copy(source, { defines: { USE_INSTANCING: false } });
                        }
                        return material;
                    }, () => {
                        retirement.capture(node);
                    });
                }
            }
            const particles = new Node("Stage3dSpike.Particle");
            particles.setPosition(0, 5, 0);
            // Configure before onLoad: 3.8.8 leaks the old particle buffers when
            // capacity changes after its instanced model has been initialized.
            particles.active = false;
            const effect = particles.addComponent(ParticleSystem);
            effect.capacity = 50;
            effect.loop = true;
            world.addChild(particles);
            particles.active = true;
            effect.play();
            // The CPU particle processor creates this owner-specific instance
            // outside RenderableComponent's material-instance ownership list.
            const particleMaterial = effect.processor.getDefaultMaterial();
            if (particleMaterial) materials.set(particleMaterial, particleMaterial);
            const marker = new Node("Stage3dFixture.Billboard");
            marker.setPosition(31, 5, 0);
            world.addChild(marker);
            const billboard = marker.addComponent(Billboard);
            releaseBillboard = captureOwnedBillboard(billboard);
            billboard.width = 4;
            billboard.height = 4;
            const bakedNode = instantiate(baked!);
            bakedNode.name = "Stage3dFixture.Baked";
            // Keep the independent lightmap sample above the greybox ground.
            bakedNode.setPosition(0, 0.03, 0);
            world.addChild(bakedNode);
            session.nodeCount = world.children.length;
            session.ready = true;
        } catch (error) {
            if (owner.isActive()) session.error = error instanceof Error ? error.message : String(error);
            releaseStage();
            throw error;
        }
    }

    private enableInstancing(node: Node, materials: Map<Material, Material>): void {
        for (const renderer of node.getComponentsInChildren(MeshRenderer)) {
            renderer.sharedMaterials.forEach((source, index) => {
                if (!source) return;
                let material = materials.get(source);
                if (!material) {
                    material = new Material();
                    materials.set(source, material);
                    material.copy(source, { defines: { USE_INSTANCING: true } });
                }
                renderer.setMaterial(material, index);
            });
        }
    }

    protected onCloseLifecycle(): void {
        this.opening = undefined;
        this.releaseStage?.();
    }
}
