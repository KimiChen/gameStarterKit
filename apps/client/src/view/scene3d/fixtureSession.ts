import { Stage3dFixtureLogic } from "../../logic/page/Stage3dFixtureLogic";
import type { SpikeRealtimeSwitch, SpikeSkinningPlan, SpikeSkinningSwitch } from "./spikeSkinning";

function newSession() {
    return {
        logic: new Stage3dFixtureLogic(), ready: false, error: null as string | null, nodeCount: 0,
        skinning: null as SpikeSkinningPlan["summary"] | null,
        switchSkinningClip: null as SpikeSkinningSwitch | null,
        switchRealtimeSkinning: null as SpikeRealtimeSwitch | null,
        close: () => {},
    };
}
export type FixtureSession = ReturnType<typeof newSession>;
let current = newSession();
let businessRefs = 0;

/** DEV diagnostics only. Each opening captures its own session; old callbacks must
 * never mutate the next opening. Reference totals include generations still retiring.
 */
export const fixtureSession = {
    get current(): FixtureSession { return current; },
    get logic() { return current.logic; },
    get ready() { return current.ready; },
    get error() { return current.error; },
    get nodeCount() { return current.nodeCount; },
    get skinning() { return current.skinning; },
    get switchSkinningClip() { return current.switchSkinningClip; },
    get switchRealtimeSkinning() { return current.switchRealtimeSkinning; },
    get businessRefs() { return businessRefs; },
};
export function beginFixtureSession(): FixtureSession { current = newSession(); return current; }
export function countFixtureReference(delta: 1 | -1): void { businessRefs += delta; }
