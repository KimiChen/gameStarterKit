/**
 * 动态网格批次：创建 / 上传 / 扩容 / 销毁的纪律**只写一遍**。
 * （slg 把这套重复了四份；抄过来时顺手抽成一份。）
 *
 * ⚠ 挂载次序有讲究：Node → layer 继承 → 入树 → MeshRenderer → 赋 mesh/material →
 * **最后**挂 UIMeshRenderer（它在 onLoad 里解析一次 ModelRenderer）。
 * ⚠ 整批更新必须 updateSubMesh + onGeometryChanged 成对；O6 固定拓扑的属性更新见文末。
 * ⚠ 销毁前先 node.active = false：destroy 延迟到帧末，而共享材质可能已同步销毁。
 * ⚠ 几何字段是 indices16 / indices32，⛔ 没有 indices。
 *
 * ⛔ 本文件**不写** director.getScene().globals ——
 * slg 为了抵消 tonemapping 去改场景全局（docs/3d.md §0.1 已点名为待迁移侵入），
 * 两个 kit 同时在场时 restore 会互相吃掉。这里改为只**读**管线态、由 logic 侧预补偿顶点色。
 */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, UIMeshRenderer, utils, Vec3 } from "cc";
import type { MapoGeometry } from "../logic/mapoMesh";
import type { MapoSpriteUpdate } from "../logic/mapoSpriteUpdates";

export interface MapoBatch {
    node: Node;
    mesh: Mesh;
    model: MeshRenderer;
    capacity: number;
}

function toCcGeometry(data: MapoGeometry) {
    return {
        positions: data.positions, uvs: data.uvs, colors: data.colors, indices16: data.indices16,
        customAttributes: [{ attr: new gfx.Attribute("a_colorAdd", gfx.Format.RGBA32F),
            values: data.addColors ?? new Float32Array(data.colors.length) }],
        minPos: new Vec3(data.minPos[0], data.minPos[1], data.minPos[2]),
        maxPos: new Vec3(data.maxPos[0], data.maxPos[1], data.maxPos[2]),
    };
}

/** 取 builtin-unlit 的 alpha-blend 技法下标；拿不到就 fail-fast（⛔ 不要静默画不出来）。 */
export function mapoUnlitTechnique(): number {
    const index = EffectAsset.get("builtin-unlit")?.techniques.findIndex((e) => e.name === "alpha-blend") ?? -1;
    if (index < 0) throw new Error("SGZZMAP 需要 builtin-unlit 的 alpha-blend 技法");
    return index;
}

export function createMapoMaterial(technique: number, textured: boolean, spriteEffect?: EffectAsset | null,
                                   fromRenderTexture = false): Material {
    const material = new Material();
    material.initialize({
        ...(spriteEffect ? { effectAsset: spriteEffect, technique: 0 } : { effectName: "builtin-unlit", technique }),
        defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: textured,
            SAMPLE_FROM_RT: fromRenderTexture, MAPO_UNPREMULTIPLY: fromRenderTexture },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE } },
    });
    return material;
}

/** 只**读**管线的 tonemapping 档位，交给 logic 侧做顶点色预补偿。⛔ 绝不写回。 */
export function mapoPipelineToneMapping(): number {
    const post = director.getScene()?.globals?.postSettings as { toneMappingType?: number } | undefined;
    return typeof post?.toneMappingType === "number" ? post.toneMappingType : 0;
}

export function createMapoBatch(root: Node, name: string, data: MapoGeometry,
                                material: Material, at?: number, captureOrder?: number): MapoBatch {
    const capacity = Math.max(1, data.quads);
    const mesh = utils.MeshUtils.createDynamicMesh(0, toCcGeometry(data), undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: Math.max(4, capacity * 4),
        maxSubMeshIndices: Math.max(6, capacity * 6),
    });
    const node = new Node(name);
    try {
        node.layer = root.layer;
        if (at === undefined) root.addChild(node); else root.insertChild(node, at);
        const model = node.addComponent(MeshRenderer);
        model.mesh = mesh;
        model.material = material;
        if (captureOrder === undefined) node.addComponent(UIMeshRenderer);   // ★ 必须最后挂
        else model.priority = captureOrder; // 离屏走普通网格，相机投影与图层顺序均独立于 UI 队列。
        return { node, mesh, model, capacity };
    } catch (error) {
        node.destroy();
        mesh.destroy();
        throw error;
    }
}

export function uploadMapoBatch(batch: MapoBatch, data: MapoGeometry): void {
    if (data.quads > batch.capacity) {
        // 超容量就换一张更大的动态网格；旧网格帧末回收。
        const fresh = utils.MeshUtils.createDynamicMesh(0, toCcGeometry(data), undefined, {
            maxSubMeshes: 1, maxSubMeshVertices: data.quads * 4, maxSubMeshIndices: data.quads * 6,
        });
        const old = batch.mesh;
        batch.model.mesh = fresh;
        batch.mesh = fresh;
        batch.capacity = data.quads;
        old.destroy();
        return;
    }
    batch.mesh.updateSubMesh(0, toCcGeometry(data));
    batch.model.onGeometryChanged();
}

export function destroyMapoBatch(batch: MapoBatch | null): void {
    if (!batch) return;
    batch.node.active = false;   // ★ 先摘激活态
    batch.node.destroy();
    batch.mesh.destroy();
}

/** 多批上传共用同一材质，兄弟顺序与几何批次顺序一致，超量不丢件。 */
export function syncMapoBatches(root: Node, name: string, batches: MapoBatch[],
                                geometries: readonly MapoGeometry[], material: Material): void {
    for (let i = 0; i < geometries.length; i += 1) {
        if (batches[i]) uploadMapoBatch(batches[i], geometries[i]);
        else batches.push(createMapoBatch(root, i === 0 ? name : `${name}-${i}`, geometries[i], material));
    }
    while (batches.length > geometries.length) destroyMapoBatch(batches.pop()!);
}

export function clearMapoBatches(batches: MapoBatch[]): void {
    for (const batch of batches) destroyMapoBatch(batch);
    batches.length = 0;
}

/**
 * O6 固定拓扑的 sprite 更新。只提交脏属性，索引和其它属性保持原缓冲。
 * Creator 3.8.8 的公开 Buffer.update 只接受 offset=0，BufferView.update 被引擎拒绝；
 * 因此上传该属性到最后脏 quad 的前缀。CPU 镜像、实际位置边界同步，既不改引擎也不增加 draw call。
 * 四个 stream 的顺序来自 toCcGeometry / createDynamicMesh：position、uv、color、colorAdd。
 */
export function syncMapoSpriteUpdates(root: Node, name: string, batches: MapoBatch[],
    updates: readonly MapoSpriteUpdate[], count: number, material: Material): void {
    for (let i = 0; i < updates.length; i++) {
        const { geometry: data, full, ends } = updates[i];
        const batch = batches[i];
        if (!batch) { batches.push(createMapoBatch(root, i === 0 ? name : `${name}-${i}`, data, material)); continue; }
        if (full) { uploadMapoBatch(batch, data); continue; }
        if (!ends.some(Boolean)) continue;
        const mesh = batch.mesh, sub = mesh.renderingSubMeshes[0], layout = mesh.struct;
        const attributes = [data.positions, data.uvs, data.colors, data.addColors!], strides = [12, 8, 16, 16];
        if (sub.vertexBuffers.length !== 4 || layout.primitives[0].vertexBundelIndices.length !== 4) {
            throw new Error("mapOriginal sprite mesh attribute layout changed");
        }
        for (let a = 0; a < 4; a++) if (ends[a]) {
            const view = layout.vertexBundles[layout.primitives[0].vertexBundelIndices[a]].view;
            if (view.stride !== strides[a] || view.count !== data.quads * 4) throw new Error("mapOriginal sprite topology changed without rebuild");
            const values = attributes[a].subarray(0, ends[a] * strides[a]);
            const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
            mesh.data.set(bytes, view.offset); sub.vertexBuffers[a].update(bytes, bytes.byteLength);
        }
        if (ends[0]) {
            layout.minPosition = new Vec3(data.minPos[0], data.minPos[1], data.minPos[2]);
            layout.maxPosition = new Vec3(data.maxPos[0], data.maxPos[1], data.maxPos[2]);
            sub.invalidateGeometricInfo(); batch.model.onGeometryChanged();
        }
    }
    while (batches.length > count) destroyMapoBatch(batches.pop()!);
}
