/** 一次性实验：只显示 chunk-50-47，canvas 像素回读。 */
import fs from "node:fs";
import { CdpClient } from "./lib.mjs";

const probe = `(async () => {
  const scene = cc.director.getScene();
  let tl = null, chunk = null;
  const find = (n) => {
    if (n.name === "slg-terrain-layer") tl = n;
    if (n.name === "slg-chunk-50-47") chunk = n;
    for (const c of n.children) find(c);
  };
  find(scene);
  if (!tl || !chunk) return "missing";
  for (const c of tl.children) c.active = (c === chunk);
  // 等两帧后读 canvas
  await new Promise((r) => setTimeout(r, 300));
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const w = 256, h = 256;
  const px = new Uint8Array(w * h * 4);
  // 从 framebuffer 中心读一块
  gl.readPixels(Math.floor(canvas.width / 2 - w / 2), Math.floor(canvas.height / 2 - h / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = [0, 0, 0, 0];
  for (let i = 0; i < px.length; i += 4) { sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; sum[3] += px[i + 3]; }
  const n = px.length / 4;
  return JSON.stringify({ canvas: [canvas.width, canvas.height], avgRGBA: sum.map((s) => Math.round(s / n)) });
})()`;

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    const has = await c.evaluate(`(() => { try { const s = cc.director.getScene(); return !!s && !!s.getChildByName("Canvas"); } catch { return false; } })()`);
    if (!has) { c.close(); continue; }
    console.log(p.id.slice(0, 8), await c.evaluate(probe));
    await c.screenshot(`/tmp/slg-one-chunk-${p.id.slice(0, 8)}.jpg`);
    console.log(`/tmp/slg-one-chunk-${p.id.slice(0, 8)}.jpg`);
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
