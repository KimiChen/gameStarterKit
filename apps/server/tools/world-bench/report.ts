/**
 * world-bench 报告件（docs/MMO.md MF1；docs/MMO-PLAN.md MF1-B1）：分位数、汇总、落盘与两份报告的偏差比对。
 * ⛔ 不进 verify:core（证据生成器，同 tools/m0/）；结果文件落 docs/perf/world-bench/<日期>-<剧本>[-<标签>].json。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface Summary {
  readonly count: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = count === 0 ? 0 : sorted.reduce((acc, value) => acc + value, 0) / count;
  return {
    count,
    mean: round(mean),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[count - 1] ?? 0),
  };
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** `YYYY-MM-DDTHHMMSS`（本地时区），同一天多次跑不覆盖。 */
export function stamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function gitCommit(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function writeReport(dir: string, name: string, report: unknown): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

/** 主要指标的路径（点分），比对两份报告时逐条算相对偏差。 */
export const KEY_METRICS: readonly string[] = [
  // 只取跨次稳定且有决策意义的量：tick 尾部（kill criterion 用 p99）、每会话出站中位数、baseline 体积、delta 频率。
  // p50 tick / 出站 p95 / 事件循环 p99 受复活事件与同进程机器人抖动影响大，只作报告字段不进比对集。
  "tick.p95", "tick.p99",
  "outbound.bytesPerSessionPerSec.p50",
  "baseline.bytesPerJoin.p50",
  "clientSide.deltaMessagesPerSec.p50",
];

function readPath(source: unknown, dotted: string): number | undefined {
  let current: unknown = source;
  for (const segment of dotted.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "number" ? current : undefined;
}

export interface Deviation {
  readonly metric: string;
  readonly a: number | undefined;
  readonly b: number | undefined;
  /** |a-b| / max(|a|,|b|)；两边都为 0 记 0；缺失记 NaN。 */
  readonly relative: number;
}

export function compareReports(a: unknown, b: unknown, metrics: readonly string[] = KEY_METRICS): Deviation[] {
  return metrics.map((metric) => {
    const left = readPath(a, metric);
    const right = readPath(b, metric);
    if (left === undefined || right === undefined) return { metric, a: left, b: right, relative: Number.NaN };
    const denominator = Math.max(Math.abs(left), Math.abs(right));
    return { metric, a: left, b: right, relative: denominator === 0 ? 0 : round(Math.abs(left - right) / denominator, 4) };
  });
}

export function formatDeviations(deviations: readonly Deviation[], threshold: number): string[] {
  return deviations.map((d) => {
    const pct = Number.isNaN(d.relative) ? "n/a" : `${(d.relative * 100).toFixed(1)}%`;
    const flag = Number.isNaN(d.relative) || d.relative > threshold ? "✖" : "✔";
    return `${flag} ${d.metric.padEnd(44)} ${String(d.a).padStart(12)} ${String(d.b).padStart(12)}  偏差 ${pct}`;
  });
}
