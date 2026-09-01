/**
 * app generation（Non-intrusive §7.2 阶段 5b）：应用宿主的唯一生命周期世代计数。
 *
 * 取代原 view/pages.ts 的 `pageLifecycleGeneration`（语义逐字继承：dispose/claim 时
 * 递增，owner 捕获创建时的值做活性判定）。AppRuntime 构造时经 createPageSessionScope
 * 递增一次、dispose 时再递增一次（旧 runtime 捕获的世代从此永不再现 = 冻结）。
 *
 * ⚠ 仓内共 6 套 fence，本计数**只**替代 page lifecycle generation 这一套：
 * session generation（SessionCoordinator）、RoomController.currentGeneration、
 * ViewMgr root/next generation、WSC/RoomClient slot generation、FguiView lifecycle
 * generation 各自独立，⛔ 不可互推（原 pages.ts L129-131 注释的约束原样保留）。
 */

let appGeneration = 0;

/** 当前 app generation；owner/transition 在每个 await 后用它拒绝迟到结果。 */
export function currentAppGeneration(): number {
    return appGeneration;
}

/** 递增并返回新世代（scope claim / dispose / 隐式 owner 创建时调用）。 */
export function nextAppGeneration(): number {
    return ++appGeneration;
}
