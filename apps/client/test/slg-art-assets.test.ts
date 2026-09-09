import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const SOURCE = new URL("../../kits/slg/art/qingyuan-v1/", import.meta.url);
const RUNTIME = new URL("../../Cocos/assets/resources/kits/slg/qingyuan/", import.meta.url);
const ASSETS = ["terrain-atlas.png", "decoration-atlas.png", "world-overview.png"] as const;

function pngHeader(bytes: Buffer) {
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "PNG signature");
    assert.equal(bytes.readUInt32BE(8), 13, "IHDR length");
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25],
        compression: bytes[26], filtering: bytes[27], interlace: bytes[28] };
}

/** Decode PNG scanline filters solely to check shipped alpha bytes; this does not emulate Cocos. */
function alphaRange(bytes: Buffer): { min: number; max: number; occupiedCells: readonly number[] } {
    const header = pngHeader(bytes);
    assert.equal(header.bitDepth, 8); assert.equal(header.colorType, 6);
    assert.equal(header.compression, 0); assert.equal(header.filtering, 0); assert.equal(header.interlace, 0);
    const compressed: Buffer[] = [];
    for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
        assert.ok(offset + length + 12 <= bytes.length, "complete PNG chunk");
        if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
        if (type === "IEND") break;
    }
    const stride = header.width * 4;
    const expectedLength = (stride + 1) * header.height;
    const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedLength });
    assert.equal(raw.length, expectedLength);
    let previous = Buffer.alloc(stride), current = Buffer.alloc(stride), min = 255, max = 0;
    const occupiedCells = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < header.height; y++) {
        const row = y * (stride + 1), filter = raw[row];
        assert.ok(filter <= 4, "known PNG scanline filter");
        for (let column = 0; column < stride; column++) {
            const left = column >= 4 ? current[column - 4] : 0, up = previous[column];
            const upperLeft = column >= 4 ? previous[column - 4] : 0;
            let predictor = 0;
            if (filter === 1) predictor = left;
            else if (filter === 2) predictor = up;
            else if (filter === 3) predictor = Math.floor((left + up) / 2);
            else if (filter === 4) {
                const value = left + up - upperLeft;
                const a = Math.abs(value - left), b = Math.abs(value - up), c = Math.abs(value - upperLeft);
                predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
            }
            current[column] = (raw[row + 1 + column] + predictor) & 255;
            if (column % 4 === 3) {
                const alpha = current[column], x = Math.floor(column / 4);
                min = Math.min(min, alpha); max = Math.max(max, alpha);
                if (alpha > 0) occupiedCells[Math.floor(y / 512) * 3 + Math.floor(x / 512)] += 1;
            }
        }
        [previous, current] = [current, previous];
    }
    return { min, max, occupiedCells };
}

test("SLG art assets: runtime images exactly mirror the approved art sources and retain their dimensions", () => {
    for (const name of ASSETS) {
        const source = readFileSync(new URL(name, SOURCE));
        const runtime = readFileSync(new URL(name, RUNTIME));
        assert.deepEqual(runtime, source, `${name}: runtime image must match its approved source byte for byte`);
        const header = pngHeader(runtime);
        if (name.endsWith("atlas.png")) assert.deepEqual([header.width, header.height], [1536, 1024]);
        else assert.deepEqual([header.width, header.height], [1254, 1254]);
    }
});

test("SLG art assets: decoration pixels are real RGBA with transparent background and six occupied cells", () => {
    const bytes = readFileSync(new URL("decoration-atlas.png", RUNTIME));
    const header = pngHeader(bytes);
    assert.deepEqual([header.width, header.height, header.bitDepth, header.colorType], [1536, 1024, 8, 6]);
    const result = alphaRange(bytes);
    assert.equal(result.min, 0, "the background contains genuinely transparent pixels");
    assert.equal(result.max, 255, "the painted subjects retain opaque pixels");
    assert.ok(result.occupiedCells.every((count) => count > 0), "all six atlas cells contain a decoration");
});

interface ImageMeta {
    readonly importer?: string;
    readonly subMetas?: Readonly<Record<string, {
        readonly importer?: string;
        readonly name?: string;
        readonly userData?: Readonly<Record<string, unknown>>;
    }>>;
}

test("SLG art asset metadata: declared texture sampling is linear, clamped and has no mipmaps", () => {
    for (const name of ASSETS) {
        const meta = JSON.parse(readFileSync(new URL(`${name}.meta`, RUNTIME), "utf8")) as ImageMeta;
        assert.equal(meta.importer, "image");
        const textures = Object.values(meta.subMetas ?? {}).filter((entry) => entry.importer === "texture");
        assert.equal(textures.length, 1, `${name}: one imported texture subasset`);
        assert.equal(textures[0].name, "texture", "matches the resources.load /texture path");
        const data = textures[0].userData;
        assert.ok(data);
        assert.equal(data.minfilter, "linear"); assert.equal(data.magfilter, "linear");
        assert.equal(data.mipfilter, "none");
        assert.equal(data.wrapModeS, "clamp-to-edge"); assert.equal(data.wrapModeT, "clamp-to-edge");
    }
    // These assertions describe import metadata; Creator preview verifies the actual render result.
});
