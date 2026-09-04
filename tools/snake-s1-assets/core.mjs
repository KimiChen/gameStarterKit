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
export const SNAKE_PRESENTATION_VERSION = 2;
export const HISTORICAL_PUBLIC_CATALOG_HASH = "a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075";
export const HISTORICAL_SERVER_BUSINESS_HASH = "9ed3762e5f5d24d168aafd14fcaccac1d4de83413d0acb17f6308cea1ccbfa19";
export const HISTORICAL_CLIENT_PRESENTATION_HASH = "62e1a6683a71db3ef0724cd6030114b7d9a64845723b14fa8c7c6d58a9302efe";

const MAGNET_TEXTURE_NAMES = Object.freeze(["x_lighting01", "x_lighting02", "x_lighting03", "xt_s_lighting", "xt_s_lighting02"]);
const COCOS2_SPRITE_MATERIAL_UUID = "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432";
const COCOS2_PARTICLE_COMPONENT_ID = "e839f825aJLOrg5Wb7mYQ7Q";
const SUPPORTED_COCOS2_CLASSES = new Set([
  "cc.Node",
  "cc.SpriteFrame",
  "cc.Prefab",
  "cc.Animation",
  "cc.PrefabInfo",
  COCOS2_PARTICLE_COMPONENT_ID,
  "cc.Sprite",
  "cc.ParticleSystem",
  "cc.AnimationClip",
]);

export function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, "catalog.json"), "utf8"));
  if (Array.isArray(catalog.skins)) catalog.skins = [...catalog.skins].sort((left, right) => left.sortOrder - right.sortOrder || left.skinId - right.skinId);
  validatePublicSource(catalog);
  return catalog;
}

function fail(context, message) {
  throw new Error(`[snake-s1] ${context}: ${message}`);
}

function expectExactKeys(value, expected, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(context, "expected an object");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (stableJson(actual) !== stableJson(wanted)) fail(context, `expected exact keys ${wanted.join(", ")}; got ${actual.join(", ")}`);
}

function expectSha(data, expected, context) {
  const actual = sha256(data);
  if (actual !== expected) fail(context, `source SHA mismatch: expected ${expected}, got ${actual}`);
  return actual;
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
  if (catalog.schemaVersion !== 2) fail("catalog.schemaVersion", "S1-12 source catalog schema must be 2");
  if (catalog.presentation?.presentationVersion !== SNAKE_PRESENTATION_VERSION) {
    fail("catalog.presentation.presentationVersion", `expected ${SNAKE_PRESENTATION_VERSION}`);
  }
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

  const magnet = catalog.presentation.magnet;
  if (magnet?.sourceToolId !== 10001 || magnet.displaySize !== 70) fail("catalog.presentation.magnet", "toolId/displaySize must be 10001/70");
  if (magnet.texture?.width !== 468 || magnet.texture?.height !== 769 || magnet.texture?.targetFile !== "snake_magnet_tools.png") {
    fail("catalog.presentation.magnet.texture", "frozen texture identity must be 468x769 snake_magnet_tools.png");
  }
  if (magnet.atlas?.sourceFrameName !== "10001") fail("catalog.presentation.magnet.atlas", "only source frame 10001 is accepted");
  const textureNames = magnet.aura?.textures?.map((entry) => entry.logicalName);
  if (stableJson(textureNames) !== stableJson(MAGNET_TEXTURE_NAMES)) fail("catalog.presentation.magnet.aura.textures", "five frozen aura textures must be explicit and ordered");
  if (new Set(magnet.aura.textures.map((entry) => entry.targetFile)).size !== MAGNET_TEXTURE_NAMES.length) {
    fail("catalog.presentation.magnet.aura.textures", "each aura texture must own one target file");
  }
  const collectAudio = catalog.presentation.audio.filter((entry) => entry.event === "collect-magnet");
  const loopAudio = catalog.presentation.audio.filter((entry) => entry.event === "magnet-active-loop");
  if (collectAudio.length !== 1 || collectAudio[0].policy !== "resource" || collectAudio[0].targetFile !== "snake_sfx_collect_magnet.mp3"
      || collectAudio[0].sfxOnGuarded !== true || collectAudio[0].playback !== "single-instance" || collectAudio[0].maxConcurrent !== 1
      || collectAudio[0].missingPolicy !== "silent") {
    fail("catalog.presentation.audio.collect-magnet", "resource/sfxOn/single-instance/maxConcurrent=1/missing=silent policy is required");
  }
  if (loopAudio.length !== 1 || loopAudio[0].policy !== "silent" || loopAudio[0].targetFile !== null || loopAudio[0].reason !== "no-approved-loop-audio") {
    fail("catalog.presentation.audio.magnet-active-loop", "the active loop must be explicit silent with no resource");
  }
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

function expectNoUnknownKeys(value, allowed, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(context, "expected an object");
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail(context, `unknown fields: ${unknown.sort().join(", ")}`);
}

function decodeCocos2ValueType(value, context) {
  if (!Array.isArray(value) || !Number.isInteger(value[0])) fail(context, "invalid packed value type");
  switch (value[0]) {
    case 0: return { x: expectFinite(value[1], `${context}.x`), y: expectFinite(value[2], `${context}.y`) };
    case 1: return { x: expectFinite(value[1], `${context}.x`), y: expectFinite(value[2], `${context}.y`), z: expectFinite(value[3], `${context}.z`) };
    case 2:
    case 3:
      return { x: expectFinite(value[1], `${context}.x`), y: expectFinite(value[2], `${context}.y`), z: expectFinite(value[3], `${context}.z`), w: expectFinite(value[4], `${context}.w`) };
    case 4: return { rgba: expectFinite(value[1], `${context}.rgba`) };
    case 5: return { width: expectFinite(value[1], `${context}.width`), height: expectFinite(value[2], `${context}.height`) };
    case 6:
      return {
        x: expectFinite(value[1], `${context}.x`),
        y: expectFinite(value[2], `${context}.y`),
        width: expectFinite(value[3], `${context}.width`),
        height: expectFinite(value[4], `${context}.height`),
      };
    case 7: return value.slice(1).map((entry, index) => expectFinite(entry, `${context}[${index}]`));
    default: fail(context, `unsupported packed value type ${value[0]}`);
  }
}

/**
 * Safe, data-only decoder for the frozen Cocos Creator 2 compiled JSON format. It intentionally supports only the
 * serialization operations and classes present in SnakeMagnet; no source-project JavaScript is evaluated.
 */
export function decodeCocos2PackedDocument(packed, context = "SnakeMagnet prefab pack") {
  if (!Array.isArray(packed) || packed.length !== 6 || packed[0] !== 1) fail(context, "expected a version-1 six-section Cocos 2 pack");
  const [, uuids, strings, classDefinitions, masks, dataItems] = packed;
  if (![uuids, strings, classDefinitions, masks, dataItems].every(Array.isArray)) fail(context, "pack sections must be arrays");
  const schemas = classDefinitions.map((definition, index) => {
    const name = typeof definition === "string" ? definition : definition?.[0];
    if (typeof name !== "string" || !SUPPORTED_COCOS2_CLASSES.has(name)) fail(`${context}.classes[${index}]`, `unsupported class ${JSON.stringify(name)}`);
    if (typeof definition === "string") return { name, properties: [], typeOffset: 0 };
    if (!Array.isArray(definition[1]) || !Number.isInteger(definition[2])) fail(`${context}.classes[${index}]`, "invalid class schema");
    return { name, properties: definition[1], typeOffset: definition[2] };
  });

  const decodeItem = (sourceItem, itemIndex) => {
    if (!Array.isArray(sourceItem) || sourceItem.length !== 6 || !Array.isArray(sourceItem[0])) fail(`${context}.data[${itemIndex}]`, "invalid data item");
    const item = structuredClone(sourceItem);
    const rawObjects = item[0];
    const customTypes = Array.isArray(item[1]) ? item[1] : [];
    if (!(item[1] === 0 || Array.isArray(item[1]))) fail(`${context}.data[${itemIndex}]`, "invalid custom type list");
    const references = Array.isArray(item[2]) ? item[2] : [];
    if (!(item[2] === 0 || Array.isArray(item[2]))) fail(`${context}.data[${itemIndex}]`, "invalid reference list");
    const uuidObjects = item[3];
    const uuidProperties = item[4];
    const uuidList = item[5];
    if (![uuidObjects, uuidProperties, uuidList].every(Array.isArray) || uuidObjects.length !== uuidProperties.length || uuidObjects.length !== uuidList.length) {
      fail(`${context}.data[${itemIndex}]`, "invalid UUID reference tables");
    }
    const objects = [];

    const setReference = (container, key, reference) => {
      if (!Number.isInteger(reference)) fail(`${context}.data[${itemIndex}]`, "object reference must be an integer");
      if (reference >= 0) container[key] = objects[reference];
      else references[3 * ~reference] = container;
    };
    const setUuid = (container, key, detailIndex) => {
      if (!Number.isInteger(detailIndex) || detailIndex < 0 || detailIndex >= uuidObjects.length) fail(`${context}.data[${itemIndex}]`, "UUID detail index is invalid");
      container[key] = null;
      uuidObjects[detailIndex] = container;
    };

    let decodeObject;
    const applyOperation = (operation, container, key, value, operationContext) => {
      switch (operation) {
        case 0: container[key] = value; break;
        case 1: setReference(container, key, value); break;
        case 2:
          if (!Array.isArray(value)) fail(operationContext, "object-reference array must be an array");
          container[key] = value.slice();
          value.forEach((reference, index) => setReference(container[key], index, reference));
          break;
        case 3:
          if (!Array.isArray(value)) fail(operationContext, "UUID-reference array must be an array");
          container[key] = value.slice();
          value.forEach((detailIndex, index) => setUuid(container[key], index, detailIndex));
          break;
        case 4: container[key] = decodeObject(value, operationContext); break;
        case 5:
        case 8: container[key] = decodeCocos2ValueType(value, operationContext); break;
        case 6: setUuid(container, key, value); break;
        case 7:
          if (!Array.isArray(value)) fail(operationContext, "packed set value must be an array");
          container[key] = value.slice();
          break;
        case 9:
          if (!Array.isArray(value)) fail(operationContext, "nested object array must be an array");
          container[key] = value.map((entry, index) => decodeObject(entry, `${operationContext}[${index}]`));
          break;
        case 10: fail(operationContext, "custom _deserialize payloads are not accepted for SnakeMagnet components");
        case 11: {
          if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object" || Array.isArray(value[0])) fail(operationContext, "invalid packed object operations");
          const target = value[0];
          container[key] = target;
          for (let index = 1; index < value.length; index += 3) {
            if (index + 2 >= value.length) fail(operationContext, "truncated packed object operation");
            applyOperation(value[index + 1], target, value[index], value[index + 2], `${operationContext}.${String(value[index])}`);
          }
          break;
        }
        case 12: {
          if (!Array.isArray(value) || !Array.isArray(value[0]) || value.length !== value[0].length + 1) fail(operationContext, "invalid packed array operations");
          const target = value[0].slice();
          container[key] = target;
          for (let index = 0; index < target.length; index += 1) {
            const nestedOperation = value[index + 1];
            if (nestedOperation !== 0) applyOperation(nestedOperation, target, index, target[index], `${operationContext}[${index}]`);
          }
          break;
        }
        default: fail(operationContext, `unsupported serialization operation ${operation}`);
      }
    };

    decodeObject = (encoded, objectContext) => {
      if (!Array.isArray(encoded) || !Number.isInteger(encoded[0])) fail(objectContext, "invalid packed object");
      const mask = masks[encoded[0]];
      if (!Array.isArray(mask) || mask.length < 2) fail(objectContext, `unknown property mask ${encoded[0]}`);
      const classIndex = mask[0];
      const schema = schemas[classIndex];
      const classDefinition = classDefinitions[classIndex];
      if (!schema || !Array.isArray(classDefinition)) fail(objectContext, "packed object must use a declared structured class");
      const directUntil = mask[mask.length - 1];
      if (!Number.isInteger(directUntil) || directUntil < 1 || directUntil > encoded.length) fail(objectContext, "invalid direct-property boundary");
      const result = { __type: schema.name };
      let valueIndex = 1;
      for (; valueIndex < directUntil; valueIndex += 1) {
        const property = schema.properties[mask[valueIndex]];
        if (typeof property !== "string") fail(objectContext, "invalid direct property index");
        result[property] = encoded[valueIndex];
      }
      for (; valueIndex < encoded.length; valueIndex += 1) {
        const propertyIndex = mask[valueIndex];
        const property = schema.properties[propertyIndex];
        const operation = classDefinition[propertyIndex + schema.typeOffset];
        if (typeof property !== "string" || !Number.isInteger(operation)) fail(objectContext, "invalid encoded property operation");
        applyOperation(operation, result, property, encoded[valueIndex], `${objectContext}.${property}`);
      }
      return result;
    };

    const regularCount = rawObjects.length - customTypes.length;
    if (regularCount < 0) fail(`${context}.data[${itemIndex}]`, "custom type count exceeds object count");
    for (let index = 0; index < regularCount; index += 1) objects[index] = decodeObject(rawObjects[index], `${context}.data[${itemIndex}].objects[${index}]`);
    for (let index = 0; index < customTypes.length; index += 1) {
      const objectIndex = regularCount + index;
      const schema = schemas[customTypes[index]];
      if (schema?.name !== "cc.SpriteFrame") fail(`${context}.data[${itemIndex}].objects[${objectIndex}]`, `unsupported custom asset ${schema?.name ?? "<missing>"}`);
      const payload = rawObjects[objectIndex];
      expectExactKeys(payload, ["capInsets", "name", "offset", "originalSize", "rect"], `${context}.data[${itemIndex}].SpriteFrame`);
      objects[objectIndex] = { __type: "cc.SpriteFrame", ...payload };
    }

    if (references.length > 0) {
      const sentinelIndex = references.length - 1;
      const directTriples = references[sentinelIndex];
      if (!Number.isInteger(directTriples) || directTriples < 0 || 3 * directTriples > sentinelIndex) fail(`${context}.data[${itemIndex}].references`, "invalid direct-reference sentinel");
      let index = 0;
      const assign = (target, propertyRef, objectRef) => {
        if (!target || typeof target !== "object" || !objects[objectRef]) fail(`${context}.data[${itemIndex}].references`, "dangling object reference");
        const property = propertyRef >= 0 ? strings[propertyRef] : ~propertyRef;
        if (property === undefined) fail(`${context}.data[${itemIndex}].references`, "unknown string property reference");
        target[property] = objects[objectRef];
      };
      for (; index < 3 * directTriples; index += 3) assign(references[index], references[index + 1], references[index + 2]);
      for (; index < sentinelIndex; index += 3) assign(objects[references[index]], references[index + 1], references[index + 2]);
      if (index !== sentinelIndex) fail(`${context}.data[${itemIndex}].references`, "truncated reference triples");
    }

    for (let index = 0; index < uuidObjects.length; index += 1) {
      const holder = Number.isInteger(uuidObjects[index]) ? objects[uuidObjects[index]] : uuidObjects[index];
      const propertyRef = uuidProperties[index];
      const property = Number.isInteger(propertyRef) ? (propertyRef >= 0 ? strings[propertyRef] : ~propertyRef) : propertyRef;
      const uuidIndex = uuidList[index];
      if (!holder || typeof holder !== "object" || property === undefined || !Number.isInteger(uuidIndex) || typeof uuids[uuidIndex] !== "string") {
        fail(`${context}.data[${itemIndex}].uuid[${index}]`, "invalid UUID reference");
      }
      holder[property] = { __uuid: decompressUuid(uuids[uuidIndex]) };
    }
    const rootIndex = item[1] === 0 ? 0 : regularCount === 0 ? 0 : item[1];
    if (!objects[rootIndex]) fail(`${context}.data[${itemIndex}]`, `root object ${rootIndex} is missing`);
    return objects[rootIndex];
  };

  return dataItems.map(decodeItem);
}

export function convertMagnetAtlasSource(source, texture = { width: 468, height: 769 }) {
  const frames = extractAtlasFrames(source, ["10001"], "magnet tools atlas");
  const result = { texture: { width: expectPositive(texture.width, "magnet texture.width"), height: expectPositive(texture.height, "magnet texture.height") }, frames };
  validateMagnetAtlas(result);
  return result;
}

export function validateMagnetAtlas(atlas) {
  expectExactKeys(atlas, ["frames", "texture"], "magnet atlas");
  if (atlas.texture?.width !== 468 || atlas.texture?.height !== 769) fail("magnet atlas.texture", "expected 468x769");
  if (!Array.isArray(atlas.frames) || atlas.frames.length !== 1 || atlas.frames[0]?.name !== "10001") fail("magnet atlas.frames", "must contain exactly frame 10001");
  const frame = normalizeAtlasFrame(atlas.frames[0], "magnet atlas.10001");
  validateFrameBounds(frame, atlas.texture, "magnet atlas.10001");
  const expected = {
    sourceFrameName: "10001",
    rect: { x: 346, y: 256, width: 84, height: 92 },
    pivot: { x: 0.5, y: 0.5 },
    trimOffset: { x: 0, y: 0 },
    originalSize: { width: 84, height: 92 },
    rotated: false,
    trimmed: false,
  };
  if (stableJson(frame) !== stableJson(expected)) fail("magnet atlas.10001", "normalized frame differs from the frozen rect/pivot/trim/original/rotation");
  return frame;
}

function packedUuid(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.__uuid !== "string") fail(context, "expected a packed UUID reference");
  return value.__uuid;
}

function normalizeTransform(node, context) {
  const trs = node._trs ?? [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
  if (!Array.isArray(trs) || trs.length !== 10) fail(`${context}._trs`, "expected position/quaternion/scale tuple of length 10");
  const values = trs.map((value, index) => expectFinite(value, `${context}._trs[${index}]`));
  const euler = node._eulerAngles ?? { x: 0, y: 0, z: 0 };
  return {
    position: { x: values[0], y: values[1], z: values[2] },
    rotation: { x: values[3], y: values[4], z: values[5], w: values[6] },
    scale: { x: values[7], y: values[8], z: values[9] },
    eulerDegrees: {
      x: expectFinite(euler.x ?? 0, `${context}._eulerAngles.x`),
      y: expectFinite(euler.y ?? 0, `${context}._eulerAngles.y`),
      z: expectFinite(euler.z ?? 0, `${context}._eulerAngles.z`),
    },
  };
}

function canonicalMagnetTextureName(nodeName) {
  const candidate = nodeName.replace(/_[23]$/, "");
  return MAGNET_TEXTURE_NAMES.includes(candidate) ? candidate : null;
}

function normalizeAnimationValue(property, value, context) {
  if (property === "opacity") return expectFinite(value, context);
  if (property === "position") {
    if (!Array.isArray(value) || value.length !== 3) fail(context, "position keyframe must be a three-number tuple");
    return { x: expectFinite(value[0], `${context}.x`), y: expectFinite(value[1], `${context}.y`), z: expectFinite(value[2], `${context}.z`) };
  }
  if (property === "scale") {
    if (Array.isArray(value)) {
      if (value.length !== 3) fail(context, "scale tuple must contain three numbers");
      return { x: expectFinite(value[0], `${context}.x`), y: expectFinite(value[1], `${context}.y`), z: expectFinite(value[2], `${context}.z`) };
    }
    expectExactKeys(value, ["x", "y"], context);
    return { x: expectFinite(value.x, `${context}.x`), y: expectFinite(value.y, `${context}.y`), z: 1 };
  }
  fail(context, `unsupported animation property ${property}`);
}

function normalizeMagnetAnimation(clip) {
  expectNoUnknownKeys(clip, ["__type", "_name", "_duration", "wrapMode", "curveData"], "SnakeMagnet animation");
  if (clip.__type !== "cc.AnimationClip" || clip._name !== "snake_magnet") fail("SnakeMagnet animation", "expected the snake_magnet AnimationClip");
  const durationSeconds = expectPositive(clip._duration, "SnakeMagnet animation._duration");
  if (durationSeconds !== 1 / 3 || clip.wrapMode !== 2) fail("SnakeMagnet animation", "duration/wrapMode must be 1/3 seconds and Cocos 2 loop(2)");
  expectExactKeys(clip.curveData, ["paths"], "SnakeMagnet animation.curveData");
  const tracks = Object.entries(clip.curveData.paths).map(([nodePath, pathValue]) => {
    expectExactKeys(pathValue, ["props"], `SnakeMagnet animation.${nodePath}`);
    const properties = Object.entries(pathValue.props).map(([property, keyframes]) => {
      if (!["position", "opacity", "scale"].includes(property)) fail(`SnakeMagnet animation.${nodePath}`, `unsupported animation field ${property}`);
      if (!Array.isArray(keyframes) || keyframes.length === 0) fail(`SnakeMagnet animation.${nodePath}.${property}`, "keyframes must not be empty");
      const normalized = keyframes.map((keyframe, index) => {
        expectExactKeys(keyframe, ["frame", "value"], `SnakeMagnet animation.${nodePath}.${property}[${index}]`);
        const time = expectFinite(keyframe.frame, `SnakeMagnet animation.${nodePath}.${property}[${index}].frame`);
        if (time < 0 || time > durationSeconds) fail(`SnakeMagnet animation.${nodePath}.${property}[${index}]`, "keyframe lies outside clip duration");
        return { time, value: normalizeAnimationValue(property, keyframe.value, `SnakeMagnet animation.${nodePath}.${property}[${index}].value`) };
      }).sort((left, right) => left.time - right.time || stableJson(left.value).localeCompare(stableJson(right.value)));
      if (normalized.some((entry, index) => index > 0 && entry.time === normalized[index - 1].time)) fail(`SnakeMagnet animation.${nodePath}.${property}`, "duplicate keyframe time");
      return { property, keyframes: normalized };
    }).sort((left, right) => left.property.localeCompare(right.property));
    return { nodePath, properties };
  }).sort((left, right) => left.nodePath.localeCompare(right.nodePath));
  return { name: "snake_magnet", durationSeconds, wrapMode: "loop", tracks };
}

function normalizeMagnetNode(node, nodePath, state) {
  expectNoUnknownKeys(node, ["__type", "_name", "_opacity", "_prefab", "_parent", "_children", "_components", "_eulerAngles", "_contentSize", "_trs"], nodePath);
  if (node.__type !== "cc.Node" || typeof node._name !== "string" || node._name.length === 0) fail(nodePath, "expected a named cc.Node");
  const components = (node._components ?? []).map((component, index) => {
    const context = `${nodePath}.components[${index}]`;
    if (!component || typeof component !== "object" || Array.isArray(component) || typeof component.__type !== "string") fail(context, "invalid component");
    if (component.node !== node) fail(context, "component node back-reference is invalid");
    if (component.__type === "cc.Animation") {
      expectExactKeys(component, ["__type", "_clips", "_defaultClip", "node", "playOnLoad"], context);
      if (nodePath !== "SnakeMagnet" || component.playOnLoad !== true || component._clips?.length !== 1
          || packedUuid(component._clips[0], `${context}._clips[0]`) !== packedUuid(component._defaultClip, `${context}._defaultClip`)) {
        fail(context, "expected one play-on-load snake_magnet clip");
      }
      state.animationComponents += 1;
      return { type: "animation-player", playOnLoad: true, clip: "snake_magnet" };
    }
    if (component.__type === COCOS2_PARTICLE_COMPONENT_ID) {
      expectExactKeys(component, ["__type", "node"], context);
      if (node._name !== "xt_lizi_on") fail(context, "particle lifecycle controller is attached to an unexpected node");
      state.lifecycleComponents += 1;
      return { type: "particle-lifecycle", onEnable: "reset-stop-reset", onDisable: "reset-stop" };
    }
    if (component.__type === "cc.Sprite") {
      expectExactKeys(component, ["__type", "_materials", "_spriteFrame", "node"], context);
      const logicalTexture = canonicalMagnetTextureName(node._name);
      if (!logicalTexture) fail(context, `sprite node ${node._name} has no frozen texture mapping`);
      if (!Array.isArray(component._materials) || component._materials.length !== 1
          || packedUuid(component._materials[0], `${context}._materials[0]`) !== COCOS2_SPRITE_MATERIAL_UUID) {
        fail(context, "only the frozen built-in alpha sprite material is supported");
      }
      packedUuid(component._spriteFrame, `${context}._spriteFrame`);
      state.usedTextures.add(logicalTexture);
      state.spriteComponents += 1;
      return { type: "sprite", texture: logicalTexture, blend: { source: "src-alpha", destination: "one-minus-src-alpha" } };
    }
    if (component.__type === "cc.ParticleSystem") {
      expectExactKeys(component, [
        "__type", "_custom", "_dstBlendFactor", "_endColor", "_endColorVar", "_file", "_materials", "_positionType",
        "_spriteFrame", "_startColor", "_startColorVar", "angle", "angleVar", "emissionRate", "endSize", "endSpinVar",
        "life", "node", "posVar", "speed", "speedVar", "startSize", "startSizeVar", "tangentialAccel", "totalParticles",
      ], context);
      if (!Array.isArray(component._materials) || component._materials.length !== 1
          || packedUuid(component._materials[0], `${context}._materials[0]`) !== COCOS2_SPRITE_MATERIAL_UUID
          || component._dstBlendFactor !== 1 || component._custom !== true) {
        fail(context, "only the frozen additive custom particle material is supported");
      }
      packedUuid(component._file, `${context}._file`);
      packedUuid(component._spriteFrame, `${context}._spriteFrame`);
      state.usedTextures.add("xt_s_lighting");
      state.particleComponents += 1;
      const numeric = (key) => expectFinite(component[key], `${context}.${key}`);
      return {
        type: "particle-system",
        texture: "xt_s_lighting",
        blend: { source: "src-alpha", destination: "one" },
        parameters: {
          totalParticles: numeric("totalParticles"),
          emissionRate: numeric("emissionRate"),
          lifeSeconds: numeric("life"),
          angleDegrees: numeric("angle"),
          angleVarianceDegrees: numeric("angleVar"),
          startSize: numeric("startSize"),
          startSizeVariance: numeric("startSizeVar"),
          endSize: numeric("endSize"),
          endSpinVariance: numeric("endSpinVar"),
          positionType: numeric("_positionType"),
          speed: numeric("speed"),
          speedVariance: numeric("speedVar"),
          tangentialAcceleration: numeric("tangentialAccel"),
          positionVariance: {
            x: expectFinite(component.posVar?.x, `${context}.posVar.x`),
            y: expectFinite(component.posVar?.y, `${context}.posVar.y`),
          },
          startColorRgba: expectFinite(component._startColor?.rgba, `${context}._startColor.rgba`),
          startColorVarianceRgba: expectFinite(component._startColorVar?.rgba, `${context}._startColorVar.rgba`),
          endColorRgba: expectFinite(component._endColor?.rgba, `${context}._endColor.rgba`),
          endColorVarianceRgba: expectFinite(component._endColorVar?.rgba, `${context}._endColorVar.rgba`),
        },
      };
    }
    fail(context, `unsupported component ${component.__type}`);
  });
  const contentSize = node._contentSize == null ? null : {
    width: expectFinite(node._contentSize.width, `${nodePath}._contentSize.width`),
    height: expectFinite(node._contentSize.height, `${nodePath}._contentSize.height`),
  };
  const children = (node._children ?? []).map((child) => normalizeMagnetNode(child, `${nodePath}/${child?._name ?? "<unnamed>"}`, state));
  return {
    name: node._name,
    opacity: expectFinite(node._opacity ?? 255, `${nodePath}._opacity`),
    transform: normalizeTransform(node, nodePath),
    contentSize,
    components,
    children,
  };
}

const EXPECTED_MAGNET_NODE_PATHS = Object.freeze([
  "SnakeMagnet",
  "SnakeMagnet/xt_s_lighting02",
  "SnakeMagnet/xt_s_lighting02_2",
  "SnakeMagnet/all_Node01",
  "SnakeMagnet/all_Node01/x_lighting02",
  "SnakeMagnet/all_Node01/x_lighting03",
  "SnakeMagnet/all_Node01/x_lighting01",
  "SnakeMagnet/all_Node01/x_lighting01_2",
  "SnakeMagnet/all_Node01/x_lighting01_3",
  "SnakeMagnet/all_Node02",
  "SnakeMagnet/all_Node02/x_lighting02",
  "SnakeMagnet/all_Node02/x_lighting03",
  "SnakeMagnet/all_Node02/x_lighting01",
  "SnakeMagnet/all_Node02/x_lighting01_2",
  "SnakeMagnet/all_Node02/x_lighting01_3",
  "SnakeMagnet/xt_lizi_on",
  "SnakeMagnet/xt_lizi_on/xt_lizi",
]);

const EXPECTED_MAGNET_ANIMATION_PATHS = Object.freeze([
  "all_Node01/x_lighting01",
  "all_Node01/x_lighting01_2",
  "all_Node01/x_lighting01_3",
  "all_Node01/x_lighting02",
  "all_Node01/x_lighting03",
  "all_Node02/x_lighting01",
  "all_Node02/x_lighting01_2",
  "all_Node02/x_lighting01_3",
  "all_Node02/x_lighting02",
  "all_Node02/x_lighting03",
  "x_lighting01",
  "x_lighting01_2",
  "x_lighting01_3",
  "x_lighting02",
  "x_lighting03",
  "xt_s_lighting02",
  "xt_s_lighting02_2",
]);

const EXPECTED_MAGNET_PARTICLE_PARAMETERS = Object.freeze({
  totalParticles: 200,
  emissionRate: 5,
  lifeSeconds: 0.1,
  angleDegrees: 360,
  angleVarianceDegrees: 360,
  startSize: 120,
  startSizeVariance: 20,
  endSize: 120,
  endSpinVariance: 1,
  positionType: 1,
  speed: 0,
  speedVariance: 0,
  tangentialAcceleration: 0,
  positionVariance: { x: 1, y: 1 },
  startColorRgba: 4278236415,
  startColorVarianceRgba: 4278190080,
  endColorRgba: 4262304511,
  endColorVarianceRgba: 4278190080,
});

export function convertMagnetAuraPack(packed, textureSpecs) {
  if (!Array.isArray(textureSpecs) || stableJson(textureSpecs.map((entry) => entry.logicalName)) !== stableJson(MAGNET_TEXTURE_NAMES)) {
    fail("SnakeMagnet texture specs", "five frozen logical textures are required");
  }
  const decoded = decodeCocos2PackedDocument(packed);
  const prefabs = decoded.filter((entry) => entry?.__type === "cc.Prefab");
  const clips = decoded.filter((entry) => entry?.__type === "cc.AnimationClip");
  const spriteFrames = decoded.filter((entry) => entry?.__type === "cc.SpriteFrame");
  if (prefabs.length !== 1 || clips.length !== 1 || spriteFrames.length !== 5) {
    fail("SnakeMagnet prefab pack", `expected one prefab, one clip and five SpriteFrames; got ${prefabs.length}/${clips.length}/${spriteFrames.length}`);
  }
  const prefab = prefabs[0];
  expectExactKeys(prefab, ["__type", "_name", "data"], "SnakeMagnet prefab");
  if (prefab._name !== "SnakeMagnet") fail("SnakeMagnet prefab", `unexpected prefab name ${JSON.stringify(prefab._name)}`);
  const frameByName = new Map();
  for (const sourceFrame of spriteFrames) {
    expectExactKeys(sourceFrame, ["__type", "_textureSetter", "capInsets", "name", "offset", "originalSize", "rect"], `SnakeMagnet SpriteFrame.${sourceFrame.name ?? "<unnamed>"}`);
    if (!MAGNET_TEXTURE_NAMES.includes(sourceFrame.name) || frameByName.has(sourceFrame.name)) fail("SnakeMagnet SpriteFrames", `unknown or duplicate frame ${sourceFrame.name}`);
    if (stableJson(sourceFrame.capInsets) !== stableJson([0, 0, 0, 0])) fail(`SnakeMagnet SpriteFrame.${sourceFrame.name}`, "non-zero capInsets are unsupported");
    frameByName.set(sourceFrame.name, sourceFrame);
  }
  const textureDependencies = textureSpecs.map((spec) => {
    const sourceFrame = frameByName.get(spec.logicalName);
    if (!sourceFrame) fail("SnakeMagnet SpriteFrames", `missing ${spec.logicalName}`);
    const expectedTextureUuid = path.basename(spec.sourceRelativePath, path.extname(spec.sourceRelativePath));
    if (packedUuid(sourceFrame._textureSetter, `SnakeMagnet SpriteFrame.${spec.logicalName}._textureSetter`) !== expectedTextureUuid) {
      fail(`SnakeMagnet SpriteFrame.${spec.logicalName}`, "texture dependency UUID does not match the frozen native file identity");
    }
    const frame = normalizeAtlasFrame({ ...sourceFrame, pivot: [0.5, 0.5], rotated: false }, `SnakeMagnet SpriteFrame.${spec.logicalName}`);
    const textureSize = { width: expectPositive(spec.width, `${spec.logicalName}.width`), height: expectPositive(spec.height, `${spec.logicalName}.height`) };
    validateFrameBounds(frame, textureSize, `SnakeMagnet SpriteFrame.${spec.logicalName}`);
    return {
      logicalName: spec.logicalName,
      textureAsset: resourceAsset(spec.targetFile),
      textureSize,
      frame,
      resourceHash: spec.expectedSha256,
    };
  });
  const state = {
    usedTextures: new Set(),
    animationComponents: 0,
    lifecycleComponents: 0,
    spriteComponents: 0,
    particleComponents: 0,
  };
  const root = normalizeMagnetNode(prefab.data, "SnakeMagnet", state);
  const animation = normalizeMagnetAnimation(clips[0]);
  if (state.animationComponents !== 1 || state.lifecycleComponents !== 1 || state.spriteComponents !== 12 || state.particleComponents !== 1) {
    fail("SnakeMagnet components", `expected animation/lifecycle/sprite/particle counts 1/1/12/1; got ${state.animationComponents}/${state.lifecycleComponents}/${state.spriteComponents}/${state.particleComponents}`);
  }
  if (stableJson([...state.usedTextures].sort()) !== stableJson([...MAGNET_TEXTURE_NAMES].sort())) fail("SnakeMagnet dependencies", "hierarchy does not consume exactly the five frozen textures");
  const recipe = {
    recipeVersion: 1,
    logicalName: "magnet-active",
    sourceFormat: "cocos-creator-2-compiled-json",
    targetEngine: "Cocos Creator 3.8.8",
    textureDependencies,
    root,
    animation,
  };
  validateMagnetAuraRecipe(recipe, textureSpecs);
  return recipe;
}

function validateRecipeNode(node, nodePath, state) {
  expectExactKeys(node, ["children", "components", "contentSize", "name", "opacity", "transform"], nodePath);
  if (node.name !== nodePath.split("/").at(-1)) fail(nodePath, "node name/path mismatch");
  expectFinite(node.opacity, `${nodePath}.opacity`);
  expectExactKeys(node.transform, ["eulerDegrees", "position", "rotation", "scale"], `${nodePath}.transform`);
  for (const [key, dimensions] of [["position", ["x", "y", "z"]], ["rotation", ["w", "x", "y", "z"]], ["scale", ["x", "y", "z"]], ["eulerDegrees", ["x", "y", "z"]]]) {
    expectExactKeys(node.transform[key], dimensions, `${nodePath}.transform.${key}`);
    for (const dimension of dimensions) expectFinite(node.transform[key][dimension], `${nodePath}.transform.${key}.${dimension}`);
  }
  if (node.contentSize !== null) {
    expectExactKeys(node.contentSize, ["height", "width"], `${nodePath}.contentSize`);
    expectPositive(node.contentSize.width, `${nodePath}.contentSize.width`);
    expectPositive(node.contentSize.height, `${nodePath}.contentSize.height`);
  }
  if (!Array.isArray(node.components) || !Array.isArray(node.children)) fail(nodePath, "components/children must be arrays");
  state.nodePaths.push(nodePath);
  for (const [index, component] of node.components.entries()) {
    const context = `${nodePath}.components[${index}]`;
    if (component.type === "animation-player") {
      expectExactKeys(component, ["clip", "playOnLoad", "type"], context);
      if (component.clip !== "snake_magnet" || component.playOnLoad !== true) fail(context, "animation player policy differs from source");
      state.animationComponents += 1;
    } else if (component.type === "particle-lifecycle") {
      expectExactKeys(component, ["onDisable", "onEnable", "type"], context);
      if (component.onEnable !== "reset-stop-reset" || component.onDisable !== "reset-stop") fail(context, "particle lifecycle policy differs from source");
      state.lifecycleComponents += 1;
    } else if (component.type === "sprite") {
      expectExactKeys(component, ["blend", "texture", "type"], context);
      expectExactKeys(component.blend, ["destination", "source"], `${context}.blend`);
      if (!MAGNET_TEXTURE_NAMES.includes(component.texture) || component.blend.source !== "src-alpha" || component.blend.destination !== "one-minus-src-alpha") {
        fail(context, "sprite dependency/blend is invalid");
      }
      state.usedTextures.add(component.texture);
      state.spriteComponents += 1;
    } else if (component.type === "particle-system") {
      expectExactKeys(component, ["blend", "parameters", "texture", "type"], context);
      expectExactKeys(component.blend, ["destination", "source"], `${context}.blend`);
      if (component.texture !== "xt_s_lighting" || component.blend.source !== "src-alpha" || component.blend.destination !== "one") fail(context, "particle dependency/blend is invalid");
      if (stableJson(component.parameters) !== stableJson(EXPECTED_MAGNET_PARTICLE_PARAMETERS)) fail(context, "particle parameters differ from the frozen source");
      state.usedTextures.add(component.texture);
      state.particleComponents += 1;
    } else fail(context, `unknown recipe component ${JSON.stringify(component.type)}`);
  }
  node.children.forEach((child) => validateRecipeNode(child, `${nodePath}/${child?.name ?? "<unnamed>"}`, state));
}

export function validateMagnetAuraRecipe(recipe, textureSpecs) {
  expectExactKeys(recipe, ["animation", "logicalName", "recipeVersion", "root", "sourceFormat", "targetEngine", "textureDependencies"], "magnet aura recipe");
  if (recipe.recipeVersion !== 1 || recipe.logicalName !== "magnet-active" || recipe.sourceFormat !== "cocos-creator-2-compiled-json" || recipe.targetEngine !== "Cocos Creator 3.8.8") {
    fail("magnet aura recipe", "recipe identity/version/engine is invalid");
  }
  if (!Array.isArray(recipe.textureDependencies) || stableJson(recipe.textureDependencies.map((entry) => entry.logicalName)) !== stableJson(MAGNET_TEXTURE_NAMES)) {
    fail("magnet aura recipe.textureDependencies", "must contain the five frozen logical textures exactly once and in canonical order");
  }
  const specsByName = new Map((textureSpecs ?? []).map((entry) => [entry.logicalName, entry]));
  for (const dependency of recipe.textureDependencies) {
    const context = `magnet aura recipe.textureDependencies.${dependency.logicalName}`;
    expectExactKeys(dependency, ["frame", "logicalName", "resourceHash", "textureAsset", "textureSize"], context);
    const spec = specsByName.get(dependency.logicalName);
    if (spec && (dependency.textureAsset !== resourceAsset(spec.targetFile) || dependency.resourceHash !== spec.expectedSha256
        || dependency.textureSize.width !== spec.width || dependency.textureSize.height !== spec.height)) {
      fail(context, "asset/hash/dimensions differ from the frozen texture spec");
    }
    validateFrameBounds(dependency.frame, dependency.textureSize, context);
  }
  const state = { nodePaths: [], usedTextures: new Set(), animationComponents: 0, lifecycleComponents: 0, spriteComponents: 0, particleComponents: 0 };
  validateRecipeNode(recipe.root, "SnakeMagnet", state);
  if (stableJson(state.nodePaths) !== stableJson(EXPECTED_MAGNET_NODE_PATHS)) fail("magnet aura recipe.root", "hierarchy differs from the frozen SnakeMagnet prefab");
  if (state.animationComponents !== 1 || state.lifecycleComponents !== 1 || state.spriteComponents !== 12 || state.particleComponents !== 1
      || stableJson([...state.usedTextures].sort()) !== stableJson([...MAGNET_TEXTURE_NAMES].sort())) {
    fail("magnet aura recipe.root", "component/dependency inventory is incomplete");
  }
  expectExactKeys(recipe.animation, ["durationSeconds", "name", "tracks", "wrapMode"], "magnet aura recipe.animation");
  if (recipe.animation.name !== "snake_magnet" || recipe.animation.durationSeconds !== 1 / 3 || recipe.animation.wrapMode !== "loop" || !Array.isArray(recipe.animation.tracks)) {
    fail("magnet aura recipe.animation", "clip identity/duration/wrap mode is invalid");
  }
  if (stableJson(recipe.animation.tracks.map((track) => track.nodePath)) !== stableJson(EXPECTED_MAGNET_ANIMATION_PATHS)) {
    fail("magnet aura recipe.animation", "animation paths differ from the frozen clip");
  }
  for (const track of recipe.animation.tracks) {
    expectExactKeys(track, ["nodePath", "properties"], `magnet aura recipe.animation.${track.nodePath}`);
    if (!Array.isArray(track.properties) || track.properties.length === 0) fail(`magnet aura recipe.animation.${track.nodePath}`, "properties must not be empty");
    for (const property of track.properties) {
      expectExactKeys(property, ["keyframes", "property"], `magnet aura recipe.animation.${track.nodePath}.${property.property}`);
      if (!["opacity", "position", "scale"].includes(property.property) || !Array.isArray(property.keyframes) || property.keyframes.length === 0) {
        fail(`magnet aura recipe.animation.${track.nodePath}`, `unknown or empty animation property ${property.property}`);
      }
      let previous = -1;
      for (const keyframe of property.keyframes) {
        expectExactKeys(keyframe, ["time", "value"], `magnet aura recipe.animation.${track.nodePath}.${property.property}.keyframe`);
        const time = expectFinite(keyframe.time, `magnet aura recipe.animation.${track.nodePath}.${property.property}.time`);
        if (time < 0 || time > recipe.animation.durationSeconds || time <= previous) fail(`magnet aura recipe.animation.${track.nodePath}.${property.property}`, "keyframe times must be unique, ascending and in range");
        previous = time;
        if (property.property === "opacity") expectFinite(keyframe.value, `magnet aura recipe.animation.${track.nodePath}.opacity.value`);
        else {
          expectExactKeys(keyframe.value, ["x", "y", "z"], `magnet aura recipe.animation.${track.nodePath}.${property.property}.value`);
          for (const axis of ["x", "y", "z"]) expectFinite(keyframe.value[axis], `magnet aura recipe.animation.${track.nodePath}.${property.property}.value.${axis}`);
        }
      }
    }
  }
  const serialized = stableJson(recipe);
  if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(serialized) || serialized.includes("__uuid")) {
    fail("magnet aura recipe", "source-project UUID leaked into the normalized recipe");
  }
  return recipe;
}

export function assertPresentationVersionTransition(before, after) {
  const beforeVersion = before.presentationVersion ?? 1;
  if (beforeVersion !== 1 || after.presentationVersion !== SNAKE_PRESENTATION_VERSION) fail("presentationVersion", "S1-12 must migrate implicit version 1 to explicit version 2");
  if (sha256(stableJson(before.presentation)) !== sha256(stableJson(after.presentation)) && after.presentationVersion <= beforeVersion) {
    fail("presentationVersion", "non-skin presentation changed without a version increase");
  }
}

export function validateMagnetPresentation(toolsCatalog, auraRecipe) {
  expectExactKeys(toolsCatalog, ["magnet"], "presentation.tools");
  const magnet = toolsCatalog.magnet;
  expectExactKeys(magnet, ["activeEffect", "kind", "sourceToolId", "statusIcon", "world"], "presentation.tools.magnet");
  if (magnet.kind !== "magnet" || magnet.sourceToolId !== 10001) fail("presentation.tools.magnet", "kind/sourceToolId must be magnet/10001");
  expectExactKeys(magnet.world, ["displaySize", "frame", "logicalName", "rendering", "textureAsset"], "presentation.tools.magnet.world");
  if (magnet.world.logicalName !== "magnet" || magnet.world.textureAsset !== "snakeoff/snake_magnet_tools" || magnet.world.displaySize !== 70) {
    fail("presentation.tools.magnet.world", "world logical name/texture/display size is invalid");
  }
  const expectedFrame = validateMagnetAtlas({
    texture: { width: 468, height: 769 },
    frames: [{
      name: magnet.world.frame.sourceFrameName,
      rect: [magnet.world.frame.rect.x, magnet.world.frame.rect.y, magnet.world.frame.rect.width, magnet.world.frame.rect.height],
      pivot: [magnet.world.frame.pivot.x, magnet.world.frame.pivot.y],
      offset: [magnet.world.frame.trimOffset.x, magnet.world.frame.trimOffset.y],
      originalSize: [magnet.world.frame.originalSize.width, magnet.world.frame.originalSize.height],
      rotated: magnet.world.frame.rotated,
    }],
  });
  if (stableJson(expectedFrame) !== stableJson(magnet.world.frame)) fail("presentation.tools.magnet.world.frame", "frame has non-canonical fields or values");
  expectExactKeys(magnet.world.rendering, ["batchGroup", "material"], "presentation.tools.magnet.world.rendering");
  if (magnet.world.rendering.batchGroup !== "world-tools" || magnet.world.rendering.material !== "sprite-alpha") fail("presentation.tools.magnet.world.rendering", "world batch/material is invalid");

  expectExactKeys(magnet.statusIcon, ["frame", "interactive", "logicalAliasOf", "logicalName", "rendering", "role", "textureAsset"], "presentation.tools.magnet.statusIcon");
  if (magnet.statusIcon.logicalName !== "magnet-status-icon" || magnet.statusIcon.logicalAliasOf !== "magnet"
      || magnet.statusIcon.role !== "passive-indicator" || magnet.statusIcon.interactive !== false
      || magnet.statusIcon.textureAsset !== magnet.world.textureAsset || stableJson(magnet.statusIcon.frame) !== stableJson(magnet.world.frame)) {
    fail("presentation.tools.magnet.statusIcon", "passive alias must share the exact world texture/frame and remain non-interactive");
  }
  expectExactKeys(magnet.statusIcon.rendering, ["batchGroup", "material"], "presentation.tools.magnet.statusIcon.rendering");
  if (magnet.statusIcon.rendering.batchGroup !== "passive-status-ui" || magnet.statusIcon.rendering.material !== "sprite-alpha") fail("presentation.tools.magnet.statusIcon.rendering", "status batch/material is invalid");

  expectExactKeys(magnet.activeEffect, ["event", "fallback", "policy", "recipeAsset", "rendering"], "presentation.tools.magnet.activeEffect");
  if (magnet.activeEffect.event !== "magnet-active" || magnet.activeEffect.policy !== "resource" || magnet.activeEffect.recipeAsset !== "snakeoff/snake_magnet_aura") {
    fail("presentation.tools.magnet.activeEffect", "event/policy/recipeAsset is invalid");
  }
  expectExactKeys(magnet.activeEffect.fallback, ["logicalName", "placement"], "presentation.tools.magnet.activeEffect.fallback");
  if (magnet.activeEffect.fallback.logicalName !== "magnet-status-icon" || magnet.activeEffect.fallback.placement !== "over-head") {
    fail("presentation.tools.magnet.activeEffect.fallback", "fallback must be the registered over-head passive icon");
  }
  expectExactKeys(magnet.activeEffect.rendering, ["batchGroup", "material"], "presentation.tools.magnet.activeEffect.rendering");
  if (magnet.activeEffect.rendering.batchGroup !== "snake-head-effects" || magnet.activeEffect.rendering.material !== "recipe-defined") fail("presentation.tools.magnet.activeEffect.rendering", "aura batch/material is invalid");
  validateMagnetAuraRecipe(auraRecipe);
  return magnet;
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

function audioMeta(relativeAssetPath) {
  return {
    ver: "1.0.0",
    importer: "audio-clip",
    imported: true,
    uuid: deterministicUuid(`snake-s1:${relativeAssetPath}`),
    files: [".json", path.extname(relativeAssetPath)],
    subMetas: {},
    userData: { downloadMode: 0 },
  };
}

function jsonMeta(relativeAssetPath) {
  return {
    ver: "2.0.1",
    importer: "json",
    imported: true,
    uuid: deterministicUuid(`snake-s1:${relativeAssetPath}`),
    files: [".json"],
    subMetas: {},
    userData: {},
  };
}

function directoryMeta(relativeAssetPath) {
  return { ver: "1.2.0", importer: "directory", imported: true, uuid: deterministicUuid(`snake-s1:${relativeAssetPath}`), files: [], subMetas: {}, userData: {} };
}

function ensureFreshMeta(targetRelativePath) {
  const target = path.join(REPO_ROOT, targetRelativePath);
  const meta = `${target}.meta`;
  if (fs.existsSync(meta)) return;
  const extension = path.extname(targetRelativePath).toLowerCase();
  const value = extension === ".png" ? imageMeta(targetRelativePath)
    : extension === ".mp3" ? audioMeta(targetRelativePath)
      : extension === ".json" ? jsonMeta(targetRelativePath)
        : fail(targetRelativePath, `no repository-owned Cocos metadata template for ${extension}`);
  fs.writeFileSync(meta, stableJson(value));
}

export function inspectMp3(data, context = "MP3") {
  if (!Buffer.isBuffer(data) || data.length < 4) fail(context, "file is too small to contain an MPEG frame");
  let offset = 0;
  if (data.subarray(0, 3).toString("ascii") === "ID3") {
    if (data.length < 10) fail(context, "truncated ID3 header");
    offset = 10 + ((data[6] & 0x7f) << 21) + ((data[7] & 0x7f) << 14) + ((data[8] & 0x7f) << 7) + (data[9] & 0x7f);
  }
  while (offset + 4 <= data.length && !(data[offset] === 0xff && (data[offset + 1] & 0xe0) === 0xe0)) offset += 1;
  if (offset + 4 > data.length) fail(context, "MPEG frame header is missing");
  const versionBits = (data[offset + 1] >> 3) & 0x03;
  const layerBits = (data[offset + 1] >> 1) & 0x03;
  const sampleRateIndex = (data[offset + 2] >> 2) & 0x03;
  const channelMode = (data[offset + 3] >> 6) & 0x03;
  const versionScale = versionBits === 3 ? 1 : versionBits === 2 ? 0.5 : versionBits === 0 ? 0.25 : null;
  const baseSampleRate = [44100, 48000, 32000][sampleRateIndex];
  if (versionScale === null || layerBits !== 1 || baseSampleRate === undefined) fail(context, "unsupported MPEG version/layer/sample rate");
  return { codec: "MPEG Layer III", sampleRateHz: baseSampleRate * versionScale, channels: channelMode === 3 ? 1 : 2 };
}

export function validateRegisteredResource(record, data) {
  if (!Buffer.isBuffer(data)) fail(record.targetRelativePath, "registered resource is missing");
  const actual = sha256(data);
  if (actual !== record.outputSha256) fail(record.targetRelativePath, `resource SHA mismatch: expected ${record.outputSha256}, got ${actual}`);
  return actual;
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

  const copyResource = (sourceRelativePath, targetFile, logicalName, options = {}) => {
    const data = tracker.read(sourceRelativePath, logicalName);
    if (options.expectedSha256) expectSha(data, options.expectedSha256, sourceRelativePath);
    if (options.pngSize) {
      const decoded = decodePng(data);
      if (decoded.width !== options.pngSize.width || decoded.height !== options.pngSize.height) {
        fail(sourceRelativePath, `expected PNG ${options.pngSize.width}x${options.pngSize.height}, got ${decoded.width}x${decoded.height}`);
      }
    }
    if (options.mp3) {
      const info = inspectMp3(data, sourceRelativePath);
      if (info.sampleRateHz !== 44100 || info.channels !== 1) fail(sourceRelativePath, `expected MPEG Layer III 44.1 kHz mono, got ${stableJson(info).trim()}`);
    }
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

  const magnet = catalog.presentation.magnet;
  const magnetTextureData = copyResource(
    magnet.texture.sourceRelativePath,
    magnet.texture.targetFile,
    "presentation/magnet/world",
    { expectedSha256: magnet.texture.expectedSha256, pngSize: { width: magnet.texture.width, height: magnet.texture.height } },
  );
  const magnetAtlasData = tracker.read(magnet.atlas.sourceRelativePath, "presentation/magnet/tools-atlas frame 10001");
  expectSha(magnetAtlasData, magnet.atlas.expectedSha256, magnet.atlas.sourceRelativePath);
  const magnetAtlas = convertMagnetAtlasSource(JSON.parse(magnetAtlasData.toString("utf8")), decodePng(magnetTextureData));
  const magnetAtlasOutput = stableJson(magnetAtlas);
  const magnetAtlasInput = "tools/snake-s1-assets/source/presentation/magnet.atlas.json";
  fs.writeFileSync(path.join(REPO_ROOT, magnetAtlasInput), magnetAtlasOutput);
  sourceRecords.push({
    logicalName: "presentation/magnet",
    presentation: "magnet",
    atlasPath: magnet.atlas.sourceRelativePath,
    texturePath: magnet.texture.sourceRelativePath,
    atlasInput: magnetAtlasInput,
    atlasOutputSha256: sha256(magnetAtlasOutput),
  });

  for (const texture of magnet.aura.textures) {
    copyResource(texture.sourceRelativePath, texture.targetFile, `presentation/magnet/aura/${texture.logicalName}`, {
      expectedSha256: texture.expectedSha256,
      pngSize: { width: texture.width, height: texture.height },
    });
  }
  const prefabData = tracker.read(magnet.aura.prefabRelativePath, "presentation/magnet/aura SnakeMagnet hierarchy, blend, animation and particles");
  expectSha(prefabData, magnet.aura.expectedPrefabSha256, magnet.aura.prefabRelativePath);
  const auraRecipe = convertMagnetAuraPack(JSON.parse(prefabData.toString("utf8")), magnet.aura.textures);
  const auraRecipeOutput = stableJson(auraRecipe);
  const auraRecipeInput = "tools/snake-s1-assets/source/presentation/magnet-aura.json";
  fs.writeFileSync(path.join(REPO_ROOT, auraRecipeInput), auraRecipeOutput);
  sourceRecords.push({
    logicalName: "presentation/magnet-aura",
    presentation: "magnet-aura",
    prefabPath: magnet.aura.prefabRelativePath,
    recipeInput: auraRecipeInput,
    recipeOutputSha256: sha256(auraRecipeOutput),
  });
  for (const wall of catalog.presentation.walls) copyResource(wall.sourceRelativePath, wall.targetFile, `wall/${wall.theme}`);
  for (const audio of catalog.presentation.audio) {
    if (audio.sourceRelativePath) copyResource(audio.sourceRelativePath, audio.targetFile, `audio/${audio.event}`, {
      expectedSha256: audio.expectedSha256,
      mp3: audio.event === "collect-magnet",
    });
  }

  for (const [code, purpose] of [
    ["subpackages/loading/bundle/_r/loader/Loader.js", "frame-time and head-anchor interpretation provenance only; never executed"],
    ["subpackages/loading/bundle/_r/game/util/GameUtil.js", "NormalRepeat layout interpretation provenance only; never executed"],
    ["subpackages/loading/bundle/_r/store/FeedGameStore.js", "frozen AI skin pool provenance only; never executed"],
    ["subpackages/loading/bundle/_r/store/SkinStore.js", "frozen AI eligibility provenance only; never executed"],
  ]) tracker.read(code, purpose);
  tracker.verifyUnchanged();
  const manifest = {
    schemaVersion: 2,
    generatedBy: "tools/snake-s1-assets/cli.mjs --refresh-source",
    sourceArchiveRoot: fs.realpathSync(sourceRoot),
    sourceIdentity,
    approval: catalog.approval,
    sourceFiles: tracker.manifest(),
    normalizedInputs: sourceRecords,
    copiedResources: resourceRecords.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    logicalAliases: [{
      logicalName: "presentation/magnet/status-icon",
      logicalAliasOf: "presentation/magnet/world",
      targetRelativePath: `apps/Cocos/assets/resources/snakeoff/${magnet.texture.targetFile}`,
      outputSha256: magnet.texture.expectedSha256,
      reason: "passive status icon reuses the world frame and texture bytes",
    }],
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
  // 首三行必须含 `Do not edit` 字面量：scripts/protected-paths.json 的 generatedWriterOwned
  // 抬头闸（apps/client/test/protectedPaths.test.ts）按该字面量判定生成物未被手改接管。
  const lines = [`/** ${banner} */`, "// Generated by `node tools/snake-s1-assets/cli.mjs --write`. Do not edit.", ""];
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
      ["recipe", "prefabPath", "recipeInput", "recipeOutputSha256"],
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
        conversion: kind === "body" ? "extract JsonAsset skin payload and stable-normalize JSON"
          : kind === "atlas" ? "extract only referenced atlas frames; normalize rect/offset/originalSize/pivot/rotation and stable-sort"
            : "decode the frozen Cocos 2 compiled pack as data; whitelist components/fields; normalize hierarchy, alpha/additive blend, animation keyframes, particles and five logical dependencies",
        meta: { state: "不适用（仓内非 Cocos 资源）", sha256: null },
        rightsStatus: "approved by referenced evidence",
        status: manifest.approval.legalStatus,
      });
    }
    return rows;
  });
  const aliasRows = (manifest.logicalAliases ?? []).map((alias) => {
    const resource = manifest.copiedResources.find((entry) => entry.logicalName === alias.logicalAliasOf);
    const source = resource && sourceByPath.get(resource.sourceRelativePath);
    if (!resource || !source || resource.targetRelativePath !== alias.targetRelativePath || resource.outputSha256 !== alias.outputSha256) {
      fail(alias.logicalName, "logical alias diverges from its physical resource");
    }
    return {
      catalogLogicalName: alias.logicalName,
      logicalAliasOf: alias.logicalAliasOf,
      sourceAbsolutePath: path.join(manifest.sourceArchiveRoot, resource.sourceRelativePath),
      sourceRelativePath: resource.sourceRelativePath,
      sourceSha256: source.sha256,
      authorizationEvidence: manifest.approval.evidence,
      authorizationDate: manifest.approval.approvedAt,
      responsible: manifest.approval.responsible,
      targetRelativePath: alias.targetRelativePath,
      outputSha256: alias.outputSha256,
      conversion: `logical alias only; no second physical byte copy (${alias.reason})`,
      meta: metaState(alias.targetRelativePath),
      rightsStatus: "approved by referenced evidence",
      status: manifest.approval.legalStatus,
    };
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
  const auraRecord = manifest.normalizedInputs.find((entry) => entry.logicalName === "presentation/magnet-aura");
  const auraTarget = "apps/Cocos/assets/resources/snakeoff/snake_magnet_aura.json";
  const auraData = artifacts.get(auraTarget);
  const auraMeta = artifacts.get(`${auraTarget}.meta`);
  const auraSource = auraRecord && sourceByPath.get(auraRecord.prefabPath);
  if (!auraRecord || !auraData || !auraMeta || !auraSource) fail(auraTarget, "generated aura recipe provenance inputs are missing");
  const auraTextureInputs = manifest.copiedResources
    .filter((entry) => entry.logicalName.startsWith("presentation/magnet/aura/"))
    .map((entry) => ({ absolutePath: path.join(manifest.sourceArchiveRoot, entry.sourceRelativePath), sha256: entry.sourceSha256 }))
    .sort((left, right) => left.absolutePath.localeCompare(right.absolutePath));
  const auraGeneratedRow = {
    catalogLogicalName: "presentation/magnet/aura/runtime-recipe",
    sourceAbsolutePath: path.join(manifest.sourceArchiveRoot, auraRecord.prefabPath),
    sourceRelativePath: auraRecord.prefabPath,
    sourceSha256: auraSource.sha256,
    additionalInputs: auraTextureInputs,
    authorizationEvidence: manifest.approval.evidence,
    authorizationDate: manifest.approval.approvedAt,
    responsible: manifest.approval.responsible,
    targetRelativePath: auraTarget,
    outputSha256: sha256(auraData),
    conversion: "generate repository-owned Cocos 3 JsonAsset recipe from the normalized, UUID-free aura input",
    meta: { state: "仓库新生成，待 S5 Creator 确认", sha256: sha256(auraMeta) },
    rightsStatus: "derived exclusively from approved repository inputs",
    status: manifest.approval.legalStatus,
  };
  return [...resourceRows, ...aliasRows, ...normalizedRows, ...generatedRows, auraGeneratedRow]
    .sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath) || a.catalogLogicalName.localeCompare(b.catalogLogicalName));
}

export function buildArtifacts() {
  const catalog = loadCatalog();
  const manifestPath = path.join(SOURCE_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("source/manifest.json", "run --refresh-source once before repository-only generation/check");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.sourceIdentity.actualCommit !== catalog.sourceCommit) fail("source/manifest.json", "frozen source commit differs from catalog");
  if (manifest.schemaVersion !== 2 || manifest.sourceFiles.length !== 77 || manifest.normalizedInputs.length !== 21 || manifest.copiedResources.length !== 34) {
    fail("source/manifest.json", "S1-12 inventory must contain schema 2, 77 source files, 21 normalized inputs and 34 copied resources");
  }
  if (!Array.isArray(manifest.logicalAliases) || manifest.logicalAliases.length !== 1
      || manifest.logicalAliases[0].logicalName !== "presentation/magnet/status-icon"
      || manifest.logicalAliases[0].logicalAliasOf !== "presentation/magnet/world") {
    fail("source/manifest.json logicalAliases", "the passive magnet icon must be the only physical-resource alias");
  }
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
    validateRegisteredResource(record, fs.existsSync(target) ? fs.readFileSync(target) : null);
    if (!fs.existsSync(`${target}.meta`)) fail(`${record.targetRelativePath}.meta`, "repository-owned Cocos metadata is missing");
    const meta = JSON.parse(fs.readFileSync(`${target}.meta`, "utf8"));
    if (sourceUuids.has(meta.uuid)) fail(`${record.targetRelativePath}.meta`, "source-project UUID was copied into the target project");
    const expectedImporter = path.extname(record.targetRelativePath).toLowerCase() === ".mp3" ? "audio-clip" : "image";
    if (meta.importer !== expectedImporter) fail(`${record.targetRelativePath}.meta`, `expected ${expectedImporter} importer`);
  }
  const magnetRuntimeCopies = [catalog.presentation.magnet.texture, ...catalog.presentation.magnet.aura.textures]
    .map((entry) => `apps/Cocos/assets/resources/snakeoff/${entry.targetFile}`)
    .concat("apps/Cocos/assets/resources/snakeoff/snake_sfx_collect_magnet.mp3");
  for (const targetRelativePath of magnetRuntimeCopies) {
    if (manifest.copiedResources.filter((entry) => entry.targetRelativePath === targetRelativePath).length !== 1) {
      fail(targetRelativePath, "S1-12 runtime copy must have exactly one physical inventory entry");
    }
  }
  for (const texture of [catalog.presentation.magnet.texture, ...catalog.presentation.magnet.aura.textures]) {
    const target = path.join(COCOS_RESOURCE_DIR, texture.targetFile);
    const decoded = decodePng(fs.readFileSync(target));
    if (decoded.width !== texture.width || decoded.height !== texture.height) fail(texture.targetFile, "runtime PNG dimensions differ from the frozen inventory");
  }
  const collectAudioData = fs.readFileSync(path.join(COCOS_RESOURCE_DIR, "snake_sfx_collect_magnet.mp3"));
  const collectAudioInfo = inspectMp3(collectAudioData, "snake_sfx_collect_magnet.mp3");
  if (collectAudioInfo.sampleRateHz !== 44100 || collectAudioInfo.channels !== 1) fail("snake_sfx_collect_magnet.mp3", "runtime audio must remain 44.1 kHz mono");

  const publicCatalog = catalog.skins.map(({ skinId, contentVersion, publicationState, isDefault, sortOrder, playerUsable, technicalLabel }) => ({ skinId, contentVersion, publicationState, isDefault, sortOrder, playerUsable, technicalLabel }));
  const publicCatalogHash = sha256(stableJson(publicCatalog));
  if (publicCatalogHash !== HISTORICAL_PUBLIC_CATALOG_HASH) fail("publicCatalogHash", `S1-12 must preserve ${HISTORICAL_PUBLIC_CATALOG_HASH}, got ${publicCatalogHash}`);
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
  if (serverBusinessHash !== HISTORICAL_SERVER_BUSINESS_HASH) fail("serverBusinessHash", `S1-12 must preserve ${HISTORICAL_SERVER_BUSINESS_HASH}, got ${serverBusinessHash}`);

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
  const magnetAtlas = readRepoJson("tools/snake-s1-assets/source/presentation/magnet.atlas.json");
  const auraRecipe = readRepoJson("tools/snake-s1-assets/source/presentation/magnet-aura.json");
  const foodFrames = atlasFrameLookup(foodAtlas, "food");
  const speedFrames = atlasFrameLookup(speedAtlas, "speedFx");
  const extrasFrames = atlasFrameLookup(extrasAtlas, "extras");
  const magnetFrame = validateMagnetAtlas(magnetAtlas);
  validateMagnetAuraRecipe(auraRecipe, catalog.presentation.magnet.aura.textures);
  const foodSpec = catalog.presentation.food;
  const copiedHash = (targetFile) => manifest.copiedResources.find((record) => record.targetRelativePath.endsWith(`/${targetFile}`))?.outputSha256 ?? fail(targetFile, "registered resource hash is missing");
  const magnetPresentation = {
    kind: "magnet",
    sourceToolId: 10001,
    world: {
      logicalName: "magnet",
      textureAsset: "snakeoff/snake_magnet_tools",
      frame: magnetFrame,
      displaySize: 70,
      rendering: { batchGroup: "world-tools", material: "sprite-alpha" },
    },
    statusIcon: {
      logicalName: "magnet-status-icon",
      logicalAliasOf: "magnet",
      textureAsset: "snakeoff/snake_magnet_tools",
      frame: structuredClone(magnetFrame),
      role: "passive-indicator",
      interactive: false,
      rendering: { batchGroup: "passive-status-ui", material: "sprite-alpha" },
    },
    activeEffect: {
      event: "magnet-active",
      policy: "resource",
      recipeAsset: "snakeoff/snake_magnet_aura",
      rendering: { batchGroup: "snake-head-effects", material: "recipe-defined" },
      fallback: { logicalName: "magnet-status-icon", placement: "over-head" },
    },
  };
  validateMagnetPresentation({ magnet: magnetPresentation }, auraRecipe);
  const presentationCatalog = {
    presentationVersion: SNAKE_PRESENTATION_VERSION,
    grid: { spacing: catalog.presentation.gridSpacing, mapMargin: catalog.presentation.mapMargin, palette: catalog.presentation.palette },
    identity: {
      skinTint: [255, 255, 255, 255],
      seatTinting: "forbidden",
      self: { arrow: "none", nameplate: "none", outline: "fine-white" },
      otherHuman: { arrow: "none", nameplate: "text", outline: "none" },
      ai: { avatar: "none", arrow: "none", nameplate: "text", outline: "none" },
    },
    tools: { magnet: magnetPresentation },
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
      sfxOnGuarded: entry.policy === "resource" ? (entry.sfxOnGuarded ?? true) : null,
      playback: entry.policy === "resource" ? (entry.playback ?? "bounded-concurrent") : null,
      maxConcurrent: entry.policy === "resource" ? (entry.maxConcurrent ?? (entry.event === "button" ? 2 : 4)) : null,
      missingPolicy: entry.missingPolicy ?? "silent",
      reason: entry.targetFile ? null : entry.reason ?? (entry.event === "personal-run-result" ? "no-approved-result-audio" : null),
      endlessReachability: entry.event === "time-over" ? "unreachable" : ["personal-run-result", "magnet-active-loop"].includes(entry.event) ? "silent" : "mapped",
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
  const expectedIdentity = {
    skinTint: [255, 255, 255, 255],
    seatTinting: "forbidden",
    self: { arrow: "none", nameplate: "none", outline: "fine-white" },
    otherHuman: { arrow: "none", nameplate: "text", outline: "none" },
    ai: { avatar: "none", arrow: "none", nameplate: "text", outline: "none" },
  };
  if (presentationCatalog.presentationVersion !== SNAKE_PRESENTATION_VERSION || stableJson(presentationCatalog.identity) !== stableJson(expectedIdentity)) {
    fail("presentation identity", "version 2 must use self fine-white outline, text-only other humans/AI and no arrows/avatar/AI outline");
  }
  const audioEvents = presentationCatalog.audio.map((entry) => entry.event);
  if (new Set(audioEvents).size !== audioEvents.length) fail("presentation audio", "event names must be unique");
  const collectMagnetAudio = presentationCatalog.audio.find((entry) => entry.event === "collect-magnet");
  const magnetLoopAudio = presentationCatalog.audio.find((entry) => entry.event === "magnet-active-loop");
  if (!collectMagnetAudio || collectMagnetAudio.policy !== "resource" || collectMagnetAudio.asset !== "snakeoff/snake_sfx_collect_magnet"
      || collectMagnetAudio.resourceHash !== catalog.presentation.audio.find((entry) => entry.event === "collect-magnet").expectedSha256
      || collectMagnetAudio.sfxOnGuarded !== true || collectMagnetAudio.playback !== "single-instance"
      || collectMagnetAudio.maxConcurrent !== 1 || collectMagnetAudio.missingPolicy !== "silent") {
    fail("presentation audio.collect-magnet", "bounded sfxOn-controlled resource mapping is invalid");
  }
  if (!magnetLoopAudio || magnetLoopAudio.policy !== "silent" || magnetLoopAudio.asset !== null || magnetLoopAudio.resourceHash !== null
      || magnetLoopAudio.maxConcurrent !== null || magnetLoopAudio.endlessReachability !== "silent" || magnetLoopAudio.reason !== "no-approved-loop-audio") {
    fail("presentation audio.magnet-active-loop", "loop must remain an explicit silent entry without a resource");
  }
  const clientCatalog = converted.map(({ wreckFrame: _wreckFrame, textureSize: _textureSize, ...entry }) => entry);
  const clientPresentationHash = sha256(stableJson({ publicCatalogHash, clientCatalog, presentationCatalog }));
  if (clientPresentationHash === HISTORICAL_CLIENT_PRESENTATION_HASH) fail("clientPresentationHash", "S1-12 presentation version/assets must change the historical client hash");

  const artifacts = new Map();
  addArtifact(artifacts, "apps/shared/src/gameplays/snake/snakeSkinCatalog.generated.ts", generatedTs("Snake S1 public skin identity catalog.", {
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
    SNAKE_PRESENTATION_VERSION,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH: publicCatalogHash,
    CLIENT_SNAKE_PRESENTATION_HASH: clientPresentationHash,
  }));

  const auraRuntimePath = `apps/Cocos/assets/resources/snakeoff/${catalog.presentation.magnet.aura.recipeTargetFile}`;
  addArtifact(artifacts, auraRuntimePath, stableJson(auraRecipe));
  addArtifact(artifacts, `${auraRuntimePath}.meta`, stableJson(jsonMeta(auraRuntimePath)));

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
      presentationVersion: SNAKE_PRESENTATION_VERSION,
      magnetWorldFrame: magnetFrame,
      magnetAuraTextureDependencies: auraRecipe.textureDependencies.map((entry) => entry.logicalName),
      magnetAuraNodeCount: EXPECTED_MAGNET_NODE_PATHS.length,
      magnetAuraAnimationTrackCount: auraRecipe.animation.tracks.length,
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
  addArtifact(artifacts, "docs/s/evidence/s1/catalog-hashes.json", stableJson({
    presentationVersion: SNAKE_PRESENTATION_VERSION,
    publicCatalogHash,
    serverBusinessHash,
    clientPresentationHash,
    historicalBaseline: {
      commit: "d18846a",
      presentationVersion: 1,
      publicCatalogHash: HISTORICAL_PUBLIC_CATALOG_HASH,
      serverBusinessHash: HISTORICAL_SERVER_BUSINESS_HASH,
      clientPresentationHash: HISTORICAL_CLIENT_PRESENTATION_HASH,
    },
  }));
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
  const skinConversionReport = converted.map((entry) => {
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
  const magnetCompleteness = {
    status: "complete-headless",
    presentationVersion: SNAKE_PRESENTATION_VERSION,
    world: {
      sourceToolId: magnetPresentation.sourceToolId,
      logicalName: magnetPresentation.world.logicalName,
      textureAsset: magnetPresentation.world.textureAsset,
      textureSize: magnetAtlas.texture,
      frame: magnetPresentation.world.frame,
      displaySize: magnetPresentation.world.displaySize,
    },
    statusIcon: {
      logicalName: magnetPresentation.statusIcon.logicalName,
      logicalAliasOf: magnetPresentation.statusIcon.logicalAliasOf,
      sharesWorldTextureAndFrame: stableJson(magnetPresentation.statusIcon.frame) === stableJson(magnetPresentation.world.frame)
        && magnetPresentation.statusIcon.textureAsset === magnetPresentation.world.textureAsset,
      interactive: magnetPresentation.statusIcon.interactive,
      physicalCopyCount: manifest.copiedResources.filter((entry) => entry.targetRelativePath.endsWith("/snake_magnet_tools.png")).length,
    },
    aura: {
      recipeAsset: magnetPresentation.activeEffect.recipeAsset,
      runtimePath: auraRuntimePath,
      recipeSha256: sha256(artifacts.get(auraRuntimePath)),
      dependencies: auraRecipe.textureDependencies.map(({ logicalName, textureAsset, resourceHash }) => ({ logicalName, textureAsset, resourceHash })),
      nodeCount: EXPECTED_MAGNET_NODE_PATHS.length,
      animationTrackCount: auraRecipe.animation.tracks.length,
      fallback: magnetPresentation.activeEffect.fallback,
    },
    audio: {
      collect: collectMagnetAudio,
      activeLoop: magnetLoopAudio,
      format: collectAudioInfo,
    },
    runtimeResources: [
      ...magnetRuntimeCopies,
      auraRuntimePath,
    ].sort(),
    creatorValidationDeferredTo: "S5",
  };
  addArtifact(artifacts, "docs/s/evidence/s1/completeness-matrix.json", stableJson(completenessMatrix));
  addArtifact(artifacts, "docs/s/evidence/s1/conversion-report.json", stableJson({
    presentationVersion: SNAKE_PRESENTATION_VERSION,
    skins: skinConversionReport,
    magnet: {
      atlas: { sourceFrameName: "10001", texture: magnetAtlas.texture, frame: magnetFrame },
      aura: { nodePaths: EXPECTED_MAGNET_NODE_PATHS, animationPaths: EXPECTED_MAGNET_ANIMATION_PATHS, textureDependencies: auraRecipe.textureDependencies },
    },
  }));
  addArtifact(artifacts, "docs/s/evidence/s1/magnet-completeness.json", stableJson(magnetCompleteness));
  addArtifact(artifacts, "docs/s/evidence/s1/validation-report.json", stableJson({
    status: "passed",
    sourceCommit: manifest.sourceIdentity.actualCommit,
    presentationVersion: SNAKE_PRESENTATION_VERSION,
    skinCount: publicCatalog.length,
    aiPool: businessCatalog.filter((skin) => skin.aiEligible).map((skin) => skin.skinId),
    defaultSkinId: publicCatalog.find((skin) => skin.isDefault).skinId,
    sourceFileCount: manifest.sourceFiles.length,
    copiedResourceCount: manifest.copiedResources.length,
    generatedRuntimeResourceCount: 1,
    s1_12RuntimeResourceCount: magnetCompleteness.runtimeResources.length,
    previewCount: previews.length,
    invariantHashes: {
      publicCatalogUnchanged: publicCatalogHash === HISTORICAL_PUBLIC_CATALOG_HASH,
      serverBusinessUnchanged: serverBusinessHash === HISTORICAL_SERVER_BUSINESS_HASH,
      clientPresentationChanged: clientPresentationHash !== HISTORICAL_CLIENT_PRESENTATION_HASH,
      allSkinContentVersionsRemainOne: publicCatalog.every((entry) => entry.contentVersion === 1),
    },
    checks: ["public exact validation", "cross-layer public hash parity", "server business hash", "client presentation version/hash", "atlas bounds including rotated frames", "NormalRepeat-only render type", "known skin animation structures", "magnet world frame and passive alias", "UUID-free aura hierarchy/blend/keyframes/particle recipe and five dependencies", "collect-magnet 44.1 kHz mono resource plus bounded sfxOn policy", "registered resource SHA and type-correct Cocos metadata"],
  }));
  addArtifact(artifacts, "docs/s/evidence/s1/provenance.json", stableJson(makeProvenance(manifest, artifacts)));
  addArtifact(artifacts, "docs/s/evidence/s1/execution-record.md", fs.readFileSync(path.join(SOURCE_DIR, "execution-record.md")));
  const evidenceReadme = `# Snake S1 headless acceptance evidence\n\nGenerated deterministically from repository-owned inputs by \`node tools/snake-s1-assets/cli.mjs --write\`. Normal generation and checking do not read the external archive.\n\n- Frozen source commit: \`${manifest.sourceIdentity.actualCommit}\`\n- Public catalog: ${publicCatalog.length} active/player-usable skins, default \`1\`\n- AI pool: \`${EXPECTED_AI_SKIN_IDS.join(", ")}\`\n- Presentation envelope: explicit version \`${SNAKE_PRESENTATION_VERSION}\`\n- Copied resources: ${manifest.copiedResources.length}; S1-12 magnet runtime resources: ${magnetCompleteness.runtimeResources.length} (7 copied + 1 generated recipe)\n- Individual previews: ${previews.length}\n- Public hash: \`${publicCatalogHash}\` (unchanged from \`d18846a\`)\n- Server business hash: \`${serverBusinessHash}\` (unchanged from \`d18846a\`)\n- Client presentation hash: \`${clientPresentationHash}\`\n- Historical pre-S1-12 client hash at \`d18846a\`: \`${HISTORICAL_CLIENT_PRESENTATION_HASH}\`\n- Creator import/final aura blending, hierarchy and device validation: explicitly deferred to S5.\n\n## Files\n\n- \`completeness-matrix.json\`: one closed row per frozen skin ID.\n- \`magnet-completeness.json\`: world frame/icon alias, five-texture aura, audio and eight-file runtime inventory.\n- \`conversion-report.json\`: skin frame normalization plus magnet atlas/aura conversion facts.\n- \`provenance.json\`: copy/alias/normalized-input/generated-recipe/preview provenance with source and output hashes.\n- \`validation-report.json\`, \`catalog-hashes.json\`: headless gate results, presentation version and current/historical hashes.\n- \`execution-record.md\`: commands, exit codes, suite counts, visual review and explicit non-applicable gates.\n- \`technical-contact-sheet.png\`, \`technical-review.json\`: skin frame/track inspection and closed issue list.\n- \`contact-sheet.png\`, \`previews/\`, \`content-review-package.json\`: S3 content-review input.\n- \`SHA256SUMS\`: deterministic evidence integrity list.\n\nThe technical labels and acquisition fields are drafts; \`content-review-package.json\` is the S3 review input, not an approval record. S1-12 performs headless conversion/validation only; it does not claim the deferred Creator S5 visual gate.\n`;
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
