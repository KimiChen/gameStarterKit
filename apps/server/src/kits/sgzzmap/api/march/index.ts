/** sgzzmap march v1 服务端公开面。规则在 shared，写入统一走内部 service，插件不碰 repo。 */
export * from "@game/shared/kits/sgzzmap/api/march/index";
import { defaultSgzzApi } from "../../service";
export const marchDispatch = defaultSgzzApi.marchDispatch;
export const marchRecall = defaultSgzzApi.marchRecall;
export const settleDueMarches = defaultSgzzApi.settleDueMarches;
export const settleOnTx = defaultSgzzApi.settleOnTx;
