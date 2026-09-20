/**
 * kit worker 的租约命名（docs/MMO.md §5.4 MF7a）——纯函数，零依赖：tools/kit-workers.ts（bootstrap 预置行）与
 * core/infra/kitApi.ts（`withKitWorkerTx` 的租约名校验）共用，⛔ src 不反向 import tools/。
 * `singleton_lease.lease_name` 是 VARCHAR(64) ascii：`kit:<kit>:<worker>` 超长 fail-closed（⛔ 不截断，截断会让两个 worker 撞同一行）。
 */
const ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;
const LEASE_NAME_MAX = 64;
export const KIT_WORKER_LEASE_PREFIX = "kit:";

export function kitWorkerLeaseName(kitId: string, workerId: string): string {
  if (!ID_RE.test(kitId)) { throw new Error(`[kit-worker] kit id 非法：${kitId}`); }
  if (!ID_RE.test(workerId)) { throw new Error(`[kit-worker] worker id 非法：${workerId}`); }
  const name = `${KIT_WORKER_LEASE_PREFIX}${kitId}:${workerId}`;
  if (name.length > LEASE_NAME_MAX) { throw new Error(`[kit-worker] 租约名超过 ${LEASE_NAME_MAX} 字符：${name}`); }
  return name;
}
