/**
 * owner → 向量 sidecar 的聚合登记（稳定 façade）。
 *
 * 登记表本体是 `index.generated.ts`，由 `codegen:gameplays` 按目录发现渲染：owner = core + 每个声明了
 * C2S wire 的玩法。新增玩法只新增 `wire-vectors/<id>.ts` 并重跑 codegen，⛔ 不再手改本文件——
 * 此前这里是手写 import 表，插件（PLUGIN.md §3「只加文件不改中央源码」）加不进去。
 * 缺 sidecar / 孤儿 sidecar 由生成器 fail-fast；漏向量由中央测试的「向量并集 ⇔ validator 全集」双向
 * deepEqual 抓红。
 */
import { WIRE_VECTOR_FILES } from "./index.generated";
import type { WireVector, WireVectorFile } from "./vectorTypes";

export const WIRE_VECTORS: Readonly<Record<string, WireVectorFile>> = WIRE_VECTOR_FILES;

export type WireVectorOwner = string;

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
