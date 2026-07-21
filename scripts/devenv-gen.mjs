/**
 * devEnv.ts 生成逻辑（从 sync-client.mjs 抽出，供其调用 + 单测直测）。
 *
 * PORT 解析语义**逐条复刻服务端**（config.ts 的根 env 加载器 + env() + 严格校验），
 * ⛔ 双侧不许各自「容错」——历史教训两则：
 *  - parseInt 截断 vs 纯数字正则回退默认：`PORT=2599junk` 双端端口静默脑裂；
 *  - 覆盖式循环 vs fill-missing：重复声明时服务端取第一条、生成器取最后一条。
 * 统一后的语义（与服务端 loader 完全一致）：
 *  1. 同名键**第一条声明生效**（含空值声明——`PORT=` 占位后后续声明同样被忽略）；
 *  2. 空值 = 未设置 → 默认 2568（env() 的通用语义）；
 *  3. 非空非法（非纯整数或超 1–65535）→ throw，同步/校验全失败。
 * 机检：apps/client/test/devEnvGen.test.ts 用例逐条钉死上述语义。
 */
import fs from "node:fs";

export const DEFAULT_PORT = 2568;

/** 解析 env 文件中的 PORT（语义见文件头）。文件不存在 → 默认。 */
export function devEnvPort(envFile) {
    let raw;
    try {
        raw = fs.readFileSync(envFile, "utf8");
    } catch {
        return DEFAULT_PORT; // 无根 env 文件 = 默认（与服务端 config.ts 一致）
    }
    for (const line of raw.split("\n")) {
        if (line.trimStart().startsWith("#")) continue;
        const m = /^\s*PORT\s*=\s*(.*?)\s*$/.exec(line);
        if (!m) continue;
        // 第一条声明生效（服务端 loader 是 fill-missing：首条写入后后续跳过）
        if (m[1] === "") return DEFAULT_PORT; // 空值 = 未设置 → 默认（env() 语义）
        const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
            throw new Error(`[devenv-gen] 根 .env.development 的 PORT 非法：「${m[1]}」——须为 1–65535 的纯整数（服务端 config.ts 同一规则）`);
        }
        return n;
    }
    return DEFAULT_PORT;
}

/** 生成 devEnv.ts 全文。 */
export function devEnvContent(envFile) {
    const port = devEnvPort(envFile);
    return `/**
 * ⚠ 生成物勿手改 —— 真源：根 .env.development 的 PORT（缺省 ${DEFAULT_PORT}，与服务端 config.ts 同源）。
 * \`npm run sync:client\` / dev:client 保存时重生成；verify:sync（--check）校验新鲜度。
 * 场景里 Main 组件 serverUrl **留空即用本值**；填写可覆盖（远程/真机调试）。
 */
export const DEV_SERVER_PORT = ${port};
export const DEV_SERVER_URL = \`http://localhost:\${DEV_SERVER_PORT}\`;
`;
}
