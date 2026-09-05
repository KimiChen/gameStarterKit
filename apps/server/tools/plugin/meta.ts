/**
 * 随包 `.meta` 的内容闸（PLUGIN-REGISTRY §1-11）：pack/install 以前只查 `.meta` 是否存在，uuid 撞车要到 verify:sync
 * 才暴露，而那时的修法（删 .meta 让 Creator 重铸）又会让插件锁红——两边互相矛盾。这里在**落盘前**把它拦住：
 *  - JSON 可解析、`uuid` 是小写 8-4-4-4-12 十六进制（与 scripts/sync-client.mjs 的 META_UUID_RE 同一正则，测试钉住相等）；
 *  - importer 与目标文件类型相符（只查表内已知的扩展名；directory .meta 的 importer 必须是 directory）；
 *  - 包内 uuid 互不重复；安装时再与宿主 `apps/Cocos/assets` 树上的 uuid 比对（本插件旧锁与本包将覆盖的路径除外）。
 */
import fs from "node:fs";
import path from "node:path";

/** Creator 写进 .meta 的 uuid 形态：小写 8-4-4-4-12 十六进制（⛔ 刻意不钉版本位与 variant 位，与 sync-client 同口径）。 */
export const META_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** 扩展名 → Creator importer（只列本仓实际出现过的形态；表外扩展名不查 importer）。 */
export const IMPORTER_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  [".ts", "typescript"],
  [".json", "json"],
  [".png", "image"],
  [".jpg", "image"],
  [".jpeg", "image"],
  [".webp", "image"],
  [".bin", "buffer"],
  [".mp3", "audio-clip"],
  [".ogg", "audio-clip"],
  [".wav", "audio-clip"],
  [".m4a", "audio-clip"],
]);

export interface MetaSummary {
  readonly uuid: string;
  readonly importer: string | null;
}

/** 解析一个 .meta 的内容；任何不合形态都抛错（调用方决定是整包拒绝还是跳过）。 */
export function parseMeta(bytes: Buffer, label: string): MetaSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON（半截/冲突标记未解的 .meta 会让 Creator 导入期重铸 uuid）：${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${label} 内容非对象`);
  const record = parsed as { readonly uuid?: unknown; readonly importer?: unknown };
  if (typeof record.uuid !== "string") throw new Error(`${label} 缺 uuid 字段`);
  if (!META_UUID_RE.test(record.uuid)) throw new Error(`${label} 的 uuid 形状非法：${JSON.stringify(record.uuid)}（应为小写 8-4-4-4-12 十六进制）`);
  return { uuid: record.uuid, importer: typeof record.importer === "string" ? record.importer : null };
}

/** 目标（去掉 .meta 后的路径）应有的 importer；未知扩展名 ⇒ null（不查）。 */
export function expectedImporter(target: string, isDirectory: boolean): string | null {
  if (isDirectory) return "directory";
  return IMPORTER_BY_EXTENSION.get(path.posix.extname(target).toLowerCase()) ?? null;
}

/** 宿主 assets 树上全部可解析的 .meta：uuid → 仓库相对路径（解析失败的跳过——那是 verify:sync 的事）。 */
export function hostMetaUuids(root: string, assetsDir = "apps/Cocos/assets", skip: ReadonlySet<string> = new Set()): ReadonlyMap<string, string[]> {
  const byUuid = new Map<string, string[]>();
  const base = path.join(root, assetsDir);
  if (!fs.existsSync(base)) return byUuid;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".meta")) continue;
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (skip.has(relative)) continue;
      let summary: MetaSummary;
      try {
        summary = parseMeta(fs.readFileSync(full), relative);
      } catch {
        continue;
      }
      if (!byUuid.has(summary.uuid)) byUuid.set(summary.uuid, []);
      (byUuid.get(summary.uuid) as string[]).push(relative);
    }
  };
  walk(base);
  return byUuid;
}
