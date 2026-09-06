/**
 * 页面注册表（稳定 façade，Non-intrusive §7.5 阶段 6）。
 *
 * 手写全集已由 `codegen:plugins` 生成的不可变 catalog 取代：唯一输入是
 * View 同目录的 `<Name>View.view.json` sidecar + FGUI XML，产物在
 * `generated/views.generated.ts`（load 是生成的字面量动态 import 闭包，铁律 10）。
 * 本文件只保持既有导入面稳定；新增页面 ⛔ 不再手改这里。
 *
 * 新页面动线：FGUI 出图 → `npm run codegen:fgui -- <Pkg> <Comp>`（生成 View 脚手架）→
 * 写 `<Name>View.view.json` + `logic/.../<Name>Logic.ts` → 登记进 apps/plugins/<id>/plugin.json →
 * `npm --workspace @game/server run codegen:plugins` → `npm run sync:client`。
 *
 * 守门：test/viewRegistry.test.ts 遍历 generated catalog 校验「manifest 目录递归发现的
 * *View.ts ⇔ 登记条目」「contract 单源」「sharedPkgs ⊇ 依赖闭包」与 AUTO 区块同步。
 *
 * ⚠ 调用方约束（铁律 10）：`ViewMgr.open` 只允许 view/ 内部或动态 import 闭包里调用。
 */
import type { ViewMeta } from "./defineView";
import { GENERATED_VIEW_CATALOG } from "../generated/views.generated";

export const VIEW_REGISTRY: Readonly<Record<string, ViewMeta>> = GENERATED_VIEW_CATALOG;
