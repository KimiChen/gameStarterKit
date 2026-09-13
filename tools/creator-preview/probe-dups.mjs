/** 一次性探针：重名 chunk 节点计数 + 各自身份。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const counts = {};
  const details = [];
  const visit = (node, inMap) => {
    if (!node.activeInHierarchy) return;
    const inside = inMap || node.name === "SlgMapView";
    if (inside && /^slg-chunk-\\d+-\\d+$/u.test(node.name)) {
      counts[node.name] = (counts[node.name] ?? 0) + 1;
      const r = node.getComponent("cc.MeshRenderer");
      const mesh = r ? r.mesh : null;
      let verts = 0;
      try { const p = mesh ? mesh.readAttribute(0, "a_position") : null; verts = p ? p.length / 3 : 0; } catch {}
      details.push({ name: node.name, verts, uuid: node.uuid.slice(0, 8) });
    }
    for (const c of node.children) visit(c, inside);
  }
  visit(cc.director.getScene(), false);
  const dup = Object.entries(counts).filter(([, n]) => n > 1);
  return JSON.stringify({ total: details.length, duplicates: dup, sample: details.slice(0, 14) });
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
