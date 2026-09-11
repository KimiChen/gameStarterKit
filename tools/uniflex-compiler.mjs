#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { arch, platform } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = `${platform}-${arch}`;
const bundled = resolve(root, "vendor/uniflex/bin", target, "uniflex-compiler");
const executable = process.env.UNIFLEX_COMPILER
    ? resolve(process.env.UNIFLEX_COMPILER)
    : bundled;

if (!existsSync(executable)) {
    const hint = process.env.UNIFLEX_COMPILER
        ? `UNIFLEX_COMPILER 指向的文件不存在：${executable}`
        : `仓库未包含 ${target} 制品：${bundled}。请补充该平台的 uniflex-compiler，或显式设置 UNIFLEX_COMPILER。`;
    console.error(`[uniflex-compiler] ${hint}`);
    process.exit(1);
}

const result = spawnSync(executable, process.argv.slice(2), {
    cwd: root,
    stdio: "inherit",
});

if (result.error) {
    console.error(`[uniflex-compiler] 无法启动 ${target} 制品：${result.error.message}`);
    process.exitCode = 1;
} else {
    process.exitCode = result.status ?? 1;
}
