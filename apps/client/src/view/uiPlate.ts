/**
 * 手搓 Cocos 页共用的**纯色矩形底板**画法。
 *
 * ⛔ **不要再用 `Graphics` 画纯色矩形。** 实测（Creator 3.8.8 预览，经 CDP 读引擎 profiler）：
 * 每个 `Graphics` 组件固定占用约 **2.25MB 显存缓冲**，与它实际画多少内容无关；而且每个都自成一个
 * draw call，还会打断相邻 Label 的合批。三点实测完全线性，缓冲显存几乎全部由 Graphics 个数解释：
 *
 * | 页面 | Graphics | 缓冲显存 | 每个 | draw call |
 * |---|---|---|---|---|
 * | 首屏 | 3 | 6.8 MB | 2.27 MB | 9 |
 * | 设置 | 25 | 56.3 MB | 2.25 MB | 59 |
 * | 衣柜 | 50 | 112.6 MB | 2.25 MB | 116 |
 *
 * 衣柜那 50 个各自只画一个 4 顶点的矩形，却合计吃掉 113MB——桌面上看不出来，手机视口是事故。
 * 换成共享同一张内置白图的 `Sprite` 后，每块底板只是共享顶点缓冲里的 4 个顶点，且彼此可以合批。
 *
 * ⚠ 本文件只针对「纯色矩形」这一种用法。`Graphics` 仍然是画线、圆、折线的正确工具
 * （战场网格、蛇身降级描边、轨迹等），⛔ 别把那些也一并换掉。
 */
import { builtinResMgr, Color, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform } from "cc";

let sharedFrame: SpriteFrame | null = null;

/**
 * 所有底板共用的 2×2 全白帧。
 *
 * ⚠ 只建一次并缓存：所有底板必须共用**同一个** SpriteFrame，否则纹理不同就合不了批，
 * 换成 Sprite 的意义就没了。
 *
 * ⛔ **不要直接用 `builtinResMgr.get("default-spriteframe")`。** 那张内置帧的 `packable` 是 true，
 * 而动态图集默认启用（maxFrameSize 512，2×2 完全够格）会试图打包它；但它的 `ImageAsset.data`
 * 是 `Uint8Array` 而不是 `HTMLImageElement`，`DynamicAtlasTexture.drawTextureAt` 调
 * `texSubImage2D` 时重载解析失败并抛 TypeError，**整个渲染循环当场死掉**（画面定格、帧数不再推进）。
 * 真机实测的正向对照：同一段代码 `packable = true` → 帧推进 0 + 该 TypeError；
 * `packable = false` → 帧推进 54/900ms、零异常。唯一变量就是这个字段。
 * ⚠ 这里自建帧而不是去改内置资产的 `packable`，是为了不给引擎的共享资产留全局副作用。
 */
function whiteFrame(): SpriteFrame {
    if (sharedFrame) return sharedFrame;
    const frame = new SpriteFrame();
    frame.texture = builtinResMgr.get<Texture2D>("white-texture");
    frame.rect = new Rect(0, 0, 2, 2);
    frame.packable = false;
    sharedFrame = frame;
    return frame;
}

/**
 * 在 `parent` 下建一块居中于 `(x, y)` 的纯色矩形底板，返回该节点。
 * 语义与各页原先的私有 `plate()` 完全一致（节点带 UITransform，可继续参与命中测试）。
 */
export function createSolidPlate(
    parent: Node,
    width: number,
    height: number,
    color: Color,
    x: number,
    y: number,
    name = "plate",
): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    const transform = node.addComponent(UITransform);
    transform.width = width;
    transform.height = height;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const sprite = node.addComponent(Sprite);
    // ⚠ 顺序即契约（同 S5-05 F7 的病根）：`sizeMode` 必须在赋 `spriteFrame` **之前**设成 CUSTOM。
    // 赋值那一刻若仍是默认的 TRIMMED，引擎会用 frame.rect（这里是 2×2）覆写 UITransform 尺寸，
    // 而事后再设 CUSTOM ⛔ 不会回滚——它只抑制后续的自动改尺寸。
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.spriteFrame = whiteFrame();
    sprite.color = color;
    return node;
}
