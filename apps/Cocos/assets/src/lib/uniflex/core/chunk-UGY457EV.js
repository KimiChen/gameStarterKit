// frontend/packages/core/dist/layout/flex-layout.js
var EPSILON = 1e-4;
function layoutFlexTree(root, width, height) {
  return layoutFlexTreeIntrinsic(root, Math.max(0, width), Math.max(0, height));
}
function layoutFlexTreeIntrinsic(root, width, height) {
  const context = {
    diagnostics: [],
    stats: { nodes: 0, measuredLeaves: 0, percentageFallbacks: 0 }
  };
  root.frame.x = 0;
  root.frame.y = 0;
  root.frame.width = Math.max(0, width !== null && width !== void 0 ? width : 0);
  root.frame.height = Math.max(0, height !== null && height !== void 0 ? height : 0);
  layoutNode(root, width, height, context, true);
  return { diagnostics: context.diagnostics, stats: context.stats };
}
function measureScrollContent(root, direction, constraint) {
  var _a, _b;
  const vertical = direction === "vertical";
  layoutFlexTreeIntrinsic(root, vertical ? constraint.width : void 0, vertical ? void 0 : constraint.height);
  return {
    width: (_a = constraint.width) !== null && _a !== void 0 ? _a : root.frame.width,
    height: (_b = constraint.height) !== null && _b !== void 0 ? _b : root.frame.height
  };
}
function layoutScrollContent(root, direction, viewportMain, viewportCross) {
  const styleMain = direction === "vertical" ? root.style.height : root.style.width;
  const explicitMain = resolveScrollMain(styleMain, viewportMain);
  const result = layoutFlexTreeIntrinsic(root, direction === "vertical" ? viewportCross : explicitMain, direction === "vertical" ? explicitMain : viewportCross);
  root.frame.x = 0;
  root.frame.y = 0;
  return Object.assign(Object.assign({}, result), { mainSize: Math.max(viewportMain, direction === "vertical" ? root.frame.height : root.frame.width) });
}
function resolveScrollMain(value, viewportMain) {
  if (value === void 0 || value === "auto")
    return void 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.max(0, value) : void 0;
  const percent = Number.parseFloat(value);
  return Number.isFinite(percent) ? Math.max(0, viewportMain * percent / 100) : void 0;
}
function layoutNode(node, assignedWidth, assignedHeight, context, _isRoot = false) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
  context.stats.nodes++;
  const style = node.style;
  if (style.display === "none") {
    node.hidden = true;
    setSize(node, 0, 0);
    return;
  }
  node.hidden = false;
  let width = assignedWidth !== null && assignedWidth !== void 0 ? assignedWidth : resolveLength(style.width, assignedWidth, node, "width", context);
  let height = assignedHeight !== null && assignedHeight !== void 0 ? assignedHeight : resolveLength(style.height, assignedHeight, node, "height", context);
  const widthAuto = width === void 0;
  const heightAuto = height === void 0;
  const padding = resolveEdges(style.padding, width, height, node, "padding", context);
  const axis = getAxis((_a = style.flexDirection) !== null && _a !== void 0 ? _a : "row");
  const innerWidth = width === void 0 ? void 0 : Math.max(0, width - padding.left - padding.right);
  const innerHeight = height === void 0 ? void 0 : Math.max(0, height - padding.top - padding.bottom);
  const innerMain = axis.row ? innerWidth : innerHeight;
  if (node.children.length === 0) {
    if (node.measure && (width === void 0 || height === void 0)) {
      context.stats.measuredLeaves++;
      const measured = node.measure({ width, height });
      width !== null && width !== void 0 ? width : width = measured.width;
      height !== null && height !== void 0 ? height : height = measured.height;
    }
    width = clamp(width !== null && width !== void 0 ? width : 0, resolveMinMax(style.minWidth, assignedWidth, 0), resolveMinMax(style.maxWidth, assignedWidth, Infinity));
    height = clamp(height !== null && height !== void 0 ? height : 0, resolveMinMax(style.minHeight, assignedHeight, 0), resolveMinMax(style.maxHeight, assignedHeight, Infinity));
    applyAspect(style.aspectRatio, { width, height }, (nextWidth, nextHeight) => {
      width = nextWidth;
      height = nextHeight;
    }, style.width === void 0, style.height === void 0);
    setSize(node, width, height);
    return;
  }
  let relative = [];
  const absolute = [];
  for (const child of node.children) {
    if (child.style.display === "none") {
      layoutNode(child, 0, 0, context);
      continue;
    }
    if (child.style.position === "absolute") {
      absolute.push(child);
      continue;
    }
    relative.push(makeItem(child, axis, innerWidth, innerHeight, (_b = style.alignItems) !== null && _b !== void 0 ? _b : "stretch", context));
  }
  let lines = buildLines(relative, axis, innerMain, (_c = style.flexWrap) !== null && _c !== void 0 ? _c : "nowrap", (_d = style.gap) !== null && _d !== void 0 ? _d : 0);
  if (lines.length === 0)
    lines = [{ items: [], outerMain: 0, cross: 0 }];
  for (const line of lines) {
    distributeMain(line, axis, innerMain, (_e = style.gap) !== null && _e !== void 0 ? _e : 0);
    measureLineCross(line, axis, innerWidth, innerHeight, context);
  }
  const contentMain = Math.max(0, ...lines.map((line) => line.outerMain));
  const contentCross = lines.reduce((sum, line) => sum + line.cross, 0) + Math.max(0, lines.length - 1) * ((_f = style.gap) !== null && _f !== void 0 ? _f : 0);
  if (width === void 0) {
    width = axis.row ? contentMain + padding.left + padding.right : contentCross + padding.left + padding.right;
  }
  if (height === void 0) {
    height = axis.row ? contentCross + padding.top + padding.bottom : contentMain + padding.top + padding.bottom;
  }
  width = clamp(width, resolveMinMax(style.minWidth, assignedWidth, 0), resolveMinMax(style.maxWidth, assignedWidth, Infinity));
  height = clamp(height, resolveMinMax(style.minHeight, assignedHeight, 0), resolveMinMax(style.maxHeight, assignedHeight, Infinity));
  setSize(node, width, height);
  let finalInnerWidth = Math.max(0, width - padding.left - padding.right);
  let finalInnerHeight = Math.max(0, height - padding.top - padding.bottom);
  let finalMain = axis.row ? finalInnerWidth : finalInnerHeight;
  let finalCross = axis.row ? finalInnerHeight : finalInnerWidth;
  const innerCross = axis.row ? innerHeight : innerWidth;
  let crossReflowed = false;
  if (innerCross === void 0 || Math.abs(innerCross - finalCross) > EPSILON) {
    relative = node.children.filter((child) => child.style.display !== "none" && child.style.position !== "absolute").map((child) => {
      var _a2;
      return makeItem(child, axis, finalInnerWidth, finalInnerHeight, (_a2 = style.alignItems) !== null && _a2 !== void 0 ? _a2 : "stretch", context);
    });
    const reflowMain = axis.row ? widthAuto ? void 0 : finalInnerWidth : heightAuto ? void 0 : finalInnerHeight;
    lines = buildLines(relative, axis, reflowMain, (_g = style.flexWrap) !== null && _g !== void 0 ? _g : "nowrap", (_h = style.gap) !== null && _h !== void 0 ? _h : 0);
    if (lines.length === 0)
      lines = [{ items: [], outerMain: 0, cross: 0 }];
    for (const line of lines) {
      distributeMain(line, axis, reflowMain, (_j = style.gap) !== null && _j !== void 0 ? _j : 0);
      measureLineCross(line, axis, finalInnerWidth, finalInnerHeight, context);
    }
    const reflowContentMain = Math.max(0, ...lines.map((line) => line.outerMain));
    const reflowContentCross = lines.reduce((sum, line) => sum + line.cross, 0) + Math.max(0, lines.length - 1) * ((_k = style.gap) !== null && _k !== void 0 ? _k : 0);
    if (widthAuto)
      width = clamp(axis.row ? reflowContentMain + padding.left + padding.right : reflowContentCross + padding.left + padding.right, resolveMinMax(style.minWidth, assignedWidth, 0), resolveMinMax(style.maxWidth, assignedWidth, Infinity));
    if (heightAuto)
      height = clamp(axis.row ? reflowContentCross + padding.top + padding.bottom : reflowContentMain + padding.top + padding.bottom, resolveMinMax(style.minHeight, assignedHeight, 0), resolveMinMax(style.maxHeight, assignedHeight, Infinity));
    setSize(node, width, height);
    finalInnerWidth = Math.max(0, width - padding.left - padding.right);
    finalInnerHeight = Math.max(0, height - padding.top - padding.bottom);
    finalMain = axis.row ? finalInnerWidth : finalInnerHeight;
    finalCross = axis.row ? finalInnerHeight : finalInnerWidth;
    crossReflowed = true;
  }
  if (crossReflowed || innerMain === void 0 || Math.abs(innerMain - finalMain) > EPSILON) {
    if (crossReflowed)
      relative = node.children.filter((child) => child.style.display !== "none" && child.style.position !== "absolute").map((child) => {
        var _a2;
        return makeItem(child, axis, finalInnerWidth, finalInnerHeight, (_a2 = style.alignItems) !== null && _a2 !== void 0 ? _a2 : "stretch", context);
      });
    lines = buildLines(relative, axis, finalMain, (_l = style.flexWrap) !== null && _l !== void 0 ? _l : "nowrap", (_m = style.gap) !== null && _m !== void 0 ? _m : 0);
    for (const line of lines) {
      distributeMain(line, axis, finalMain, (_o = style.gap) !== null && _o !== void 0 ? _o : 0);
      measureLineCross(line, axis, finalInnerWidth, finalInnerHeight, context);
    }
  }
  positionLines(node, lines, axis, padding, finalMain, finalCross, (_p = style.gap) !== null && _p !== void 0 ? _p : 0, (_q = style.justifyContent) !== null && _q !== void 0 ? _q : "flexStart", (_r = style.alignItems) !== null && _r !== void 0 ? _r : "stretch", (_s = style.alignContent) !== null && _s !== void 0 ? _s : "stretch", style.flexWrap === "wrapReverse", context);
  for (const child of absolute) {
    layoutAbsolute(child, finalInnerWidth, finalInnerHeight, padding, context);
  }
}
function makeItem(node, axis, parentWidth, parentHeight, alignItems, context) {
  var _a, _b, _c;
  const style = node.style;
  const margin = resolveEdges(style.margin, parentWidth, parentHeight, node, "margin", context);
  const mainParent = axis.row ? parentWidth : parentHeight;
  const crossParent = axis.row ? parentHeight : parentWidth;
  const mainProperty = axis.row ? style.width : style.height;
  const crossProperty = axis.row ? style.height : style.width;
  let main = (_a = resolveLength(style.flexBasis, mainParent, node, "flexBasis", context)) !== null && _a !== void 0 ? _a : resolveLength(mainProperty, mainParent, node, axis.mainSize, context);
  let cross = resolveLength(crossProperty, crossParent, node, axis.crossSize, context);
  const align = style.alignSelf === void 0 || style.alignSelf === "auto" ? alignItems : style.alignSelf;
  let crossStretched = false;
  if (cross === void 0 && crossParent !== void 0 && align === "stretch") {
    const marginCross = axis.row ? margin.top + margin.bottom : margin.left + margin.right;
    cross = Math.max(0, crossParent - marginCross);
    crossStretched = true;
  }
  if (main === void 0 || cross === void 0) {
    const measured = measureIntrinsic(node, axis.row ? main : cross, axis.row ? cross : main, context);
    main !== null && main !== void 0 ? main : main = axis.row ? measured.width : measured.height;
    cross !== null && cross !== void 0 ? cross : cross = axis.row ? measured.height : measured.width;
  }
  const minMain = resolveMinMax(axis.row ? style.minWidth : style.minHeight, mainParent, 0);
  const maxMain = resolveMinMax(axis.row ? style.maxWidth : style.maxHeight, mainParent, Infinity);
  const minCross = resolveMinMax(axis.row ? style.minHeight : style.minWidth, crossParent, 0);
  const maxCross = resolveMinMax(axis.row ? style.maxHeight : style.maxWidth, crossParent, Infinity);
  main = Math.max(0, main !== null && main !== void 0 ? main : 0);
  cross = clamp(cross !== null && cross !== void 0 ? cross : 0, minCross, maxCross);
  if (style.aspectRatio && style.aspectRatio > 0) {
    if (mainProperty === void 0 && crossProperty !== void 0) {
      main = axis.row ? cross * style.aspectRatio : cross / style.aspectRatio;
    } else if (crossProperty === void 0 && mainProperty !== void 0) {
      cross = axis.row ? main / style.aspectRatio : main * style.aspectRatio;
    }
  }
  return {
    node,
    margin,
    main,
    cross,
    minMain,
    maxMain,
    minCross,
    maxCross,
    grow: Math.max(0, (_b = style.flexGrow) !== null && _b !== void 0 ? _b : 0),
    shrink: Math.max(0, (_c = style.flexShrink) !== null && _c !== void 0 ? _c : 1),
    crossAuto: crossProperty === void 0 || crossProperty === "auto",
    crossStretched
  };
}
function measureIntrinsic(node, width, height, context) {
  if (node.measure && node.children.length === 0) {
    context.stats.measuredLeaves++;
    return node.measure({ width, height });
  }
  if (node.children.length === 0)
    return { width: 0, height: 0 };
  const oldWidth = node.frame.width;
  const oldHeight = node.frame.height;
  layoutNode(node, width, height, context);
  const measured = { width: node.frame.width, height: node.frame.height };
  node.frame.width = oldWidth;
  node.frame.height = oldHeight;
  return measured;
}
function buildLines(items, axis, available, wrap, gap) {
  if (items.length === 0)
    return [];
  const lines = [];
  let line = { items: [], outerMain: 0, cross: 0 };
  for (const item of items) {
    const outer = clamp(item.main, item.minMain, item.maxMain) + mainMargin(item, axis);
    const next = line.items.length === 0 ? outer : line.outerMain + gap + outer;
    if (wrap !== "nowrap" && available !== void 0 && line.items.length > 0 && next > available + EPSILON) {
      lines.push(line);
      line = { items: [], outerMain: 0, cross: 0 };
    }
    line.outerMain = line.items.length === 0 ? outer : line.outerMain + gap + outer;
    line.items.push(item);
  }
  lines.push(line);
  return lines;
}
function distributeMain(line, axis, available, gap) {
  if (line.items.length === 0)
    return;
  if (available === void 0) {
    for (const item of line.items)
      item.main = clamp(item.main, item.minMain, item.maxMain);
    return;
  }
  const used = line.items.reduce((sum, item) => sum + item.main + mainMargin(item, axis), 0) + Math.max(0, line.items.length - 1) * gap;
  let free = available - used;
  if (Math.abs(free) <= EPSILON) {
    line.outerMain = used;
    return;
  }
  const frozen = /* @__PURE__ */ new Set();
  for (let pass = 0; pass < line.items.length && Math.abs(free) > EPSILON; pass++) {
    let factor = 0;
    for (const item of line.items) {
      if (frozen.has(item))
        continue;
      factor += free > 0 ? item.grow : item.shrink * item.main;
    }
    if (factor <= EPSILON) {
      for (const item of line.items)
        item.main = clamp(item.main, item.minMain, item.maxMain);
      break;
    }
    let consumed = 0;
    for (const item of line.items) {
      if (frozen.has(item))
        continue;
      const weight = free > 0 ? item.grow : item.shrink * item.main;
      const candidate = item.main + free * (weight / factor);
      const clamped = clamp(candidate, item.minMain, item.maxMain);
      consumed += clamped - item.main;
      item.main = clamped;
      if (Math.abs(candidate - clamped) > EPSILON)
        frozen.add(item);
    }
    if (Math.abs(consumed) <= EPSILON)
      break;
    free -= consumed;
  }
  line.outerMain = line.items.reduce((sum, item) => sum + item.main + mainMargin(item, axis), 0) + Math.max(0, line.items.length - 1) * gap;
}
function measureLineCross(line, axis, parentWidth, parentHeight, context) {
  line.cross = 0;
  for (const item of line.items) {
    if (item.crossAuto && !item.crossStretched) {
      const measured = measureIntrinsic(item.node, axis.row ? item.main : void 0, axis.row ? void 0 : item.main, context);
      item.cross = clamp(axis.row ? measured.height : measured.width, item.minCross, item.maxCross);
    }
    line.cross = Math.max(line.cross, item.cross + crossMargin(item, axis));
    void parentWidth;
    void parentHeight;
  }
}
function positionLines(parent, lines, axis, padding, availableMain, availableCross, gap, justify, alignItems, alignContent, wrapReverse, context) {
  const naturalCross = lines.reduce((sum, line) => sum + line.cross, 0) + Math.max(0, lines.length - 1) * gap;
  const crossFree = availableCross - naturalCross;
  const linePacking = distributeSpacing(alignContent, crossFree, lines.length, gap);
  if (alignContent === "stretch" && crossFree > 0 && lines.length > 0) {
    const extra = crossFree / lines.length;
    for (const line of lines)
      line.cross += extra;
  }
  let lineCursor = linePacking.start;
  const orderedLines = wrapReverse ? [...lines].reverse() : lines;
  for (const line of orderedLines) {
    const mainFree = availableMain - line.outerMain;
    const packing = distributeSpacing(justify, mainFree, line.items.length, gap);
    let cursor = packing.start;
    const orderedItems = line.items;
    for (const item of orderedItems) {
      const mainBefore = axis.row ? axis.reverse ? item.margin.right : item.margin.left : axis.reverse ? item.margin.bottom : item.margin.top;
      const mainAfter = axis.row ? axis.reverse ? item.margin.left : item.margin.right : axis.reverse ? item.margin.top : item.margin.bottom;
      const crossBefore = axis.row ? item.margin.top : item.margin.left;
      const crossAfter = axis.row ? item.margin.bottom : item.margin.right;
      cursor += mainBefore;
      const align = item.node.style.alignSelf === void 0 || item.node.style.alignSelf === "auto" ? alignItems : item.node.style.alignSelf;
      let itemCross = item.cross;
      if (align === "stretch" && item.crossAuto) {
        itemCross = clamp(line.cross - crossBefore - crossAfter, item.minCross, item.maxCross);
      }
      let crossOffset = crossBefore;
      if (align === "center")
        crossOffset = (line.cross - itemCross - crossBefore - crossAfter) / 2 + crossBefore;
      if (align === "flexEnd")
        crossOffset = line.cross - itemCross - crossAfter;
      const logicalMain = axis.reverse ? availableMain - cursor - item.main : cursor;
      const mainPosition = logicalMain + (axis.row ? padding.left : padding.top);
      const crossPosition = lineCursor + crossOffset + (axis.row ? padding.top : padding.left);
      item.node.frame[axis.mainPos] = mainPosition;
      item.node.frame[axis.crossPos] = crossPosition;
      const childWidth = axis.row ? item.main : itemCross;
      const childHeight = axis.row ? itemCross : item.main;
      layoutNode(item.node, childWidth, childHeight, context);
      setSize(item.node, childWidth, childHeight);
      cursor += item.main + mainAfter + packing.between;
    }
    lineCursor += line.cross + linePacking.between;
  }
  void parent;
}
function layoutAbsolute(child, parentWidth, parentHeight, padding, context) {
  const style = child.style;
  const left = resolveLength(style.left, parentWidth, child, "left", context);
  const right = resolveLength(style.right, parentWidth, child, "right", context);
  const top = resolveLength(style.top, parentHeight, child, "top", context);
  const bottom = resolveLength(style.bottom, parentHeight, child, "bottom", context);
  let width = resolveLength(style.width, parentWidth, child, "width", context);
  let height = resolveLength(style.height, parentHeight, child, "height", context);
  if (width === void 0 && left !== void 0 && right !== void 0)
    width = parentWidth - left - right;
  if (height === void 0 && top !== void 0 && bottom !== void 0)
    height = parentHeight - top - bottom;
  if (width === void 0 || height === void 0) {
    const measured = measureIntrinsic(child, width, height, context);
    width !== null && width !== void 0 ? width : width = measured.width;
    height !== null && height !== void 0 ? height : height = measured.height;
  }
  child.frame.x = padding.left + (left !== null && left !== void 0 ? left : right === void 0 ? 0 : parentWidth - right - width);
  child.frame.y = padding.top + (top !== null && top !== void 0 ? top : bottom === void 0 ? 0 : parentHeight - bottom - height);
  layoutNode(child, Math.max(0, width), Math.max(0, height), context);
  setSize(child, Math.max(0, width), Math.max(0, height));
}
function getAxis(direction) {
  const row = direction === "row" || direction === "rowReverse";
  return {
    row,
    reverse: direction === "rowReverse" || direction === "columnReverse",
    mainSize: row ? "width" : "height",
    crossSize: row ? "height" : "width",
    mainPos: row ? "x" : "y",
    crossPos: row ? "y" : "x"
  };
}
function resolveEdges(input, width, height, node, property, context) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  if (input === void 0)
    return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof input !== "object") {
    return {
      top: (_a = resolveLength(input, height, node, `${property}.top`, context)) !== null && _a !== void 0 ? _a : 0,
      right: (_b = resolveLength(input, width, node, `${property}.right`, context)) !== null && _b !== void 0 ? _b : 0,
      bottom: (_c = resolveLength(input, height, node, `${property}.bottom`, context)) !== null && _c !== void 0 ? _c : 0,
      left: (_d = resolveLength(input, width, node, `${property}.left`, context)) !== null && _d !== void 0 ? _d : 0
    };
  }
  return {
    top: (_e = resolveLength(input.top, height, node, `${property}.top`, context)) !== null && _e !== void 0 ? _e : 0,
    right: (_f = resolveLength(input.right, width, node, `${property}.right`, context)) !== null && _f !== void 0 ? _f : 0,
    bottom: (_g = resolveLength(input.bottom, height, node, `${property}.bottom`, context)) !== null && _g !== void 0 ? _g : 0,
    left: (_h = resolveLength(input.left, width, node, `${property}.left`, context)) !== null && _h !== void 0 ? _h : 0
  };
}
function resolveLength(value, parent, node, property, context) {
  if (value === void 0 || value === "auto")
    return void 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : void 0;
  const percent = Number.parseFloat(value);
  if (parent === void 0 || !Number.isFinite(percent)) {
    context.stats.percentageFallbacks++;
    context.diagnostics.push({
      nodeId: node.id,
      property,
      message: `Percentage ${value} resolved as auto because the parent axis is indefinite.`
    });
    return void 0;
  }
  return parent * percent / 100;
}
function resolveMinMax(value, parent, fallback) {
  if (value === void 0 || value === "auto")
    return fallback;
  if (typeof value === "number")
    return value;
  if (parent === void 0)
    return fallback;
  return parent * Number.parseFloat(value) / 100;
}
function distributeSpacing(mode, free, count, baseGap) {
  const positive = Math.max(0, free);
  if (mode === "flexEnd")
    return { start: positive, between: baseGap };
  if (mode === "center")
    return { start: positive / 2, between: baseGap };
  if (mode === "spaceBetween" && count > 1)
    return { start: 0, between: baseGap + positive / (count - 1) };
  if (mode === "spaceAround" && count > 0) {
    const unit = positive / count;
    return { start: unit / 2, between: baseGap + unit };
  }
  if (mode === "spaceEvenly" && count > 0) {
    const unit = positive / (count + 1);
    return { start: unit, between: baseGap + unit };
  }
  return { start: 0, between: baseGap };
}
function mainMargin(item, axis) {
  return axis.row ? item.margin.left + item.margin.right : item.margin.top + item.margin.bottom;
}
function crossMargin(item, axis) {
  return axis.row ? item.margin.top + item.margin.bottom : item.margin.left + item.margin.right;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function setSize(node, width, height) {
  node.frame.width = Number.isFinite(width) ? Math.max(0, width) : 0;
  node.frame.height = Number.isFinite(height) ? Math.max(0, height) : 0;
}
function applyAspect(ratio, size, assign, widthAuto, heightAuto) {
  if (!ratio || ratio <= 0)
    return;
  if (widthAuto && !heightAuto)
    assign(size.height * ratio, size.height);
  else if (heightAuto && !widthAuto)
    assign(size.width, size.width / ratio);
}

export {
  layoutFlexTree,
  layoutFlexTreeIntrinsic,
  measureScrollContent,
  layoutScrollContent
};
