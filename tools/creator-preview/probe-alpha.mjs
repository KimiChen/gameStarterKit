/** 一次性探针：chunk 网格顶点色 alpha + 归属 alpha。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let tl = null;
  const find = (n) => { if (n.name === "slg-terrain-layer") { tl = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!tl) return "no terrain-layer";
  const out = [];
  for (const c of tl.children) {
    if (!/^slg-(chunk|ownership|sea)/.test(c.name)) continue;
    const r = c.getComponent("cc.MeshRenderer");
    const mesh = r ? r.mesh : null;
    let a0 = "n/a", aMax = "n/a";
    try {
      const col = mesh ? mesh.readAttribute(0, "a_color") : null;
      if (col && col.length >= 4) {
        a0 = Math.round(col[3] * 1000) / 1000;
        let mx = 0;
        for (let i = 3; i < col.length; i += 4) mx = Math.max(mx, col[i]);
        aMax = Math.round(mx * 1000) / 1000;
      }
    } catch (e) { a0 = "ERR:" + e.message; }
    out.push({ name: c.name, active: c.active, a0, aMax });
  }
  return JSON.stringify(out, null, 0);
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
