/** 一次性探针：页面里 resources.load tiles.json，检查 scale 字段。 */
import { CdpClient } from "./lib.mjs";

const expr = `(async () => {
  const asset = await new Promise((resolve) => cc.resources.load("kits/slg/maps/senzhiguo/tiles", cc.JsonAsset, (e, a) => resolve(e ? "ERR:" + e.message : a)));
  if (typeof asset === "string") return asset;
  const j = asset.json;
  return JSON.stringify({ scale: j.scale, tile: j.tile, layers: j.layers.length, tiles: j.tiles.length, firstLayerCells: j.layers[0].cells.length });
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = tabs.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"));
const client = await CdpClient.connect(page.webSocketDebuggerUrl);
console.log(await client.evaluate(expr));
client.close();
