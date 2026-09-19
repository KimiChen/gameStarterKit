/**
 * MMO MF5a-B2 每会话出站队列（docs/MMO.md §4.3 / §5.4 MF5a；rooms/core/OutboundQueue.ts）：
 *  - 可合并类（coalesceKey）：同 token 同键值原位覆盖、保持首次入队顺序；不同键各自入队；
 *  - 不可丢类（coalesceKey null）：永不合并；
 *  - 超限：丢全部可合并类、留全部不可丢类、打重同步标记（对不可丢类上界是软的）；
 *  - 只收 perSession token；合并键取值必须 string | number；上限只许收紧（§11.2）。
 * 变异验证：删上界判定 → 「超限重同步」转红；overflow 不过滤 durable → 「回执不丢」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineS2C, OBSERVER_SYNC_LIMITS } from "@game/shared";
import { OutboundQueue } from "../src/rooms/core/OutboundQueue";

const identity = (input: unknown): Record<string, unknown> => input as Record<string, unknown>;
const Update = defineS2C("s2c.fx.update", identity, { perSession: true, coalesceKey: "id" });
const Receipt = defineS2C("s2c.fx.receipt", identity, { perSession: true });
const Plain = defineS2C("s2c.fx.plain", identity);

test("可合并类原位覆盖、保持顺序；不可丢类永不合并；drain 取走即清空", () => {
    const queue = new OutboundQueue();
    assert.equal(queue.push("s1", Update, { id: "a", x: 1 }), "queued");
    assert.equal(queue.push("s1", Update, { id: "b", x: 1 }), "queued");
    assert.equal(queue.push("s1", Receipt, { n: 1 }), "queued");
    assert.equal(queue.push("s1", Update, { id: "a", x: 2 }), "coalesced");
    assert.equal(queue.push("s1", Receipt, { n: 1 }), "queued", "不可丢类 ⛔ 不合并（即使 payload 相同）");
    assert.equal(queue.size("s1"), 4);
    assert.deepEqual(queue.drain("s1").map((message) => [message.token.type, message.payload]), [
        ["s2c.fx.update", { id: "a", x: 2 }],
        ["s2c.fx.update", { id: "b", x: 1 }],
        ["s2c.fx.receipt", { n: 1 }],
        ["s2c.fx.receipt", { n: 1 }],
    ], "a 在原位被覆盖成 x:2");
    assert.deepEqual(queue.drain("s1"), []);
    assert.equal(queue.push("s1", Update, { id: "a", x: 3 }), "queued", "drain 后合并索引清空，同键重新入队");
    assert.equal(queue.push("s1", Update, { id: 7, x: 3 }), "queued", "数字键合法");
    assert.equal(queue.push("s1", Update, { id: 7, x: 4 }), "coalesced");
});

test("超限：丢全部可合并类、留全部不可丢类、打重同步标记；清标记后照常入队", () => {
    const queue = new OutboundQueue(4);
    queue.push("s1", Update, { id: "a" });
    queue.push("s1", Update, { id: "b" });
    queue.push("s1", Update, { id: "c" });
    queue.push("s1", Receipt, { n: 1 });
    assert.equal(queue.needsResync("s1"), false);
    assert.equal(queue.push("s1", Receipt, { n: 2 }), "overflow");
    assert.equal(queue.needsResync("s1"), true);
    assert.equal(queue.push("s1", Update, { id: "z" }), "overflow", "标记未清：再来的可合并类照丢");
    assert.equal(queue.push("s1", Receipt, { n: 3 }), "queued", "标记未清：不可丢类照收");
    assert.deepEqual(queue.drain("s1").map((message) => message.payload), [{ n: 1 }, { n: 2 }, { n: 3 }], "回执不丢、位置类被丢");
    queue.push("s1", Receipt, { n: 1 });
    queue.push("s1", Receipt, { n: 2 });
    assert.deepEqual(queue.drain("s1").map((message) => message.payload), [{ n: 1 }, { n: 2 }], "回执不丢、位置类被丢");
    assert.equal(queue.needsResync("s1"), true, "drain 不清标记（要等 baseline 重发完）");
    queue.clearResync("s1");
    assert.equal(queue.needsResync("s1"), false);
    assert.equal(queue.push("s1", Update, { id: "a" }), "queued");
    assert.equal(queue.push("s1", Update, { id: "a" }), "coalesced", "超限后合并索引已重建");
    assert.equal(queue.needsResync("s2"), false, "别的会话不受影响");

    // 不可丢类自己就超限：照留（软上界）且标记重同步
    const tight = new OutboundQueue(2);
    assert.equal(tight.push("s1", Receipt, { n: 1 }), "queued");
    assert.equal(tight.push("s1", Receipt, { n: 2 }), "queued");
    assert.equal(tight.push("s1", Receipt, { n: 3 }), "overflow");
    assert.equal(tight.size("s1"), 3);
    assert.equal(tight.needsResync("s1"), true);
});

test("只收 perSession token；合并键取值必须 string | number；上限只许收紧；remove 清干净", () => {
    const queue = new OutboundQueue();
    assert.throws(() => queue.push("s1", Plain, { id: "a" }), /只收 perSession S2C token/u);
    assert.throws(() => queue.push("s1", Update, "not-an-object" as never), /payload 必须是对象/u);
    assert.throws(() => queue.push("s1", Update, { id: { nested: true } }), /必须是 string \| number 合并键/u);
    assert.throws(() => queue.push("s1", Update, { x: 1 }), /必须是 string \| number 合并键/u);
    assert.equal(queue.size("s1"), 0, "被拒的消息不入队");
    assert.throws(() => new OutboundQueue(0), RangeError);
    assert.throws(() => new OutboundQueue(OBSERVER_SYNC_LIMITS.outboundQueueMaxMessages + 1), RangeError);
    queue.push("s1", Receipt, { n: 1 });
    queue.remove("s1");
    assert.equal(queue.size("s1"), 0);
    assert.equal(queue.needsResync("s1"), false);
});
