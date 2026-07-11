/**
 * RankView —— 排行榜 FairyGUI 视图（本项目**第一个虚拟列表 GList** 视图）。加载 `ui/Rank` 包 → 建 RankMain →
 * 绑 lst_rank(虚拟列表)/jb_playerRank(我的名次固定行)/tabs/close → 用纯 presenter `rankView` 归一后填充。
 *
 * ⚠ 本目录（`ui/fgui/**`）排除在无头 cc-stub typecheck 外（依赖 fairygui-cc），由 Creator 验。
 *   数据/行为在 `rankRows`（presenter，已无头测）+ 假数据 `rankFakeData`；本层只“取组件 + 搬数据 + 翻控制器”。
 *   模态弹窗：打开时 setInputEnabled(true) 捕获输入，关闭 dispose（GRoot 退场，输入还给菜单）。见 fairgui.md。
 */
import { Controller, GComponent, GList, GLoader, GObject, GTextField } from "db://fairygui-cc/fairygui.mjs";
import { FguiView } from "./FguiView";
import { RankScope, type RankListResponse, type RankScopeValue } from "../../../shared/protocol";
import { rankView, type RankRowView } from "../rankRows";
import { FAKE_RANK_RESP, FAKE_SELF_PROFILE, RANK_NAMES } from "../rankFakeData";

export class RankView extends FguiView {
  static readonly PKG = "Rank";
  static readonly COMP = "RankMain";

  private lst_rank!: GList;
  private jb_playerRank!: GComponent;
  private ctrl_scope: Controller | null = null;

  private scope: RankScopeValue = RankScope.Country;
  private rows: RankRowView[] = [];

  /** 打开面板（模态：GRoot 捕获输入）。本次实验用假数据 FAKE_RANK_RESP 渲染。 */
  static async open(): Promise<RankView> {
    // 跨包依赖:btn_close 复用**公司标准库** Original/CloseButton1(src=资源id rftu3,pkg=包id k85eojd9),
    // 须先加载 Original 包(全局发布 Original.bin 到 resources/ui;缺失则关闭按钮空占位,面板仍开)。
    // 榜单专属美术(框/Tab/行/奖牌/星/头像框)在 Rank 包内、取自原版反编译(公司库未 export 这些原子,后续 export 后再换)。
    await FguiView.ensurePackages(["ui/Original"]);
    const v = await FguiView.create(RankView, "ui/Rank", RankView.PKG, RankView.COMP);
    v.mountTo();
    FguiView.setInputEnabled(true); // 模态弹窗 → 捕获输入（关闭时置回）
    v.apply(FAKE_RANK_RESP, RankScope.Country);
    return v;
  }

  protected bind(): void {
    this.lst_rank = this.getChild<GList>("lst_rank");
    this.jb_playerRank = this.getChild<GComponent>("jb_playerRank");
    this.ctrl_scope = this.root.getController("ctrl_scope");
    // 虚拟列表：先设 itemRenderer + setVirtual，再设 numItems（否则 numItems 触发渲染时 renderer 还没绑）
    this.lst_rank.itemRenderer = (index: number, obj: GObject) => this.renderInto(obj.asCom, this.rows[index]);
    this.lst_rank.setVirtual();
    // close = 跨包 Original/CloseButton1(GButton);tabs = GLoader 皮(switchScope 里换皮)。
    this.onClick(this.getChild<GObject>("btn_close"), () => this.close());
    this.onClick(this.getChild<GObject>("btn_country"), () => this.switchScope(RankScope.Country));
    this.onClick(this.getChild<GObject>("btn_province"), () => this.switchScope(RankScope.Province));
    // 兜底关闭:点面板外暗底 img_bg 关闭(点面板/列表命中的是面板,不触发)。防 Original.bin 缺失时
    // btn_close 变不可点空占位 + 全屏模态吞输入 → 软锁死(无退出路径)。见 fairgui.md 输入共存。
    this.onClick(this.getChild<GObject>("img_bg"), () => this.close());
  }

  /** 用 presenter 归一后填列表 + 我的名次固定行。 */
  apply(resp: RankListResponse, scope: RankScopeValue): void {
    this.scope = scope;
    if (this.ctrl_scope) { this.ctrl_scope.selectedIndex = scope === RankScope.Country ? 0 : 1; }
    this.setTabSkin(); // Tab 换皮:选中金(tabC)/未选灰(tabP),忠实原版 IndexedComponent
    const vm = rankView(resp, scope, FAKE_SELF_PROFILE, RANK_NAMES);
    this.rows = vm.rows;
    this.lst_rank.numItems = this.rows.length; // 触发虚拟渲染 → itemRenderer → renderInto
    this.renderInto(this.jb_playerRank, vm.self); // 固定“我的名次”行
  }

  private switchScope(scope: RankScopeValue): void {
    if (this.scope !== scope) { this.apply(FAKE_RANK_RESP, scope); }
  }

  /** 总榜/省榜 Tab 换皮:选中的 Tab 用 countryBtn(金),未选用 provinceBtn(灰);两颗按当前榜互换,忠实原版。 */
  private setTabSkin(): void {
    const c = this.getChild<GLoader>("btn_country");
    const p = this.getChild<GLoader>("btn_province");
    if (c) { c.url = this.scope === RankScope.Country ? RankView.TAB_SEL : RankView.TAB_UNSEL; }
    if (p) { p.url = this.scope === RankScope.Province ? RankView.TAB_SEL : RankView.TAB_UNSEL; }
  }

  private static readonly MEDAL_RES = ["md0", "md1", "md2", "md3"]; // medal 0..3 → 金/银/铜/普通(rankImg0-3)
  private static readonly STAR_LIT = "ui://f5rank00sta1"; // 点亮小星
  private static readonly STAR_DIM = "ui://f5rank00sta0"; // 熄灭小星
  private static readonly ROW_BG = ["img_bg0", "img_bg1", "img_bg2", "img_bg"]; // rowSkin 0/1/2/3 → 金/银/铜/通用
  private static readonly ROW_BG_ALL = ["img_bg", "img_bg0", "img_bg1", "img_bg2", "img_bgSelf"];
  private static readonly TAB_SEL = "ui://f5rank00tabC"; // Tab 选中态皮(金 countryBtn)
  private static readonly TAB_UNSEL = "ui://f5rank00tabP"; // Tab 未选态皮(灰 provinceBtn)

  /** 把一行视图模型绑到 RankItem 的命名元素(文本 + 榜单专属美术,忠实原版换皮逻辑)。美术均从原版反编译图集抽入本包,
   *  此处只按 presenter 数据设 loader.url / visible(代码驱动,无控制器)。头像本体原版运行时动态载、暂缺→ld_avatar 留空。 */
  private renderInto(item: GComponent, r: RankRowView | undefined): void {
    if (!item || !r) { return; }
    const setTxt = (name: string, s: string): void => {
      const t = item.getChild(name) as GTextField | null;
      if (t) { t.text = s; }
    };
    const setVisible = (name: string, v: boolean): void => {
      const o = item.getChild(name);
      if (o) { o.visible = v; }
    };
    setTxt("txt_rankNum", r.rankText);
    setTxt("txt_name", r.name);
    setTxt("txt_province", r.province);
    setTxt("txt_rankTitle", r.rankTitle);
    setTxt("txt_level", String(r.level));

    // 行底皮(5 张叠放,只显一张):名次 1/2/3 → 金/银/铜(rankItem0/1/2),其余/未上榜 → 通用(rankItem3);
    // 「我的名次」固定行(isSelf) → 专属皮(rankItemSelf)。忠实原版 oK:c && a.skin=rankItem.png。
    const bgActive = r.isSelf ? "img_bgSelf" : (RankView.ROW_BG[r.rowSkin] ?? "img_bg");
    for (const n of RankView.ROW_BG_ALL) { setVisible(n, n === bgActive); }

    // 奖牌:名次 1/2/3 → 金/银/铜,4+ → 普通;未上榜(medal<0)不显。
    const medal = item.getChild("ld_medal") as GLoader | null;
    if (medal) { medal.url = r.medal < 0 ? "" : "ui://f5rank00" + RankView.MEDAL_RES[r.medal]; }

    // 星级:非皇帝 → 5 小星按段内级 level 点亮(其余熄灭);皇帝 → 藏小星,显大星 + 数字级(txt_level)。
    for (let i = 0; i < 5; i++) {
      const star = item.getChild("ld_star" + i) as GLoader | null;
      if (star) { star.url = i < r.level ? RankView.STAR_LIT : RankView.STAR_DIM; star.visible = !r.isEmperor; }
    }
    setVisible("ld_bigStar", r.isEmperor);
    setVisible("txt_level", r.isEmperor);
  }

  private close(): void {
    FguiView.setInputEnabled(false);
    this.dispose();
  }
}
