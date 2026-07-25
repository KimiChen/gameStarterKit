/**
 * 镜像同步熔断判据回归（scripts/lib/sync-breaker.mjs）。
 *
 * 这段判据错过两次、都是**判据本身**错：
 *  ① 只在 --watch 生效 ⇒ 手动执行可无阻拦清空镜像（已修）；
 *  ② 修完①后写成 `>=MIN && >=ratio`，与注释「≥MIN **或** ≥ratio」相反 ⇒ 小目录删掉 39% 够不到
 *     固定数量 20，熔断不触发，镜像连同**入库的 .meta** 一起被删 ⇒ Creator 重开重铸 uuid。
 *  ⚠ 当初的人工实证之所以没抓到②：一次移走了 21 个文件，两个阈值都过了，**没探到边界**。
 * 故本文件是表驱动的**边界**用例，⛔ 不再靠人眼读注释。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BREAKER_MIN, BREAKER_RATIO, breakerTripped, forceRequested,
} from "../../../scripts/lib/sync-breaker.mjs";

test("熔断判据：两闸取「或」——任一达标即熔断（⛔ 取「且」即红）", () => {
    // ① 曾经漏网的那个洞：apps/shared/src 现有 23 个源文件，删 9 个 = 39%
    //    → 超比例闸(ceil(23*0.3)=7)但够不到固定闸(20) ⇒ 取「且」时不熔断，镜像被清
    assert.equal(breakerTripped({ removed: 9, srcCount: 23 }), true,
        "小目录删 39% 必须熔断（取「且」会漏掉，正是丢 .meta 的那条路径）");

    // ② 反向：大目录里删 20 个但只占 3% → 超固定闸、不超比例闸，同样要熔断
    assert.equal(breakerTripped({ removed: BREAKER_MIN, srcCount: 700 }), true,
        "大目录达到固定闸必须熔断（哪怕比例很低）");

    // ③ 两闸都不到 → 放行（正常增删不该被拦）
    assert.equal(breakerTripped({ removed: 1, srcCount: 78 }), false, "删 1/78 是日常改动，⛔ 不该拦");
    assert.equal(breakerTripped({ removed: 0, srcCount: 78 }), false, "无删除永不熔断");

    // ④ 比例闸边界：ceil(23*0.3)=7，6 放行 / 7 熔断
    assert.equal(Math.ceil(23 * BREAKER_RATIO), 7, "比例闸取 ceil（基线，改动即需复核本用例）");
    assert.equal(breakerTripped({ removed: 6, srcCount: 23 }), false, "比例闸下沿：6/23 放行");
    assert.equal(breakerTripped({ removed: 7, srcCount: 23 }), true, "比例闸上沿：7/23 熔断");

    // ⑤ 固定闸边界（大目录，比例闸够不到时由它兜底）
    assert.equal(breakerTripped({ removed: BREAKER_MIN - 1, srcCount: 700 }), false, "固定闸下沿放行");

    // ⑥ 源目录被清空（srcCount=0）：比例闸算出 0，任何删除都熔断
    assert.equal(breakerTripped({ removed: 1, srcCount: 0 }), true, "源全没了必须熔断（⛔ 不能顺手清空 DEST）");
});

test("逃生口：必须认 SYNC_FORCE env——`-- --force` 到不了复合命令里的第一个脚本", () => {
    const orig = process.env.SYNC_FORCE;
    try {
        delete process.env.SYNC_FORCE;
        assert.equal(forceRequested([]), false, "默认不放行");
        assert.equal(forceRequested(["node", "x.mjs", "--force"]), true, "直接跑脚本时 --force 有效");

        // ⚠ 关键：npm run sync:shared 是 `node sync-shared.mjs && node sync-client.mjs`，
        // npm 把 `-- --force` 追加到整串**末尾** ⇒ sync-shared 的 argv 里根本没有 --force。
        // 此时只有环境变量能放行；若哪天把 env 分支删了，本用例即红。
        assert.equal(forceRequested(["node", "sync-shared.mjs"]), false, "链条首个脚本拿不到 --force");
        process.env.SYNC_FORCE = "1";
        assert.equal(forceRequested(["node", "sync-shared.mjs"]), true, "SYNC_FORCE=1 对链条里每个脚本都生效");
        process.env.SYNC_FORCE = "0";
        assert.equal(forceRequested(["node", "sync-shared.mjs"]), false, "只认 \"1\"，⛔ 不做真值宽松判定");
    } finally {
        if (orig === undefined) { delete process.env.SYNC_FORCE; } else { process.env.SYNC_FORCE = orig; }
    }
});
