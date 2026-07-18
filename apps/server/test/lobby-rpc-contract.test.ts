/**
 * ws-RPC 契约测试（纯内存，不需要 Redis/MySQL——infra 客户端都是首次调用才建连）。
 *
 * 兜住类型系统够不着的运行时缺口：
 *  1. loader 全集校验：shared 声明 ⇔ websocket/<域>/<接口>.ts 双向相等 + 路由名↔路径一致
 *     （collectEndpoints 内部校验，不一致直接 throw——CI 先于启动兜住）
 *  2. idem 路由的 zod schema 必须拒绝缺 clientReqId 的请求（09·I2 的运行时面）
 *  3. schema 要求 clientReqId 的路由必须开 idem（09·I1 反向）
 * （信封/错误码/推送名已单源合一——服务端直接 import shared，无镜像可漂移，不再扫源。）
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_LOBBY_RPC_TYPES } from "@game/shared";
import { collectEndpoints } from "../src/websocket/loader";

test("端点全集与 shared 声明集合相等，路由名与文件路径一致", async () => {
  const defs = await collectEndpoints(); // 内部已做双向集合校验 + 路径一致校验
  assert.equal(defs.length, ALL_LOBBY_RPC_TYPES.length);
  assert.equal(new Set(defs.map((d) => d.type)).size, defs.length, "路由名不得重复");
});

// 除 clientReqId 外把各写路由的必填字段都喂满——失败必须只因缺 clientReqId。
// ⚠ 新增写路由时把它的必填字段补进来（不补的话下面第一条测试会替你报错）
const probe = { mailId: 1, sku: "x", opId: "x", guildId: 1 };

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
