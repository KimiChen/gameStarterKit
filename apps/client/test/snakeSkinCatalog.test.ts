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
    deriveSkinLayoutMetrics,
    getClientSnakeSkinPresentation,
    resolveClientSnakeSkinPresentation,
    validateClientSnakePresentationCatalog,
    validateFrameDefinition,
} from "../src/logic/rooms/snake/SnakePresentationCatalog";
import {
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
} from "../src/logic/rooms/snake/SnakePresentationCatalog.generated";

const IDS = [1, 2, 3, 4, 10, 11, 101, 111, 112, 132, 133, 139, 401, 403, 411, 701];

test("public skin catalog is exact, stable, uniquely defaulted and hash-compatible", () => {
    assert.deepEqual(PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => entry.skinId), IDS);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG.length, 16);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG.filter((entry) => entry.isDefault).length, 1);
    assert.equal(DEFAULT_SNAKE_SKIN.skinId, 1);
    assert.ok(PUBLIC_SNAKE_SKIN_CATALOG.every((entry) => entry.publicationState === "active" && entry.playerUsable && entry.contentVersion === 1));
    assert.ok(PUBLIC_SNAKE_SKIN_CATALOG.every((entry) => entry.technicalLabel === `皮肤 ${entry.skinId}`));
    assert.equal(EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH, PUBLIC_SNAKE_SKIN_CATALOG_HASH);
    assert.match(PUBLIC_SNAKE_SKIN_CATALOG_HASH, /^[a-f0-9]{64}$/);
    assert.match(CLIENT_SNAKE_PRESENTATION_HASH, /^[a-f0-9]{64}$/);
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
});
