import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_SNAKE_SKIN,
    PUBLIC_SNAKE_SKIN_CATALOG,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    validatePublicSnakeSkinCatalog,
} from "../src/shared/index";
import {
    CLIENT_SNAKE_PRESENTATION_CATALOG,
    CLIENT_SNAKE_PRESENTATION_HASH,
    SNAKE_ENTITY_PRESENTATION_CATALOG,
    SNAKE_PRESENTATION_VERSION,
    deriveSkinLayoutMetrics,
    getClientSnakeSkinPresentation,
    readSnakePresentationVersion,
    resolveClientSnakeSkinPresentation,
    resolveMagnetRuntimePresentation,
    validateClientSnakePresentationCatalog,
    validateFrameDefinition,
    validateSnakeEntityPresentationCatalog,
} from "../src/logic/rooms/snake/SnakePresentationCatalog";
import {
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    SNAKE_ENTITY_PRESENTATION_CATALOG_DATA,
    SNAKE_PRESENTATION_VERSION as GENERATED_SNAKE_PRESENTATION_VERSION,
} from "../src/logic/rooms/snake/SnakePresentationCatalogData";

const IDS = [1, 2, 3, 4, 10, 11, 101, 111, 112, 132, 133, 139, 401, 403, 411, 701];

test("public skin catalog is exact, stable, uniquely defaulted and hash-compatible", () => {
    assert.deepEqual(PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => entry.skinId), IDS);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG.length, 16);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG.filter((entry) => entry.isDefault).length, 1);
    assert.equal(DEFAULT_SNAKE_SKIN.skinId, 1);
    assert.ok(PUBLIC_SNAKE_SKIN_CATALOG.every((entry) => entry.publicationState === "active" && entry.playerUsable && entry.contentVersion === 1));
    assert.ok(PUBLIC_SNAKE_SKIN_CATALOG.every((entry) => entry.technicalLabel === `皮肤 ${entry.skinId}`));
    assert.equal(EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH, PUBLIC_SNAKE_SKIN_CATALOG_HASH);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG_HASH, "a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075");
    assert.match(PUBLIC_SNAKE_SKIN_CATALOG_HASH, /^[a-f0-9]{64}$/);
    assert.match(CLIENT_SNAKE_PRESENTATION_HASH, /^[a-f0-9]{64}$/);
    assert.notEqual(CLIENT_SNAKE_PRESENTATION_HASH, "62e1a6683a71db3ef0724cd6030114b7d9a64845723b14fa8c7c6d58a9302efe");
});

test("public exact validator rejects extra/missing fields, duplicate IDs and invalid defaults", () => {
    const valid = PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => ({ ...entry }));
    assert.throws(() => validatePublicSnakeSkinCatalog([{ ...valid[0], extra: true }]), /exactly/);
    const { technicalLabel: _removed, ...missing } = valid[0];
    assert.throws(() => validatePublicSnakeSkinCatalog([missing]), /exactly/);
    assert.throws(() => validatePublicSnakeSkinCatalog([valid[0], { ...valid[0], isDefault: false }]), /duplicate/);
    assert.throws(() => validatePublicSnakeSkinCatalog(valid.map((entry) => ({ ...entry, isDefault: false }))), /exactly one default/);
});

test("client presentation catalog covers all 16 direct fallback chains and source-preserved structures", () => {
    assert.deepEqual(CLIENT_SNAKE_PRESENTATION_CATALOG.map((entry) => entry.skinId), IDS);
    assert.equal(getClientSnakeSkinPresentation(1)?.fallbackSkinId, null);
    assert.ok(CLIENT_SNAKE_PRESENTATION_CATALOG.filter((entry) => entry.skinId !== 1).every((entry) => entry.fallbackSkinId === 1));
    assert.deepEqual(CLIENT_SNAKE_PRESENTATION_CATALOG.filter((entry) => entry.normal.tail || entry.boost.tail).map((entry) => entry.skinId), [403]);
    assert.equal(getClientSnakeSkinPresentation(411)?.boost.head.frames.length, 12);
    assert.equal(getClientSnakeSkinPresentation(701)?.normal.head.frames.length, 2);
    assert.equal(getClientSnakeSkinPresentation(701)?.boost.head.frames.length, 7);
    assert.equal(getClientSnakeSkinPresentation(3)?.boostSource, "inherit-normal");
    assert.equal(getClientSnakeSkinPresentation(4)?.boostSource, "inherit-normal");
    assert.ok(CLIENT_SNAKE_PRESENTATION_CATALOG.every((entry) => entry.bodyRenderType === 2 && entry.headAnchorY === 0.5));
    assert.ok(CLIENT_SNAKE_PRESENTATION_CATALOG.some((entry) => entry.normal.body.some((track) => track.sourceDistance < 0)));
    assert.ok(CLIENT_SNAKE_PRESENTATION_CATALOG.flatMap((entry) => entry.boost.head.frames).some((frame) => frame.durationFrames === 6));
    assert.ok(CLIENT_SNAKE_PRESENTATION_CATALOG.flatMap((entry) => [entry.normal.head, ...entry.normal.body, ...(entry.normal.tail ? [entry.normal.tail] : [])]).flatMap((track) => track.frames).some((frame) => frame.rotated));
});

test("client validator rejects orphan entries, fallback loops, incomplete inherited boost and public hash drift", () => {
    const clone = (): Array<Record<string, unknown>> => JSON.parse(JSON.stringify(CLIENT_SNAKE_PRESENTATION_CATALOG_DATA)) as Array<Record<string, unknown>>;
    {
        const entries = clone();
        entries[1].skinId = 999;
        assert.throws(() => validateClientSnakePresentationCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /unknown or duplicate/);
    }
    {
        const entries = clone();
        [entries[0], entries[1]] = [entries[1], entries[0]];
        assert.throws(() => validateClientSnakePresentationCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /out of public catalog order/);
    }
    {
        const entries = clone();
        entries[1].fallbackSkinId = 2;
        assert.throws(() => validateClientSnakePresentationCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /fall back directly/);
    }
    {
        const entries = clone();
        const boost = entries[2].boost as { sourceBodyOffset: number };
        boost.sourceBodyOffset += 1;
        assert.throws(() => validateClientSnakePresentationCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /inherit-normal.*differs/);
    }
    assert.throws(() => validateClientSnakePresentationCatalog(clone(), "stale"), /hash differs/);
});

test("NormalRepeat layout derives finite positive path-point distances from normal geometry only", () => {
    for (const entry of CLIENT_SNAKE_PRESENTATION_CATALOG) {
        const metrics = deriveSkinLayoutMetrics(entry, 1, 3);
        const largeScaleMetrics = deriveSkinLayoutMetrics(entry, 2.8, 3);
        assert.ok(Number.isFinite(metrics.firstBodyPointDistance) && metrics.firstBodyPointDistance > 0, `skin ${entry.skinId} first body`);
        assert.ok(Number.isFinite(metrics.repeatedBodyPointDistance) && metrics.repeatedBodyPointDistance > 0, `skin ${entry.skinId} repeated body`);
        if (entry.skinId === 403) assert.ok(metrics.tailPointDistance !== null && metrics.tailPointDistance > 0);
        else assert.equal(metrics.tailPointDistance, null);
        assert.ok(largeScaleMetrics.firstBodyPointDistance > 0 && largeScaleMetrics.repeatedBodyPointDistance > 0, `skin ${entry.skinId} scale 2.8`);
        const withMutatedBoost = { ...entry, boost: { ...entry.boost, sourceBodyOffset: 9999 } };
        assert.deepEqual(deriveSkinLayoutMetrics(withMutatedBoost, 1, 3), metrics, "boost geometry must not reorder path points");
    }
    assert.throws(() => deriveSkinLayoutMetrics(CLIENT_SNAKE_PRESENTATION_CATALOG[0], 1, 0), /pointDistance must be positive/);
});

test("runtime failures leave authoritative requested ID intact and deterministically fall back to skin 1", () => {
    const unknown = resolveClientSnakeSkinPresentation(999);
    assert.equal(unknown.requestedSkinId, 999);
    assert.equal(unknown.presentation?.skinId, 1);
    assert.equal(unknown.diagnostic, "unknown-skin-id");

    const missing = resolveClientSnakeSkinPresentation(411, (entry) => entry.skinId === 411 ? "missing" : "available");
    assert.equal(missing.presentation?.skinId, 1);
    assert.equal(missing.diagnostic, "resource-missing");

    const invalid = resolveClientSnakeSkinPresentation(403, (entry) => entry.skinId === 403 ? "invalid" : "available");
    assert.equal(invalid.presentation?.skinId, 1);
    assert.equal(invalid.diagnostic, "invalid-frame");

    const mismatch = resolveClientSnakeSkinPresentation(701, () => "available", "stale-public-hash");
    assert.equal(mismatch.presentation?.skinId, 1);
    assert.equal(mismatch.diagnostic, "public-hash-mismatch");

    const defaultMissing = resolveClientSnakeSkinPresentation(999, () => "missing");
    assert.equal(defaultMissing.presentation, null);
    assert.equal(defaultMissing.diagnostic, "default-unavailable");

    // Resolver deliberately ignores publicationState: a complete catalog member (including future retired entries)
    // resolves itself; retirement only stops new acquisition on the server.
    const complete = resolveClientSnakeSkinPresentation(10);
    assert.equal(complete.presentation?.skinId, 10);
    assert.equal(complete.usedFallback, false);
});

test("frame bounds reject deployment-time invalid rects, including packed rotated dimensions", () => {
    const frame = getClientSnakeSkinPresentation(403)!.normal.head.frames[0];
    assert.equal(frame.rotated, true);
    assert.doesNotThrow(() => validateFrameDefinition(frame, 256, 256));
    assert.throws(() => validateFrameDefinition({ ...frame, rect: { ...frame.rect, x: 250 } }, 256, 256), /outside/);
});

test("food, wreck, walls, audio and FX presentation policy is explicit", () => {
    assert.equal(SNAKE_PRESENTATION_VERSION, 2);
    assert.equal(GENERATED_SNAKE_PRESENTATION_VERSION, 2);
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.presentationVersion, 2);
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.grid.spacing, 32);
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.grid.mapMargin, 16);
    assert.deepEqual(SNAKE_ENTITY_PRESENTATION_CATALOG.food.dots.map((entry) => entry.kind), ["dot-1", "dot-2", "dot-3", "dot-4", "dot-5", "dot-6", "dot-7"]);
    assert.ok(SNAKE_ENTITY_PRESENTATION_CATALOG.food.dots.every((entry) => entry.displaySize === 16));
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.food.star.displaySize, 42);
    assert.deepEqual(SNAKE_ENTITY_PRESENTATION_CATALOG.food.batch, { model: "single-atlas-single-material", capacity: 1030 });
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.wreck.speed.displaySize, 22);
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.wreck.aiDeath.displaySize, 34);
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.wreck.skins.length, 16);
    assert.deepEqual(SNAKE_ENTITY_PRESENTATION_CATALOG.walls.map((entry) => entry.theme), ["light", "dark"]);
    const personalResult = SNAKE_ENTITY_PRESENTATION_CATALOG.audio.find((entry) => entry.event === "personal-run-result");
    assert.equal(personalResult?.policy, "silent");
    assert.equal(personalResult?.asset, null);
    assert.equal(personalResult?.resourceHash, null);
    assert.equal(personalResult?.endlessReachability, "silent");
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.audio.find((entry) => entry.event === "time-over")?.policy, "historical-unused");
    assert.equal(SNAKE_ENTITY_PRESENTATION_CATALOG.effects.find((entry) => entry.event === "death-explosion")?.policy, "none");
    assert.deepEqual(SNAKE_ENTITY_PRESENTATION_CATALOG.identity, {
        ai: { arrow: "none", avatar: "none", nameplate: "text", outline: "none" },
        otherHuman: { arrow: "none", nameplate: "text", outline: "none" },
        seatTinting: "forbidden",
        self: { arrow: "none", nameplate: "none", outline: "fine-white" },
        skinTint: [255, 255, 255, 255],
    });
    const collectMagnet = SNAKE_ENTITY_PRESENTATION_CATALOG.audio.find((entry) => entry.event === "collect-magnet");
    assert.equal(collectMagnet?.asset, "plugins/snake/snake_sfx_collect_magnet");
    assert.equal(collectMagnet?.sfxOnGuarded, true);
    assert.equal(collectMagnet?.playback, "single-instance");
    assert.equal(collectMagnet?.maxConcurrent, 1);
    assert.equal(collectMagnet?.missingPolicy, "silent");
    const magnetLoop = SNAKE_ENTITY_PRESENTATION_CATALOG.audio.find((entry) => entry.event === "magnet-active-loop");
    assert.equal(magnetLoop?.policy, "silent");
    assert.equal(magnetLoop?.asset, null);
    assert.equal(magnetLoop?.resourceHash, null);
});

test("version-2 magnet catalog has one exact world frame, one passive alias and one registered aura recipe", () => {
    assert.equal(readSnakePresentationVersion({ historical: true }), 1);
    assert.equal(readSnakePresentationVersion(SNAKE_ENTITY_PRESENTATION_CATALOG_DATA), 2);
    assert.throws(() => readSnakePresentationVersion({ presentationVersion: 3 }), /unsupported/);
    assert.doesNotThrow(() => validateSnakeEntityPresentationCatalog(SNAKE_ENTITY_PRESENTATION_CATALOG_DATA));
    const magnet = SNAKE_ENTITY_PRESENTATION_CATALOG.tools.magnet;
    assert.equal(magnet.kind, "magnet");
    assert.equal(magnet.sourceToolId, 10001);
    assert.equal(magnet.world.logicalName, "magnet");
    assert.equal(magnet.world.textureAsset, "plugins/snake/snake_magnet_tools");
    assert.equal(magnet.world.displaySize, 70);
    assert.deepEqual(magnet.world.frame.rect, { x: 346, y: 256, width: 84, height: 92 });
    assert.equal(magnet.statusIcon.logicalAliasOf, "magnet");
    assert.equal(magnet.statusIcon.interactive, false);
    assert.equal(magnet.statusIcon.textureAsset, magnet.world.textureAsset);
    assert.deepEqual(magnet.statusIcon.frame, magnet.world.frame);
    assert.equal(magnet.activeEffect.recipeAsset, "plugins/snake/snake_magnet_aura");
    assert.deepEqual(magnet.activeEffect.fallback, { logicalName: "magnet-status-icon", placement: "over-head" });
});

test("entity validator rejects magnet entry/rect/alias/button/fallback, identity and audio policy drift", () => {
    const clone = (): Record<string, any> => JSON.parse(JSON.stringify(SNAKE_ENTITY_PRESENTATION_CATALOG_DATA)) as Record<string, any>;
    {
        const value = clone();
        value.tools.extraWorldTool = value.tools.magnet;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /presentation\.tools must contain exactly/);
    }
    {
        const value = clone();
        delete value.tools.magnet;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /presentation\.tools must contain exactly/);
    }
    {
        const value = clone();
        value.tools.magnet.world.frame.rect.x = 450;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /outside the loaded texture/);
    }
    {
        const value = clone();
        value.tools.magnet.world.displaySize = 69;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /displaySize/);
    }
    {
        const value = clone();
        value.tools.magnet.statusIcon.textureAsset = "plugins/snake/copied_status_icon";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /exact logical alias/);
    }
    {
        const value = clone();
        value.tools.magnet.statusIcon.interactive = true;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /non-interactive/);
    }
    {
        const value = clone();
        value.tools.magnet.statusIcon.buttonSlot = 2;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /must contain exactly/);
    }
    {
        const value = clone();
        value.tools.magnet.activeEffect.recipeAsset = "plugins/snake/speed_fx";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /registered magnet aura recipe/);
    }
    {
        const value = clone();
        value.tools.magnet.activeEffect.fallback.logicalName = "magnet-active";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /fallback/);
    }
    {
        const value = clone();
        value.identity.self.arrow = "procedural";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /old arrow/);
    }
    {
        const value = clone();
        value.identity.ai.outline = "procedural";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /AI outline/);
    }
    {
        const value = clone();
        value.audio.find((entry: any) => entry.event === "collect-magnet").maxConcurrent = 4;
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /single-instance/);
    }
    {
        const value = clone();
        value.audio.find((entry: any) => entry.event === "magnet-active-loop").asset = "plugins/snake/guessed_loop";
        assert.throws(() => validateSnakeEntityPresentationCatalog(value), /resource-free/);
    }
});

test("magnet runtime blocks an invisible world item and falls back once from a missing aura to the passive icon", () => {
    const worldMissing = resolveMagnetRuntimePresentation((kind) => kind === "world-texture" ? "missing" : "available");
    assert.deepEqual(worldMissing, { battleReady: false, world: null, activeVisual: null, diagnostic: "world-resource-missing" });

    const probes: string[] = [];
    const auraMissing = resolveMagnetRuntimePresentation((kind, asset) => {
        probes.push(`${kind}:${asset}`);
        return kind === "aura-recipe" ? "missing" : "available";
    });
    assert.equal(auraMissing.battleReady, true);
    assert.equal(auraMissing.activeVisual?.mode, "status-icon-fallback");
    assert.equal(auraMissing.activeVisual?.logicalName, "magnet-status-icon");
    assert.equal(auraMissing.activeVisual?.placement, "over-head");
    assert.deepEqual(probes, [
        "world-texture:plugins/snake/snake_magnet_tools",
        "aura-recipe:plugins/snake/snake_magnet_aura",
    ], "fallback is a single direct hop and does not probe recursively");

    const ready = resolveMagnetRuntimePresentation();
    assert.equal(ready.battleReady, true);
    assert.deepEqual(ready.activeVisual, { mode: "aura", recipeAsset: "plugins/snake/snake_magnet_aura" });
});
