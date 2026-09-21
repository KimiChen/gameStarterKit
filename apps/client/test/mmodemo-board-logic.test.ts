/**
 * mmodemo 可选域页面逻辑（MG1-B2，无头）：refresh 经 runtime.bossBoard（假 runtime）→ 行视图（击杀降序、同分按分线标签；标签「分线 n · …末 6 位」；
 * 运行时长 tick × TICK_MS）+ 合计 + 提示文案；失败只按 RpcError.code 翻译且保留旧数据；宿主未就绪 ⛔ 假实现（refresh false、提示未就绪）；
 * 在途闸（并发 refresh 第二次直接 false）；close 转发。
 * 变异验证：rows() 删排序 → 「击杀降序」转红；formatUptime 删 hours 分支 → 「1h 1m」转红；refresh 的 catch 里改成清空 board → 「保留旧数据」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MmoDemoBoardLogic, describeMmoDemoError, formatLineLabel, formatUptime, rowOf } from "../src/plugins/mmodemo/logic/MmoDemoBoardLogic";
import type { MmoDemoRuntime } from "../src/plugins/mmodemo/logic/mmoDemoRuntime";
import { TICK_MS } from "../src/shared/constants/game";
import type { IMmoDemoBossBoardRes } from "../src/shared/protocol/lobbyRpc/domains/mmodemo";

class FakeRpcError extends Error {
    constructor(readonly code: string) { super(code); }
}

const board: IMmoDemoBossBoardRes = {
    mapId: "demoVale", packId: "demoVale",
    lines: [
        { instanceId: "wi_aaaaaa111111", rev: 3, tick: 1200, bossKills: 1 },
        { instanceId: "wi_bbbbbb222222", rev: 0, tick: 0, bossKills: 0 },
        { instanceId: "wi_cccccc333333", rev: 9, tick: 73_200, bossKills: 4 },
        { instanceId: "wi_dddddd444444", rev: 2, tick: 40, bossKills: 1 },
    ],
    totalKills: 6,
};

function runtimeWith(bossBoard: MmoDemoRuntime["bossBoard"]) {
    const runtime = { closed: 0, bossBoard, close() { runtime.closed += 1; } };
    return runtime;
}

test("formatUptime：tick × TICK_MS → s / m s / h m；0 ⇒ 尚无检查点；formatLineLabel 末 6 位；rowOf", () => {
    assert.equal(TICK_MS, 50);
    assert.equal(formatUptime(0), "尚无检查点");
    assert.equal(formatUptime(-5), "尚无检查点");
    assert.equal(formatUptime(1), "0s");
    assert.equal(formatUptime(40), "2s");
    assert.equal(formatUptime(1200), "1m 0s");
    assert.equal(formatUptime(1230), "1m 1s");
    assert.equal(formatUptime(73_200), "1h 1m", "3660 s");
    assert.equal(formatUptime(10, 1000), "10s", "步长可注入");
    assert.equal(formatLineLabel("wi_aaaaaa111111", 0), "分线 1 · …111111");
    assert.deepEqual(rowOf(board.lines[2]!, 2), { instanceId: "wi_cccccc333333", label: "分线 3 · …333333", rev: 9, uptime: "1h 1m", bossKills: 4 });
});

test("refresh 成功：行按击杀降序、同分按分线标签；合计；提示写条数与合计；空清单提示「还没有开过分线」", async () => {
    const logic = new MmoDemoBoardLogic(runtimeWith(async () => board));
    let changes = 0;
    logic.onChanged = () => { changes += 1; };
    assert.equal(logic.isReady(), true);
    assert.equal(logic.isLoaded(), false);
    assert.equal(logic.mapId(), "demoVale");
    assert.equal(await logic.refresh(), true);
    assert.equal(changes, 2, "开始 / 结束各通知一次");
    assert.deepEqual(logic.rows().map((row) => [row.label, row.bossKills]), [["分线 3 · …333333", 4], ["分线 1 · …111111", 1], ["分线 4 · …444444", 1], ["分线 2 · …222222", 0]], "击杀降序");
    assert.equal(logic.totalKills(), 6);
    assert.deepEqual(logic.currentNotice(), { kind: "success", text: "已刷新：4 条分线，合计击杀 6" });
    const empty = new MmoDemoBoardLogic(runtimeWith(async () => ({ mapId: "demoVale", packId: "demoVale", lines: [], totalKills: 0 })));
    assert.equal(await empty.refresh(), true);
    assert.deepEqual(empty.rows(), []);
    assert.equal(empty.isLoaded(), true);
    assert.equal(empty.currentNotice().text, "demoVale 还没有开过分线");
});

test("refresh 失败：只按 code 翻译，保留旧数据；在途闸；宿主未就绪 ⇒ false + 未就绪提示；close 转发", async () => {
    let fail = false;
    let resolveSlow: ((value: IMmoDemoBossBoardRes) => void) | null = null;
    const runtime = runtimeWith(() => {
        if (fail) return Promise.reject(new FakeRpcError("TIMEOUT"));
        return new Promise<IMmoDemoBossBoardRes>((resolve) => { resolveSlow = resolve; });
    });
    const logic = new MmoDemoBoardLogic(runtime);
    const first = logic.refresh();
    assert.equal(logic.isBusy(), true);
    assert.equal(await logic.refresh(), false, "在途时第二次直接 false");
    resolveSlow!(board);
    assert.equal(await first, true);
    fail = true;
    assert.equal(await logic.refresh(), false);
    assert.deepEqual(logic.currentNotice(), { kind: "error", text: "网络不可用，稍后刷新" });
    assert.equal(logic.rows().length, 4, "保留旧数据");
    assert.equal(logic.totalKills(), 6);
    assert.equal(describeMmoDemoError(new FakeRpcError("CONN_LOST")), "网络不可用，稍后刷新");
    assert.equal(describeMmoDemoError(new FakeRpcError("RATE_LIMITED")), "读取失败（RATE_LIMITED）");
    assert.equal(describeMmoDemoError(new Error("boom")), "读取失败，请稍后重试");
    logic.close();
    assert.equal(runtime.closed, 1);
    const notReady = new MmoDemoBoardLogic(null);
    assert.equal(notReady.isReady(), false);
    assert.equal(await notReady.refresh(), false);
    assert.deepEqual(notReady.currentNotice(), { kind: "error", text: "头狼战报未就绪（plugin 未装载）" });
    notReady.close();
});
