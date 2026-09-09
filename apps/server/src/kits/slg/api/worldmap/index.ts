/** SLG worldmap v1 服务端公开面。逻辑统一在内部 service，插件不碰 repo。 */
export { slgOperation, type SlgOperation } from "../../service";
export type { ISlgMapTilesRes, ISlgTileCaptureRes } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { defaultSlgApi } from "../../service";
export const readTiles = defaultSlgApi.readTiles;
export const captureTile = defaultSlgApi.captureTile;
