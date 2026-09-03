import {
  circle,
  drawSprite,
  encodePng,
  fillRect,
  image,
  line,
  rectOutline,
  text,
} from "./png.mjs";
import { rotatePortrait } from "./model.mjs";

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSnake({ id, skinId, x, y, angle, bodyCount, spacing = 27, curve = 0.05, bodyScale = 1, ai = false }) {
  const points = [{ x, y }];
  let current = { x, y };
  for (let index = 1; index < bodyCount; index += 1) {
    const backAngle = angle + Math.PI + Math.sin(index * 0.42) * curve;
    current = {
      x: current.x + Math.cos(backAngle) * spacing,
      y: current.y + Math.sin(backAngle) * spacing,
    };
    points.push(current);
  }
  return { id, skinId, angle, bodyScale, ai, points };
}

function buildFixtures(seed) {
  const random = rng(seed);
  const foods = (center, count = 54, radiusX = 720, radiusY = 330) => Array.from({ length: count }, (_, index) => ({
    x: center.x + (random() * 2 - 1) * radiusX,
    y: center.y + (random() * 2 - 1) * radiusY,
    kind: index % 13 === 0 ? "star" : "dot",
    variant: index % 7,
  }));
  const fixtures = [
    {
      id: "spawn",
      title: "SPAWN LENGTH 80",
      captureTick: 60,
      camera: { x: 0, y: 0, scale: 1 },
      snakes: [{ ...makeSnake({ id: "player", skinId: 1, x: 0, y: 0, angle: 0.3, bodyCount: 10, spacing: 24 }), logicalLength: 80 }],
      foods: foods({ x: 0, y: 0 }),
      notes: ["Source V2 spawn length is 80", "Fixture visualizes initial body scale 1.0"],
    },
    {
      id: "normal",
      title: "NORMAL PLAY",
      captureTick: 600,
      camera: { x: 320, y: -180, scale: 0.92 },
      snakes: [
        { ...makeSnake({ id: "player", skinId: 2, x: 320, y: -180, angle: 1.1, bodyCount: 16, curve: 0.11 }), logicalLength: 420 },
        { ...makeSnake({ id: "ai-401", skinId: 401, x: -70, y: 90, angle: -0.4, bodyCount: 12, curve: 0.08, ai: true }), logicalLength: 180 },
      ],
      foods: foods({ x: 320, y: -180 }),
      notes: ["Representative normal-play density", "Food sprites come from source foods atlas"],
    },
    {
      id: "long-snake",
      title: "LONG SNAKE SCALE",
      captureTick: 5000,
      camera: { x: -220, y: 360, scale: 0.68 },
      snakes: [{ ...makeSnake({ id: "player", skinId: 401, x: -220, y: 360, angle: 0.2, bodyCount: 48, spacing: 38, curve: 0.18, bodyScale: 1.9 }), logicalLength: 50000 }],
      foods: foods({ x: -220, y: 360 }, 62, 1050, 470),
      notes: ["Long-snake evidence uses reduced camera scale", "Body grows independently from skin identity"],
    },
    {
      id: "boundary",
      title: "4896 VS 4096 BOUNDS",
      captureTick: 1200,
      camera: { x: 2100, y: 0, scale: 0.72 },
      snakes: [{ ...makeSnake({ id: "player", skinId: 1, x: 1980, y: 0, angle: Math.PI / 2, bodyCount: 12 }), logicalLength: 180 }],
      foods: foods({ x: 2100, y: 0 }, 38, 700, 380),
      notes: ["Source half-bound is 2448", "Target half-bound is 2048", "The 400-unit outer band is cropped, not scaled"],
      boundaryOverlay: true,
    },
    {
      id: "star-wreck",
      title: "STAR AND WRECK",
      captureTick: 2200,
      camera: { x: 0, y: 0, scale: 1.18 },
      snakes: [{ ...makeSnake({ id: "player", skinId: 403, x: -140, y: -40, angle: 0.45, bodyCount: 14, curve: 0.08 }), logicalLength: 260 }],
      foods: [
        ...foods({ x: 0, y: 0 }, 36, 620, 260),
        { x: 160, y: 30, kind: "star", variant: 0 },
        { x: 230, y: 60, kind: "wreck", variant: 403 },
        { x: 270, y: 10, kind: "wreck", variant: 401 },
        { x: 310, y: -45, kind: "wreck", variant: 2 },
      ],
      notes: ["Star length/score = 10/10", "Wreck frames are source skin frames; AI wreck scoring is documented separately"],
    },
    {
      id: "ai-multi-skin",
      title: "AI MULTI-SKIN",
      captureTick: 1800,
      camera: { x: 0, y: 0, scale: 0.82 },
      snakes: [
        { ...makeSnake({ id: "ai-skin-1", skinId: 1, x: -470, y: 180, angle: 0.2, bodyCount: 12, ai: true }), logicalLength: 180 },
        { ...makeSnake({ id: "ai-skin-2", skinId: 2, x: -100, y: -180, angle: 1.2, bodyCount: 12, ai: true }), logicalLength: 210 },
        { ...makeSnake({ id: "ai-level-401", skinId: 401, x: 260, y: 180, angle: -0.7, bodyCount: 14, ai: true }), logicalLength: 320 },
        { ...makeSnake({ id: "ai-level-403", skinId: 403, x: 500, y: -160, angle: 2.7, bodyCount: 13, ai: true }), logicalLength: 270 },
      ],
      foods: foods({ x: 0, y: 0 }, 58, 900, 410),
      notes: ["Four representative source atlases", "Target stable-state composition is 17 active snakes, not rendered in full here"],
    },
  ];
  return fixtures;
}

function transformFixture(fixture, portrait) {
  if (!portrait) return fixture;
  return {
    ...fixture,
    camera: { ...rotatePortrait(fixture.camera), scale: fixture.camera.scale },
    foods: fixture.foods.map((food) => ({ ...food, ...rotatePortrait(food) })),
    snakes: fixture.snakes.map((snake) => ({
      ...snake,
      angle: snake.angle + Math.PI / 2,
      points: snake.points.map(rotatePortrait),
    })),
  };
}

function mapper(viewport, camera) {
  return (point) => ({
    x: viewport.width / 2 + (point.x - camera.x) * camera.scale,
    y: viewport.height / 2 - (point.y - camera.y) * camera.scale,
  });
}

function drawDashedLine(target, a, b, color, width = 2) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.ceil(distance / 16);
  for (let index = 0; index < count; index += 2) {
    const startRatio = index / count;
    const endRatio = Math.min(1, (index + 1) / count);
    line(target,
      a.x + (b.x - a.x) * startRatio,
      a.y + (b.y - a.y) * startRatio,
      a.x + (b.x - a.x) * endRatio,
      a.y + (b.y - a.y) * endRatio,
      color, width);
  }
}

function drawWorldBackground(target, viewport, camera, mapSize, presentation, boundaryOverlay) {
  fillRect(target, 0, 0, viewport.width, viewport.height, presentation.outside);
  const toScreen = mapper(viewport, camera);
  const half = mapSize / 2;
  const topLeft = toScreen({ x: -half, y: half });
  const bottomRight = toScreen({ x: half, y: -half });
  fillRect(target, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y, presentation.map);

  const visibleLeft = camera.x - viewport.width / (2 * camera.scale);
  const visibleRight = camera.x + viewport.width / (2 * camera.scale);
  const visibleBottom = camera.y - viewport.height / (2 * camera.scale);
  const visibleTop = camera.y + viewport.height / (2 * camera.scale);
  for (let x = Math.ceil(Math.max(-half, visibleLeft) / 32) * 32; x <= Math.min(half, visibleRight); x += 32) {
    const start = toScreen({ x, y: Math.max(-half, visibleBottom) });
    const end = toScreen({ x, y: Math.min(half, visibleTop) });
    line(target, start.x, start.y, end.x, end.y, presentation.grid, Math.max(1, presentation.gridLineWidth));
  }
  for (let y = Math.ceil(Math.max(-half, visibleBottom) / 32) * 32; y <= Math.min(half, visibleTop); y += 32) {
    const start = toScreen({ x: Math.max(-half, visibleLeft), y });
    const end = toScreen({ x: Math.min(half, visibleRight), y });
    line(target, start.x, start.y, end.x, end.y, presentation.grid, Math.max(1, presentation.gridLineWidth));
  }
  if (presentation.boundary.explicitStroke) {
    rectOutline(target, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y,
      presentation.boundary.color, presentation.boundary.lineWidth);
  }
  if (boundaryOverlay) {
    for (const [bound, color] of [[2048, [15, 130, 210, 255]], [2448, [235, 79, 113, 255]]]) {
      const x = toScreen({ x: bound, y: 0 }).x;
      drawDashedLine(target, { x, y: 0 }, { x, y: viewport.height }, color, 3);
    }
  }
  return toScreen;
}

function renderFood(target, toScreen, cameraScale, food, assets) {
  const position = toScreen(food);
  if (food.kind === "star") drawSprite(target, assets.food.star, position.x, position.y, 42 * cameraScale, 42 * cameraScale);
  else if (food.kind === "wreck") {
    const skin = assets.skins.get(food.variant) ?? assets.skins.get(1);
    drawSprite(target, skin.wreck, position.x, position.y, 34 * cameraScale, 34 * cameraScale);
  } else {
    drawSprite(target, assets.food.dots[food.variant % assets.food.dots.length], position.x, position.y, 16 * cameraScale, 16 * cameraScale);
  }
}

function renderSnake(target, toScreen, cameraScale, snake, assets) {
  const skin = assets.skins.get(snake.skinId);
  const bodySize = 36 * snake.bodyScale * cameraScale;
  for (let index = snake.points.length - 1; index >= 1; index -= 1) {
    const point = toScreen(snake.points[index]);
    const body = skin.bodies[(snake.points.length - index) % skin.bodies.length];
    drawSprite(target, body, point.x, point.y, bodySize, bodySize);
  }
  const head = toScreen(snake.points[0]);
  drawSprite(target, skin.head, head.x, head.y, bodySize * 1.22, bodySize * 1.22, -snake.angle);
  if (snake.ai) circle(target, head.x, head.y, bodySize * 0.72, [255, 255, 255, 150], { outline: true, lineWidth: 1 });
}

function renderWorldFixture(fixture, portrait, spec, assets) {
  const viewport = portrait ? spec.target.viewport : spec.source.viewport;
  const transformed = transformFixture(fixture, portrait);
  const mapSize = portrait ? spec.target.world.width : spec.source.world.width;
  const target = image(viewport.width, viewport.height, spec.presentation.light.outside);
  const toScreen = drawWorldBackground(target, viewport, transformed.camera, mapSize, spec.presentation.light, fixture.boundaryOverlay);
  for (const food of transformed.foods) renderFood(target, toScreen, transformed.camera.scale, food, assets);
  for (const snake of transformed.snakes) renderSnake(target, toScreen, transformed.camera.scale, snake, assets);
  fillRect(target, 18, 18, Math.min(viewport.width - 36, fixture.title.length * 16 + 24), 35, [20, 25, 38, 190]);
  text(target, fixture.title, 30, 28, [255, 255, 255, 255], 2);
  if (fixture.boundaryOverlay) {
    text(target, "BLUE 4096", 28, 68, [15, 130, 210, 255], 2);
    text(target, "PINK 4896", 28, 90, [235, 79, 113, 255], 2);
  }
  return {
    png: encodePng(target),
    metadata: {
      fixture: fixture.id,
      captureTick: fixture.captureTick,
      orientation: portrait ? "portrait" : "landscape",
      viewport,
      mapSize,
      camera: transformed.camera,
      coordinateTransform: portrait ? "source (x,y) -> portrait (-y,x); no scaling" : "source coordinates",
      renderedEntityState: {
        snakes: transformed.snakes.map((snake) => ({
          id: snake.id,
          skinId: snake.skinId,
          ai: snake.ai,
          head: snake.points[0],
          directionRadians: snake.angle,
          logicalLength: snake.logicalLength,
          bodyPointCount: snake.points.length,
          bodyScale: snake.bodyScale,
        })),
        foodCount: transformed.foods.length,
        foods: transformed.foods,
        representativeOnly: true,
      },
      notes: fixture.notes,
    },
  };
}

function designY(height, value) {
  return height - value;
}

function uiAnnotation(hand, spec) {
  const viewport = spec.target.viewport;
  const target = image(viewport.width, viewport.height, [28, 38, 67, 255]);
  const safe = spec.portraitControls.safeAreaExample;
  fillRect(target, 0, 0, viewport.width, safe.top, [235, 79, 113, 85]);
  fillRect(target, 0, viewport.height - safe.bottom, viewport.width, safe.bottom, [235, 79, 113, 85]);
  drawDashedLine(target, { x: 0, y: safe.top }, { x: viewport.width, y: safe.top }, [235, 79, 113, 255], 2);
  drawDashedLine(target, { x: 0, y: viewport.height - safe.bottom }, { x: viewport.width, y: viewport.height - safe.bottom }, [235, 79, 113, 255], 2);
  fillRect(target, 0, 90, viewport.width, 210, [22, 30, 52, 220]);
  text(target, "HUD WORLD LAYER SEPARATE", 36, 115, [255, 255, 255, 255], 2);
  text(target, "SAFE TOP 54", 36, 62, [255, 190, 205, 255], 2);
  text(target, `PORTRAIT UI ${hand.toUpperCase()} HAND`, 36, 158, [130, 220, 255, 255], 2);
  drawDashedLine(target, { x: 0, y: 300 }, { x: viewport.width, y: 300 }, [120, 150, 200, 180], 2);
  text(target, "WORLD INPUT OVERLAY", 36, 320, [170, 195, 230, 255], 2);

  const shift = Math.max(0, safe.bottom + 161 - 220);
  const joystick = spec.portraitControls.joystick;
  const joystickY = designY(viewport.height, joystick.baseY + shift);
  circle(target, joystick.x, joystickY, joystick.hitRadius, [80, 205, 255, 180], { outline: true, lineWidth: 3 });
  circle(target, joystick.x, joystickY, joystick.diameter / 2, [66, 105, 155, 210]);
  circle(target, joystick.x, joystickY, joystick.knobDiameter / 2, [175, 220, 255, 235]);
  text(target, "JOY HIT R155", joystick.x - 72, joystickY + 165, [130, 225, 255, 255], 2);

  for (const button of spec.portraitControls.buttons) {
    const y = designY(viewport.height, button.baseY + shift);
    const functionName = hand === "right" ? button.rightHand : button.leftHand;
    circle(target, button.x, y, button.hitRadius, [255, 203, 90, 200], { outline: true, lineWidth: 3 });
    circle(target, button.x, y, button.diameter / 2, [223, 133, 60, 220]);
    text(target, button.id, button.x - 12, y - 10, [255, 255, 255, 255], 2);
    text(target, functionName, Math.max(8, button.x - functionName.length * 6), y + button.hitRadius + 12, [255, 225, 160, 255], 1);
  }
  text(target, "SAFE BOTTOM 34", 36, viewport.height - 28, [255, 190, 205, 255], 2);
  text(target, "VISIBLE CIRCLE + HIT RADIUS", 36, viewport.height - 620, [255, 255, 255, 255], 2);
  return {
    png: encodePng(target),
    metadata: {
      fixture: `portrait-ui-${hand}-hand`,
      orientation: "portrait",
      viewport,
      evidenceLayer: "UI annotation; deliberately not a rotated world screenshot",
      safeAreaExample: safe,
      controlShift: shift,
      controlShiftFormula: spec.portraitControls.controlShiftFormula,
      handedness: hand,
      joystick,
      buttons: spec.portraitControls.buttons.map((button) => ({
        ...button,
        effectiveFunction: hand === "right" ? button.rightHand : button.leftHand,
        y: button.baseY + shift,
      })),
      firstReleaseVisibility: "Only boost is initially visible; all four functions are drawn here because this is an annotation fixture.",
      worldHudSeparation: true,
    },
  };
}

export function renderGoldens(spec, assets) {
  const results = [];
  for (const fixture of buildFixtures(spec.seed)) {
    for (const portrait of [false, true]) {
      results.push({
        name: `${fixture.id}.${portrait ? "portrait" : "landscape"}.png`,
        ...renderWorldFixture(fixture, portrait, spec, assets),
      });
    }
  }
  for (const hand of ["right", "left"]) {
    results.push({ name: `portrait-ui-${hand}-hand.png`, ...uiAnnotation(hand, spec) });
  }
  return results;
}
