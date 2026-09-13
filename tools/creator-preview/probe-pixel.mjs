/** 一次性实验：世界坐标 → 屏幕坐标，裁剪截图验证 Ground quad 像素。 */
import { CdpClient } from "./lib.mjs";

const probe = `(() => {
  const scene = cc.director.getScene();
  let chunk = null;
  const find = (n) => { if (n.name === "slg-chunk-50-47") { chunk = n; return; } for (const c of n.children) find(c); };
  find(scene);
  if (!chunk) return "no chunk";
  const camNode = scene.getChildByName("Canvas").getChildByName("Camera");
  const cam = camNode.getComponent("cc.Camera");
  const m = chunk.getWorldMatrix();
  // chunk 内两个点：Ground quad 中心 (801.5+1.5, 768.5+1.5)*48 = (803,770)*48；树丛格 (810,765)*48
  const out = {};
  for (const [label, wx, wy] of [["groundQuad", 803 * 48, 770 * 48], ["treeArea", 810 * 48, 765 * 48]]) {
    const wp = cc.Vec3.transformMat4(new cc.Vec3(), new cc.Vec3(wx, wy, 0), m);
    const sp = cam.worldToScreen(new cc.Vec3(), wp);
    out[label] = { world: [Math.round(wp.x), Math.round(wp.y)], screen: [Math.round(sp.x), Math.round(sp.y)] };
  }
  return JSON.stringify(out);
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    const has = await c.evaluate(`(() => { try { const s = cc.director.getScene(); return !!s && !!s.getChildByName("Canvas"); } catch { return false; } })()`);
    if (!has) { c.close(); continue; }
    const r = JSON.parse(await c.evaluate(probe));
    console.log(p.id.slice(0, 8), JSON.stringify(r));
    const dpr = await c.evaluate("window.devicePixelRatio");
    for (const [label, info] of Object.entries(r)) {
      await c.screenshot(`/tmp/slg-pixel-${label}.jpg`, { clip: { x: Math.max(0, info.screen[0] - 100), y: Math.max(0, info.screen[1] - 100), width: 200, height: 200, scale: 1 / dpr } });
      console.log(`/tmp/slg-pixel-${label}.jpg @ screen`, info.screen, "dpr", dpr);
    }
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
