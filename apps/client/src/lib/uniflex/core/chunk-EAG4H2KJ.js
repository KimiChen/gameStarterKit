// frontend/packages/core/dist/provider/json.js
function canonicalJson(value) {
  const ancestors = /* @__PURE__ */ new Set();
  const encode = (item) => {
    if (item === null)
      return "null";
    if (typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item))
      return JSON.stringify(item);
    if (typeof item !== "object" || ancestors.has(item))
      throw new Error("Invalid JSON value or cycle.");
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new Error("JSON requires plain objects.");
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      result = "[" + Array.from({ length: item.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, index);
        if (!descriptor || !("value" in descriptor))
          throw new Error("Invalid JSON array value/getter.");
        return encode(descriptor.value);
      }).join(",") + "]";
    } else {
      result = "{" + Object.keys(item).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!("value" in descriptor))
          throw new Error("JSON getters are not supported.");
        return JSON.stringify(key) + ":" + encode(descriptor.value);
      }).join(",") + "}";
    }
    ancestors.delete(item);
    return result;
  };
  return encode(value);
}
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var rotate = (n, count) => n >>> count | n << 32 - count;
function sha256(bytes) {
  const length = bytes.length;
  const data = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  data.set(bytes);
  data[length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(length / 536870912));
  view.setUint32(data.length - 4, length * 8);
  const state = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++)
      words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ x >>> 3) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ y >>> 10);
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 = h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + K[i] + words[i] >>> 0;
      const t2 = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    for (const [i, n] of [a, b, c, d, e, f, g, h].entries())
      state[i] += n;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
function jsonHash(value) {
  const text = canonicalJson(value);
  const bytes = [];
  for (const character of text) {
    const cp = character.codePointAt(0);
    if (cp < 128)
      bytes.push(cp);
    else if (cp < 2048)
      bytes.push(192 | cp >>> 6, 128 | cp & 63);
    else if (cp < 65536)
      bytes.push(224 | cp >>> 12, 128 | cp >>> 6 & 63, 128 | cp & 63);
    else
      bytes.push(240 | cp >>> 18, 128 | cp >>> 12 & 63, 128 | cp >>> 6 & 63, 128 | cp & 63);
  }
  return sha256(Uint8Array.from(bytes));
}
function freezeJson(value) {
  if (value === null || typeof value !== "object")
    return;
  for (const child of Object.values(value))
    freezeJson(child);
  Object.freeze(value);
}

export {
  canonicalJson,
  sha256,
  jsonHash,
  freezeJson
};
