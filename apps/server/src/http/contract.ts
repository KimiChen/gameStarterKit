/**
 * Server-side HTTP contract adapter.
 *
 * Better-Call validates request bodies through the endpoint options, but it
 * has no response schema.  Keep the response check at the same construction
 * point as the route so a handler cannot accidentally send a TypeScript-only
 * shape across the HTTP boundary.
 */
import {
  createEndpoint,
  type Endpoint,
  type EndpointContext,
  type EndpointOptions,
} from "@colyseus/core";
import {
  GameHttpContractMap,
  isPlainRecord,
  type GameHttpContractKey,
} from "@game/shared";

type JsonResponseMarker = {
  readonly _flag: "json";
  readonly body: unknown;
  readonly [key: string]: unknown;
};

type JsonResponseParts = {
  readonly body: unknown;
  readonly hasRouterResponse: boolean;
  readonly routerResponse?: unknown;
};

/**
 * The Response constructor is realm-local.  Better-Call's `toResponse()` uses
 * its own realm's constructor, so an otherwise valid Response supplied by an
 * iframe/worker would be mistaken for a ResponseInit object.  Keep this type
 * deliberately structural and only use it for the router override slot.
 */
type ResponseLike = {
  readonly body: unknown;
  readonly headers: unknown;
  readonly status: number;
  readonly statusText: string;
};

type GameContractPath<K extends GameHttpContractKey> =
  (typeof GameHttpContractMap)[K]["path"];

type GameContractRequest<K extends GameHttpContractKey> =
  ReturnType<(typeof GameHttpContractMap)[K]["request"]>;

type GameEndpointOptions = EndpointOptions & { readonly body?: never };

type GameEndpointContext<
  K extends GameHttpContractKey,
  O extends GameEndpointOptions,
> = Omit<EndpointContext<GameContractPath<K>, O>, "body"> & {
  body: GameContractRequest<K>;
};

// Only errors created by the current endpoint context may bypass its success
// response contract. Better-Call's public test is name-based, which lets an
// arbitrary object impersonate APIError; identity tracking closes that gap
// without adding a transitive framework package as a direct dependency.
const endpointApiErrors = new WeakSet<object>();

/** Better-Call's APIError is intentionally passed through to its own mapper. */
function isApiError(value: unknown): boolean {
  return (typeof value === "object" && value !== null || typeof value === "function")
    && endpointApiErrors.has(value as object);
}

/** Read the installed Better-Call `ctx.json()` marker without trusting traps/getters. */
function jsonResponseParts(value: unknown): JsonResponseParts | null {
  try {
    if (!isPlainRecord(value)
      || value._flag !== "json"
      || !Object.prototype.hasOwnProperty.call(value, "body")) {
      return null;
    }
    const hasRouterResponse = Object.prototype.hasOwnProperty.call(value, "routerResponse");
    return {
      body: value.body,
      hasRouterResponse,
      ...(hasRouterResponse ? { routerResponse: value.routerResponse } : {}),
    };
  } catch {
    return null;
  }
}

const objectToString = Object.prototype.toString;

/** Identify a native or cross-realm Response without relying on instanceof. */
function isResponseLike(value: unknown): value is ResponseLike {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }
  try {
    if (objectToString.call(value) !== "[object Response]") return false;
    const candidate = value as Partial<ResponseLike> & { readonly text?: unknown };
    // These reads also reject most Symbol.toStringTag-only impostors while
    // keeping the check compatible with native cross-realm Response objects.
    return Number.isInteger(candidate.status)
      && typeof candidate.statusText === "string"
      && "body" in candidate
      && candidate.headers !== null
      && (typeof candidate.headers === "object" || typeof candidate.headers === "function")
      && typeof candidate.text === "function";
  } catch {
    return false;
  }
}

/** Walk the prototype chain so local subclasses stay on Better-Call's fast path. */
function hasLocalResponsePrototype(value: object): boolean {
  if (typeof Response === "undefined") return false;
  try {
    const localPrototype = Response.prototype;
    let prototype = Object.getPrototypeOf(value);
    while (prototype) {
      if (prototype === localPrototype) return true;
      prototype = Object.getPrototypeOf(prototype);
    }
  } catch {
    // A revoked proxy or hostile prototype is not a local Response.
  }
  return false;
}

type ReadableStreamLike = {
  readonly getReader: () => {
    read: () => Promise<{ readonly done: boolean; readonly value?: unknown }>;
    cancel?: (reason?: unknown) => Promise<void> | void;
  };
};

function isReadableStreamLike(value: unknown): value is ReadableStreamLike {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  try {
    return typeof (value as Partial<ReadableStreamLike>).getReader === "function";
  } catch {
    return false;
  }
}

/** Bridge a foreign-realm body stream into the local ReadableStream realm. */
function bridgeResponseBody(source: ReadableStreamLike): ReadableStream<Uint8Array> {
  if (typeof ReadableStream === "undefined") {
    throw new TypeError("ReadableStream is unavailable for a cross-realm Response");
  }
  let reader: ReturnType<ReadableStreamLike["getReader"]> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Defer getReader() until the returned Response body is actually
        // consumed; constructing an override must not lock the caller's body.
        reader ??= source.getReader();
        const result = await reader.read();
        if (!result || result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value as Uint8Array);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader?.cancel?.(reason);
    },
  });
}

/**
 * Adapt a cross-realm Response to the realm Better-Call serializes in.
 * Same-realm responses are returned unchanged, retaining identity and stream
 * state exactly as Better-Call normally does.
 */
function normalizeRouterResponse(value: unknown): unknown {
  if (!isResponseLike(value) || hasLocalResponsePrototype(value)) return value;
  if (typeof Response === "undefined") return value;

  // ResponseInit only permits statuses in 200..599 (opaque status 0 cannot be
  // represented by a local Response and is rejected explicitly).
  if (!Number.isInteger(value.status) || value.status < 200 || value.status > 599) {
    throw new TypeError(`Unsupported cross-realm Response status: ${String(value.status)}`);
  }

  const body = value.body === null || value.body === undefined
    ? null
    : isReadableStreamLike(value.body)
      ? bridgeResponseBody(value.body)
      : (() => {
        throw new TypeError("Unsupported cross-realm Response body");
      })();

  return new Response(body, {
    status: value.status,
    statusText: value.statusText,
    headers: new Headers(value.headers as HeadersInit),
  });
}

function assertContractMethod(key: GameHttpContractKey, options: EndpointOptions): void {
  const expected = GameHttpContractMap[key].method;
  const configured = Array.isArray(options.method) ? options.method : [options.method];
  if (configured.length !== 1 || configured[0] !== expected) {
    throw new Error(
      `[http-contract] ${key} handler method 与 shared contract 不一致: `
      + `server=${configured.join(",")} contract=${expected}`,
    );
  }
}

/**
 * Validate a handler's response with the shared runtime contract.
 * Exported separately so contract tests and non-router adapters can exercise
 * exactly the same boundary.
 */
export function validateGameHttpResponse<K extends GameHttpContractKey>(
  key: K,
  value: unknown,
): ReturnType<(typeof GameHttpContractMap)[K]["response"]> {
  // A handler may return an APIError instead of throwing it.  Better-Call
  // supports that form and will map it to the intended status/body later.
  if (isApiError(value)) return value as ReturnType<(typeof GameHttpContractMap)[K]["response"]>;

  const contract = GameHttpContractMap[key];
  const marker = jsonResponseParts(value);
  if (marker) {
    // Rebuild the small marker rather than spreading an arbitrary object:
    // object spread invokes every enumerable getter before serialization.
    const validated: JsonResponseMarker = {
      _flag: "json",
      body: contract.response(marker.body),
      ...(marker.hasRouterResponse
        ? { routerResponse: normalizeRouterResponse(marker.routerResponse) }
        : {}),
    };
    return validated as ReturnType<(typeof GameHttpContractMap)[K]["response"]>;
  }
  return contract.response(value) as ReturnType<(typeof GameHttpContractMap)[K]["response"]>;
}

/** Execute the shared request validator after Better-Call's local schema. */
export function validateGameHttpRequest<K extends GameHttpContractKey>(
  key: K,
  value: unknown,
): ReturnType<(typeof GameHttpContractMap)[K]["request"]> {
  // Better-Call represents a body-less GET as undefined; shared models every
  // request as an exact object, so normalize only that transport omission.
  const input = value === undefined ? {} : value;
  return GameHttpContractMap[key].request(input) as ReturnType<(typeof GameHttpContractMap)[K]["request"]>;
}

/**
 * Construct a game HTTP endpoint with a mandatory shared response validator.
 * The returned endpoint keeps the original path/options shape used by the
 * route matrix; only the handler is wrapped.
 */
export function createGameEndpoint<
  K extends GameHttpContractKey,
  O extends GameEndpointOptions,
>(
  key: K,
  options: O,
  handler: (ctx: GameEndpointContext<K, O>) => Promise<unknown> | unknown,
): Endpoint {
  const contract = GameHttpContractMap[key];
  assertContractMethod(key, options);
  if (Object.prototype.hasOwnProperty.call(options, "body")) {
    throw new Error(`[http-contract] ${key} body schema 由 shared contract 生成，endpoint options 不得覆盖`);
  }
  // Better-Call forbids body schemas on GET/HEAD. Body-bearing methods consume
  // the exact Standard Schema instance generated beside the shared validator.
  const endpointOptions = (contract.method === "GET"
    ? options
    : { ...options, body: contract.requestSchema }) as EndpointOptions;
  return createEndpoint(contract.path, endpointOptions, async (rawContext) => {
    const ctx = rawContext as unknown as GameEndpointContext<K, O>;
    const createError = ctx.error;
    ctx.error = ((...args: Parameters<typeof createError>) => {
      const error = createError(...args);
      endpointApiErrors.add(error);
      return error;
    }) as typeof ctx.error;
    const createRedirect = ctx.redirect;
    ctx.redirect = ((...args: Parameters<typeof createRedirect>) => {
      const error = createRedirect(...args);
      endpointApiErrors.add(error);
      return error;
    }) as typeof ctx.redirect;
    const createJson = ctx.json;
    ctx.json = ((...args: Parameters<typeof createJson>) => {
      const [json, routerResponse] = args as [unknown, unknown];
      // Better-Call stores `Response.body` in the marker, which is a stream
      // and therefore cannot satisfy the game JSON contract. Validate the
      // caller's JSON payload, then let Better-Call return its Response
      // override unchanged (status/headers/body semantics remain intact).
      if ((ctx as unknown as { asResponse?: boolean }).asResponse
        && isResponseLike(routerResponse)) {
        return { _flag: "json", body: json, routerResponse };
      }
      return createJson(...args);
    }) as typeof ctx.json;
    // Better-Call has already applied the shared-derived Standard Schema here.
    // Keep the final check for direct adapters/middleware and pass only the
    // shared validator's normalized copy to the handler.
    ctx.body = validateGameHttpRequest(key, ctx.body) as typeof ctx.body;
    return validateGameHttpResponse(key, await handler(ctx));
  });
}
