/**
 * 建角（DUAL_MODE §2.6 / M12a）：玩家**首进某区**时创建该区角色。
 *
 * 两件事，⚠ **顺序固定（M12d 评审后反转，见下）**：
 *  ① `s{sId}_user` per-zone 玩法档（core createUser，唯一合法建点 09·R2）——**先建**；
 *  ② WebPlatform character registry（durable 区成员标记，F4「本区建过角没」判据 + ul 源）——后写。
 *
 * ⚠ **为什么是「档先、char 行后」**（原为反序，是个不可自愈的毒态）：
 * F4 只在 **ABSENT**（热档与冷档全无）分支查 WebPlatform character registry。
 * - 旧序（char 行先）：两步之间崩溃 ⇒ 有 char 行、无档无冷档 ⇒ 下次 `ensureLive` 判 ABSENT + has=true
 *   ⇒ **永久 `USER_DATA_LOST`**，永远走不到 createUser（注释却写着"下次自愈"，与状态机相反）。
 * - 新序（档先）：崩溃 ⇒ 有档 ⇒ 状态是 LIVE、F4 根本不参与 ⇒ 下次进区补写 char 行，**自愈**。
 *   且 F4 判据反而更硬：**有 char 行 ⇒ 曾建过档** ⇒ 现在全无 = 真丢失。
 * 代价：崩溃窗内该区暂不出现在 `ul`（我的区），下次进区即补——非正确性问题。
 * 两步都幂等（createUser 'exists'、char 行 ODKU no-op）。
 *
 * WebPlatform 登录只建账号、不写游戏 Redis；无论 sId=0 还是分区服，玩法档都只在本函数创建。
 */
import { STAMINA_MAX } from "@game/shared";
import { zoneCtx } from "../core/infra/keys";
import { createUser } from "../core/userRecord";
import { ensureLive, invalidateUserNegcache } from "../core/archive/thaw";
import { registerCharacterWithRepair } from "./characterRepair";
import { CHARACTER_READY_TIMEOUT_MS } from "../core/infra/config";

/** 首进区角色初始字段（与登录建号一致；缺 musicOn/sfxOn = 读侧默认开，07 字段表）。 */
const zoneCharInit = (): Record<string, string> => ({
  registerTime: String(Date.now()),
  stamina: String(STAMINA_MAX),
  lastStaminaRecoverAt: "0", // 满体力：恢复计时未开始
  avatarId: "-1",
});

/** 幂等建角：**先建 `s{sId}_user`，再 HTTP 登记角色**（顺序理由见文件头）。失败不抛给连接（调用方 best-effort，重连自愈）。 */
export async function ensureCharacter(uid: string, sId: number): Promise<void> {
  // ⚠ **ensureLive 先于 createUser**：冻结回流用户先 thaw 恢复真档，
  // ⛔ 绝不在冻结档上 createUser 建空档（空档上先发生写会致 archive 被删、真档永久丢失）。
  // ⚠ ensureLive 内部抢 lock:{uid}——本函数不得在 withUser 锁内调用（onJoin best-effort 调，安全）。
  await zoneCtx.run({ sId }, async () => {
    await ensureLive(uid);                        // 冻结→thaw 恢复；真新→ABSENT(F4 判)；热→无；真丢→抛
    await createUser(uid, zoneCharInit());        // 幂等：热/解冻→'exists'，真新才建（⛔ 不覆盖真档）
    await registerCharacterWithRepair(uid, sId);  // 后写登记；失败 durable 留 intent 后仍向上抛
    await invalidateUserNegcache(uid);            // 建后失效负缓存（09·F4）
  });
}

/**
 * 同一 `(uid, sId)` 的首进请求共享一个有界 initializer。
 *
 * `ensureCharacter` 的底层写入本身是幂等的，但把整个 ready 流程合并仍然很重要：
 * 首次大厅 join 不会同时发起多次外部登记，也不会让多个连接各自看到不同的
 *「已建档/未登记」中间态。超时只结束本次等待；迟到的底层 promise 仍被观察，
 * 其幂等结果可由 repair/下一次 join 收敛，不会产生 unhandled rejection。
 */
const readyFlights = new Map<string, Promise<void>>();

export function ensureCharacterReady(
  uid: string,
  sId: number,
  timeoutMs = CHARACTER_READY_TIMEOUT_MS,
): Promise<void> {
  const key = `${uid}\u0000${sId}`;
  const existing = readyFlights.get(key);
  if (existing) { return existing; }

  const work = ensureCharacter(uid, sId);
  // 即使调用方超时，仍消费底层 promise 的 rejection；迟到成功只会完成幂等建角。
  void work.catch(() => {});
  const bounded = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) { return; }
      settled = true;
      reject(new Error(`角色初始化超时 uid=${uid} sId=${sId}`));
    }, timeoutMs);
    timer.unref?.();
    work.then(() => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      resolve();
    }, (error: unknown) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  }).finally(() => {
    if (readyFlights.get(key) === bounded) { readyFlights.delete(key); }
  });
  readyFlights.set(key, bounded);
  return bounded;
}

/** 测试/停服：不再接受新的 ready 等待，并让现有 flight 自然收敛。 */
export function clearCharacterReadyFlights(): void {
  readyFlights.clear();
}
