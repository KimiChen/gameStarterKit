#!/usr/bin/env node
/**
 * Excel 导表工具（通用核）
 *
 * 收编自 Arthur 项目 tools/excel-to-json.mjs：剔除了 Arthur 七张玩法表
 * （summonPool/forceLevel/weapon/talisman 等）的专用 build/校验逻辑，
 * 只保留可复用的通用核，并用一张示例表 items.xlsx（道具表）演示全部解析助手。
 * 接入真实项目时：改 sourceFiles 映射 + 替换 buildItems 为自己的表构建函数即可。
 *
 * 通用核清单：
 *  - 三行表头约定读取（第 1 行字段名、第 2 行类型、第 3 行中文说明，第 4 行起数据）
 *  - 字段助手：text / numberValue / getField（字段别名兜底）
 *  - 复合字段解析：parseDelimitedNumbers（a_b_c 数字列表）、parsePairs（id&value_id&value）
 *  - --check 模式：只校验不写文件，出错 exit 1，可直接进 CI
 *  - 双输出：服务端权威配置（apps/server/data）+ 客户端展示配置（resources/config，
 *    裁掉服务端敏感字段——权重/价格绝不能只在客户端，服务端权威是抽卡/结算的前提）
 *  - 输出带 schemaVersion + sourceFiles 溯源，结束时打印行数 summary
 *  - 可选 --assets-root 资源存在性校验（缺省跳过校验、保留归一化后的原始路径）
 *
 * 依赖：xlsx（由使用者在根 package.json 安装：npm i -D xlsx@^0.18.5）。
 * 本脚本用动态 import 加载，未安装时给出清晰提示而不是原始堆栈。
 *
 * 用法：
 *  node tools/excel-to-json.mjs                    # 读 tools/excel-config/*.xlsx，双写 JSON
 *  node tools/excel-to-json.mjs --check            # 只校验不写文件（CI 用）
 *  node tools/excel-to-json.mjs --input=<目录>     # 覆盖输入目录
 *  node tools/excel-to-json.mjs --output=<文件>    # 覆盖服务端输出路径
 *  node tools/excel-to-json.mjs --client-output=<文件> / --no-client-output
 *  node tools/excel-to-json.mjs --assets-root=<目录>  # 开启 icon 等资源路径存在性校验
 *
 * 输入约定详见 tools/excel-config/README.md。
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 输入默认 tools/excel-config；双输出 = 服务端权威 + 客户端展示（裁剪版）
const defaultInputDir = path.join(ROOT, "tools", "excel-config");
const defaultOutputFile = path.join(ROOT, "apps", "server", "data", "items.config.json");
const defaultClientOutputFile = path.join(ROOT, "apps", "client", "assets", "resources", "config", "items.json");

// 只在这里声明参与导表的源文件；增减配置表先改这份映射，输出 JSON 也会记录来源。
const sourceFiles = {
    items: "items.xlsx",
};

// xlsx 为 CJS 包，动态 import 便于在未安装时拦截报错（ESM 静态 import 失败无法 catch）。
let XLSX = null;

async function loadXlsx() {
    try {
        const mod = await import("xlsx");
        return mod.default ?? mod;
    } catch (error) {
        if (error?.code === "ERR_MODULE_NOT_FOUND") {
            console.error("[excel-to-json] 缺少依赖 xlsx，请先在仓库根目录执行：npm i -D xlsx@^0.18.5");
            process.exit(1);
        }
        throw error;
    }
}

// 支持命令行覆盖输入输出路径，便于本地检查、CI 校验和临时导出到其他目录。
function parseArgs() {
    const result = {
        inputDir: defaultInputDir,
        outputFile: defaultOutputFile,
        clientOutputFile: defaultClientOutputFile,
        syncClient: true,
        checkOnly: false,
        assetsRoot: null,
    };

    for (const arg of process.argv.slice(2)) {
        if (arg === "--check") {
            result.checkOnly = true;
        } else if (arg === "--no-client-output") {
            result.syncClient = false;
        } else if (arg.startsWith("--input=")) {
            result.inputDir = path.resolve(ROOT, arg.slice("--input=".length));
        } else if (arg.startsWith("--output=")) {
            result.outputFile = path.resolve(ROOT, arg.slice("--output=".length));
        } else if (arg.startsWith("--client-output=")) {
            result.clientOutputFile = path.resolve(ROOT, arg.slice("--client-output=".length));
        } else if (arg.startsWith("--assets-root=")) {
            result.assetsRoot = path.resolve(arg.slice("--assets-root=".length));
        } else {
            throw new Error(`未知参数：${arg}`);
        }
    }

    return result;
}

// ---------- 通用字段助手 ----------

function toSlash(value) {
    return value.replace(/\\/g, "/");
}

function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === "";
}

function text(value) {
    return isBlank(value) ? "" : String(value).trim();
}

/** 解析数字单元格；默认要求整数（options.integer=false 放开），options.allowBlank 时空值返回 null */
function numberValue(value, context, errors, options = {}) {
    if (isBlank(value)) {
        if (options.allowBlank) return null;
        errors.push(`${context} 不能为空`);
        return 0;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        errors.push(`${context} 必须是数字，当前值：${value}`);
        return 0;
    }

    if (options.integer !== false && !Number.isInteger(parsed)) {
        errors.push(`${context} 必须是整数，当前值：${value}`);
    }

    return parsed;
}

/** 字段别名兜底：按 [正式名, ...曾用名] 的顺序取第一个存在的列，供表头改名过渡期兼容 */
function getField(row, fieldName, aliases = []) {
    for (const name of [fieldName, ...aliases]) {
        if (Object.prototype.hasOwnProperty.call(row, name)) {
            return row[name];
        }
    }
    return undefined;
}

/** 错误/警告统一以「文件名 第 N 行」定位，N 是 Excel 里的真实行号（数据从第 4 行开始） */
function formatSource(sourceName, rowIndex) {
    return `${sourceName} 第 ${rowIndex} 行`;
}

// 资源路径归一化：反斜杠转正斜杠、折叠重复斜杠、去掉开头斜杠。
// （Arthur 原版还有 Laya 工程的 assets/resources 前缀改写，属项目专用规则，此处不保留。）
function normalizeAssetPath(value) {
    let normalized = text(value).replace(/\\/g, "/").replace(/\/+/g, "/");
    normalized = normalized.replace(/^\/+/, "");
    return normalized;
}

// ---------- 复合字段解析 ----------

// 解析 1_3_5 这类下划线分隔的纯数字列表（如标签 ID、解锁 ID 列表）。
function parseDelimitedNumbers(value, context, errors) {
    if (isBlank(value)) return [];

    return text(value)
        .split("_")
        .filter((part) => part.length > 0)
        .map((part, index) => numberValue(part, `${context} 第 ${index + 1} 项`, errors));
}

// 解析 id&value_id&value 这类复合字段（奖励、权重、消耗等都可复用同一基础格式）。
// pairName 用于报错文案（如“奖励”→「奖励ID / 奖励数值」）；options.valueOptions 透传给数值解析。
function parsePairs(value, context, errors, pairName, options = {}) {
    if (isBlank(value)) return [];

    return text(value)
        .split("_")
        .filter((part) => part.length > 0)
        .map((part, index) => {
            const [rawId, rawCount, ...extra] = part.split("&");
            const itemContext = `${context} 第 ${index + 1} 项`;
            if (extra.length > 0 || isBlank(rawId) || isBlank(rawCount)) {
                errors.push(`${itemContext} 格式必须是 id&数值，当前值：${part}`);
            }

            return {
                id: numberValue(rawId, `${itemContext} ${pairName}ID`, errors),
                value: numberValue(rawCount, `${itemContext} ${pairName}数值`, errors, options.valueOptions ?? {}),
            };
        });
}

// ---------- Excel 读取 ----------

// 按统一三行表头格式读取首个 sheet：第 1 行是字段名，第 2、3 行（类型/中文说明）只给
// 策划看、脚本跳过不读，数据从第 4 行开始；每行转换成以字段名索引的 record，空行剔除。
function readRows(inputDir, fileName, requiredFields) {
    const filePath = path.join(inputDir, fileName);
    if (!fsSync.existsSync(filePath)) {
        throw new Error(`配置表不存在：${filePath}\n  （约定文件名见 tools/excel-config/README.md，或用 --input= 指定其他目录）`);
    }

    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const headers = (matrix[0] ?? []).map((header) => text(header));
    const missingFields = requiredFields.filter((field) => !headers.includes(field));

    if (missingFields.length > 0) {
        throw new Error(`${fileName} 缺少字段：${missingFields.join(", ")}`);
    }

    return matrix
        .slice(3)
        .map((row, index) => {
            const record = {};
            for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
                const header = headers[columnIndex];
                if (!header) continue;
                record[header] = row[columnIndex] ?? null;
            }
            return {
                rowIndex: index + 4, // Excel 真实行号，方便策划直接定位
                record,
            };
        })
        .filter(({ record }) => Object.values(record).some((value) => !isBlank(value)));
}

function assertUniqueIds(rows, idField, sourceName, errors) {
    const seen = new Set();
    for (const { rowIndex, record } of rows) {
        const id = text(record[idField]);
        if (!id) continue;
        if (seen.has(id)) errors.push(`${formatSource(sourceName, rowIndex)} ${idField} 重复：${id}`);
        seen.add(id);
    }
}

// ---------- 示例表：道具表 items ----------
// 一张表演示全部解析助手：number / string / a_b_c 列表 / id&value 复合 / 别名兜底 / 资源路径。
// 替换成真实玩法表时删掉本函数，按同样的「逐行解析 + errors 收集」模式写自己的 buildXxx。

function buildItems(rows, assetsRoot, errors, warnings) {
    // 字段别名兜底示例：icon 曾用名 pic，旧表可继续导出，但提示策划尽快改名。
    // 列的有无对全表统一（readRows 按表头行建 record），所以只需检查一次、警告一条。
    const firstRecord = rows[0]?.record ?? {};
    if (!Object.prototype.hasOwnProperty.call(firstRecord, "icon")
        && Object.prototype.hasOwnProperty.call(firstRecord, "pic")) {
        warnings.push(`${sourceFiles.items} 仍在使用旧字段 pic 表示图标路径，建议改名为 icon`);
    }

    return rows
        .map(({ rowIndex, record }) => {
            const context = formatSource(sourceFiles.items, rowIndex);

            const name = text(record.name);
            if (!name) {
                errors.push(`${context} name 不能为空`);
            }

            const rawIcon = getField(record, "icon", ["pic"]);

            // 缺省只做归一化并保留原始路径；传了 --assets-root 才做存在性校验（缺图在 CI 拦下）。
            const icon = normalizeAssetPath(rawIcon);
            if (assetsRoot && icon && !fsSync.existsSync(path.join(assetsRoot, icon))) {
                errors.push(`${context} icon 资源不存在：${icon}（校验根目录 ${assetsRoot}）`);
            }

            const price = numberValue(record.price, `${context} price`, errors);
            if (price < 0) {
                errors.push(`${context} price 不能小于 0，当前值：${price}`);
            }

            return {
                id: numberValue(record.id, `${context} id`, errors),
                name,
                desc: text(record.desc),
                icon,
                price, // 服务端权威字段，客户端输出会裁掉（见 toClientData）
                tags: parseDelimitedNumbers(record.tags, `${context} tags`, errors),
                reward: parsePairs(record.reward, `${context} reward`, errors, "奖励"),
            };
        })
        .sort((a, b) => a.id - b.id);
}

// 双输出裁剪：price 这类定价/结算依据只留在服务端权威配置里，
// 客户端展示配置不下发——防抓包改包，也避免客户端误把展示值当结算值用。
function toClientData(data) {
    return {
        ...data,
        items: data.items.map(({ price, ...rest }) => rest),
    };
}

// 输出 JSON 固定 UTF-8 + 两空格缩进 + 末尾换行，便于版本比对和人工排查。
async function writeJson(outputFile, data) {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// 主流程保持「读取 → 解析 → 校验 → 输出」的顺序；出现错误就中断（不写任何文件），警告不阻塞导出。
async function run() {
    const args = parseArgs();
    XLSX = await loadXlsx();

    // 输入目录没有任何 xlsx 时必须明确失败（--check 同理），静默成功会掩盖“表根本没放进来”。
    const inputFiles = fsSync.existsSync(args.inputDir)
        ? fsSync.readdirSync(args.inputDir).filter(
            (name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"), // ~$ 是 Excel 打开时的锁文件
        )
        : [];
    if (inputFiles.length === 0) {
        console.error(`[excel-to-json] 未找到任何 xlsx 配置表：${args.inputDir}`);
        console.error("  请把配置表放到 tools/excel-config/（三行表头约定与示例见该目录 README.md），");
        console.error("  或用 --input=<目录> 指定其他输入目录。");
        process.exit(1);
    }

    const errors = [];
    const warnings = [];

    // 必填字段按“正式名”声明；别名兜底只在解析阶段生效，因此 icon 允许旧表以 pic 列存在。
    const tables = {
        items: readRows(args.inputDir, sourceFiles.items, ["id", "name", "price", "tags", "reward"]),
    };

    assertUniqueIds(tables.items, "id", sourceFiles.items, errors);
    const items = buildItems(tables.items, args.assetsRoot, errors, warnings);

    // schemaVersion 供运行时做兼容判断，sourceFiles 记录数据来源，方便追查“这份 JSON 是哪张表导的”。
    const data = {
        schemaVersion: 1,
        sourceFiles,
        items,
    };

    if (errors.length > 0) {
        console.error("[excel-to-json] 导表失败：");
        for (const error of errors) console.error(`- ${error}`);
        if (warnings.length > 0) {
            console.warn("[excel-to-json] 同时发现警告：");
            for (const warning of warnings) console.warn(`- ${warning}`);
        }
        process.exit(1);
    }

    if (!args.checkOnly) {
        await writeJson(args.outputFile, data);
        if (args.syncClient) {
            await writeJson(args.clientOutputFile, toClientData(data));
        }
    }

    const summary = {
        checkOnly: args.checkOnly,
        inputDir: toSlash(path.relative(ROOT, args.inputDir)),
        outputFile: args.checkOnly ? null : toSlash(path.relative(ROOT, args.outputFile)),
        clientOutputFile: args.syncClient && !args.checkOnly ? toSlash(path.relative(ROOT, args.clientOutputFile)) : null,
        rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
        warnings: warnings.length,
    };

    console.log(JSON.stringify(summary, null, 2));
    for (const warning of warnings) console.warn(`[excel-to-json] ${warning}`);
}

run().catch((error) => {
    console.error(`[excel-to-json] ${error.message ?? error}`);
    process.exit(1);
});
