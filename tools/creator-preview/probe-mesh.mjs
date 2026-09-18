/** 一次性探针：开地图，dump 每个 chunk 网格的顶点范围/quad 数/材质贴图。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpClient, acquireTab, openScene, pageWalkSource, sceneUuidFromMeta, selectNodes, sleep } from "./lib.mjs";

const devtools = "http://127.0.0.1:9222", preview = "http://127.0.0.1:7456";
const sceneMeta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/Cocos/assets/scene.scene.meta");
const sceneUuid = sceneUuidFromMeta(fs.readFileSync(sceneMeta, "utf8"));
const tab = await acquireTab({ devtools, preview, reuse: false });
const client = await CdpClient.connect(tab.wsUrl);
await openScene(client, { preview, sceneUuid, timeoutMs: 300_000 });

async function walk() { return client.evaluate(pageWalkSource); }
async function waitNode(desc, pick, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = pick(await walk());
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`超时：${desc}`);
    await sleep(400);
  }
}
async function tap(node) { await client.click(node.center.x, node.center.y); }

let w = await walk();
if (!selectNodes(w, { name: "PromoHomeView" }).length) {
  await waitNode("btn_login", (wk) => selectNodes(wk, { name: "btn_login" })[0] ?? null);
  await tap(selectNodes(await walk(), { name: "btn_login" })[0]);
  await waitNode("首屏", (wk) => selectNodes(wk, { name: "PromoHomeView" }).length > 0 ? true : null);
}
await waitNode("设置入口", (wk) => selectNodes(wk, { text: "设置", pathIncludes: "PromoHomeView" })[0] ?? null);
await tap(selectNodes(await walk(), { text: "设置", pathIncludes: "PromoHomeView" })[0]);
await waitNode("设置面板", (wk) => selectNodes(wk, { name: "SettingsView" }).length > 0 ? true : null);
await tap(selectNodes(await walk(), { textMatches: /大地图/u, pathIncludes: "SettingsView/" })[0]);
await waitNode("地图标题", (wk) => selectNodes(wk, { pathIncludes: "SlgMapView/" }).find((n) => /· LOD \d/u.test(n.text ?? "")) ?? null);
console.log("地图已开：", selectNodes(await walk(), { pathIncludes: "SlgMapView/" }).find((n) => /· LOD/u.test(n.text ?? ""))?.text);
await sleep(2500);

const probe = `(() => {
  const out = [];
  const visit = (node, inMap) => {
    if (!node.activeInHierarchy) return;
    const inside = inMap || node.name === "SlgMapView";
    if (inside && /^slg-chunk-\\d+-\\d+$/u.test(node.name)) {
      const r = node.getComponent("cc.MeshRenderer");
      const mesh = r ? r.mesh : null;
      let info = { name: node.name };
      try {
        const pos = mesh ? mesh.readAttribute(0, "a_position") : null;
        if (pos && pos.length >= 3) {
          let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          for (let i = 0; i < pos.length; i += 3) {
            minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
            minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
          }
          info.verts = pos.length / 3;
          info.range = [Math.round(minX / 48), Math.round(minY / 48), Math.round(maxX / 48), Math.round(maxY / 48)];
        } else info.verts = pos ? 0 : "no-read";
      } catch (e) { info.err = e.message; }
      out.push(info);
    }
    for (const c of node.children) visit(c, inside);
  };
  visit(cc.director.getScene(), false);
  return JSON.stringify(out, null, 0);
})()`;
console.log(await client.evaluate(probe));
await client.screenshot("/tmp/slg-mesh-probe.jpg");
client.close();
