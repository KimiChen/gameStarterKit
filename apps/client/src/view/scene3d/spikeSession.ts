import { Stage3dFixtureLogic } from "../../logic/page/Stage3dFixtureLogic";
import type { SpikeRealtimeSwitch, SpikeSkinningPlan, SpikeSkinningSwitch } from "./spikeSkinning";

/** SC0 only: shared diagnostics for two fixed probe pages, not a kit API. */
export const spikeSession = {
    logic: new Stage3dFixtureLogic(),
    ready: false,
    error: null as string | null,
    businessRefs: 0,
    nodeCount: 0,
    skinning: null as SpikeSkinningPlan["summary"] | null,
    switchSkinningClip: null as SpikeSkinningSwitch | null,
    switchRealtimeSkinning: null as SpikeRealtimeSwitch | null,
    close: () => {},
};
