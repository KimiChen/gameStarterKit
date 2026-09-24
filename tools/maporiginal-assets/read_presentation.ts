/** Node 离线工具/测试入口；不得被客户端运行时代码导入。 */
import { readFileSync } from "node:fs";
import { mapoReadTopConfig } from "../../apps/client/src/kits/mapOriginal/logic/mapoPresentation";
import { mapoOfflineDecor } from "../../apps/client/src/kits/mapOriginal/logic/mapoDecor";
import { mapoSetTopConfig } from "../../apps/client/src/kits/mapOriginal/logic/mapoTops";
export type { IMapoDecorCell } from "../../apps/shared/src/kits/mapOriginal/content/decor.data";
export { MAPO_TOP_DOWNSCALE, MAPO_TOP_RECORD_BYTES } from "../../apps/shared/src/kits/mapOriginal/content/tops.data";
export type { IMapoTopAtlas, IMapoTopCell } from "../../apps/shared/src/kits/mapOriginal/content/tops.data";

export const decorConfigBytes = readFileSync(new URL("../../apps/kits/mapOriginal/data/maps/s1/decor-config.json", import.meta.url));
export const topConfigBytes = readFileSync(new URL("../../apps/kits/mapOriginal/data/maps/s1/tops-config.json", import.meta.url));
const tops = mapoReadTopConfig(topConfigBytes);
mapoOfflineDecor.mapoSetDecorConfig(decorConfigBytes);
mapoSetTopConfig(topConfigBytes);
const decor = mapoOfflineDecor.config!;
export const [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H] = decor.size;
export const MAPO_DECOR_IMAGE_CELLS = decor.cells;
export const MAPO_DECOR_IMAGES = decor.textures;
export const MAPO_DECOR_TEXTURES = mapoOfflineDecor.textures;
export const MAPO_DECOR_CELLS = decor.variants.base;
export const MAPO_DECOR_SNOW_CELLS = decor.variants.snow;
export const MAPO_DECOR_DESERT_CELLS = decor.variants.desert;
export const MAPO_TOP_ATLASES = tops.atlases;
export const MAPO_TOP_SCENES = tops.scenes;
