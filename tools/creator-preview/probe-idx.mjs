/** 一次性探针：chunk 网格索引/顶点/UV 完整性。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let tl = null;
  const find = (n) => { if (n.name === "slg-terrain-layer") { tl = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!tl) return "no terrain-layer";
  const dump = (node) => {
    const r = node.getComponent("cc.MeshRenderer");
    const mesh = r ? r.mesh : null;
    if (!mesh) return { name: node.name, err: "no mesh" };
    const pos = mesh.readAttribute(0, "a_position");
    const uv = mesh.readAttribute(0, "a_texCoord");
    const idx = mesh.readIndices(0);
    let maxIdx = 0;
    if (idx) for (const v of idx) maxIdx = Math.max(maxIdx, v);
    return {
      name: node.name,
      verts: pos ? pos.length / 3 : 0,
      indices: idx ? idx.length : 0,
      maxIdx,
      uvFirst: uv ? Array.from(uv.slice(0, 8)).map((v) => Math.round(v * 4096) / 4096) : null,
      posFirst: pos ? Array.from(pos.slice(0, 12)).map((v) => Math.round(v)) : null,
    };
  };
  const out = [];
  for (const c of tl.children) {
    if (/^slg-(chunk|sea-base)/.test(c.name)) out.push(dump(c));
    if (out.length >= 4) break;
  }
  return JSON.stringify(out, null, 1);
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
