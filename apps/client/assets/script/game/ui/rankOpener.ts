/**
 * 排行榜「打开」桥（seam）。**零 fairygui 依赖** → 可留在无头 typecheck 内。
 *
 * 真正的 open（动态 import RankView + 假数据）由 `Main`（排除在无头 typecheck 外）在 boot 时经
 * `setRankOpener` 注入；菜单等无头层只调 `openRank()`——避免把 fairygui 拉进无头程序
 * （同 EcsDriveMode 的 `setGlobalEcsStepper` 套路）。
 */
let _open: (() => void) | null = null;

/** Main(boot 时)注入真打开逻辑。 */
export function setRankOpener(fn: (() => void) | null): void { _open = fn; }

/** 菜单入口点击 → 打开排行榜（未注入则 no-op）。 */
export function openRank(): void { _open?.(); }
