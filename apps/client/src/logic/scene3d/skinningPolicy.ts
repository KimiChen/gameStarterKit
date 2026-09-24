import type { Stage3DQuality } from "./qualityTiers";

/** A consumer supplies an actual measured frame window; absence is not evidence of a slow GPU. */
export interface BakedFrameBudget {
    readonly observedP95Ms: number;
    readonly budgetP95Ms: number;
}

export function resolveSkinningPolicy(quality: Stage3DQuality, measured?: BakedFrameBudget) {
    if (measured && (!Number.isFinite(measured.observedP95Ms) || measured.observedP95Ms <= 0
        || !Number.isFinite(measured.budgetP95Ms) || measured.budgetP95Ms <= 0)) {
        throw new RangeError("Skinning frame budget requires positive finite milliseconds");
    }
    const reason = quality.jointTexture === "unavailable" ? "joint-texture-unavailable"
        : measured && measured.observedP95Ms > measured.budgetP95Ms ? "measured-budget" : "baked";
    const degraded = reason !== "baked";
    return Object.freeze({ reason, degraded, mode: degraded ? "realtime" as const : "baked" as const,
        maxUnits: degraded ? Math.min(quality.maxUnits, quality.maxUnitsWithoutInstancing) : quality.maxUnits });
}
