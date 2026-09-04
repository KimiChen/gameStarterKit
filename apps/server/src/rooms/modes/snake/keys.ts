/**
 * Snake 自有 Redis 键。玩法名不再出现在 `core/infra/keys.ts` 里——中央只提供 `kGameplay`
 * 工厂与分段契约（docs/SERVER.md §13「Redis key」行）。
 */
import { kGameplay } from "../../../core/infra/keys";

/**
 * Snake demo 钱包 HASH（当前只写 `coinBalance`），无 TTL。逻辑键 `gp:snake:user:{uid}`。
 *
 * ⚠ scope 显式选 **`"global"`**：这份 demo 余额是**跨区共享的单份**——同一 uid 在任何区读到同
 * 一个数，键名里既没有 `s{sId}_` 前缀也不含 `sId` 分量。⛔ 不是每区独立经济：改成
 * `"per-zone"` 会让同一账号在不同区各自拿到一份余额，是语义变更而不是重构。
 * 该取舍是 docs/SERVER.md §12「R — Redis」明确登记的非生产 demo 例外。
 */
export const kSnakeUser = (uid: string): string => kGameplay("snake", "user", uid, { zone: "global" });
