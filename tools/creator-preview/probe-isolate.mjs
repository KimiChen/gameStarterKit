/** 一次性实验：只留 chunk 瓦片网格可见（藏海/归属/装饰/far），截图看 tilemap 到底画了什么。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let view = null;
  const find = (n) => { if (n.name === "SlgMapView") { view = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!view) return "no view";
  let hidden = 0, kept = 0;
  const walk = (n) => {
    for (const c of n.children) {
      if (/^slg-(sea-base|ownership|decorations|far-)/.test(c.name)) { c.active = false; hidden += 1; }
      else { kept += 1; walk(c); }
    }
  };
  const world = view.getChildByName("slg-world");
  if (!world) return "no world";
  walk(world);
  return JSON.stringify({ hidden, kept });
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    const has = await c.evaluate(`(() => { try { const s = cc.director.getScene(); return !!s && !!s.getChildByName("Canvas"); } catch { return false; } })()`);
    if (!has) { c.close(); continue; }
    console.log(p.id.slice(0, 8), await c.evaluate(probe));
    await new Promise((r) => setTimeout(r, 800));
    await c.screenshot(`/tmp/slg-only-chunks-${p.id.slice(0, 8)}.jpg`);
    console.log(`/tmp/slg-only-chunks-${p.id.slice(0, 8)}.jpg`);
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
