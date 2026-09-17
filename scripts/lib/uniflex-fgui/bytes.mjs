/** Big-endian FairyGUI ByteBuffer writer. Mirrors fairygui.mjs ByteBuffer. */

export class StringTable {
    constructor() {
        this.list = [];
        this.index = new Map();
    }

    add(value) {
        if (value == null) return 65534;
        if (value === "") return 65533;
        const key = String(value);
        if (this.index.has(key)) return this.index.get(key);
        const id = this.list.length;
        this.list.push(key);
        this.index.set(key, id);
        return id;
    }
}

export class ByteWriter {
    constructor(strings = new StringTable()) {
        this.chunks = [];
        this.size = 0;
        this.strings = strings;
    }

    push(bytes) {
        const buf = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
        this.chunks.push(buf);
        this.size += buf.length;
        return this;
    }

    u8(value) { return this.push([value & 0xff]); }
    bool(value) { return this.u8(value ? 1 : 0); }
    i16(value) {
        const b = new Uint8Array(2);
        new DataView(b.buffer).setInt16(0, value);
        return this.push(b);
    }
    u16(value) {
        const b = new Uint8Array(2);
        new DataView(b.buffer).setUint16(0, value);
        return this.push(b);
    }
    i32(value) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setInt32(0, value);
        return this.push(b);
    }
    u32(value) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, value);
        return this.push(b);
    }
    f32(value) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setFloat32(0, value);
        return this.push(b);
    }

    str(value) {
        const text = value == null ? "" : String(value);
        const raw = Buffer.from(text, "utf8");
        this.u16(raw.length);
        return this.push(raw);
    }

    s(value) {
        return this.u16(this.strings.add(value));
    }

    color(css, { alpha = true } = {}) {
        const { r, g, b, a } = parseCssColor(css);
        this.u8(r); this.u8(g); this.u8(b); this.u8(alpha ? a : 255);
        return this;
    }

    buffer(bytes) {
        const raw = bytes instanceof Uint8Array ? bytes : bytes.toBuffer();
        this.u32(raw.byteLength);
        return this.push(raw);
    }

    toBuffer() {
        const out = new Uint8Array(this.size);
        let offset = 0;
        for (const chunk of this.chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }
}

/** Write a seek() index table followed by segment bodies. `null` segments use offset 0 (missing). */
export function writeSegments(segments, strings) {
    const bodies = segments.map((segment) => {
        if (segment == null) return null;
        return segment instanceof Uint8Array ? segment : segment.toBuffer();
    });
    const present = bodies.map((body) => body ?? new Uint8Array(0));
    const count = present.length;
    let offsets = new Array(count);
    const headerShort = 2 + count * 2;
    let cursor = headerShort;
    let needLong = false;
    for (let i = 0; i < count; i += 1) {
        if (!bodies[i]) {
            offsets[i] = 0;
            continue;
        }
        offsets[i] = cursor;
        cursor += bodies[i].byteLength;
        if (offsets[i] > 0xffff) needLong = true;
    }
    const headerSize = 2 + count * (needLong ? 4 : 2);
    if (needLong && headerSize !== headerShort) {
        const delta = headerSize - headerShort;
        offsets = offsets.map((value) => (value === 0 ? 0 : value + delta));
        cursor += delta;
    }
    const head = new ByteWriter(strings);
    head.u8(count);
    head.u8(needLong ? 0 : 1);
    for (const offset of offsets) {
        if (needLong) head.u32(offset);
        else head.u16(offset);
    }
    const out = new Uint8Array(cursor);
    out.set(head.toBuffer(), 0);
    let pos = headerSize;
    for (const body of bodies) {
        if (!body) continue;
        out.set(body, pos);
        pos += body.byteLength;
    }
    return out;
}

export function parseCssColor(value) {
    const text = String(value ?? "#000000ff").trim();
    const hex = text.startsWith("#") ? text.slice(1) : text;
    if (hex.length === 3) {
        const [r, g, b] = [...hex].map((ch) => Number.parseInt(ch + ch, 16));
        return { r, g, b, a: 255 };
    }
    if (hex.length === 4) {
        const [r, g, b, a] = [...hex].map((ch) => Number.parseInt(ch + ch, 16));
        return { r, g, b, a };
    }
    if (hex.length === 6) {
        return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
            a: 255,
        };
    }
    if (hex.length === 8) {
        return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
            a: Number.parseInt(hex.slice(6, 8), 16),
        };
    }
    throw new Error(`Unsupported color: ${value}`);
}

function hex2(value) {
    return (value & 0xff).toString(16).padStart(2, "0");
}

/** FairyGUI XML colors: `#RRGGBB` or `#AARRGGBB`. */
export function toFguiXmlColor(value, { alpha = false } = {}) {
    const { r, g, b, a } = parseCssColor(value);
    return alpha ? `#${hex2(a)}${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}
