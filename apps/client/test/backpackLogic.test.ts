import assert from "node:assert/strict";
import test from "node:test";
import { BackpackLogic } from "../src/logic/page/BackpackLogic";

test("Backpack Checkpoint resolves stable control names to business actions", () => {
    const logic = new BackpackLogic();
    const events = logic.runCheckpoint([
        { type: "press", name: "ROLE::tab-resource" },
        { type: "press", name: "ROLE::item-resource-diamond-1" },
        { type: "press", name: "ROLE::resource-1" },
        { type: "back" },
    ]);
    assert.deepEqual(events, [
        { id: "tab-resource", action: "tab" },
        { id: "item-resource-diamond-1", action: "select" },
        { id: "resource-1", action: "primary" },
        { id: "back", action: "back" },
    ]);
});

test("Backpack Checkpoint fails closed for an unbound control", () => {
    assert.throws(
        () => new BackpackLogic().runCheckpoint([{ type: "press", name: "ROLE::unknown" }]),
        /not bound/,
    );
});
