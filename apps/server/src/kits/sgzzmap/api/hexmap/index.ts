/** sgzzmap hexmap v1 服务端公开面。几何与校验在 shared，本面只多给冻结内容的读取口。 */
export * from "@game/shared/kits/sgzzmap/api/hexmap/index";
export { terrainOf, SGZZMAP_DEFAULT_MAP_ID } from "../../content/terrain";
export { linksOf } from "../../content/links";
