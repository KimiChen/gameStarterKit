/**
 * world-bench 长跑判定纯函数（MMO MK3-B3；⛔ 起服务 / 连库）：slopePerHour 最小二乘、judgeSoak（预热跳过、容差、检查点表有界、掉线 / 错误、样本不足）。
 * 变异验证：judgeSoak 不查 RSS 斜率 → 「RSS 增长 ⇒ growing」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SOAK_TOLERANCE, judgeSoak, slopePerHour, type SoakSample } from "../tools/world-bench/run";

const sample = (atSec: number, over: Partial<SoakSample> = {}): SoakSample => ({
    atSec, tick: { count: 100, mean: 5.5, p50: 5, p95: 8, p99: 10, max: 12 }, outboundP50BytesPerSessionPerSec: 5000, eventLoopP99Ms: 12, rssMB: 150, heapUsedMB: 60, externalMB: 5,
    resources: { TCPSocketWrap: 40, Timeout: 20 }, resourcesTotal: 60, botsOpen: 20, errors: 0,
    world: { pendingEvents: 0, instanceCheckpointRows: 8, instances: 1, characterCheckpointRows: 160, characters: 20 }, ...over,
});

test("slopePerHour：两点斜率 / 常数 0 / 单点 0", () => {
    assert.equal(slopePerHour([{ atSec: 0, value: 100 }, { atSec: 3600, value: 130 }]), 30);
    assert.equal(slopePerHour([{ atSec: 0, value: 7 }, { atSec: 1800, value: 7 }, { atSec: 3600, value: 7 }]), 0);
    assert.equal(slopePerHour([{ atSec: 0, value: 7 }]), 0);
});

test("judgeSoak：平稳 ⇒ stable；样本 ≥ 4 跳过首个预热；RSS / heap / 资源 / 积压 / tick 增长与掉线 / 错误 / 检查点表越界各自点名；< 3 样本 ⇒ insufficient", () => {
    const flat = [0, 30, 60, 90, 120, 150].map((at) => sample(at));
    assert.deepEqual([judgeSoak(flat, 30).verdict, judgeSoak(flat, 30).reasons, judgeSoak(flat, 30).checkpointRowsBounded], ["stable", [], true]);
    const warmup = [sample(0, { rssMB: 400 }), ...[30, 60, 90, 120].map((at) => sample(at))];
    assert.equal(judgeSoak(warmup, 30).verdict, "stable", "首个样本是预热，不算");
    const rss = [0, 30, 60, 90, 120].map((at, i) => sample(at, { rssMB: 150 + i * 10 })); // +10 MB / 30 s = 1200 MB/h
    const rssVerdict = judgeSoak(rss, 30);
    assert.deepEqual([rssVerdict.verdict, rssVerdict.reasons.length, rssVerdict.reasons[0]?.startsWith("RSS +")], ["growing", 1, true]);
    const resources = [0, 30, 60, 90, 120].map((at, i) => sample(at, { resourcesTotal: 60 + i }));
    assert.ok(judgeSoak(resources, 30).reasons.some((reason) => reason.startsWith("活动资源")));
    const pending = [0, 30, 60, 90, 120].map((at, i) => sample(at, { world: { ...sample(0).world!, pendingEvents: i * 5 } }));
    assert.ok(judgeSoak(pending, 30).reasons.some((reason) => reason.startsWith("世界事件积压")));
    const dropped = [...flat.slice(0, 5), sample(150, { botsOpen: 18, errors: 2 })];
    assert.deepEqual(judgeSoak(dropped, 30).reasons, ["在线机器人 20 → 18（连接掉了）", "机器人错误 0 → 2"]);
    const unbounded = [...flat.slice(0, 5), sample(150, { world: { pendingEvents: 0, instanceCheckpointRows: SOAK_TOLERANCE.instanceKeep + 1, instances: 1, characterCheckpointRows: 10, characters: 20 } })];
    assert.deepEqual([judgeSoak(unbounded, 30).checkpointRowsBounded, judgeSoak(unbounded, 30).reasons[0]?.startsWith("检查点表越界")], [false, true]);
    assert.equal(judgeSoak([sample(0), sample(30)], 30).verdict, "insufficient");
    assert.equal(judgeSoak([sample(0, { world: undefined }), sample(30, { world: undefined }), sample(60, { world: undefined })], 30).checkpointRowsBounded, null, "非世界剧本无探针");
});
