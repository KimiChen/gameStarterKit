import assert from "node:assert/strict";
import { test } from "node:test";
import { currentZoneId, zoneCtx } from "../src/core/infra/keys";
import { ZoneSingleFlight } from "../src/core/archive/thaw";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("ensureLive single-flight isolates concurrent same-uid work by zone", async () => {
  const flights = new ZoneSingleFlight<void>();
  const first = deferred();
  const second = deferred();
  const starts: Array<[number, string]> = [];

  const run = (ambient: number, sId: number, gate: Promise<void>): Promise<void> =>
    zoneCtx.run({ sId: ambient }, () => flights.run("same-user", sId, async () => {
      starts.push([currentZoneId(), `${sId}`]);
      await gate;
    }));

  const zoneOne = run(99, 1, first.promise);
  const zoneTwo = run(88, 2, second.promise);
  const zoneOneFollower = run(77, 1, first.promise);

  assert.strictEqual(zoneOneFollower, zoneOne, "同一 (sId, uid) 必须合流");
  assert.notStrictEqual(zoneTwo, zoneOne, "不同 sId 即使 uid 相同也不得合流");
  await Promise.resolve();
  assert.deepEqual(starts, [[1, "1"], [2, "2"]], "每个 flight 必须在自己的显式 zone 上下文执行");

  second.resolve();
  first.resolve();
  await Promise.all([zoneOne, zoneTwo, zoneOneFollower]);
  assert.equal(flights.size, 0, "settle 后应释放单飞占位");
});
