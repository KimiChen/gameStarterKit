// frontend/packages/core/dist/compat.js
function promiseFinally(promise, callback) {
  return promise.then((value) => Promise.resolve(callback()).then(() => value), (error) => Promise.resolve(callback()).then(() => {
    throw error;
  }));
}
function createAggregateError(errors, message) {
  const Native = globalThis.AggregateError;
  if (Native)
    return new Native(errors, message);
  const fallback = new Error(message);
  fallback.name = "AggregateError";
  fallback.errors = errors;
  return fallback;
}

export {
  promiseFinally,
  createAggregateError
};
