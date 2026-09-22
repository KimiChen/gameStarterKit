import { defaultQualityData } from "./qualityDefaults.generated";
import { parseQualityTable } from "./qualityData";
import type { QualityPolicy, QualityTable, QualityTier, ShadowQuality } from "./qualityData";

export type { QualityTier } from "./qualityData";
export interface QualityCapabilities {
    readonly instancing: boolean;
    readonly floatJointTexture: boolean;
    readonly rgba8JointTexture: boolean;
    readonly shadowMap: boolean;
    readonly astc: boolean;
}
export interface QualityDevice {
    readonly platform: "wechat" | "mobile" | "desktop" | "unknown";
    readonly api: "webgl1" | "webgl2" | "native" | "unknown";
    readonly renderer: string;
    readonly capabilities: QualityCapabilities;
}
export interface QualityOverrides { readonly quality?: string; readonly shadows?: string; }
export interface Stage3DQuality extends Omit<QualityPolicy, "shadows"> {
    readonly tier: QualityTier;
    readonly detectedTier: QualityTier;
    readonly overridden: boolean;
    readonly shadows: ShadowQuality;
    readonly instancing: boolean;
    readonly jointTexture: "float" | "rgba8" | "unavailable";
    readonly bakedSkinningInstancing: boolean;
    /** Realtime skinning must never reuse the baked instancing setting. */
    readonly realtimeSkinningInstancing: false;
    readonly textureFormat: "astc" | "png";
    readonly device: QualityDevice;
}

export const DEFAULT_QUALITY_TABLE = parseQualityTable(defaultQualityData);
export const UNKNOWN_QUALITY_DEVICE: QualityDevice = Object.freeze({
    platform: "unknown", api: "unknown", renderer: "",
    capabilities: Object.freeze({ instancing: false, floatJointTexture: false, rgba8JointTexture: false, shadowMap: false, astc: false }),
});

// Conservative recognition rules, not a hardware benchmark. Unknown or masked names stay low.
const LOW_GPU = /swiftshader|llvmpipe|software|mali[- ]?(?:4\d\d|t\d+)|adreno\s*(?:\(tm\)\s*)?[2-5]\d\d\b|apple a(?:[1-9]|1[01])\b/i;
const MOBILE_HIGH_GPU = /adreno\s*(?:\(tm\)\s*)?7\d\d\b|mali[- ]g(?:715|720)\b|apple a1[6-9]\b/i;
const MOBILE_MEDIUM_GPU = /adreno\s*(?:\(tm\)\s*)?6\d\d\b|mali[- ]g7\d\b|apple a1[2-5]\b/i;
const DESKTOP_GPU = /apple m[1-4]\b|nvidia.*(?:geforce|rtx|gtx)|(?:amd|ati).*radeon|intel.*(?:iris|uhd|hd graphics)/i;

export function detectQualityTier(device: QualityDevice): QualityTier {
    if (device.platform === "wechat" || device.platform === "unknown" || device.api === "webgl1" || device.api === "unknown"
        || LOW_GPU.test(device.renderer)) return "low";
    if (device.platform === "mobile") {
        if (MOBILE_HIGH_GPU.test(device.renderer)) return "high";
        if (MOBILE_MEDIUM_GPU.test(device.renderer)) return "medium";
        return "low";
    }
    return DESKTOP_GPU.test(device.renderer) ? "high" : "low";
}

/** Development overrides change requested policy only; real capabilities always clamp features. */
export function resolveQuality(device: QualityDevice, development = false, overrides: QualityOverrides = {},
    table: QualityTable = DEFAULT_QUALITY_TABLE): Stage3DQuality {
    const detectedTier = detectQualityTier(device);
    const requested = development ? overrides.quality : undefined;
    const tier = requested === "low" || requested === "medium" || requested === "high" ? requested : detectedTier;
    const policy = table.tiers[tier], caps = device.capabilities;
    const shadows = development && overrides.shadows === "0" ? "off" : policy.shadows;
    const jointTexture = caps.floatJointTexture ? "float" : caps.rgba8JointTexture ? "rgba8" : "unavailable";
    return Object.freeze({
        ...policy, tier, detectedTier, overridden: tier !== detectedTier || shadows !== policy.shadows,
        shadows: caps.shadowMap ? shadows : "off",
        maxUnits: caps.instancing && jointTexture !== "unavailable" ? policy.maxUnits : policy.maxUnitsWithoutInstancing,
        instancing: caps.instancing, jointTexture,
        bakedSkinningInstancing: caps.instancing && jointTexture !== "unavailable",
        realtimeSkinningInstancing: false,
        textureFormat: caps.astc ? "astc" : "png",
        device: Object.freeze({ ...device, capabilities: Object.freeze({ ...caps }) }),
    });
}
