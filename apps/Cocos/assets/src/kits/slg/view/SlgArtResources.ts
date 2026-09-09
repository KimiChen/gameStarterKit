/** A route owns one reference to every loaded asset; stale/failed loads release the entire bundle. */
import { JsonAsset, resources, Texture2D } from "cc";
import { validateSlgTerrain, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_ART_ATLAS_CELL_SIZE, SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS } from "../logic/mapArt";

export interface SlgArtResources {
    readonly terrain: ISlgTerrain;
    readonly ground: Texture2D;
    readonly decorations: Texture2D;
    readonly overview: Texture2D;
    release(): void;
}

export async function loadSlgArtResources(): Promise<SlgArtResources> {
    const owned: (JsonAsset | Texture2D)[] = [];
    let released = false;
    const release = (): void => {
        if (released) return;
        released = true;
        for (const asset of owned) asset.decRef();
        owned.length = 0;
    };
    // Resolve failures instead of rejecting early: every in-flight callback must finish
    // before we release acquired references, including when the route has already closed.
    const load = <T extends JsonAsset | Texture2D>(path: string, kind: new () => T): Promise<T | null> =>
        new Promise((resolve) => {
            resources.load(path, kind, (error, asset) => {
                if (error || !asset) { resolve(null); return; }
                asset.addRef(); owned.push(asset); resolve(asset);
            });
        });
    try {
        const [data, ground, decorations, overview] = await Promise.all([
            load("kits/slg/terrain", JsonAsset),
            load("kits/slg/qingyuan/terrain-atlas/texture", Texture2D),
            load("kits/slg/qingyuan/decoration-atlas/texture", Texture2D),
            load("kits/slg/qingyuan/world-overview/texture", Texture2D),
        ]);
        if (!data || !ground || !decorations || !overview || !validateSlgTerrain(data.json)) {
            throw new Error("SLG terrain or art bundle is missing/invalid");
        }
        for (const texture of [ground, decorations]) {
            if (texture.width !== SLG_ART_ATLAS_COLUMNS * SLG_ART_ATLAS_CELL_SIZE
                || texture.height !== SLG_ART_ATLAS_ROWS * SLG_ART_ATLAS_CELL_SIZE) {
                throw new Error("SLG atlas dimensions do not match its cell layout");
            }
        }
        if (overview.width <= 0 || overview.height !== overview.width) throw new Error("SLG overview must be square");
        return { terrain: data.json, ground, decorations, overview, release };
    } catch (error) { release(); throw error; }
}
