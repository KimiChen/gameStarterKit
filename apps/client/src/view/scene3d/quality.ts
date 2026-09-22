import { director, gfx, sys } from "cc";
import { DEV } from "cc/env";
import { resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../../logic/scene3d/qualityTiers";
import type { QualityDevice, Stage3DQuality } from "../../logic/scene3d/qualityTiers";

/** Creator 3.8.8 cc.d.ts:8480/8497/8762/9022/9626–9879, sys:22061–22084. */
export function readQualityDevice(): QualityDevice {
    const device = director.root?.device;
    if (!device) return UNKNOWN_QUALITY_DEVICE;
    const sampled = (format: gfx.Format) => (device.getFormatFeatures(format) & gfx.FormatFeatureBit.SAMPLED_TEXTURE) !== 0;
    const vertexTextures = device.capabilities.maxVertexTextureUnits > 0;
    const api = device.gfxAPI;
    return {
        platform: sys.platform === sys.Platform.WECHAT_GAME ? "wechat" : sys.isMobile ? "mobile"
            : sys.isBrowser || sys.isNative ? "desktop" : "unknown",
        api: api === gfx.API.WEBGL || api === gfx.API.GLES2 ? "webgl1"
            : api === gfx.API.WEBGL2 ? "webgl2"
            : api === gfx.API.GLES3 || api === gfx.API.METAL || api === gfx.API.VULKAN ? "native" : "unknown",
        renderer: device.renderer,
        capabilities: {
            instancing: device.hasFeature(gfx.Feature.INSTANCED_ARRAYS),
            floatJointTexture: vertexTextures && sampled(gfx.Format.RGBA32F),
            rgba8JointTexture: vertexTextures && sampled(gfx.Format.RGBA8),
            shadowMap: sampled(gfx.Format.RGBA8) && (device.getFormatFeatures(gfx.Format.RGBA8) & gfx.FormatFeatureBit.RENDER_TARGET) !== 0,
            astc: sampled(gfx.Format.ASTC_RGBA_8X8) && sampled(gfx.Format.ASTC_RGBA_6X6),
        },
    };
}

/** Read on demand: bootstrap never caches a pre-render UNKNOWN device. No GPU spoofing URL parameters. */
export function readStage3DQuality(): Stage3DQuality {
    const search = DEV ? (globalThis as { location?: { search?: string } }).location?.search : undefined;
    const query = search ? new URLSearchParams(search) : undefined;
    return resolveQuality(readQualityDevice(), DEV, { quality: query?.get("quality") ?? undefined, shadows: query?.get("shadows") ?? undefined });
}
