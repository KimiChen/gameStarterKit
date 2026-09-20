/**
 * 动态网格批次：创建 / 上传 / 扩容 / 销毁的纪律**只写一遍**。
 * （slg 把这套重复了四份；抄过来时顺手抽成一份。）
 *
 * ⚠ 挂载次序有讲究：Node → layer 继承 → 入树 → MeshRenderer → 赋 mesh/material →
 * **最后**挂 UIMeshRenderer（它在 onLoad 里解析一次 ModelRenderer）。
 * ⚠ 更新必须 updateSubMesh + onGeometryChanged 成对，少一个不刷新。
 * ⚠ 销毁前先 node.active = false：destroy 延迟到帧末，而共享材质可能已同步销毁。
 * ⚠ 几何字段是 indices16 / indices32，⛔ 没有 indices。
 *
 * ⛔ 本文件**不写** director.getScene().globals ——
 * slg 为了抵消 tonemapping 去改场景全局（docs/3d.md §0.1 已点名为待迁移侵入），
 * 两个 kit 同时在场时 restore 会互相吃掉。这里改为只**读**管线态、由 logic 侧预补偿顶点色。
 */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, UIMeshRenderer, utils, Vec3 } from "cc";
import type { SgzzGeometry } from "../logic/sgzzMesh";

export interface SgzzBatch {
    node: Node;
    mesh: Mesh;
    model: MeshRenderer;
    capacity: number;
}

function toCcGeometry(data: SgzzGeometry) {
    return {
        positions: data.positions, uvs: data.uvs, colors: data.colors, indices16: data.indices16,
        minPos: new Vec3(data.minPos[0], data.minPos[1], data.minPos[2]),
        maxPos: new Vec3(data.maxPos[0], data.maxPos[1], data.maxPos[2]),
    };
}

/** 取 builtin-unlit 的 alpha-blend 技法下标；拿不到就 fail-fast（⛔ 不要静默画不出来）。 */
export function sgzzUnlitTechnique(): number {
    const index = EffectAsset.get("builtin-unlit")?.techniques.findIndex((e) => e.name === "alpha-blend") ?? -1;
    if (index < 0) throw new Error("SGZZMAP 需要 builtin-unlit 的 alpha-blend 技法");
    return index;
}

export function createSgzzMaterial(technique: number, textured: boolean): Material {
    const material = new Material();
    material.initialize({
        effectName: "builtin-unlit", technique,
        defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: textured },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE } },
    });
    return material;
}

/** 只**读**管线的 tonemapping 档位，交给 logic 侧做顶点色预补偿。⛔ 绝不写回。 */
export function sgzzPipelineToneMapping(): number {
    const post = director.getScene()?.globals?.postSettings as { toneMappingType?: number } | undefined;
    return typeof post?.toneMappingType === "number" ? post.toneMappingType : 0;
}

export function createSgzzBatch(root: Node, name: string, data: SgzzGeometry,
                                material: Material, at?: number): SgzzBatch {
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
        node.addComponent(UIMeshRenderer);   // ★ 必须最后挂
        return { node, mesh, model, capacity };
    } catch (error) {
        node.destroy();
        mesh.destroy();
        throw error;
    }
}

export function uploadSgzzBatch(batch: SgzzBatch, data: SgzzGeometry): void {
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

export function destroySgzzBatch(batch: SgzzBatch | null): void {
    if (!batch) return;
    batch.node.active = false;   // ★ 先摘激活态
    batch.node.destroy();
    batch.mesh.destroy();
}
