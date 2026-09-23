/** GROUND_GRID_LINE 原图显示高度 8px；格边每条只提交一次。 */
import { MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos, mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { MapoSpriteInput } from "./mapoMesh";
export function mapoGridLineSprites(cells: readonly { row: number; col: number }[]): MapoSpriteInput[] {
    const hw = MAPO_TILE_HALF_W, hh = MAPO_TILE_HALF_H, w = Math.hypot(hw, hh);
    const angle = Math.atan2(hh, hw) * 180 / Math.PI;
    const sprites: MapoSpriteInput[] = [];
    for (const { row, col } of cells) {
        const p = mapoGrid2Pos(row, col);
        for (const side of [1, -1]) sprites.push({ row, col,
            x: p.x + hw / 2, y: p.y + side * hh / 2, w, h: mapoOriginalPxToWorld(8),
            pivot: [0.5, 0.5], angleDeg: -side * angle, uv: [0, 0, 1, 1] });
    }
    return sprites;
}
