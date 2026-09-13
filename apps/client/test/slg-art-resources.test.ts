/** Test reference ownership and callback ordering through the production loader, not a Cocos renderer simulation. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
type Subject = typeof import("../src/kits/slg/view/SlgArtResources");

class FakeAsset {
    // Two references represent other consumers sharing the resource cache.
    refs = 2;
    acquired = 0;
    released = 0;
    addRef(): this { this.refs += 1; this.acquired += 1; return this; }
    decRef(): this { assert.ok(this.refs > 0); this.refs -= 1; this.released += 1; return this; }
}
class FakeJsonAsset extends FakeAsset { constructor(public json: unknown = null) { super(); } }
class FakeTexture2D extends FakeAsset { constructor(public width = 0, public height = 0) { super(); } }
interface LoadRequest {
    readonly path: string;
    readonly kind: new () => FakeAsset;
    readonly callback: (error: Error | null, asset?: FakeAsset) => void;
    completed: boolean;
}

let requests: LoadRequest[] | null = null;
let loaded: Subject | null = null;

async function loadSubject(): Promise<Subject> {
    if (loaded) return loaded;
    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;
    const cc = {
        JsonAsset: FakeJsonAsset,
        Texture2D: FakeTexture2D,
        resources: {
            load(path: string, kind: new () => FakeAsset, callback: LoadRequest["callback"]): void {
                assert.ok(requests, "resource requests must belong to the active test harness");
                requests.push({ path, kind, callback, completed: false });
            },
        },
    };
    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
        if (request === "cc") return cc;
        return originalLoad.call(this, request, parent, isMain);
    };
    try { loaded = await import("../src/kits/slg/view/SlgArtResources"); return loaded; }
    finally { moduleApi._load = originalLoad; }
}

function fixture() {
    return {
        terrain: new FakeJsonAsset({ id: "senzhiguo", name: "Fixture", width: 1500, height: 1500,
            islandRect: { minX: 0, minY: 0, maxX: 1499, maxY: 1499 },
            palette: [{ id: 0, color: [100, 150, 200] }],
            regions: [{ x: 0, y: 0, width: 1500, height: 1500, terrain: 0 }] }),
        decorations: new FakeTexture2D(1536, 1024),
        overview: new FakeTexture2D(1024, 1024),
        layout: new FakeJsonAsset({ source: "fixture", id: "senzhiguo", mapSize: 1500,
            landmarks: [{ name: "灯塔", x: 100, y: 100, tag: "灯塔", kind: "stele" }], decorations: [] }),
        island: new FakeTexture2D(2400, 1607),
        tiles: new FakeJsonAsset({ id: "senzhiguo", tile: 16, scale: 3, atlasCols: 16, cellPx: 256,
            atlas: ["tileset-0.png"], layers: [{ name: "Ground", seq: 0, cells: [[1, 1, 0]] }],
            tiles: [{ atlas: 0, cell: 0, w: 168, h: 168, ppu: 168, pivotX: 0.5, pivotY: 0.5 }] }),
        tileset: new FakeTexture2D(4096, 4096),
        sea: new FakeTexture2D(512, 512),
    };
}
type Fixture = ReturnType<typeof fixture>;
type ResourceName = keyof Fixture;
const PATHS: Readonly<Record<ResourceName, string>> = {
    terrain: "kits/slg/maps/senzhiguo/terrain",
    decorations: "kits/slg/maps/senzhiguo/decoration-atlas/texture",
    overview: "kits/slg/maps/senzhiguo/world-overview/texture",
    layout: "kits/slg/maps/senzhiguo/layout",
    island: "kits/slg/maps/senzhiguo/island-ground/texture",
    tiles: "kits/slg/maps/senzhiguo/tiles",
    tileset: "kits/slg/maps/senzhiguo/tileset-0/texture",
    sea: "kits/slg/maps/senzhiguo/sea-tile/texture",
};

async function withHarness(body: (subject: Subject, complete: (name: ResourceName, asset?: FakeAsset, error?: Error) => void) => Promise<void>): Promise<void> {
    const subject = await loadSubject();
    requests = [];
    const complete = (name: ResourceName, asset?: FakeAsset, error?: Error): void => {
        const request = requests?.find((entry) => entry.path === PATHS[name] && !entry.completed);
        assert.ok(request, `pending ${name} request`);
        if (asset) assert.ok(asset instanceof request.kind, `${name} was requested using its asset class`);
        request.completed = true;
        request.callback(error ?? null, asset);
    };
    try { await body(subject, complete); assert.ok(requests.every((request) => request.completed)); }
    finally { requests = null; }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("SLG art resources: successful unordered callbacks acquire a bundle whose release is idempotent", async () => {
    await withHarness(async (subject, complete) => {
        const assets = fixture();
        const pending = subject.loadSlgArtResources("senzhiguo");
        assert.equal(requests?.length, 8);
        for (const name of ["overview", "terrain", "decorations", "layout", "island", "tiles", "tileset", "sea"] as const) complete(name, assets[name]);
        const bundle = await pending;
        assert.equal(bundle.mapId, "senzhiguo");
        assert.equal(bundle.terrain, assets.terrain.json);
        assert.equal(bundle.layout.landmarks.length, 1);
        assert.equal(bundle.layout.landmarks[0].name, "灯塔");
        assert.equal(bundle.decorations, assets.decorations); assert.equal(bundle.overview, assets.overview);
        assert.equal(bundle.tileset, assets.tileset); assert.equal(bundle.sea, assets.sea);
        for (const asset of Object.values(assets)) assert.deepEqual([asset.acquired, asset.released, asset.refs], [1, 0, 3]);
        bundle.release(); bundle.release(); bundle.release();
        for (const asset of Object.values(assets)) assert.deepEqual([asset.acquired, asset.released, asset.refs], [1, 1, 2]);
    });
});

test("SLG art resources: partial failure waits for every in-flight callback and releases late successes", async () => {
    await withHarness(async (subject, complete) => {
        const assets = fixture();
        const pending = subject.loadSlgArtResources("senzhiguo");
        let settled = false;
        const rejected = assert.rejects(pending, /missing\/invalid/u).then(() => { settled = true; });
        complete("terrain", assets.terrain);
        complete("decorations", assets.decorations, new Error("texture download failed"));
        await flush();
        assert.equal(settled, false, "failure cannot finish while callbacks may still acquire references");
        assert.deepEqual([assets.terrain.refs, assets.terrain.released], [3, 0]);
        complete("overview", assets.overview);
        complete("layout", assets.layout);
        complete("island", assets.island);
        complete("tiles", assets.tiles);
        complete("tileset", assets.tileset);
        await flush();
        assert.equal(settled, false, "even the final outstanding request must be accounted for");
        complete("sea", assets.sea);
        await rejected;
        for (const asset of [assets.terrain, assets.overview, assets.layout, assets.island, assets.tiles, assets.tileset, assets.sea]) {
            assert.deepEqual([asset.acquired, asset.released, asset.refs], [1, 1, 2]);
        }
        assert.deepEqual([assets.decorations.acquired, assets.decorations.released, assets.decorations.refs], [0, 0, 2],
            "an error callback's asset was never acquired and must not be released");
    });
});

test("SLG art resources: invalid terrain or texture dimensions release every successfully loaded asset", async (t) => {
    const cases: readonly { name: string; mutate: (assets: Fixture) => void; message: RegExp }[] = [
        { name: "terrain violates shared dimensions", mutate: (assets) => {
            assets.terrain.json = { ...(assets.terrain.json as Record<string, unknown>), width: 9999 };
        }, message: /missing\/invalid/u },
        { name: "tiles contract violation", mutate: (assets) => { assets.tiles.json = { ...(assets.tiles.json as Record<string, unknown>), tile: 0 }; }, message: /missing\/invalid|tiles contract/u },
        { name: "tiles scale missing", mutate: (assets) => { assets.tiles.json = { ...(assets.tiles.json as Record<string, unknown>), scale: 0 }; }, message: /missing\/invalid|tiles contract/u },
        { name: "overview is not square", mutate: (assets) => { assets.overview.height = 800; }, message: /overview must be square/u },
        { name: "overview has zero dimensions", mutate: (assets) => { assets.overview.width = 0; assets.overview.height = 0; }, message: /overview must be square/u },
    ];
    for (const entry of cases) await t.test(entry.name, async () => {
        await withHarness(async (subject, complete) => {
            const assets = fixture(); entry.mutate(assets);
            const pending = subject.loadSlgArtResources("senzhiguo");
            const rejected = assert.rejects(pending, entry.message);
            for (const name of ["decorations", "terrain", "overview", "layout", "island", "tiles", "tileset", "sea"] as const) complete(name, assets[name]);
            await rejected;
            for (const asset of Object.values(assets)) assert.deepEqual([asset.acquired, asset.released, asset.refs], [1, 1, 2]);
        });
    });
});

test("SLG art resources: two routes sharing cached textures release only their own references", async () => {
    await withHarness(async (subject, complete) => {
        const assets = fixture();
        const first = subject.loadSlgArtResources("senzhiguo"), second = subject.loadSlgArtResources("senzhiguo");
        assert.equal(requests?.length, 16);
        for (const name of ["terrain", "decorations", "overview", "layout", "island", "tiles", "tileset", "sea"] as const) {
            complete(name, assets[name]); complete(name, assets[name]);
        }
        const [a, b] = await Promise.all([first, second]);
        for (const asset of Object.values(assets)) assert.equal(asset.refs, 4);
        a.release(); a.release();
        for (const asset of Object.values(assets)) assert.deepEqual([asset.refs, asset.released], [3, 1]);
        b.release();
        for (const asset of Object.values(assets)) assert.deepEqual([asset.refs, asset.released], [2, 2]);
    });
});
