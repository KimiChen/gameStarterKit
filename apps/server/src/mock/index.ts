/**
 * mock 装配：扫描 api/<接口>.ts 自动挂载（default 导出 defineMock 的 {method, path, handler}）。
 *
 * 启动断言：路径必须带 mock 前缀（与真实接口天然隔离，真实端点⛔不得使用本前缀）、
 * method+path 不得重复。⚠ 依赖 tsx 直跑形态（运行时扫描 + 动态 import，同 websocket/loader.ts）。
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express, { type Application } from "express";
import type { MockEndpoint } from "./defineMock";

/** mock 专用路径前缀。 */
const MOCK_PREFIX = "/mock/";

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "api");

export async function registerMockRoutes(app: Application): Promise<void> {
    app.use(express.json());
    const seen = new Set<string>();
    const files = (await readdir(API_DIR))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
        .sort();
    for (const file of files) {
        const mod = await import(pathToFileURL(join(API_DIR, file)).href) as { default?: MockEndpoint };
        const ep = mod.default;
        if (!ep || !ep.method || !ep.path || typeof ep.handler !== "function") {
            throw new Error(`[mock] api/${file} 缺少 defineMock 的 default 导出`);
        }
        if (!ep.path.startsWith(MOCK_PREFIX)) {
            throw new Error(`[mock] ${ep.path} 必须以 ${MOCK_PREFIX} 开头（mock 与真实接口靠前缀隔离）`);
        }
        const key = `${ep.method} ${ep.path}`;
        if (seen.has(key)) {
            throw new Error(`[mock] 重复挂载: ${key}（api/${file}）`);
        }
        seen.add(key);
        app[ep.method](ep.path, ep.handler);
    }
}
