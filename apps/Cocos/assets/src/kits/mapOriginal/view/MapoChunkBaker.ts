import { Camera, Color, Director, director, Material, Node, RenderTexture, Texture2D } from "cc";
import { mapoStaticScene } from "../logic/mapoStaticScene";
import type { MapoCacheTile } from "../logic/mapoLodCache";
import { createMapoBatch, createMapoMaterial, clearMapoBatches, type MapoBatch } from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/** 每帧最多一块，普通网格与专用离屏相机；不改宿主相机、全局管线或 3D 舞台。 */
export class MapoChunkBaker {
    private readonly root: Node;
    private readonly cameraNode: Node;
    private readonly camera: Camera;
    private readonly batches: MapoBatch[] = [];
    private readonly materials = new Map<string, Material>();
    private pending: RenderTexture | null = null;
    private complete: (() => void) | null = null;
    private disposed = false;
    get busy(): boolean { return this.pending !== null; }

    constructor(private readonly art: MapoArtResources) {
        const scene = director.getScene();
        if (!scene) throw new Error("mapOriginal cache requires a scene");
        // 动态选择未被场景节点和现有相机使用的自定义位，避免画到宿主 UI/3D 相机里。
        let occupied = 3;
        const visit = (node: Node) => {
            occupied |= node.layer;
            const camera = node.getComponent(Camera);
            if (camera) occupied |= camera.visibility;
            for (const child of node.children) visit(child);
        };
        visit(scene);
        let bit = 19;
        while (bit >= 2 && (occupied & (1 << bit))) bit--;
        if (bit < 2) throw new Error("mapOriginal has no isolated capture layer");
        this.root = new Node("mapo-cache-capture");
        this.root.layer = 1 << bit;
        this.root.active = false;
        scene.addChild(this.root);
        this.cameraNode = new Node("mapo-cache-camera");
        this.cameraNode.layer = this.root.layer;
        scene.addChild(this.cameraNode);
        this.camera = this.cameraNode.addComponent(Camera);
        this.camera.enabled = false;
        this.camera.projection = Camera.ProjectionType.ORTHO;
        this.camera.visibility = this.root.layer;
        this.camera.priority = -100;
        this.camera.near = 1; this.camera.far = 1000;
        this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera.clearColor = new Color(0, 0, 0, 0);
    }

    bake(tile: MapoCacheTile, ready: (texture: RenderTexture) => void): void {
        if (this.disposed || this.pending) return;
        const texture = new RenderTexture();
        this.pending = texture;
        try {
            texture.reset({ width: tile.pixels, height: tile.pixels, name: `mapo-cache-${tile.key}` });
            texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
            texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
            for (const part of mapoStaticScene(tile.capture, tile.lod === 1, tile.details, 0, this.art.data)) {
                const source = this.art.staticTexture(part.texture);
                if (!source) throw new Error(`mapOriginal cache missing ${part.texture}`);
                let material = this.materials.get(part.texture);
                if (!material) {
                    if (part.repeat) source.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
                    material = createMapoMaterial(0, true, this.art.spriteEffect);
                    material.setProperty("mainTexture", source);
                    this.materials.set(part.texture, material);
                }
                // Creator 3.8.8 自定义管线的 UI/Profiler 队列共享投影数据；UIMeshRenderer
                // 离屏会套到主 UI 投影。普通网格保留专用相机的投影，priority 守住画家顺序。
                this.batches.push(createMapoBatch(this.root, `mapo-capture-${part.texture}`, part.geometry,
                    material, undefined, this.batches.length));
            }
            const r = tile.capture;
            this.cameraNode.setPosition((r.left + r.right) / 2, (r.top + r.bottom) / 2, 100);
            this.camera.orthoHeight = (r.top - r.bottom) / 2;
            this.camera.targetTexture = texture;
            this.root.active = true;
            this.camera.enabled = true;
            this.complete = () => {
                this.complete = null;
                this.camera.enabled = false;
                this.root.active = false;
                this.camera.targetTexture = null;
                clearMapoBatches(this.batches);
                this.pending = null;
                ready(texture);
            };
            director.once(Director.EVENT_AFTER_DRAW, this.complete);
        } catch (error) {
            this.camera.enabled = false; this.root.active = false; this.camera.targetTexture = null;
            clearMapoBatches(this.batches); texture.destroy(); this.pending = null;
            throw error;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.complete) director.off(Director.EVENT_AFTER_DRAW, this.complete);
        this.complete = null;
        this.camera.enabled = false; this.root.active = false; this.camera.targetTexture = null;
        clearMapoBatches(this.batches);
        this.pending?.destroy(); this.pending = null;
        for (const material of this.materials.values()) material.destroy();
        this.materials.clear();
        this.root.destroy(); this.cameraNode.destroy();
    }
}
