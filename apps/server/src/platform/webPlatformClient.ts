/**
 * WebPlatform Internal HTTP client.
 *
 * 这是游戏服访问账号权威的唯一入口：没有 in-process 实现、没有运行期模式切换，也不接触账号库。
 * token 对游戏服完全不透明；只有 WebPlatform verify 响应可以给出 userId。
 */
import { randomUUID } from "node:crypto";
import {
  Agent as HttpAgent,
  request as httpRequest,
  type IncomingHttpHeaders,
  type RequestOptions,
} from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import {
  WebPlatformMethod,
  WebPlatformPath,
  type HasCharacterResponse,
  type RegisterCharacterResponse,
  type VerifySessionRequest,
  type VerifySessionResponse,
} from "@gono/webplatform-contract";
import { AuthRequiredError, BannedError } from "../core/errors";
import {
  WEBPLATFORM_BREAKER_FAILURES,
  WEBPLATFORM_BREAKER_OPEN_MS,
  WEBPLATFORM_CONNECT_TIMEOUT_MS,
  WEBPLATFORM_INTERNAL_URL,
  WEBPLATFORM_REQUEST_TIMEOUT_MS,
  WEBPLATFORM_SERVICE_ID,
  WEBPLATFORM_SERVICE_SECRET,
} from "../core/infra/config";
import { writeGroupSess } from "../core/auth/session";

const MAX_RESPONSE_BYTES = 64 * 1024;
const VERIFY_REASONS = new Set(["NOT_FOUND", "MISMATCH", "BANNED", "DEREGISTERED", "EXPIRED"]);
const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

/** 网络、超时、熔断或 WebPlatform 5xx。调用方必须把它当基础设施故障，而非玩家 token 无效。 */
export class WebPlatformUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WebPlatformUnavailableError";
  }
}

/** 服务身份、路径或请求契约配置错误。它同样不能映射成玩家鉴权失败。 */
export class WebPlatformServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPlatformServiceError";
  }
}

/** HTTP 200 但响应不符合固定契约；拒绝猜字段或用缺省值继续准入。 */
export class WebPlatformContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPlatformContractError";
  }
}

interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const hasExactKeys = (
  v: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(v).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
};

function parseVerifyResponse(v: unknown): VerifySessionResponse {
  if (!isRecord(v) || typeof v.valid !== "boolean") {
    throw new WebPlatformContractError("verify 响应形状无效");
  }
  if (v.valid) {
    if (!hasExactKeys(v, ["valid", "userId", "issuedAtMs"])
      || typeof v.userId !== "string"
      || !Number.isSafeInteger(v.issuedAtMs)
      || Number(v.issuedAtMs) < 0) {
      throw new WebPlatformContractError("verify 成功响应形状无效");
    }
    return v as VerifySessionResponse;
  }
  if (!hasExactKeys(v, ["valid", "reason"])
    || typeof v.reason !== "string"
    || !VERIFY_REASONS.has(v.reason)) {
    throw new WebPlatformContractError("verify 失败响应形状无效");
  }
  return v as VerifySessionResponse;
}

function parseRegisterResponse(v: unknown): RegisterCharacterResponse {
  if (!isRecord(v) || !hasExactKeys(v, ["registered"]) || v.registered !== true) {
    throw new WebPlatformContractError("character register 响应形状无效");
  }
  return v as RegisterCharacterResponse;
}

function parseHasResponse(v: unknown): HasCharacterResponse {
  if (!isRecord(v) || !hasExactKeys(v, ["exists"]) || typeof v.exists !== "boolean") {
    throw new WebPlatformContractError("character has 响应形状无效");
  }
  return v as HasCharacterResponse;
}

class CircuitBreaker {
  private failures = 0;
  private openedUntil = 0;
  private halfOpenProbe = false;

  enter(): void {
    const now = Date.now();
    if (this.openedUntil === 0) { return; }
    if (now < this.openedUntil || this.halfOpenProbe) {
      throw new WebPlatformUnavailableError("WebPlatform 熔断器已打开");
    }
    this.halfOpenProbe = true;
  }

  success(): void {
    this.failures = 0;
    this.openedUntil = 0;
    this.halfOpenProbe = false;
  }

  failure(): void {
    this.halfOpenProbe = false;
    this.failures++;
    if (this.openedUntil !== 0 || this.failures >= WEBPLATFORM_BREAKER_FAILURES) {
      this.openedUntil = Date.now() + WEBPLATFORM_BREAKER_OPEN_MS;
    }
  }
}

const breaker = new CircuitBreaker();

function transportRequest(
  path: string,
  method: string,
  body: unknown,
  requestId: string,
  timeoutMs: number,
): Promise<HttpResult> {
  const url = new URL(path, WEBPLATFORM_INTERNAL_URL);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const agent = isHttps ? httpsAgent : httpAgent;

  return new Promise<HttpResult>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let connectTimer: NodeJS.Timeout | undefined;
    let requestTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      if (connectTimer) { clearTimeout(connectTimer); }
      if (requestTimer) { clearTimeout(requestTimer); }
    };
    const fail = (error: unknown): void => {
      if (settled) { return; }
      settled = true;
      cleanup();
      reject(error instanceof WebPlatformUnavailableError
        || error instanceof WebPlatformContractError
        ? error
        : new WebPlatformUnavailableError(`WebPlatform ${method} ${path} 传输失败`, { cause: error }));
    };

    const headers: Record<string, string> = {
      accept: "application/json",
      "x-request-id": requestId,
      "x-service-id": WEBPLATFORM_SERVICE_ID,
      "x-service-secret": WEBPLATFORM_SERVICE_SECRET,
    };
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }

    const options: RequestOptions = { method, headers, agent, signal: controller.signal };
    const req = requestFn(url, options, (res) => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = undefined; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > MAX_RESPONSE_BYTES) {
          const error = new WebPlatformUnavailableError(
            `WebPlatform ${method} ${path} 响应超过 ${MAX_RESPONSE_BYTES} bytes`,
          );
          res.destroy(error);
          fail(error);
          return;
        }
        chunks.push(buf);
      });
      res.on("error", fail);
      res.on("end", () => {
        if (settled) { return; }
        const raw = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        let parsed: unknown = null;
        if (raw !== "") {
          try {
            parsed = JSON.parse(raw) as unknown;
          } catch (error) {
            // 2xx 必须满足 JSON 契约；错误状态的 HTML/纯文本 body 不应遮蔽状态分类，
            // 尤其 502/503 仍须进入一次有限重试。
            if (status >= 200 && status < 300) {
              fail(new WebPlatformContractError(
                `WebPlatform ${method} ${path} 返回非 JSON 响应: ${String(error)}`,
              ));
              return;
            }
            parsed = raw;
          }
        }
        settled = true;
        cleanup();
        resolve({ status, headers: res.headers, body: parsed });
      });
    });

    req.on("socket", (socket) => {
      if (!socket.connecting) {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = undefined; }
        return;
      }
      const connected = (): void => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = undefined; }
      };
      socket.once(isHttps ? "secureConnect" : "connect", connected);
    });
    req.on("error", fail);

    connectTimer = setTimeout(() => {
      controller.abort();
      fail(new WebPlatformUnavailableError(
        `WebPlatform ${method} ${path} 建连超时（${WEBPLATFORM_CONNECT_TIMEOUT_MS}ms）`,
      ));
    }, Math.min(WEBPLATFORM_CONNECT_TIMEOUT_MS, timeoutMs));
    requestTimer = setTimeout(() => {
      controller.abort();
      fail(new WebPlatformUnavailableError(
        `WebPlatform ${method} ${path} 请求超时（总预算 ${WEBPLATFORM_REQUEST_TIMEOUT_MS}ms）`,
      ));
    }, timeoutMs);

    req.end(payload);
  });
}

async function requestWithRetry(
  path: string,
  method: string,
  body: unknown,
): Promise<HttpResult> {
  const deadline = Date.now() + WEBPLATFORM_REQUEST_TIMEOUT_MS;
  const requestId = randomUUID();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { break; }
    try {
      const result = await transportRequest(path, method, body, requestId, remaining);
      if ((result.status === 502 || result.status === 503) && attempt === 0) {
        lastError = new WebPlatformUnavailableError(
          `WebPlatform ${method} ${path} → HTTP ${result.status}`,
        );
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (!(error instanceof WebPlatformUnavailableError) || attempt !== 0) { throw error; }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new WebPlatformUnavailableError(`WebPlatform ${method} ${path} 请求超时`);
}

async function call<T>(
  path: string,
  method: string,
  body: unknown,
  parse: (value: unknown) => T,
): Promise<T> {
  breaker.enter();
  try {
    const result = await requestWithRetry(path, method, body);
    if (result.status >= 500) {
      throw new WebPlatformUnavailableError(`WebPlatform ${method} ${path} → HTTP ${result.status}`);
    }
    if (result.status < 200 || result.status >= 300) {
      // 401/403 是游戏服服务身份配置错误；400/404/429 是调用契约或部署错误。
      // WebPlatform 已经可达，所以关闭可能处于半开态的熔断器，但仍向上抛 INTERNAL 类错误。
      breaker.success();
      throw new WebPlatformServiceError(`WebPlatform ${method} ${path} → HTTP ${result.status}`);
    }
    const value = parse(result.body);
    breaker.success();
    return value;
  } catch (error) {
    if (error instanceof WebPlatformUnavailableError || error instanceof WebPlatformContractError) {
      breaker.failure();
    }
    throw error;
  }
}

const assertServerId = (serverId: number): void => {
  if (!Number.isInteger(serverId) || serverId < 0 || serverId > 65535) {
    throw new WebPlatformServiceError(`非法 serverId：${String(serverId)}`);
  }
};

const characterPath = (userId: string, serverId: number): string => {
  assertServerId(serverId);
  if (userId.length < 1 || userId.length > 128) {
    throw new WebPlatformServiceError("非法 userId");
  }
  return WebPlatformPath.RegisterCharacter
    .replace("{userId}", encodeURIComponent(userId))
    .replace("{serverId}", String(serverId));
};

export interface WebPlatformClient {
  verify(accessToken: string, serverId: number): Promise<{ userId: string; issuedAtMs: number }>;
  registerCharacter(userId: string, serverId: number): Promise<void>;
  hasCharacter(userId: string, serverId: number): Promise<boolean>;
}

/** 生产默认实现。只在本模块内持有，业务代码统一经下方稳定 facade 调用。 */
const httpWebPlatformClient: WebPlatformClient = {
  async verify(accessToken, serverId) {
    assertServerId(serverId);
    if (accessToken.length < 1 || accessToken.length > 256) {
      throw new AuthRequiredError("token 无效");
    }
    const request: VerifySessionRequest = { accessToken, serverId };
    const response = await call(
      WebPlatformPath.VerifySession,
      WebPlatformMethod.VerifySession,
      request,
      parseVerifyResponse,
    );
    if (!response.valid) {
      if (response.reason === "BANNED") { throw new BannedError(); }
      if (response.reason === "DEREGISTERED") {
        throw new AuthRequiredError("账号已注销");
      }
      throw new AuthRequiredError(`token 校验失败(${response.reason})`);
    }
    return { userId: response.userId, issuedAtMs: response.issuedAtMs };
  },

  async registerCharacter(userId, serverId) {
    await call(
      characterPath(userId, serverId),
      WebPlatformMethod.RegisterCharacter,
      undefined,
      parseRegisterResponse,
    );
  },

  async hasCharacter(userId, serverId) {
    const response = await call(
      characterPath(userId, serverId),
      WebPlatformMethod.HasCharacter,
      undefined,
      parseHasResponse,
    );
    return response.exists;
  },
};

interface WebPlatformDelegateFrame {
  client: WebPlatformClient;
  previous?: WebPlatformDelegateFrame;
}
let webPlatformDelegateFrame: WebPlatformDelegateFrame = { client: httpWebPlatformClient };

/**
 * 稳定 singleton facade：生产默认永远委托给上方 HTTP client；测试替换 delegate 时，已 import
 * 本对象的业务模块也会立即看到替身，不需要改模块缓存或伪造旧 in-process 包。
 */
export const webPlatformClient: WebPlatformClient = {
  verify(accessToken, serverId) {
    return webPlatformDelegateFrame.client.verify(accessToken, serverId);
  },
  registerCharacter(userId, serverId) {
    return webPlatformDelegateFrame.client.registerCharacter(userId, serverId);
  },
  hasCharacter(userId, serverId) {
    return webPlatformDelegateFrame.client.hasCharacter(userId, serverId);
  },
};

/**
 * 测试专用 delegate 注入。返回的 restore 必须按嵌套安装的逆序调用；生产环境硬拒绝，
 * 防止测试接缝演化成运行期模式开关。
 */
export function installWebPlatformClientForTests(testClient: WebPlatformClient): () => void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境禁止注入 WebPlatformClient test delegate");
  }
  const previous = webPlatformDelegateFrame;
  const frame: WebPlatformDelegateFrame = { client: testClient, previous };
  webPlatformDelegateFrame = frame;
  let active = true;
  return () => {
    if (!active) { return; }
    if (webPlatformDelegateFrame !== frame) {
      throw new Error("WebPlatformClient test delegate 必须按安装逆序恢复");
    }
    webPlatformDelegateFrame = previous;
    active = false;
  };
}

/**
 * 建连严格校验：远程权威 verify → 用同一权威签发时刻懒填组缓存。
 * verify 与缓存写之间若发生更晚登录，Lua 栅栏返回 stale，本次旧 token 必须拒绝准入。
 */
export async function verifyAndCacheWebPlatformSession(
  accessToken: string,
  serverId: number,
): Promise<string> {
  const verified = await webPlatformClient.verify(accessToken, serverId);
  const cached = await writeGroupSess(
    verified.userId,
    accessToken,
    serverId,
    "",
    verified.issuedAtMs,
  );
  if (cached === "stale") {
    throw new AuthRequiredError("登录态已被更新，请重新登录");
  }
  return verified.userId;
}

/** 测试/停服：销毁 keep-alive socket。 */
export function closeWebPlatformClient(): void {
  httpAgent.destroy();
  httpsAgent.destroy();
}
