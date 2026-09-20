/**
 * kit worker 进程入口（docs/MMO.md §5.4 MF7a-B4；docs/MMO-PLAN.md MF7a-B4）：
 *   KIT_WORKER_ZONES=1,2 npm --workspace @game/server run worker -- <kit>:<worker>
 * - 只认 SERVER_KIT_CATALOG 里登记的 `kit.json.workers[]`（未登记即拒，退出码 2，⛔ 不 import 任何文件）；entry 动态 import，
 *   默认导出必须是 `defineKitWorker({ pass })`（core/infra/kitApi）；
 * - 争租 `singleton_lease('kit:<kit>:<worker>')`（db:bootstrap 预置行；抢不到 = 别的实例在役或行不存在，TTL/3 后再试）；
 * - 主循环：逐区串行一条 `withKitWorkerTx`（首句续租守卫）→ `pass(tx, ctx)`；pass 报 `more` 则同区立刻再跑，否则下一区；
 *   全部区无积压 ⇒ 空闲 `idleMs`（按 LEASE_TTL/3 封顶：空闲期每轮事务照样续租）；⛔ 并发 pass（一个 worker 同一时刻一条事务）；
 * - LeaseLostError ⇒ 退出码 1（僵尸 leader 自杀，09·X7，由 systemd / pm2 拉起）；其他异常记日志、空闲后再试；
 * - SIGTERM / SIGINT ⇒ 跑完当前事务后停止（不再开新事务），退出码 0；租约到期自然释放（与 relayer 同口径，⛔ 不 DELETE 行）。
 * 区清单只认 `KIT_WORKER_ZONES`（逗号分隔 sId，非空、无重复）：⛔ 不从 GROUP_ZONES 推——空表示承载全部，无法据此枚举后台任务
 * （同 ARCHIVE_ZONES 口径）。`runKitWorker` 全部依赖可注入，单测（test/kit-workers.test.ts）用假租约 / 假事务跑主循环。
 */
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LEASE_TTL_S } from "../core/infra/config";
import { LeaseLostError, makeHolderId, tryAcquireLease, type SingletonLease } from "../core/infra/lease";
import {
  isKitWorkerDefinition, withKitWorkerTx, type KitWorkerPassResult, type KitWorkerTx,
} from "../core/infra/kitApi";
import { SERVER_KIT_CATALOG } from "../kits/catalog.generated";
import type { KitWorkerSpec, ServerKitCatalogEntry } from "../kits/catalogTypes";
import { kitWorkerLeaseName } from "../kits/workerLease";

/** 用法 / 登记错误：退出码 2（与运行期错误 1 区分）。 */
export class KitWorkerUsageError extends Error {
  constructor(message: string) { super(message); this.name = "KitWorkerUsageError"; }
}

export interface KitWorkerTarget { readonly kitId: string; readonly workerId: string }

const TARGET_RE = /^([a-z][A-Za-z0-9]{0,63}):([a-z][A-Za-z0-9]{0,63})$/u;

export function parseWorkerTarget(arg: string | undefined): KitWorkerTarget {
  const m = TARGET_RE.exec(arg ?? "");
  if (m === null) { throw new KitWorkerUsageError(`用法：npm --workspace @game/server run worker -- <kit>:<worker>（收到「${arg ?? ""}」）`); }
  return { kitId: m[1] as string, workerId: m[2] as string };
}

/** 登记闸：kit 不在生成目录 / worker 不在该 kit 的 kit.json.workers[] ⇒ 拒（⛔ 不 import 任何文件）。 */
export function resolveWorkerSpec(catalog: readonly ServerKitCatalogEntry[], target: KitWorkerTarget): KitWorkerSpec {
  const kit = catalog.find((entry) => entry.id === target.kitId);
  if (kit === undefined) { throw new KitWorkerUsageError(`kit "${target.kitId}" 未登记在生成目录（apps/kits/<id>/kit.json + codegen:plugins）`); }
  const workers = kit.workers ?? [];
  const worker = workers.find((entry) => entry.id === target.workerId);
  if (worker === undefined) {
    throw new KitWorkerUsageError(`worker "${target.workerId}" 未登记在 kit "${target.kitId}" 的 kit.json.workers[]（已登记：${workers.map((w) => w.id).join(", ") || "-"}）`);
  }
  return worker;
}

/** `KIT_WORKER_ZONES`：非空、无重复、0..65535。⛔ 不从 GROUP_ZONES 推。 */
export function parseWorkerZones(raw: string | undefined): readonly number[] {
  const text = (raw ?? "").trim();
  if (text.length === 0) { throw new KitWorkerUsageError("KIT_WORKER_ZONES 必须显式配置为非空、无重复的区清单（逗号分隔 sId）；⛔ 不从 GROUP_ZONES 推"); }
  const zones: number[] = [];
  for (const part of text.split(",")) {
    const p = part.trim();
    if (!/^\d{1,5}$/u.test(p)) { throw new KitWorkerUsageError(`KIT_WORKER_ZONES 非法：「${raw}」——须为逗号分隔的 0..65535 整数，非法项「${p}」`); }
    const sId = Number(p);
    if (sId > 65535) { throw new KitWorkerUsageError(`KIT_WORKER_ZONES 非法：sId ${sId} 超出 0..65535`); }
    if (zones.includes(sId)) { throw new KitWorkerUsageError(`KIT_WORKER_ZONES 非法：区 ${sId} 重复`); }
    zones.push(sId);
  }
  return zones;
}

export interface KitWorkerRuntimeDeps {
  readonly catalog: readonly ServerKitCatalogEntry[];
  /** 动态 import entry（仓库相对路径）；返回模块命名空间（default 必须是 defineKitWorker 产物）。 */
  readonly importEntry: (entry: string) => Promise<unknown>;
  readonly zones: readonly number[];
  readonly holder: string;
  readonly tryAcquireLease: (leaseName: string, holder: string) => Promise<SingletonLease | null>;
  readonly withWorkerTx: <T>(kitId: string, workerId: string, sId: number, lease: SingletonLease, fn: (tx: KitWorkerTx) => Promise<T>) => Promise<T>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly signal: AbortSignal;
  /** 抢不到租约的重试间隔（入口缺省 LEASE_TTL/3）。 */
  readonly acquireRetryMs: number;
  /** 空闲上限（入口缺省 LEASE_TTL/3：空闲期每轮事务照样续租）。 */
  readonly maxIdleMs: number;
}

export interface KitWorkerRunReport {
  readonly outcome: "stopped";
  readonly passes: number;
}

/**
 * 主循环（全部依赖注入）。返回 = 收到停止信号后正常停止（跑完当前事务）；LeaseLostError 原样抛出（入口退出 1）；
 * 其他 pass 异常记日志后空闲再试。登记闸先于 import。
 */
export async function runKitWorker(target: KitWorkerTarget, deps: KitWorkerRuntimeDeps): Promise<KitWorkerRunReport> {
  const spec = resolveWorkerSpec(deps.catalog, target);
  if (deps.zones.length === 0) { throw new KitWorkerUsageError("区清单为空"); }
  const mod = await deps.importEntry(spec.entry);
  const def = typeof mod === "object" && mod !== null ? (mod as { default?: unknown }).default : undefined;
  if (!isKitWorkerDefinition(def)) { throw new KitWorkerUsageError(`${spec.entry} 的默认导出不是 defineKitWorker({ pass }) 的产物`); }
  const leaseName = kitWorkerLeaseName(target.kitId, target.workerId);
  const idleMs = Math.min(def.idleMs, deps.maxIdleMs);
  const tag = `[kit-worker ${leaseName}]`;

  let lease: SingletonLease | null = null;
  let waited = false;
  while (lease === null) {
    if (deps.signal.aborted) { return { outcome: "stopped", passes: 0 }; }
    lease = await deps.tryAcquireLease(leaseName, deps.holder);
    if (lease === null) {
      if (!waited) { deps.log(`${tag} 抢租失败（别的实例在役，或行不存在——先 db:bootstrap），每 ${deps.acquireRetryMs}ms 重试`); waited = true; }
      await deps.sleep(deps.acquireRetryMs);
    }
  }
  deps.log(`${tag} lease acquired holder=${deps.holder} fence=${lease.fenceToken} zones=${deps.zones.join(",")}`);

  let passes = 0;
  while (!deps.signal.aborted) {
    let busy = false;
    try {
      for (const sId of deps.zones) {
        let more = true;
        while (more && !deps.signal.aborted) {
          const ctx = Object.freeze({ kitId: target.kitId, workerId: target.workerId, sId, now: deps.now(), signal: deps.signal });
          const result = await deps.withWorkerTx(target.kitId, target.workerId, sId, lease, (tx) => def.pass(tx, ctx));
          passes += 1;
          more = (result as KitWorkerPassResult | undefined)?.more === true;
          if (more) { busy = true; }
        }
      }
    } catch (error) {
      if (error instanceof LeaseLostError) { throw error; }
      deps.log(`${tag} pass 失败（本轮已回滚，空闲后再试）：${error instanceof Error ? error.message : String(error)}`);
      busy = false;
    }
    if (!busy && !deps.signal.aborted) { await deps.sleep(idleMs); }
  }
  return { outcome: "stopped", passes };
}

// ── 进程入口 ──────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** entry 是仓库相对路径（kit-schema 固定形态 apps/server/src/kits/<id>/workers/<w>.ts）。 */
export function importEntryFromRepo(entry: string): Promise<unknown> {
  return import(pathToFileURL(join(REPO_ROOT, entry)).href);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function kitWorkerMain(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const target = parseWorkerTarget(argv[0]);
  const zones = parseWorkerZones(env.KIT_WORKER_ZONES);
  const controller = new AbortController();
  const stop = (signal: string): void => { console.log(`[kit-worker] 收到 ${signal}：跑完当前事务后停止`); controller.abort(); };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
  const third = Math.floor(LEASE_TTL_S * 1000 / 3);
  const report = await runKitWorker(target, {
    catalog: SERVER_KIT_CATALOG, importEntry: importEntryFromRepo, zones, holder: makeHolderId(),
    tryAcquireLease: (leaseName, holder) => tryAcquireLease(leaseName, holder),
    withWorkerTx: withKitWorkerTx,
    sleep, now: Date.now, log: (line) => console.log(line), signal: controller.signal,
    acquireRetryMs: Math.max(1000, third), maxIdleMs: Math.max(100, third),
  });
  console.log(`[kit-worker] 已停止（pass ${report.passes} 轮）`);
  return 0;
}

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  kitWorkerMain(process.argv.slice(2))
    .then((code) => { process.exit(code); })
    .catch((error: unknown) => {
      if (error instanceof LeaseLostError) { console.error("[kit-worker] 守卫 UPDATE 0 行——已被顶替，自杀（09·X7）"); process.exit(1); }
      if (error instanceof KitWorkerUsageError) { console.error(`[kit-worker] ${error.message}`); process.exit(2); }
      console.error("[kit-worker] 致命错误", error);
      process.exit(1);
    });
}
