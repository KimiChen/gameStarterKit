// frontend/packages/core/dist/style.js
function defineTheme(definition) {
  return deepFreeze(definition);
}
function defineStyles(styles) {
  return deepFreeze(styles);
}
function deepFreeze(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || typeof value !== "object")
    return value;
  const object = value;
  if (seen.has(object))
    return value;
  seen.add(object);
  for (const child of Object.values(object))
    deepFreeze(child, seen);
  return Object.freeze(value);
}

export {
  defineTheme,
  defineStyles
};
