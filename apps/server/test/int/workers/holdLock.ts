/**
 * kill -9 测试的子进程：抢到锁后打印 HELD 并停住（绝不 release）。
 * 父进程 SIGKILL 它，验证 lock:{uid} 靠 PX 自然过期（10·M2 DoD）。
 * 用法: node --import tsx holdLock.ts <uid>
 */
import { acquireLease } from "../../../src/core/locks";

const uid = process.argv[2];
await acquireLease(uid);
console.log("HELD");
setInterval(() => { /* 保持进程存活等 SIGKILL */ }, 60_000);
