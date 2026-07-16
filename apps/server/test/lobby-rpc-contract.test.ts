/**
 * ws-RPC 契约测试（纯内存，不需要 Redis/MySQL——infra 客户端都是首次调用才建连）。
 *
 * 兜住类型系统够不着的运行时缺口：
 *  1. loader 全集校验：shared 声明 ⇔ handlers/<域>/<接口>.ts 双向相等 + 路由名↔路径一致
 *     （collectEndpoints 内部校验，不一致直接 throw——CI 先于启动兜住）
 *  2. idem 路由的 zod schema 必须拒绝缺 clientReqId 的请求（09·I2 的运行时面）
 *  3. 框架文件 gateway/push.ts 的推送名字面量与 shared LobbyPush 镜像一致
 *     （框架文件不 import shared，值靠逐字节一致，这里扫源把关）
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ALL_LOBBY_RPC_TYPES, LobbyPush } from "@game/shared";
import { collectEndpoints } from "../src/gateway/handlers/loader";

test("端点全集与 shared 声明集合相等，路由名与文件路径一致", async () => {
  const defs = await collectEndpoints(); // 内部已做双向集合校验 + 路径一致校验
  assert.equal(defs.length, ALL_LOBBY_RPC_TYPES.length);
  assert.equal(new Set(defs.map((d) => d.type)).size, defs.length, "路由名不得重复");
});

// 除 clientReqId 外把各写路由的必填字段都喂满——失败必须只因缺 clientReqId。
// ⚠ 新增写路由时把它的必填字段补进来（不补的话下面第一条测试会替你报错）
const probe = { mailId: 1, sku: "x", opId: "x" };

test("idem 路由的 schema 必须强制 clientReqId（09·I2）", async () => {
  const defs = await collectEndpoints();
  const idemDefs = defs.filter((d) => d.idem === true);
  assert.ok(idemDefs.length >= 3, "幂等写路由至少含 updateProfile/claimAttach/purchase");
  for (const d of idemDefs) {
    assert.equal(d.schema.safeParse(probe).success, false,
      `${d.type} 的 schema 必须拒绝缺 clientReqId 的 payload`);
    assert.equal(d.schema.safeParse({ ...probe, clientReqId: "c1" }).success, true,
      `${d.type} 的 schema 补上 clientReqId 后应通过（probe 字段不全则补全 probe）`);
  }
});

test("schema 要求 clientReqId 的路由必须开 idem: true（09·I1 反向；defineRpc 重载在编译期挡，这里兜运行时）", async () => {
  const defs = await collectEndpoints();
  for (const d of defs) {
    const needsReqId = !d.schema.safeParse(probe).success
      && d.schema.safeParse({ ...probe, clientReqId: "c1" }).success;
    if (needsReqId) {
      assert.equal(d.idem, true, `${d.type} 的 schema 要求 clientReqId 但未开 idem——占位/结果缓存整条链失效`);
    }
  }
});

test("gateway/push.ts 实际推送名与 shared LobbyPush 集合相等（双向）", async () => {
  const src = await readFile(new URL("../src/gateway/push.ts", import.meta.url), "utf8");
  // 只匹配 pushToUser 调用点的 type 实参（框架文件不 import shared，值靠逐字节一致）；
  // 注释/日志里出现的字符串不算数。handler 侧的 ctx.push 目前无人使用，用到时纳入本扫描
  const emitted = [...src.matchAll(/pushToUser\(\s*[^,)]+,\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(emitted)].sort(),
    [...Object.values(LobbyPush)].sort(),
    "push.ts 的 pushToUser 推送名与 shared LobbyPush 必须双向一致（新推送先进 shared push.ts）");
});
