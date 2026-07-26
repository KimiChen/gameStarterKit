/**
 * 认证原语的纯函数守门（无 Redis/MySQL）：`normalizeIp` × 两份实现 + `safeSecretEqual`。
 *
 * ⚠ `normalizeIp` **有两份实现**（组侧 `core/auth/session.ts` 与 `@game/webplatform/lib` 的 auth.ts）——
 * 跨包不能共享代码（同 `clamp` 的处境）。两份各自正确没有意义，**必须逐条同表同判**，
 * 否则同一个 XFF 在两种部署模式下会走出不同的审计结果。故本文件用同一张表跑两份实现。
 *
 * 落库层面的真实后果（INET6_ATON 抛 1411 而不是写 NULL）由 `test/int/auth.test.ts` 的
 * 「审计 ip 非法必须归一成 NULL」用真库钉住；这里只钉解析判据本身。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeIp as groupNormalizeIp, safeSecretEqual } from "../src/core/auth/session";
import { normalizeIp as libNormalizeIp } from "@game/webplatform/lib";

/** [输入, 期望输出]。null = INET6_ATON 收不下、必须归成 NULL 才不会把审计整行弄丢。 */
const CASES: ReadonlyArray<readonly [string | null | undefined, string | null]> = [
  // 合法：原样保留（⛔ 别把归一写成"一律 NULL"那种假修——审计里的 IP 是排障主线索）
  ["1.2.3.4", "1.2.3.4"],
  ["203.0.113.9", "203.0.113.9"],
  ["0.0.0.0", "0.0.0.0"],
  ["::1", "::1"],
  ["2001:db8::1", "2001:db8::1"],
  ["::ffff:1.2.3.4", "::ffff:1.2.3.4"],
  // 带端口：**部署级必现**形态（部分 LB/网关这样 append）。剥端口后保住真实 IP，
  // ⛔ 不能丢成 NULL——那等于把全服的登录来源 IP 都抹掉。
  ["1.2.3.4:5678", "1.2.3.4"],
  ["203.0.113.10:443", "203.0.113.10"],
  ["[::1]:5678", "::1"],
  ["[2001:db8::1]:443", "2001:db8::1"],
  // 非法：一律 null
  ["unknown", null],           // 代理写不出真实 IP 时的常见占位，**外部可控**
  ["", null],
  ["   ", null],
  ["for=1.2.3.4", null],       // Forwarded 头的语法混进 XFF
  ["1.2.3.4/24", null],
  // ⚠ zone index：`net.isIP` **返回 6**（Node 认）而 `INET6_ATON` **抛 1411**（MySQL 不认）——
  // 两个判据不一致，只信 isIP 就会漏。实测坐实，⛔ 别按"isIP 说合法"把这两行删了。
  ["::1%eth0", null],
  ["fe80::1%en0", null],       // Node 给出的链路本地对端地址就长这样，真能走到
  ["1.2.3.4, 5.6.7.8", null],  // 整串没拆就传进来
  ["999.1.1.1", null],
  ["1.2.3", null],
  // ⚠ **前导零是刻意拒绝的取舍，不是漏判**：MySQL 的 INET6_ATON 收得下（实测 '010.1.1.1' → 10.1.1.1），
  //   但 `net.isIP` 拒；八进制/十进制的歧义解析是经典漏洞面（不同组件对 010 的理解不同），
  //   宁可让审计那一列为 NULL 也不入库一个"两边理解不一样"的地址。⛔ 别按"MySQL 能收"把它改成放行。
  ["010.1.1.1", null],
  ["192.168.000.1", null],
  ["<script>", null],
  [null, null],
  [undefined, null],
  // ⚠ 前后空白：容忍（LB 写 "a, b" 后拆分难免带空格），这与"非法"要分开
  [" 1.2.3.4 ", "1.2.3.4"],
];

test("normalizeIp：两份实现（组侧 / WebPlatform lib）逐条同判", () => {
  for (const [input, expected] of CASES) {
    assert.equal(groupNormalizeIp(input), expected, `组侧 normalizeIp(${JSON.stringify(input)})`);
    assert.equal(libNormalizeIp(input), expected, `lib normalizeIp(${JSON.stringify(input)})`);
  }
});

test("safeSecretEqual：长度不等 ⛔ 不得抛（timingSafeEqual 直接比会因不等长抛错 = 泄漏长度）", () => {
  // 这是改用恒时比较时最容易踩的坑：node 的 timingSafeEqual 要求两侧等长，
  // 直接把两个密钥丢进去，长度不同就抛 ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH ⇒
  // 端点 500 而不是 401，且"抛没抛"本身就把长度信息漏出去了。故实现先各自 sha256 再比。
  assert.equal(safeSecretEqual("a", "abcdefghijklmnop"), false);
  assert.equal(safeSecretEqual("abcdefghijklmnop", "a"), false);
  assert.equal(safeSecretEqual("", "x"), false);
});

test("safeSecretEqual：相等为真、任一为空/缺失一律假（fail-closed）", () => {
  assert.equal(safeSecretEqual("s3cret", "s3cret"), true);
  assert.equal(safeSecretEqual("s3cret", "s3crEt"), false);
  // ⛔ 未配置密钥不得成为开门：两侧都空也必须假（端点据此 fail-closed）
  assert.equal(safeSecretEqual("", ""), false);
  assert.equal(safeSecretEqual(undefined, undefined), false);
  assert.equal(safeSecretEqual(null, "s3cret"), false);
  assert.equal(safeSecretEqual("s3cret", null), false);
  assert.equal(safeSecretEqual("s3cret", undefined), false);
});
