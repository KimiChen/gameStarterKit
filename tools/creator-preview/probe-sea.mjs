/** 一次性实验：藏 slg-sea-base / dump chunk 渲染材质贴图状态。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let tl = null;
  const find = (n) => { if (n.name === "slg-terrain-layer") { tl = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!tl) return "no terrain-layer";
  const names = tl.children.map((c) => c.name);
  const sea = tl.children.find((c) => c.name === "slg-sea-base");
  const chunk = tl.children.find((c) => /^slg-chunk-/.test(c.name));
  const r = chunk ? chunk.getComponent("cc.MeshRenderer") : null;
  const m = r ? r.getRenderMaterial(0) : null;
  let texInfo = "n/a";
  try {
    const t = m ? m.getProperty("mainTexture") : null;
    texInfo = t ? (t.width + "x" + t.height + " loaded=" + t.loaded) : "null";
  } catch (e) { texInfo = "ERR:" + e.message; }
  if (sea) sea.active = false;
  return JSON.stringify({ children: names.length, first5: names.slice(0, 5), seaHidden: !!sea && !sea.active, chunkRenderTex: texInfo });
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    const has = await c.evaluate(`(() => { try { return !!cc.director.getScene(); } catch { return false; } })()`);
    if (!has) { c.close(); continue; }
    console.log(p.id.slice(0, 8), await c.evaluate(probe));
    await c.screenshot("/tmp/slg-no-sea.jpg");
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
