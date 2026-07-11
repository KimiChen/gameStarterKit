/**
 * 排行榜**假数据**（本次实验用，零 cc）。等真 `/rank/list` 端点上了，换成真 fetch 即可，
 * presenter/RankView 不动（同一份 RankListResponse 契约 seam）。
 */
import type { RankListResponse } from "../../shared/protocol";
import type { RankSelfProfile } from "./rankRows";

/** 军衔名（rank 0..53）。实验用占位；后续接真 `resources/config/rank.json` 的军衔表。 */
export const RANK_NAMES: readonly string[] = Array.from({ length: 54 }, (_, r) => {
  if (r >= 50) { return "皇帝"; }
  const tiers = ["列兵", "上等兵", "下士", "中士", "上士", "少尉", "中尉", "上尉", "大尉",
    "少校", "中校", "上校", "大校", "少将", "中将", "上将", "大将"];
  return `${tiers[Math.floor(r / 3)] ?? "元帅"}·${(r % 3) + 1}`;
});

/** 本地玩家档（假）。curStar 42 → 段8 左右；userId=me 对应榜里第 6 名那行（会被本地覆盖）。 */
export const FAKE_SELF_PROFILE: RankSelfProfile = {
  userId: "me", nickname: "我（本地）", avatarId: 3, province: "蜀", curStar: 42,
};

/** 假榜（已按 star 降序）：皇帝居首(金)、前三奖牌、含本人行(服务端旧名将被本地覆盖)、空字段兜底。 */
export const FAKE_RANK_RESP: RankListResponse = {
  selfRanking: 6,
  rankList: [
    { userId: "u1", ranking: 1, star: 260, nick: "卧龙", avatarId: 1, province: "荆州" },
    { userId: "u2", ranking: 2, star: 180, nick: "凤雏", avatarId: 2, province: "益州" },
    { userId: "u3", ranking: 3, star: 120, nick: "云长", avatarId: 5, province: "荆州" },
    { userId: "u4", ranking: 4, star: 90, nick: "翼德", avatarId: 7, province: "幽州" },
    { userId: "u5", ranking: 5, star: 60, nick: "子龙", avatarId: 9, province: "常山" },
    { userId: "me", ranking: 6, star: 42, nick: "服务器旧名", avatarId: 99, province: "魏" },
    { userId: "u7", ranking: 7, star: 30, nick: "孟起", avatarId: 4, province: "凉州" },
    { userId: "u8", ranking: 8, star: 15, nick: "文远", avatarId: 6, province: "雁门" },
    { userId: "u9", ranking: 9, star: 5, nick: "", avatarId: 0, province: "" },
  ],
};
