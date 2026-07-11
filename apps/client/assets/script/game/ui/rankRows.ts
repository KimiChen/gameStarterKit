/**
 * 排行榜的**纯呈现逻辑**（零 cc 依赖）。三层 UI 模型的“行为/数据”层：把 `/rank/list`（或假数据）的
 * `{ rankList, selfRanking }` 映射成“每行视图模型”（名次/军衔/星级/头像/省份/是否本人/奖牌）。
 *
 * 忠实原版 `IndexedComponent.oK/lK` + `PlayerProfileData.zu/Fu/Uu`：
 * - 名次 -1 → “未上榜”、无奖牌；名次 1/2/3 → 金/银/铜 + 对应行底图，其余 → 普通。
 * - 军衔/星级由 `decodeRank(star)` 出；段 ≥50（curStar>250）= 皇帝 → 大星+数字级，否则 5 星。
 * - 省份：**总榜**各行显示自己的省；**省榜**所有行显示本地玩家省（原版 quirk）。
 * - 列表里 `userId===本人` 的行、以及固定“我的名次”行，用**本地存档**覆盖昵称/头像/省份（Fu/Uu）。
 *
 * 与具体 UI 无关、可无头单测；FairyGUI `RankView` 消费这份数据。见 designer-ui-workflow.md。
 */
import type { RankEntry, RankListResponse, RankScopeValue } from "../../shared/protocol";
import { RankScope, RANK_UNLISTED, decodeRank } from "../../shared/protocol";

/** 本地玩家档（覆盖“本人行”+ 省榜省份替换；`PlayerSave` 子集）。 */
export interface RankSelfProfile {
  userId: string;
  nickname: string;
  avatarId: number;
  province: string;
  curStar: number;
}

/** 一行的视图模型（渲染层照此摆 `RankItem` 的命名元素）。 */
export interface RankRowView {
  ranking: number;      // -1 = 未上榜
  rankText: string;     // "未上榜" | String(ranking)
  medal: number;        // -1 无(未上榜) | 0 金 / 1 银 / 2 铜(名次 1/2/3) | 3 普通
  rowSkin: number;      // 0/1/2(名次 1/2/3) | 3(其余/未上榜)
  name: string;         // 昵称（空→“无名”）
  province: string;     // 省份（总榜=各行自己；省榜=本地玩家）
  rankTitle: string;    // 军衔（rankNames[decodeRank(star).rank]）
  level: number;        // 段内级
  isEmperor: boolean;   // 段 ≥50 → 大星+数字
  avatarId: number;     // 1..16
  isMe: boolean;        // userId===本人
  isSelf: boolean;      // 是否“我的名次”固定行
}

const DEFAULT_NAME = "无名";
const DEFAULT_PROVINCE = "未知";
const EMPEROR_MIN_RANK = 50;

/** 头像下标钳到 1..16（越界/默认 -1 → 1；忠实原版 av→16 内置头像、未知→avatar1）。 */
export function clampAvatarId(avatarId: number): number {
  return Number.isInteger(avatarId) && avatarId >= 1 && avatarId <= 16 ? avatarId : 1;
}

function medalOf(ranking: number): number {
  if (ranking === RANK_UNLISTED) { return -1; }
  if (ranking === 1) { return 0; }
  if (ranking === 2) { return 1; }
  if (ranking === 3) { return 2; }
  return 3;
}

function rowSkinOf(ranking: number): number {
  if (ranking === 1) { return 0; }
  if (ranking === 2) { return 1; }
  if (ranking === 3) { return 2; }
  return 3;
}

function toRowView(
  e: RankEntry, isSelf: boolean, self: RankSelfProfile,
  scope: RankScopeValue, rankNames: readonly string[],
): RankRowView {
  const isMe = e.userId === self.userId;
  const useLocal = isSelf || isMe; // 原版 Fu：本人行用本地档覆盖昵称/头像/省份
  const { rank, level } = decodeRank(e.star);
  const province = scope === RankScope.Province
    ? (self.province || DEFAULT_PROVINCE)
    : useLocal
      ? (self.province || DEFAULT_PROVINCE)
      : (e.province || DEFAULT_PROVINCE);
  return {
    ranking: e.ranking,
    rankText: e.ranking === RANK_UNLISTED ? "未上榜" : String(e.ranking),
    medal: medalOf(e.ranking),
    rowSkin: rowSkinOf(e.ranking),
    name: (useLocal ? self.nickname : e.nick) || DEFAULT_NAME,
    province,
    rankTitle: rankNames[rank] ?? `段位${rank}`,
    level,
    isEmperor: rank >= EMPEROR_MIN_RANK,
    avatarId: clampAvatarId(useLocal ? self.avatarId : e.avatarId),
    isMe,
    isSelf,
  };
}

/**
 * `/rank/list` 响应 → `{ 列表行, 我的名次固定行 }`。忠实原版：
 * - 列表按服务端顺序（已 star 降序）；`userId===本人` 的行用本地档覆盖（Fu）。
 * - “我的名次”固定行（Uu）：名次取 `selfRanking`，昵称/头像/省份/星用本地档；未上榜→“未上榜”。
 */
export function rankView(
  resp: RankListResponse, scope: RankScopeValue, self: RankSelfProfile, rankNames: readonly string[],
): { rows: RankRowView[]; self: RankRowView } {
  const rows = resp.rankList.map((e) => toRowView(e, false, self, scope, rankNames));
  const selfEntry: RankEntry = {
    userId: self.userId, ranking: resp.selfRanking, star: self.curStar,
    nick: self.nickname, avatarId: self.avatarId, province: self.province,
  };
  return { rows, self: toRowView(selfEntry, true, self, scope, rankNames) };
}
