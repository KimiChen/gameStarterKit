import fs from "node:fs";
import path from "node:path";
import {
  SourceTracker,
  git,
  listFiles,
  sha256,
  stableJson,
  writeJson,
} from "./core.mjs";
import { extractModel } from "./model.mjs";
import { renderGoldens } from "./render.mjs";

const TOOL_DIR = path.dirname(new URL(import.meta.url).pathname);

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`);
}

function decorateEvidenceIndex(entries, sourceEntries) {
  const byPath = new Map(sourceEntries.map((entry) => [entry.path, entry]));
  return entries.map((entry) => ({
    ...entry,
    sha256: byPath.get(entry.path)?.sha256 ?? null,
  }));
}

function sourceHashSelection(sourceEntries, selectedPaths) {
  const byPath = new Map(sourceEntries.map((entry) => [entry.path, entry]));
  return selectedPaths.sort().map((relativePath) => {
    const entry = byPath.get(relativePath);
    if (!entry) throw new Error(`Golden metadata refers to an unread source file: ${relativePath}`);
    return { path: relativePath, sha256: entry.sha256 };
  });
}

function evidenceReadme(spec, model, sourceFileCount, goldenCount) {
  return `# Snake S0 replication evidence

Status: **complete**. Evidence date: ${spec.evidenceDate}.

This directory is a deterministic evidence bundle for \`${spec.configId}\`. The PNG files are
**source-derived static reconstructions**, not unmodified screenshots of a running original.
They establish auditable source values, geometry, source atlas identity, and repeatable comparison
fixtures; they do not establish WeChat plugin, original engine-runtime, or device-renderer behavior.

## Frozen identities

| Item | Identity |
|---|---|
| Source archive commit | \`${spec.sourceCommit}\` |
| Target gap baseline commit | \`${spec.targetBaselineCommit}\` |
| Evidence tool | \`${spec.evidenceVersion}\` |
| Combination hash | \`${model.layers.combinationSha256}\` |
| Deterministic seed | \`${spec.seed}\` |
| Source inputs read | ${sourceFileCount} |
| Golden PNG files | ${goldenCount} |

The source manifest records a source-relative path, symbolic-link target string where applicable,
resolved path, resolved content SHA-256, size, and read purpose. The target gap matrix is taken with
\`git show\` from the frozen target commit, so later S1/S2 work cannot rewrite the historical S0
baseline.

## Important artifacts

- \`config/new-endless-v2-source-4896.json\`: exact source object parsed without executing source JS.
- \`config/new-endless-portrait-v2-map-4096.json\`: exact object with only map width/height changed.
- \`config/config-hashes.json\`: five independent layer hashes and the combination hash.
- \`fixtures/path-point-vectors.json\`: full 71-step table plus the seven frozen boundary vectors.
- \`fixtures/deadline-vectors.json\`: \`totalTime=0\`/no-deadline behavior and the independent relive deadline.
- \`presentation/palette.json\`: exact light/dark source values and boundary semantics.
- \`goldens/manifest.json\`: PNG identities and per-image metadata sidecars.
- \`current-gap-matrix.json\`: current-vs-target facts, stage owners, and verification routes.
- \`SHA256SUMS\`: byte identities for every payload file in the bundle.

## Rebuild and check

From the target repository root:

\`\`\`bash
node tools/snake-s0-replication/cli.mjs \\
  --source /Users/kimi/work/tanchishe/wegameVersion \\
  --write

node tools/snake-s0-replication/cli.mjs \\
  --source /Users/kimi/work/tanchishe/wegameVersion \\
  --check
\`\`\`

\`--check\` rebuilds in a fresh temporary directory and requires the complete file list and every
byte to match. No generated evidence file is imported by \`apps/**\`.
`;
}

function buildManifest(outputRoot, spec, model) {
  const payloadFiles = listFiles(outputRoot).filter((file) => file !== "bundle-manifest.json" && file !== "SHA256SUMS");
  const payload = payloadFiles.map((relativePath) => {
    const data = fs.readFileSync(path.join(outputRoot, relativePath));
    return { path: relativePath, size: data.length, sha256: sha256(data) };
  });
  const manifest = {
    schemaVersion: 1,
    evidenceVersion: spec.evidenceVersion,
    evidenceDate: spec.evidenceDate,
    configId: spec.configId,
    sourceCommit: spec.sourceCommit,
    targetBaselineCommit: spec.targetBaselineCommit,
    combinationSha256: model.layers.combinationSha256,
    payloadScope: "all files except bundle-manifest.json and SHA256SUMS",
    payload,
  };
  writeJson(path.join(outputRoot, "bundle-manifest.json"), manifest);
  const sumFiles = listFiles(outputRoot).filter((file) => file !== "SHA256SUMS");
  const sums = sumFiles.map((relativePath) => `${sha256(fs.readFileSync(path.join(outputRoot, relativePath)))}  ${relativePath}`).join("\n");
  writeText(path.join(outputRoot, "SHA256SUMS"), sums);
  return { payloadCount: payload.length, totalFileCount: sumFiles.length + 1 };
}

export function buildEvidence({ sourceRoot, targetRoot, outputRoot }) {
  const spec = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, "baseline-spec.json"), "utf8"));
  const sourceHead = git(sourceRoot, ["rev-parse", "HEAD"]);
  if (sourceHead !== spec.sourceCommit) throw new Error(`Source commit mismatch: expected ${spec.sourceCommit}, got ${sourceHead}`);
  const sourceStatus = git(sourceRoot, ["status", "--short", "--untracked-files=all"]);
  if (sourceStatus !== "") throw new Error(`Source archive must be clean:\n${sourceStatus}`);
  const targetObject = git(targetRoot, ["rev-parse", `${spec.targetBaselineCommit}^{commit}`]);
  if (targetObject !== spec.targetBaselineCommit) throw new Error(`Target baseline commit is unavailable: ${spec.targetBaselineCommit}`);

  fs.mkdirSync(outputRoot, { recursive: true });
  const tracker = new SourceTracker(sourceRoot);
  const model = extractModel({ tracker, spec, targetRoot });
  tracker.verifyUnchanged();
  const sourceEntries = tracker.manifest();

  writeJson(path.join(outputRoot, "config/new-endless-v2-source-4896.json"), model.sourceV2);
  writeJson(path.join(outputRoot, "config/new-endless-portrait-v2-map-4096.json"), model.targetV2);
  writeJson(path.join(outputRoot, "config/map-override.json"), {
    configId: "newEndlessPortraitV2Map4096",
    transform: "map-only override; not a coordinate scale",
    sourceWorld: spec.source.world,
    targetWorld: spec.target.world,
    outerBandPerSide: (spec.source.world.width - spec.target.world.width) / 2,
    residentFoodCount: model.targetV2.endless_dot_count + model.targetV2.endless_star_count,
    density: {
      sourceFoodPerMillionWorldUnits: (model.sourceV2.endless_dot_count + model.sourceV2.endless_star_count) * 1_000_000 / (model.sourceV2.map_width * model.sourceV2.map_height),
      targetFoodPerMillionWorldUnits: (model.targetV2.endless_dot_count + model.targetV2.endless_star_count) * 1_000_000 / (model.targetV2.map_width * model.targetV2.map_height),
      targetOverSourceRatio: (model.sourceV2.map_width * model.sourceV2.map_height) / (model.targetV2.map_width * model.targetV2.map_height),
      interpretation: "The approved map-only override keeps 1030 foods and therefore raises density by about 1.43x; it must not auto-scale the count to about 721.",
    },
    changedFields: model.configFixtures.changedFields,
    unchangedSourceObjectSha256: sha256(stableJson(model.sourceV2)),
    targetObjectSha256: sha256(stableJson(model.targetV2)),
  });
  writeJson(path.join(outputRoot, "config/v2-field-comparison.json"), model.configFixtures);
  for (const layer of model.layers.layers) writeJson(path.join(outputRoot, `config/layers/${layer.id}.json`), layer);
  writeJson(path.join(outputRoot, "config/config-hashes.json"), {
    schemaVersion: 1,
    canonicalization: "recursively lexicographically sorted JSON object keys; arrays retain order; two-space indent; LF; final newline",
    layers: model.layers.hashes,
    components: {
      sourceV2SnapshotSha256: sha256(stableJson(model.sourceV2)),
      mapOverrideSha256: sha256(stableJson(model.configFixtures.changedFields)),
      pointStepConfigSha256: sha256(stableJson(model.sourceV2.point_step_config)),
      targetV2SnapshotSha256: sha256(stableJson(model.targetV2)),
    },
    combination: model.layers.combination,
    combinationSha256: model.layers.combinationSha256,
  });

  writeJson(path.join(outputRoot, "fixtures/path-point-vectors.json"), {
    schemaVersion: 1,
    definition: "ordered coverage: floor(sum(segmentCoverage / step_length)) * STEP_POINT_COUNT(2); duplicate endpoint is retained",
    pointStepConfig: model.sourceV2.point_step_config,
    vectors: model.fixtures.pathVectors,
  });
  writeJson(path.join(outputRoot, "fixtures/coordinate-vectors.json"), {
    schemaVersion: 1,
    transform: "source (x,y) -> portrait (-y,x)",
    viewport: { source: spec.source.viewport, portrait: spec.target.viewport },
    world: { sourceEvidence: spec.source.world, rotatedEvidence: spec.source.world, targetBounds: spec.target.world },
    globalScaleForbidden: true,
    vectors: model.fixtures.coordinateVectors,
  });
  writeJson(path.join(outputRoot, "fixtures/deadline-vectors.json"), model.fixtures.deadlineVectors);
  writeJson(path.join(outputRoot, "fixtures/endless-control-flow.json"), {
    schemaVersion: 1,
    sourceModeAndBattlefieldAreOrthogonal: true,
    sourceFlow: [
      { order: 1, symbol: "GameEntryUtil gameEntryConfig", fact: "Endless and TimeLimit both route to bundle Game / scene Game" },
      { order: 2, symbol: "Game.init mode switch", fact: "Endless assigns totalTime=0; TimeLimit assigns TIME_LIMIT_MODE_TOTAL_TIME" },
      { order: 3, symbol: "GameStore.isNewEndless", fact: "Endless/UGC family plus endless_snake_min_length>0; TimeLimit is excluded" },
      { order: 4, symbol: "ConfigStore.getNewEndlessConfig + Game.assignByConfigs", fact: "selected V2 battlefield values override map/food/camera/body behavior" },
      { order: 5, symbol: "Game.initGame", fact: "remaining-time HUD is active only when totalTime>0" },
      { order: 6, symbol: "Game.updateGameTime", fact: "only positive totalTime can call timeIsOver; otherwise gameTime increments" },
    ],
    targetFlow: [
      { order: 1, fact: "world declares totalTime=0, matchDurationTicks=0, hasDeadline=false, endTick=null" },
      { order: 2, fact: "3-second preparation gates first active input; it is not match duration" },
      { order: 3, fact: "done-by-time requires hasDeadline && endTick!==null && tick>=endTick" },
      { order: 4, fact: "ticks 1800, 1801, and later continue; Snake mode does not call context.settle for ordinary time progression" },
      { order: 5, fact: "human death/decline/timeout/leave ends only the personal run; the room/world continues" },
      { order: 6, fact: "when no humans remain, Colyseus autoDispose invokes mode disposal" },
    ],
    forbiddenFallbacks: ["Classic static defaults", "TimeLimit 90 seconds", "current matchTicks=1800", "human automatic respawn"],
    deadlineVectorsFile: "deadline-vectors.json",
  });
  writeJson(path.join(outputRoot, "fixtures/ruleset-vectors.json"), model.fixtures.rulesetVectors);
  writeJson(path.join(outputRoot, "fixtures/approved-ruleset-diff.json"), {
    schemaVersion: 1,
    version: model.fixtures.rulesetVectors.decisionRecord.rulesetVersion,
    approval: { authority: "user", date: "2026-09-03" },
    implementationStatus: "frozen for S2/S2R; not implemented by S0",
    rows: [
      { rule: "Star length/score", current: "5/5", sourceReference: "10/10", target: "10/10", nature: "adopt source unitless values", test: "one Star adds exactly 10 length and 10 score", ownerStage: "S2" },
      { rule: "base speed", current: "160 unit/s", sourceReference: "4.5 unit/frame under 60 engine / 59 requested platform frame rate", target: "160 unit/s", nature: "project adaptation; no frame conversion", test: "160/20 = 8 units per tick", ownerStage: "S2" },
      { rule: "boost multiplier", current: "1.6", sourceReference: "2", target: "2", nature: "adopt source unitless ratio", test: "8*2 = 16 units per tick", ownerStage: "S2" },
      { rule: "turn cap", current: "9 degrees/tick", sourceReference: "10 degrees/frame, no fixed-step equivalent", target: "9 degrees/tick", nature: "project adaptation; no frame conversion", test: "cap, exact arrival, and shortest arc across 360/0", ownerStage: "S2" },
      { rule: "first spawn protection", current: "30 ticks from entity creation", sourceReference: "no directly portable fixed-step value", target: "30 active ticks from firstActiveTick", nature: "project adaptation", test: "start/start+29 protected; start+30 unprotected; wall remains lethal", ownerStage: "S2" },
      { rule: "human relive protection", current: "shares 30-tick spawn field", sourceReference: "3 seconds", target: "60 ticks from reliveFirstActiveTick", nature: "source duration mapped at approved 20Hz; separate field", test: "start/start+59 protected; start+60 unprotected; wall remains lethal", ownerStage: "S2/S2R" },
    ],
    rollback: model.fixtures.rulesetVectors.decisionRecord.rollbackBaseline,
  });
  writeJson(path.join(outputRoot, "fixtures/relive-source-and-target.json"), {
    schemaVersion: 1,
    sourceReliveConfigB: model.reliveConfig.relive_config_b,
    sourcePayReliveConfig: model.reliveConfig.relive_config,
    targetCoinPolicy: model.layers.layers.find((layer) => layer.id === "onlineCoinRelive5V1"),
    targetDifferences: {
      human: "4-tick presentation then authoritative choice; no automatic 40-tick respawn",
      ai: "40-tick automatic respawn; never enters coin/reward flow",
      online: "choice and run state are per-human; other humans and world tick continue",
    },
    caseMatrix: [
      { case: "eligible human death", source: "about 200ms then source choice UI", target: "4-tick presentation then authoritative 100-tick choice", personalRunResult: "pending until choice", worldContinues: true, ownerStage: "S2/S2R" },
      { case: "successful human relive 1..5", source: "selected source channel restores fields and grants 3-second protection", target: "coin receipt applies once, same run resumes, 60-tick half-open protection", personalRunResult: "continues", worldContinues: true, ownerStage: "S2R" },
      { case: "ineligible or death after five successful relives", source: "no next B-table entry", target: "no choice and no sixth price tier", personalRunResult: "final", worldContinues: true, ownerStage: "S2/S2R" },
      { case: "human decline", source: "source local game over", target: "only that personal run becomes final", personalRunResult: "final", worldContinues: true, ownerStage: "S2" },
      { case: "human choice timeout", source: "default source countdown is 5 seconds", target: "100 ticks at 20Hz, independent from room deadline", personalRunResult: "final", worldContinues: true, ownerStage: "S2/S2R" },
      { case: "force/escape", source: "skips ordinary relive branch", target: "no relive offer", personalRunResult: "final with explicit reason", worldContinues: true, ownerStage: "S2" },
      { case: "AI death", source: "about 2000ms automatic relive and source wreck generation", target: "40-tick AI-only respawn; wreck score stays in-room", personalRunResult: "not applicable", worldContinues: true, ownerStage: "S2" },
    ],
    priceTierRule: "The number of successful relives chooses the next tier; death count does not.",
    humanWreckPolicy: "Human death creates no collectible scoring wreck in the target.",
    aiWreckAssetPolicy: "AI wreck score is in-room gameplay value only and never a player asset/reward.",
  });

  writeJson(path.join(outputRoot, "presentation/palette.json"), {
    schemaVersion: 1,
    freshInstallBlackBackground: spec.source.freshInstallBlackBackground,
    selectedGoldenTheme: "light",
    gridSpacingWorldUnits: spec.presentation.gridSpacing,
    mapMarginWorldUnits: spec.presentation.mapMargin,
    light: spec.presentation.light,
    dark: spec.presentation.dark,
    colorEncoding: "source literal 8-bit RGBA channels; PNG reconstruction writes sRGB-compatible byte values without color-profile conversion",
    selectionAndDrawingRules: {
      themeSelector: "SettingStore.settingInfo.blackBackground / gameData.mapData.isBlackBackground",
      freshInstallSelection: "blackBackground=0 => drawWhiteBackground",
      grid: "one-world-unit line width, lines every MAP_SPACE=32 over the map bounds",
      lightBoundary: "no drawBorder call in DefaultMapDrawStrategy; boundary is the map/outside color discontinuity",
      darkBoundary: "drawBlackBackground explicitly strokes the map rectangle with RGBA(235,79,113,255), width 4",
      backgroundTextureNode: "bgSprite; texture tiling helper exists but default color strategy uses bgGraphics",
      maskNode: "bgMaskSprite; inactive in white background, linked blue mask may be active in black background",
      wallLogicalRule: "MAP_BORDER=16 is gameplay/map margin; it is not a serialized wall-block color and is not GRID_CELL=150 broadphase",
      broadphaseNonVisual: "server GRID_CELL=150 belongs to the target v1 collision implementation and must not drive presentation grid spacing",
    },
    scene: model.scene,
  });
  writeJson(path.join(outputRoot, "presentation/source-atlas-frames.json"), {
    schemaVersion: 1,
    food: { pngPath: model.assets.food.pngPath, packPath: model.assets.food.packPath, frames: model.assets.food.frames },
    skins: [...model.assets.skins.values()].map(({ id, pngPath, packPath, frames }) => ({ id, pngPath, packPath, frames })),
  });
  writeJson(path.join(outputRoot, "current-gap-matrix.json"), model.targetGap);

  const goldens = renderGoldens(spec, model.assets);
  const rendererSourcePaths = [
    "subpackages/loading/bundle/_r/config/GameConstant.js",
    "subpackages/loading/bundle/_r/gameplay/strategy/mapStrategy/BaseMapDrawStrategy.js",
    "subpackages/loading/bundle/_r/gameplay/strategy/mapStrategy/DefaultMapDrawStrategy.js",
    model.assets.food.pngPath,
    model.assets.food.packPath,
    ...[...model.assets.skins.values()].flatMap((skin) => [skin.pngPath, skin.packPath]),
  ];
  const rendererSourceHashes = sourceHashSelection(sourceEntries, rendererSourcePaths);
  const goldenManifest = [];
  for (const golden of goldens) {
    const pngPath = path.join(outputRoot, "goldens", golden.name);
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    fs.writeFileSync(pngPath, golden.png);
    const metadataName = golden.name.replace(/\.png$/, ".metadata.json");
    const metadata = {
      schemaVersion: 1,
      evidenceKind: "sourceDerivedStaticReconstruction",
      claimIsOriginalRuntimeScreenshot: false,
      sourceCommit: spec.sourceCommit,
      targetBaselineCommit: spec.targetBaselineCommit,
      reconstructionVersion: spec.evidenceVersion,
      configId: spec.configId,
      configCombinationSha256: model.layers.combinationSha256,
      seed: spec.seed,
      sourceFileHashes: rendererSourceHashes,
      ...golden.metadata,
    };
    const metadataPath = path.join(outputRoot, "goldens", metadataName);
    writeJson(metadataPath, metadata);
    goldenManifest.push({
      file: golden.name,
      sha256: sha256(golden.png),
      size: golden.png.length,
      metadata: metadataName,
      metadataSha256: sha256(fs.readFileSync(metadataPath)),
      evidenceKind: metadata.evidenceKind,
      fixture: metadata.fixture,
      orientation: metadata.orientation,
      viewport: metadata.viewport,
    });
  }
  writeJson(path.join(outputRoot, "goldens/manifest.json"), {
    schemaVersion: 1,
    disclaimer: "Deterministic source-derived static reconstructions; not original runtime screenshots.",
    images: goldenManifest,
  });

  tracker.verifyUnchanged();
  const finalSourceEntries = tracker.manifest();
  writeJson(path.join(outputRoot, "source-manifest.json"), {
    schemaVersion: 1,
    root: "source-relative paths under the supplied locked archive",
    commit: spec.sourceCommit,
    cleanAtBuildStart: true,
    unchangedAfterRead: true,
    files: finalSourceEntries,
  });
  writeJson(path.join(outputRoot, "source-evidence-index.json"), {
    schemaVersion: 1,
    commit: spec.sourceCommit,
    note: "Line numbers are build-time locators only; revalidation is symbol/pattern and hash based.",
    entries: decorateEvidenceIndex(model.evidenceIndex, finalSourceEntries),
  });
  writeJson(path.join(outputRoot, "build-report.json"), {
    schemaVersion: 1,
    evidenceDate: spec.evidenceDate,
    sourceCommitVerified: true,
    sourceCleanVerified: true,
    sourceUnchangedAfterRead: true,
    targetBaselineCommitVerified: true,
    sourceFileCount: finalSourceEntries.length,
    sourceSymlinkCount: finalSourceEntries.filter((entry) => entry.kind === "symbolicLink").length,
    parsedV2KeyCount: Object.keys(model.sourceV2).length,
    pointStepCount: model.sourceV2.point_step_config.length,
    layerCount: model.layers.layers.length,
    goldenPngCount: goldens.length,
    runtimeSourceDependencyMatchCount: model.targetGap.sourceArchiveDependencyAudit.runtimeMatchCount,
    forbiddenSourceDependencyMatchCount: model.targetGap.sourceArchiveDependencyAudit.forbiddenReferenceCount,
    sourcePointingSymlinkCount: model.targetGap.sourceArchiveDependencyAudit.sourcePointingSymlinkCount,
    sourceParserExecutesJavaScript: false,
  });
  writeText(path.join(outputRoot, "README.md"), evidenceReadme(spec, model, finalSourceEntries.length, goldens.length));

  const bundle = buildManifest(outputRoot, spec, model);
  for (const relativePath of listFiles(outputRoot).filter((file) => file.endsWith(".json"))) {
    const text = fs.readFileSync(path.join(outputRoot, relativePath), "utf8");
    if (text.includes(sourceRoot)) throw new Error(`Generated evidence leaked machine-specific source root: ${relativePath}`);
  }
  return {
    configId: spec.configId,
    combinationSha256: model.layers.combinationSha256,
    sourceFileCount: finalSourceEntries.length,
    symlinkCount: finalSourceEntries.filter((entry) => entry.kind === "symbolicLink").length,
    pointStepCount: model.sourceV2.point_step_config.length,
    goldenCount: goldens.length,
    ...bundle,
  };
}
