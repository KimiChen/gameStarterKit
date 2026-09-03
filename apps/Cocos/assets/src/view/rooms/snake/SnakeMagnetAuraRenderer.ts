/** S1-12 magnet-active recipe 的轻量 Cocos 3 运行时：节点树、sprite/particle 图层与循环关键帧。 */
import { Color, Node, Sprite, SpriteFrame, UITransform } from "cc";
import type { FrameDefinition } from "../../../logic/rooms/snake/SnakePresentationCatalog";

interface Vec3Value { readonly x: number; readonly y: number; readonly z: number }
interface AuraDependency {
    readonly logicalName: string;
    readonly textureAsset: string;
    readonly frame: FrameDefinition;
}
interface AuraKeyframe { readonly time: number; readonly value: number | Vec3Value }
interface AuraProperty { readonly property: "opacity" | "position" | "scale"; readonly keyframes: readonly AuraKeyframe[] }
interface AuraTrack { readonly nodePath: string; readonly properties: readonly AuraProperty[] }
interface AuraComponent { readonly type: string; readonly texture?: string }
interface AuraNodeRecipe {
    readonly name: string;
    readonly opacity: number;
    readonly transform: {
        readonly eulerDegrees: Vec3Value;
        readonly position: Vec3Value;
        readonly scale: Vec3Value;
    };
    readonly components: readonly AuraComponent[];
    readonly children: readonly AuraNodeRecipe[];
}
interface AuraRecipe {
    readonly recipeVersion: 1;
    readonly logicalName: "magnet-active";
    readonly animation: {
        readonly durationSeconds: number;
        readonly wrapMode: "loop";
        readonly tracks: readonly AuraTrack[];
    };
    readonly root: AuraNodeRecipe;
    readonly textureDependencies: readonly AuraDependency[];
}
interface RuntimeNode {
    readonly node: Node;
    readonly sprite: Sprite | null;
    readonly baseOpacity: number;
    readonly basePosition: Vec3Value;
    readonly baseScale: Vec3Value;
    readonly track: AuraTrack | null;
}

const DEPENDENCY_NAMES = new Set([
    "x_lighting01", "x_lighting02", "x_lighting03", "xt_s_lighting", "xt_s_lighting02",
]);

function objectOf(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

/** 资源装载前的 fail-closed 路由；不完整 recipe 只允许走 status-icon fallback。 */
export function snakeMagnetAuraDependencies(input: unknown): readonly AuraDependency[] | null {
    const value = objectOf(input);
    if (value?.recipeVersion !== 1 || value.logicalName !== "magnet-active") return null;
    const animation = objectOf(value.animation);
    const root = objectOf(value.root);
    if (!animation || animation.wrapMode !== "loop" || typeof animation.durationSeconds !== "number"
        || !Number.isFinite(animation.durationSeconds) || animation.durationSeconds <= 0
        || !Array.isArray(animation.tracks) || !root || !Array.isArray(value.textureDependencies)) return null;
    const dependencies: AuraDependency[] = [];
    for (const candidate of value.textureDependencies) {
        const dependency = objectOf(candidate);
        const frame = objectOf(dependency?.frame);
        const rect = objectOf(frame?.rect);
        const pivot = objectOf(frame?.pivot);
        if (!dependency || typeof dependency.logicalName !== "string" || typeof dependency.textureAsset !== "string"
            || !DEPENDENCY_NAMES.has(dependency.logicalName) || !frame || !rect || !pivot) return null;
        dependencies.push(dependency as unknown as AuraDependency);
    }
    if (dependencies.length !== DEPENDENCY_NAMES.size
        || new Set(dependencies.map((entry) => entry.logicalName)).size !== DEPENDENCY_NAMES.size) return null;
    return dependencies;
}

function asRecipe(input: unknown): AuraRecipe {
    if (!snakeMagnetAuraDependencies(input)) throw new TypeError("invalid magnet-active recipe");
    return input as AuraRecipe;
}

function sample(keyframes: readonly AuraKeyframe[], time: number): number | Vec3Value | null {
    if (keyframes.length === 0) return null;
    let right = keyframes.findIndex((entry) => entry.time >= time);
    if (right < 0) return keyframes[keyframes.length - 1].value;
    if (right === 0 || keyframes[right].time === time) return keyframes[right].value;
    const before = keyframes[right - 1];
    const after = keyframes[right];
    const ratio = (time - before.time) / Math.max(1e-9, after.time - before.time);
    if (typeof before.value === "number" && typeof after.value === "number") {
        return before.value + (after.value - before.value) * ratio;
    }
    if (typeof before.value !== "number" && typeof after.value !== "number") {
        return {
            x: before.value.x + (after.value.x - before.value.x) * ratio,
            y: before.value.y + (after.value.y - before.value.y) * ratio,
            z: before.value.z + (after.value.z - before.value.z) * ratio,
        };
    }
    return before.value;
}

export class SnakeMagnetAuraRenderer {
    private readonly root: Node;
    private readonly runtime: RuntimeNode[] = [];
    private readonly recipe: AuraRecipe;

    constructor(
        parent: Node,
        uiLayer: number,
        recipeInput: unknown,
        frames: ReadonlyMap<string, SpriteFrame>,
    ) {
        this.recipe = asRecipe(recipeInput);
        this.root = new Node("snake-magnet-aura");
        this.root.layer = uiLayer;
        this.root.addComponent(UITransform);
        parent.addChild(this.root);
        const tracks = new Map(this.recipe.animation.tracks.map((track) => [track.nodePath, track]));
        const build = (source: AuraNodeRecipe, parentNode: Node, parentPath: string): void => {
            const node = new Node(`snake-aura-${source.name}`);
            node.layer = uiLayer;
            node.addComponent(UITransform);
            parentNode.addChild(node);
            node.setPosition(source.transform.position.x, source.transform.position.y, source.transform.position.z);
            node.setScale(source.transform.scale.x, source.transform.scale.y, source.transform.scale.z);
            node.angle = source.transform.eulerDegrees.z;
            const component = source.components.find((entry) =>
                (entry.type === "sprite" || entry.type === "particle-system") && typeof entry.texture === "string");
            const frame = component?.texture ? frames.get(component.texture) : undefined;
            const sprite = frame ? node.addComponent(Sprite) : null;
            if (sprite && frame) {
                sprite.spriteFrame = frame;
                sprite.color = new Color(255, 255, 255, source.opacity);
            }
            const path = parentPath ? `${parentPath}/${source.name}` : source.name;
            this.runtime.push({
                node,
                sprite,
                baseOpacity: source.opacity,
                basePosition: source.transform.position,
                baseScale: source.transform.scale,
                track: tracks.get(path) ?? null,
            });
            for (const child of source.children) build(child, node, path);
        };
        for (const child of this.recipe.root.children) build(child, this.root, "");
        if (!this.runtime.some((entry) => entry.sprite)) {
            this.root.destroy();
            throw new TypeError("magnet-active recipe has no renderable layer");
        }
    }

    render(x: number, y: number, scale: number, tick: number): void {
        this.root.active = true;
        this.root.setPosition(x, y, 0);
        this.root.setScale(scale, scale, 1);
        const duration = this.recipe.animation.durationSeconds;
        const time = (((tick * 0.05) % duration) + duration) % duration;
        for (const runtime of this.runtime) {
            let opacity = runtime.baseOpacity;
            let position = runtime.basePosition;
            let nodeScale = runtime.baseScale;
            for (const property of runtime.track?.properties ?? []) {
                const value = sample(property.keyframes, time);
                if (property.property === "opacity" && typeof value === "number") opacity = value;
                else if (property.property === "position" && value && typeof value !== "number") position = value;
                else if (property.property === "scale" && value && typeof value !== "number") nodeScale = value;
            }
            runtime.node.setPosition(position.x, position.y, position.z);
            runtime.node.setScale(nodeScale.x, nodeScale.y, nodeScale.z);
            if (runtime.sprite) runtime.sprite.color = new Color(255, 255, 255, Math.max(0, Math.min(255, opacity)));
        }
    }

    hide(): void { this.root.active = false; }

    dispose(): void {
        this.root.destroy();
        this.runtime.length = 0;
    }
}
