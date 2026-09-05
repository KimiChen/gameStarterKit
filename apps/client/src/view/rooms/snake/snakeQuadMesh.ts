/**
 * Snake 两个批渲染器共用的「UI 内动态四边形网格」接缝：把三条引擎硬约束收在一处。
 *
 * ⚠ 三条都在 Cocos 3.8.8 真引擎上实测过（S5-05 取证）。⛔ 任何一条踩错的表现都是**什么都不画、
 * 只有控制台告警**，而不是抛异常——调用方的 try/catch 兜不住，降级路径也不会被触发：
 *
 * 1. `UIMeshRenderer` **不是**渲染器，它没有 `mesh` / `material`（原型链上都没有）。它只是 UI 桥：
 *    在 `onLoad` 里查**一次** `getComponent("cc.ModelRenderer")` 并缓存下来。所以必须**先**加
 *    `MeshRenderer`（其基类正是 `ModelRenderer`）再加 `UIMeshRenderer`，且节点需已在场景中，
 *    否则 `onLoad` 只会 `warnID(16378) node '%s' doesn't have any renderable component` 后返回。
 *    ⚠ `MeshRenderer` 在 `cc` **模块**里有，但**不在** `cc` 全局对象上（全局那份的旧名是
 *    `ModelComponent`）——别用 `cc.MeshRenderer` 去判断它是否存在。
 * 2. `utils.createMesh` 造的是**静态**网格，`mesh.updateSubMesh` 的第一条判据就是
 *    `if (!this._struct.dynamic) { warnID(14200); return; }`，逐帧写入永远到不了 GPU。
 *    必须用 `utils.MeshUtils.createDynamicMesh`。⚠ 它的 `options` 是**整体默认、不是逐字段合并**
 *    （源码 `options || {...}`），三个字段必须一起给全。
 * 3. effect 名 `builtin-ui` **不存在**，材质会拿到零 pass，于是 `setProperty` 必然
 *    `warnID(16373) illegal property name`。2D 精灵用的 `for2d/builtin-sprite` 同样不行——它的
 *    `cc_spriteTexture` 位于 local 描述符集，由 2D 批处理器按各自的 SpriteFrame 逐次覆写。
 *    只有 `builtin-unlit` 把 `mainTexture` 声明为真正的 per-material 贴图槽。
 */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";

/** 一个四边形 4 顶点、6 索引（两个三角形）。 */
export const QUAD_VERTS = 4;
export const QUAD_INDICES = 6;

const UNLIT_EFFECT = "builtin-unlit";
/**
 * ⛔ 不要改用 `transparent` 技法：它与 `alpha-blend` 的混合状态相同，但多挂一个 `planar-shadow`
 * pass，会在纯 2D 的战场上多画一层平面阴影。`alpha-blend` 只有 default + deferred-forward 两个 pass。
 */
const UNLIT_TECHNIQUE = "alpha-blend";

/** `ToneMappingType.LINEAR`。⚠ ACES 是 0，也就是引擎缺省值。 */
const TONE_MAPPING_LINEAR = 1;

/**
 * 把场景的色调映射切成 LINEAR。⛔ 这**不是**美化选项，是本文件材质选型的必要配套。
 *
 * `builtin-unlit` 的片元最后走 `CCFragOutput`，其中有一段
 * `#if CC_USE_HDR && CC_TONE_MAPPING_TYPE == HDR_TONE_MAPPING_ACES`（ACES 常量为 0）。
 * 本工程 `pipeline.macros.CC_USE_HDR = true`、场景缺省 `toneMappingType = 0`，条件成立，于是
 * 输出被 `ACESToneMap()` + `LinearToSRGB()` 处理；而 `unlit-fs` 入口已经做过一次
 * `SRGBToLinear()`。净传递函数变成 `out = sqrt(ACES(tex²))`——同一张图集经网格渲染后中间调被抬高、
 * 高光被压暗（实测 255→229、128→156、32→22）。
 * ⚠ 而蛇头/蛇尾是 `cc.Sprite`，走 `for2d/builtin-sprite` 原样输出，Graphics 降级路径同样原样输出。
 * 结果就是**同一条蛇的身体与头会有肉眼可见的色差**。
 * 置为 LINEAR 后 ACES 分支不成立，只剩 `LinearToSRGB`，与入口的 `SRGBToLinear` 正好抵消，两条路径一致。
 * （实测该宏参与着色器变体标识：变体名会多出 `CC_TONE_MAPPING_TYPE1`，即确实重新编译而非命中旧变体。）
 *
 * ⛔ 别改成给 `Material.initialize` 传 `CC_USE_HDR: false`——`program-lib` 会
 * `Object.assign(defines, pipeline.macros)`，管线宏恒覆盖材质 defines（已实测无效）。
 * ⚠ 影响面仅限走 `CCFragOutput` 的材质。本仓是纯 2D，除这两个批渲染器外没有别的网格材质；
 * Sprite / Label / Graphics 都不经过它，所以这是个安全的全局设置。
 */
function ensureLinearToneMapping(): void {
    const postSettings = director.getScene()?.globals?.postSettings;
    if (postSettings && postSettings.toneMappingType !== TONE_MAPPING_LINEAR) {
        postSettings.toneMappingType = TONE_MAPPING_LINEAR;
    }
}

export interface QuadBuffers {
    readonly positions: Float32Array;
    readonly uvs: Float32Array;
    readonly colors: Float32Array;
    readonly indices: Uint16Array;
}

/** 按四边形容量分配三条顶点流，并把固定的索引三角形对填好。 */
export function allocateQuadBuffers(quadCapacity: number): QuadBuffers {
    const vertCount = quadCapacity * QUAD_VERTS;
    const indices = new Uint16Array(quadCapacity * QUAD_INDICES);
    for (let quad = 0; quad < quadCapacity; quad += 1) {
        const vert = quad * QUAD_VERTS;
        indices.set([vert, vert + 1, vert + 2, vert + 2, vert + 1, vert + 3], quad * QUAD_INDICES);
    }
    return {
        positions: new Float32Array(vertCount * 3),
        uvs: new Float32Array(vertCount * 2),
        colors: new Float32Array(vertCount * 4),
        indices,
    };
}

/** 建**动态**网格；容量上限即 `updateSubMesh` 的断言上限，⛔ 之后上传不得超过它。 */
export function createQuadMesh(buffers: QuadBuffers, quadCapacity: number): Mesh {
    return utils.MeshUtils.createDynamicMesh(
        0,
        {
            positions: buffers.positions,
            uvs: buffers.uvs,
            colors: buffers.colors,
            indices16: buffers.indices,
        },
        undefined,
        {
            maxSubMeshes: 1,
            maxSubMeshVertices: quadCapacity * QUAD_VERTS,
            maxSubMeshIndices: quadCapacity * QUAD_INDICES,
        },
    );
}

/** 贴图化的顶点色四边形材质。⚠ 关剔除：蛇身缎带的法线随转向翻正负，背面剔除会让一半转弯段消失。 */
export function createQuadMaterial(texture: Texture2D): Material {
    ensureLinearToneMapping();
    const effect = EffectAsset.get(UNLIT_EFFECT);
    const technique = effect?.techniques.findIndex((entry) => entry.name === UNLIT_TECHNIQUE) ?? -1;
    // ⛔ 不要退回默认技法：拿错技法只会静默多画阴影，不如在这里显式失败让调用方走降级。
    if (technique < 0) throw new Error(`${UNLIT_EFFECT} 缺少 ${UNLIT_TECHNIQUE} 技法`);
    const material = new Material();
    material.initialize({
        effectName: UNLIT_EFFECT,
        technique,
        defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE } },
    });
    material.setProperty("mainTexture", texture);
    return material;
}

/**
 * 把网格与材质挂到节点上。⚠ 顺序即契约：`MeshRenderer` 必须先于 `UIMeshRenderer`，
 * 且调用前节点应已 `addChild` 进场景——见文件头第 1 条。
 */
export function attachQuadMesh(node: Node, mesh: Mesh, material: Material): MeshRenderer {
    const model = node.addComponent(MeshRenderer);
    model.mesh = mesh;
    model.material = material;
    node.addComponent(UIMeshRenderer);
    // ⚠ 必须把 MeshRenderer 交回调用方：每次上传几何后都要调它的 onGeometryChanged()，见 uploadQuads。
    return model;
}

/**
 * 只上传实际用到的前 `quadCount` 个四边形。
 *
 * ⚠ **上传后必须调 `model.onGeometryChanged()`，⛔ 少这一步整个「只上传实际用量」的前提就不成立。**
 * `Mesh.updateSubMesh` 只改 `struct` 与 `subMesh.drawInfo`，**不动 InputAssembler**；而真正决定
 * `gl.drawElements` 画多少的是 `inputAssembler.drawInfo.indexCount`，它在建网格时就按满容量定死了。
 * 实测（容量 24 索引）：上传一半后 `subMesh.drawInfo` = 12 而 `inputAssembler.drawInfo` 仍是 24，
 * 调用 `onGeometryChanged()` 后才降到 12。不调用的后果是**绘制数量永不收缩**——蛇变短时，
 * 上一帧写在尾部的四边形会继续被画出来（旧实现靠「逐帧把尾部顶点清零成退化三角形」掩盖这一点，
 * 每条蛇每帧约 8.3 万次浮点写，那是为静态网格做的补偿）。
 * ⚠ 顶点/索引数由传入的 subarray 长度决定（实测：传一半长度，`vertexBundles[0].view.count`
 * 与 `primitives[0].indexView.count` 同步减半）。
 * ⚠ 必须给包围盒：`updateSubMesh` 只在 `minPos && maxPos` 同时存在时才写入 struct 的 min/maxPosition，
 * 而它们的唯一读者正是 `onGeometryChanged()` 里的 `Model.createBoundingShape`——两者是一对，缺一则
 * 要么裁剪用错包围盒、要么这段扫描是白做的。
 */
export function uploadQuads(model: MeshRenderer, mesh: Mesh, buffers: QuadBuffers, quadCount: number): void {
    // 空批次不上传：调用方会把节点置为 inactive，残留几何不会被画出来。
    // ⚠ 依赖调用方置 inactive，⛔ 别把这里改成「什么都不做」后又忘了熄灭节点。
    if (quadCount <= 0) return;
    const vertCount = quadCount * QUAD_VERTS;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let vert = 0; vert < vertCount; vert += 1) {
        const x = buffers.positions[vert * 3];
        const y = buffers.positions[vert * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    mesh.updateSubMesh(0, {
        positions: buffers.positions.subarray(0, vertCount * 3),
        uvs: buffers.uvs.subarray(0, vertCount * 2),
        colors: buffers.colors.subarray(0, vertCount * 4),
        indices16: buffers.indices.subarray(0, quadCount * QUAD_INDICES),
        minPos: new Vec3(minX, minY, 0),
        maxPos: new Vec3(maxX, maxY, 0),
    });
    model.onGeometryChanged();
}
