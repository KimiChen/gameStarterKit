import { randomUUID } from "node:crypto";

export const ARCHIVE_PHASE_LEGACY = 0 as const;
export const ARCHIVE_PHASE_PREPARED = 1 as const;
export const ARCHIVE_PHASE_COMMITTED = 2 as const;

export type ArchivePhase =
  | typeof ARCHIVE_PHASE_LEGACY
  | typeof ARCHIVE_PHASE_PREPARED
  | typeof ARCHIVE_PHASE_COMMITTED;

const FREEZE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newFreezeId(): string {
  return randomUUID();
}

export function parseFreezeId(value: unknown, field = "user_archive.freeze_id"): string {
  if (typeof value !== "string" || !FREEZE_ID_RE.test(value)) {
    throw new Error(`${field} 非法：「${String(value)}」`);
  }
  return value;
}

export function parseArchivePhase(value: unknown): ArchivePhase {
  const phase = typeof value === "number" ? value : Number(value);
  if (phase === ARCHIVE_PHASE_LEGACY
    || phase === ARCHIVE_PHASE_PREPARED
    || phase === ARCHIVE_PHASE_COMMITTED) {
    return phase;
  }
  throw new Error(`user_archive.archive_phase 非法：「${String(value)}」`);
}
