import {
  jsonHash
} from "./chunk-EAG4H2KJ.js";

// frontend/packages/core/dist/provider/prepare-resources.js
function selectUIResources(catalog, ids) {
  const required = new Set(ids);
  for (const weight of [400, 700]) {
    const fallback = catalog.resources.find((entry) => entry.kind === "font" && entry.weight === weight);
    if (fallback)
      required.add(fallback.id);
  }
  const resources = catalog.resources.filter((entry) => {
    const used = required.delete(entry.id);
    return used;
  });
  if (required.size)
    throw new Error(`Unknown UI resources: ${[...required].join(", ")}`);
  return { version: 1, hash: jsonHash(resources), resources };
}
async function prepareUIResources(assets, catalog, ids) {
  await assets.prepare(selectUIResources(catalog, ids));
}
var componentResources = /* @__PURE__ */ new WeakMap();
async function prepareUIComponent(assets, catalog, ids, component) {
  const selected = selectUIResources(catalog, ids);
  if (!assets.acquire) {
    await assets.prepare(selected);
    return component;
  }
  const lease = await assets.acquire(selected);
  const prepared = Object.assign({}, component);
  componentResources.set(prepared, lease);
  return prepared;
}
function retainComponentResources(component) {
  var _a;
  return (_a = componentResources.get(component)) === null || _a === void 0 ? void 0 : _a.retain();
}
function retainPreparedComponent(parent, child) {
  const lease = retainComponentResources(parent);
  if (!lease)
    return child;
  const prepared = Object.assign({}, child);
  componentResources.set(prepared, lease);
  return prepared;
}
function releaseComponentResources(component) {
  const lease = componentResources.get(component);
  componentResources.delete(component);
  lease === null || lease === void 0 ? void 0 : lease.release();
}

export {
  prepareUIResources,
  prepareUIComponent,
  retainComponentResources,
  retainPreparedComponent,
  releaseComponentResources
};
