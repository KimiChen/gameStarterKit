/** SLG march v1 服务端公开面：派遣、撤回、有界懒结算。 */
export { slgOperation, type SlgOperation } from "../../service";
export type { ISlgMarchDispatchRes, ISlgMarchRecallRes } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { defaultSlgApi } from "../../service";
export const dispatchMarch = defaultSlgApi.dispatchMarch;
export const recallMarch = defaultSlgApi.recallMarch;
export const settleDueMarches = defaultSlgApi.settleDueMarches;
