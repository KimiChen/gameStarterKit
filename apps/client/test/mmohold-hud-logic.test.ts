import assert from "node:assert/strict";
import { test } from "node:test";
import type { IMmoScriptStateSnapshot } from "../src/kits/mmo/api/orchestration/index";
import { holdOwnerLabel, MmoHoldHudLogic } from "../src/plugins/mmohold/logic/MmoHoldHudLogic";

test("hold HUD 订阅一次、只收本包，实时比分与休战倒计时，卸载解绑", () => {
    let listener: (snapshot: IMmoScriptStateSnapshot) => void = () => {};
    let subscriptions = 0, disposed = 0, changes = 0;
    const logic = new MmoHoldHudLogic((packId, next) => {
        assert.equal(packId, "holdRidge"); subscriptions++; listener = next;
        next({ packId, rev: null, state: {}, connected: true });
        return () => { disposed++; };
    });
    logic.onChanged = () => { changes++; };
    logic.mount(); logic.mount();
    assert.equal(subscriptions, 1);
    assert.match(logic.headline(), /同步/);
    listener({ packId: "demoVale", rev: 1, connected: true, state: { "score:dawn": 99 } });
    assert.equal(logic.state().dawn, 0);
    listener({ packId: "holdRidge", rev: 2, connected: true, state: { "score:dawn": 42, "score:dusk": 18, "owner:pointA": "dawn", "owner:pointB": "dusk", phase: "active", round: 3 } });
    assert.deepEqual([logic.state().dawn, logic.state().dusk, logic.state().pointA, logic.state().pointB], [42, 18, "dawn", "dusk"]);
    assert.match(logic.headline(), /第 3 轮/);
    listener({ packId: "holdRidge", rev: 3, connected: true, state: { "score:dusk": 100, phase: "closed", winner: "dusk", reopenIn: 59 } });
    assert.equal(logic.headline(), "暮光获胜 · 59 秒后重开");
    assert.equal(changes, 3);
    logic.unmount(); logic.unmount();
    assert.equal(disposed, 1);
    assert.equal(logic.state().ready, false);
});

test("hold HUD 断线清除比分、等待新分线快照，坏状态不显示NaN或假归属", () => {
    let listener: (snapshot: IMmoScriptStateSnapshot) => void = () => {};
    const logic = new MmoHoldHudLogic((_packId, next) => { listener = next; return () => {}; });
    logic.mount();
    listener({ packId: "holdRidge", rev: 9, connected: false, state: { "score:dawn": 90, "owner:pointA": "dawn" } });
    assert.equal(logic.state().dawn, 0); assert.equal(logic.state().pointA, "neutral");
    assert.match(logic.headline(), /连接中断/);
    listener({ packId: "holdRidge", rev: null, connected: true, state: { "score:dusk": 60 } });
    assert.equal(logic.state().dusk, 0);
    listener({ packId: "holdRidge", rev: 0, connected: true, state: { "score:dawn": -2, "score:dusk": 101, "owner:pointA": "outsider", reopenIn: 999, round: 1.5 } });
    assert.equal(logic.state().ready, true);
    assert.deepEqual([logic.state().dawn, logic.state().dusk, logic.state().pointA, logic.state().reopenIn, logic.state().round], [0, 100, "neutral", 60, 1]);
    assert.equal(holdOwnerLabel("neutral"), "中立");
});
