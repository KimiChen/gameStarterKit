/**
 * 页面组合根 façade（Non-intrusive §7.2 阶段 5b）：**零状态纯转发**。
 *
 * 所有权已收敛到 app/：flight 状态机 / page scope / reopen 算法在 app/loginFlow，
 * 业务 route stack 与页面组在 app/NavigationService，回登录 transition 固定次序与
 * 文案映射在 app/SessionCoordinator。本文件只逐一转发既有 openXxx 导入面
 * （Main 旧动态 import 面与测试继续可用），⛔ 不持有任何模块级状态、不注册任何
 * session 处理器（§7.2 (a)：两个单槽的唯一注册方是
 * SessionCoordinator.attachSessionNavigator）。
 *
 * 最终新增 feature ⛔ 不再向本文件添加 openXxx（经 feature route/NavigationService）。
 */
export type { PageSessionOwner, PageSessionScope } from "../app/loginFlow";
export {
  closeLobby,
  createPageSessionScope,
  disposePageSessionEvents,
  observePageAction,
  openAreaList,
  openConfirm,
  openHome,
  openLogin,
  openNotice,
} from "../app/loginFlow";
