#!/usr/bin/env node
/**
 * 从真实 Cocos Creator 3.8.8 预览的 RenderTexture 读取 UniFlex 页面。
 *
 * Page.captureScreenshot 会截到 Creator 预览壳，且尺寸受浏览器窗口影响；
 * 本工具改为让 Cocos 相机直接渲染到契约尺寸的 RenderTexture，再在页面内
 * 将 RGBA 像素编码为 PNG，因此不会把工具栏或非等比缩放带进 Golden。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CdpClient,
  DEFAULTS,
  acquireTab,
  openScene,
  sceneUuidFromMeta,
} from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv) {
  const options = {
    out: null,
    preview: DEFAULTS.preview,
    devtools: DEFAULTS.devtools,
    scene: null,
    screen: "backpack",
    width: null,
    height: null,
    bootTimeoutMs: DEFAULTS.bootTimeoutMs,
    reuse: false,
  };
  const take = (name, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} 需要参数`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") options.out = take(arg, i++);
    else if (arg === "--preview") options.preview = take(arg, i++);
    else if (arg === "--devtools") options.devtools = take(arg, i++);
    else if (arg === "--scene") options.scene = take(arg, i++);
    else if (arg === "--screen") options.screen = take(arg, i++);
    else if (arg === "--width") options.width = positiveInt(arg, take(arg, i++));
    else if (arg === "--height") options.height = positiveInt(arg, take(arg, i++));
    else if (arg === "--boot-timeout") options.bootTimeoutMs = positiveInt(arg, take(arg, i++));
    else if (arg === "--reuse") options.reuse = true;
    else if (arg === "--help" || arg === "-h") return { help: true };
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
}

function positiveInt(name, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} 需要正整数`);
  return number;
}

/** 页面内执行：Cocos camera -> RenderTexture -> ImageData -> PNG data URL。 */
function captureSource(width, height) {
  return `(async () => {
    if (typeof cc === "undefined" || !cc.director?.getScene()) throw new Error("Cocos 场景尚未就绪");
    const scene = cc.director.getScene();
    const camera = scene.getComponentsInChildren(cc.Camera).find((item) =>
      item.enabledInHierarchy && item.targetTexture === null);
    if (!camera) throw new Error("没有找到可用的 Cocos UI Camera");
    const texture = new cc.RenderTexture("uniflex-golden-capture");
    texture.reset({ width: ${width}, height: ${height} });
    const previous = camera.targetTexture;
    camera.targetTexture = texture;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          cc.director.off(cc.Director.EVENT_AFTER_DRAW, finish);
          resolve();
        };
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          cc.director.off(cc.Director.EVENT_AFTER_DRAW, finish);
          reject(new Error("等待 Cocos RenderTexture 渲染完成超时"));
        }, 10000);
        cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
          clearTimeout(timeout);
          finish();
        });
      });
      const pixels = texture.readPixels(0, 0, ${width}, ${height}, new Uint8Array(${width * height * 4}));
      if (!pixels || pixels.length !== ${width * height * 4}) {
        throw new Error("RenderTexture.readPixels 返回空或尺寸错误");
      }
      const canvas = document.createElement("canvas");
      canvas.width = ${width};
      canvas.height = ${height};
      const context = canvas.getContext("2d", { alpha: true });
      const image = context.createImageData(${width}, ${height});
      // GPU 原点在左下，ImageData 原点在左上。
      for (let y = 0; y < ${height}; y += 1) {
        const source = (${height} - 1 - y) * ${width} * 4;
        image.data.set(pixels.subarray(source, source + ${width} * 4), y * ${width} * 4);
      }
      context.putImageData(image, 0, 0);
      return { width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL("image/png") };
    } finally {
      camera.targetTexture = previous;
      texture.destroy();
    }
  })()`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("用法：node tools/creator-preview/capture-uniflex-golden.mjs --out <png> [--screen backpack] [--reuse]");
    return 0;
  }
  const packagePath = path.join(ROOT, "apps/client/resources/ui", options.screen, "design.json");
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const width = options.width ?? manifest.canvas?.width;
  const height = options.height ?? manifest.canvas?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error("页面清单缺少合法 canvas 尺寸");
  const sceneUuid = options.scene ?? sceneUuidFromMeta(
    fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/uniflex.scene.meta"), "utf8"),
  );
  const out = path.resolve(options.out ?? path.join(os.tmpdir(), `uniflex-${options.screen}-cocos.png`));
  let tab;
  try {
    tab = await acquireTab(options);
  } catch (error) {
    throw new Error(
      `无法连接 Chrome DevTools ${options.devtools}；请用 Chrome 9222 启动可见预览标签页。${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }
  const client = await CdpClient.connect(tab.wsUrl);
  try {
    try {
      await openScene(client, {
        preview: options.preview,
        sceneUuid,
        timeoutMs: options.bootTimeoutMs,
        query: { screen: options.screen },
      });
    } catch (error) {
      const state = await client.evaluate(`(() => ({
        url: location.href,
        engine: typeof cc === "undefined" ? null : (cc.ENGINE_VERSION || null),
        scene: typeof cc === "undefined" || !cc.director ? null : (cc.director.getScene()?.name || null),
        frames: typeof cc === "undefined" || !cc.director ? null : cc.director.getTotalFrames(),
      }))()`).catch(() => null);
      const suffix = state
        ? ` 当前页面=${state.url}，引擎=${state.engine ?? "unknown"}，scene=${state.scene ?? "null"}，frames=${state.frames ?? "unknown"}`
        : "";
      throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
    }
    const result = await client.evaluate(captureSource(width, height));
    if (result.width !== width || result.height !== height) {
      throw new Error(`Cocos RenderTexture 尺寸错误：${result.width}x${result.height}，契约 ${width}x${height}`);
    }
    const match = /^data:image\/png;base64,(.+)$/u.exec(result.dataUrl);
    if (!match) throw new Error("Cocos 未返回 PNG data URL");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(match[1], "base64"));
    console.log(`Cocos Golden: ${out} (${result.width}x${result.height})`);
  } finally {
    client.close();
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`Cocos Golden failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
