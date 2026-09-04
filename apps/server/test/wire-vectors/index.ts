/**
 * owner → 向量 sidecar 的聚合登记。
 *
 * 显式静态 import，⛔ 不用 fs 扫描（tsx/Node 都能静态解析，测试无隐式 IO）。
 * 新增 wire owner：建 `wire-vectors/<owner>.ts` 并在下表加一行——这一行属该玩法
 * 自有登记；漏登记由中央测试的「向量并集 ⇔ validator 全集」双向 deepEqual 抓红。
 */
import ballMove from "./ballMove";
import core from "./core";
import idle from "./idle";
import snake from "./snake";
import type { WireVector, WireVectorFile } from "./vectorTypes";

export const WIRE_VECTORS = {
  ballMove,
  core,
  idle,
  snake,
} as const satisfies { readonly [owner: string]: WireVectorFile };

export type WireVectorOwner = keyof typeof WIRE_VECTORS;

function mergeByOwner<T>(
  pick: (file: WireVectorFile) => { readonly [type: string]: T | undefined } | undefined,
  half: string,
): ReadonlyMap<string, { readonly owner: string; readonly value: T }> {
  const merged = new Map<string, { readonly owner: string; readonly value: T }>();
  for (const [owner, file] of Object.entries(WIRE_VECTORS)) {
    for (const [type, value] of Object.entries(pick(file) ?? {})) {
      if (value === undefined) continue;
      const clash = merged.get(type);
      if (clash) {
        throw new Error(`[wire-vectors] ${half} ${type} 同时住在 ${clash.owner}.ts 与 ${owner}.ts`);
      }
      merged.set(type, { owner, value: value as T });
    }
  }
  return merged;
}

/** 发现到的全部 C2S 向量（type → {owner, vectors}）；重复登记直接抛。 */
export function discoverC2SVectors(): ReadonlyMap<string, { readonly owner: string; readonly value: readonly WireVector[] }> {
  return mergeByOwner<readonly WireVector[]>((file) => file.c2s, "c2s");
}

/** 发现到的全部玩法准入 payload（type → {owner, payload}）；重复登记直接抛。 */
export function discoverAdmissionPayloads(): ReadonlyMap<string, { readonly owner: string; readonly value: unknown }> {
  return mergeByOwner<unknown>((file) => file.admission, "admission");
}
