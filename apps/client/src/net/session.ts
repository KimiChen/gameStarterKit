/**
 * 会话 façade（Non-intrusive §7.2/§7.3 阶段 5a）：真相已收敛到 app/SessionCoordinator，
 * 本模块只做**纯转发**（类型与函数逐一 re-export，语义零改动），供既有调用面
 * （Main / view/pages / net/RoomClient / logic / 测试）继续使用稳定导入路径。
 *
 * ⛔ 本模块不 import net 客户端类（WebSocketClient/RoomClient 单向发布连接事件，
 *    经 LifecycleBus 由 SessionCoordinator 派生，防循环依赖）。
 * ⛔ 不在这里新增任何状态或逻辑：新增会造成「旧 fanout 与新 Coordinator 并存两份
 *    连接真相」，违反 §7.3。
 */
export type {
    AuthInvalidReason,
    ReturnToLoginHandler,
    ReturnToLoginReason,
    SessionReconcileHandler,
    SessionReconcileIdentity,
} from "../app/SessionCoordinator";
export {
    SessionTransition,
    clearSession,
    commitSessionProfile,
    getSessionGeneration,
    getSessionIdentity,
    getSessionProfile,
    getUserId,
    isLoggedIn,
    isSessionIdentityCurrent,
    notifyAuthInvalid,
    notifyBattleLost,
    notifyConnLost,
    onAuthInvalid,
    onBattleLost,
    onConnLost,
    registerReturnToLogin,
    registerSessionReconciler,
    returnToLogin,
    setSession,
} from "../app/SessionCoordinator";
