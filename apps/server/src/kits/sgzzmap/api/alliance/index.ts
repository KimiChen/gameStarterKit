/** sgzzmap alliance v1 服务端公开面。规则在 shared，写入统一走内部 service，插件不碰 repo。 */
export * from "@game/shared/kits/sgzzmap/api/alliance/index";
import { defaultSgzzApi } from "../../service";
export const alliance = defaultSgzzApi.alliance;
