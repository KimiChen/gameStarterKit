import test from "node:test";
import assert from "node:assert/strict";
import { ChunkStreamer, type ChunkLoad, type ChunkRect, type ChunkStreamerOptions } from "../src/logic/scene3d/chunkStreamer";

const key = (x: number, y: number) => y * 100 + x;
const unkey = (value: number) => ({ x: value % 100, y: Math.floor(value / 100) });
const rect = (minX: number, minY: number, maxX = minX, maxY = minY): ChunkRect => ({ minX, minY, maxX, maxY });
function streamer(options: Partial<ChunkStreamerOptions> = {}): ChunkStreamer {
    return new ChunkStreamer({ chunkSize: 10, mapWidth: 100, mapHeight: 100, key, unkey,
        margin: 0, retainMargin: 10, ...options });
}
function take(subject: ChunkStreamer): ChunkLoad {
    const load = subject.take();
    assert.ok(load);
    return load;
}
function drain(subject: ChunkStreamer): ChunkLoad[] {
    const loads: ChunkLoad[] = [];
    for (let load = subject.take(); load; load = subject.take()) loads.push(load);
    return loads;
}

test("ChunkStreamer: viewport deltas keep loaded chunks in the retention band without refetching them", () => {
    const subject = streamer();
    assert.deepEqual(subject.update(rect(10, 10, 29, 29)), { added: [101, 102, 201, 202], removed: [] });
    for (const load of drain(subject)) assert.equal(subject.accept(load), true);

    assert.deepEqual(subject.update(rect(30, 10, 49, 29)), { added: [103, 104, 203, 204], removed: [101, 201] });
    assert.deepEqual(subject.loadedKeys(), [102, 202]);
    assert.deepEqual(subject.update(rect(20, 10, 39, 29)), { added: [102, 202], removed: [] },
        "added describes desired membership even when a retained chunk is already loaded");
    assert.deepEqual(drain(subject).map((load) => load.key), [103, 203]);
    assert.deepEqual(subject.update(rect(90, 90, 99, 99)), { added: [909], removed: [102, 202] });
    assert.deepEqual(subject.loadedKeys(), []);
});

test("ChunkStreamer: movement within the same load rectangle preserves generation and pending work", () => {
    const subject = streamer();
    subject.update(rect(10, 10, 29, 29));
    const first = take(subject);
    const second = take(subject);
    assert.equal(subject.accept(first), true);
    assert.deepEqual(subject.update(rect(12, 13, 27, 28)), { added: [], removed: [] });
    assert.equal(subject.current(second), true);
    assert.equal(subject.accept(second), true);
    assert.deepEqual(drain(subject).map((load) => load.key), [201, 202]);
    assert.deepEqual(subject.update(rect(12, 13, 27, 28)), { added: [], removed: [] });
    assert.equal(subject.take(), null, "an unchanged viewport cannot duplicate pending work");
});

test("ChunkStreamer: retention is recomputed only when the load rectangle changes", () => {
    const subject = streamer({ retainMargin: 5 });
    subject.update(rect(9, 15));
    const old = take(subject);
    assert.equal(old.key, 100);
    assert.equal(subject.accept(old), true);
    subject.update(rect(10, 15));
    assert.deepEqual(subject.loadedKeys(), [100]);
    assert.deepEqual(subject.update(rect(15, 15)), { added: [], removed: [] });
    assert.deepEqual(subject.loadedKeys(), [100], "same chunk rectangle keeps the previous retention decision");
    assert.deepEqual(subject.update(rect(20, 15)), { added: [102], removed: [100] });
});

test("ChunkStreamer: center-out square rings use numeric key order to break equal-distance ties", () => {
    const subject = streamer();
    subject.update(rect(0, 0, 49, 49));
    assert.deepEqual(drain(subject).map((load) => load.key), [
        202,
        101, 102, 103, 201, 203, 301, 302, 303,
        0, 1, 2, 3, 4, 100, 104, 200, 204, 300, 304, 400, 401, 402, 403, 404,
    ]);
});

test("ChunkStreamer: injected encoding controls ties and decoded coordinates, including partial edge chunks", () => {
    const subject = streamer({ mapWidth: 35, mapHeight: 23,
        key: (x, y) => 1000 + x * 10 + y,
        unkey: (value) => ({ x: Math.floor((value - 1000) / 10), y: (value - 1000) % 10 }) });
    assert.deepEqual(subject.update(rect(20, 10, 34, 22)), { added: [1021, 1031, 1022, 1032], removed: [] });
    assert.deepEqual(drain(subject).map(({ key: value, x, y }) => [value, x, y]), [
        [1021, 2, 1], [1022, 2, 2], [1031, 3, 1], [1032, 3, 2],
    ]);
    subject.reset();
    subject.update(rect(20, 10, 34, 22));
    assert.deepEqual(subject.takeBatch().map(({ key: value, x, y }) => [value, x, y]), [
        [1021, 2, 1], [1031, 3, 1], [1022, 2, 2], [1032, 3, 2],
    ]);
    assert.deepEqual(subject.takeBatch(), []);
});

test("ChunkStreamer: margins use world cells with injected chunk size and clamp all map edges", () => {
    const subject = streamer({ chunkSize: 7, mapWidth: 23, mapHeight: 17, margin: 2, retainMargin: 9 });
    assert.deepEqual(subject.update(rect(8, 8)), { added: [0, 1, 100, 101], removed: [] });
    assert.deepEqual(subject.update(rect(22, 16)), { added: [202, 203], removed: [] });
    assert.deepEqual(drain(subject).map(({ x, y }) => [x, y]), [[2, 2], [3, 2]]);
    assert.deepEqual(subject.update(rect(100, 100, 200, 200)), { added: [], removed: [] });
    assert.deepEqual(drain(subject).map(({ x, y }) => [x, y]), [[3, 2]],
        "the outside viewport clamps to the last cell and starts a new generation");
    assert.deepEqual(subject.update(rect(-200, -200, -100, -100)), { added: [0], removed: [] });
    assert.deepEqual(subject.takeBatch().map(({ x, y }) => [x, y]), [[0, 0]]);
});

test("ChunkStreamer: a sub-chunk map still loads key zero once and empty queues stay empty", () => {
    const subject = streamer({ chunkSize: 64, mapWidth: 3, mapHeight: 5, margin: 2, retainMargin: 10 });
    assert.equal(subject.take(), null);
    assert.deepEqual(subject.takeBatch(), []);
    assert.deepEqual(subject.update(rect(0, 0, 2, 4)), { added: [0], removed: [] });
    const batch = subject.takeBatch();
    assert.deepEqual(batch.map(({ key: value, x, y }) => [value, x, y]), [[0, 0, 0]]);
    assert.equal(subject.accept(batch[0]), true);
    assert.equal(subject.take(), null);
    assert.deepEqual(subject.takeBatch(), []);
});

test("ChunkStreamer: completions require a taken current request and are accepted only once", () => {
    const subject = streamer();
    subject.update(rect(0, 0, 19, 9));
    const first = take(subject);
    assert.equal(subject.current({ ...first, key: 1, x: 1 }), false, "desired but not taken is not pending");
    assert.equal(subject.accept({ ...first, key: 1, x: 1 }), false);
    assert.equal(subject.current(first), true);
    assert.equal(subject.accept(first), true);
    assert.equal(subject.current(first), false);
    assert.equal(subject.accept(first), false);
    subject.defer(first);
    subject.reject(first);
    const snapshot = subject.loadedKeys() as number[];
    snapshot.length = 0;
    assert.deepEqual(subject.loadedKeys(), [0], "loadedKeys returns an independent snapshot");
    assert.deepEqual(drain(subject).map((load) => load.key), [1]);
});

test("ChunkStreamer: late completion cannot claim a newly pending request for the same key", () => {
    const subject = streamer();
    subject.update(rect(10, 10, 19, 19));
    const stale = take(subject);
    subject.update(rect(10, 10, 29, 19));
    const fresh = take(subject);
    assert.equal(fresh.key, stale.key);
    assert.ok(fresh.generation > stale.generation);
    assert.equal(subject.accept(stale), false, "late completion must not be accepted in the new generation");
    assert.equal(subject.current(stale), false);
    subject.reject(stale);
    subject.defer(stale);
    assert.equal(subject.current(fresh), true, "stale reject/defer cannot remove the fresh pending request");
    assert.equal(subject.accept(fresh), true);
    assert.deepEqual(drain(subject).map((load) => load.key), [102]);
});

test("ChunkStreamer: moving away invalidates every member of an in-flight batch", () => {
    const subject = streamer();
    subject.update(rect(0, 0, 19, 19));
    const batch = subject.takeBatch();
    assert.equal(batch.length, 4);
    subject.update(rect(80, 80, 99, 99));
    for (const load of batch) {
        assert.equal(subject.current(load), false);
        assert.equal(subject.accept(load), false);
        subject.reject(load);
        subject.defer(load);
    }
    assert.deepEqual(subject.loadedKeys(), []);
    assert.deepEqual(subject.takeBatch().map((load) => load.key), [808, 809, 908, 909]);
    assert.equal(subject.take(), null);
});

test("ChunkStreamer: batches are complete rectangles of at most four unique queued chunks", () => {
    const subject = streamer({ mapWidth: 45, mapHeight: 35 });
    const desired = subject.update(rect(0, 0, 44, 34)).added;
    const seen = new Set<number>();
    let first = true;
    for (let batch = subject.takeBatch(); batch.length; batch = subject.takeBatch()) {
        if (first) {
            assert.deepEqual(batch.map((load) => load.key), [102, 103, 202, 203]);
            first = false;
        }
        const width = Math.max(...batch.map((load) => load.x)) - Math.min(...batch.map((load) => load.x)) + 1;
        const height = Math.max(...batch.map((load) => load.y)) - Math.min(...batch.map((load) => load.y)) + 1;
        assert.ok(width <= 2 && height <= 2);
        assert.equal(batch.length, width * height, "no holes or diagonal-only groups");
        for (const load of batch) {
            assert.equal(seen.has(load.key), false);
            seen.add(load.key);
            assert.ok(load.x >= 0 && load.x < 5 && load.y >= 0 && load.y < 4);
            assert.equal(subject.current(load), true);
            assert.equal(subject.accept(load), true);
        }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), [...desired].sort((a, b) => a - b));
});

test("ChunkStreamer: batches fall back to horizontal/vertical pairs and exclude pending or loaded neighbors", () => {
    const horizontal = streamer();
    horizontal.update(rect(0, 0, 29, 9));
    assert.deepEqual(horizontal.takeBatch().map((load) => load.key), [1, 2]);
    assert.deepEqual(horizontal.takeBatch().map((load) => load.key), [0]);
    const vertical = streamer();
    vertical.update(rect(0, 0, 9, 29));
    assert.deepEqual(vertical.takeBatch().map((load) => load.key), [100, 200]);
    assert.deepEqual(vertical.takeBatch().map((load) => load.key), [0]);

    for (const accepted of [false, true]) {
        const subject = streamer();
        subject.update(rect(0, 0, 19, 19));
        const first = take(subject);
        assert.equal(first.key, 0);
        if (accepted) assert.equal(subject.accept(first), true);
        assert.deepEqual(subject.takeBatch().map((load) => load.key), [1, 101]);
        assert.deepEqual(subject.takeBatch().map((load) => load.key), [100]);
        assert.deepEqual(subject.takeBatch(), []);
        if (!accepted) assert.equal(subject.accept(first), true);
    }
});

test("ChunkStreamer: reject drops the failed request until the load rectangle changes or resets", () => {
    const subject = streamer();
    subject.update(rect(10, 10));
    const failed = take(subject);
    subject.reject(failed);
    subject.reject(failed);
    subject.defer(failed);
    assert.equal(subject.current(failed), false);
    assert.equal(subject.accept(failed), false);
    assert.deepEqual(subject.loadedKeys(), []);
    subject.update(rect(11, 11));
    assert.equal(subject.take(), null);
    subject.update(rect(10, 10, 20, 10));
    const retry = take(subject);
    assert.equal(retry.key, failed.key);
    assert.ok(retry.generation > failed.generation);
    assert.equal(subject.accept(retry), true);
});

test("ChunkStreamer: defer returns each request to the queue head without duplicating it", () => {
    const subject = streamer();
    subject.update(rect(0, 0, 49, 49));
    const first = take(subject);
    const second = take(subject);
    subject.defer(first);
    subject.defer(first);
    subject.defer(second);
    assert.equal(subject.current(first), false);
    assert.equal(subject.current(second), false);
    assert.equal(subject.accept(first), false);
    assert.deepEqual(take(subject), second, "multiple defer calls preserve the original unshift order");
    assert.deepEqual(take(subject), first);
    assert.equal(subject.accept(first), true);
    assert.equal(subject.accept(second), true);
    assert.equal(drain(subject).length, 23);
});

test("ChunkStreamer: deferring a full batch lets the caller retry the same rectangle", () => {
    const subject = streamer();
    subject.update(rect(0, 0, 19, 19));
    const batch = subject.takeBatch();
    for (const load of batch) subject.defer(load);
    assert.deepEqual(subject.takeBatch(), batch);
    assert.deepEqual(subject.takeBatch(), []);
    for (const load of batch) assert.equal(subject.accept(load), true);
});

test("ChunkStreamer: reset clears all state, reloads an identical viewport and fences old completions", () => {
    const subject = streamer();
    const viewport = rect(0, 0, 19, 19);
    subject.update(viewport);
    const loaded = take(subject);
    subject.accept(loaded);
    const stale = take(subject);
    subject.reset();
    assert.deepEqual(subject.loadedKeys(), []);
    assert.equal(subject.take(), null);
    assert.deepEqual(subject.takeBatch(), []);
    assert.equal(subject.current(stale), false);
    assert.equal(subject.accept(loaded), false);
    assert.deepEqual(subject.update(viewport), { added: [0, 1, 100, 101], removed: [] });
    const batch = subject.takeBatch();
    assert.equal(batch.length, 4);
    assert.ok(batch.every((load) => load.generation > stale.generation));
    assert.equal(subject.accept(stale), false);
    subject.reject(stale);
    subject.defer(stale);
    for (const load of batch) assert.equal(subject.accept(load), true);
    assert.deepEqual(subject.loadedKeys(), [0, 1, 100, 101]);
});
