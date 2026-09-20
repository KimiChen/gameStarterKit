#!/usr/bin/env node
/**
 * P8-③ 的一键复现：把「本地 WebPlatform 副本 + serverNew 原生 Lobby + Creator GUI 驱动」
 * 三件事按正确次序串起来，退出时回收全部子进程。
 *
 * 为什么要有这个脚本：这条链路有三个进程和两个必须先就绪的前置（副本要能签发，
 * 服务进程要能回源复验），手敲三条命令很容易把次序搞错——而次序搞错的表现是
 * 「客户端认证失败」，会把注意力引向客户端。所以复现入口只留一个。
 *
 * 前置（外部进程，脚本只检测不代起）：
 *  - Redis 127.0.0.1:6379 与 MySQL 127.0.0.1:3306（`bearjoylive` 线路用 db 9/8/7）
 *  - Creator 3.8.8 已打开 apps/Cocos 且预览服务在 `--preview`（默认 7458）
 *  - Chrome 以 `--remote-debugging-port=9222` 启动
 *
 * 旧 `apps/server`（2568）由本脚本按需代起（`--old-server auto|skip`）：客户端选服后的 HTTP
 * 仍走它，缺了它 GUI 侧会看到一屏 404 而不是「原生通道有问题」。
 *
 * 用法：
 *   node tools/creator-preview/native-lobby-stack.mjs --secret <gmSecret> [--skip-gui] [--out <dir>] [其余参数转给驱动]
 *
 * 退出码 = GUI 驱动的退出码（`--skip-gui` 时只做就绪探测）。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER_NEW_ROOT = path.join(REPO_ROOT, "apps", "serverNew", "server");
const RUN_ID = `${Date.now().toString(36)}`;

function parseArgv(argv) {
  const options = {
    portalPort: 2570,
    internalPort: 2571,
    nativePort: 18091,
    sid: 1,
    secret: null,
    serviceId: "game-gui-native",
    serviceSecret: "gui-native-secret",
    gameHttp: "http://127.0.0.1:2568",
    gameWs: "ws://127.0.0.1:2568",
    preview: "http://127.0.0.1:7458",
    devtools: "http://127.0.0.1:9222",
    out: null,
    skipGui: false,
    oldServer: "auto",
    passthrough: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    const take = () => {
      index += 1;
      return next;
    };
    switch (key) {
      case "portal-port": options.portalPort = Number(take()); break;
      case "internal-port": options.internalPort = Number(take()); break;
      case "native-port": options.nativePort = Number(take()); break;
      case "sid": options.sid = Number(take()); break;
      case "secret": options.secret = take(); break;
      case "service-id": options.serviceId = take(); break;
      case "service-secret": options.serviceSecret = take(); break;
      case "game-http": options.gameHttp = take(); break;
      case "game-ws": options.gameWs = take(); break;
      case "preview": options.preview = take(); break;
      case "devtools": options.devtools = take(); break;
      case "out": options.out = take(); break;
      case "skip-gui": options.skipGui = true; break;
      case "old-server": options.oldServer = take(); break;
      default: options.passthrough.push(token, ...(next !== undefined && !next.startsWith("--") ? [take()] : []));
    }
  }
  return options;
}

const logDir = path.join(SERVER_NEW_ROOT, "log", "verify");
fs.mkdirSync(logDir, { recursive: true });

function start(label, command, args, cwd, env) {
  const logPath = path.join(logDir, `native-lobby-stack.${label}.${RUN_ID}.log`);
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const tail = [];
  const mirror = (chunk) => {
    stream.write(chunk);
    for (const line of String(chunk).split("\n")) {
      if (!line.trim()) continue;
      tail.push(line);
      if (tail.length > 80) tail.shift();
    }
  };
  child.stdout.on("data", mirror);
  child.stderr.on("data", mirror);
  return { label, child, tail, logPath };
}

async function stop(handle) {
  if (!handle || handle.child.exitCode !== null) return;
  handle.child.kill("SIGTERM");
  const deadline = Date.now() + 8000;
  while (handle.child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tcpReachable(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

/** 运营下线入口的探测请求：不在线的 uid 必须回 `kicked:false`，用它当「链路已通」的判据。 */
async function internalAction(origin, secret, payload) {
  const response = await fetch(new URL("/internal/action", origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new Error(`内部动作入口返回了非 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }
}

async function waitFor(label, handle, probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "未开始";
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null)
      throw new Error(`${label} 提前退出（code=${handle.child.exitCode}），日志尾部：\n${handle.tail.slice(-25).join("\n")}`);
    try {
      const value = await probe();
      if (value) return value;
      lastError = "探针返回假值";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(
    `等待 ${label} 就绪超时（${timeoutMs} ms），最后错误：${lastError}\n日志：${handle.logPath}\n尾部：\n${handle.tail.slice(-25).join("\n")}`,
  );
}

async function main() {
  const options = parseArgv(process.argv.slice(2));
  if (!options.secret) throw new Error("--secret 必填（联调线路 platform.json5 的 gmSecret，内部动作入口的唯一鉴权）");
  const portalOrigin = `http://127.0.0.1:${options.portalPort}`;
  const internalOrigin = `http://127.0.0.1:${options.internalPort}`;
  const lobbyUrl = `ws://127.0.0.1:${options.nativePort}`;

  for (const [port, label, hint] of [
    [6379, "Redis", "启动本机 redis-server（联调线路用 db 9/8/7）"],
    [3306, "MySQL", "启动本机 mysqld"],
  ]) {
    if (!(await tcpReachable(port))) throw new Error(`前置不成立：${label} 127.0.0.1:${port} 不可达——${hint}`);
  }
  let oldServer = null;
  if (!(await tcpReachable(2568))) {
    if (options.oldServer === "skip")
      throw new Error("前置不成立：旧 apps/server 未在 2568（客户端选服后的 HTTP 仍走它），且 --old-server=skip");
    // 客户端选服后的 HTTP（公告、兑换码…）仍走旧服务，所以它必须在场；否则 GUI 侧会看到
    // 一屏 404 而不是「原生通道有问题」。它同时也是 GameRoom 回归那条链的服务端。
    oldServer = start(
      "oldserver",
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      path.join(REPO_ROOT, "apps", "server"),
      {
        PORT: "2568",
        NODE_ENV: "development",
        AUTH_PROVIDER: "dev",
        CODEBUDDY_SAFE_DELETE_ENABLED: "0",
      },
    );
    await waitFor("旧 apps/server", oldServer, async () => {
      const response = await fetch("http://127.0.0.1:2568/v1/areas");
      return response.status === 200;
    }, 120_000);
  }

  const platform = start(
    "webplatform",
    process.execPath,
    [
      path.join(SERVER_NEW_ROOT, "scripts", "verify", "webplatform-local.cjs"),
      "--sid", String(options.sid),
      "--public-port", String(options.portalPort),
      "--internal-port", String(options.internalPort),
      "--game-http", options.gameHttp,
      "--game-ws", options.gameWs,
      "--service-id", options.serviceId,
      "--service-secret", options.serviceSecret,
    ],
    SERVER_NEW_ROOT,
    {},
  );
  const server = start(
    "servernew",
    process.execPath,
    [path.join("deploy", "dev", "entrypoint.cjs"), "-p", "bearjoy", "-v", "live", "--sid", String(options.sid)],
    SERVER_NEW_ROOT,
    {
      NATIVE_LOBBY_HOST: "127.0.0.1",
      NATIVE_LOBBY_PORT: String(options.nativePort),
      WEBPLATFORM_INTERNAL_ORIGIN: internalOrigin,
      WEBPLATFORM_SERVICE_ID: options.serviceId,
      WEBPLATFORM_SERVICE_SECRET: options.serviceSecret,
      ALLOY_MULTI_PROCESS_ENABLED: "0",
      CODEBUDDY_SAFE_DELETE_ENABLED: "0",
    },
  );

  try {
    console.log(`本地 WebPlatform 副本：${portalOrigin}（Internal ${internalOrigin}）`);
    await waitFor("本地 WebPlatform 副本", platform, async () => {
      const response = await fetch(`${portalOrigin}/v1/areas`);
      return response.status === 200;
    }, 30_000);

    console.log(`serverNew 原生 Lobby：${lobbyUrl}（内网 HTTP http://127.0.0.1:28090）`);
    await waitFor("serverNew 原生 Lobby", server, async () => {
      if (!(await tcpReachable(options.nativePort))) return false;
      const probe = await internalAction(`http://127.0.0.1:28090`, options.secret, {
        type: "lobbyKick",
        actionParams: { uid: `stack-probe-${RUN_ID}`, sId: options.sid },
      });
      return probe.status === 200 && probe.body?.code === 0 && probe.body?.data?.json?.kicked === false;
    }, 180_000);

    if (options.skipGui) {
      console.log("✔ 两个进程均就绪（--skip-gui，不驱动 GUI）");
      return 0;
    }

    const args = [
      path.join(REPO_ROOT, "tools", "creator-preview", "native-lobby.mjs"),
      "--portal", portalOrigin,
      "--lobby-url", lobbyUrl,
      "--internal", "http://127.0.0.1:28090",
      "--secret", options.secret,
      "--sid", String(options.sid),
      "--preview", options.preview,
      "--devtools", options.devtools,
      ...(options.out ? ["--out", options.out] : []),
      ...options.passthrough,
    ];
    console.log(`驱动 Creator 预览：node ${path.relative(REPO_ROOT, args[0])} ${args.slice(1).join(" ")}`);
    const gui = spawn(process.execPath, args, { cwd: REPO_ROOT, stdio: "inherit" });
    const code = await new Promise((resolve) => gui.once("exit", (value) => resolve(value ?? 1)));
    return code;
  } finally {
    await stop(server);
    await stop(platform);
    await stop(oldServer);
    console.log(`服务日志：${server.logPath}`);
    console.log(`副本日志：${platform.logPath}`);
    if (oldServer) console.log(`旧服日志：${oldServer.logPath}`);
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
