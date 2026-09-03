import { spawnSync } from "node:child_process";
import {
  assertIncludes,
  cocosAtlasPackPath,
  cocosNativePath,
  collectNamedRects,
  expectPropertyLiteral,
  lineNumbers,
  readGitFile,
  sha256,
  stableJson,
} from "./core.mjs";
import { crop, decodePng } from "./png.mjs";

export function generatedPointSteps() {
  const result = [];
  for (let n = 1; n <= 63; n += 1) result.push({ max_length: 300 * n, step_length: n + 2 });
  result.push({ max_length: 18900, step_length: 66 });
  for (let n = 64; n <= 67; n += 1) result.push({ max_length: 300 * n, step_length: n + 3 });
  result.push(
    { max_length: 100000, step_length: 50 },
    { max_length: 200000, step_length: 100 },
    { max_length: 300000, step_length: 100 },
  );
  return result;
}

export function pathPointCount(length, pointSteps, pointsPerStep = 2) {
  if (!Number.isFinite(length) || length < 0) throw new Error(`Invalid snake length ${length}`);
  let previousMax = 0;
  let accumulated = 0;
  for (const segment of pointSteps) {
    const covered = Math.max(0, Math.min(length, segment.max_length) - previousMax);
    accumulated += covered / segment.step_length;
    previousMax = Math.max(previousMax, segment.max_length);
    if (length <= segment.max_length) break;
  }
  return Math.floor(accumulated) * pointsPerStep;
}

export function rotatePortrait(point) {
  return { x: -point.y, y: point.x };
}

export function deadlineDone({ hasDeadline, endTick }, tick) {
  return hasDeadline && endTick !== null && tick >= endTick;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function diffObjects(before, after, prefix = "") {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const result = [];
  for (const key of [...keys].sort()) {
    const path = prefix ? `${prefix}.${key}` : key;
    const left = before[key];
    const right = after[key];
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      result.push(...diffObjects(left, right, path));
    } else if (stableJson(left) !== stableJson(right)) result.push({ path, source: left, target: right });
  }
  return result;
}

function evidenceEntry(tracker, relativePath, purpose, symbols, facts, snippets) {
  const text = tracker.readText(relativePath, purpose);
  assertIncludes(text, snippets, relativePath);
  return {
    path: relativePath,
    purpose,
    symbols,
    facts,
    locators: lineNumbers(text, snippets),
  };
}

function sourceEvidence(tracker) {
  const entries = [];
  entries.push(evidenceEntry(tracker, "app-config.json", "orientation evidence", ["deviceOrientation"],
    ["source application is landscape"], ['"deviceOrientation": "landscape"']));
  entries.push(evidenceEntry(tracker, "game/src/settings.js", "orientation evidence", ["orientation"],
    ["engine settings are landscape"], ['orientation: "landscape"']));
  entries.push(evidenceEntry(tracker, "game/main.js", "frame-rate evidence", ["frameRate"],
    ["engine frame rate is 60"], ["frameRate: 60"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/Loading.js", "frame-rate request evidence", ["platformApi.setFrameRate"],
    ["platform frame-rate request is 59"], ["setFrameRate(59)"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/store/FeedGameStore.js", "frozen inline configuration", ["single_game_config.new_endless_config_abtest", "endless_config"],
    ["V2 battlefield object and built-in relive samples are separate config objects"], ["new_endless_config_abtest:", "relive_config_b:"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/store/ConfigStore.js", "configuration injection path", ["ConfigStore.setConfigs", "ConfigStore.getNewEndlessConfig"],
    ["server-selected V2 object is stored without a local AB re-selection", "top-level endless_config is injected into ReliveStore"],
    ["ReliveStore.setReliveConfig(e.endless_config", "newEndlessConfigAbTest = t.singleGameConfig.new_endless_config_abtest", "getNewEndlessConfig"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/utils/GameEntryUtil.js", "mode-to-scene routing", ["GameEntryUtil"],
    ["Endless and TimeLimit route to the same Game scene"], ["gameModeEndless, { bundleName:", 'sceneName: "Game"', "gameModeTimeLimit, { bundleName:"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/store/GameStore.js", "new-Endless predicate", ["GameStore.isNewEndless"],
    ["predicate includes Endless/UGC families and does not include TimeLimit"], ["isNewEndless = function()", "endless_snake_min_length > 0"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/scene/Game.js", "Endless clock and V2 consumption", ["Game.init", "Game.update", "Game.assignByConfigs"],
    ["Endless writes totalTime=0", "time HUD and time-over require positive totalTime", "gameTime still increases", "V2 map/food/camera values are consumed"],
    ["this.totalTime = 0", "this.timeLabel.node.active = this.totalTime > 0", "this.totalTime > 0 && this.gameTime == this.totalTime", "this.gameTime++", "getNewEndlessConfig"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/game/util/GameUtil.js", "path-point consumption", ["GameUtil.calNewEndlessPointCountByLength"],
    ["ordered point_step_config segments are accumulated with floor and STEP_POINT_COUNT"], ["calNewEndlessPointCountByLength", ".point_step_config", "STEP_POINT_COUNT"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/prefab/game/relive/ReliveStore.js", "relive policy selection", ["ReliveStore.getReliveConfig", "ReliveStore.getEndlessReliveCountdownSeconds"],
    ["non-pay Endless reads relive_config_b", "default choice window is 5 seconds; AB branches are 8/10"], ["relive_config_b", "endlessReliveCountdownDefaultSeconds = 5", "return 8", "return 10"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/prefab/game/relive/ReliveAlert.js", "relive choice presentation", ["ReliveAlert.initReliveCountDown"],
    ["choice UI obtains its countdown from ReliveStore"], ["getEndlessReliveCountdownSeconds", "reliveCountDownSeconds"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/game/snake/SnakeManager.js", "human/AI death timing", ["SnakeManager.snakeDie", "SnakeManager.reliveMySnake"],
    ["human game-over presentation is 200ms", "AI relive branch is 2000ms"], ["}), 200)", "}), 2e3)", "reliveMySnake"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/game/snake/Snake.js", "relive field restoration and protection", ["Snake.reliveWithSnakeLength"],
    ["relive restores score/length/kill/magnet/star fields, clears life transients, and requests 3-second protection"],
    ["eatMagnetCount = p", "eatStarCount = h", "reliveCount++", "generateProtect(A.CommonUtil.getFrameCountTarget(3))"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/api/AppApi.js", "source relive API boundary", ["AppApi.relive"],
    ["source relive calls an authenticated score API; it is evidence only and is not imported"], ["/score_api/relive"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/config/GameConstant.js", "presentation and motion constants", ["GameConstant"],
    ["grid=32, margin=16, dot size/value=16/1, star size/value=42/10, speed multiplier=2, path multiplier=2"],
    ["t.MAP_SPACE = 32", "t.MAP_BORDER = 16", "t.FOOD_STAR_LENGTH = 10", "t.FOOD_STAR_SCORE = 10", "t.SPEED_UP = 2", "t.STEP_POINT_COUNT = 2"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/gameplay/strategy/mapStrategy/BaseMapDrawStrategy.js", "exact presentation palette", ["BaseMapDrawStrategy.drawWhiteBackground", "BaseMapDrawStrategy.drawBlackBackground", "BaseMapDrawStrategy.drawGrid"],
    ["light/dark outside, map, grid, and dark boundary values are source literals"],
    ["cc.color(108, 36, 31)", "cc.color(235, 236, 244)", "cc.color(205, 205, 214)", "cc.color(36, 55, 107)", "cc.color(29, 44, 97)", "cc.color(235, 79, 113)"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/gameplay/strategy/mapStrategy/DefaultMapDrawStrategy.js", "default presentation flow", ["DefaultMapDrawStrategy.draw"],
    ["fresh-install style selects white/black fill then draws the grid; light mode has no explicit border call"],
    ["drawBlackBackground(t) : this.drawWhiteBackground(t), this.drawGrid(t)"]));
  entries.push(evidenceEntry(tracker, "subpackages/loading/bundle/_r/store/SettingStore.js", "fresh-install theme", ["SettingStore.settingInfo"],
    ["fresh-install blackBackground is 0 (light)"], ["blackBackground: 0"]));
  return entries;
}

function loadAssets(tracker, spec) {
  const atlasConfigPath = "remoteBundles/atlas/config.json";
  const atlasConfig = tracker.readJson(atlasConfigPath, "food atlas discovery");
  const foodPngPath = cocosNativePath("atlas", atlasConfig, "foods");
  const foodPackPath = cocosAtlasPackPath("atlas", atlasConfig, "foods");
  const foodImage = decodePng(tracker.read(foodPngPath, "food atlas pixels"));
  const foodRects = collectNamedRects(tracker.readJson(foodPackPath, "food atlas frame metadata"));
  const requiredFoodFrames = ["star", "starFifth", "1", "2", "3", "4", "5", "6", "7"];
  for (const name of requiredFoodFrames) if (!foodRects.has(name)) throw new Error(`Missing food frame ${name}`);

  const skinConfigPath = "remoteBundles/internalSkins/config.json";
  const skinConfig = tracker.readJson(skinConfigPath, "skin atlas discovery");
  const skins = new Map();
  for (const skinId of spec.goldenSkinIds) {
    const logicalPath = `${skinId}/${skinId}`;
    const pngPath = cocosNativePath("internalSkins", skinConfig, logicalPath);
    const packPath = cocosAtlasPackPath("internalSkins", skinConfig, logicalPath);
    const sourceImage = decodePng(tracker.read(pngPath, `skin ${skinId} atlas pixels`));
    const rects = collectNamedRects(tracker.readJson(packPath, `skin ${skinId} frame metadata`));
    if (!rects.has("snakehead") || !rects.has("snakebody0") || !rects.has("snakewreck")) {
      throw new Error(`Skin ${skinId} lacks required source frames`);
    }
    const bodyNames = [...rects.keys()].filter((name) => /^snakebody\d+$/.test(name)).sort();
    skins.set(skinId, {
      id: skinId,
      pngPath,
      packPath,
      frames: Object.fromEntries([...rects.entries()].sort()),
      head: crop(sourceImage, rects.get("snakehead")),
      bodies: bodyNames.map((name) => crop(sourceImage, rects.get(name))),
      wreck: crop(sourceImage, rects.get("snakewreck")),
    });
  }
  return {
    food: {
      pngPath: foodPngPath,
      packPath: foodPackPath,
      frames: Object.fromEntries([...foodRects.entries()].sort()),
      star: crop(foodImage, foodRects.get("star")),
      starFifth: crop(foodImage, foodRects.get("starFifth")),
      dots: ["1", "2", "3", "4", "5", "6", "7"].map((name) => crop(foodImage, foodRects.get(name))),
    },
    skins,
    discoveryPaths: [atlasConfigPath, skinConfigPath],
  };
}

function loadSceneEvidence(tracker) {
  const configPath = "remoteBundles/game/config.json";
  const config = tracker.readJson(configPath, "Game scene discovery");
  const sceneKey = "db://assets/subpackages/game/Game.fire";
  const sceneIndex = config.scenes[sceneKey];
  if (sceneIndex !== 560) throw new Error(`Unexpected Game scene index: ${sceneIndex}`);
  const compressedUuid = config.uuids[sceneIndex];
  if (compressedUuid !== "87MrDXg89GuJpawJP58R9k") throw new Error(`Unexpected Game scene UUID: ${compressedUuid}`);
  const packs = Object.entries(config.packs).filter(([, indexes]) => indexes.includes(sceneIndex));
  if (packs.length !== 1) throw new Error(`Expected one Game scene pack, found ${packs.length}`);
  const packKey = packs[0][0];
  const packPath = `remoteBundles/game/${config.importBase}/${packKey.slice(0, 2)}/${packKey}.json`;
  const packText = tracker.readText(packPath, "serialized Game scene presentation bindings");
  assertIncludes(packText, ["bgGraphics", "bgSprite", "bgMaskSprite", "timeLabel", "cc.Graphics", "1624", "750"], packPath);
  return {
    sceneKey,
    sceneIndex,
    compressedUuid,
    canonicalUuid: "8732b0d7-83cf-46b8-9a5a-c093f9f11f64",
    packPath,
    bindings: ["bgGraphics", "bgSprite", "bgMaskSprite", "timeLabel", "cc.Graphics"],
    serializedDesignSize: [1624, 750],
    interpretation: "The pack binds presentation nodes; exact colors and strokes come from BaseMapDrawStrategy source literals.",
  };
}

function buildLayers(spec, targetV2, reliveConfig) {
  const reliveB = reliveConfig.relive_config_b.map(({ coin_relive, ad_card }) => ({ coinRelive: coin_relive, adCard: ad_card }));
  const layers = [
    {
      id: "newEndlessPortraitV2Map4096",
      version: 1,
      source: "single_game_config.new_endless_config_abtest at locked source commit; user-approved map-only override",
      config: targetV2,
    },
    {
      id: "sourceEndlessTotalTime0",
      version: 1,
      totalTime: 0,
      matchDurationTicks: 0,
      hasDeadline: false,
      endTick: null,
      showRemainingTimeHud: false,
      worldDoneExpression: "hasDeadline && endTick !== null && tick >= endTick",
      runElapsedTime: "positive authoritative tick delta; display-only",
    },
    {
      id: "sourceEndlessReliveFlow",
      version: 1,
      sourceHumanDeathDelayMs: 200,
      sourceAiRespawnDelayMs: 2000,
      sourceProtectionSeconds: 3,
      humanPolicy: "eligible death enters an authoritative choice; success resumes the same run; reject/timeout/exhaustion ends only that run",
      aiPolicy: "independent automatic respawn; never enters human charging/reward flow",
      restoreFields: ["length", "score", "killCount", "eatMagnetCount", "eatStarCount", "reliveCount"],
      clearLifeTransients: true,
      firstActiveProtectionInterval: "[reliveFirstActiveTick, reliveFirstActiveTick + 60)",
    },
    {
      id: "onlineCoinRelive5V1",
      version: 1,
      sourceTable: "Feed endless_config.relive_config_b sample",
      sourceEvidence: reliveB,
      coinCosts: reliveB.map((item) => item.coinRelive),
      decisionTicks: spec.approvedRules.reliveDecisionTicks,
      decisionSecondsAt20Hz: spec.approvedRules.reliveDecisionTicks / spec.target.tickRate,
      maxSuccessfulRelives: spec.approvedRules.maxSuccessfulRelives,
      omittedChannels: ["advertisement", "share", "ad-card", "diamond", "monthly-card", "novice-free-relive", "8/10-second-AB"],
    },
    {
      id: "onlineEndlessDropInV2",
      version: 1,
      humanCapacity: 8,
      startPolicy: "first human starts world",
      prepareTicks: 60,
      playingJoinAllowed: true,
      steadyActiveSnakeCount: 17,
      aiPolicy: "16 source K1 level-0 AI at one human; level-401 AI yields as humans join, leaving 9 AI at eight humans",
      runSettlement: "individual",
      roomSettlement: "none for ordinary Endless time progression",
      disposal: "last human run frozen and player leaves; Colyseus autoDispose invokes mode onDispose",
    },
  ];
  const hashes = layers.map((layer) => ({ id: layer.id, sha256: sha256(stableJson(layer)) }));
  const combination = { configId: spec.configId, layerHashes: hashes };
  return { layers, hashes, combination, combinationSha256: sha256(stableJson(combination)) };
}

function configFixtures(sourceV2, targetV2, layers) {
  const fields = Object.keys(sourceV2).sort();
  return {
    schemaVersion: 1,
    configId: layers.combination.configId,
    sourceKeyCount: Object.keys(sourceV2).length,
    pointStepCount: sourceV2.point_step_config.length,
    fieldComparison: fields.map((field) => ({
      field,
      type: Array.isArray(sourceV2[field]) ? "array" : typeof sourceV2[field],
      source: sourceV2[field],
      target: targetV2[field],
      relation: stableJson(sourceV2[field]) === stableJson(targetV2[field]) ? "unchanged" : "approvedOverride",
      reason: field === "map_width" || field === "map_height"
        ? "2026-09-03 user-approved 4096-square map boundary override; not coordinate scaling"
        : "preserved byte-equivalent data value from the locked V2 source object",
    })),
    changedFields: diffObjects(sourceV2, targetV2),
    ignoredMetadata: [
      "body_scale_snake_max_point_step",
      "camera_scale_snake_max_point_step",
      "endless_snake_max_point_step",
    ],
  };
}

function buildRuleFixtures(spec, sourceV2) {
  const pathLengths = [80, 300, 3000, 18900, 19200, 20100, 100000];
  const expected = [52, 200, 960, 1954, 1964, 1990, 5186];
  const pathVectors = pathLengths.map((length, index) => ({
    length,
    pointCount: pathPointCount(length, sourceV2.point_step_config),
    expectedPointCount: expected[index],
  }));
  if (pathVectors.some((item) => item.pointCount !== item.expectedPointCount)) throw new Error("Path-point boundary vector mismatch");

  const sourcePoints = [
    { x: 0, y: 0 }, { x: 32, y: 0 }, { x: 123.5, y: -456.25 }, { x: -2048, y: 2048 }, { x: 2448, y: -2448 },
  ];
  const coordinateVectors = sourcePoints.map((point) => {
    const portrait = rotatePortrait(point);
    return {
      source: point,
      portrait,
      sourceDistanceFromOrigin: Math.hypot(point.x, point.y),
      portraitDistanceFromOrigin: Math.hypot(portrait.x, portrait.y),
      scaleFactor: point.x === 0 && point.y === 0 ? 1 : Math.hypot(portrait.x, portrait.y) / Math.hypot(point.x, point.y),
    };
  });

  const endless = { hasDeadline: false, endTick: null };
  const deadlineVectors = {
    endless: [0, 1799, 1800, 1801, 100000].map((tick) => ({ tick, done: deadlineDone(endless, tick), worldAdvances: true })),
    syntheticTimedControl: [1799, 1800, 1801].map((tick) => ({ tick, done: deadlineDone({ hasDeadline: true, endTick: 1800 }, tick) })),
    personalReliveDecision: { openedTick: 1800, deadlineTick: 1900, interval: "[1800,1900)", independentOfRoomDeadline: true },
  };
  const protectionStartTick = 700;
  const rulesetVectors = {
    decisionRecord: {
      approvedBy: "user",
      approvedDate: "2026-09-03",
      rulesetVersion: "newEndlessPortraitV2Ruleset@1",
      rollbackBaseline: "current snake@1 values: star 5/5, speed 160, boost 1.6, turn 9 degrees/tick, entity-creation-based protection 30; relive release flag remains off",
    },
    approvedRules: spec.approvedRules,
    firstActiveProtection: [700, 729, 730].map((tick) => ({ tick, protected: tick >= 700 && tick < 730 })),
    reliveProtection: [700, 759, 760].map((tick) => ({ tick, protected: tick >= protectionStartTick && tick < protectionStartTick + 60 })),
    food: {
      dot: { length: 1, score: 1 },
      star: { length: 10, score: 10 },
    },
    motion: {
      baseSpeedWorldUnitsPerSecond: 160,
      tickRate: 20,
      normalDistancePerTick: 8,
      boostMultiplier: 2,
      boostDistancePerTick: 16,
      turnDegreesPerTick: 9,
      turnVectors: [
        { from: 10, target: 30, resultAfterOneTick: 19 },
        { from: 10, target: 17, resultAfterOneTick: 17 },
        { from: 358, target: 4, resultAfterOneTick: 4, path: "shortest arc across 360/0" },
        { from: 350, target: 10, resultAfterOneTick: 359, path: "shortest arc across 360/0 capped at 9" },
      ],
      provenance: {
        baseSpeed: "project adaptation; deliberately not converted from source unit/frame",
        turn: "project adaptation; deliberately not converted from source degree/frame",
        boost: "source unitless ratio",
      },
    },
    protectionCollisionPolicy: {
      snakeToSnakeCauseAndReceiveBlocked: true,
      wallStillLethal: true,
      firstActiveAndReliveDurationsUseSeparateFields: true,
    },
    wreck: [
      { score: 80, bodyCount: 10 }, { score: 1000, bodyCount: 30 }, { score: 50000, bodyCount: 100 },
    ].map(({ score, bodyCount }) => {
      const total = (score ** 0.8) * 2;
      return { score, bodyCount, totalDeathWreckScore: total, perWreckScore: Math.max(total / bodyCount, 3) };
    }),
    cameraAndBodyScale: [80, 1000, 50000, 100000].map((length) => {
      const ratio = Math.max(0, Math.min(1, (length - 80) / (100000 - 80)));
      return {
        length,
        cameraScale: 1.3 + (0.6 - 1.3) * ratio,
        bodyScale: 1 + (2.8 - 1) * ratio,
      };
    }),
  };
  return { pathVectors, coordinateVectors, deadlineVectors, rulesetVectors };
}

function buildTargetGap(repo, commit) {
  const paths = [
    "apps/shared/schema/gameplays/snake/manifest.json",
    "apps/shared/src/gameplays/snake/ruleset.ts",
    "apps/shared/src/gameplays/snake/wire.ts",
    "apps/server/src/rooms/modes/snake/world.ts",
    "apps/server/src/rooms/modes/snake/index.ts",
    "apps/client/src/logic/rooms/snake/SnakeGameplay.ts",
    "apps/client/src/view/rooms/snake/SnakeWorldView.ts",
    "apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts",
    "apps/client/test/snakeGameplay.test.ts",
    "apps/server/test/snake-world.test.ts",
    "apps/Cocos/assets/resources/snakeoff/snake_foods.png",
    "apps/Cocos/assets/resources/snakeoff/snake_skin_classic_1.png",
  ];
  const snapshots = Object.fromEntries(paths.map((relativePath) => [relativePath, readGitFile(repo, commit, relativePath)]));
  const ruleset = snapshots[paths[1]].text;
  const wire = snapshots[paths[2]].text;
  const world = snapshots[paths[3]].text;
  const mode = snapshots[paths[4]].text;
  const logic = snapshots[paths[5]].text;
  const view = snapshots[paths[6]].text;
  const renderer = snapshots[paths[7]].text;
  assertIncludes(ruleset, ["worldWidth: 1920", "worldHeight: 3264", "matchTicks: 1800", "boostMultiplier: 1.6", "spawnLength: 30", "dotTarget: 300", "starTarget: 15", "snapshotMaxSnakes: 8", "snapshotMaxFoods: 315", "snapshotMaxPointsPerSnake: 512"], paths[1]);
  assertIncludes(wire, ["skin: finiteInteger(snake.skin", "0, 15", "kind: finiteInteger(food.kind", "0, 1"], paths[2]);
  assertIncludes(world, ["readonly endTick: number", "joinOrdinal % 8", "true, `AI-${this.nextAiOrdinal}`, 15", "pendingRespawns", "return this.tick >= this.endTick"], paths[3]);
  assertIncludes(mode, ["context.state.endTick = world.endTick", "const done = world.step()", "context.settle()"], paths[4]);
  assertIncludes(logic, ["class SnakeGameplay", "SnakeSnapshotBuffer", "GamePhase", "PING_INTERVAL_SECONDS"], paths[5]);
  assertIncludes(view, ["const COLOR_BG", "const COLOR_GRID", "const COLOR_AI", "const JOYSTICK_RADIUS = 110"], paths[6]);
  assertIncludes(renderer, ["this.skinIndexOf(id) % this.bodyTextures.length", "hash % this.bodyTextures.length"], paths[7]);

  const grep = spawnSync("git", ["-C", repo, "grep", "-n", "/Users/kimi/work/tanchishe/wegameVersion", commit, "--", "apps"], { encoding: "utf8" });
  if (![0, 1].includes(grep.status)) throw new Error(`Runtime dependency audit failed: ${grep.stderr}`);
  const runtimeMatches = grep.stdout.trim() === "" ? [] : grep.stdout.trim().split("\n");
  if (runtimeMatches.length > 0) throw new Error(`Target runtime refers to source archive: ${runtimeMatches.join("\n")}`);
  const allGrep = spawnSync("git", ["-C", repo, "grep", "-n", "/Users/kimi/work/tanchishe/wegameVersion", commit], { encoding: "utf8" });
  if (![0, 1].includes(allGrep.status)) throw new Error(`Repository source-path audit failed: ${allGrep.stderr}`);
  const allMatches = allGrep.stdout.trim() === "" ? [] : allGrep.stdout.trim().split("\n");
  const forbiddenMatches = allMatches.filter((line) => {
    const pathPart = line.slice(line.indexOf(":") + 1, line.indexOf(":", line.indexOf(":") + 1));
    return !/^(docs\/|plan[^/]*\.md$|README\.md$|AGENTS\.md$|tools\/)/.test(pathPart);
  });
  if (forbiddenMatches.length > 0) throw new Error(`Non-evidence target files refer to source archive: ${forbiddenMatches.join("\n")}`);
  const tree = spawnSync("git", ["-C", repo, "ls-tree", "-r", commit], { encoding: "utf8" });
  if (tree.status !== 0) throw new Error(`Target symlink audit failed: ${tree.stderr}`);
  const symlinks = tree.stdout.trim().split("\n").filter((line) => line.startsWith("120000 ")).map((line) => line.split("\t")[1]);
  const sourcePointingSymlinks = symlinks.filter((relativePath) => readGitFile(repo, commit, relativePath).text.includes("/Users/kimi/work/tanchishe/wegameVersion"));
  if (sourcePointingSymlinks.length > 0) throw new Error(`Target symlinks point to source archive: ${sourcePointingSymlinks.join(", ")}`);

  return {
    schemaVersion: 1,
    targetBaselineCommit: commit,
    snapshotFiles: paths.map((relativePath) => ({ path: relativePath, sha256: snapshots[relativePath].sha256 })),
    sourceArchiveDependencyAudit: {
      exactReferenceRole: "locked source root supplied to the evidence command (absolute value intentionally omitted from artifact)",
      repositoryReferenceMatches: allMatches.map((line) => line.replaceAll("/Users/kimi/work/tanchishe/wegameVersion", "<locked-source-root>")),
      allowedEvidenceOrDevelopmentReferenceCount: allMatches.length,
      forbiddenReferenceCount: forbiddenMatches.length,
      runtimeScope: "apps/** at target baseline commit",
      runtimeMatchCount: runtimeMatches.length,
      packageDependencyOrRuntimeUrlMatchCount: forbiddenMatches.length,
      trackedSymlinkCount: symlinks.length,
      sourcePointingSymlinkCount: sourcePointingSymlinks.length,
    },
    generatedAndMirrorBoundaries: [
      "apps/shared/src/gameplays/generated/** and apps/client/src/gameplay/catalog.generated.ts are generated from gameplay schema",
      "apps/client/src/shared/** and apps/Cocos/assets/src/** are synchronized mirrors and must not be hand-edited",
      "apps/server/src/rooms/schema/generated/** and GameRoomState.ts are gameplay codegen outputs",
    ],
    gaps: [
      { dimension: "gameplay/profile", current: "snake@1; maxPlayers=8; dropIn", target: "retain eight humans/drop-in; version target wire/config", evidence: paths[0], ownerStage: "S2", truthSource: "apps/shared/schema/gameplays/snake/manifest.json + handwritten snake wire/ruleset followed by gameplay codegen", verification: "generated gameplay validators and room profile tests", status: "assigned-not-implemented" },
      { dimension: "world/food", current: "1920x3264; 300 Dot + 15 Star; spawn length 30; eight active snakes", target: "4096x4096; 1000 Dot + 30 Star; spawn length 80; 17 active snakes", evidence: paths[1], ownerStage: "S2", truthSource: "apps/shared/src/gameplays/snake/ruleset.ts", verification: "world fixture, density/count, spawn and AI replacement tests", status: "assigned-not-implemented" },
      { dimension: "capacity/validator", current: "8 snakes; 315 foods; 512 points per snake", target: "17 snakes; 1030 resident foods; 5186 points at length 100000", evidence: `${paths[1]} + ${paths[2]}`, ownerStage: "S2", truthSource: "handwritten shared ruleset/wire, then gameplay codegen", verification: "wire/chunk bounds and maximum-load tests", status: "assigned-not-implemented" },
      { dimension: "wire/content identity", current: "skin 0..15; food kind 0/1; no variant or wreck provenance", target: "stable skin/content IDs; food variant; required wreck kind/provenance", evidence: paths[2], ownerStage: "S1/S2", truthSource: "S1 presentation catalog plus handwritten shared wire", verification: "catalog hash, validator, reconnect snapshot tests", status: "assigned-not-implemented" },
      { dimension: "assignment", current: "human joinOrdinal % 8; every AI skin 15", target: "server-authoritative run skin; independent source AI skin pool", evidence: paths[3], ownerStage: "S2/S3", truthSource: "server snake world/admission resolver", verification: "admission/equipment and AI composition fixtures", status: "assigned-not-implemented" },
      { dimension: "lifecycle", current: "matchTicks=1800; numeric endTick; world done causes room settle", target: "totalTime=0; no room deadline; individual run termination", evidence: `${paths[1]} + ${paths[3]} + ${paths[4]}`, ownerStage: "S2", truthSource: "shared snake ruleset + server snake world/mode", verification: "ticks 1800/1801 continue; no context.settle; empty-room disposal", status: "assigned-not-implemented" },
      { dimension: "death/relive", current: "human and AI share pendingRespawns; both auto-respawn after 40 ticks", target: "human authoritative choice after 4 ticks; AI-only automatic respawn at 40; relive protection 60", evidence: `${paths[3]} + ${paths[4]}`, ownerStage: "S2/S2R", truthSource: "S2 in-memory run state machine, then S2R durable decision/receipt", verification: "state-machine, timeout, crash-window and half-open protection tests", status: "assigned-not-implemented" },
      { dimension: "client logic", current: "90-second room/HUD assumptions and v1 snapshot shape", target: "no time-left termination; personal run/relive states and bounded v2 snapshot", evidence: paths[5], ownerStage: "S2", truthSource: "apps/client/src/logic/rooms/snake/**", verification: "logic tests without cc/FairyGUI imports", status: "assigned-not-implemented" },
      { dimension: "presentation/input", current: "hard-coded dark palette/grid; source atlas only partially used; corner controls", target: "source presentation catalog/grid 32; atlas batching; centered joystick and four mirrored functions", evidence: `${paths[6]} + ${paths[7]}`, ownerStage: "S1/S2", truthSource: "S1 catalog + client View/MeshRenderer; sync to Cocos only via sync:client", verification: "golden, safe-area, hit-radius, pointer ownership and Creator preview", status: "assigned-not-implemented" },
      { dimension: "resources", current: "first-pass food/classic skin resources exist; no complete stable 16-skin catalog", target: "audited converted source atlases and presentation catalog", evidence: `${paths[10]} + ${paths[11]}`, ownerStage: "S1", truthSource: "S1 conversion inputs/output catalog; Cocos resources are client-owned assets, not apps/Cocos/assets/src mirrors", verification: "rect/resource/hash inventory and conversion reproducibility", status: "assigned-not-implemented" },
      { dimension: "tests", current: "v1 gameplay/world tests cover timed eight-snake behavior", target: "V2 capacity, no-deadline, death/run, relive and presentation coverage", evidence: `${paths[8]} + ${paths[9]}`, ownerStage: "S2/S2R/S5", truthSource: "layer-local client/server tests plus final integration suite", verification: "targeted unit/integration/fault/Creator matrices", status: "assigned-not-implemented" },
      { dimension: "persistent run/rewards", current: "no durable personal Endless run/relive receipt/reward settlement", target: "minimal checkpoint at S2R; reliable reward settlement at S4", evidence: "absence verified against target baseline server snake mode and storage registration", ownerStage: "S2R/S4", truthSource: "server player/core storage registrations and migrations", verification: "transaction/outbox/fault-injection tests", status: "assigned-not-implemented" },
    ],
  };
}

export function extractModel({ tracker, spec, targetRoot }) {
  const evidenceIndex = sourceEvidence(tracker);
  const feedPath = "subpackages/loading/bundle/_r/store/FeedGameStore.js";
  const feedText = tracker.readText(feedPath, "parse frozen V2 and relive literals");
  const sourceV2 = expectPropertyLiteral(feedText, "new_endless_config_abtest", (value) => value?.map_width === 4896);
  const reliveConfig = expectPropertyLiteral(feedText, "endless_config", (value) => Array.isArray(value?.relive_config_b));
  if (Object.keys(sourceV2).length !== 28) throw new Error(`Expected 28 V2 keys, found ${Object.keys(sourceV2).length}`);
  if (sourceV2.point_step_config.length !== 71) throw new Error(`Expected 71 point-step entries, found ${sourceV2.point_step_config.length}`);
  if (stableJson(sourceV2.point_step_config) !== stableJson(generatedPointSteps())) throw new Error("Source point-step table differs from the lossless definition");
  const expectedAi = [{ level: 401, count: 8 }, { level: 402, count: 4 }, { level: 403, count: 2 }, { level: 404, count: 2 }];
  if (stableJson(sourceV2.endless_ai_count_config_list) !== stableJson(expectedAi)) throw new Error("Unexpected V2 AI composition");

  const targetV2 = clone(sourceV2);
  targetV2.map_width = spec.target.world.width;
  targetV2.map_height = spec.target.world.height;
  const changed = diffObjects(sourceV2, targetV2);
  if (stableJson(changed.map((item) => item.path)) !== stableJson(["map_height", "map_width"])) {
    throw new Error(`Map override changed unexpected fields: ${changed.map((item) => item.path).join(", ")}`);
  }
  const expectedCoin = [100, 200, 300, 300, 300];
  const expectedCards = [1, 1, 2, 3, 4];
  if (stableJson(reliveConfig.relive_config_b.map((item) => item.coin_relive)) !== stableJson(expectedCoin)
      || stableJson(reliveConfig.relive_config_b.map((item) => item.ad_card)) !== stableJson(expectedCards)) {
    throw new Error("Unexpected source relive_config_b sample");
  }

  const layers = buildLayers(spec, targetV2, reliveConfig);
  const fixtures = buildRuleFixtures(spec, sourceV2);
  const scene = loadSceneEvidence(tracker);
  const assets = loadAssets(tracker, spec);
  const sourceLinkPath = "remoteBundles/gameClassic/native/a1/a126f45c-a4ee-443e-ab55-a7c289e5c41f.png";
  tracker.read(sourceLinkPath, "symlink-aware source identity proof");
  const targetGap = buildTargetGap(targetRoot, spec.targetBaselineCommit);

  return {
    sourceV2,
    targetV2,
    reliveConfig,
    layers,
    fixtures,
    scene,
    assets,
    evidenceIndex,
    configFixtures: configFixtures(sourceV2, targetV2, layers),
    targetGap,
    sourceLinkPath,
  };
}
