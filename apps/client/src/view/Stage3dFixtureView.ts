/** SC0 fixed greybox spike. Not the SC1 Stage3D API; keep lifecycle explicit and observable. */
import {
    Camera, Color, DirectionalLight, director, Director, instantiate, Layers,
    Material, MeshRenderer, Node, ParticleSystem, Prefab, resources, SkeletalAnimation, Vec3,
} from "cc";
import { DEV } from "cc/env";
import { CocosView } from "./CocosView";
import type { ViewLifecycleContext } from "./ViewBase";
import { Stage3dFixtureLogic } from "../logic/page/Stage3dFixtureLogic";
import { spikeSession } from "./scene3d/spikeSession";
import { createSpikeRealtimeSwitcher, createSpikeSkinningSwitcher, prepareSpikeSkinningLayouts } from "./scene3d/spikeSkinning";
import { captureSpikeOwnedInstancing } from "./scene3d/spikeOwnedInstancing";

export class Stage3dFixtureView extends CocosView {
    private world: Node | null = null;
    private readonly assets: Prefab[] = [];
    private readonly materials = new Map<Material, Material>();
    private readonly atlasBMaterials = new Map<Material, Material>();
    private readonly realtimeMaterials = new Map<Material, Material>();
    private detachInput: (() => void) | null = null;

    protected async onOpen(context: ViewLifecycleContext): Promise<void> {
        if (!DEV) throw new Error("SC0 fixture is only available in development");
        const logic = new Stage3dFixtureLogic();
        spikeSession.logic = logic;
        spikeSession.ready = false;
        spikeSession.error = null;
        spikeSession.skinning = null;
        spikeSession.switchSkinningClip = null;
        spikeSession.switchRealtimeSkinning = null;
        const scene = director.getScene();
        if (!scene) throw new Error("SC0 fixture needs a live scene");
        const world = new Node("Stage3dSpike.World");
        this.world = world;
        scene.addChild(world);
        const cameraNode = new Node("Stage3dSpike.Camera");
        world.addChild(cameraNode);
        // Keep all 500 cubes inside the fixed 375x812 portrait frustum.
        cameraNode.setPosition(0, 110, 145);
        cameraNode.lookAt(new Vec3(0, 0, 0));
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.priority = 0;
        camera.visibility = Layers.Enum.DEFAULT | 2;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(28, 40, 58, 255);
        camera.near = 0.1; camera.far = 1000; camera.fov = 45;
        const light = new Node("Stage3dSpike.Light");
        world.addChild(light);
        light.setRotationFromEuler(-60, -25, 0);
        light.addComponent(DirectionalLight).illuminance = 65000;
        this.detachInput = this.subscribeRawInput(context, {
            touch: (phase, event) => {
                const p = event.getUILocation();
                spikeSession.logic.pointer(event.getID(), phase, p.x, p.y);
                cameraNode.setPosition(spikeSession.logic.x * -0.03, 110, 145 + spikeSession.logic.y * 0.03);
            },
            wheel: () => { spikeSession.logic.wheels++; },
            cancel: () => spikeSession.logic.cancelAll(),
        });
        try {
            // Prefab children are verified against imported .meta by probe-stage3d before opening.
            const [plane, cube, biped, atlasB] = await Promise.all([
                "greybox-plane", "greybox-cube", "greybox-biped", "greybox-biped-atlas-b",
            ].map((name) => this.load(`stage3d/${name}/${name}`, context)));
            if (!context.isActive()) return;
            // Register before any instance can request a baked joint texture.
            const skinning = prepareSpikeSkinningLayouts(biped, atlasB);
            spikeSession.skinning = skinning.summary;
            world.addChild(instantiate(plane));
            for (let i = 0; i < 500; i++) {
                const node = instantiate(cube);
                node.name = `Stage3dSpike.Cube.${i}`;
                node.setPosition((i % 25 - 12) * 2.3, 0.5, (Math.floor(i / 25) - 10) * 2.3);
                world.addChild(node);
                this.enableInstancing(node);
            }
            for (let i = 0; i < 100; i++) {
                const node = instantiate(biped);
                node.name = i === 99 ? "Stage3dSpike.CrossAtlas" : `Stage3dSpike.Biped.${i}`;
                node.setPosition((i % 10 - 4.5) * 3, 1.1, (Math.floor(i / 10) - 4.5) * 3);
                world.addChild(node);
                for (const animation of node.getComponentsInChildren(SkeletalAnimation)) {
                    animation.useBakedAnimation = true;
                    animation.play(skinning.mainClips[i % 2]!.name);
                }
                this.enableInstancing(node);
                if (i === 99) {
                    spikeSession.switchSkinningClip = createSpikeSkinningSwitcher(node, skinning, (source) => {
                        let material = this.atlasBMaterials.get(source);
                        if (!material) {
                            material = new Material();
                            this.atlasBMaterials.set(source, material);
                            material.copy(source, { defines: { USE_INSTANCING: true } });
                        }
                        return material;
                    });
                    spikeSession.switchRealtimeSkinning = createSpikeRealtimeSwitcher(node, skinning, (source) => {
                        let material = this.realtimeMaterials.get(source);
                        if (!material) {
                            material = new Material();
                            this.realtimeMaterials.set(source, material);
                            material.copy(source, { defines: { USE_INSTANCING: false } });
                        }
                        return material;
                    }, () => {
                        const release = captureSpikeOwnedInstancing(node);
                        this.afterInstancingRetired(release, () => {});
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
            if (particleMaterial) this.materials.set(particleMaterial, particleMaterial);
            spikeSession.nodeCount = world.children.length;
            spikeSession.ready = true;
        } catch (error) {
            if (context.isActive() && spikeSession.logic === logic) {
                spikeSession.error = error instanceof Error ? error.message : String(error);
            }
            throw error;
        }
    }

    private load(path: string, context: ViewLifecycleContext): Promise<Prefab> {
        return new Promise((resolve, reject) => resources.load(path, Prefab, (error, asset) => {
            if (error || !asset) { reject(error ?? new Error(`Missing prefab: ${path}`)); return; }
            asset.addRef();
            if (!context.isActive()) {
                asset.decRef();
                reject(new Error(`SC0 load cancelled: ${path}`));
                return;
            }
            this.assets.push(asset);
            spikeSession.businessRefs++;
            resolve(asset);
        }));
    }

    private enableInstancing(node: Node): void {
        for (const renderer of node.getComponentsInChildren(MeshRenderer)) {
            renderer.sharedMaterials.forEach((source, index) => {
                if (!source) return;
                let material = this.materials.get(source);
                if (!material) {
                    material = new Material();
                    this.materials.set(source, material);
                    material.copy(source, { defines: { USE_INSTANCING: true } });
                }
                renderer.setMaterial(material, index);
            });
        }
    }

    protected onCloseLifecycle(): void {
        spikeSession.switchSkinningClip = null;
        spikeSession.switchRealtimeSkinning = null;
        this.detachInput?.();
        this.detachInput = null;
        const releaseInstancing = this.world ? captureSpikeOwnedInstancing(this.world) : null;
        this.world?.removeFromParent();
        this.world?.destroy();
        this.world = null;
        const assets = this.assets.splice(0);
        const materials = [...this.materials.values(), ...this.atlasBMaterials.values(), ...this.realtimeMaterials.values()];
        this.materials.clear();
        this.atlasBMaterials.clear();
        this.realtimeMaterials.clear();
        spikeSession.ready = false;
        spikeSession.nodeCount = 0;
        // Cocos destroys components at frame end; release only after scene references are gone.
        this.afterInstancingRetired(releaseInstancing, () => {
            for (const material of materials) material.destroy();
            for (const asset of assets) { asset.decRef(); spikeSession.businessRefs--; }
        });
    }

    private afterInstancingRetired(release: ReturnType<typeof captureSpikeOwnedInstancing> | null, done: () => void): void {
        const next = (): void => {
            if (release?.().pendingItems) {
                // Keep assets/materials retained until the exact old queue entries
                // stop rendering. The probe cannot pass closed-ref checks early.
                director.once(Director.EVENT_AFTER_DRAW, next);
                return;
            }
            done();
        };
        director.once(Director.EVENT_AFTER_DRAW, next);
    }
}
