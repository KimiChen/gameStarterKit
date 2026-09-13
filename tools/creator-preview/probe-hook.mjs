/** 一次性探针（备用）：给 Material.prototype.destroy / Renderer.setSharedMaterial 打桩记录调用栈，
 *  驱动切图后转储日志，定位裸材质来源。仅在第六轮仍失败时使用。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpClient, acquireTab, openScene, pageWalkSource, sceneUuidFromMeta, selectNodes, sleep } from "./lib.mjs";

const HOOK = `(() => {
  if (window.__matHook) return "already";
  const logs = [];
  window.__matHook = logs;
  const M = cc.Material.prototype;
  const origDestroy = M.destroy;
  M.destroy = function () {
    logs.push({ op: "Material.destroy", propsNull: this._props === null, effect: !!this._effectAsset, stack: new Error().stack.split("\\n").slice(2, 8).join("\\n") });
    return origDestroy.apply(this, arguments);
  };
  // 找 Renderer 基类（通过任一 MeshRenderer 实例的原型链）
  return "hooked";
})()`;

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
console.log("地图已开");
await sleep(2000);
console.log("hook:", await client.evaluate(HOOK));
await tap(selectNodes(await walk(), { namePrefix: "slg-minimap", pathIncludes: "SlgMapView/" })[0]);
await waitNode("切换面板", (wk) => selectNodes(wk, { name: "slg-map-switcher" }).length > 0 ? true : null);
await tap(selectNodes(await walk(), { text: "山之国", pathIncludes: "slg-map-option-shanzhiguo" })[0]);
console.log("已切山之国");
await sleep(6000);
const logs = await client.evaluate(`JSON.stringify(window.__matHook ?? [], null, 1)`);
fs.writeFileSync("/tmp/mat-hook-log.json", logs);
console.log("hook 日志条数:", JSON.parse(logs).length, "→ /tmp/mat-hook-log.json");
client.close();
