/** 一次性探针：chunk MeshRenderer 的 model/worldBounds/可见性标志。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let chunk = null;
  const find = (n) => { if (n.name === "slg-chunk-50-47") { chunk = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!chunk) return "no chunk";
  const r = chunk.getComponent("cc.MeshRenderer");
  const models = r._collectModels ? r._collectModels() : [];
  const m0 = models[0];
  const wb = m0 ? m0.worldBounds : null;
  return JSON.stringify({
    enabled: r.enabled, enabledInHierarchy: r.enabledInHierarchy,
    models: models.length,
    modelEnabled: m0 ? m0.enabled : "n/a",
    visFlags: m0 ? m0.visFlags : "n/a",
    worldBounds: wb ? { center: [Math.round(wb.center.x), Math.round(wb.center.y), Math.round(wb.center.z)], half: [Math.round(wb.halfExtents.x), Math.round(wb.halfExtents.y), Math.round(wb.halfExtents.z)] } : "null",
    nodeWorldPos: (() => { const p = chunk.getWorldPosition(); return [Math.round(p.x), Math.round(p.y), Math.round(p.z)]; })(),
    nodeScale: (() => { const s = chunk.getWorldScale(); return [s.x.toFixed(3), s.y.toFixed(3)]; })(),
    subModelCount: m0 ? m0.subModels.length : "n/a",
    inputAssembler: m0 && m0.subModels[0] ? { ia: !!m0.subModels[0].inputAssembler, vertCount: m0.subModels[0].inputAssembler ? m0.subModels[0].inputAssembler.vertexCount : "n/a", idxCount: m0.subModels[0].inputAssembler && m0.subModels[0].inputAssembler.indexBuffer ? m0.subModels[0].inputAssembler.indexBuffer.count : "n/a" } : "n/a",
  }, null, 1);
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
