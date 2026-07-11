// 排行榜呈现逻辑·纯层单测（忠实原版 oK/lK/Fu/Uu）。
// 运行: npm run test:fgui
import assert from "node:assert";
import { test } from "node:test";
import { rankView, clampAvatarId, type RankSelfProfile } from "../assets/script/game/ui/rankRows";
import { RankScope, RANK_UNLISTED, type RankListResponse } from "../assets/script/shared/protocol/rank";

const RANK_NAMES: readonly string[] = Array.from({ length: 54 }, (_, i) => (i >= 50 ? "皇帝" : `段${i}`));
const SELF: RankSelfProfile = { userId: "me", nickname: "本尊", avatarId: 3, province: "蜀", curStar: 6 };
const RESP: RankListResponse = {
  selfRanking: 2,
  rankList: [
    { userId: "a", ranking: 1, star: 251, nick: "甲", avatarId: 5, province: "魏" },
    { userId: "me", ranking: 2, star: 6, nick: "服务器旧名", avatarId: 99, province: "吴" },
    { userId: "c", ranking: 4, star: 5, nick: "", avatarId: 0, province: "" },
  ],
};

test("总榜：名次→奖牌/底图、皇帝、各行自己的省份", () => {
  const { rows } = rankView(RESP, RankScope.Country, SELF, RANK_NAMES);
  assert.strictEqual(rows[0].rankText, "1");
  assert.strictEqual(rows[0].medal, 0);
  assert.strictEqual(rows[0].rowSkin, 0);
  assert.strictEqual(rows[0].isEmperor, true);
  assert.strictEqual(rows[0].rankTitle, "皇帝");
  assert.strictEqual(rows[0].province, "魏");
  assert.strictEqual(rows[2].medal, 3);
  assert.strictEqual(rows[2].isEmperor, false);
  assert.strictEqual(rows[2].name, "无名");
  assert.strictEqual(rows[2].province, "未知");
  assert.strictEqual(rows[2].avatarId, 1);
});

test("总榜：列表里本人行用本地档覆盖（Fu）", () => {
  const { rows } = rankView(RESP, RankScope.Country, SELF, RANK_NAMES);
  assert.strictEqual(rows[1].isMe, true);
  assert.strictEqual(rows[1].name, "本尊");
  assert.strictEqual(rows[1].avatarId, 3);
  assert.strictEqual(rows[1].province, "蜀");
  assert.strictEqual(rows[1].medal, 1);
});

test("省榜 quirk：每行省份都用本地玩家省份", () => {
  const { rows } = rankView(RESP, RankScope.Province, SELF, RANK_NAMES);
  assert.deepStrictEqual(rows.map((r) => r.province), ["蜀", "蜀", "蜀"]);
});

test("我的名次固定行：名次取 selfRanking，其余本地档", () => {
  const { self } = rankView(RESP, RankScope.Country, SELF, RANK_NAMES);
  assert.strictEqual(self.isSelf, true);
  assert.strictEqual(self.ranking, 2);
  assert.strictEqual(self.name, "本尊");
  assert.strictEqual(self.rankTitle, "段1");
});

test("未上榜：selfRanking=-1 → “未上榜”、无牌", () => {
  const resp: RankListResponse = { selfRanking: RANK_UNLISTED, rankList: [] };
  const { rows, self } = rankView(resp, RankScope.Country, SELF, RANK_NAMES);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(self.rankText, "未上榜");
  assert.strictEqual(self.medal, -1);
});

test("clampAvatarId：越界/默认/非整 → 1", () => {
  assert.strictEqual(clampAvatarId(0), 1);
  assert.strictEqual(clampAvatarId(17), 1);
  assert.strictEqual(clampAvatarId(1.5), 1);
  assert.strictEqual(clampAvatarId(8), 8);
});
