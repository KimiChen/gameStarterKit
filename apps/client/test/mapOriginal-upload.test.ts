import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Material, Node } from "cc";
import type { MapoBatch } from "../src/kits/mapOriginal/view/MapoMeshBatch";
import { buildMapoSpriteMesh, type MapoSpriteInput } from "../src/kits/mapOriginal/logic/mapoMesh";
const require = createRequire(import.meta.url);
const moduleApi = require("node:module") as { _load(request: string, parent: unknown, isMain: boolean): unknown };
const original = moduleApi._load;
let sync!: typeof import("../src/kits/mapOriginal/view/MapoMeshBatch").syncMapoSpriteUpdates;
class V { constructor(public x: number, public y: number, public z: number) {} }
try {
    moduleApi._load = (id, parent, main) => id === "cc" ? { Vec3: V } : original.call(moduleApi, id, parent, main);
    sync = require("../src/kits/mapOriginal/view/MapoMeshBatch").syncMapoSpriteUpdates;
} finally { moduleApi._load = original; }

test("mapOriginal O6：脏属性只上传有效前缀，保留尾部/索引并同步 CPU 镜像与包围盒", () => {
    const input: MapoSpriteInput[] = Array.from({ length: 4 }, (_, row) => ({ row, col: 0, x: row * 20, y: 0, w: 10, h: 20, pivot: [.5, .5], uv: [0, 0, 1, 1] }));
    const before = buildMapoSpriteMesh(input), after = buildMapoSpriteMesh(input.map((s, i) => i === 1 ? { ...s, x: -100, uv: [.1, 0, .5, 1] } : s));
    const old = [before.positions, before.uvs, before.colors, before.addColors!], next = [after.positions, after.uvs, after.colors, after.addColors!];
    const data = new Uint8Array(old.reduce((n, a) => n + a.byteLength, 0) + before.indices16.byteLength);
    let at = 0, changedBounds = 0, invalidated = 0;
    const bundles = old.map((a, i) => { const offset = at; data.set(new Uint8Array(a.buffer), at); at += a.byteLength;
        return { view: { offset, length: a.byteLength, stride: [12, 8, 16, 16][i], count: 16 } }; });
    data.set(new Uint8Array(before.indices16.buffer), at);
    const gpu = old.map(a => new Uint8Array(a.buffer.slice(0))), calls: { attr: number; size: number }[] = [];
    const mesh = { data, struct: { vertexBundles: bundles, primitives: [{ vertexBundelIndices: [0, 1, 2, 3] }], minPosition: new V(...before.minPos), maxPosition: new V(...before.maxPos) },
        renderingSubMeshes: [{ vertexBuffers: gpu.map((g, attr) => ({ update(bytes: Uint8Array, size: number) { calls.push({ attr, size }); g.set(bytes); } })), invalidateGeometricInfo() { invalidated++; } }],
        updateSubMesh() { throw Error("unchanged topology must not upload everything"); } };
    const batches = [{ mesh, capacity: 4, model: { onGeometryChanged() { changedBounds++; } } }] as unknown as MapoBatch[];
    sync({} as Node, "test", batches, [{ geometry: after, full: false, ends: [2, 2, 0, 0] }], 1, {} as Material);
    assert.deepEqual(calls, [{ attr: 0, size: 96 }, { attr: 1, size: 64 }]);
    for (let i = 0; i < 4; i++) {
        assert.deepEqual(gpu[i], new Uint8Array(next[i].buffer));
        assert.deepEqual(data.slice(bundles[i].view.offset, bundles[i].view.offset + next[i].byteLength), gpu[i]);
    }
    assert.deepEqual(data.slice(at), new Uint8Array(before.indices16.buffer));
    assert.deepEqual(mesh.struct.minPosition, new V(...after.minPos)); assert.equal(changedBounds, 1); assert.equal(invalidated, 1);
    sync({} as Node, "test", batches, [{ geometry: after, full: false, ends: [0, 0, 0, 0] }], 1, {} as Material);
    assert.equal(calls.length, 2); assert.equal(changedBounds, 1);
    mesh.struct.vertexBundles[1].view.stride = 4;
    assert.throws(() => sync({} as Node, "test", batches, [{ geometry: after, full: false, ends: [0, 2, 0, 0] }], 1, {} as Material), /topology changed/);
});
