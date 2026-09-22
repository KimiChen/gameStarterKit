/**
 * 原版大地图页模型：相机 / LOD / 可视格 / 选中格 / 画面设置。纯逻辑，⛔ 不碰 cc。
 *
 * ⚠ v1 **没有服务端**：地形随代码与资源走，⛔ 无 RPC、无节流、无代际围栏。
 *   将来接玩法时再把 sgzzmap 的「节流 + 代际围栏」那套抄过来（⛔ 别现在就留半套）。
 */
import { MAPO_MAP_COLS, MAPO_MAP_ROWS, mapoCellOf } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { MapoCamera, type MapoCellRef } from "./mapoCamera";
import { mapoIsNearField, mapoVisibleLayers, type MapoLayerId } from "./mapoLayers";
import { mapoValueAt, mapoPassClassAt, mapoHasDisplayTerrain } from "./mapoTerrain";
import {
    MAPO_DEFAULT_GRAPHICS, mapoCameraAvailability, mapoCreateStepFor, mapoNormalizeGraphics,
    mapoSandboxAvailability, type IMapoGraphicsSettings,
} from "./mapoSettings";

export interface IMapoTileInfo {
    readonly row: number;
    readonly col: number;
    readonly cell: number;
/** 该格的**原版 res 值**；显示层没到位时是通行类退化来的同空间值（1/47/60）。 */
    readonly value: number;
    readonly passable: boolean;
    /** 显示层是否已就位 —— ⛔ 不要拿「退回值」冒充真相，面板要标注。 */
    readonly detailed: boolean;
}

export class MapOriginalWorldLogic {
    readonly camera: MapoCamera;
    private graphicsValue: IMapoGraphicsSettings = MAPO_DEFAULT_GRAPHICS;
    private selected: number | null = null;

    constructor(width: number, height: number) {
        this.camera = new MapoCamera(width, height);
    }

    /** ⚠ LOD 由相机自己带滞回维护，⛔ 不要在页模型里再算一遍阈值。 */
    get lod(): number { return this.camera.lod; }
    get graphics(): IMapoGraphicsSettings { return this.graphicsValue; }
    get nearField(): boolean { return mapoIsNearField(this.camera.lod); }
    get layers(): MapoLayerId[] { return mapoVisibleLayers(this.camera.lod); }
    /** 一帧最多建多少格 —— 由画质档决定。 */
    get createStep(): number { return mapoCreateStepFor(this.graphicsValue.quality); }

    setGraphics(next: unknown): IMapoGraphicsSettings {
        this.graphicsValue = mapoNormalizeGraphics(next);
        return this.graphicsValue;
    }

    /** 面板要展示的可用性（与原作同义的置灰理由）。 */
    availability(): { sandbox3d: string; camera: string } {
        return {
            sandbox3d: mapoSandboxAvailability("3d").reason,
            camera: mapoCameraAvailability(this.graphicsValue).reason,
        };
    }

    select(ref: MapoCellRef | null): IMapoTileInfo | null {
        if (!ref) { this.selected = null; return null; }
        const { row, col } = ref;
        if (row < 0 || col < 0 || row >= MAPO_MAP_ROWS || col >= MAPO_MAP_COLS) {
            this.selected = null;
            return null;
        }
        this.selected = mapoCellOf(row, col);
        return this.tileAt(row, col);
    }

    get selectedCell(): number | null { return this.selected; }

    tileAt(row: number, col: number): IMapoTileInfo {
        const detailed = mapoHasDisplayTerrain();
        const value = mapoValueAt(row, col);
        // ⚠ 通行判定始终走通行层：它是 shared 单源，⛔ 不从原版值反推
        const passCls = mapoPassClassAt(row, col);
        return {
            row, col, cell: mapoCellOf(row, col), value,
            passable: passCls === 0, detailed,
        };
    }

    /** 镜头落到某一格（钳位与 LOD 由相机负责）。 */
    centerOn(row: number, col: number): void {
        this.camera.locate(row, col);
    }
}
