/**
 * kit 目录（docs/KIT.md §3/§4）在构建期生成的登记形态——`catalog.generated.ts` 的类型真源（手写，框架文件）。
 * 零依赖 shared 规则不变；服务端专用面（sql / userKeys）在 apps/server/src/kits/catalogTypes.ts。
 */
export interface KitApiSurfaceSpec {
  readonly version: number;
  readonly minSupported: number;
}

export interface KitModeSpec {
  readonly id: string;
  readonly constantName: string;
}

/**
 * kit 声明的 effect kind（`kit:<kitId>:<name>`）：对该 kit 的 per-user HASH 键 `userKey` 的 `field` 做整数累加，
 * `delta` ∈ [1, max]。零依赖 validator 由 economy.ts 按本表判；Lua 镜像按同一表做 HINCRBY。
 */
export interface KitEffectSpec {
  readonly kitId: string;
  readonly name: string;
  readonly userKey: string;
  readonly field: string;
  readonly max: number;
}

export interface KitCatalogEntry {
  readonly id: string;
  /** null = 宿主自有 kit（不可打包、不进锁）。 */
  readonly version: string | null;
  readonly api: Readonly<Record<string, KitApiSurfaceSpec>>;
  readonly modes: readonly KitModeSpec[];
  readonly domains: readonly string[];
  readonly effects: readonly KitEffectSpec[];
}

export const KIT_EFFECT_KIND_PREFIX = "kit:";

export function kitEffectKind(kitId: string, name: string): string {
  return `${KIT_EFFECT_KIND_PREFIX}${kitId}:${name}`;
}
