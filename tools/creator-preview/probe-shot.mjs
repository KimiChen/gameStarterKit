/** 一次性：截图当前页（所有 7456 tab）。 */
import { CdpClient } from "./lib.mjs";

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
let i = 0;
for (const p of tabs.filter((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:7456"))) {
  const c = await CdpClient.connect(p.webSocketDebuggerUrl);
  try {
    await c.screenshot(`/tmp/slg-shot-${i}-${p.id.slice(0, 8)}.jpg`);
    console.log(`/tmp/slg-shot-${i}-${p.id.slice(0, 8)}.jpg`);
    i += 1;
  } catch (e) { console.log(p.id.slice(0, 8), "ERR", e.message); }
  c.close();
}
