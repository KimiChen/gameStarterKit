/** 地图调试开关（GM 覆写）：强制 LOD + 逐层隐藏。逻辑层单例，视图经 globalThis 暴露给桌面控制台。 */
import { isMapLayerId, MAP_LAYERS, type MapLayerId } from "./mapLayers";

export interface SlgMapDebugSnapshot { readonly forceLod: number | null; readonly hiddenLayers: readonly MapLayerId[] }

class SlgMapDebugState {
    private forceLodValue: number | null = null;
    private readonly hidden = new Set<MapLayerId>();

    get forceLod(): number | null { return this.forceLodValue; }

    get hiddenLayers(): ReadonlySet<MapLayerId> { return this.hidden; }

    setForceLod(lod: number | null): void {
        if (lod !== null && (!Number.isInteger(lod) || lod < 0 || lod > 3)) throw new RangeError("SLG debug forceLod invalid");
        this.forceLodValue = lod;
    }

    setLayerHidden(id: MapLayerId, hidden: boolean): void {
        if (!isMapLayerId(id)) throw new RangeError("SLG debug layer invalid");
        if (hidden) this.hidden.add(id);
        else this.hidden.delete(id);
    }

    reset(): void { this.forceLodValue = null; this.hidden.clear(); }

    snapshot(): SlgMapDebugSnapshot { return { forceLod: this.forceLodValue, hiddenLayers: [...this.hidden] }; }
}

export const slgMapDebug = new SlgMapDebugState();

export const SLG_MAP_DEBUG_GLOBAL = "slgMapDebug";

/**
 * 桌面调试入口：`slgMapDebug.setLod(0..3|null)`、`slgMapDebug.hide("grid")`、`slgMapDebug.show("grid")`、
 * `slgMapDebug.layers()`、`slgMapDebug.reset()`。返回注销函数（视图关闭时调用）；⛔ 非 gameplay 语义，不进存档/网络。
 */
export function installSlgMapDebugGlobal(target: Record<string, unknown> = globalThis as Record<string, unknown>): () => void {
    const api = {
        setLod: (lod: number | null) => { slgMapDebug.setForceLod(lod); return slgMapDebug.snapshot(); },
        hide: (id: MapLayerId) => { slgMapDebug.setLayerHidden(id, true); return slgMapDebug.snapshot(); },
        show: (id: MapLayerId) => { slgMapDebug.setLayerHidden(id, false); return slgMapDebug.snapshot(); },
        layers: () => MAP_LAYERS.map((layer) => layer.id),
        reset: () => { slgMapDebug.reset(); return slgMapDebug.snapshot(); },
        state: () => slgMapDebug.snapshot(),
    };
    target[SLG_MAP_DEBUG_GLOBAL] = api;
    return () => {
        if (target[SLG_MAP_DEBUG_GLOBAL] === api) delete target[SLG_MAP_DEBUG_GLOBAL];
        slgMapDebug.reset();
    };
}
