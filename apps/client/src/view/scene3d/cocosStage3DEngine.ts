import { Camera, Color, DirectionalLight, Director, Node, Rect, TextureCube, Vec3, director, isValid, screen, view } from "cc";
import { resolveViewport } from "../../logic/scene3d/viewport";
import type { ViewportMetrics } from "../../logic/scene3d/viewport";
import { Stage3DApplyError, Stage3DInactive } from "./Stage3D";
import type { Stage3DEngine, Stage3DScene } from "./Stage3D";
import { cloneGlobals, globalsAssets } from "./stage3dGlobals";
import type { Stage3DGlobalsPatch } from "./stage3dGlobals";

// Creator 3.8.8: render-scene/scene/{post-settings,fog,shadows}.ts enum order.
const TONE_MAPPING = ["default", "linear"] as const;
const FOG = ["linear", "exp", "expSquared", "layered"] as const;
const SHADOWS = ["planar", "shadowMap"] as const;
const SKYBOX_LIGHTING = ["hemisphere", "reflection", "diffuse"] as const;

function validateGlobalAssets(patch: Stage3DGlobalsPatch): void {
    for (const asset of globalsAssets(patch)) {
        if (!(asset instanceof TextureCube) || !isValid(asset, true)) {
            throw new TypeError("Stage3D skybox requires live Creator TextureCube assets");
        }
    }
}

function decode<T extends string>(values: readonly T[], index: number, label: string): T {
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
        throw new RangeError(`Unsupported Creator ${label}: ${index}`);
    }
    return values[index];
}

function lookAtUp(x: number, y: number, z: number): Vec3 {
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length === 0) throw new RangeError("Invalid Stage3D look direction");
    // Node.lookAt's default +Y up degenerates for a vertical camera or sun.
    return Math.abs(y) / length > 0.999 ? new Vec3(0, 0, 1) : new Vec3(0, 1, 0);
}

function cleanAll(actions: readonly (() => void)[]): void {
    const failures: unknown[] = [];
    for (const action of actions) {
        try { action(); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new Stage3DApplyError(failures[0], failures.slice(1));
}

/** Node destruction is deferred by Cocos. Asset/GPU retirement is a separate B4 boundary. */
function destroyNode(node: Node): void {
    if (!isValid(node, true)) return;
    cleanAll([
        () => { node.active = false; },
        () => node.removeFromParent(),
        () => { node.destroy(); },
    ]);
}

interface EventSource {
    on(type: string, callback: () => void): unknown;
    off(type: string, callback: () => void): void;
}

/** Production engine bridge. Construction never acquires a scene or installs listeners. */
export class CocosStage3DEngine implements Stage3DEngine {
    captureScene(): Stage3DScene {
        const scene = director.getScene();
        if (!scene || !isValid(scene, true)) throw new Stage3DInactive();
        const globals = scene.globals;
        let applyIncomplete = false;
        const valid = () => director.getScene() === scene && isValid(scene, true);
        const requireScene = () => { if (!valid()) throw new Stage3DInactive(); };
        return {
            isValid: valid,
            isNodeValid: (node) => isValid(node, true),
            createNode: (name, layer) => {
                requireScene();
                const node = new Node(name);
                try {
                    node.layer = layer;
                    scene.addChild(node);
                    return node;
                } catch (error) {
                    try { destroyNode(node); }
                    catch (cleanup) { throw new Stage3DApplyError(error, [cleanup]); }
                    throw error;
                }
            },
            addCamera: (node) => { requireScene(); return node.addComponent(Camera); },
            addLight: (node) => { requireScene(); return node.addComponent(DirectionalLight); },
            destroyNode,
            setCameraPose: (camera, position, target) => {
                requireScene();
                const up = lookAtUp(target.x - position.x, target.y - position.y, target.z - position.z);
                camera.node.setWorldPosition(new Vec3(position.x, position.y, position.z));
                camera.node.lookAt(new Vec3(target.x, target.y, target.z), up);
            },
            setCameraViewport: (camera, rect) => {
                requireScene();
                camera.rect = new Rect(rect.x, rect.y, rect.width, rect.height);
            },
            setCameraClear: (camera, value) => {
                requireScene();
                // SKYBOX adds bit 8 to DEPTH_STENCIL; the public property uses gfx.ClearFlagBit.
                camera.clearFlags = (value === "skybox" ? Camera.ClearFlag.SKYBOX : Camera.ClearFlag.SOLID_COLOR) as Camera["clearFlags"];
                if (value !== "skybox") camera.clearColor = new Color(value.r, value.g, value.b, value.a);
            },
            screenPointToRay: (camera, x, y) => {
                requireScene();
                // Component.screenPointToRay does not update the inverse view-projection itself.
                camera.camera.update(true);
                const ray = camera.screenPointToRay(x, y);
                return {
                    origin: { x: ray.o.x, y: ray.o.y, z: ray.o.z },
                    direction: { x: ray.d.x, y: ray.d.y, z: ray.d.z },
                };
            },
            setLightDirection: (light, direction) => {
                requireScene();
                const position = light.node.worldPosition;
                const up = lookAtUp(direction.x, direction.y, direction.z);
                light.node.lookAt(new Vec3(position.x + direction.x, position.y + direction.y, position.z + direction.z), up);
            },
            setLightColor: (light, color) => {
                requireScene();
                light.color = new Color(color.r, color.g, color.b, color.a);
            },
            readViewportMetrics: () => {
                requireScene();
                const origin = view.getVisibleOrigin(), size = view.getVisibleSize();
                const viewport = view.getViewportRect(), sx = view.getScaleX(), sy = view.getScaleY();
                const window = screen.windowSize;
                if (!(sx > 0 && sy > 0) || !Number.isFinite(sx) || !Number.isFinite(sy)) {
                    throw new RangeError("Invalid Creator view scale");
                }
                // Inverse of Touch.getUILocation. Crop NO_BORDER before recovering visible design.
                // screen.windowSize and Camera.screenPointToRay both use oriented physical pixels.
                const x = Math.max(0, viewport.x + origin.x * sx);
                const y = Math.max(0, viewport.y + origin.y * sy);
                const right = Math.min(window.width, viewport.x + (origin.x + size.width) * sx);
                const top = Math.min(window.height, viewport.y + (origin.y + size.height) * sy);
                const metrics: ViewportMetrics = {
                    design: { x: (x - viewport.x) / sx, y: (y - viewport.y) / sy, width: (right - x) / sx, height: (top - y) / sy },
                    screen: { width: window.width, height: window.height },
                    content: { x, y, width: right - x, height: top - y },
                };
                resolveViewport(metrics.design, metrics); // Validate before handing metrics to the coordinator.
                return metrics;
            },
            globals: {
                validate: validateGlobalAssets,
                read: () => {
                    requireScene();
                    return cloneGlobals({
                        toneMapping: decode(TONE_MAPPING, globals.postSettings.toneMappingType, "tone mapping"),
                        fog: {
                            enabled: globals.fog.enabled,
                            type: decode(FOG, globals.fog.type, "fog type"),
                            density: globals.fog.fogDensity, start: globals.fog.fogStart, end: globals.fog.fogEnd,
                        },
                        ambient: { skyIllum: globals.ambient.skyIllum },
                        shadows: { enabled: globals.shadows.enabled, kind: decode(SHADOWS, globals.shadows.type, "shadow type") },
                        skybox: {
                            enabled: globals.skybox.enabled,
                            envmap: globals.skybox.envmap, diffuseMap: globals.skybox.diffuseMap,
                            reflectionMap: globals.skybox.reflectionMap,
                            lighting: decode(SKYBOX_LIGHTING, globals.skybox.envLightingType, "environment lighting"),
                        },
                    });
                },
                apply: (state) => {
                    requireScene();
                    const next = cloneGlobals(state);
                    const { fog, shadows, ambient, postSettings, skybox } = globals;
                    validateGlobalAssets(next);
                    const tone = TONE_MAPPING.indexOf(next.toneMapping);
                    const fogType = FOG.indexOf(next.fog.type), shadowType = SHADOWS.indexOf(next.shadows.kind);
                    // Info setters can update their readable value before renderer/model work throws.
                    // A failed apply must replay even equal values until the entire render state settles.
                    const force = applyIncomplete;
                    applyIncomplete = true;
                    // envmap clears reflectionMap (and diffuseMap/lighting when null).
                    // Restore the entire managed slot before enabling or changing lighting.
                    if (!next.skybox.enabled && (force || skybox.enabled)) skybox.enabled = false;
                    if (force || skybox.envmap !== next.skybox.envmap) skybox.envmap = next.skybox.envmap;
                    if (force || skybox.diffuseMap !== next.skybox.diffuseMap) skybox.diffuseMap = next.skybox.diffuseMap;
                    if (force || skybox.reflectionMap !== next.skybox.reflectionMap) skybox.reflectionMap = next.skybox.reflectionMap;
                    const lighting = SKYBOX_LIGHTING.indexOf(next.skybox.lighting);
                    if (force || skybox.envLightingType !== lighting) skybox.envLightingType = lighting;
                    if (next.skybox.enabled && (force || !skybox.enabled)) skybox.enabled = true;
                    // These setters can invalidate every model's pipeline state, even for equal values.
                    if (!next.fog.enabled && (force || fog.enabled)) fog.enabled = false;
                    if (force || fog.type !== fogType) fog.type = fogType;
                    if (force || fog.fogDensity !== next.fog.density) fog.fogDensity = next.fog.density;
                    if (force || fog.fogStart !== next.fog.start) fog.fogStart = next.fog.start;
                    if (force || fog.fogEnd !== next.fog.end) fog.fogEnd = next.fog.end;
                    if (next.fog.enabled && (force || !fog.enabled)) fog.enabled = true;
                    if (force || ambient.skyIllum !== next.ambient.skyIllum) ambient.skyIllum = next.ambient.skyIllum;
                    // Disable first: changing an enabled shadowMap to planar allocates a planar material.
                    if (!next.shadows.enabled && (force || shadows.enabled)) shadows.enabled = false;
                    if (force || shadows.type !== shadowType) shadows.type = shadowType;
                    if (next.shadows.enabled && (force || !shadows.enabled)) shadows.enabled = true;
                    // Fog's renderer can short-circuit equal macros. Tone mapping does not: a final
                    // forced write refreshes every model using the fully restored fog/shadow state.
                    if (force || postSettings.toneMappingType !== tone) postSettings.toneMappingType = tone;
                    applyIncomplete = false;
                },
            },
            subscribe: (listener) => {
                requireScene();
                let active = true;
                const removers: Array<() => void> = [];
                const unsubscribe = () => {
                    if (!active) return;
                    active = false;
                    cleanAll(removers);
                };
                const bind = (source: EventSource, type: string, event: "frame" | "resize" | "destroy") => {
                    const callback = () => { if (active) listener(event); };
                    // Include the current registration even if on() throws after attaching it.
                    removers.push(() => source.off(type, callback));
                    source.on(type, callback);
                };
                try {
                    bind(director, Director.EVENT_AFTER_UPDATE, "frame");
                    bind(view, "design-resolution-changed", "resize");
                    bind(view, "canvas-resize", "resize");
                    bind(director, Director.EVENT_BEFORE_SCENE_LAUNCH, "destroy");
                } catch (error) {
                    try { unsubscribe(); }
                    catch (cleanup) { throw new Stage3DApplyError(error, [cleanup]); }
                    throw error;
                }
                return unsubscribe;
            },
        };
    }
}
