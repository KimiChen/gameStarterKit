/** sgzzmap chunk v1 服务端公开面。聚合契约在 shared，读取统一走内部 service。 */
export * from "@game/shared/kits/sgzzmap/api/chunk/index";
import { defaultSgzzApi } from "../../service";
export const zoom = defaultSgzzApi.zoom;
