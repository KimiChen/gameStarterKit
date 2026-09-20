/** sgzzmap territory v1 服务端公开面。规则在 shared，写入统一走内部 service，插件不碰 repo。 */
export * from "@game/shared/kits/sgzzmap/api/territory/index";
export { sgzzOperation, sgzzInSpawnRegion, type SgzzOperation } from "../../service";
import { defaultSgzzApi } from "../../service";
export const view = defaultSgzzApi.view;
export const tile = defaultSgzzApi.tile;
export const occupy = defaultSgzzApi.occupy;
export const abandon = defaultSgzzApi.abandon;
