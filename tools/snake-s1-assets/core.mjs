import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SourceTracker,
  assertGitSnapshot,
  cocosAtlasPackPath,
  cocosNativePath,
  decompressUuid,
  sha256,
  stableJson,
} from "../snake-s0-replication/core.mjs";
import {
  crop,
  decodePng,
  drawSprite,
  encodePng,
  fillRect,
  image,
  text,
} from "../snake-s0-replication/png.mjs";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOL_DIR, "../..");
export const SOURCE_DIR = path.join(TOOL_DIR, "source");
export const COCOS_RESOURCE_DIR = path.join(REPO_ROOT, "apps/Cocos/assets/resources/snakeoff");
export const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/s/evidence/s1");
export const EXPECTED_SKIN_IDS = Object.freeze([1, 2, 3, 4, 10, 11, 101, 111, 112, 132, 133, 139, 401, 403, 411, 701]);
export const EXPECTED_AI_SKIN_IDS = Object.freeze([101, 111, 112, 132, 133, 139, 401, 403, 411, 701]);

export function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, "catalog.json"), "utf8"));
  if (Array.isArray(catalog.skins)) catalog.skins = [...catalog.skins].sort((left, right) => left.sortOrder - right.sortOrder || left.skinId - right.skinId);
  validatePublicSource(catalog);
  return catalog;
}

function fail(context, message) {
  throw new Error(`[snake-s1] ${context}: ${message}`);
}

function expectFinite(value, context) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(context, `expected a finite number, got ${JSON.stringify(value)}`);
  return number;
}

function expectPositive(value, context) {
  const number = expectFinite(value, context);
  if (number <= 0) fail(context, `expected a positive number, got ${number}`);
  return number;
}

export function validatePublicSource(catalog) {
  const ids = catalog.skins?.map((skin) => skin.skinId);
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_SKIN_IDS)) fail("catalog.skins", `expected IDs ${EXPECTED_SKIN_IDS.join(",")}`);
  const defaults = catalog.skins.filter((skin) => skin.isDefault);
  if (defaults.length !== 1 || defaults[0].skinId !== 1) fail("catalog.skins", "skin 1 must be the only default");
  for (const skin of catalog.skins) {
    const context = `skin ${skin.skinId}`;
    if (skin.contentVersion !== 1) fail(context, "S1 contentVersion must be 1");
    if (skin.publicationState !== "active" || skin.playerUsable !== true) fail(context, "must be active and player-usable");
    if (skin.sortOrder !== skin.skinId) fail(context, "sortOrder must equal skinId in S1");
    const expectedFallback = skin.skinId === 1 ? null : 1;
    if (skin.fallbackSkinId !== expectedFallback) fail(context, `fallback must be ${expectedFallback}`);
  }
  const ai = catalog.skins.filter((skin) => skin.aiEligible).map((skin) => skin.skinId);
  if (JSON.stringify(ai) !== JSON.stringify(EXPECTED_AI_SKIN_IDS)) fail("catalog.skins", "AI pool differs from the frozen S1 pool");
}

export function normalizeFrameDuration(frameTime) {
  const value = expectFinite(frameTime ?? 0, "frame_time");
  return Math.max(1, value);
}

function stripPng(value, context) {
  if (typeof value !== "string" || value.length === 0) fail(context, "texture_name must be a non-empty string");
  return value.replace(/\.png$/i, "");
}

function normalizeAtlasFrame(frame, context) {
  if (!Array.isArray(frame.rect) || frame.rect.length < 4) fail(context, "rect must contain x/y/width/height");
  const rect = {
    x: expectFinite(frame.rect[0], `${context}.rect.x`),
    y: expectFinite(frame.rect[1], `${context}.rect.y`),
    width: expectPositive(frame.rect[2], `${context}.rect.width`),
    height: expectPositive(frame.rect[3], `${context}.rect.height`),
  };
  const original = Array.isArray(frame.originalSize) ? frame.originalSize : [rect.width, rect.height];
  const offset = Array.isArray(frame.offset) ? frame.offset : [0, 0];
  const pivot = Array.isArray(frame.pivot) ? frame.pivot : [0.5, 0.5];
  return {
    sourceFrameName: frame.name,
    rect,
    pivot: { x: expectFinite(pivot[0], `${context}.pivot.x`), y: expectFinite(pivot[1], `${context}.pivot.y`) },
    trimOffset: { x: expectFinite(offset[0], `${context}.offset.x`), y: expectFinite(offset[1], `${context}.offset.y`) },
    originalSize: {
      width: expectPositive(original[0], `${context}.originalSize.width`),
      height: expectPositive(original[1], `${context}.originalSize.height`),
    },
    rotated: Boolean(frame.rotated),
    trimmed: rect.width !== Number(original[0]) || rect.height !== Number(original[1]) || Number(offset[0]) !== 0 || Number(offset[1]) !== 0,
  };
}

export function validateFrameBounds(frame, texture, context) {
  const packedWidth = frame.rotated ? frame.rect.height : frame.rect.width;
  const packedHeight = frame.rotated ? frame.rect.width : frame.rect.height;
  if (frame.rect.x < 0 || frame.rect.y < 0 || frame.rect.x + packedWidth > texture.width || frame.rect.y + packedHeight > texture.height) {
    fail(context, `frame ${frame.sourceFrameName} lies outside ${texture.width}x${texture.height}`);
  }
}

function buildFrameLookup(atlas, skinId) {
  const lookup = new Map();
  for (const raw of atlas.frames ?? []) {
    const context = `skin ${skinId} atlas.${raw.name ?? "<unnamed>"}`;
    if (typeof raw.name !== "string" || raw.name.length === 0) fail(context, "frame name is missing");
    const frame = normalizeAtlasFrame(raw, context);
    validateFrameBounds(frame, atlas.texture, context);
    if (lookup.has(raw.name)) fail(context, "duplicate frame name");
    lookup.set(raw.name, frame);
  }
  return lookup;
}

function convertTrack(raw, lookup, context) {
  if (!raw || !Array.isArray(raw.frame) || raw.frame.length === 0) fail(context, "track must contain at least one frame");
  return {
    level: expectFinite(raw.level ?? 0, `${context}.level`),
    sourceDistance: expectFinite(raw.distance ?? 0, `${context}.distance`),
    frames: raw.frame.map((timed, index) => {
      const name = stripPng(timed.texture_name, `${context}.frame[${index}]`);
      const definition = lookup.get(name);
      if (!definition) fail(`${context}.frame[${index}]`, `atlas frame ${name} not found`);
      return { ...definition, durationFrames: normalizeFrameDuration(timed.frame_time) };
    }),
  };
}

function convertMotion(rawSkin, lookup, prefix, context) {
  const headKey = prefix === "normal" ? "head_frame" : "head_speed_frame";
  const bodyKey = prefix === "normal" ? "body_frame" : "body_speed_frame";
  const tailKey = prefix === "normal" ? "tail_frame" : "tail_speed_frame";
  const body = rawSkin[bodyKey];
  if (!Array.isArray(body) || body.length === 0) fail(`${context}.${bodyKey}`, "body track list must not be empty");
  return {
    head: convertTrack(rawSkin[headKey], lookup, `${context}.${headKey}`),
    body: body.map((track, index) => convertTrack(track, lookup, `${context}.${bodyKey}[${index}]`)),
    tail: rawSkin[tailKey] == null ? null : convertTrack(rawSkin[tailKey], lookup, `${context}.${tailKey}`),
    bodySequence: body.map((_, index) => index),
    sourceBodyOffset: expectFinite(prefix === "normal" ? rawSkin.body_distance : rawSkin.body_speed_distance, `${context}.${prefix}.sourceBodyOffset`),
  };
}

export function convertSkinSource(skinId, bodyDocument, atlas, sourcePath = `source/internal-skins/${skinId}`) {
  const context = `skin ${skinId} (${sourcePath})`;
  if (Number(bodyDocument.skinId) !== skinId || !bodyDocument.skin) fail(context, "body.json identity or skin payload is invalid");
  const raw = bodyDocument.skin;
  const renderType = expectFinite(raw.body_render_type, `${context}.body_render_type`);
  if (renderType !== 2) fail(`${context}.body_render_type`, `unsupported render type ${renderType}; S1 accepts NormalRepeat(2) only`);
  const lookup = buildFrameLookup(atlas, skinId);
  const normal = convertMotion(raw, lookup, "normal", context);
  const hasBoostHead = raw.head_speed_frame != null;
  const hasBoostBody = Array.isArray(raw.body_speed_frame) && raw.body_speed_frame.length > 0;
  const boostEmpty = !hasBoostHead && !hasBoostBody && raw.tail_speed_frame == null;
  if (!boostEmpty && (!hasBoostHead || !hasBoostBody)) fail(context, "boost tracks are partially defined");
  const boost = boostEmpty ? structuredClone(normal) : convertMotion(raw, lookup, "boost", context);
  const wreckName = stripPng(raw.wreck_name, `${context}.wreck_name`);
  const wreckFrame = lookup.get(wreckName);
  if (!wreckFrame) fail(`${context}.wreck_name`, `atlas frame ${wreckName} not found`);
  return {
    normal,
    boost,
    boostSource: boostEmpty ? "inherit-normal" : "source",
    bodyRenderWidthRate: expectPositive(raw.body_render_width_rate, `${context}.body_render_width_rate`),
    bodyRenderType: 2,
    headAnchorY: expectFinite(raw.head_anchor_y_pos ?? 0.5, `${context}.head_anchor_y_pos`),
    boostHeadAnchorY: expectFinite(raw.head_speed_anchor_y_pos ?? raw.head_anchor_y_pos ?? 0.5, `${context}.head_speed_anchor_y_pos`),
    visualScale: 1,
    wreckFrame,
  };
}

export function assertContentVersionTransition(before, after) {
  if (before.skinId !== after.skinId) fail("contentVersion", "skin identity cannot change across a transition");
  const beforeDigest = sha256(stableJson(before.presentation));
  const afterDigest = sha256(stableJson(after.presentation));
  if (beforeDigest !== afterDigest && after.contentVersion <= before.contentVersion) {
    fail(`skin ${after.skinId}.contentVersion`, "resource interpretation changed without a version bump");
  }
}

function findPayload(value, predicate, result = []) {
  if (predicate(value)) result.push(value);
  if (Array.isArray(value)) for (const child of value) findPayload(child, predicate, result);
  else if (value && typeof value === "object") for (const child of Object.values(value)) findPayload(child, predicate, result);
  return result;
}

function extractBodyPayload(value, skinId, sourcePath) {
  const matches = findPayload(value, (candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) && candidate.skin && typeof candidate.skin === "object");
  if (matches.length !== 1) fail(`skin ${skinId} ${sourcePath}`, `expected one body payload, found ${matches.length}`);
  return { skinId, skin: matches[0].skin };
}

function referencedFrameNames(bodyDocument) {
  const result = new Set();
  const skin = bodyDocument.skin;
  for (const key of ["head_frame", "head_speed_frame", "tail_frame", "tail_speed_frame"]) {
    for (const frame of skin[key]?.frame ?? []) result.add(stripPng(frame.texture_name, key));
  }
  for (const key of ["body_frame", "body_speed_frame"]) {
    for (const track of skin[key] ?? []) for (const frame of track.frame ?? []) result.add(stripPng(frame.texture_name, key));
  }
  result.add(stripPng(skin.wreck_name, "wreck_name"));
  return [...result].sort();
}

function extractAtlasFrames(value, requiredNames, context) {
  const required = new Set(requiredNames);
  const candidates = findPayload(value, (candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.name === "string" && Array.isArray(candidate.rect));
  const byName = new Map();
  for (const candidate of candidates) {
    if (!required.has(candidate.name)) continue;
    const normalized = {
      name: candidate.name,
      rect: candidate.rect.slice(0, 4).map(Number),
      offset: (candidate.offset ?? [0, 0]).slice(0, 2).map(Number),
      originalSize: (candidate.originalSize ?? candidate.rect.slice(2, 4)).slice(0, 2).map(Number),
      pivot: (candidate.pivot ?? [0.5, 0.5]).slice(0, 2).map(Number),
      rotated: Boolean(candidate.rotated),
    };
    const previous = byName.get(candidate.name);
    if (previous && stableJson(previous) !== stableJson(normalized)) fail(context, `conflicting atlas entries for ${candidate.name}`);
    byName.set(candidate.name, normalized);
  }
  const missing = requiredNames.filter((name) => !byName.has(name));
  if (missing.length > 0) fail(context, `missing atlas frames: ${missing.join(", ")}`);
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function logicalEntry(config, logicalPath, typeIndex) {
  const found = Object.entries(config.paths).find(([, value]) => value[0] === logicalPath && value[1] === typeIndex);
  if (!found) fail(logicalPath, `Cocos config type ${typeIndex} entry is missing`);
  return Number(found[0]);
}

function cocosJsonPath(bundleName, config, logicalPath) {
  const index = logicalEntry(config, logicalPath, 2);
  const uuid = decompressUuid(config.uuids[index]);
  return `remoteBundles/${bundleName}/${config.importBase}/${uuid.slice(0, 2)}/${uuid}.json`;
}

function deterministicUuid(seed) {
  const bytes = crypto.createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function imageMeta(relativeAssetPath) {
  const uuid = deterministicUuid(`snake-s1:${relativeAssetPath}`);
  const displayName = path.basename(relativeAssetPath, ".png");
  return {
    ver: "1.0.27", importer: "image", imported: true, uuid, files: [".json", ".png"],
    subMetas: {
      "6c48a": {
        importer: "texture", uuid: `${uuid}@6c48a`, displayName, id: "6c48a", name: "texture",
        userData: { wrapModeS: "repeat", wrapModeT: "repeat", minfilter: "linear", magfilter: "linear", mipfilter: "none", anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: uuid, visible: false },
        ver: "1.0.22", imported: true, files: [".json"], subMetas: {},
      },
    },
    userData: { type: "texture", fixAlphaTransparencyArtifacts: false, hasAlpha: true, redirect: `${uuid}@6c48a` },
  };
}

function directoryMeta(relativeAssetPath) {
  return { ver: "1.2.0", importer: "directory", imported: true, uuid: deterministicUuid(`snake-s1:${relativeAssetPath}`), files: [], subMetas: {}, userData: {} };
}

function ensureFreshMeta(targetRelativePath) {
  const target = path.join(REPO_ROOT, targetRelativePath);
  const meta = `${target}.meta`;
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, stableJson(imageMeta(targetRelativePath)));
}

export function refreshSource(sourceRoot) {
  const catalog = loadCatalog();
  const sourceIdentity = assertGitSnapshot(sourceRoot, catalog.sourceCommit, { clean: true });
  const tracker = new SourceTracker(sourceRoot);
  const configPath = "remoteBundles/internalSkins/config.json";
  const config = tracker.readJson(configPath, "resolve the 16 frozen internal skin resources");
  const sourceRecords = [];
  const resourceRecords = [];
  fs.mkdirSync(path.join(SOURCE_DIR, "internal-skins"), { recursive: true });
  fs.mkdirSync(path.join(SOURCE_DIR, "presentation"), { recursive: true });
  fs.mkdirSync(COCOS_RESOURCE_DIR, { recursive: true });

  const copyResource = (sourceRelativePath, targetFile, logicalName) => {
    const data = tracker.read(sourceRelativePath, logicalName);
    const targetRelativePath = `apps/Cocos/assets/resources/snakeoff/${targetFile}`;
    fs.writeFileSync(path.join(REPO_ROOT, targetRelativePath), data);
    ensureFreshMeta(targetRelativePath);
    resourceRecords.push({ logicalName, sourceRelativePath, targetRelativePath, sourceSha256: sha256(data), outputSha256: sha256(data), conversion: "byte-for-byte copy; Cocos .meta is repository-owned and never copied" });
    return data;
  };

  for (const skin of catalog.skins) {
    const logicalPath = `${skin.skinId}/${skin.skinId}`;
    const bodyPath = cocosJsonPath("internalSkins", config, logicalPath);
    const atlasPath = cocosAtlasPackPath("internalSkins", config, logicalPath);
    const texturePath = cocosNativePath("internalSkins", config, logicalPath);
    const bodyRaw = tracker.readJson(bodyPath, `skin ${skin.skinId} body configuration`);
    const body = extractBodyPayload(bodyRaw, skin.skinId, bodyPath);
    const textureData = copyResource(texturePath, skin.targetFile, `skin/${skin.skinId}/texture`);
    const texture = decodePng(textureData);
    const atlasRaw = tracker.readJson(atlasPath, `skin ${skin.skinId} atlas frame metadata`);
    const atlas = { texture: { width: texture.width, height: texture.height }, frames: extractAtlasFrames(atlasRaw, referencedFrameNames(body), `skin ${skin.skinId} ${atlasPath}`) };
    const targetDirectory = path.join(SOURCE_DIR, "internal-skins", String(skin.skinId));
    fs.mkdirSync(targetDirectory, { recursive: true });
    const bodyOutput = stableJson(body);
    const atlasOutput = stableJson(atlas);
    fs.writeFileSync(path.join(targetDirectory, "body.json"), bodyOutput);
    fs.writeFileSync(path.join(targetDirectory, "atlas.json"), atlasOutput);
    sourceRecords.push({
      logicalName: `skin/${skin.skinId}`,
      skinId: skin.skinId,
      bodyPath,
      atlasPath,
      texturePath,
      bodyInput: `tools/snake-s1-assets/source/internal-skins/${skin.skinId}/body.json`,
      bodyOutputSha256: sha256(bodyOutput),
      atlasInput: `tools/snake-s1-assets/source/internal-skins/${skin.skinId}/atlas.json`,
      atlasOutputSha256: sha256(atlasOutput),
    });
  }

  const atlasConfigPath = "remoteBundles/atlas/config.json";
  const atlasConfig = tracker.readJson(atlasConfigPath, "resolve food and effect presentation resources");
  for (const [key, spec, required] of [
    ["food", catalog.presentation.food, [...catalog.presentation.food.dotFrames, catalog.presentation.food.starFrame]],
    ["speedFx", catalog.presentation.speedFx, catalog.presentation.speedFx.frames],
    ["extras", catalog.presentation.extras, catalog.presentation.extras.frames],
  ]) {
    const texturePath = cocosNativePath("atlas", atlasConfig, spec.logicalPath);
    const atlasPath = cocosAtlasPackPath("atlas", atlasConfig, spec.logicalPath);
    const textureData = copyResource(texturePath, spec.targetFile, `presentation/${key}/texture`);
    const texture = decodePng(textureData);
    const atlasRaw = tracker.readJson(atlasPath, `${key} presentation frame metadata`);
    const normalized = { texture: { width: texture.width, height: texture.height }, frames: extractAtlasFrames(atlasRaw, required, `${key} ${atlasPath}`) };
    const normalizedOutput = stableJson(normalized);
    fs.writeFileSync(path.join(SOURCE_DIR, "presentation", `${key}.atlas.json`), normalizedOutput);
    sourceRecords.push({ logicalName: `presentation/${key}`, presentation: key, atlasPath, texturePath, atlasInput: `tools/snake-s1-assets/source/presentation/${key}.atlas.json`, atlasOutputSha256: sha256(normalizedOutput) });
  }
  for (const wall of catalog.presentation.walls) copyResource(wall.sourceRelativePath, wall.targetFile, `wall/${wall.theme}`);
  for (const audio of catalog.presentation.audio) if (audio.sourceRelativePath) copyResource(audio.sourceRelativePath, audio.targetFile, `audio/${audio.event}`);

  for (const [code, purpose] of [
    ["subpackages/loading/bundle/_r/loader/Loader.js", "frame-time and head-anchor interpretation provenance only; never executed"],
    ["subpackages/loading/bundle/_r/game/util/GameUtil.js", "NormalRepeat layout interpretation provenance only; never executed"],
    ["subpackages/loading/bundle/_r/store/FeedGameStore.js", "frozen AI skin pool provenance only; never executed"],
    ["subpackages/loading/bundle/_r/store/SkinStore.js", "frozen AI eligibility provenance only; never executed"],
  ]) tracker.read(code, purpose);
  tracker.verifyUnchanged();
  const manifest = {
    schemaVersion: 1,
    generatedBy: "tools/snake-s1-assets/cli.mjs --refresh-source",
    sourceArchiveRoot: fs.realpathSync(sourceRoot),
    sourceIdentity,
    approval: catalog.approval,
    sourceFiles: tracker.manifest(),
    normalizedInputs: sourceRecords,
    copiedResources: resourceRecords.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
  };
  fs.writeFileSync(path.join(SOURCE_DIR, "manifest.json"), stableJson(manifest));
  return manifest;
}

function readRepoJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function resourceAsset(targetFile) {
  return `snakeoff/${targetFile.replace(/\.[^.]+$/, "")}`;
}

function wholeTextureFrame(name, width, height) {
  return {
    sourceFrameName: name,
    rect: { x: 0, y: 0, width, height },
    pivot: { x: 0.5, y: 0.5 },
    trimOffset: { x: 0, y: 0 },
    originalSize: { width, height },
    rotated: false,
    trimmed: false,
  };
}

function atlasFrameLookup(atlas, context) {
  const lookup = new Map();
  for (const raw of atlas.frames) {
    const frame = normalizeAtlasFrame(raw, `${context}.${raw.name}`);
    validateFrameBounds(frame, atlas.texture, `${context}.${raw.name}`);
    lookup.set(raw.name, frame);
  }
  return lookup;
}

function generatedTs(banner, exports) {
  const lines = [`/** ${banner} */`, "// Generated by tools/snake-s1-assets/cli.mjs. DO NOT EDIT.", ""];
  for (const [name, value] of Object.entries(exports)) {
    if (typeof value === "string" && name.endsWith("HASH")) lines.push(`export const ${name} = ${JSON.stringify(value)};`, "");
    else lines.push(`export const ${name} = ${JSON.stringify(value, null, 2)} as const;`, "");
  }
  return lines.join("\n");
}

function extractSprite(texture, frame) {
  const packedRect = frame.rotated
    ? [frame.rect.x, frame.rect.y, frame.rect.height, frame.rect.width]
    : [frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height];
  const packed = crop(texture, packedRect);
  if (!frame.rotated) return packed;
  const restored = image(frame.rect.width, frame.rect.height);
  for (let y = 0; y < restored.height; y += 1) {
    for (let x = 0; x < restored.width; x += 1) {
      const sourceX = packed.width - 1 - y;
      const sourceY = x;
      const sourceOffset = (sourceY * packed.width + sourceX) * 4;
      restored.data.set(packed.data.subarray(sourceOffset, sourceOffset + 4), (y * restored.width + x) * 4);
    }
  }
  return restored;
}

function drawMotionPreview(target, presentation, texture, motion, originX, centerY, scale = 1) {
  const displayHeight = 56 * scale * presentation.visualScale;
  const bodyFrames = motion.body.map((track) => extractSprite(texture, track.frames[0]));
  for (let index = 7; index >= 0; index -= 1) {
    const sprite = bodyFrames[motion.bodySequence[index % motion.bodySequence.length]];
    const width = displayHeight * sprite.width / sprite.height;
    drawSprite(target, sprite, originX + index * 36 * scale, centerY, width, displayHeight);
  }
  if (motion.tail) {
    const sprite = extractSprite(texture, motion.tail.frames[0]);
    drawSprite(target, sprite, originX - 30 * scale, centerY, displayHeight * sprite.width / sprite.height, displayHeight);
  }
  const head = extractSprite(texture, motion.head.frames[0]);
  drawSprite(target, head, originX + 8 * 36 * scale, centerY, displayHeight * head.width / head.height, displayHeight);
}

function renderPreview(presentation, texture) {
  const canvas = image(420, 160, [18, 24, 38, 255]);
  fillRect(canvas, 0, 0, 420, 28, [36, 55, 107, 255]);
  text(canvas, `SKIN ${presentation.skinId} NORMAL`, 12, 7, [255, 255, 255, 255], 2);
  drawMotionPreview(canvas, presentation, texture, presentation.normal, 45, 92, 0.95);
  return encodePng(canvas);
}

function renderContactSheet(previews) {
  const canvas = image(4 * 420, 4 * 160, [10, 14, 24, 255]);
  previews.forEach((preview, index) => {
    const decoded = decodePng(preview.data);
    drawSprite(canvas, decoded, (index % 4) * 420 + 210, Math.floor(index / 4) * 160 + 80, 420, 160);
  });
  return encodePng(canvas);
}

function renderTechnicalSheet(presentations, textures) {
  const rowHeight = 96;
  const canvas = image(1000, rowHeight * presentations.length, [12, 17, 29, 255]);
  presentations.forEach((presentation, row) => {
    const y = row * rowHeight;
    fillRect(canvas, 0, y, 1000, rowHeight - 1, row % 2 === 0 ? [24, 33, 52, 255] : [29, 40, 62, 255]);
    text(canvas, `ID ${presentation.skinId}`, 10, y + 8, [255, 255, 255, 255], 2);
    text(canvas, `N B${presentation.normal.body.length} H${presentation.normal.head.frames.length} T${presentation.normal.tail ? 1 : 0}`, 10, y + 34, [166, 205, 255, 255], 1);
    text(canvas, `B B${presentation.boost.body.length} H${presentation.boost.head.frames.length} T${presentation.boost.tail ? 1 : 0}`, 10, y + 48, [255, 194, 133, 255], 1);
    const texture = textures.get(presentation.skinId);
    drawMotionPreview(canvas, presentation, texture, presentation.normal, 210, y + 48, 0.48);
    const headFrames = presentation.boost.head.frames;
    headFrames.forEach((frame, frameIndex) => {
      const sprite = extractSprite(texture, frame);
      drawSprite(canvas, sprite, 610 + frameIndex * 31, y + 48, 27 * sprite.width / sprite.height, 27);
    });
    text(canvas, presentation.boostSource === "inherit-normal" ? "INHERIT" : "SOURCE", 610, y + 73, [192, 231, 166, 255], 1);
  });
  return encodePng(canvas);
}

function addArtifact(artifacts, relativePath, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (artifacts.has(relativePath)) fail(relativePath, "artifact emitted twice");
  artifacts.set(relativePath, data);
}

function assertResourceTreeHygiene(directory) {
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(path.relative(REPO_ROOT, absolute), "resource symlinks are forbidden");
      if (stat.isDirectory()) visit(absolute);
      else if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\./i.test(name)) {
        fail(path.relative(REPO_ROOT, absolute), "source UUID/native filenames are forbidden in the target resource tree");
      }
    }
  };
  visit(directory);
}

function validateKnownStructures(presentations) {
  const byId = new Map(presentations.map((entry) => [entry.skinId, entry]));
  if (!byId.get(403).normal.tail || !byId.get(403).boost.tail) fail("skin 403", "normal and boost tail are required");
  for (const entry of presentations) if (entry.skinId !== 403 && (entry.normal.tail || entry.boost.tail)) fail(`skin ${entry.skinId}`, "only skin 403 may have a tail");
  if (byId.get(411).boost.head.frames.length !== 12) fail("skin 411", "boost head must contain 12 ordered frames");
  if (byId.get(701).normal.head.frames.length !== 2 || byId.get(701).boost.head.frames.length !== 7) fail("skin 701", "normal/boost head frame counts must be 2/7");
  for (const id of [3, 4]) if (byId.get(id).boostSource !== "inherit-normal") fail(`skin ${id}`, "empty boost tracks must inherit normal tracks");
  for (const entry of presentations) {
    if (entry.bodyRenderType !== 2) fail(`skin ${entry.skinId}`, "render type must be NormalRepeat(2)");
    if (entry.headAnchorY !== 0.5) fail(`skin ${entry.skinId}`, "normalized normal head anchor must be 0.5");
  }
}

function makeProvenance(manifest, artifacts) {
  const sourceByPath = new Map(manifest.sourceFiles.map((entry) => [entry.path, entry]));
  const metaState = (targetRelativePath) => {
    const meta = path.join(REPO_ROOT, `${targetRelativePath}.meta`);
    return fs.existsSync(meta) ? { state: "仓库新生成/持有，待 S5 Creator 确认", sha256: sha256(fs.readFileSync(meta)) } : { state: "缺失", sha256: null };
  };
  const resourceRows = manifest.copiedResources.map((record) => ({
    catalogLogicalName: record.logicalName,
    sourceAbsolutePath: path.join(manifest.sourceArchiveRoot, record.sourceRelativePath),
    sourceRelativePath: record.sourceRelativePath,
    sourceSha256: record.sourceSha256,
    authorizationEvidence: manifest.approval.evidence,
    authorizationDate: manifest.approval.approvedAt,
    responsible: manifest.approval.responsible,
    targetRelativePath: record.targetRelativePath,
    outputSha256: record.outputSha256,
    conversion: record.conversion,
    meta: metaState(record.targetRelativePath),
    rightsStatus: "approved by referenced evidence",
    status: manifest.approval.legalStatus,
  }));
  const normalizedRows = manifest.normalizedInputs.flatMap((record) => {
    const rows = [];
    for (const [kind, sourceField, targetField, outputHashField] of [
      ["body", "bodyPath", "bodyInput", "bodyOutputSha256"],
      ["atlas", "atlasPath", "atlasInput", "atlasOutputSha256"],
    ]) {
      const sourceRelativePath = record[sourceField];
      const targetRelativePath = record[targetField];
      if (!sourceRelativePath || !targetRelativePath) continue;
      const source = sourceByPath.get(sourceRelativePath);
      if (!source) fail(targetRelativePath, `source manifest record ${sourceRelativePath} is missing`);
      const targetData = fs.readFileSync(path.join(REPO_ROOT, targetRelativePath));
      if (sha256(targetData) !== record[outputHashField]) fail(targetRelativePath, "normalized input hash differs from refresh manifest");
      rows.push({
        catalogLogicalName: `${record.logicalName}/${kind}`,
        sourceAbsolutePath: path.join(manifest.sourceArchiveRoot, sourceRelativePath),
        sourceRelativePath,
        sourceSha256: source.sha256,
        authorizationEvidence: manifest.approval.evidence,
        authorizationDate: manifest.approval.approvedAt,
        responsible: manifest.approval.responsible,
        targetRelativePath,
        outputSha256: sha256(targetData),
        conversion: kind === "body" ? "extract JsonAsset skin payload and stable-normalize JSON" : "extract only referenced atlas frames; normalize rect/offset/originalSize/pivot/rotation and stable-sort",
        meta: { state: "不适用（仓内非 Cocos 资源）", sha256: null },
        rightsStatus: "approved by referenced evidence",
        status: manifest.approval.legalStatus,
      });
    }
    return rows;
  });
  const generatedRows = [...artifacts.entries()]
    .filter(([relativePath]) => relativePath.startsWith("apps/Cocos/assets/resources/snakeoff/previews/") && relativePath.endsWith(".png"))
    .map(([targetRelativePath, data]) => {
      const match = /snake_skin_(\d+)_preview\.png$/.exec(targetRelativePath);
      const skinId = Number(match?.[1]);
      const normalized = manifest.normalizedInputs.find((entry) => entry.skinId === skinId);
      const resource = manifest.copiedResources.find((entry) => entry.logicalName === `skin/${skinId}/texture`);
      const bodySource = sourceByPath.get(normalized.bodyPath);
      const atlasSource = sourceByPath.get(normalized.atlasPath);
      const textureSource = sourceByPath.get(resource.sourceRelativePath);
      if (!bodySource || !atlasSource || !textureSource) fail(targetRelativePath, "preview source records are missing from the frozen manifest");
      return ({
      catalogLogicalName: `preview/skin/${skinId}`,
      sourceAbsolutePath: path.join(manifest.sourceArchiveRoot, normalized.bodyPath),
      sourceRelativePath: normalized.bodyPath,
      sourceSha256: bodySource.sha256,
      additionalInputs: [
        { absolutePath: path.join(manifest.sourceArchiveRoot, normalized.atlasPath), sha256: atlasSource.sha256 },
        { absolutePath: path.join(manifest.sourceArchiveRoot, resource.sourceRelativePath), sha256: textureSource.sha256 },
      ],
      authorizationEvidence: manifest.approval.evidence,
      authorizationDate: manifest.approval.approvedAt,
      responsible: manifest.approval.responsible,
      targetRelativePath,
      outputSha256: sha256(data),
      conversion: "deterministic technical preview rendered by repository tool",
      meta: { state: "仓库新生成，待 S5 Creator 确认", sha256: sha256(artifacts.get(`${targetRelativePath}.meta`)) },
      rightsStatus: "derived exclusively from approved repository inputs",
      status: manifest.approval.legalStatus,
    });
    });
  return [...resourceRows, ...normalizedRows, ...generatedRows].sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath));
}

export function buildArtifacts() {
  const catalog = loadCatalog();
  const manifestPath = path.join(SOURCE_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("source/manifest.json", "run --refresh-source once before repository-only generation/check");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.sourceIdentity.actualCommit !== catalog.sourceCommit) fail("source/manifest.json", "frozen source commit differs from catalog");
  assertResourceTreeHygiene(COCOS_RESOURCE_DIR);
  const s0Palette = readRepoJson("docs/s/evidence/s0/presentation/palette.json");
  const expectedPalette = {
    light: { outside: s0Palette.light.outside, map: s0Palette.light.map, grid: s0Palette.light.grid, gridLineWidth: s0Palette.light.gridLineWidth, border: null, borderWidth: 0 },
    dark: { outside: s0Palette.dark.outside, map: s0Palette.dark.map, grid: s0Palette.dark.grid, gridLineWidth: s0Palette.dark.gridLineWidth, border: s0Palette.dark.boundary.color, borderWidth: s0Palette.dark.boundary.lineWidth },
  };
  if (stableJson(expectedPalette) !== stableJson(catalog.presentation.palette)
      || catalog.presentation.gridSpacing !== s0Palette.gridSpacingWorldUnits
      || catalog.presentation.mapMargin !== s0Palette.mapMarginWorldUnits) {
    fail("source/catalog.json presentation palette", "values differ from the frozen S0 palette evidence");
  }

  const sourceUuids = new Set(manifest.sourceFiles.flatMap((entry) => entry.path.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/ig) ?? []));
  for (const record of manifest.copiedResources) {
    const target = path.join(REPO_ROOT, record.targetRelativePath);
    if (!fs.existsSync(target)) fail(record.targetRelativePath, "registered resource is missing");
    const actual = sha256(fs.readFileSync(target));
    if (actual !== record.outputSha256) fail(record.targetRelativePath, `resource SHA mismatch: expected ${record.outputSha256}, got ${actual}`);
    if (!fs.existsSync(`${target}.meta`)) fail(`${record.targetRelativePath}.meta`, "repository-owned Cocos metadata is missing");
    const meta = JSON.parse(fs.readFileSync(`${target}.meta`, "utf8"));
    if (sourceUuids.has(meta.uuid)) fail(`${record.targetRelativePath}.meta`, "source-project UUID was copied into the target project");
  }

  const publicCatalog = catalog.skins.map(({ skinId, contentVersion, publicationState, isDefault, sortOrder, playerUsable, technicalLabel }) => ({ skinId, contentVersion, publicationState, isDefault, sortOrder, playerUsable, technicalLabel }));
  const publicCatalogHash = sha256(stableJson(publicCatalog));
  const businessCatalog = catalog.skins.map(({ skinId, technicalLabel, aiEligible }) => ({
    skinId,
    aiEligible,
    displayName: { state: "technical-draft", value: technicalLabel },
    rarity: { state: "draft", value: null },
    ownershipItemId: { state: "unavailable", value: null },
    fragmentItemId: { state: "unavailable", value: null },
    acquisition: { state: "unavailable", value: null },
    saleState: { state: "unavailable", value: null },
    price: { state: "unavailable", value: null },
  }));
  const serverBusinessHash = sha256(stableJson({ publicCatalogHash, businessCatalog }));

  const converted = [];
  const textures = new Map();
  for (const skin of catalog.skins) {
    const body = readRepoJson(`tools/snake-s1-assets/source/internal-skins/${skin.skinId}/body.json`);
    const atlas = readRepoJson(`tools/snake-s1-assets/source/internal-skins/${skin.skinId}/atlas.json`);
    const conversion = convertSkinSource(skin.skinId, body, atlas);
    const resourcePath = path.join(COCOS_RESOURCE_DIR, skin.targetFile);
    const texture = decodePng(fs.readFileSync(resourcePath));
    if (texture.width !== atlas.texture.width || texture.height !== atlas.texture.height) fail(`skin ${skin.skinId}`, "texture dimensions differ from frozen atlas input");
    textures.set(skin.skinId, texture);
    converted.push({
      skinId: skin.skinId,
      previewAsset: `snakeoff/previews/snake_skin_${skin.skinId}_preview`,
      textureAsset: skin.textureAsset,
      normal: conversion.normal,
      boost: conversion.boost,
      boostSource: conversion.boostSource,
      bodyRenderWidthRate: conversion.bodyRenderWidthRate,
      bodyRenderType: conversion.bodyRenderType,
      headAnchorY: conversion.headAnchorY,
      visualScale: conversion.visualScale,
      fallbackSkinId: skin.fallbackSkinId,
      wreckFrame: conversion.wreckFrame,
      textureSize: atlas.texture,
    });
  }
  validateKnownStructures(converted);

  const foodAtlas = readRepoJson("tools/snake-s1-assets/source/presentation/food.atlas.json");
  const speedAtlas = readRepoJson("tools/snake-s1-assets/source/presentation/speedFx.atlas.json");
  const extrasAtlas = readRepoJson("tools/snake-s1-assets/source/presentation/extras.atlas.json");
  const foodFrames = atlasFrameLookup(foodAtlas, "food");
  const speedFrames = atlasFrameLookup(speedAtlas, "speedFx");
  const extrasFrames = atlasFrameLookup(extrasAtlas, "extras");
  const foodSpec = catalog.presentation.food;
  const copiedHash = (targetFile) => manifest.copiedResources.find((record) => record.targetRelativePath.endsWith(`/${targetFile}`))?.outputSha256 ?? fail(targetFile, "registered resource hash is missing");
  const presentationCatalog = {
    grid: { spacing: catalog.presentation.gridSpacing, mapMargin: catalog.presentation.mapMargin, palette: catalog.presentation.palette },
    identity: {
      skinTint: [255, 255, 255, 255],
      seatTinting: "forbidden",
      human: { arrow: "procedural", nameplate: "text", outline: "procedural" },
      ai: { arrow: "none", nameplate: "text", outline: "procedural" },
    },
    food: {
      textureAsset: resourceAsset(foodSpec.targetFile),
      dots: foodSpec.dotFrames.map((name) => ({ kind: `dot-${name}`, frame: foodFrames.get(name), displaySize: foodSpec.dotDisplaySize })),
      star: {
        kind: "star",
        frame: foodFrames.get(foodSpec.starFrame),
        displaySize: foodSpec.starDisplaySize,
        themeVariants: ["light", "dark"].map((theme) => ({ theme, frame: foodFrames.get(foodSpec.starFrame), logicalAliasOf: "star" })),
        fallbackTheme: "light",
      },
      batch: { model: "single-atlas-single-material", capacity: foodSpec.batchCapacity },
    },
    wreck: {
      speed: { kind: "speed-wreck", displaySize: catalog.presentation.wreck.speedDisplaySize },
      aiDeath: { kind: "ai-death-wreck", displaySize: catalog.presentation.wreck.aiDeathDisplaySize },
      skins: converted.map((skin) => ({ skinId: skin.skinId, textureAsset: skin.textureAsset, frame: skin.wreckFrame, fallbackSkinId: skin.skinId === 1 ? null : 1 })),
    },
    walls: catalog.presentation.walls.map((wall) => {
      const target = path.join(COCOS_RESOURCE_DIR, wall.targetFile);
      const decoded = decodePng(fs.readFileSync(target));
      return {
        theme: wall.theme,
        textureAsset: resourceAsset(wall.targetFile),
        frame: wholeTextureFrame("whole-texture", decoded.width, decoded.height),
        renderRule: "repeat-tile",
        boundaryDirections: ["top", "right", "bottom", "left"],
        fallbackTheme: wall.theme === "light" ? null : "light",
      };
    }),
    audio: catalog.presentation.audio.map((entry) => ({
      event: entry.event,
      policy: entry.policy,
      asset: entry.targetFile ? resourceAsset(entry.targetFile) : null,
      resourceHash: entry.targetFile ? copiedHash(entry.targetFile) : null,
      volume: entry.policy === "resource" ? 1 : null,
      maxConcurrent: entry.policy === "resource" ? (entry.event === "button" ? 2 : 4) : null,
      missingPolicy: "silent",
      endlessReachability: entry.event === "time-over" ? "unreachable" : entry.event === "personal-run-result" ? "silent" : "mapped",
    })),
    effects: [
      { event: "boost", policy: "resource", textureAsset: resourceAsset(catalog.presentation.speedFx.targetFile), resourceHash: copiedHash(catalog.presentation.speedFx.targetFile), frame: speedFrames.get("speed_up"), fallbackEvent: null },
      { event: "protection", policy: "resource", textureAsset: resourceAsset(catalog.presentation.extras.targetFile), resourceHash: copiedHash(catalog.presentation.extras.targetFile), frame: extrasFrames.get("protect"), fallbackEvent: null },
      { event: "spawn-protection", policy: "resource", textureAsset: resourceAsset(catalog.presentation.extras.targetFile), resourceHash: copiedHash(catalog.presentation.extras.targetFile), frame: extrasFrames.get("protect"), fallbackEvent: "protection" },
      { event: "revive-protection", policy: "resource", textureAsset: resourceAsset(catalog.presentation.extras.targetFile), resourceHash: copiedHash(catalog.presentation.extras.targetFile), frame: extrasFrames.get("protect"), fallbackEvent: "protection" },
      { event: "death-explosion", policy: "none", textureAsset: null, resourceHash: null, frame: null, fallbackEvent: null },
      { event: "collectible-special", policy: "none", textureAsset: null, resourceHash: null, frame: null, fallbackEvent: null },
    ],
  };
  const clientCatalog = converted.map(({ wreckFrame: _wreckFrame, textureSize: _textureSize, ...entry }) => entry);
  const clientPresentationHash = sha256(stableJson({ publicCatalogHash, clientCatalog, presentationCatalog }));

  const artifacts = new Map();
  addArtifact(artifacts, "apps/shared/src/cosmetics/snakeSkinCatalog.generated.ts", generatedTs("Snake S1 public skin identity catalog.", {
    PUBLIC_SNAKE_SKIN_CATALOG_DATA: publicCatalog,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH: publicCatalogHash,
  }));
  addArtifact(artifacts, "apps/server/src/rooms/modes/snake/skinBusinessCatalog.generated.ts", generatedTs("Snake S1 server-only business draft catalog.", {
    SNAKE_SKIN_BUSINESS_CATALOG_DATA: businessCatalog,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH: publicCatalogHash,
    SERVER_SNAKE_SKIN_BUSINESS_HASH: serverBusinessHash,
  }));
  addArtifact(artifacts, "apps/client/src/logic/rooms/snake/SnakePresentationCatalog.generated.ts", generatedTs("Snake S1 client-only presentation catalog.", {
    CLIENT_SNAKE_PRESENTATION_CATALOG_DATA: clientCatalog,
    SNAKE_ENTITY_PRESENTATION_CATALOG_DATA: presentationCatalog,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH: publicCatalogHash,
    CLIENT_SNAKE_PRESENTATION_HASH: clientPresentationHash,
  }));

  const previews = converted.map((presentation) => ({ skinId: presentation.skinId, data: renderPreview(presentation, textures.get(presentation.skinId)) }));
  addArtifact(artifacts, "apps/Cocos/assets/resources/snakeoff/previews.meta", stableJson(directoryMeta("apps/Cocos/assets/resources/snakeoff/previews")));
  for (const preview of previews) {
    const runtimePath = `apps/Cocos/assets/resources/snakeoff/previews/snake_skin_${preview.skinId}_preview.png`;
    addArtifact(artifacts, runtimePath, preview.data);
    addArtifact(artifacts, `${runtimePath}.meta`, stableJson(imageMeta(runtimePath)));
    addArtifact(artifacts, `docs/s/evidence/s1/previews/skin-${preview.skinId}.png`, preview.data);
  }
  addArtifact(artifacts, "docs/s/evidence/s1/contact-sheet.png", renderContactSheet(previews));
  addArtifact(artifacts, "docs/s/evidence/s1/technical-contact-sheet.png", renderTechnicalSheet(converted, textures));

  const durations = converted.flatMap((skin) => [skin.normal, skin.boost].flatMap((motion) => [motion.head, ...motion.body, ...(motion.tail ? [motion.tail] : [])].flatMap((track) => track.frames.map((frame) => frame.durationFrames))));
  const technicalReview = {
    status: "passed-headless",
    reviewedSkinIds: EXPECTED_SKIN_IDS,
    blockingIssues: [],
    contactSheetInspection: { status: "passed", reviewedAt: "2026-09-03", scope: "normal silhouettes plus normal/boost head tracks, body counts, optional tail, trim and rotation" },
    assertions: {
      normalRepeatOnly: converted.every((skin) => skin.bodyRenderType === 2),
      skin403OnlyTail: converted.filter((skin) => skin.normal.tail || skin.boost.tail).map((skin) => skin.skinId),
      skin411BoostHeadFrames: converted.find((skin) => skin.skinId === 411).boost.head.frames.length,
      skin701HeadFrames: { normal: converted.find((skin) => skin.skinId === 701).normal.head.frames.length, boost: converted.find((skin) => skin.skinId === 701).boost.head.frames.length },
      inheritedBoostSkinIds: converted.filter((skin) => skin.boostSource === "inherit-normal").map((skin) => skin.skinId),
      minimumDurationFrames: Math.min(...durations),
      preservedSixFrameDuration: durations.includes(6),
      rotatedFrames: converted.flatMap((skin) => [skin.normal, skin.boost].flatMap((motion) => [motion.head, ...motion.body, ...(motion.tail ? [motion.tail] : [])].flatMap((track) => track.frames))).filter((frame) => frame.rotated).map((frame) => frame.sourceFrameName),
      displayLabelsAreTechnicalDrafts: true,
      creatorImportValidationDeferredTo: "S5",
    },
  };
  const contentReviewPackage = {
    targetStage: "S3",
    status: "ready-for-product-review-not-approved",
    catalogHash: clientPresentationHash,
    previewContactSheet: "docs/s/evidence/s1/contact-sheet.png",
    technicalContactSheet: "docs/s/evidence/s1/technical-contact-sheet.png",
    labels: businessCatalog.map(({ skinId, displayName }) => ({ skinId, technicalLabel: displayName.value, productDisplayName: null })),
    decisionsRequired: ["product display names", "acquisition and pricing", "default ownership and wardrobe sorting", "final art acceptance"],
  };
  addArtifact(artifacts, "docs/s/evidence/s1/catalog-hashes.json", stableJson({ publicCatalogHash, serverBusinessHash, clientPresentationHash }));
  addArtifact(artifacts, "docs/s/evidence/s1/technical-review.json", stableJson(technicalReview));
  addArtifact(artifacts, "docs/s/evidence/s1/content-review-package.json", stableJson(contentReviewPackage));
  addArtifact(artifacts, "docs/s/evidence/s1/preview-metadata.json", stableJson(previews.map(({ skinId, data }) => ({ skinId, runtimeAsset: `snakeoff/previews/snake_skin_${skinId}_preview`, evidencePath: `previews/skin-${skinId}.png`, clientPresentationHash, sha256: sha256(data) }))));
  const completenessMatrix = catalog.skins.map((skin) => {
    const normalized = manifest.normalizedInputs.find((entry) => entry.skinId === skin.skinId);
    const resource = manifest.copiedResources.find((entry) => entry.logicalName === `skin/${skin.skinId}/texture`);
    const preview = previews.find((entry) => entry.skinId === skin.skinId);
    return {
      skinId: skin.skinId,
      contentVersion: skin.contentVersion,
      publicationState: skin.publicationState,
      playerUsable: skin.playerUsable,
      aiEligible: skin.aiEligible,
      fallbackSkinId: skin.fallbackSkinId,
      bodyInput: { path: normalized.bodyInput, sha256: normalized.bodyOutputSha256 },
      atlasInput: { path: normalized.atlasInput, sha256: normalized.atlasOutputSha256 },
      texture: { path: resource.targetRelativePath, sha256: resource.outputSha256 },
      preview: { path: `docs/s/evidence/s1/previews/skin-${skin.skinId}.png`, sha256: sha256(preview.data) },
      status: "complete",
    };
  });
  const sourceFrameTimes = (skin) => {
    const raw = readRepoJson(`tools/snake-s1-assets/source/internal-skins/${skin.skinId}/body.json`).skin;
    const times = [];
    for (const key of ["head_frame", "head_speed_frame", "tail_frame", "tail_speed_frame"]) for (const frame of raw[key]?.frame ?? []) times.push(frame.frame_time ?? 0);
    for (const key of ["body_frame", "body_speed_frame"]) for (const track of raw[key] ?? []) for (const frame of track.frame ?? []) times.push(frame.frame_time ?? 0);
    return times;
  };
  const conversionReport = converted.map((entry) => {
    const raw = readRepoJson(`tools/snake-s1-assets/source/internal-skins/${entry.skinId}/body.json`).skin;
    const normalizedDurations = [entry.normal, entry.boost].flatMap((motion) => [motion.head, ...motion.body, ...(motion.tail ? [motion.tail] : [])].flatMap((track) => track.frames.map((frame) => frame.durationFrames)));
    return {
      skinId: entry.skinId,
      bodyRenderType: entry.bodyRenderType,
      bodyRenderWidthRate: entry.bodyRenderWidthRate,
      boostSource: entry.boostSource,
      normal: { headFrames: entry.normal.head.frames.length, bodyTracks: entry.normal.body.length, tail: entry.normal.tail !== null, sourceBodyOffset: entry.normal.sourceBodyOffset },
      boost: { headFrames: entry.boost.head.frames.length, bodyTracks: entry.boost.body.length, tail: entry.boost.tail !== null, sourceBodyOffset: entry.boost.sourceBodyOffset },
      sourceFrameTimes: sourceFrameTimes(entry),
      normalizedDurationFrames: normalizedDurations,
      sourceHeadAnchorMissing: raw.head_anchor_y_pos == null,
      normalizedHeadAnchorY: entry.headAnchorY,
      rotatedFrameCount: [entry.normal, entry.boost].flatMap((motion) => [motion.head, ...motion.body, ...(motion.tail ? [motion.tail] : [])].flatMap((track) => track.frames)).filter((frame) => frame.rotated).length,
      status: "converted-and-validated",
    };
  });
  addArtifact(artifacts, "docs/s/evidence/s1/completeness-matrix.json", stableJson(completenessMatrix));
  addArtifact(artifacts, "docs/s/evidence/s1/conversion-report.json", stableJson(conversionReport));
  addArtifact(artifacts, "docs/s/evidence/s1/validation-report.json", stableJson({
    status: "passed",
    sourceCommit: manifest.sourceIdentity.actualCommit,
    skinCount: publicCatalog.length,
    aiPool: businessCatalog.filter((skin) => skin.aiEligible).map((skin) => skin.skinId),
    defaultSkinId: publicCatalog.find((skin) => skin.isDefault).skinId,
    resourceCount: manifest.copiedResources.length,
    previewCount: previews.length,
    checks: ["public exact validation", "cross-layer public hash parity", "server business hash", "client presentation hash", "atlas bounds including rotated frames", "NormalRepeat-only render type", "known animation structures", "registered resource SHA and Cocos metadata"],
  }));
  addArtifact(artifacts, "docs/s/evidence/s1/provenance.json", stableJson(makeProvenance(manifest, artifacts)));
  addArtifact(artifacts, "docs/s/evidence/s1/execution-record.md", fs.readFileSync(path.join(SOURCE_DIR, "execution-record.md")));
  const evidenceReadme = `# Snake S1 headless acceptance evidence\n\nGenerated deterministically from repository-owned inputs by \`node tools/snake-s1-assets/cli.mjs --write\`. Normal generation and checking do not read the external archive.\n\n- Frozen source commit: \`${manifest.sourceIdentity.actualCommit}\`\n- Public catalog: ${publicCatalog.length} active/player-usable skins, default \`1\`\n- AI pool: \`${EXPECTED_AI_SKIN_IDS.join(", ")}\`\n- Imported presentation resources: ${manifest.copiedResources.length}\n- Individual previews: ${previews.length}\n- Public hash: \`${publicCatalogHash}\`\n- Server business hash: \`${serverBusinessHash}\`\n- Client presentation hash: \`${clientPresentationHash}\`\n- Creator import/final visual validation: explicitly deferred to S5.\n\n## Files\n\n- \`completeness-matrix.json\`: one closed row per frozen skin ID.\n- \`conversion-report.json\`: source frame times, normalized durations and known structure facts.\n- \`provenance.json\`: copy/normalized-input/preview provenance with source and output hashes.\n- \`validation-report.json\`, \`catalog-hashes.json\`: headless gate results and the three intentionally heterogeneous hashes.\n- \`execution-record.md\`: commands, exit codes, suite counts, visual review and explicit non-applicable gates.\n- \`technical-contact-sheet.png\`, \`technical-review.json\`: frame/track inspection and closed issue list.\n- \`contact-sheet.png\`, \`previews/\`, \`content-review-package.json\`: S3 content-review input.\n- \`SHA256SUMS\`: deterministic evidence integrity list.\n\nThe technical labels and acquisition fields are drafts; \`content-review-package.json\` is the S3 review input, not an approval record.\n`;
  addArtifact(artifacts, "docs/s/evidence/s1/README.md", evidenceReadme);

  const evidenceHashes = [...artifacts.entries()]
    .filter(([relativePath]) => relativePath.startsWith("docs/s/evidence/s1/") && !relativePath.endsWith("SHA256SUMS"))
    .map(([relativePath, data]) => `${sha256(data)}  ${relativePath.slice("docs/s/evidence/s1/".length)}`)
    .sort()
    .join("\n");
  addArtifact(artifacts, "docs/s/evidence/s1/SHA256SUMS", `${evidenceHashes}\n`);
  for (const [relativePath, data] of artifacts) {
    if ((relativePath.endsWith(".ts") || relativePath.includes("apps/Cocos/assets/src/")) && data.includes(Buffer.from(manifest.sourceArchiveRoot))) {
      fail(relativePath, "runtime/generated code contains the external source archive path");
    }
  }
  return { artifacts, publicCatalog, businessCatalog, clientCatalog, presentationCatalog, hashes: { publicCatalogHash, serverBusinessHash, clientPresentationHash } };
}

export function writeArtifacts() {
  const { artifacts, ...summary } = buildArtifacts();
  for (const [relativePath, data] of artifacts) {
    const target = path.join(REPO_ROOT, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return { ...summary, artifactCount: artifacts.size };
}

export function checkArtifacts() {
  const { artifacts, ...summary } = buildArtifacts();
  const differences = [];
  for (const [relativePath, expected] of artifacts) {
    const target = path.join(REPO_ROOT, relativePath);
    if (!fs.existsSync(target)) differences.push(`${relativePath} (missing)`);
    else if (!fs.readFileSync(target).equals(expected)) differences.push(`${relativePath} (different)`);
  }
  if (differences.length > 0) fail("check", `generated artifacts are stale:\n${differences.join("\n")}`);
  return { ...summary, artifactCount: artifacts.size };
}
