/** 一次性探针：chunk 网格逐 quad 还原（atlas cell × 世界格 × 尺寸）。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let target = null;
  const find = (n) => { if (n.name === "slg-chunk-50-47") { target = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!target) return "no chunk";
  const mesh = target.getComponent("cc.MeshRenderer").mesh;
  const pos = mesh.readAttribute(0, "a_position");
  const uv = mesh.readAttribute(0, "a_texCoord");
  const quads = [];
  for (let q = 0; q < pos.length / 12; q += 1) {
    const x0 = pos[q * 12], y0 = pos[q * 12 + 1], x2 = pos[q * 12 + 6], y2 = pos[q * 12 + 7];
    const u0 = uv[q * 8], v0 = uv[q * 8 + 1], u1 = uv[q * 8 + 2], v1 = uv[q * 8 + 5];
    const col = Math.floor(u0 * 16), row = Math.floor((1 - v1) * 16);
    quads.push([Math.round(x0 / 48 * 10) / 10, Math.round(y0 / 48 * 10) / 10,
      Math.round((x2 - x0) / 48 * 10) / 10, Math.round((y2 - y0) / 48 * 10) / 10, row * 16 + col]);
  }
  // 汇总：atlas cell 频次 + 位置样本
  const freq = {};
  for (const q of quads) freq[q[4]] = (freq[q[4]] ?? 0) + 1;
  return JSON.stringify({ quadCount: quads.length, cellFreq: freq, first10: quads.slice(0, 10) });
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    const has = await c.evaluate(`(() => { try { const s = cc.director.getScene(); return !!s && !!s.getChildByName("Canvas"); } catch { return false; } })()`);
    if (!has) { c.close(); continue; }
    console.log(p.id.slice(0, 8), await c.evaluate(probe));
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
