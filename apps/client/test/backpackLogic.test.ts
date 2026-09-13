import assert from "node:assert/strict";
import test from "node:test";
import { BackpackLogic } from "../src/logic/page/BackpackLogic";

test("Backpack Checkpoint resolves stable control names to business actions", () => {
    const logic = new BackpackLogic();
    const events = logic.runCheckpoint([
        { type: "press", name: "ROLE::layer-57" },
        { type: "press", name: "ROLE::layer-2" },
        { type: "back" },
    ]);
    assert.deepEqual(events, [
        { id: "layer-57", action: "tab" },
        { id: "layer-2", action: "primary" },
        { id: "layer-27", action: "back" },
    ]);
});

test("Backpack Checkpoint fails closed for an unbound control", () => {
    assert.throws(
        () => new BackpackLogic().runCheckpoint([{ type: "press", name: "ROLE::unknown" }]),
        /not bound/,
    );
});
