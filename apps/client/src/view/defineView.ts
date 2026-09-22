/**
 * 页面元数据定义（docs/CLIENT.md §4，借鉴 Sect-TsProject 的 initWidget 声明式注册）。
 *
 * 纯类型 + 构造器，无头 typecheck 在检。⛔ 本文件不得 import FguiView/fairygui——
 * 会把 fairygui 类型拖进无头检查（View 构造器用下方不透明形状表达，真实类型在
 * ViewMgr（Creator 侧验证）收敛）。
 */
import type { FguiContract } from "./fguiContracts";
import type { ViewLayer } from "./layers";

export type ViewInputMode = "modal" | "overlay" | "passive";

/** View 构造器的不透明形状（实际为 FguiView / CocosView 子类构造器）。 */
export type ViewCtorLike = new (root: never) => unknown;

/** 两种渲染栈共有的页面元数据（ViewMgr 的事务序只读这一段）。 */
interface ViewMetaBase {
    /** 页面名 = 文件名前缀（GuildView → "Guild"）；守门测试校验 文件集合 ⇔ 注册表键 相等 */
    name: string;
    /** 渲染层（base < popup < top） */
    layer: ViewLayer;
    /** true → 挂满层容器（高浮动由 relation 吸收，FIXED_WIDTH 配套）；false → 按设计尺寸挂载 */
    fullscreen: boolean;
    /** 单例：已打开时 open() 置顶复用，不重建 */
    onlyOne: boolean;
    /** 常驻：close() 只摘下不销毁（缓存实例），再次 open 秒开 */
    permanent: boolean;
    /** 输入策略；缺省沿用 interactive，二者均省略时为 passive。overlay 仅限 FGUI。 */
    inputMode?: ViewInputMode;
    /** 兼容别名：true = modal，false = passive；与 inputMode 同时声明必须一致。 */
    interactive?: boolean;
    /** 动态 import 闭包（铁律 10：fairygui 不进静态依赖图）；也是后续资源拆分的加载点 */
    load: () => Promise<ViewCtorLike>;
}

/** FairyGUI 页面：由 UIPackage 创建组件根，ViewMgr 打开前先 ensurePackages。 */
export interface FguiViewMeta extends ViewMetaBase {
    kind: "fgui";
    /** 命名元素契约。⚠ 同一对象须同时列进 fguiContracts.FGUI_CONTRACTS（守门测试双向校验） */
    contract: FguiContract;
    /** 跨包共享库依赖（如 ["ui/Original"]）：open 前 ensurePackages，常驻不卸载 */
    sharedPkgs?: readonly string[];
}

/**
 * 纯 Cocos 节点页面：⛔ 无 FGUI 段（无 contract / 无 sharedPkgs）——ViewMgr 跳过
 * ensurePackages 与组件创建，直接实例化 CocosView 子类并挂到层容器节点下。
 * 只有**被某个 plugin 的 routes 引用**的 cocos View 才是页面并进入 catalog；
 * 未被引用的 cocos View 是玩法表现件，由 gameplay presentation 自行挂载。
 */
export interface CocosViewMeta extends ViewMetaBase {
    kind: "cocos";
}

/** 页面元数据（按 `kind` 判别渲染栈；ViewMgr 的两条分支共用同一套生命周期）。 */
export type ViewMeta = FguiViewMeta | CocosViewMeta;

/** 恒等构造器：只为类型收窄与登记点语法统一（对齐 defineRpc/defineMock 哲学）。 */
export function defineView(meta: ViewMeta): ViewMeta {
    resolveViewInputMode(meta);
    return meta;
}

/** Runtime and codegen reject the same invalid combinations. No engine dependency. */
export function resolveViewInputMode(meta: Pick<ViewMeta, "kind" | "inputMode" | "interactive">): ViewInputMode {
    const mode = meta.inputMode ?? (meta.interactive === true ? "modal" : "passive");
    if (!["modal", "overlay", "passive"].includes(mode)) throw new TypeError("Invalid view inputMode");
    if (meta.interactive !== undefined && typeof meta.interactive !== "boolean") throw new TypeError("Invalid view interactive");
    if (meta.inputMode !== undefined && meta.interactive !== undefined
        && mode !== (meta.interactive ? "modal" : "passive")) throw new TypeError("Contradictory inputMode / interactive");
    if (mode === "overlay" && meta.kind !== "fgui") throw new TypeError("overlay requires kind: fgui");
    return mode;
}
