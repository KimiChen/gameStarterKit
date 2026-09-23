import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  CdpClient,
  consoleHookSource,
  pageWalkSource,
  selectNodes,
} from "./lib.mjs";
// This harness drives an official CLI web-mobile build, never the Creator editor.
// Run against an isolated, writable fixture: it ends a season and SIGKILLs its own server.
const { values: args } = parseArgs({
  options: {
    build: { type: "string" },
    "native-root": { type: "string" },
    profile: { type: "string" },
    "health-port": { type: "string" },
    chrome: { type: "string" },
    out: { type: "string" },
    help: { type: "boolean" },
  },
});
if (args.help) {
  console.log(
    "node tools/creator-preview/game-demo.mjs --build <web-mobile> --native-root <serverNew/server> --profile <JSON platform/version/sid> --health-port <port> [--chrome <binary>] [--out <directory>]\nThe native profile must point to isolated databases; no legacy server is started.",
  );
  process.exit(0);
}
for (const key of ["build", "native-root", "profile", "health-port"])
  assert.ok(args[key], `missing --${key}`);
const profileConfig = JSON.parse(args.profile);
assert.ok(
  /^[a-zA-Z0-9_-]+$/.test(profileConfig.platform) &&
    /^[a-zA-Z0-9_-]+$/.test(profileConfig.version),
);
assert.ok(Number.isSafeInteger(profileConfig.sid) && profileConfig.sid > 0);
const healthPort = Number(args["health-port"]);
assert.ok(Number.isInteger(healthPort) && healthPort > 0 && healthPort < 65536);
const require = createRequire(import.meta.url);
const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const nativeRoot = path.resolve(args["native-root"]);
const { createLocalWebPlatform } = require(
  path.join(nativeRoot, "scripts/verify/webplatform-local.cjs"),
);
const build = fs.realpathSync(args.build),
  run = Date.now().toString(36);
assert.ok(
  fs.existsSync(path.join(build, "index.html")),
  "--build must contain the official web-mobile index.html",
);
const out = path.resolve(
  args.out ?? path.join(os.tmpdir(), "gameDemo-cocos-" + run),
);
const chromeBinary =
  args.chrome ??
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert.ok(
  fs.existsSync(chromeBinary),
  "Chrome executable missing; use --chrome",
);
fs.mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
};
const children = [];
const browsers = [];
const profiles = [];
function start(label, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(out + "/" + label + ".log");
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push({ child, log, label });
  return child;
}
async function poll(fn, label, timeout = 60000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await delay(250);
  }
  throw new Error(label + ": " + (last?.stack ?? "timeout"));
}
const nativePort = await freePort();
const platform = createLocalWebPlatform({
  sid: profileConfig.sid,
  host: "127.0.0.1",
  gameHttpUrl: `http://127.0.0.1:${healthPort}`,
  gameWsUrl: `ws://127.0.0.1:${nativePort}`,
  areaName: "gameDemo CLI",
  serviceId: "game-ui-check",
  serviceSecret: "local-game-ui-" + run,
  log: () => {},
});
let client, staticServer;
const report = {
  run,
  out,
  build,
  nativeRoot,
  profile: profileConfig,
  steps: [],
  console: [],
  ok: false,
};
const profile = fs.mkdtempSync(
  path.join(os.tmpdir(), "gameDemo-cocos-browser-"),
);
try {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(healthPort, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  await platform.start({ publicPort: 0, internalPort: 0 });
  const env = {
    NODE_ENV: "development",
    AUTH_PROVIDER: "dev",
    CODEBUDDY_SAFE_DELETE_ENABLED: "0",
    WEBPLATFORM_INTERNAL_URL: platform.internalOrigin,
    WEBPLATFORM_SERVICE_ID: platform.serviceId,
    WEBPLATFORM_SERVICE_SECRET: platform.serviceSecret,
  };
  const launchNative = () =>
    start(
      "native-" + Date.now(),
      process.execPath,
      [
        "deploy/dev/entrypoint.cjs",
        "-p",
        profileConfig.platform,
        "-v",
        profileConfig.version,
        "--sid",
        String(profileConfig.sid),
      ],
      nativeRoot,
      {
        ...env,
        NATIVE_LOBBY_HOST: "127.0.0.1",
        NATIVE_LOBBY_PORT: String(nativePort),
        WEBPLATFORM_INTERNAL_ORIGIN: platform.internalOrigin,
        ALLOY_MULTI_PROCESS_ENABLED: "0",
        GAME_DEMO_DEV_TOOLS: "1",
      },
    );
  const waitNative = (child) =>
    poll(
      async () => {
        assert.equal(child.exitCode, null);
        try {
          const r = await fetch(`http://127.0.0.1:${healthPort}/health`);
          return r.status === 200;
        } catch {
          return false;
        }
      },
      "native ready",
      90000,
    );
  let native = launchNative();
  await waitNative(native);
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ttf": "font/ttf",
  };
  staticServer = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      build,
      "." + pathname + (pathname.endsWith("/") ? "index.html" : ""),
    );
    if (!file.startsWith(build + "/")) return res.writeHead(403).end();
    res.setHeader(
      "content-type",
      types[path.extname(file)] ?? "application/octet-stream",
    );
    fs.createReadStream(file)
      .on("error", () => res.writeHead(404).end())
      .pipe(res);
  });
  await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
  const chrome = start(
    "chrome",
    chromeBinary,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "about:blank",
    ],
    repo,
  );
  await poll(
    () => fs.existsSync(profile + "/DevToolsActivePort"),
    "browser ready",
  );
  const port = fs
    .readFileSync(profile + "/DevToolsActivePort", "utf8")
    .split("\n")[0];
  const tab = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  client = await CdpClient.connect(tab.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: consoleHookSource,
  });
  report.wire = [];
  client.on((event) => {
    if (event.method === "Network.webSocketFrameReceived") {
      try {
        const frame = JSON.parse(event.params.response.payloadData);
        report.wire.push({ at: Date.now(), player: 1, ...frame });
      } catch {}
    }
  });
  browsers.push(client);
  const url = new URL(`http://127.0.0.1:${staticServer.address().port}/`);
  url.search = new URLSearchParams({
    server: platform.publicOrigin,
    lobby: "native",
    lobbyUrl: `ws://127.0.0.1:${nativePort}`,
    devKey: "gdui-" + run,
  }).toString();
  await client.send("Page.navigate", { url: String(url) });
  const walk = () => client.evaluate(pageWalkSource);
  const fill = async (text) => {
    const input = await find({
      kind: "editbox",
      pathIncludes: "gameDemo竖屏",
    });
    await client.click(input.center.x, input.center.y);
    await delay(150);
    await client.evaluate("document.activeElement.select()");
    await client.send("Input.insertText", { text });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await delay(150);
  };
  const switchPlayer = async (who) => {
    client = browsers[who - 1];
    await client.send("Page.bringToFront");
    await delay(100);
  };
  const openSecond = async () => {
    const p = fs.mkdtempSync(path.join(os.tmpdir(), "gameDemo-cocos-peer-"));
    profiles.push(p);
    start(
      "chrome-peer",
      chromeBinary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${p}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
        "about:blank",
      ],
      repo,
    );
    await poll(
      () => fs.existsSync(p + "/DevToolsActivePort"),
      "peer browser ready",
    );
    const port2 = fs
      .readFileSync(p + "/DevToolsActivePort", "utf8")
      .split("\n")[0];
    const tab2 = await (
      await fetch(`http://127.0.0.1:${port2}/json/new?about:blank`, {
        method: "PUT",
      })
    ).json();
    client = await CdpClient.connect(tab2.webSocketDebuggerUrl);
    browsers.push(client);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: consoleHookSource,
    });
    client.on((event) => {
      if (event.method === "Network.webSocketFrameReceived") {
        try {
          report.wire.push({
            at: Date.now(),
            player: 2,
            ...JSON.parse(event.params.response.payloadData),
          });
        } catch {}
      }
    });
    const peerUrl = new URL(url);
    peerUrl.searchParams.set("devKey", "gdui-peer-" + run);
    await client.send("Page.navigate", { url: String(peerUrl) });
    await find({ name: "btn_login" });
    await click({ name: "btn_login" });
    await find({ text: "灵材商店" });
    await find({ textIncludes: "灵石 5000" });
    await shot("peer-initialized");
  };

  const find = async (query) =>
    poll(async () => {
      const w = await walk();
      return selectNodes(w, query)[0];
    }, JSON.stringify(query));
  const click = async (query) => {
    const n = await find(query);
    await client.click(n.center.x, n.center.y);
    await delay(300);
    return n;
  };
  const shot = async (label) => {
    const w = await walk();
    await client.screenshot(
      out + "/" + report.steps.length + "-" + label + ".png",
      { format: "png" },
    );
    report.steps.push({
      label,
      frames: w.frames,
      text: w.nodes.filter((n) => n.text).map((n) => n.text),
    });
    console.log(
      JSON.stringify({
        step: label,
        text: report.steps.at(-1).text.slice(-20),
      }),
    );
  };
  const go = async (name) => { await click({text:'更多'}); await click({text:name}); };
  const lastState = (player, bossId) => report.wire.filter(f=>f.player===player&&f.reply?.ok&&f.reply?.data?.room?.bossId===bossId).at(-1)?.reply.data;
  const boss = async (name) => { await click({text:'Boss'});await click({text:`进入${name}秘境`});await find({name:'选择Boss'}); };
  await find({ name: 'btn_login' }); await shot('login');
  await click({name:'btn_login'});await find({text:'灵材商店'});
  assert.equal(selectNodes(await walk(),{name:'PromoHomeView'}).length,0);
  await shot('portrait-shop');
  await find({text:'灵石 5000'});
  await click({text:'购买 ×10 · 100 灵石'});await click({text:'购买 ×10 · 200 灵石'});
  await find({text:'灵石 4700'});await shot('materials');
  await click({text:'炼丹'});await click({text:'炼制 5 炉'});await shot('alchemy-running');
  await find({textIncludes:'成品已收入行囊'});await shot('alchemy-claimed');
  await click({text:'英雄'});await shot('hero-before');
  const upgradeButtons=selectNodes(await walk(),{text:'使用 ×10'});
  const pills=(await find({textIncludes:'经验丹 '})).text.match(/经验丹 (\d+)\s+极品丹 (\d+)/);
  assert.equal(Number(pills[1])+Number(pills[2]),205);
  for(let i=0;i<upgradeButtons.length;i++){if(!Number(pills[i+1]))continue;const n=upgradeButtons[i];await client.click(n.center.x,n.center.y);await delay(400);}
  await poll(async()=>selectNodes(await walk(),{textIncludes:'Lv. '}).some(n=>!n.text.includes('Lv. 1')), 'hero upgraded');
  await shot('hero-upgraded');
  await go('活动榜');await shot('season');await click({text:'开发：提前结束活动'});await delay(2000);
  await click({text:'查看奖励邮件'});await find({textIncludes:'炼丹榜第 1 名奖励'});await shot('season-mail');await click({text:'领取'});await find({text:'灵石 5700'});await shot('mail-claimed');
  await go('仙盟');await fill('CLI'+run);await click({text:'创建仙盟'});await find({text:'1/3 人'});await shot('guild-created');
  await openSecond();await go('仙盟');const uid2=(await find({textIncludes:'我的 ID：'})).text.slice('我的 ID：'.length);
  await switchPlayer(1);await fill(uid2);await click({text:'邀请入盟'});await shot('guild-invited');if(selectNodes(await walk(),{text:'知道了'}).length)await click({text:'知道了'});
  await switchPlayer(2);await click({text:'刷新'});await click({text:'接受'});await find({text:'2/3 人'});await shot('guild-joined');
  await boss('蛟龙');await click({name:'选择Boss'});
  await poll(()=>lastState(2,'dragon')?.myDamage>0,'peer auto damage');await shot('dragon-auto');
  await switchPlayer(1);await boss('山君');await click({name:'选择Boss'});
  await poll(()=>lastState(1,'tiger')?.myDamage>0,'tiger auto damage');await shot('tiger-scene');
  await boss('炎凰');await click({name:'选择Boss'});
  await poll(()=>lastState(1,'phoenix')?.myDamage>0,'phoenix auto damage');await shot('phoenix-scene');
  await boss('蛟龙');await click({name:'选择Boss'});
  await poll(()=>lastState(1,'dragon')?.room.battle?.players.filter(p=>p.active).length>=2,'real multiplayer avatars');await shot('multiplayer-dragon');
  await poll(()=>lastState(1,'dragon')?.room.battle?.players.some(p=>p.hp===0),'player death');await shot('death');
  const fallen=lastState(1,'dragon').room.battle.players.filter(p=>p.hp===0).map(p=>p.uid);
  await poll(()=>fallen.every(uid=>lastState(1,'dragon')?.room.battle?.players.find(p=>p.uid===uid)?.hp>0),'fallen players revived');await shot('revived');
  await click({name:'伤害榜'});await shot('expanded-damage-rank');await click({text:'收起'});
  // Pause each actor before the exact-state crash comparison. Unit tests cover recovery of active/dead fighters.
  await click({name:'选择Boss'});await switchPlayer(2);await click({name:'选择Boss'});
  await poll(()=>lastState(2,'dragon')?.room.battle?.players.every(p=>!p.active||!p.autoAttack),'all actors paused');
  await poll(()=>lastState(2,'dragon')?.room.battle?.players.every(p=>!p.active||p.hp>0),'paused players revived');
  const beforeRestart=lastState(2,'dragon').room;
  const collectConsole=async()=>{for(let i=0;i<browsers.length;i++){const logs=await browsers[i].evaluate('(() => {const logs=window.__creatorPreviewLogs??[];window.__creatorPreviewLogs=[];return logs;})()');report.console.push(...logs.map(e=>({...e,player:i+1})));}};
  await collectConsole();
  const exited=new Promise(resolve=>native.once('exit',resolve));native.kill('SIGKILL');await exited;
  native=launchNative();await waitNative(native);await collectConsole();
  await client.send('Page.reload',{ignoreCache:true});await click({name:'btn_login'});await find({text:'灵材商店'});
  await delay(1000);if(selectNodes(await walk(),{text:'离线收益'}).length)await click({text:'确定'});
  await boss('蛟龙');await poll(()=>lastState(2,'dragon')?.room.ownerEpoch>beforeRestart.ownerEpoch,'new owner');
  const afterRestart=lastState(2,'dragon').room;
  for(const key of ['runId','hp','phase','damage'])assert.deepEqual(afterRestart[key],beforeRestart[key],`restored ${key}`);
  for(const p of beforeRestart.battle.players){const after=afterRestart.battle.players.find(a=>a.uid===p.uid);assert.equal(after.hp,p.hp);assert.equal(after.reviveAt,p.reviveAt);}
  report.restart={before:beforeRestart,after:afterRestart};await shot('boss-restored');
  await click({name:'选择Boss'});await poll(()=>lastState(2,'dragon')?.room.hp<afterRestart.hp,'continued after restart');await shot('boss-continued');
  await click({name:'选择Boss'});await click({text:'离开战场'});await find({text:'镇妖秘境'});
  for(const [width,height] of [[320,568],[430,932]]) {
    await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await client.send('Page.reload',{ignoreCache:true});await click({name:'btn_login'});await find({text:'灵材商店'});
    await delay(1200);if(selectNodes(await walk(),{text:'离线收益'}).length)await click({text:'确定'});
    await boss('山君');await shot(`portrait-${width}`);
    const w=await walk();assert.ok(Math.abs(w.canvas.width-width)<2);assert.ok(Math.abs(w.canvas.height-height)<2);
    const ui=w.nodes.filter(n=>n.text&&n.path.includes('gameDemo竖屏'));
    assert.ok(ui.every(n=>n.center.x>=0&&n.center.x<=width&&n.center.y>=0&&n.center.y<=height),'text centers remain on screen');
    await click({text:'离开战场'});
  }
  await collectConsole();
  const unexpected=report.console.filter(e=>['error','uncaught','rejection'].includes(e.level));
  assert.equal(unexpected.length,0,JSON.stringify(unexpected));
  report.ok = true;
} catch (error) {
  report.error = error?.stack ?? String(error);
  if (client) {
    try {
      report.failureScene = await client.evaluate(pageWalkSource);
      await client.screenshot(path.join(out, "failure.png"), { format: "png" });
    } catch {}
  }
  throw error;
} finally {
  for (const c of browsers) {
    try {
      report.console = (report.console ?? []).concat(
        await c.evaluate("window.__creatorPreviewLogs ?? []"),
      );
    } catch {}
    c.close();
  }
  for (const h of children.reverse()) {
    if (h.child.exitCode === null && h.child.signalCode === null) {
      const exited = new Promise((r) => h.child.once("exit", r));
      h.child.kill("SIGTERM");
      const timer = setTimeout(() => h.child.kill("SIGKILL"), 12000);
      await exited;
      clearTimeout(timer);
    }
    h.log.end();
  }
  if (staticServer) await new Promise((r) => staticServer.close(r));
  await platform.stop();
  fs.rmSync(profile, { recursive: true, force: true });
  for (const p of profiles) fs.rmSync(p, { recursive: true, force: true });
  fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      out,
      ok: report.ok,
      console: report.console?.slice(0, 3),
    }),
  );
}
