/** Test-only fault point coverage harness shared by client matrix probes. */
import { appendFileSync } from "node:fs";

const POINT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const enabledPoints = new Set(
  (process.env.FAULT_MATRIX_FAULT_POINTS ?? "")
    .split(",")
    .map((point) => point.trim())
    .filter(Boolean),
);

export function faultPointEnabled(point: string): boolean {
  if (!POINT_PATTERN.test(point)) throw new Error(`非法 fault point：${point}`);
  return process.env.FAULT_MATRIX === "1" && enabledPoints.has(point);
}

export function markFaultPoint(point: string): void {
  if (!faultPointEnabled(point)) return;
  const file = process.env.FAULT_MATRIX_COVERAGE_FILE;
  if (!file) throw new Error(`fault point ${point} 缺少 coverage file`);
  appendFileSync(file, `${JSON.stringify({ point })}\n`, "utf8");
}

export async function exerciseFaultPoint<T>(
  point: string,
  operation: () => T | PromiseLike<T>,
): Promise<T> {
  if (!faultPointEnabled(point)) return operation();
  const result = await operation();
  markFaultPoint(point);
  return result;
}
