import assert from "node:assert/strict";
import { test } from "node:test";
import { optionalStoredInt, storedFinite, storedInt } from "../src/core/infra/numbers";

test("storedInt accepts finite safe integer storage values and rejects coercion", () => {
  assert.equal(storedInt("42", "n", { min: 0, max: 100 }), 42);
  assert.equal(storedInt(0, "n", { min: 0 }), 0);
  for (const bad of ["", "42junk", "1.0", "1e2", "NaN", "Infinity", "-1", "9007199254740992", null, undefined]) {
    assert.throws(() => storedInt(bad, "n", { min: 0 }), /n/);
  }
});

test("storedFinite rejects non-finite and out-of-range values", () => {
  assert.equal(storedFinite("0.5", "rate", { min: 0, max: 1 }), 0.5);
  for (const bad of ["1.2junk", "NaN", "Infinity", "-0.1", "2", null, undefined]) {
    assert.throws(() => storedFinite(bad, "rate", { min: 0, max: 1 }), /rate/);
  }
});

test("optionalStoredInt only defaults missing fields; malformed present data fails closed", () => {
  assert.equal(optionalStoredInt(null, 7, "n", { min: 0 }), 7);
  assert.equal(optionalStoredInt(undefined, 7, "n", { min: 0 }), 7);
  assert.throws(() => optionalStoredInt("bad", 7, "n", { min: 0 }), /n/);
});
