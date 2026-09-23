import type { Stage3DPort } from "../../../view/scene3d/Stage3D";

/** View-only port injection; the SLG logic layer never depends on engine services. */
let current: { port: Stage3DPort } | undefined;
export function setSlgStage3D(port: Stage3DPort): () => void {
    const installed = current = { port };
    return () => { if (current === installed) current = undefined; };
}
export function getSlgStage3D(): Stage3DPort {
    if (!current) throw new Error("SLG Stage3D port is not installed");
    return current.port;
}
