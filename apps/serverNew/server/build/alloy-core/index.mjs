// src/errors/framework-error.ts
var FRAMEWORK_ERROR_CODES = Object.freeze([
  "INVALID_STATE",
  "INVALID_SESSION",
  "SESSION_CLOSED",
  "STALE_GENERATION",
  "UNKNOWN_WORKER",
  "WORKER_NOT_READY",
  "IPC_CHANNEL_CLOSED",
  "IPC_QUEUE_FULL",
  "MESSAGE_TOO_LARGE",
  "OUTPUT_BUFFER_OVERFLOW",
  "READY_TIMEOUT",
  "DRAIN_TIMEOUT"
]);
var FRAMEWORK_ERROR_CODE = Object.freeze(
  Object.fromEntries(FRAMEWORK_ERROR_CODES.map((code) => [code, code]))
);
var FrameworkError = class extends Error {
  code;
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FrameworkError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
};

// src/lifecycle/states.ts
var MASTER_STATES = Object.freeze([
  "CREATED",
  "INITIALIZING",
  "SPAWNING_CHILDREN",
  "WAITING_READY",
  "LISTENING",
  "RUNNING",
  "RELOADING",
  "DRAINING",
  "STOPPING",
  "STOPPED"
]);
var WORKER_STATES = Object.freeze([
  "SPAWNING",
  "BOOTING",
  "READY",
  "RUNNING",
  "DRAINING",
  "EXITED",
  "FAILED"
]);
var CONNECTION_STATES = Object.freeze([
  "ACCEPTED",
  "HANDSHAKING",
  "OPEN",
  "CLOSING",
  "CLOSED"
]);
var MASTER_STATE = Object.freeze(
  Object.fromEntries(MASTER_STATES.map((state) => [state, state]))
);
var WORKER_STATE = Object.freeze(
  Object.fromEntries(WORKER_STATES.map((state) => [state, state]))
);
var CONNECTION_STATE = Object.freeze(
  Object.fromEntries(CONNECTION_STATES.map((state) => [state, state]))
);
var MASTER_TRANSITIONS = {
  CREATED: ["INITIALIZING", "STOPPING"],
  INITIALIZING: ["SPAWNING_CHILDREN", "STOPPING"],
  SPAWNING_CHILDREN: ["WAITING_READY", "STOPPING"],
  WAITING_READY: ["LISTENING", "STOPPING"],
  LISTENING: ["RUNNING", "STOPPING"],
  RUNNING: ["RELOADING", "DRAINING", "STOPPING"],
  RELOADING: ["RUNNING", "DRAINING", "STOPPING"],
  DRAINING: ["STOPPING"],
  STOPPING: ["STOPPED"],
  STOPPED: []
};
var WORKER_TRANSITIONS = {
  SPAWNING: ["BOOTING", "FAILED"],
  BOOTING: ["READY", "FAILED"],
  READY: ["RUNNING", "DRAINING", "FAILED"],
  RUNNING: ["DRAINING", "FAILED"],
  DRAINING: ["EXITED", "FAILED"],
  EXITED: ["SPAWNING"],
  FAILED: ["SPAWNING"]
};
var CONNECTION_TRANSITIONS = {
  ACCEPTED: ["HANDSHAKING", "OPEN", "CLOSING", "CLOSED"],
  HANDSHAKING: ["OPEN", "CLOSING", "CLOSED"],
  OPEN: ["CLOSING", "CLOSED"],
  CLOSING: ["CLOSED"],
  CLOSED: []
};
function assertTransition(machine, transitions, from, to) {
  if (!transitions[from].includes(to)) {
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.INVALID_STATE,
      `${machine} cannot transition from ${from} to ${to}`,
      { machine, from, to }
    );
  }
}
function canMasterTransition(from, to) {
  return MASTER_TRANSITIONS[from].includes(to);
}
function assertMasterTransition(from, to) {
  assertTransition("Master", MASTER_TRANSITIONS, from, to);
}
function canWorkerTransition(from, to) {
  return WORKER_TRANSITIONS[from].includes(to);
}
function assertWorkerTransition(from, to) {
  assertTransition("Worker", WORKER_TRANSITIONS, from, to);
}
function canConnectionTransition(from, to) {
  return CONNECTION_TRANSITIONS[from].includes(to);
}
function assertConnectionTransition(from, to) {
  assertTransition("Connection", CONNECTION_TRANSITIONS, from, to);
}

// src/protocol/process-role.ts
var PROCESS_ROLES = Object.freeze([
  "MASTER",
  "WORKER",
  "TASK_WORKER",
  "USER_TASK_WORKER"
]);
var PROCESS_ROLE = Object.freeze({
  MASTER: "MASTER",
  WORKER: "WORKER",
  TASK_WORKER: "TASK_WORKER",
  USER_TASK_WORKER: "USER_TASK_WORKER"
});
function isProcessRole(value) {
  return typeof value === "string" && PROCESS_ROLES.includes(value);
}

// src/protocol/session-id.ts
var SESSION_ID_LAYOUT = Object.freeze({
  gatewayBits: 8,
  masterGenerationBits: 13,
  slotIndexBits: 20,
  sessionGenerationBits: 12,
  maxGatewayId: 2 ** 8 - 1,
  maxMasterGeneration: 2 ** 13 - 1,
  maxSlotIndex: 2 ** 20 - 1,
  maxSessionGeneration: 2 ** 12 - 1,
  localSequenceRange: 2 ** 32
});
var SESSION_GENERATION_RANGE = 2 ** SESSION_ID_LAYOUT.sessionGenerationBits;
var MASTER_GENERATION_RANGE = 2 ** SESSION_ID_LAYOUT.masterGenerationBits;
function assertIntegerInRange(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a safe integer in [${min}, ${max}], got ${value}`);
  }
}
function encodeSessionId(parts) {
  assertIntegerInRange("gatewayId", parts.gatewayId, 0, SESSION_ID_LAYOUT.maxGatewayId);
  assertIntegerInRange(
    "masterGeneration",
    parts.masterGeneration,
    0,
    SESSION_ID_LAYOUT.maxMasterGeneration
  );
  assertIntegerInRange("slotIndex", parts.slotIndex, 0, SESSION_ID_LAYOUT.maxSlotIndex);
  assertIntegerInRange(
    "sessionGeneration",
    parts.sessionGeneration,
    1,
    SESSION_ID_LAYOUT.maxSessionGeneration
  );
  const localSequence = parts.slotIndex * SESSION_GENERATION_RANGE + parts.sessionGeneration;
  const value = (parts.gatewayId * MASTER_GENERATION_RANGE + parts.masterGeneration) * SESSION_ID_LAYOUT.localSequenceRange + localSequence;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`encoded SessionId is outside the JavaScript safe integer range: ${value}`);
  }
  return value;
}
function decodeSessionId(sessionId) {
  if (!isSessionId(sessionId)) {
    throw new RangeError(`invalid SessionId: ${sessionId}`);
  }
  const localSequence = sessionId % SESSION_ID_LAYOUT.localSequenceRange;
  const upper = Math.floor(sessionId / SESSION_ID_LAYOUT.localSequenceRange);
  const masterGeneration = upper % MASTER_GENERATION_RANGE;
  const gatewayId = Math.floor(upper / MASTER_GENERATION_RANGE);
  const sessionGeneration = localSequence % SESSION_GENERATION_RANGE;
  const slotIndex = Math.floor(localSequence / SESSION_GENERATION_RANGE);
  return Object.freeze({
    gatewayId,
    masterGeneration,
    localSequence,
    slotIndex,
    sessionGeneration
  });
}
function isSessionId(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return false;
  }
  const localSequence = value % SESSION_ID_LAYOUT.localSequenceRange;
  const sessionGeneration = localSequence % SESSION_GENERATION_RANGE;
  return sessionGeneration !== 0;
}

// src/protocol/worker-id.ts
function assertIntegerInRange2(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a safe integer in [${min}, ${max}], got ${value}`);
  }
}
function createWorkerId(value) {
  assertIntegerInRange2("workerId", value, 0, Number.MAX_SAFE_INTEGER);
  return value;
}
function createTaskWorkerId(value) {
  assertIntegerInRange2("taskWorkerId", value, 0, Number.MAX_SAFE_INTEGER);
  return value;
}
function createWorkerGeneration(value) {
  assertIntegerInRange2("workerGeneration", value, 0, Number.MAX_SAFE_INTEGER);
  return value;
}
function createProcessPid(value) {
  assertIntegerInRange2("processPid", value, 1, Number.MAX_SAFE_INTEGER);
  return value;
}
function toGlobalTaskWorkerId(workerNum, taskWorkerId, taskWorkerNum) {
  assertIntegerInRange2("workerNum", workerNum, 0, Number.MAX_SAFE_INTEGER);
  if (taskWorkerNum !== void 0) {
    assertIntegerInRange2("taskWorkerNum", taskWorkerNum, 0, Number.MAX_SAFE_INTEGER);
    if (taskWorkerId >= taskWorkerNum) {
      throw new RangeError(`taskWorkerId ${taskWorkerId} is outside task pool size ${taskWorkerNum}`);
    }
  }
  const globalId = workerNum + taskWorkerId;
  assertIntegerInRange2("globalTaskWorkerId", globalId, 0, Number.MAX_SAFE_INTEGER);
  return globalId;
}
function toTaskWorkerId(workerNum, globalTaskWorkerId, taskWorkerNum) {
  assertIntegerInRange2("workerNum", workerNum, 0, Number.MAX_SAFE_INTEGER);
  if (globalTaskWorkerId < workerNum) {
    throw new RangeError(
      `globalTaskWorkerId ${globalTaskWorkerId} belongs to the event worker range`
    );
  }
  const taskWorkerId = globalTaskWorkerId - workerNum;
  if (taskWorkerNum !== void 0) {
    assertIntegerInRange2("taskWorkerNum", taskWorkerNum, 0, Number.MAX_SAFE_INTEGER);
    if (taskWorkerId >= taskWorkerNum) {
      throw new RangeError(
        `globalTaskWorkerId ${globalTaskWorkerId} is outside task pool size ${taskWorkerNum}`
      );
    }
  }
  return taskWorkerId;
}
function isEventWorkerId(workerId, workerNum) {
  assertIntegerInRange2("workerNum", workerNum, 0, Number.MAX_SAFE_INTEGER);
  return workerId < workerNum;
}
function isTaskWorkerId(workerId, workerNum, taskWorkerNum) {
  assertIntegerInRange2("workerNum", workerNum, 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange2("taskWorkerNum", taskWorkerNum, 0, Number.MAX_SAFE_INTEGER);
  return workerId >= workerNum && workerId < workerNum + taskWorkerNum;
}
function toGlobalUserTaskWorkerId(workerNum, taskWorkerNum, userTaskWorkerId, userTaskWorkerNum) {
  assertIntegerInRange2("workerNum", workerNum, 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange2("taskWorkerNum", taskWorkerNum, 0, Number.MAX_SAFE_INTEGER);
  if (userTaskWorkerNum !== void 0) {
    assertIntegerInRange2("userTaskWorkerNum", userTaskWorkerNum, 0, Number.MAX_SAFE_INTEGER);
    if (userTaskWorkerId >= userTaskWorkerNum) {
      throw new RangeError(
        `userTaskWorkerId ${userTaskWorkerId} is outside user task pool size ${userTaskWorkerNum}`
      );
    }
  }
  return createWorkerId(workerNum + taskWorkerNum + userTaskWorkerId);
}
function isUserTaskWorkerId(workerId, workerNum, taskWorkerNum, userTaskWorkerNum) {
  const start = workerNum + taskWorkerNum;
  return workerId >= start && workerId < start + userTaskWorkerNum;
}

// src/protocol/ipc-envelope.ts
var IPC_PROTOCOL_VERSION = 1;
var IPC_MESSAGE_TYPES = Object.freeze([
  "CONTROL_BOOTSTRAP",
  "CONTROL_READY",
  "CONTROL_DRAIN",
  "CONTROL_SHUTDOWN",
  "CONTROL_HEARTBEAT",
  "CONTROL_CAPACITY",
  "NET_CONNECT",
  "NET_MESSAGE",
  "NET_CLOSE",
  "NET_SEND",
  "NET_CLOSE_COMMAND",
  "NET_BUFFER_STATE",
  "PROCESS_MESSAGE",
  "TASK_DISPATCH",
  "TASK_FINISH"
]);
var IPC_MESSAGE_TYPE = Object.freeze(
  Object.fromEntries(IPC_MESSAGE_TYPES.map((type) => [type, type]))
);
function createMessageId(value) {
  if (value.length === 0 || value.length > 128) {
    throw new RangeError("messageId must contain 1 to 128 characters");
  }
  return value;
}
function createCorrelationId(value) {
  if (value.length === 0 || value.length > 128) {
    throw new RangeError("correlationId must contain 1 to 128 characters");
  }
  return value;
}
function createIpcSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`sequence must be a non-negative safe integer, got ${value}`);
  }
  return value;
}
function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isJsonSafe(value, seen) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || value instanceof Uint8Array) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  let valid;
  if (Array.isArray(value)) {
    valid = value.every((item) => isJsonSafe(item, seen));
  } else if (isPlainObject(value)) {
    valid = Object.values(value).every((item) => isJsonSafe(item, seen));
  } else {
    valid = false;
  }
  seen.delete(value);
  return valid;
}
function validatePayload(value) {
  if (value instanceof Uint8Array) {
    return { valid: true, bytes: value.byteLength };
  }
  if (!isJsonSafe(value, /* @__PURE__ */ new WeakSet())) {
    return { valid: false, bytes: 0 };
  }
  const serialized = JSON.stringify(value);
  return {
    valid: typeof serialized === "string",
    bytes: typeof serialized === "string" ? new TextEncoder().encode(serialized).byteLength : 0
  };
}
function isSourceAddress(role, workerId, generation) {
  if (role === PROCESS_ROLE.MASTER) {
    return workerId === null && generation === null;
  }
  return typeof workerId === "number" && Number.isSafeInteger(workerId) && workerId >= 0 && typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0;
}
function isTargetAddress(role, workerId) {
  if (role === PROCESS_ROLE.MASTER) {
    return workerId === null;
  }
  return typeof workerId === "number" && Number.isSafeInteger(workerId) && workerId >= 0;
}
function isValidBinaryIpcEnvelope(value, options = {}) {
  if (typeof value !== "object" || value === null || !isPlainObject(value)) {
    return false;
  }
  const envelope = value;
  const payload = envelope.payload;
  return envelope.protocolVersion === IPC_PROTOCOL_VERSION && typeof envelope.messageId === "string" && envelope.messageId.length > 0 && envelope.messageId.length <= 128 && IPC_MESSAGE_TYPES.includes(envelope.messageType) && isProcessRole(envelope.sourceRole) && isSourceAddress(
    envelope.sourceRole,
    envelope.sourceWorkerId,
    envelope.sourceGeneration
  ) && isProcessRole(envelope.targetRole) && isTargetAddress(envelope.targetRole, envelope.targetWorkerId) && (envelope.correlationId === null || typeof envelope.correlationId === "string" && envelope.correlationId.length > 0 && envelope.correlationId.length <= 128) && (envelope.sessionId === null || isSessionId(envelope.sessionId)) && Number.isSafeInteger(envelope.sequence) && envelope.sequence >= 0 && Number.isInteger(envelope.flags) && envelope.flags >= 0 && envelope.flags <= 4294967295 && payload instanceof Uint8Array && (options.maxPayloadBytes === void 0 || payload.byteLength <= options.maxPayloadBytes);
}
function validateIpcEnvelope(value, options = {}) {
  if (isValidBinaryIpcEnvelope(value, options)) {
    return [];
  }
  const issues = [];
  if (typeof value !== "object" || value === null || !isPlainObject(value)) {
    return [{ field: "envelope", message: "envelope must be a plain object" }];
  }
  const envelope = value;
  if (envelope.protocolVersion !== IPC_PROTOCOL_VERSION) {
    issues.push({ field: "protocolVersion", message: "unsupported protocol version" });
  }
  if (typeof envelope.messageId !== "string" || envelope.messageId.length === 0 || envelope.messageId.length > 128) {
    issues.push({ field: "messageId", message: "messageId must contain 1 to 128 characters" });
  }
  if (!IPC_MESSAGE_TYPES.includes(envelope.messageType)) {
    issues.push({ field: "messageType", message: "unknown messageType" });
  }
  if (!isProcessRole(envelope.sourceRole)) {
    issues.push({ field: "sourceRole", message: "unknown sourceRole" });
  } else if (!isSourceAddress(envelope.sourceRole, envelope.sourceWorkerId, envelope.sourceGeneration)) {
    issues.push({ field: "sourceWorkerId", message: "source address does not match sourceRole" });
  }
  if (!isProcessRole(envelope.targetRole)) {
    issues.push({ field: "targetRole", message: "unknown targetRole" });
  } else if (!isTargetAddress(envelope.targetRole, envelope.targetWorkerId)) {
    issues.push({ field: "targetWorkerId", message: "target address does not match targetRole" });
  }
  if (envelope.correlationId !== null && (typeof envelope.correlationId !== "string" || envelope.correlationId.length === 0 || envelope.correlationId.length > 128)) {
    issues.push({
      field: "correlationId",
      message: "correlationId must be null or contain 1 to 128 characters"
    });
  }
  if (envelope.sessionId !== null && !isSessionId(envelope.sessionId)) {
    issues.push({ field: "sessionId", message: "sessionId must be a valid SessionId or null" });
  }
  if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 0) {
    issues.push({ field: "sequence", message: "sequence must be a non-negative safe integer" });
  }
  if (!Number.isInteger(envelope.flags) || envelope.flags < 0 || envelope.flags > 4294967295) {
    issues.push({ field: "flags", message: "flags must be an unsigned 32-bit integer" });
  }
  const payload = validatePayload(envelope.payload);
  if (!payload.valid) {
    issues.push({ field: "payload", message: "payload must be binary or JSON-safe plain data" });
  } else if (options.maxPayloadBytes !== void 0 && payload.bytes > options.maxPayloadBytes) {
    issues.push({
      field: "payload",
      message: `payload size ${payload.bytes} exceeds ${options.maxPayloadBytes} bytes`
    });
  }
  return issues;
}
function createIpcEnvelope(envelope) {
  const issues = validateIpcEnvelope(envelope);
  if (issues.length > 0) {
    throw new TypeError(`invalid IPC envelope: ${issues.map((issue2) => issue2.message).join("; ")}`);
  }
  return Object.freeze({ ...envelope });
}
function assertEnvelopeSourceGeneration(envelope, currentGeneration) {
  if (envelope.sourceRole === PROCESS_ROLE.MASTER) {
    return;
  }
  if (envelope.sourceGeneration === null || envelope.sourceGeneration !== currentGeneration) {
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.STALE_GENERATION,
      "IPC envelope was produced by a stale process generation",
      {
        sourceWorkerId: envelope.sourceWorkerId,
        sourceGeneration: envelope.sourceGeneration,
        currentGeneration
      }
    );
  }
}

// src/runtime/runtime-server-application.ts
import { AsyncLocalStorage as AsyncLocalStorage8 } from "node:async_hooks";
import { resolve as resolve3 } from "node:path";

// src/config/runtime-settings.ts
var UINT32_MAX = 4294967295;
var RUNTIME_SETTING_KEYS = Object.freeze([
  "host",
  "port",
  "protocol",
  "work_mode",
  "sock_type",
  "reactor_num",
  "daemonize",
  "open_tcp_nodelay",
  "worker_num",
  "max_request",
  "max_conn",
  "dispatch_mode",
  "task_worker_num",
  "user_task_worker_num",
  "log_file",
  "enable_coroutine",
  "backlog",
  "user",
  "group",
  "send_yield",
  "buffer_input_size",
  "buffer_output_size",
  "socket_buffer_size",
  "buffer_high_watermark",
  "buffer_low_watermark",
  "backpressure_timeout_ms",
  "idle_timeout_ms",
  "read_timeout_ms",
  "write_timeout_ms"
]);
var REQUIRED_RUNTIME_SETTING_KEYS = /* @__PURE__ */ new Set([
  "host",
  "port",
  "protocol",
  "work_mode",
  "sock_type",
  "worker_num",
  "dispatch_mode",
  "task_worker_num"
]);
var RUNTIME_SETTING_KEY_SET = new Set(RUNTIME_SETTING_KEYS);
var RUNTIME_CONFIG_ISSUE_CODES = Object.freeze([
  "INVALID_ROOT",
  "UNKNOWN_KEY",
  "MISSING_REQUIRED",
  "INVALID_TYPE",
  "INVALID_VALUE",
  "OUT_OF_RANGE"
]);
var RuntimeConfigError = class extends TypeError {
  issues;
  constructor(issues) {
    const frozenIssues = Object.freeze(
      issues.map((issue2) => Object.freeze({ ...issue2 }))
    );
    super(
      frozenIssues.length === 0 ? "Invalid runtime settings" : `Invalid runtime settings: ${frozenIssues.map((issue2) => issue2.message).join("; ")}`
    );
    this.name = "RuntimeConfigError";
    this.issues = frozenIssues;
  }
};
function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}
function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function validateString(input, output, issues, key, nonEmpty) {
  if (!Object.hasOwn(input, key)) {
    return;
  }
  const value = input[key];
  if (typeof value !== "string") {
    issue(issues, "INVALID_TYPE", `$.${key}`, `${key} must be a string`);
    return;
  }
  if (nonEmpty && value.trim().length === 0) {
    issue(issues, "INVALID_VALUE", `$.${key}`, `${key} must not be empty`);
    return;
  }
  output[key] = value;
}
function validateBoolean(input, output, issues, key) {
  if (!Object.hasOwn(input, key)) {
    return;
  }
  const value = input[key];
  if (typeof value !== "boolean") {
    issue(issues, "INVALID_TYPE", `$.${key}`, `${key} must be a boolean`);
    return;
  }
  output[key] = value;
}
function validateInteger(input, output, issues, key, minimum, maximum) {
  if (!Object.hasOwn(input, key)) {
    return;
  }
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issue(issues, "INVALID_TYPE", `$.${key}`, `${key} must be an integer`);
    return;
  }
  if (value < minimum || value > maximum) {
    issue(
      issues,
      "OUT_OF_RANGE",
      `$.${key}`,
      `${key} must be between ${minimum} and ${maximum}`
    );
    return;
  }
  output[key] = value;
}
function validateFixedValue(input, output, issues, key, expected) {
  if (!Object.hasOwn(input, key)) {
    return;
  }
  const value = input[key];
  if (typeof value !== typeof expected) {
    issue(issues, "INVALID_TYPE", `$.${key}`, `${key} has an invalid type`);
    return;
  }
  if (value !== expected) {
    issue(
      issues,
      "INVALID_VALUE",
      `$.${key}`,
      `${key} must be ${JSON.stringify(expected)}`
    );
    return;
  }
  output[key] = expected;
}
function validateProtocol(input, output, issues) {
  if (!Object.hasOwn(input, "protocol")) {
    return;
  }
  const value = input.protocol;
  if (typeof value !== "string") {
    issue(issues, "INVALID_TYPE", "$.protocol", "protocol must be a string");
    return;
  }
  if (value !== "tcp" && value !== "websocket") {
    issue(
      issues,
      "INVALID_VALUE",
      "$.protocol",
      'protocol must be "tcp" or "websocket"'
    );
    return;
  }
  output.protocol = value;
}
function loadRuntimeSettings(input) {
  if (!isPlainRecord(input)) {
    throw new RuntimeConfigError([
      {
        code: "INVALID_ROOT",
        path: "$",
        message: "runtime settings must be a plain object"
      }
    ]);
  }
  const issues = [];
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !RUNTIME_SETTING_KEY_SET.has(key)) {
      const displayKey = typeof key === "symbol" ? key.toString() : key;
      issue(
        issues,
        "UNKNOWN_KEY",
        `$.${displayKey}`,
        `unknown runtime setting ${displayKey}`
      );
    }
  }
  for (const key of REQUIRED_RUNTIME_SETTING_KEYS) {
    if (!Object.hasOwn(input, key)) {
      issue(issues, "MISSING_REQUIRED", `$.${key}`, `missing required runtime setting ${key}`);
    }
  }
  const output = {};
  validateString(input, output, issues, "host", true);
  validateInteger(input, output, issues, "port", 0, 65535);
  validateProtocol(input, output, issues);
  validateFixedValue(input, output, issues, "work_mode", "process");
  validateFixedValue(input, output, issues, "sock_type", "tcp");
  validateFixedValue(input, output, issues, "reactor_num", 1);
  validateBoolean(input, output, issues, "daemonize");
  validateBoolean(input, output, issues, "open_tcp_nodelay");
  validateInteger(input, output, issues, "worker_num", 1, UINT32_MAX);
  validateInteger(input, output, issues, "max_request", 0, UINT32_MAX);
  validateInteger(input, output, issues, "max_conn", 1, UINT32_MAX);
  validateFixedValue(input, output, issues, "dispatch_mode", 2);
  validateInteger(input, output, issues, "task_worker_num", 0, UINT32_MAX);
  validateInteger(input, output, issues, "user_task_worker_num", 0, UINT32_MAX);
  validateString(input, output, issues, "log_file", true);
  validateBoolean(input, output, issues, "enable_coroutine");
  validateInteger(input, output, issues, "backlog", 1, 65535);
  validateString(input, output, issues, "user", true);
  validateString(input, output, issues, "group", true);
  validateBoolean(input, output, issues, "send_yield");
  validateInteger(input, output, issues, "buffer_input_size", 1, UINT32_MAX);
  validateInteger(input, output, issues, "buffer_output_size", 1, UINT32_MAX);
  validateInteger(input, output, issues, "socket_buffer_size", 1, UINT32_MAX);
  validateInteger(input, output, issues, "buffer_high_watermark", 0, UINT32_MAX);
  validateInteger(input, output, issues, "buffer_low_watermark", 0, UINT32_MAX);
  validateInteger(input, output, issues, "backpressure_timeout_ms", 1, UINT32_MAX);
  validateInteger(input, output, issues, "idle_timeout_ms", 1, UINT32_MAX);
  validateInteger(input, output, issues, "read_timeout_ms", 1, UINT32_MAX);
  validateInteger(input, output, issues, "write_timeout_ms", 1, UINT32_MAX);
  if (output.send_yield === true) {
    issue(
      issues,
      "INVALID_VALUE",
      "$.send_yield",
      "send_yield=true is unsupported because RuntimeServer send methods are synchronous"
    );
  }
  const socketBufferSize = output.socket_buffer_size;
  const highWatermark = output.buffer_high_watermark;
  const lowWatermark = output.buffer_low_watermark;
  if (socketBufferSize !== void 0 && highWatermark !== void 0 && highWatermark > socketBufferSize) {
    issue(
      issues,
      "INVALID_VALUE",
      "$.buffer_high_watermark",
      "buffer_high_watermark must not exceed socket_buffer_size"
    );
  }
  if (socketBufferSize !== void 0 && lowWatermark !== void 0 && lowWatermark > socketBufferSize) {
    issue(
      issues,
      "INVALID_VALUE",
      "$.buffer_low_watermark",
      "buffer_low_watermark must not exceed socket_buffer_size"
    );
  }
  if (highWatermark !== void 0 && lowWatermark !== void 0 && lowWatermark > highWatermark) {
    issue(
      issues,
      "INVALID_VALUE",
      "$.buffer_low_watermark",
      "buffer_low_watermark must not exceed buffer_high_watermark"
    );
  }
  if (issues.length > 0) {
    throw new RuntimeConfigError(issues);
  }
  return Object.freeze({ ...output });
}

// src/network/rust-data-plane-path.ts
function rustTcpDataPlaneEnabled(protocol) {
  return protocol === "tcp" && process.env.ALLOY_CORE_NODE_DATA_PLANE !== "1";
}
function rustDataPlanePath(masterPid, masterGeneration) {
  if (!Number.isSafeInteger(masterPid) || masterPid < 1) {
    throw new RangeError("masterPid must be a positive safe integer");
  }
  if (!Number.isSafeInteger(masterGeneration) || masterGeneration < 0) {
    throw new RangeError("masterGeneration must be a non-negative safe integer");
  }
  return `/tmp/alloy-core-${masterPid}-${masterGeneration}.sock`;
}

// src/lifecycle/master-runtime.ts
import { AsyncLocalStorage as AsyncLocalStorage6 } from "node:async_hooks";

// src/process/node-ipc-wire.ts
var NODE_IPC_WIRE_TAG = 1095519281;
var NODE_IPC_WIRE_FIELDS = 13;
var decodedWireEnvelopes = /* @__PURE__ */ new WeakSet();
var messageTypeCodes = new Map(
  IPC_MESSAGE_TYPES.map((messageType, index) => [messageType, index])
);
var processRoleCodes = new Map(
  PROCESS_ROLES.map((role, index) => [role, index])
);
function isEnvelopeCandidate(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const envelope = value;
  return envelope.protocolVersion === IPC_PROTOCOL_VERSION && messageTypeCodes.has(envelope.messageType) && processRoleCodes.has(envelope.sourceRole) && processRoleCodes.has(envelope.targetRole);
}
function encodeNodeIpcWireMessage(message) {
  if (!isEnvelopeCandidate(message)) {
    return message;
  }
  return [
    NODE_IPC_WIRE_TAG,
    message.messageId,
    messageTypeCodes.get(message.messageType),
    processRoleCodes.get(message.sourceRole),
    message.sourceWorkerId,
    message.sourceGeneration,
    processRoleCodes.get(message.targetRole),
    message.targetWorkerId,
    message.correlationId,
    message.sessionId,
    message.sequence,
    message.flags,
    message.payload
  ];
}
function decodeNodeIpcWireMessage(message) {
  if (!Array.isArray(message) || message.length !== NODE_IPC_WIRE_FIELDS || message[0] !== NODE_IPC_WIRE_TAG) {
    return message;
  }
  const messageType = IPC_MESSAGE_TYPES[message[2]];
  const sourceRole = PROCESS_ROLES[message[3]];
  const targetRole = PROCESS_ROLES[message[6]];
  const envelope = {
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: message[1],
    messageType,
    sourceRole,
    sourceWorkerId: message[4],
    sourceGeneration: message[5],
    targetRole,
    targetWorkerId: message[7],
    correlationId: message[8],
    sessionId: message[9],
    sequence: message[10],
    flags: message[11],
    payload: message[12]
  };
  decodedWireEnvelopes.add(envelope);
  return envelope;
}
function isDecodedNodeIpcWireEnvelope(value) {
  return typeof value === "object" && value !== null && decodedWireEnvelopes.has(value);
}

// src/process/ipc-message-codec.ts
var DEFAULT_MAX_IPC_MESSAGE_BYTES = 1024 * 1024;
var DEFAULT_IPC_ENVELOPE_HEADROOM_BYTES = 64 * 1024;
var IPC_ENVELOPE_KEYS = Object.freeze([
  "protocolVersion",
  "messageId",
  "messageType",
  "sourceRole",
  "sourceWorkerId",
  "sourceGeneration",
  "targetRole",
  "targetWorkerId",
  "correlationId",
  "sessionId",
  "sequence",
  "flags",
  "payload"
]);
var envelopeKeySet = new Set(IPC_ENVELOPE_KEYS);
var encodedEnvelopeCache = /* @__PURE__ */ new WeakMap();
function assertNonNegativeSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function hasExactEnvelopeShape(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== IPC_ENVELOPE_KEYS.length) {
    return false;
  }
  let ordered = true;
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] !== IPC_ENVELOPE_KEYS[index]) {
      ordered = false;
      break;
    }
  }
  if (!ordered) {
    for (const key of keys) {
      if (!envelopeKeySet.has(key)) {
        return false;
      }
    }
  }
  for (const key of IPC_ENVELOPE_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
      return false;
    }
  }
  return true;
}
function cloneJsonValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneJsonValue(item)));
  }
  const objectValue = value;
  const clone = Object.create(
    Object.getPrototypeOf(value)
  );
  for (const key of Object.keys(value)) {
    Object.defineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      value: cloneJsonValue(objectValue[key]),
      writable: false
    });
  }
  return Object.freeze(clone);
}
function clonePayload(payload) {
  if (payload instanceof Uint8Array) {
    return Buffer.isBuffer(payload) ? Buffer.from(payload) : new Uint8Array(payload);
  }
  return cloneJsonValue(payload);
}
function snapshotEnvelope(envelope, copyPayload) {
  return Object.freeze({
    protocolVersion: envelope.protocolVersion,
    messageId: envelope.messageId,
    messageType: envelope.messageType,
    sourceRole: envelope.sourceRole,
    sourceWorkerId: envelope.sourceWorkerId,
    sourceGeneration: envelope.sourceGeneration,
    targetRole: envelope.targetRole,
    targetWorkerId: envelope.targetWorkerId,
    correlationId: envelope.correlationId,
    sessionId: envelope.sessionId,
    sequence: envelope.sequence,
    flags: envelope.flags,
    payload: copyPayload ? clonePayload(envelope.payload) : envelope.payload
  });
}
function jsonStringByteLength(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 34 || code === 92 || code > 127) {
      return Buffer.byteLength(JSON.stringify(value), "utf8");
    }
  }
  return value.length + 2;
}
function nullableIntegerByteLength(value) {
  return value === null ? 4 : String(value).length;
}
var BINARY_ENVELOPE_FIXED_BYTES = (() => {
  const template = {
    protocolVersion: 1,
    messageId: "",
    messageType: "",
    sourceRole: "",
    sourceWorkerId: null,
    sourceGeneration: null,
    targetRole: "",
    targetWorkerId: null,
    correlationId: null,
    sessionId: null,
    sequence: 0,
    flags: 0,
    payload: ""
  };
  const dynamicBytes = jsonStringByteLength("") * 4 + 4 * 5 + 2;
  return Buffer.byteLength(JSON.stringify(template), "utf8") - dynamicBytes;
})();
function measureBinaryEnvelope(envelope) {
  return BINARY_ENVELOPE_FIXED_BYTES + jsonStringByteLength(envelope.messageId) + envelope.messageType.length + 2 + envelope.sourceRole.length + 2 + nullableIntegerByteLength(envelope.sourceWorkerId) + nullableIntegerByteLength(envelope.sourceGeneration) + envelope.targetRole.length + 2 + nullableIntegerByteLength(envelope.targetWorkerId) + (envelope.correlationId === null ? 4 : jsonStringByteLength(envelope.correlationId)) + nullableIntegerByteLength(envelope.sessionId) + String(envelope.sequence).length + String(envelope.flags).length + envelope.payload.byteLength;
}
function measureEnvelope(envelope) {
  if (envelope.payload instanceof Uint8Array) {
    return measureBinaryEnvelope(envelope);
  }
  return Buffer.byteLength(JSON.stringify(envelope), "utf8");
}
function invalidEnvelope(value, requireExactShape) {
  if (requireExactShape && !isDecodedNodeIpcWireEnvelope(value) && !hasExactEnvelopeShape(value)) {
    return new TypeError(
      `invalid IPC envelope: envelope must contain exactly these enumerable data fields: ${IPC_ENVELOPE_KEYS.join(", ")}`
    );
  }
  const issues = validateIpcEnvelope(value);
  if (issues.length === 0) {
    return void 0;
  }
  const messages = issues.map((issue2) => `${String(issue2.field)}: ${issue2.message}`);
  return new TypeError(`invalid IPC envelope: ${messages.join("; ")}`);
}
var IpcEnvelopeCodec = class {
  maxMessageBytes;
  constructor(options = {}) {
    const maxMessageBytes = typeof options === "number" ? options : options.maxMessageBytes ?? DEFAULT_MAX_IPC_MESSAGE_BYTES;
    assertNonNegativeSafeInteger("maxMessageBytes", maxMessageBytes);
    this.maxMessageBytes = maxMessageBytes;
  }
  encode(envelope) {
    return this.#snapshot(envelope, true, "copy");
  }
  encodeLocal(envelope) {
    return this.#snapshot(envelope, false, "copy");
  }
  encodeOwned(envelope) {
    return this.#snapshot(envelope, false, "owned");
  }
  decode(value) {
    return this.#snapshot(value, true, "copy");
  }
  decodeOwned(value) {
    return this.#snapshot(value, true, "owned-binary");
  }
  #snapshot(value, requireExactShape, copyMode) {
    if (typeof value === "object" && value !== null) {
      const cached = encodedEnvelopeCache.get(value);
      if (cached !== void 0) {
        this.#assertMessageSize(cached.byteLength, cached.envelope);
        return cached;
      }
    }
    const error = invalidEnvelope(value, requireExactShape);
    if (error !== void 0) {
      throw error;
    }
    const source = value;
    const copyPayload = copyMode === "copy" || copyMode === "owned-binary" && !(source.payload instanceof Uint8Array);
    const envelope = snapshotEnvelope(source, copyPayload);
    const byteLength2 = measureEnvelope(envelope);
    this.#assertMessageSize(byteLength2, envelope);
    const encoded = Object.freeze({ envelope, byteLength: byteLength2 });
    encodedEnvelopeCache.set(envelope, encoded);
    return encoded;
  }
  /**
   * 超限时把「是哪条消息」一起报出来。
   *
   * 只报字节数的话，线上拿到 `MESSAGE_TOO_LARGE` 根本定位不到发送方，
   * 所以把 messageType / sessionId / correlationId / sequence 一并带上。
   */
  #assertMessageSize(byteLength2, envelope) {
    if (byteLength2 > this.maxMessageBytes) {
      const locator = envelope === void 0 ? {} : {
        messageType: envelope.messageType,
        sessionId: envelope.sessionId,
        correlationId: envelope.correlationId,
        sequence: envelope.sequence,
        sourceRole: envelope.sourceRole,
        sourceWorkerId: envelope.sourceWorkerId
      };
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
        `IPC message size ${byteLength2} exceeds ${this.maxMessageBytes} bytes (messageType=${String(locator["messageType"])} sessionId=${String(locator["sessionId"])} correlationId=${String(locator["correlationId"])} sequence=${String(locator["sequence"])})`,
        { byteLength: byteLength2, maxMessageBytes: this.maxMessageBytes, ...locator }
      );
    }
  }
};

// src/process/process-transport.ts
var PROCESS_TRANSPORT_LANE = Object.freeze({
  CONTROL: "control",
  DATA: "data"
});
var DEFAULT_DATA_QUEUE_MAX_MESSAGES = 1024;
var DEFAULT_DATA_QUEUE_MAX_BYTES = 8 * 1024 * 1024;
var DEFAULT_DATA_QUEUE_HIGH_MESSAGES = 768;
var DEFAULT_DATA_QUEUE_HIGH_BYTES = 6 * 1024 * 1024;
var DEFAULT_DATA_QUEUE_LOW_MESSAGES = 512;
var DEFAULT_DATA_QUEUE_LOW_BYTES = 4 * 1024 * 1024;
var DEFAULT_CONTROL_QUEUE_MAX_MESSAGES = 32;
var DEFAULT_CONTROL_QUEUE_MAX_BYTES = 256 * 1024;
function createDeferred() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function createHandledDeferred() {
  const deferred = createDeferred();
  void deferred.promise.catch(() => void 0);
  return deferred;
}
function assertCapacity(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function assertWatermarkOrder(name, low, high, max) {
  if (low > high || high > max) {
    throw new RangeError(
      `${name} watermarks must satisfy low <= high <= max, got ${low} <= ${high} <= ${max}`
    );
  }
}
function assertLane(lane) {
  if (lane !== PROCESS_TRANSPORT_LANE.CONTROL && lane !== PROCESS_TRANSPORT_LANE.DATA) {
    throw new TypeError(`unknown process transport lane: ${lane}`);
  }
}
function reasonText(reason) {
  if (reason === void 0) {
    return void 0;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  try {
    return String(reason);
  } catch {
    return "<unprintable reason>";
  }
}
function channelClosedError(message, reason, details = {}) {
  if (reason instanceof FrameworkError && reason.code === FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED) {
    return reason;
  }
  const renderedReason = reasonText(reason);
  return new FrameworkError(
    FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
    message,
    renderedReason === void 0 ? details : { ...details, reason: renderedReason }
  );
}
function createLaneState(maxMessages, maxBytes) {
  return {
    maxMessages,
    maxBytes,
    queue: [],
    pendingMessages: 0,
    pendingBytes: 0
  };
}
var BoundedProcessTransport = class {
  closed;
  #endpoint;
  #codec;
  #control;
  #data;
  #dataWatermarks;
  #closedDeferred = createDeferred();
  #drainWaiters = /* @__PURE__ */ new Set();
  #messageHandlers = /* @__PURE__ */ new Set();
  #protocolErrorHandlers = /* @__PURE__ */ new Set();
  #capacityListeners = /* @__PURE__ */ new Set();
  #disposeRawMessage = () => {
  };
  #inFlight;
  #dataSequence = 0n;
  #isClosed = false;
  #dataSealed = false;
  #closeError;
  #dataSealError;
  #acceptedMessages = 0;
  #rejectedMessages = 0;
  #sentMessages = 0;
  #sentBytes = 0;
  #failedMessages = 0;
  #receivedMessages = 0;
  #receivedBytes = 0;
  #protocolErrorCount = 0;
  #handlerErrorCount = 0;
  #backpressureCount = 0;
  #dataPressured = false;
  constructor(endpoint, options = {}) {
    const dataMaxMessages = options.dataMaxMessages ?? options.data?.maxMessages ?? DEFAULT_DATA_QUEUE_MAX_MESSAGES;
    const dataMaxBytes = options.dataMaxBytes ?? options.data?.maxBytes ?? DEFAULT_DATA_QUEUE_MAX_BYTES;
    const dataHighMessages = options.dataHighMessages ?? options.data?.highMessages ?? Math.min(DEFAULT_DATA_QUEUE_HIGH_MESSAGES, dataMaxMessages);
    const dataHighBytes = options.dataHighBytes ?? options.data?.highBytes ?? Math.min(DEFAULT_DATA_QUEUE_HIGH_BYTES, dataMaxBytes);
    const dataLowMessages = options.dataLowMessages ?? options.data?.lowMessages ?? Math.min(DEFAULT_DATA_QUEUE_LOW_MESSAGES, dataHighMessages);
    const dataLowBytes = options.dataLowBytes ?? options.data?.lowBytes ?? Math.min(DEFAULT_DATA_QUEUE_LOW_BYTES, dataHighBytes);
    const controlMaxMessages = options.controlMaxMessages ?? options.control?.maxMessages ?? DEFAULT_CONTROL_QUEUE_MAX_MESSAGES;
    const controlMaxBytes = options.controlMaxBytes ?? options.control?.maxBytes ?? DEFAULT_CONTROL_QUEUE_MAX_BYTES;
    assertCapacity("data maxMessages", dataMaxMessages);
    assertCapacity("data maxBytes", dataMaxBytes);
    assertCapacity("data highMessages", dataHighMessages);
    assertCapacity("data highBytes", dataHighBytes);
    assertCapacity("data lowMessages", dataLowMessages);
    assertCapacity("data lowBytes", dataLowBytes);
    assertCapacity("control maxMessages", controlMaxMessages);
    assertCapacity("control maxBytes", controlMaxBytes);
    assertWatermarkOrder(
      "data message",
      dataLowMessages,
      dataHighMessages,
      dataMaxMessages
    );
    assertWatermarkOrder(
      "data byte",
      dataLowBytes,
      dataHighBytes,
      dataMaxBytes
    );
    this.#endpoint = endpoint;
    this.#codec = options.codec ?? new IpcEnvelopeCodec(
      options.maxMessageBytes === void 0 ? {} : { maxMessageBytes: options.maxMessageBytes }
    );
    this.#control = createLaneState(controlMaxMessages, controlMaxBytes);
    this.#data = createLaneState(dataMaxMessages, dataMaxBytes);
    this.#dataWatermarks = Object.freeze({
      highMessages: dataHighMessages,
      highBytes: dataHighBytes,
      lowMessages: dataLowMessages,
      lowBytes: dataLowBytes
    });
    this.closed = this.#closedDeferred.promise;
    this.#disposeRawMessage = endpoint.onMessage(this.#handleRawMessage);
    void endpoint.closed.then(
      (result) => {
        this.#beginClose(
          channelClosedError("raw IPC endpoint closed", result)
        );
      },
      (error) => {
        this.#beginClose(
          channelClosedError("raw IPC endpoint failed", error)
        );
      }
    ).catch(() => void 0);
    if (!endpoint.connected) {
      this.#beginClose(
        channelClosedError("raw IPC endpoint is not connected")
      );
    }
  }
  send(envelope, lane = PROCESS_TRANSPORT_LANE.DATA) {
    assertLane(lane);
    return this.#enqueueSend(envelope, lane);
  }
  sendControlAfterData(envelope) {
    return this.#enqueueSend(
      envelope,
      PROCESS_TRANSPORT_LANE.CONTROL,
      this.#dataSequence
    );
  }
  #enqueueSend(envelope, lane, dataFence) {
    if (this.#isClosed) {
      this.#rejectedMessages += 1;
      throw this.#closeError ?? channelClosedError("process transport is closed");
    }
    if (lane === PROCESS_TRANSPORT_LANE.DATA && this.#dataSealed) {
      this.#rejectedMessages += 1;
      throw this.#dataSealError ?? channelClosedError("process transport data lane is sealed");
    }
    if (!this.#endpoint.connected) {
      const error = channelClosedError("raw IPC endpoint is not connected");
      this.#beginClose(error);
      this.#rejectedMessages += 1;
      throw error;
    }
    const encoded = this.#codec.encode(envelope);
    const state = this.#stateFor(lane);
    if (encoded.byteLength > state.maxBytes) {
      this.#rejectedMessages += 1;
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
        `process transport ${lane} message size ${encoded.byteLength} can never fit in the ${lane} lane (${state.maxBytes} bytes) (messageType=${String(envelope.messageType)} sessionId=${String(envelope.sessionId)} correlationId=${String(envelope.correlationId)})`,
        {
          lane,
          byteLength: encoded.byteLength,
          laneMaxBytes: state.maxBytes,
          maxMessageBytes: this.#codec.maxMessageBytes,
          messageType: envelope.messageType,
          sessionId: envelope.sessionId,
          correlationId: envelope.correlationId
        }
      );
    }
    if (state.pendingMessages >= state.maxMessages || encoded.byteLength > state.maxBytes - state.pendingBytes) {
      this.#rejectedMessages += 1;
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
        `process transport ${lane} queue is full`,
        {
          lane,
          maxMessages: state.maxMessages,
          maxBytes: state.maxBytes,
          pendingMessages: state.pendingMessages,
          pendingBytes: state.pendingBytes,
          messageBytes: encoded.byteLength
        }
      );
    }
    const deferred = createHandledDeferred();
    const dataSequence = lane === PROCESS_TRANSPORT_LANE.DATA ? this.#dataSequence + 1n : void 0;
    const pending = {
      ...encoded,
      lane,
      deferred,
      ...dataSequence === void 0 ? {} : { dataSequence },
      ...dataFence === void 0 ? {} : { dataFence },
      backpressured: false
    };
    state.queue.push(pending);
    if (dataSequence !== void 0) {
      this.#dataSequence = dataSequence;
    }
    state.pendingMessages += 1;
    state.pendingBytes += encoded.byteLength;
    this.#acceptedMessages += 1;
    this.#updateDataPressure();
    this.#pump();
    return deferred.promise;
  }
  onMessage(handler) {
    if (this.#isClosed) {
      return () => {
      };
    }
    this.#messageHandlers.add(handler);
    return () => {
      this.#messageHandlers.delete(handler);
    };
  }
  onProtocolError(handler) {
    if (this.#isClosed) {
      return () => {
      };
    }
    this.#protocolErrorHandlers.add(handler);
    return () => {
      this.#protocolErrorHandlers.delete(handler);
    };
  }
  onCapacityChange(listener) {
    if (this.#isClosed) {
      this.#notifyCapacityListener(listener, this.#capacityState());
      return () => {
      };
    }
    this.#capacityListeners.add(listener);
    this.#notifyCapacityListener(listener, this.#capacityState());
    return () => {
      this.#capacityListeners.delete(listener);
    };
  }
  drain() {
    if (this.#pendingMessages() === 0) {
      return Promise.resolve();
    }
    const deferred = createDeferred();
    this.#drainWaiters.add(deferred);
    return deferred.promise;
  }
  sealData(reason) {
    if (this.#dataSealed) {
      return;
    }
    this.#dataSealed = true;
    this.#dataSealError = channelClosedError(
      "process transport data lane is sealed",
      reason,
      { lane: PROCESS_TRANSPORT_LANE.DATA }
    );
    this.#rejectQueued(this.#data, this.#dataSealError);
    this.#pump();
    this.#settleLifecycleWaiters();
  }
  close(reason) {
    this.#beginClose(
      channelClosedError("process transport is closed", reason)
    );
    return this.closed;
  }
  stats() {
    const queuedMessages = this.#control.queue.length + this.#data.queue.length;
    const queuedBytes = this.#control.queue.reduce(
      (total, pending) => total + pending.byteLength,
      0
    ) + this.#data.queue.reduce(
      (total, pending) => total + pending.byteLength,
      0
    );
    return Object.freeze({
      closed: this.#isClosed,
      dataSealed: this.#dataSealed,
      pendingMessages: this.#pendingMessages(),
      pendingBytes: this.#control.pendingBytes + this.#data.pendingBytes,
      queuedMessages,
      queuedBytes,
      inFlightMessages: this.#inFlight === void 0 ? 0 : 1,
      inFlightBytes: this.#inFlight?.byteLength ?? 0,
      inFlightLane: this.#inFlight?.lane ?? null,
      backpressured: this.#inFlight?.backpressured ?? false,
      controlPendingMessages: this.#control.pendingMessages,
      controlPendingBytes: this.#control.pendingBytes,
      dataPendingMessages: this.#data.pendingMessages,
      dataPendingBytes: this.#data.pendingBytes,
      dataPressured: this.#dataPressured,
      dataMaxMessages: this.#data.maxMessages,
      dataMaxBytes: this.#data.maxBytes,
      dataHighWaterMessages: this.#dataWatermarks.highMessages,
      dataHighWaterBytes: this.#dataWatermarks.highBytes,
      dataLowWaterMessages: this.#dataWatermarks.lowMessages,
      dataLowWaterBytes: this.#dataWatermarks.lowBytes,
      acceptedMessages: this.#acceptedMessages,
      rejectedMessages: this.#rejectedMessages,
      sentMessages: this.#sentMessages,
      sentBytes: this.#sentBytes,
      failedMessages: this.#failedMessages,
      receivedMessages: this.#receivedMessages,
      receivedBytes: this.#receivedBytes,
      protocolErrorCount: this.#protocolErrorCount,
      handlerErrorCount: this.#handlerErrorCount,
      backpressureCount: this.#backpressureCount
    });
  }
  #handleRawMessage = (rawMessage) => {
    if (this.#isClosed) {
      return;
    }
    let decoded;
    try {
      decoded = this.#endpoint.ownsReceivedMessages === true ? this.#codec.decodeOwned(rawMessage) : this.#codec.decode(rawMessage);
    } catch (error) {
      this.#protocolErrorCount += 1;
      for (const handler of [...this.#protocolErrorHandlers]) {
        try {
          handler(error, rawMessage);
        } catch {
        }
      }
      return;
    }
    this.#receivedMessages += 1;
    this.#receivedBytes += decoded.byteLength;
    for (const handler of [...this.#messageHandlers]) {
      try {
        const result = handler(decoded.envelope);
        if (result !== void 0) {
          void Promise.resolve(result).catch(() => {
            this.#handlerErrorCount += 1;
          });
        }
      } catch {
        this.#handlerErrorCount += 1;
      }
    }
  };
  #stateFor(lane) {
    return lane === PROCESS_TRANSPORT_LANE.CONTROL ? this.#control : this.#data;
  }
  #pump() {
    if (this.#isClosed || this.#inFlight !== void 0) {
      return;
    }
    if (!this.#endpoint.connected) {
      this.#beginClose(
        channelClosedError("raw IPC endpoint disconnected before send")
      );
      return;
    }
    const pending = this.#takeNextPending();
    if (pending === void 0) {
      this.#settleLifecycleWaiters();
      return;
    }
    this.#inFlight = pending;
    let operation;
    try {
      operation = this.#endpoint.startSend(pending.envelope);
    } catch (error) {
      this.#finishFailedSend(pending, error);
      return;
    }
    pending.backpressured = operation.backpressured;
    if (operation.backpressured) {
      this.#backpressureCount += 1;
    }
    this.#updateDataPressure();
    void Promise.resolve(operation.completed).then(
      () => this.#finishSuccessfulSend(pending),
      (error) => this.#finishFailedSend(pending, error)
    );
  }
  #takeNextPending() {
    const ordinaryControlIndex = this.#control.queue.findIndex(
      (pending) => pending.dataFence === void 0
    );
    if (ordinaryControlIndex >= 0) {
      return this.#control.queue.splice(ordinaryControlIndex, 1)[0];
    }
    const fencedControlIndex = this.#control.queue.findIndex(
      (pending) => pending.dataFence !== void 0 && !this.#hasPendingDataAtOrBefore(pending.dataFence)
    );
    if (fencedControlIndex >= 0) {
      return this.#control.queue.splice(fencedControlIndex, 1)[0];
    }
    return this.#data.queue.shift();
  }
  #hasPendingDataAtOrBefore(fence) {
    if (this.#inFlight?.lane === PROCESS_TRANSPORT_LANE.DATA && this.#inFlight.dataSequence !== void 0 && this.#inFlight.dataSequence <= fence) {
      return true;
    }
    const queued = this.#data.queue[0];
    return queued?.dataSequence !== void 0 && queued.dataSequence <= fence;
  }
  #finishSuccessfulSend(pending) {
    if (this.#inFlight !== pending) {
      return;
    }
    this.#inFlight = void 0;
    this.#releaseCapacity(pending);
    this.#sentMessages += 1;
    this.#sentBytes += pending.byteLength;
    pending.deferred.resolve();
    this.#updateDataPressure();
    this.#pump();
    this.#settleLifecycleWaiters();
  }
  #finishFailedSend(pending, cause) {
    if (this.#inFlight !== pending) {
      return;
    }
    this.#inFlight = void 0;
    this.#releaseCapacity(pending);
    this.#failedMessages += 1;
    const error = channelClosedError(
      "raw IPC send failed",
      cause,
      { lane: pending.lane }
    );
    pending.deferred.reject(error);
    this.#updateDataPressure();
    this.#beginClose(error);
    this.#settleLifecycleWaiters();
  }
  #releaseCapacity(pending) {
    const state = this.#stateFor(pending.lane);
    state.pendingMessages -= 1;
    state.pendingBytes -= pending.byteLength;
  }
  #rejectQueued(state, error) {
    for (const pending of state.queue.splice(0)) {
      state.pendingMessages -= 1;
      state.pendingBytes -= pending.byteLength;
      this.#rejectedMessages += 1;
      pending.deferred.reject(error);
    }
    this.#updateDataPressure();
  }
  #beginClose(error) {
    if (this.#isClosed) {
      return;
    }
    this.#isClosed = true;
    this.#dataSealed = true;
    this.#closeError = error;
    this.#dataSealError ??= error;
    try {
      this.#disposeRawMessage();
    } catch {
    }
    this.#disposeRawMessage = () => {
    };
    const inFlight = this.#inFlight;
    if (inFlight !== void 0) {
      this.#inFlight = void 0;
      this.#releaseCapacity(inFlight);
      this.#rejectedMessages += 1;
      inFlight.deferred.reject(error);
    }
    this.#messageHandlers.clear();
    this.#protocolErrorHandlers.clear();
    this.#rejectQueued(this.#control, error);
    this.#rejectQueued(this.#data, error);
    this.#capacityListeners.clear();
    this.#dataPressured = false;
    this.#settleLifecycleWaiters();
  }
  #capacityState() {
    return Object.freeze({
      pressured: this.#dataPressured,
      nativeBackpressured: this.#inFlight?.backpressured ?? false,
      dataPendingMessages: this.#data.pendingMessages,
      dataPendingBytes: this.#data.pendingBytes,
      dataMaxMessages: this.#data.maxMessages,
      dataMaxBytes: this.#data.maxBytes,
      dataHighWaterMessages: this.#dataWatermarks.highMessages,
      dataHighWaterBytes: this.#dataWatermarks.highBytes,
      dataLowWaterMessages: this.#dataWatermarks.lowMessages,
      dataLowWaterBytes: this.#dataWatermarks.lowBytes
    });
  }
  #updateDataPressure() {
    const nativeBackpressured = this.#inFlight?.backpressured ?? false;
    const atHighWater = this.#data.pendingMessages >= this.#dataWatermarks.highMessages || this.#data.pendingBytes >= this.#dataWatermarks.highBytes;
    const atOrBelowLowWater = this.#data.pendingMessages <= this.#dataWatermarks.lowMessages && this.#data.pendingBytes <= this.#dataWatermarks.lowBytes;
    const nextPressured = this.#dataPressured ? nativeBackpressured || atHighWater || !atOrBelowLowWater : nativeBackpressured || atHighWater;
    if (nextPressured === this.#dataPressured) {
      return;
    }
    this.#dataPressured = nextPressured;
    const state = this.#capacityState();
    for (const listener of [...this.#capacityListeners]) {
      this.#notifyCapacityListener(listener, state);
    }
  }
  #notifyCapacityListener(listener, state) {
    try {
      listener(state);
    } catch {
      this.#handlerErrorCount += 1;
    }
  }
  #pendingMessages() {
    return this.#control.pendingMessages + this.#data.pendingMessages;
  }
  #settleLifecycleWaiters() {
    if (this.#pendingMessages() !== 0) {
      return;
    }
    for (const waiter of this.#drainWaiters) {
      waiter.resolve();
    }
    this.#drainWaiters.clear();
    if (this.#isClosed) {
      this.#closedDeferred.resolve();
    }
  }
};

// src/runtime/clock.ts
import { AsyncLocalStorage } from "node:async_hooks";
var MIN_TIMER_DELAY_MS = 1;
var MAX_TIMER_DELAY_MS = 2147483647;
function assertTimerDelay(delayMs, name = "delayMs") {
  if (!Number.isSafeInteger(delayMs) || delayMs < MIN_TIMER_DELAY_MS || delayMs > MAX_TIMER_DELAY_MS) {
    throw new RangeError(
      `${name} must be a safe integer in [${MIN_TIMER_DELAY_MS}, ${MAX_TIMER_DELAY_MS}], got ${delayMs}`
    );
  }
}
var SystemClock = class {
  wallTimeMs() {
    return Date.now();
  }
  monotonicTimeMs() {
    return performance.now();
  }
};
var SystemRuntimeTimer = class {
  done;
  #clock;
  #callback;
  #intervalMs;
  #onCallbackError;
  #onSettled;
  #resolveDone;
  #rejectDone;
  #active = true;
  #running = false;
  #settled = false;
  #dueTimeMs;
  #handle;
  constructor(clock, delayMs, intervalMs, callback, onCallbackError, onSettled) {
    this.#clock = clock;
    this.#callback = callback;
    this.#intervalMs = intervalMs;
    this.#onCallbackError = onCallbackError;
    this.#onSettled = onSettled;
    this.#dueTimeMs = clock.monotonicTimeMs() + delayMs;
    let resolveDone;
    let rejectDone;
    this.done = new Promise((resolve4, reject) => {
      resolveDone = resolve4;
      rejectDone = reject;
    });
    this.#resolveDone = resolveDone;
    this.#rejectDone = rejectDone;
    void this.done.catch(() => void 0);
  }
  get active() {
    return this.#active;
  }
  start() {
    this.#schedule();
  }
  cancel(reason) {
    void reason;
    if (!this.#active) {
      return false;
    }
    this.#active = false;
    this.#clearHandle();
    if (!this.#running) {
      this.#settleSuccess();
    }
    return true;
  }
  close(reason) {
    this.cancel(reason);
    return this.done;
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
  #schedule() {
    if (!this.#active || this.#settled) {
      return;
    }
    const remainingMs = this.#dueTimeMs - this.#clock.monotonicTimeMs();
    const nativeDelayMs = Math.min(
      MAX_TIMER_DELAY_MS,
      Math.max(MIN_TIMER_DELAY_MS, Math.ceil(remainingMs))
    );
    this.#handle = globalThis.setTimeout(() => this.#onNativeTimeout(), nativeDelayMs);
  }
  #onNativeTimeout() {
    this.#handle = void 0;
    if (!this.#active || this.#settled) {
      return;
    }
    if (this.#clock.monotonicTimeMs() < this.#dueTimeMs) {
      this.#schedule();
      return;
    }
    this.#running = true;
    let result;
    try {
      result = this.#callback();
    } catch (error) {
      this.#finishFailure(error);
      return;
    }
    void Promise.resolve(result).then(
      () => this.#finishSuccess(),
      (error) => this.#finishFailure(error)
    );
  }
  #finishSuccess() {
    this.#running = false;
    if (!this.#active) {
      this.#settleSuccess();
      return;
    }
    if (this.#intervalMs === null) {
      this.#active = false;
      this.#settleSuccess();
      return;
    }
    const now = this.#clock.monotonicTimeMs();
    const elapsedIntervals = Math.floor(Math.max(0, now - this.#dueTimeMs) / this.#intervalMs);
    this.#dueTimeMs += (elapsedIntervals + 1) * this.#intervalMs;
    this.#schedule();
  }
  #finishFailure(error) {
    this.#running = false;
    this.#active = false;
    this.#clearHandle();
    try {
      this.#onCallbackError(error);
    } catch {
    }
    this.#settleFailure(error);
  }
  #clearHandle() {
    if (this.#handle !== void 0) {
      globalThis.clearTimeout(this.#handle);
      this.#handle = void 0;
    }
  }
  #settleSuccess() {
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    this.#active = false;
    this.#clearHandle();
    this.#onSettled();
    this.#resolveDone();
  }
  #settleFailure(error) {
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    this.#active = false;
    this.#clearHandle();
    this.#onSettled();
    this.#rejectDone(error);
  }
};
function createCallbackCloseSignal() {
  let declare;
  const declared = new Promise((resolve4) => {
    declare = resolve4;
  });
  return { declared, declare };
}
var activeSystemTimer = new AsyncLocalStorage();
var SystemTimerScheduler = class {
  #clock;
  #onCallbackError;
  #timers = /* @__PURE__ */ new Set();
  #callbackCloseSignals = /* @__PURE__ */ new WeakMap();
  #reentrantClosePromises = /* @__PURE__ */ new WeakMap();
  #state = "open";
  #closingTimers;
  #closePromise;
  constructor(options) {
    this.#clock = options.clock ?? new SystemClock();
    this.#onCallbackError = options.onCallbackError;
  }
  get size() {
    return this.#timers.size;
  }
  get closed() {
    return this.#state === "closed";
  }
  setTimeout(delayMs, callback) {
    assertTimerDelay(delayMs);
    return this.#createTimer(delayMs, null, callback);
  }
  setInterval(intervalMs, callback) {
    assertTimerDelay(intervalMs, "intervalMs");
    return this.#createTimer(intervalMs, intervalMs, callback);
  }
  cancelAll(reason) {
    let cancelled = 0;
    for (const timer of [...this.#timers]) {
      if (timer.cancel(reason)) {
        cancelled += 1;
      }
    }
    return cancelled;
  }
  close(reason) {
    if (this.#hasActiveCallback()) {
      this.closeGlobally(reason);
      const callbackClose = this.joinCloseFromCallback();
      if (callbackClose !== void 0) {
        return callbackClose;
      }
    }
    return this.closeGlobally(reason);
  }
  closeGlobally(reason) {
    return this.#beginClose(reason);
  }
  joinCloseFromCallback() {
    const callingTimer = activeSystemTimer.getStore();
    if (callingTimer === void 0 || !this.#timers.has(callingTimer) && this.#closingTimers?.includes(callingTimer) !== true) {
      return void 0;
    }
    this.#callbackCloseSignal(callingTimer).declare();
    const existing = this.#reentrantClosePromises.get(callingTimer);
    if (existing !== void 0) {
      return existing;
    }
    const closingTimers = this.#closingTimers;
    if (closingTimers === void 0) {
      const joined = Promise.resolve();
      this.#reentrantClosePromises.set(callingTimer, joined);
      return joined;
    }
    const closeWithoutReentrantCallbacks = this.#waitForTimersUnlessReentrant(
      closingTimers.filter((timer) => timer !== callingTimer)
    );
    this.#reentrantClosePromises.set(callingTimer, closeWithoutReentrantCallbacks);
    return closeWithoutReentrantCallbacks;
  }
  [Symbol.asyncDispose]() {
    return this.closeGlobally();
  }
  #beginClose(reason) {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#state = "closing";
    const timers = [...this.#timers];
    this.#closingTimers = timers;
    for (const timer of timers) {
      this.#callbackCloseSignal(timer);
      timer.cancel(reason);
    }
    const closePromise = this.#finishClose(timers);
    this.#closePromise = closePromise;
    void closePromise.catch(() => void 0);
    return closePromise;
  }
  #hasActiveCallback() {
    const callingTimer = activeSystemTimer.getStore();
    return callingTimer !== void 0 && (this.#timers.has(callingTimer) || this.#closingTimers?.includes(callingTimer) === true);
  }
  #assertOpen() {
    if (this.#state !== "open") {
      throw new Error(`timer scheduler is ${this.#state}`);
    }
  }
  #createTimer(delayMs, intervalMs, callback) {
    this.#assertOpen();
    let timer;
    timer = new SystemRuntimeTimer(
      this.#clock,
      delayMs,
      intervalMs,
      () => activeSystemTimer.run(timer, callback),
      this.#onCallbackError,
      () => {
        this.#timers.delete(timer);
      }
    );
    this.#timers.add(timer);
    timer.start();
    return timer;
  }
  async #finishClose(timers) {
    try {
      await this.#waitForTimers(timers);
    } finally {
      this.#timers.clear();
      this.#state = "closed";
      this.#closingTimers = void 0;
    }
  }
  #callbackCloseSignal(timer) {
    const existing = this.#callbackCloseSignals.get(timer);
    if (existing !== void 0) {
      return existing;
    }
    const signal = createCallbackCloseSignal();
    this.#callbackCloseSignals.set(timer, signal);
    return signal;
  }
  async #waitForTimersUnlessReentrant(timers) {
    const results = await Promise.all(timers.map((timer) => {
      const callbackClose = this.#callbackCloseSignal(timer).declared.then(
        () => void 0
      );
      const settled = timer.done.then(
        () => ({ status: "fulfilled", value: void 0 }),
        (reason) => ({ status: "rejected", reason })
      );
      return Promise.race([callbackClose, settled]);
    }));
    const failures = results.flatMap(
      (result) => result?.status === "rejected" ? [result.reason] : []
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "timer scheduler callbacks failed during close");
    }
  }
  async #waitForTimers(timers) {
    const results = await Promise.allSettled(timers.map((timer) => timer.done));
    const failures = results.flatMap(
      (result) => result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "timer scheduler callbacks failed during close");
    }
  }
};

// src/dispatch/network-buffer-protocol.ts
var NETWORK_BUFFER_PROTOCOL_VERSION = 1;
var NETWORK_BUFFER_STATE = Object.freeze({
  FULL: "full",
  OVERFLOW: "overflow",
  EMPTY: "empty"
});
var PAYLOAD_KEYS = Object.freeze([
  "version",
  "ownerWorkerId",
  "protocol",
  "state",
  "bufferedBytes"
]);
var PAYLOAD_KEY_SET = new Set(PAYLOAD_KEYS);
function requireExactRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("NET_BUFFER_STATE payload must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (prototype !== Object.prototype && prototype !== null || keys.length !== PAYLOAD_KEYS.length || keys.some((key) => typeof key !== "string" || !PAYLOAD_KEY_SET.has(key))) {
    throw new TypeError(
      `NET_BUFFER_STATE payload must contain exactly: ${PAYLOAD_KEYS.join(", ")}`
    );
  }
  for (const key of PAYLOAD_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`NET_BUFFER_STATE payload.${key} must be an enumerable data field`);
    }
  }
  return value;
}
function requireProtocol(value) {
  if (value !== "tcp" && value !== "websocket") {
    throw new TypeError("NET_BUFFER_STATE protocol must be tcp or websocket");
  }
  return value;
}
function requireState(value) {
  if (value !== NETWORK_BUFFER_STATE.FULL && value !== NETWORK_BUFFER_STATE.OVERFLOW && value !== NETWORK_BUFFER_STATE.EMPTY) {
    throw new TypeError("NET_BUFFER_STATE state is invalid");
  }
  return value;
}
function decodeNetworkBufferStatePayload(value) {
  const record = requireExactRecord(value);
  if (record.version !== NETWORK_BUFFER_PROTOCOL_VERSION) {
    throw new TypeError("NET_BUFFER_STATE payload has an unsupported version");
  }
  if (typeof record.bufferedBytes !== "number" || !Number.isSafeInteger(record.bufferedBytes) || record.bufferedBytes < 0) {
    throw new TypeError("NET_BUFFER_STATE bufferedBytes must be a non-negative safe integer");
  }
  return Object.freeze({
    version: NETWORK_BUFFER_PROTOCOL_VERSION,
    ownerWorkerId: createWorkerId(record.ownerWorkerId),
    protocol: requireProtocol(record.protocol),
    state: requireState(record.state),
    bufferedBytes: record.bufferedBytes
  });
}
function encodeNetworkBufferStatePayload(options) {
  return decodeNetworkBufferStatePayload({
    version: NETWORK_BUFFER_PROTOCOL_VERSION,
    ownerWorkerId: options.ownerWorkerId,
    protocol: options.protocol,
    state: options.state,
    bufferedBytes: options.bufferedBytes
  });
}

// src/network/websocket-protocol.ts
import { createHash } from "node:crypto";
var DEFAULT_WEB_SOCKET_MAX_HANDSHAKE_BYTES = 16 * 1024;
var DEFAULT_WEB_SOCKET_MAX_MESSAGE_BYTES = 960 * 1024;
var WEB_SOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var WEB_SOCKET_OPCODE = Object.freeze({
  CONTINUATION: 0,
  TEXT: 1,
  BINARY: 2,
  CLOSE: 8,
  PING: 9,
  PONG: 10
});
var WebSocketProtocolError = class extends Error {
  code;
  closeCode;
  details;
  constructor(code, message, closeCode, details = {}) {
    super(message);
    this.name = "WebSocketProtocolError";
    this.code = code;
    this.closeCode = closeCode;
    this.details = Object.freeze({ ...details });
  }
};
var EMPTY_BUFFER = Buffer.alloc(0);
var HEADER_TERMINATOR = Buffer.from("\r\n\r\n", "ascii");
var HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var INVALID_HTTP_FIELD_VALUE_CHARACTER = /[\x00-\x08\x0a-\x1f\x7f]/;
var INVALID_HTTP_REQUEST_TARGET_CHARACTER = /[\x00-\x20\x7f]/;
var strictTextDecoder = new TextDecoder("utf-8", { fatal: true });
function assertPositiveSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer, got ${value}`);
  }
}
function handshakeError(message) {
  return new WebSocketProtocolError("INVALID_HANDSHAKE", message, null);
}
function splitHeaderTokens(values) {
  return Object.freeze(
    values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter((value) => value.length !== 0)
  );
}
function requiredSingleHeader(headers, name) {
  const values = headers.get(name);
  if (values === void 0 || values.length !== 1 || values[0]?.trim() === "") {
    throw handshakeError(`WebSocket handshake requires exactly one ${name} header`);
  }
  return values[0].trim();
}
function isValidWebSocketKey(key) {
  if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    return false;
  }
  const decoded = Buffer.from(key, "base64");
  return decoded.byteLength === 16 && decoded.toString("base64") === key;
}
function parseHandshakeRequest(headerBytes) {
  const text = headerBytes.toString("latin1");
  if (text.includes("\0")) {
    throw handshakeError("WebSocket handshake contains a NUL byte");
  }
  const lines = text.slice(0, -4).split("\r\n");
  const requestLine = lines.shift();
  if (requestLine === void 0) {
    throw handshakeError("WebSocket handshake is missing the request line");
  }
  const requestParts = requestLine.split(" ");
  if (requestParts.length !== 3 || requestParts[0] !== "GET" || requestParts[1] === "" || INVALID_HTTP_REQUEST_TARGET_CHARACTER.test(requestParts[1]) || requestParts[2] !== "HTTP/1.1") {
    throw handshakeError("WebSocket handshake must use GET and HTTP/1.1");
  }
  const headerLists = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (line === "" || line.startsWith(" ") || line.startsWith("	")) {
      throw handshakeError("WebSocket handshake contains an invalid folded header");
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      throw handshakeError("WebSocket handshake contains a malformed header");
    }
    const name = line.slice(0, colon);
    if (!HTTP_TOKEN.test(name)) {
      throw handshakeError(`WebSocket handshake contains invalid header name ${name}`);
    }
    const normalizedName = name.toLowerCase();
    const rawValue = line.slice(colon + 1);
    if (INVALID_HTTP_FIELD_VALUE_CHARACTER.test(rawValue)) {
      throw handshakeError("WebSocket handshake contains an invalid header value");
    }
    const value = rawValue.trim();
    const values = headerLists.get(normalizedName);
    if (values === void 0) {
      headerLists.set(normalizedName, [value]);
    } else {
      values.push(value);
    }
  }
  requiredSingleHeader(headerLists, "host");
  const key = requiredSingleHeader(headerLists, "sec-websocket-key");
  if (!isValidWebSocketKey(key)) {
    throw handshakeError("Sec-WebSocket-Key must encode exactly 16 bytes");
  }
  const webSocketVersion = requiredSingleHeader(
    headerLists,
    "sec-websocket-version"
  );
  if (webSocketVersion !== "13") {
    throw new WebSocketProtocolError(
      "INVALID_HANDSHAKE",
      "Sec-WebSocket-Version must be 13",
      null,
      { httpStatus: 426, supportedVersion: "13", receivedVersion: webSocketVersion }
    );
  }
  const upgradeTokens = splitHeaderTokens(headerLists.get("upgrade") ?? []);
  if (!upgradeTokens.some((value) => value.toLowerCase() === "websocket")) {
    throw handshakeError("Upgrade header must contain websocket");
  }
  const connectionTokens = splitHeaderTokens(headerLists.get("connection") ?? []);
  if (!connectionTokens.some((value) => value.toLowerCase() === "upgrade")) {
    throw handshakeError("Connection header must contain Upgrade");
  }
  const protocols = splitHeaderTokens(
    headerLists.get("sec-websocket-protocol") ?? []
  );
  if (protocols.some((protocol) => !HTTP_TOKEN.test(protocol))) {
    throw handshakeError("Sec-WebSocket-Protocol contains an invalid token");
  }
  if (new Set(protocols).size !== protocols.length) {
    throw handshakeError("Sec-WebSocket-Protocol contains a duplicate token");
  }
  const extensions = splitHeaderTokens(
    headerLists.get("sec-websocket-extensions") ?? []
  );
  const headers = Object.freeze(Object.fromEntries(
    [...headerLists].map(([name, values]) => [name, values.join(", ")])
  ));
  return Object.freeze({
    method: "GET",
    target: requestParts[1],
    httpVersion: "1.1",
    headers,
    key,
    protocols,
    extensions
  });
}
var WebSocketHandshakeParser = class {
  maxHandshakeBytes;
  #buffer = EMPTY_BUFFER;
  #complete = false;
  constructor(options = {}) {
    this.maxHandshakeBytes = options.maxHandshakeBytes ?? DEFAULT_WEB_SOCKET_MAX_HANDSHAKE_BYTES;
    assertPositiveSafeInteger("maxHandshakeBytes", this.maxHandshakeBytes);
  }
  get bufferedBytes() {
    return this.#buffer.byteLength;
  }
  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("WebSocket handshake chunk must be a Uint8Array");
    }
    if (this.#complete) {
      throw new WebSocketProtocolError(
        "INVALID_HANDSHAKE",
        "WebSocket handshake has already completed",
        null
      );
    }
    if (chunk.byteLength !== 0) {
      this.#buffer = Buffer.concat([
        this.#buffer,
        Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      ]);
    }
    const terminatorOffset = this.#buffer.indexOf(HEADER_TERMINATOR);
    if (terminatorOffset === -1) {
      if (this.#buffer.byteLength > this.maxHandshakeBytes) {
        const byteLength2 = this.#buffer.byteLength;
        this.#buffer = EMPTY_BUFFER;
        throw new WebSocketProtocolError(
          "HANDSHAKE_TOO_LARGE",
          `WebSocket handshake exceeds ${this.maxHandshakeBytes} bytes`,
          null,
          { byteLength: byteLength2, maxHandshakeBytes: this.maxHandshakeBytes }
        );
      }
      return null;
    }
    const consumedBytes = terminatorOffset + HEADER_TERMINATOR.byteLength;
    if (consumedBytes > this.maxHandshakeBytes) {
      this.#buffer = EMPTY_BUFFER;
      throw new WebSocketProtocolError(
        "HANDSHAKE_TOO_LARGE",
        `WebSocket handshake exceeds ${this.maxHandshakeBytes} bytes`,
        null,
        { byteLength: consumedBytes, maxHandshakeBytes: this.maxHandshakeBytes }
      );
    }
    const headerBytes = Buffer.from(this.#buffer.subarray(0, consumedBytes));
    const remainingData = Buffer.from(this.#buffer.subarray(consumedBytes));
    this.#buffer = EMPTY_BUFFER;
    const request = parseHandshakeRequest(headerBytes);
    this.#complete = true;
    return Object.freeze({ request, consumedBytes, remainingData });
  }
  reset() {
    this.#buffer = EMPTY_BUFFER;
    this.#complete = false;
  }
};
function createWebSocketAccept(key) {
  if (!isValidWebSocketKey(key)) {
    throw handshakeError("Sec-WebSocket-Key must encode exactly 16 bytes");
  }
  return createHash("sha1").update(key + WEB_SOCKET_GUID, "ascii").digest("base64");
}
function createWebSocketHandshakeResponse(request, options = {}) {
  const lines = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${createWebSocketAccept(request.key)}`
  ];
  if (options.selectedProtocol !== void 0) {
    if (!HTTP_TOKEN.test(options.selectedProtocol) || !request.protocols.includes(options.selectedProtocol)) {
      throw handshakeError("selected WebSocket protocol was not offered by the client");
    }
    lines.push(`Sec-WebSocket-Protocol: ${options.selectedProtocol}`);
  }
  lines.push("", "");
  return Buffer.from(lines.join("\r\n"), "ascii");
}
function protocolError(code, message, closeCode = 1002, details = {}) {
  return new WebSocketProtocolError(code, message, closeCode, details);
}
function isAllowedOpcode(opcode) {
  return opcode === WEB_SOCKET_OPCODE.CONTINUATION || opcode === WEB_SOCKET_OPCODE.TEXT || opcode === WEB_SOCKET_OPCODE.BINARY || opcode === WEB_SOCKET_OPCODE.CLOSE || opcode === WEB_SOCKET_OPCODE.PING || opcode === WEB_SOCKET_OPCODE.PONG;
}
function isControlOpcode(opcode) {
  return opcode >= WEB_SOCKET_OPCODE.CLOSE;
}
function decodeUtf8(value, context) {
  try {
    return strictTextDecoder.decode(value);
  } catch {
    throw protocolError(
      "INVALID_UTF8",
      `${context} contains invalid UTF-8`,
      1007
    );
  }
}
function isValidCloseCode(code) {
  return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
}
function parseClosePayload(payload) {
  if (payload.byteLength === 0) {
    return Object.freeze({ type: "close", code: null, reason: "" });
  }
  if (payload.byteLength === 1) {
    throw protocolError(
      "INVALID_CLOSE_PAYLOAD",
      "WebSocket close payload cannot contain exactly one byte"
    );
  }
  const code = payload.readUInt16BE(0);
  if (!isValidCloseCode(code)) {
    throw protocolError(
      "INVALID_CLOSE_PAYLOAD",
      `WebSocket close code ${code} is not valid on the wire`
    );
  }
  const reason = decodeUtf8(payload.subarray(2), "WebSocket close reason");
  return Object.freeze({ type: "close", code, reason });
}
function createMessageEvent(opcode, payload) {
  const data = opcode === WEB_SOCKET_OPCODE.TEXT ? decodeUtf8(payload, "WebSocket text message") : Buffer.from(payload);
  return Object.freeze({ type: "message", opcode, data, finish: true });
}
var WebSocketFrameParser = class {
  maxMessageBytes;
  #buffer = EMPTY_BUFFER;
  #fragmentOpcode = null;
  #fragmentParts = [];
  #fragmentBytes = 0;
  #closed = false;
  constructor(options = {}) {
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_WEB_SOCKET_MAX_MESSAGE_BYTES;
    assertPositiveSafeInteger("maxMessageBytes", this.maxMessageBytes);
  }
  get bufferedBytes() {
    return this.#buffer.byteLength + this.#fragmentBytes;
  }
  get closed() {
    return this.#closed;
  }
  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("WebSocket frame chunk must be a Uint8Array");
    }
    if (this.#closed) {
      if (chunk.byteLength === 0) {
        return Object.freeze([]);
      }
      throw protocolError(
        "CONNECTION_CLOSED",
        "WebSocket data arrived after a close frame or protocol error"
      );
    }
    if (chunk.byteLength === 0) {
      return Object.freeze([]);
    }
    this.#buffer = Buffer.concat([
      this.#buffer,
      Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    ]);
    try {
      return this.#parseFrames();
    } catch (error) {
      this.#buffer = EMPTY_BUFFER;
      this.#clearFragment();
      this.#closed = true;
      throw error;
    }
  }
  #parseFrames() {
    const events = [];
    let offset = 0;
    while (this.#buffer.byteLength - offset >= 2) {
      const first = this.#buffer[offset];
      const second = this.#buffer[offset + 1];
      const fin = (first & 128) !== 0;
      const rsv = first & 112;
      const opcodeValue = first & 15;
      const masked = (second & 128) !== 0;
      const lengthMarker = second & 127;
      if (rsv !== 0) {
        throw protocolError("INVALID_RSV", "WebSocket RSV bits require an extension");
      }
      if (!isAllowedOpcode(opcodeValue)) {
        throw protocolError(
          "INVALID_OPCODE",
          `WebSocket opcode ${opcodeValue} is reserved or unsupported`
        );
      }
      const opcode = opcodeValue;
      if (!masked) {
        throw protocolError(
          "UNMASKED_CLIENT_FRAME",
          "WebSocket client frames must be masked"
        );
      }
      if (isControlOpcode(opcode) && (!fin || lengthMarker > 125)) {
        throw protocolError(
          "INVALID_CONTROL_FRAME",
          "WebSocket control frames must be final and at most 125 bytes"
        );
      }
      let cursor = offset + 2;
      let payloadLength = lengthMarker;
      if (lengthMarker === 126) {
        if (this.#buffer.byteLength - cursor < 2) {
          break;
        }
        payloadLength = this.#buffer.readUInt16BE(cursor);
        cursor += 2;
        if (payloadLength < 126) {
          throw protocolError(
            "INVALID_PAYLOAD_LENGTH",
            "WebSocket payload length uses a non-minimal 16-bit encoding"
          );
        }
      } else if (lengthMarker === 127) {
        if (this.#buffer.byteLength - cursor < 8) {
          break;
        }
        const payloadLengthBigInt = this.#buffer.readBigUInt64BE(cursor);
        cursor += 8;
        if ((payloadLengthBigInt & 1n << 63n) !== 0n) {
          throw protocolError(
            "INVALID_PAYLOAD_LENGTH",
            "WebSocket 64-bit payload length must have its high bit cleared"
          );
        }
        if (payloadLengthBigInt < 65536n) {
          throw protocolError(
            "INVALID_PAYLOAD_LENGTH",
            "WebSocket payload length uses a non-minimal 64-bit encoding"
          );
        }
        if (payloadLengthBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw protocolError(
            "INVALID_PAYLOAD_LENGTH",
            "WebSocket payload length exceeds the safe integer range"
          );
        }
        payloadLength = Number(payloadLengthBigInt);
      }
      this.#validateDataFrame(opcode, payloadLength);
      const frameBytes = cursor - offset + 4 + payloadLength;
      if (this.#buffer.byteLength - offset < frameBytes) {
        break;
      }
      const maskOffset = cursor;
      const payloadOffset = maskOffset + 4;
      const payload = Buffer.allocUnsafe(payloadLength);
      for (let index = 0; index < payloadLength; index += 1) {
        payload[index] = this.#buffer[payloadOffset + index] ^ this.#buffer[maskOffset + (index & 3)];
      }
      offset += frameBytes;
      const event = this.#consumeFrame(opcode, fin, payload);
      if (event !== null) {
        events.push(event);
      }
      if (opcode === WEB_SOCKET_OPCODE.CLOSE) {
        this.#closed = true;
        offset = this.#buffer.byteLength;
        break;
      }
    }
    if (offset !== 0) {
      this.#buffer = offset === this.#buffer.byteLength ? EMPTY_BUFFER : Buffer.from(this.#buffer.subarray(offset));
    }
    return Object.freeze(events);
  }
  #validateDataFrame(opcode, payloadLength) {
    if (opcode === WEB_SOCKET_OPCODE.CONTINUATION) {
      if (this.#fragmentOpcode === null) {
        throw protocolError(
          "INVALID_FRAGMENTATION",
          "WebSocket continuation frame has no open fragmented message"
        );
      }
      if (this.#fragmentBytes + payloadLength > this.maxMessageBytes) {
        throw protocolError(
          "MESSAGE_TOO_LARGE",
          `WebSocket message exceeds ${this.maxMessageBytes} bytes`,
          1009
        );
      }
      return;
    }
    if (opcode === WEB_SOCKET_OPCODE.TEXT || opcode === WEB_SOCKET_OPCODE.BINARY) {
      if (this.#fragmentOpcode !== null) {
        throw protocolError(
          "INVALID_FRAGMENTATION",
          "WebSocket data frame arrived before the fragmented message completed"
        );
      }
      if (payloadLength > this.maxMessageBytes) {
        throw protocolError(
          "MESSAGE_TOO_LARGE",
          `WebSocket message exceeds ${this.maxMessageBytes} bytes`,
          1009
        );
      }
    }
  }
  #consumeFrame(opcode, fin, payload) {
    if (opcode === WEB_SOCKET_OPCODE.PING) {
      return Object.freeze({ type: "ping", data: Buffer.from(payload) });
    }
    if (opcode === WEB_SOCKET_OPCODE.PONG) {
      return Object.freeze({ type: "pong", data: Buffer.from(payload) });
    }
    if (opcode === WEB_SOCKET_OPCODE.CLOSE) {
      this.#clearFragment();
      return parseClosePayload(payload);
    }
    if (opcode === WEB_SOCKET_OPCODE.CONTINUATION) {
      this.#fragmentParts.push(payload);
      this.#fragmentBytes += payload.byteLength;
      if (!fin) {
        return null;
      }
      const fragmentOpcode = this.#fragmentOpcode;
      const message = Buffer.concat(this.#fragmentParts, this.#fragmentBytes);
      this.#clearFragment();
      return createMessageEvent(fragmentOpcode, message);
    }
    if (fin) {
      return createMessageEvent(opcode, payload);
    }
    this.#fragmentOpcode = opcode;
    this.#fragmentParts = [payload];
    this.#fragmentBytes = payload.byteLength;
    return null;
  }
  #clearFragment() {
    this.#fragmentOpcode = null;
    this.#fragmentParts = [];
    this.#fragmentBytes = 0;
  }
  reset() {
    this.#buffer = EMPTY_BUFFER;
    this.#clearFragment();
    this.#closed = false;
  }
};
function payloadBuffer(data) {
  if (data === void 0) {
    return EMPTY_BUFFER;
  }
  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }
  if (!(data instanceof Uint8Array)) {
    throw new TypeError("WebSocket frame data must be a string or Uint8Array");
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}
function validateEncodedPayload(opcode, fin, payload) {
  if (isControlOpcode(opcode)) {
    if (!fin || payload.byteLength > 125) {
      throw protocolError(
        "INVALID_CONTROL_FRAME",
        "WebSocket control frames must be final and at most 125 bytes"
      );
    }
    if (opcode === WEB_SOCKET_OPCODE.CLOSE) {
      parseClosePayload(payload);
    }
  }
  if (opcode === WEB_SOCKET_OPCODE.TEXT && fin) {
    decodeUtf8(payload, "WebSocket text frame");
  }
}
function encodeWebSocketFrame(options) {
  if (!isAllowedOpcode(options.opcode)) {
    throw protocolError(
      "INVALID_OPCODE",
      `WebSocket opcode ${String(options.opcode)} is reserved or unsupported`
    );
  }
  const payload = payloadBuffer(options.data);
  const fin = options.fin ?? true;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_WEB_SOCKET_MAX_MESSAGE_BYTES;
  assertPositiveSafeInteger("maxPayloadBytes", maxPayloadBytes);
  if (payload.byteLength > maxPayloadBytes) {
    throw protocolError(
      "MESSAGE_TOO_LARGE",
      `WebSocket payload exceeds ${maxPayloadBytes} bytes`,
      1009
    );
  }
  validateEncodedPayload(options.opcode, fin, payload);
  let headerBytes = 2;
  if (payload.byteLength > 125 && payload.byteLength <= 65535) {
    headerBytes += 2;
  } else if (payload.byteLength > 65535) {
    headerBytes += 8;
  }
  const frame = Buffer.allocUnsafe(headerBytes + payload.byteLength);
  frame[0] = (fin ? 128 : 0) | options.opcode;
  if (payload.byteLength <= 125) {
    frame[1] = payload.byteLength;
  } else if (payload.byteLength <= 65535) {
    frame[1] = 126;
    frame.writeUInt16BE(payload.byteLength, 2);
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payload.byteLength), 2);
  }
  frame.set(payload, headerBytes);
  return frame;
}
function encodeWebSocketCloseFrame(code = 1e3, reason = "") {
  if (!isValidCloseCode(code)) {
    throw protocolError(
      "INVALID_CLOSE_PAYLOAD",
      `WebSocket close code ${code} is not valid on the wire`
    );
  }
  const reasonBytes = Buffer.from(reason, "utf8");
  if (reasonBytes.byteLength > 123) {
    throw protocolError(
      "INVALID_CONTROL_FRAME",
      "WebSocket close reason exceeds 123 bytes"
    );
  }
  const payload = Buffer.allocUnsafe(2 + reasonBytes.byteLength);
  payload.writeUInt16BE(code, 0);
  payload.set(reasonBytes, 2);
  return encodeWebSocketFrame({ opcode: WEB_SOCKET_OPCODE.CLOSE, data: payload });
}

// src/dispatch/network-event-protocol.ts
var NETWORK_EVENT_PROTOCOL_VERSION = 1;
var NETWORK_RESUME_PROTOCOL_VERSION = 2;
var NETWORK_MESSAGE_HEADER_BYTES = 4;
var NETWORK_PROTOCOL_CODE = Object.freeze({
  TCP: 0,
  WEBSOCKET: 1
});
var MAX_CLOSE_CAUSE_FIELDS = 16;
var MAX_CLOSE_CAUSE_STRING_LENGTH = 1024;
var strictTextDecoder2 = new TextDecoder("utf-8", { fatal: true });
var CONNECT_KEYS = Object.freeze([
  "version",
  "ownerWorkerId",
  "protocol",
  "connectedAt",
  "peerInfo",
  "request"
]);
var RESUME_KEYS = Object.freeze([
  "version",
  "ownerWorkerId",
  "protocol",
  "connectedAt",
  "lastActiveAt",
  "peerInfo",
  "request",
  "inputSequence",
  "outputBufferedBytes",
  "outputBufferState"
]);
var PEER_INFO_KEYS = Object.freeze([
  "remoteAddress",
  "remotePort",
  "localAddress",
  "localPort"
]);
var HANDSHAKE_REQUEST_KEYS = Object.freeze([
  "method",
  "target",
  "httpVersion",
  "headers",
  "key",
  "protocols",
  "extensions"
]);
var CLOSE_KEYS = Object.freeze([
  "version",
  "ownerWorkerId",
  "protocol",
  "inputSequence",
  "outputSequence",
  "cause"
]);
function isPlainObject2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function requireExactRecord2(value, keys, name) {
  if (!isPlainObject2(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new TypeError(`${name} must contain exactly: ${keys.join(", ")}`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name}.${key} must be an enumerable data field`);
    }
  }
  return value;
}
function requireWorkerId(value, name) {
  try {
    return createWorkerId(value);
  } catch {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}
function requireProtocol2(value, name) {
  if (value !== "tcp" && value !== "websocket") {
    throw new TypeError(`${name} must be tcp or websocket`);
  }
  return value;
}
function requireNonNegativeSequence(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
function requireFiniteTimestamp(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}
function requireNetworkBufferState(value) {
  if (value !== NETWORK_BUFFER_STATE.EMPTY && value !== NETWORK_BUFFER_STATE.FULL && value !== NETWORK_BUFFER_STATE.OVERFLOW) {
    throw new TypeError("NET_CONNECT resume outputBufferState is invalid");
  }
  return value;
}
function requirePort(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535) {
    throw new TypeError(`${name} must be an integer in [0, 65535]`);
  }
  return value;
}
function parsePeerInfo(value) {
  const record = requireExactRecord2(value, PEER_INFO_KEYS, "network peerInfo");
  if (typeof record.remoteAddress !== "string" || typeof record.localAddress !== "string") {
    throw new TypeError("network peerInfo addresses must be strings");
  }
  return Object.freeze({
    remoteAddress: record.remoteAddress,
    remotePort: requirePort(record.remotePort, "network peerInfo.remotePort"),
    localAddress: record.localAddress,
    localPort: requirePort(record.localPort, "network peerInfo.localPort")
  });
}
function parseStringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${name} must be an array of strings`);
  }
  return Object.freeze([...value]);
}
function parseHeaders(value) {
  if (!isPlainObject2(value)) {
    throw new TypeError("network request.headers must be a plain object");
  }
  const entries = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError("network request.headers cannot contain symbol keys");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new TypeError("network request.headers values must be enumerable strings");
    }
    entries.push([key, descriptor.value]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
function parseHandshakeRequest2(value) {
  const record = requireExactRecord2(
    value,
    HANDSHAKE_REQUEST_KEYS,
    "network WebSocket request"
  );
  if (record.method !== "GET" || typeof record.target !== "string" || record.target.length === 0 || record.httpVersion !== "1.1" || typeof record.key !== "string") {
    throw new TypeError("network WebSocket request contains invalid scalar fields");
  }
  return Object.freeze({
    method: "GET",
    target: record.target,
    httpVersion: "1.1",
    headers: parseHeaders(record.headers),
    key: record.key,
    protocols: parseStringArray(record.protocols, "network request.protocols"),
    extensions: parseStringArray(record.extensions, "network request.extensions")
  });
}
function parseConnectCommon(record) {
  const protocol = requireProtocol2(record.protocol, "NET_CONNECT protocol");
  const request = record.request === null ? null : parseHandshakeRequest2(record.request);
  if (protocol === "tcp" && request !== null || protocol === "websocket" && request === null) {
    throw new TypeError("NET_CONNECT request must match its protocol");
  }
  return Object.freeze({
    ownerWorkerId: requireWorkerId(record.ownerWorkerId, "NET_CONNECT ownerWorkerId"),
    protocol,
    connectedAt: requireFiniteTimestamp(record.connectedAt, "NET_CONNECT connectedAt"),
    peerInfo: parsePeerInfo(record.peerInfo),
    request
  });
}
function requirePayloadVersion(value) {
  if (!isPlainObject2(value)) {
    throw new TypeError("NET_CONNECT payload must be a plain object");
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "version");
  if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError("NET_CONNECT payload.version must be an enumerable data field");
  }
  return descriptor.value;
}
function decodeNetworkConnectPayload(value) {
  const version = requirePayloadVersion(value);
  if (version === NETWORK_EVENT_PROTOCOL_VERSION) {
    const record = requireExactRecord2(value, CONNECT_KEYS, "NET_CONNECT payload");
    return Object.freeze({
      version: NETWORK_EVENT_PROTOCOL_VERSION,
      ...parseConnectCommon(record)
    });
  }
  if (version === NETWORK_RESUME_PROTOCOL_VERSION) {
    const record = requireExactRecord2(value, RESUME_KEYS, "NET_CONNECT resume payload");
    const common = parseConnectCommon(record);
    const inputSequence = requireNonNegativeSequence(
      record.inputSequence,
      "NET_CONNECT resume inputSequence"
    );
    if (inputSequence >= Number.MAX_SAFE_INTEGER) {
      throw new TypeError(
        "NET_CONNECT resume inputSequence must leave room for the next event"
      );
    }
    return Object.freeze({
      version: NETWORK_RESUME_PROTOCOL_VERSION,
      ownerWorkerId: common.ownerWorkerId,
      protocol: common.protocol,
      connectedAt: common.connectedAt,
      lastActiveAt: requireFiniteTimestamp(
        record.lastActiveAt,
        "NET_CONNECT resume lastActiveAt"
      ),
      peerInfo: common.peerInfo,
      request: common.request,
      inputSequence,
      outputBufferedBytes: requireNonNegativeSequence(
        record.outputBufferedBytes,
        "NET_CONNECT resume outputBufferedBytes"
      ),
      outputBufferState: requireNetworkBufferState(record.outputBufferState)
    });
  }
  throw new TypeError("NET_CONNECT payload has an unsupported version");
}
function encodeNetworkConnectPayload(options) {
  return decodeNetworkConnectPayload({
    version: NETWORK_EVENT_PROTOCOL_VERSION,
    ownerWorkerId: options.ownerWorkerId,
    protocol: options.protocol,
    connectedAt: options.connectedAt,
    peerInfo: options.peerInfo,
    request: options.request ?? null
  });
}
function encodeNetworkResumePayload(options) {
  return decodeNetworkConnectPayload({
    version: NETWORK_RESUME_PROTOCOL_VERSION,
    ownerWorkerId: options.ownerWorkerId,
    protocol: options.protocol,
    connectedAt: options.connectedAt,
    lastActiveAt: options.lastActiveAt,
    peerInfo: options.peerInfo,
    request: options.request ?? null,
    inputSequence: options.inputSequence,
    outputBufferedBytes: options.outputBufferedBytes,
    outputBufferState: options.outputBufferState
  });
}
function isNetworkResumePayload(payload) {
  return payload.version === NETWORK_RESUME_PROTOCOL_VERSION;
}
function protocolCode(protocol) {
  return protocol === "tcp" ? NETWORK_PROTOCOL_CODE.TCP : NETWORK_PROTOCOL_CODE.WEBSOCKET;
}
function encodeNetworkMessagePayload(options) {
  if (options.finish !== true) {
    throw new TypeError("NET_MESSAGE finish must be true");
  }
  let opcode = 0;
  let data;
  if (options.protocol === "tcp") {
    if (options.opcode !== void 0 || typeof options.data === "string") {
      throw new TypeError("TCP NET_MESSAGE requires binary data and no opcode");
    }
    data = Buffer.from(options.data.buffer, options.data.byteOffset, options.data.byteLength);
  } else {
    if (options.opcode !== WEB_SOCKET_OPCODE.TEXT && options.opcode !== WEB_SOCKET_OPCODE.BINARY) {
      throw new TypeError("WebSocket NET_MESSAGE requires a text or binary opcode");
    }
    opcode = options.opcode;
    if (opcode === WEB_SOCKET_OPCODE.TEXT) {
      if (typeof options.data !== "string") {
        throw new TypeError("WebSocket text NET_MESSAGE requires string data");
      }
      data = Buffer.from(options.data, "utf8");
    } else {
      if (typeof options.data === "string") {
        throw new TypeError("WebSocket binary NET_MESSAGE requires Uint8Array data");
      }
      data = Buffer.from(options.data.buffer, options.data.byteOffset, options.data.byteLength);
    }
  }
  const payload = Buffer.allocUnsafe(NETWORK_MESSAGE_HEADER_BYTES + data.byteLength);
  payload[0] = NETWORK_EVENT_PROTOCOL_VERSION;
  payload[1] = protocolCode(options.protocol);
  payload[2] = opcode;
  payload[3] = 1;
  payload.set(data, NETWORK_MESSAGE_HEADER_BYTES);
  return payload;
}
function decodeNetworkMessagePayload(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < NETWORK_MESSAGE_HEADER_BYTES) {
    throw new TypeError("NET_MESSAGE payload must be a binary network event");
  }
  const payload = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (payload[0] !== NETWORK_EVENT_PROTOCOL_VERSION || payload[3] !== 1) {
    throw new TypeError("NET_MESSAGE payload has an invalid version or finish marker");
  }
  const data = Buffer.from(payload.subarray(NETWORK_MESSAGE_HEADER_BYTES));
  if (payload[1] === NETWORK_PROTOCOL_CODE.TCP) {
    if (payload[2] !== 0) {
      throw new TypeError("TCP NET_MESSAGE cannot carry a WebSocket opcode");
    }
    return Object.freeze({ protocol: "tcp", finish: true, data });
  }
  if (payload[1] !== NETWORK_PROTOCOL_CODE.WEBSOCKET) {
    throw new TypeError("NET_MESSAGE payload contains an unknown protocol code");
  }
  const opcode = payload[2];
  if (opcode === WEB_SOCKET_OPCODE.TEXT) {
    let text;
    try {
      text = strictTextDecoder2.decode(data);
    } catch {
      throw new TypeError("WebSocket NET_MESSAGE text contains invalid UTF-8");
    }
    return Object.freeze({ protocol: "websocket", opcode, finish: true, data: text });
  }
  if (opcode === WEB_SOCKET_OPCODE.BINARY) {
    return Object.freeze({ protocol: "websocket", opcode, finish: true, data });
  }
  throw new TypeError("WebSocket NET_MESSAGE contains an invalid data opcode");
}
function truncate(value) {
  return value.length <= MAX_CLOSE_CAUSE_STRING_LENGTH ? value : value.slice(0, MAX_CLOSE_CAUSE_STRING_LENGTH);
}
function safeString(value) {
  try {
    return truncate(String(value));
  } catch {
    return "<unprintable>";
  }
}
function safeReadString(read, fallback) {
  try {
    return safeString(read());
  } catch {
    return fallback;
  }
}
function summarizeNetworkCloseCause(cause) {
  if (cause === void 0 || cause === null) {
    return null;
  }
  if (cause instanceof Error) {
    return Object.freeze({
      kind: "error",
      errorName: safeReadString(() => cause.name, "Error"),
      errorMessage: safeReadString(() => cause.message, "<unreadable error message>")
    });
  }
  if (isPlainObject2(cause)) {
    const entries = [];
    for (const key of Object.keys(cause).slice(0, MAX_CLOSE_CAUSE_FIELDS)) {
      const descriptor = Object.getOwnPropertyDescriptor(cause, key);
      if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
        continue;
      }
      const value = descriptor.value;
      if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) {
        entries.push([key, value]);
      } else if (typeof value === "string") {
        entries.push([key, truncate(value)]);
      }
    }
    if (entries.length !== 0) {
      return Object.freeze(Object.fromEntries(entries));
    }
  }
  return Object.freeze({ kind: "value", value: safeString(cause) });
}
function parseCloseCause(value) {
  if (value === null) {
    return null;
  }
  if (!isPlainObject2(value)) {
    throw new TypeError("NET_CLOSE cause must be null or a plain object");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_CLOSE_CAUSE_FIELDS || keys.some((key) => typeof key !== "string")) {
    throw new TypeError("NET_CLOSE cause contains too many or invalid fields");
  }
  const entries = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError("NET_CLOSE cause fields must be enumerable data fields");
    }
    const field = descriptor.value;
    if (field !== null && typeof field !== "boolean" && typeof field !== "string" && !(typeof field === "number" && Number.isFinite(field))) {
      throw new TypeError("NET_CLOSE cause fields must be JSON scalars");
    }
    if (typeof field === "string" && field.length > MAX_CLOSE_CAUSE_STRING_LENGTH) {
      throw new TypeError("NET_CLOSE cause string exceeds its limit");
    }
    entries.push([key, field]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
function decodeNetworkClosePayload(value) {
  const record = requireExactRecord2(value, CLOSE_KEYS, "NET_CLOSE payload");
  if (record.version !== NETWORK_EVENT_PROTOCOL_VERSION) {
    throw new TypeError("NET_CLOSE payload has an unsupported version");
  }
  return Object.freeze({
    version: NETWORK_EVENT_PROTOCOL_VERSION,
    ownerWorkerId: requireWorkerId(record.ownerWorkerId, "NET_CLOSE ownerWorkerId"),
    protocol: requireProtocol2(record.protocol, "NET_CLOSE protocol"),
    inputSequence: requireNonNegativeSequence(record.inputSequence, "NET_CLOSE inputSequence"),
    outputSequence: requireNonNegativeSequence(record.outputSequence, "NET_CLOSE outputSequence"),
    cause: parseCloseCause(record.cause)
  });
}
function encodeNetworkClosePayload(options) {
  return decodeNetworkClosePayload({
    version: NETWORK_EVENT_PROTOCOL_VERSION,
    ownerWorkerId: options.ownerWorkerId,
    protocol: options.protocol,
    inputSequence: options.inputSequence,
    outputSequence: options.outputSequence,
    cause: summarizeNetworkCloseCause(options.cause)
  });
}

// src/dispatch/worker-dispatcher.ts
var DEFAULT_DISPATCH_SESSION_MAX_MESSAGES = 64;
var DEFAULT_DISPATCH_SESSION_HIGH_MESSAGES = 48;
var DEFAULT_DISPATCH_SESSION_LOW_MESSAGES = 32;
var DEFAULT_DISPATCH_SESSION_MAX_BYTES = 2 * 1024 * 1024;
var DEFAULT_DISPATCH_SESSION_HIGH_BYTES = 1536 * 1024;
var DEFAULT_DISPATCH_SESSION_LOW_BYTES = 1024 * 1024;
var DEFAULT_DISPATCH_RECOVERY_TIMEOUT_MS = 5e3;
var DISPATCH_ENVELOPE_OVERHEAD_BYTES = 512;
var textEncoder = new TextEncoder();
function createDeferred2() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  void promise.catch(() => void 0);
  return { promise, resolve: resolve4, reject };
}
function assertCapacity2(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function assertWatermarks(name, low, high, maximum) {
  assertCapacity2(`${name} low`, low);
  assertCapacity2(`${name} high`, high);
  assertCapacity2(`${name} max`, maximum);
  if (low > high || high > maximum) {
    throw new RangeError(`${name} watermarks must satisfy low <= high <= max`);
  }
}
function payloadByteLength(payload) {
  if (payload instanceof Uint8Array) {
    return payload.byteLength + DISPATCH_ENVELOPE_OVERHEAD_BYTES;
  }
  return textEncoder.encode(JSON.stringify(payload)).byteLength + DISPATCH_ENVELOPE_OVERHEAD_BYTES;
}
function isIpcQueueFull(error) {
  return error instanceof FrameworkError && error.code === FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL;
}
function dispatchMode2WorkerId(sessionId, workerNum) {
  if (!Number.isSafeInteger(workerNum) || workerNum < 1) {
    throw new RangeError(`workerNum must be a positive safe integer, got ${workerNum}`);
  }
  return createWorkerId(decodeSessionId(sessionId).slotIndex % workerNum);
}
var WorkerDispatcher = class {
  #bus;
  #connections;
  #workerNum;
  #timers;
  #metrics;
  #ownsTimers;
  #recoveryTimeoutMs;
  #sessionMaxMessages;
  #sessionMaxBytes;
  #sessionHighMessages;
  #sessionHighBytes;
  #sessionLowMessages;
  #sessionLowBytes;
  #workerMaxMessages;
  #workerMaxBytes;
  #workerHighMessages;
  #workerHighBytes;
  #workerLowMessages;
  #workerLowBytes;
  #externalMessageDelivery;
  #externalControlDelivery;
  #resolveWorkerGeneration;
  #synchronizeSession;
  #waitForSessionPaused;
  #onSessionReady;
  #states = /* @__PURE__ */ new Map();
  #workers = /* @__PURE__ */ new Map();
  #disposePeerUnavailable;
  #disposePeerCapacity;
  #closed = false;
  #pauseTransitions = 0;
  #resumeTransitions = 0;
  #recoveryTimeouts = 0;
  #queueRejections = 0;
  #deliveryErrors = 0;
  constructor(options) {
    if (options.bus.localIdentity.role !== PROCESS_ROLE.MASTER) {
      throw new TypeError("WorkerDispatcher requires a MASTER ProcessBus");
    }
    if (!Number.isSafeInteger(options.workerNum) || options.workerNum < 1) {
      throw new RangeError(
        `workerNum must be a positive safe integer, got ${options.workerNum}`
      );
    }
    this.#bus = options.bus;
    this.#connections = options.connections;
    this.#workerNum = options.workerNum;
    this.#ownsTimers = options.timers === void 0;
    this.#timers = options.timers ?? new SystemTimerScheduler({
      onCallbackError: () => void 0
    });
    this.#metrics = options.metrics;
    this.#externalMessageDelivery = options.externalMessageDelivery ?? false;
    this.#externalControlDelivery = options.externalControlDelivery;
    this.#resolveWorkerGeneration = options.resolveWorkerGeneration;
    this.#synchronizeSession = options.synchronizeSession;
    this.#waitForSessionPaused = options.waitForSessionPaused;
    this.#onSessionReady = options.onSessionReady;
    this.#recoveryTimeoutMs = options.recoveryTimeoutMs ?? DEFAULT_DISPATCH_RECOVERY_TIMEOUT_MS;
    assertTimerDelay(this.#recoveryTimeoutMs, "recoveryTimeoutMs");
    this.#sessionMaxMessages = options.sessionMaxMessages ?? DEFAULT_DISPATCH_SESSION_MAX_MESSAGES;
    this.#sessionMaxBytes = options.sessionMaxBytes ?? DEFAULT_DISPATCH_SESSION_MAX_BYTES;
    this.#sessionHighMessages = options.sessionHighMessages ?? Math.min(DEFAULT_DISPATCH_SESSION_HIGH_MESSAGES, this.#sessionMaxMessages);
    this.#sessionHighBytes = options.sessionHighBytes ?? Math.min(DEFAULT_DISPATCH_SESSION_HIGH_BYTES, this.#sessionMaxBytes);
    this.#sessionLowMessages = options.sessionLowMessages ?? Math.min(DEFAULT_DISPATCH_SESSION_LOW_MESSAGES, this.#sessionHighMessages);
    this.#sessionLowBytes = options.sessionLowBytes ?? Math.min(DEFAULT_DISPATCH_SESSION_LOW_BYTES, this.#sessionHighBytes);
    this.#workerMaxMessages = options.workerMaxMessages ?? DEFAULT_DATA_QUEUE_MAX_MESSAGES;
    this.#workerMaxBytes = options.workerMaxBytes ?? DEFAULT_DATA_QUEUE_MAX_BYTES;
    this.#workerHighMessages = options.workerHighMessages ?? Math.min(DEFAULT_DATA_QUEUE_HIGH_MESSAGES, this.#workerMaxMessages);
    this.#workerHighBytes = options.workerHighBytes ?? Math.min(DEFAULT_DATA_QUEUE_HIGH_BYTES, this.#workerMaxBytes);
    this.#workerLowMessages = options.workerLowMessages ?? Math.min(DEFAULT_DATA_QUEUE_LOW_MESSAGES, this.#workerHighMessages);
    this.#workerLowBytes = options.workerLowBytes ?? Math.min(DEFAULT_DATA_QUEUE_LOW_BYTES, this.#workerHighBytes);
    assertWatermarks(
      "session message",
      this.#sessionLowMessages,
      this.#sessionHighMessages,
      this.#sessionMaxMessages
    );
    assertWatermarks(
      "session byte",
      this.#sessionLowBytes,
      this.#sessionHighBytes,
      this.#sessionMaxBytes
    );
    assertWatermarks(
      "worker message",
      this.#workerLowMessages,
      this.#workerHighMessages,
      this.#workerMaxMessages
    );
    assertWatermarks(
      "worker byte",
      this.#workerLowBytes,
      this.#workerHighBytes,
      this.#workerMaxBytes
    );
    for (let index = 0; index < this.#workerNum; index += 1) {
      const workerId = createWorkerId(index);
      this.#workers.set(workerId, {
        workerId,
        quiescing: false,
        restoreExpected: false,
        peerAvailable: true,
        lifecycleEpoch: 0,
        peerPressured: false,
        backlogPressured: false,
        pendingMessages: 0,
        pendingBytes: 0
      });
    }
    this.#disposePeerUnavailable = options.bus.onPeerUnavailable((identity, error) => {
      if (this.#closed || identity.role !== PROCESS_ROLE.WORKER || identity.workerId === null) {
        return;
      }
      const worker = this.#workers.get(identity.workerId);
      if (worker !== void 0) {
        worker.peerAvailable = false;
      }
      const planned = worker?.quiescing === true;
      for (const [sessionId, state] of this.#states) {
        if (state.ownerWorkerId !== identity.workerId) {
          continue;
        }
        state.ownerAvailable = false;
        if (planned) {
          continue;
        }
        this.#skipQueued(state);
        const connection = this.#connections.get(sessionId);
        if (connection !== void 0) {
          this.#connections.beginClose(sessionId, error);
        }
        this.#finalizeIfIdle(sessionId, state);
      }
    });
    this.#disposePeerCapacity = options.bus.onPeerCapacityChange((capacity) => {
      const identity = capacity.identity;
      if (this.#closed || identity.role !== PROCESS_ROLE.WORKER || identity.workerId === null) {
        return;
      }
      const worker = this.#workers.get(identity.workerId);
      if (worker === void 0 || worker.peerPressured === capacity.pressured) {
        return;
      }
      worker.peerPressured = capacity.pressured;
      this.#reevaluateWorker(worker);
      if (!capacity.pressured) {
        this.#pumpWorker(worker.workerId);
      }
    });
  }
  handle(event) {
    if (this.#closed) {
      throw new Error("WorkerDispatcher is closed");
    }
    switch (event.type) {
      case "opened":
        return this.#handleOpened(event);
      case "message":
        return this.#handleMessage(event);
      case "buffer":
        return this.#handleBuffer(event);
      case "closed":
        return this.#handleClosed(event);
    }
  }
  async quiesceWorker(workerId, options = {}) {
    if (this.#closed) {
      throw new Error("WorkerDispatcher is closed");
    }
    const worker = this.#requireWorker(workerId);
    worker.quiescing = true;
    worker.restoreExpected = !options.preserveOwnerAvailability;
    if (options.preserveOwnerAvailability && worker.peerAvailable) {
      this.#enableQuiescedWorkerDelivery(workerId);
    }
    worker.lifecycleEpoch += 1;
    const lifecycleEpoch = worker.lifecycleEpoch;
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== workerId) {
        continue;
      }
      if (state.closing) {
        if (state.pendingMessages > 0) {
          this.#startRecoveryTimer(sessionId, state);
        }
      } else {
        this.#setPaused(sessionId, state, true);
      }
    }
    await this.#waitForWorkerIdle(
      workerId,
      lifecycleEpoch,
      !options.preserveOwnerAvailability
    );
    if (!options.preserveOwnerAvailability && this.#waitForSessionPaused !== void 0) {
      const waitForSessionPaused = this.#waitForSessionPaused;
      const sessions = [...this.#states.entries()].filter(
        ([, state]) => state.ownerWorkerId === workerId && !state.closing
      ).map(([sessionId]) => sessionId);
      await Promise.all(sessions.map((sessionId) => waitForSessionPaused(sessionId)));
      for (const sessionId of sessions) {
        const state = this.#states.get(sessionId);
        const record = this.#connections.get(sessionId);
        if (state !== void 0 && record !== void 0) {
          state.lastInputSequence = record.inputSequence;
        }
      }
    }
  }
  async restoreWorker(workerId) {
    if (this.#closed) {
      throw new Error("WorkerDispatcher is closed");
    }
    const worker = this.#requireWorker(workerId);
    if (!worker.quiescing) {
      return;
    }
    worker.peerAvailable = true;
    const lifecycleEpoch = worker.lifecycleEpoch;
    const sessions = [...this.#states.entries()].filter(([, state]) => state.ownerWorkerId === workerId).sort(([left], [right]) => left - right);
    try {
      for (const [sessionId, state] of sessions) {
        if (!worker.quiescing || worker.lifecycleEpoch !== lifecycleEpoch) {
          return;
        }
        if (this.#states.get(sessionId) !== state || state.closing || !state.connectDelivered) {
          continue;
        }
        const record = this.#connections.get(sessionId);
        if (record === void 0 || record.state !== CONNECTION_STATE.OPEN) {
          continue;
        }
        this.#synchronizeSession?.(sessionId);
        const synchronizedRecord = this.#connections.get(sessionId);
        if (synchronizedRecord === void 0 || synchronizedRecord.state !== CONNECTION_STATE.OPEN) {
          continue;
        }
        state.lastInputSequence = synchronizedRecord.inputSequence;
        const payload = encodeNetworkResumePayload({
          ownerWorkerId: workerId,
          protocol: state.protocol,
          connectedAt: synchronizedRecord.connectedAt,
          lastActiveAt: synchronizedRecord.lastActiveAt,
          peerInfo: synchronizedRecord.peerInfo,
          ...state.request === void 0 ? {} : { request: state.request },
          inputSequence: synchronizedRecord.inputSequence,
          outputBufferedBytes: synchronizedRecord.outputBufferedBytes,
          outputBufferState: synchronizedRecord.overflow ? NETWORK_BUFFER_STATE.OVERFLOW : synchronizedRecord.outputBufferFull ? NETWORK_BUFFER_STATE.FULL : NETWORK_BUFFER_STATE.EMPTY
        });
        state.ownerAvailable = true;
        await this.#admit(sessionId, state, {
          messageType: IPC_MESSAGE_TYPE.NET_CONNECT,
          targetRole: PROCESS_ROLE.WORKER,
          targetWorkerId: workerId,
          sessionId,
          sequence: createIpcSequence(synchronizedRecord.inputSequence),
          payload
        }, false, false, true);
      }
    } catch (error) {
      this.#failWorkerRestore(workerId, error);
      throw error;
    }
    if (!worker.quiescing || worker.lifecycleEpoch !== lifecycleEpoch) {
      return;
    }
    const restoreExpected = worker.restoreExpected;
    worker.quiescing = false;
    worker.restoreExpected = false;
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== workerId) {
        continue;
      }
      if (state.closing) {
        state.ownerAvailable = restoreExpected && state.pendingMessages > 0;
      } else {
        const record = this.#connections.get(sessionId);
        state.ownerAvailable = record?.state === CONNECTION_STATE.OPEN;
      }
    }
    this.#reevaluateWorker(worker);
    if (!this.#isWorkerPressured(workerId)) {
      this.#pumpWorker(workerId);
    }
  }
  cancelWorkerQuiesce(workerId) {
    if (this.#closed) {
      return;
    }
    const worker = this.#requireWorker(workerId);
    if (!worker.quiescing) {
      return;
    }
    worker.lifecycleEpoch += 1;
    worker.quiescing = false;
    worker.restoreExpected = false;
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== workerId) {
        continue;
      }
      if (state.closing) {
        this.#discardQueuedHydration(state);
        state.ownerAvailable = state.pendingMessages > 0;
      } else {
        const record = this.#connections.get(sessionId);
        state.ownerAvailable = record?.state === CONNECTION_STATE.OPEN;
      }
    }
    this.#reevaluateWorker(worker);
    if (!this.#isWorkerPressured(workerId)) {
      this.#pumpWorker(workerId);
    }
  }
  stats() {
    let pendingMessages = 0;
    let pendingBytes = 0;
    let pausedConnections = 0;
    for (const state of this.#states.values()) {
      pendingMessages += state.pendingMessages;
      pendingBytes += state.pendingBytes;
      if (state.paused) {
        pausedConnections += 1;
      }
    }
    return Object.freeze({
      closed: this.#closed,
      activeSessions: this.#states.size,
      pendingMessages,
      pendingBytes,
      pausedConnections,
      pressuredWorkers: [...this.#workers.values()].filter(
        (worker) => worker.peerPressured || worker.backlogPressured
      ).length,
      pauseTransitions: this.#pauseTransitions,
      resumeTransitions: this.#resumeTransitions,
      recoveryTimeouts: this.#recoveryTimeouts,
      queueRejections: this.#queueRejections,
      deliveryErrors: this.#deliveryErrors
    });
  }
  close(reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#disposePeerUnavailable();
    this.#disposePeerCapacity();
    for (const [sessionId, state] of this.#states) {
      state.ownerAvailable = false;
      this.#cancelRecoveryTimer(state, reason);
      this.#skipQueued(state);
      this.#finalizeIfIdle(sessionId, state);
    }
    if (this.#ownsTimers) {
      this.#timers.cancelAll(reason);
      void this.#timers.closeGlobally(reason).catch(() => void 0);
    }
  }
  #handleOpened(event) {
    if (this.#states.has(event.sessionId)) {
      throw new Error(`Connection ${event.sessionId} was already dispatched`);
    }
    const ownerWorkerId = dispatchMode2WorkerId(event.sessionId, this.#workerNum);
    const assigned = this.#connections.assignOwner(event.sessionId, ownerWorkerId);
    if (assigned === void 0) {
      throw new Error(`Connection ${event.sessionId} is unavailable for dispatch`);
    }
    const state = {
      ownerWorkerId,
      protocol: event.protocol,
      request: event.request,
      queue: [],
      lastInputSequence: 0,
      connectDelivered: false,
      ownerAvailable: !this.#requireWorker(ownerWorkerId).quiescing,
      closing: false,
      paused: false,
      backlogPressured: false,
      pendingMessages: 0,
      pendingBytes: 0,
      inFlight: void 0,
      recoveryTimer: void 0
    };
    this.#states.set(event.sessionId, state);
    if (!state.ownerAvailable) {
      this.#setPaused(event.sessionId, state, true);
    }
    const payload = encodeNetworkConnectPayload({
      ownerWorkerId,
      protocol: event.protocol,
      connectedAt: event.connectedAt,
      peerInfo: event.peerInfo,
      ...event.request === void 0 ? {} : { request: event.request }
    });
    return this.#admit(event.sessionId, state, {
      messageType: IPC_MESSAGE_TYPE.NET_CONNECT,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: ownerWorkerId,
      sessionId: event.sessionId,
      sequence: createIpcSequence(0),
      payload
    }, false, true);
  }
  #handleMessage(event) {
    const state = this.#requireOpenState(event.sessionId, event.protocol);
    const expectedSequence = state.lastInputSequence + 1;
    if (event.inputSequence !== expectedSequence) {
      throw new Error(
        `Connection ${event.sessionId} expected input sequence ${expectedSequence}, got ${event.inputSequence}`
      );
    }
    const payload = encodeNetworkMessagePayload({
      protocol: event.protocol,
      data: event.data,
      ...event.opcode === void 0 ? {} : { opcode: event.opcode },
      finish: event.finish
    });
    state.lastInputSequence = event.inputSequence;
    return this.#admit(event.sessionId, state, {
      messageType: IPC_MESSAGE_TYPE.NET_MESSAGE,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: state.ownerWorkerId,
      sessionId: event.sessionId,
      sequence: createIpcSequence(event.inputSequence),
      payload
    }, false);
  }
  #handleBuffer(event) {
    const state = this.#states.get(event.sessionId);
    if (state === void 0) {
      return Promise.resolve();
    }
    this.#assertProtocol(event.sessionId, state, event.protocol);
    if (state.closing || !state.ownerAvailable) {
      return Promise.resolve();
    }
    const record = this.#connections.get(event.sessionId);
    const bufferedBytes = record?.outputBufferedBytes ?? 0;
    const payload = encodeNetworkBufferStatePayload({
      ownerWorkerId: state.ownerWorkerId,
      protocol: event.protocol,
      state: event.state,
      bufferedBytes
    });
    return this.#admit(event.sessionId, state, {
      messageType: IPC_MESSAGE_TYPE.NET_BUFFER_STATE,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: state.ownerWorkerId,
      sessionId: event.sessionId,
      sequence: createIpcSequence(state.lastInputSequence),
      payload
    }, false);
  }
  #handleClosed(event) {
    if (event.ownerWorkerId === null) {
      if (this.#states.has(event.sessionId)) {
        throw new Error(
          `Connection ${event.sessionId} lost its owner before close dispatch`
        );
      }
      return Promise.resolve();
    }
    const state = this.#requireState(event.sessionId, event.protocol);
    if (event.ownerWorkerId !== state.ownerWorkerId) {
      throw new Error(
        `Connection ${event.sessionId} close owner ${event.ownerWorkerId} does not match ${state.ownerWorkerId}`
      );
    }
    if (this.#externalMessageDelivery && event.inputSequence >= state.lastInputSequence) {
      state.lastInputSequence = event.inputSequence;
    }
    if (event.inputSequence !== state.lastInputSequence) {
      throw new Error(
        `Connection ${event.sessionId} close input sequence ${event.inputSequence} does not match dispatched sequence ${state.lastInputSequence}`
      );
    }
    state.closing = true;
    this.#cancelRecoveryTimer(state, event.cause);
    if (event.inputSequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`Connection ${event.sessionId} event sequence is exhausted`);
    }
    const payload = encodeNetworkClosePayload({
      ownerWorkerId: state.ownerWorkerId,
      protocol: event.protocol,
      inputSequence: event.inputSequence,
      outputSequence: event.outputSequence,
      cause: event.cause
    });
    const closeOptions = {
      messageType: IPC_MESSAGE_TYPE.NET_CLOSE,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: state.ownerWorkerId,
      sessionId: event.sessionId,
      sequence: createIpcSequence(event.inputSequence + 1),
      payload
    };
    const worker = this.#requireWorker(state.ownerWorkerId);
    if (state.ownerAvailable) {
      const delivery = this.#admit(event.sessionId, state, closeOptions, true);
      if (worker.quiescing) {
        this.#startRecoveryTimer(event.sessionId, state);
      }
      return delivery;
    }
    if (!worker.quiescing || !worker.restoreExpected) {
      this.#skipQueued(state);
      this.#finalizeIfIdle(event.sessionId, state);
      return this.#waitForIdle(event.sessionId, state);
    }
    const deliveries = [];
    if (state.connectDelivered) {
      const resumePayload = encodeNetworkResumePayload({
        ownerWorkerId: state.ownerWorkerId,
        protocol: event.protocol,
        connectedAt: event.connectedAt,
        lastActiveAt: event.lastActiveAt,
        peerInfo: event.peerInfo,
        ...state.request === void 0 ? {} : { request: state.request },
        inputSequence: event.inputSequence,
        outputBufferedBytes: event.outputBufferedBytes,
        outputBufferState: event.outputBufferState
      });
      deliveries.push(this.#admit(event.sessionId, state, {
        messageType: IPC_MESSAGE_TYPE.NET_CONNECT,
        targetRole: PROCESS_ROLE.WORKER,
        targetWorkerId: state.ownerWorkerId,
        sessionId: event.sessionId,
        sequence: createIpcSequence(event.inputSequence),
        payload: resumePayload
      }, false, false, true));
    }
    deliveries.push(this.#admit(event.sessionId, state, closeOptions, true));
    this.#startRecoveryTimer(event.sessionId, state);
    return Promise.all(deliveries).then(() => void 0);
  }
  #admit(sessionId, state, options, closesSession, connectsSession = false, hydratesSession = false) {
    const worker = this.#requireWorker(state.ownerWorkerId);
    const byteLength2 = payloadByteLength(options.payload);
    const messageLimit = this.#sessionMaxMessages + (closesSession ? 1 : 0);
    const byteLimit = this.#sessionMaxBytes + (closesSession ? DISPATCH_ENVELOPE_OVERHEAD_BYTES * 2 : 0);
    if (state.pendingMessages >= messageLimit || byteLength2 > byteLimit - state.pendingBytes || worker.pendingMessages >= this.#workerMaxMessages + (closesSession ? 1 : 0) || byteLength2 > this.#workerMaxBytes + (closesSession ? DISPATCH_ENVELOPE_OVERHEAD_BYTES * 2 : 0) - worker.pendingBytes) {
      this.#queueRejections += 1;
      const error = new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
        `Connection ${sessionId} dispatch backlog is full`,
        {
          sessionId,
          ownerWorkerId: state.ownerWorkerId,
          sessionPendingMessages: state.pendingMessages,
          sessionPendingBytes: state.pendingBytes,
          workerPendingMessages: worker.pendingMessages,
          workerPendingBytes: worker.pendingBytes,
          messageBytes: byteLength2
        }
      );
      this.#connections.beginClose(sessionId, error);
      throw error;
    }
    const deferred = createDeferred2();
    const queuedOptions = options.payload instanceof Uint8Array ? { ...options, ownsPayload: true } : options;
    state.queue.push({
      options: queuedOptions,
      byteLength: byteLength2,
      deferred,
      closesSession,
      connectsSession,
      hydratesSession
    });
    state.pendingMessages += 1;
    state.pendingBytes += byteLength2;
    worker.pendingMessages += 1;
    worker.pendingBytes += byteLength2;
    this.#updateBacklogPressure(state, worker);
    this.#pump(sessionId, state);
    return deferred.promise;
  }
  #pump(sessionId, state) {
    if (this.#closed || state.inFlight !== void 0 || !state.ownerAvailable || this.#isWorkerPressured(state.ownerWorkerId)) {
      return;
    }
    const item = state.queue.shift();
    if (item === void 0) {
      this.#finalizeIfIdle(sessionId, state);
      return;
    }
    state.inFlight = item;
    let completion;
    try {
      completion = this.#externalControlDelivery !== void 0 && (item.options.messageType === IPC_MESSAGE_TYPE.NET_CONNECT || item.options.messageType === IPC_MESSAGE_TYPE.NET_CLOSE || item.options.messageType === IPC_MESSAGE_TYPE.NET_BUFFER_STATE) ? this.#externalControlDelivery(item.options) : this.#bus.enqueue(item.options).completion;
    } catch (error) {
      if (isIpcQueueFull(error)) {
        state.inFlight = void 0;
        state.queue.unshift(item);
        this.#setPaused(sessionId, state, true);
        return;
      }
      queueMicrotask(() => this.#finishFailed(sessionId, state, item, error));
      return;
    }
    void completion.then(
      () => this.#finishSuccessful(sessionId, state, item),
      (error) => this.#finishFailed(sessionId, state, item, error)
    );
  }
  #finishSuccessful(sessionId, state, item) {
    if (state.inFlight !== item) {
      return;
    }
    if ((item.connectsSession || item.hydratesSession) && !state.closing) {
      const generation = this.#resolveWorkerGeneration?.(state.ownerWorkerId);
      if (this.#onSessionReady !== void 0) {
        if (generation === null || generation === void 0) {
          this.#finishFailed(
            sessionId,
            state,
            item,
            new Error(`Worker ${state.ownerWorkerId} has no active generation`)
          );
          return;
        }
        try {
          this.#onSessionReady(
            sessionId,
            state.ownerWorkerId,
            generation
          );
        } catch (error) {
          this.#finishFailed(sessionId, state, item, error);
          return;
        }
      }
    }
    state.inFlight = void 0;
    this.#releaseCapacity(state, item);
    if (item.connectsSession) {
      state.connectDelivered = true;
    }
    item.deferred.resolve();
    const worker = this.#requireWorker(state.ownerWorkerId);
    this.#updateBacklogPressure(state, worker);
    if (item.closesSession) {
      this.#finalizeIfIdle(sessionId, state);
      return;
    }
    this.#pump(sessionId, state);
  }
  #finishFailed(sessionId, state, item, error) {
    if (state.inFlight !== item) {
      return;
    }
    state.inFlight = void 0;
    this.#releaseCapacity(state, item);
    this.#deliveryErrors += 1;
    item.deferred.reject(error);
    for (const queued of state.queue.splice(0)) {
      this.#releaseCapacity(state, queued);
      queued.deferred.reject(error);
    }
    this.#updateBacklogPressure(state, this.#requireWorker(state.ownerWorkerId));
    this.#finalizeIfIdle(sessionId, state);
  }
  #releaseCapacity(state, item) {
    const worker = this.#requireWorker(state.ownerWorkerId);
    state.pendingMessages -= 1;
    state.pendingBytes -= item.byteLength;
    worker.pendingMessages -= 1;
    worker.pendingBytes -= item.byteLength;
  }
  #skipQueued(state) {
    for (const item of state.queue.splice(0)) {
      this.#releaseCapacity(state, item);
      item.deferred.resolve();
    }
    this.#updateBacklogPressure(state, this.#requireWorker(state.ownerWorkerId));
  }
  #discardQueuedHydration(state) {
    const index = state.queue.findIndex((item2) => item2.hydratesSession);
    if (index < 0) {
      return;
    }
    const [item] = state.queue.splice(index, 1);
    if (item === void 0) {
      return;
    }
    this.#releaseCapacity(state, item);
    item.deferred.resolve();
    this.#updateBacklogPressure(state, this.#requireWorker(state.ownerWorkerId));
  }
  #enableQuiescedWorkerDelivery(workerId) {
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== workerId) {
        continue;
      }
      if (state.closing) {
        this.#discardQueuedHydration(state);
        state.ownerAvailable = state.pendingMessages > 0;
        continue;
      }
      const record = this.#connections.get(sessionId);
      state.ownerAvailable = record?.state === CONNECTION_STATE.OPEN;
    }
    this.#pumpWorker(workerId);
  }
  #waitForIdle(sessionId, state) {
    if (state.pendingMessages === 0) {
      this.#finalizeIfIdle(sessionId, state);
      return Promise.resolve();
    }
    const waits = [
      ...state.inFlight === void 0 ? [] : [state.inFlight.deferred.promise],
      ...state.queue.map((item) => item.deferred.promise)
    ];
    return Promise.allSettled(waits).then(() => {
      this.#finalizeIfIdle(sessionId, state);
    });
  }
  async #waitForWorkerIdle(workerId, lifecycleEpoch, sealOwnerDelivery) {
    const worker = this.#requireWorker(workerId);
    while (worker.quiescing && worker.lifecycleEpoch === lifecycleEpoch) {
      const waits = [];
      for (const state of this.#states.values()) {
        if (state.ownerWorkerId !== workerId || !state.ownerAvailable) {
          continue;
        }
        if (state.inFlight !== void 0) {
          waits.push(state.inFlight.deferred.promise);
        }
        waits.push(...state.queue.map((item) => item.deferred.promise));
      }
      if (waits.length === 0) {
        if (sealOwnerDelivery) {
          for (const state of this.#states.values()) {
            if (state.ownerWorkerId === workerId) {
              state.ownerAvailable = false;
            }
          }
        }
        return;
      }
      await Promise.allSettled(waits);
    }
  }
  #failWorkerRestore(workerId, error) {
    this.#requireWorker(workerId).peerAvailable = false;
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== workerId) {
        continue;
      }
      state.ownerAvailable = false;
      this.#abortPending(state, error);
      this.#connections.beginClose(sessionId, error);
      this.#finalizeIfIdle(sessionId, state);
    }
  }
  #abortPending(state, error) {
    const inFlight = state.inFlight;
    if (inFlight !== void 0) {
      state.inFlight = void 0;
      this.#releaseCapacity(state, inFlight);
      inFlight.deferred.reject(error);
    }
    for (const item of state.queue.splice(0)) {
      this.#releaseCapacity(state, item);
      item.deferred.reject(error);
    }
    this.#updateBacklogPressure(state, this.#requireWorker(state.ownerWorkerId));
  }
  #finalizeIfIdle(sessionId, state) {
    if (!state.closing || state.pendingMessages !== 0) {
      return;
    }
    this.#cancelRecoveryTimer(state);
    if (this.#states.get(sessionId) === state) {
      this.#states.delete(sessionId);
    }
  }
  #updateBacklogPressure(state, worker) {
    const wasStatePressured = state.backlogPressured;
    const wasWorkerPressured = worker.backlogPressured;
    if (!state.backlogPressured) {
      state.backlogPressured = state.pendingMessages >= this.#sessionHighMessages || state.pendingBytes >= this.#sessionHighBytes;
    } else if (state.pendingMessages <= this.#sessionLowMessages && state.pendingBytes <= this.#sessionLowBytes) {
      state.backlogPressured = false;
    }
    if (!worker.backlogPressured) {
      worker.backlogPressured = worker.pendingMessages >= this.#workerHighMessages || worker.pendingBytes >= this.#workerHighBytes;
    } else if (worker.pendingMessages <= this.#workerLowMessages && worker.pendingBytes <= this.#workerLowBytes) {
      worker.backlogPressured = false;
    }
    if (state.backlogPressured !== wasStatePressured || worker.backlogPressured !== wasWorkerPressured) {
      this.#reevaluateWorker(worker);
    }
  }
  #reevaluateWorker(worker) {
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId !== worker.workerId || state.closing) {
        continue;
      }
      const shouldPause = state.backlogPressured || worker.backlogPressured || worker.peerPressured || worker.quiescing;
      this.#setPaused(sessionId, state, shouldPause);
    }
  }
  #setPaused(sessionId, state, paused) {
    if (state.paused === paused || state.closing) {
      return;
    }
    if (paused) {
      if (!this.#connections.pauseConnection(sessionId)) {
        return;
      }
      state.paused = true;
      this.#pauseTransitions += 1;
      this.#recordMetric(() => this.#metrics?.recordNetworkInputPause());
      this.#startRecoveryTimer(sessionId, state);
      return;
    }
    this.#cancelRecoveryTimer(state);
    if (!this.#connections.resumeConnection(sessionId)) {
      return;
    }
    state.paused = false;
    this.#resumeTransitions += 1;
    this.#recordMetric(() => this.#metrics?.recordNetworkInputResume());
    this.#pump(sessionId, state);
  }
  #startRecoveryTimer(sessionId, state) {
    if (state.recoveryTimer !== void 0) {
      return;
    }
    state.recoveryTimer = this.#timers.setTimeout(this.#recoveryTimeoutMs, () => {
      state.recoveryTimer = void 0;
      const worker = this.#workers.get(state.ownerWorkerId);
      const awaitingRecovery = state.paused || worker?.quiescing === true && state.pendingMessages > 0;
      if (!awaitingRecovery || this.#states.get(sessionId) !== state) {
        return;
      }
      this.#recoveryTimeouts += 1;
      this.#recordMetric(() => this.#metrics?.recordNetworkInputTimeout());
      const error = new FrameworkError(
        FRAMEWORK_ERROR_CODE.DRAIN_TIMEOUT,
        `Connection ${sessionId} dispatch backpressure did not recover within ${this.#recoveryTimeoutMs}ms`,
        {
          sessionId,
          ownerWorkerId: state.ownerWorkerId,
          timeoutMs: this.#recoveryTimeoutMs,
          pendingMessages: state.pendingMessages,
          pendingBytes: state.pendingBytes
        }
      );
      this.#abortPending(state, error);
      this.#connections.beginClose(sessionId, error);
      this.#finalizeIfIdle(sessionId, state);
    });
  }
  #cancelRecoveryTimer(state, reason) {
    const timer = state.recoveryTimer;
    if (timer === void 0) {
      return;
    }
    state.recoveryTimer = void 0;
    timer.cancel(reason);
  }
  #recordMetric(record) {
    try {
      record();
    } catch {
    }
  }
  #pumpWorker(workerId) {
    if (this.#isWorkerPressured(workerId)) {
      return;
    }
    for (const [sessionId, state] of this.#states) {
      if (state.ownerWorkerId === workerId) {
        this.#pump(sessionId, state);
      }
    }
  }
  #isWorkerPressured(workerId) {
    const worker = this.#requireWorker(workerId);
    return worker.peerPressured || worker.backlogPressured;
  }
  #requireWorker(workerId) {
    const worker = this.#workers.get(workerId);
    if (worker === void 0) {
      throw new Error(`Worker ${workerId} is outside the dispatch pool`);
    }
    return worker;
  }
  #requireState(sessionId, protocol) {
    const state = this.#states.get(sessionId);
    if (state === void 0) {
      throw new Error(`Connection ${sessionId} has not been dispatched`);
    }
    if (state.closing) {
      throw new Error(`Connection ${sessionId} is already closing`);
    }
    this.#assertProtocol(sessionId, state, protocol);
    return state;
  }
  #requireOpenState(sessionId, protocol) {
    const state = this.#requireState(sessionId, protocol);
    if (!state.ownerAvailable) {
      throw new Error(`Connection ${sessionId} owner Worker is unavailable`);
    }
    return state;
  }
  #assertProtocol(sessionId, state, protocol) {
    if (state.protocol !== protocol) {
      throw new Error(
        `Connection ${sessionId} protocol changed from ${state.protocol} to ${protocol}`
      );
    }
  }
};

// src/dispatch/network-command-protocol.ts
var NETWORK_COMMAND_PROTOCOL_VERSION = 1;
var NETWORK_SEND_HEADER_BYTES = 3;
var NETWORK_SEND_KIND = Object.freeze({
  TCP: 0,
  WEBSOCKET: 1
});
var CLOSE_COMMAND_KEYS = Object.freeze(["protocolVersion", "code", "reason"]);
var strictTextDecoder3 = new TextDecoder("utf-8", { fatal: true });
function isAllowedWebSocketOpcode(opcode) {
  return opcode === WEB_SOCKET_OPCODE.TEXT || opcode === WEB_SOCKET_OPCODE.BINARY || opcode === WEB_SOCKET_OPCODE.CLOSE || opcode === WEB_SOCKET_OPCODE.PING || opcode === WEB_SOCKET_OPCODE.PONG;
}
function encodeData(data) {
  return typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}
function assertPayloadLimit(name, actual, maximum) {
  if (actual <= maximum) {
    return;
  }
  throw new FrameworkError(
    FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
    `${name} payload size ${actual} exceeds ${maximum} bytes`,
    { byteLength: actual, maxPayloadBytes: maximum }
  );
}
function validateWebSocketData(opcode, data) {
  assertPayloadLimit(
    "WebSocket NET_SEND",
    data.byteLength,
    DEFAULT_WEB_SOCKET_MAX_MESSAGE_BYTES
  );
  if (opcode === WEB_SOCKET_OPCODE.PING || opcode === WEB_SOCKET_OPCODE.PONG) {
    assertPayloadLimit("WebSocket control", data.byteLength, 125);
  }
  if (opcode === WEB_SOCKET_OPCODE.CLOSE) {
    assertPayloadLimit("WebSocket close reason", data.byteLength, 123);
  }
  if (opcode === WEB_SOCKET_OPCODE.TEXT || opcode === WEB_SOCKET_OPCODE.CLOSE) {
    strictTextDecoder3.decode(data);
  }
}
function validateTcpData(data) {
  if (data.byteLength === 0) {
    throw new TypeError("TCP NET_SEND data must not be empty");
  }
}
function requireSendOpcode(kind, opcode) {
  if (kind === "tcp") {
    if (opcode !== void 0 && opcode !== 0) {
      throw new TypeError("TCP NET_SEND opcode must be zero");
    }
    return 0;
  }
  const resolved = opcode ?? WEB_SOCKET_OPCODE.TEXT;
  if (!isAllowedWebSocketOpcode(resolved)) {
    throw new TypeError(
      "WebSocket NET_SEND opcode must be TEXT, BINARY, CLOSE, PING, or PONG"
    );
  }
  return resolved;
}
function decodeKind(value) {
  if (value === NETWORK_SEND_KIND.TCP) {
    return "tcp";
  }
  if (value === NETWORK_SEND_KIND.WEBSOCKET) {
    return "websocket";
  }
  throw new TypeError("NET_SEND payload contains an unknown kind");
}
function encodeNetworkSendCommandPayload(options) {
  if (options.protocol !== "tcp" && options.protocol !== "websocket") {
    throw new TypeError("NET_SEND protocol must be tcp or websocket");
  }
  if (typeof options.data !== "string" && !(options.data instanceof Uint8Array)) {
    throw new TypeError("NET_SEND data must be a string or Uint8Array");
  }
  const opcode = requireSendOpcode(options.protocol, options.opcode);
  const data = encodeData(options.data);
  if (options.protocol === "websocket") {
    validateWebSocketData(opcode, data);
  } else {
    validateTcpData(data);
  }
  const payload = Buffer.allocUnsafe(NETWORK_SEND_HEADER_BYTES + data.byteLength);
  payload[0] = NETWORK_COMMAND_PROTOCOL_VERSION;
  payload[1] = options.protocol === "tcp" ? NETWORK_SEND_KIND.TCP : NETWORK_SEND_KIND.WEBSOCKET;
  payload[2] = opcode;
  payload.set(data, NETWORK_SEND_HEADER_BYTES);
  return payload;
}
function decodeNetworkSendCommandPayload(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < NETWORK_SEND_HEADER_BYTES) {
    throw new TypeError("NET_SEND payload must contain a complete binary header");
  }
  const payload = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (payload[0] !== NETWORK_COMMAND_PROTOCOL_VERSION) {
    throw new TypeError("NET_SEND payload has an unsupported version");
  }
  const protocol = decodeKind(payload[1]);
  const opcode = requireSendOpcode(protocol, payload[2]);
  const data = Buffer.from(payload.subarray(NETWORK_SEND_HEADER_BYTES));
  if (protocol === "websocket") {
    validateWebSocketData(opcode, data);
  } else {
    validateTcpData(data);
  }
  return Object.freeze({
    protocolVersion: NETWORK_COMMAND_PROTOCOL_VERSION,
    protocol,
    opcode,
    data
  });
}
function requireExactDataRecord(value, keys, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
  let prototype;
  let ownKeys;
  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    throw new TypeError(`${name} must be an inspectable plain object`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
  }
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new TypeError(`${name} must contain exactly: ${keys.join(", ")}`);
  }
  const snapshot = {};
  for (const key of keys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new TypeError(`${name}.${key} must be an inspectable data field`);
    }
    if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name}.${key} must be an enumerable data field`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}
function encodeNetworkCloseCommandPayload(code = 1e3, reason = "") {
  encodeWebSocketCloseFrame(code, reason);
  return Object.freeze({
    protocolVersion: NETWORK_COMMAND_PROTOCOL_VERSION,
    code,
    reason
  });
}
function decodeNetworkCloseCommandPayload(value) {
  const record = requireExactDataRecord(
    value,
    CLOSE_COMMAND_KEYS,
    "NET_CLOSE_COMMAND payload"
  );
  if (record.protocolVersion !== NETWORK_COMMAND_PROTOCOL_VERSION) {
    throw new TypeError("NET_CLOSE_COMMAND payload has an unsupported version");
  }
  if (typeof record.code !== "number" || typeof record.reason !== "string") {
    throw new TypeError("NET_CLOSE_COMMAND code and reason are invalid");
  }
  return encodeNetworkCloseCommandPayload(record.code, record.reason);
}

// src/dispatch/network-command-writer.ts
var NETWORK_COMMAND_WRITE_REJECTION_REASON = Object.freeze({
  UNKNOWN_SESSION: "UNKNOWN_SESSION",
  SESSION_NOT_OPEN: "SESSION_NOT_OPEN",
  PROTOCOL_MISMATCH: "PROTOCOL_MISMATCH",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
  OUTPUT_BUFFER_OVERFLOW: "OUTPUT_BUFFER_OVERFLOW",
  OUTPUT_SEQUENCE_EXHAUSTED: "OUTPUT_SEQUENCE_EXHAUSTED",
  WRITE_FAILED: "WRITE_FAILED"
});

// src/dispatch/master-network-command-receiver.ts
var NETWORK_COMMAND_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  IPC_MESSAGE_TYPE.NET_SEND,
  IPC_MESSAGE_TYPE.NET_CLOSE_COMMAND
]);
var DEFAULT_CLOSE_TOMBSTONE_LIMIT = 4096;
var MASTER_NETWORK_COMMAND_REJECTION_REASON = Object.freeze({
  INVALID_SOURCE: "INVALID_SOURCE",
  INVALID_TARGET: "INVALID_TARGET",
  INVALID_METADATA: "INVALID_METADATA",
  MISSING_SESSION: "MISSING_SESSION",
  ...NETWORK_COMMAND_WRITE_REJECTION_REASON
});
function assertNonNegativeSafeInteger2(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function readString(read, fallback) {
  try {
    return String(read());
  } catch {
    return fallback;
  }
}
function describeError(error) {
  try {
    if (error instanceof Error) {
      return {
        errorName: readString(() => error.name, "Error"),
        errorMessage: readString(() => error.message, "<unreadable error message>")
      };
    }
  } catch {
  }
  return {
    errorName: "UnknownError",
    errorMessage: readString(() => error, "<unprintable thrown value>")
  };
}
function isReceiverRejection(error) {
  try {
    return error instanceof MasterNetworkCommandRejectedError;
  } catch {
    return false;
  }
}
var MasterNetworkCommandReceiver = class {
  #context;
  #writer;
  #closeTombstoneLimit;
  #closeTombstones = /* @__PURE__ */ new Set();
  #closeTombstoneOrder = [];
  #rejectionCounts = /* @__PURE__ */ new Map();
  #disposeBusMessage;
  #closed = false;
  #acceptedSends = 0;
  #acceptedCloses = 0;
  #idempotentCloses = 0;
  #backpressuredWrites = 0;
  #ignoredMessages = 0;
  #rejectedCommands = 0;
  constructor(options) {
    const identity = options.bus.localIdentity;
    if (identity.role !== PROCESS_ROLE.MASTER || identity.workerId !== null || identity.generation !== null) {
      throw new TypeError("MasterNetworkCommandReceiver requires a Master ProcessBus");
    }
    const closeTombstoneLimit = options.closeTombstoneLimit ?? DEFAULT_CLOSE_TOMBSTONE_LIMIT;
    assertNonNegativeSafeInteger2("closeTombstoneLimit", closeTombstoneLimit);
    this.#context = options.context;
    this.#writer = options.writer;
    this.#closeTombstoneLimit = closeTombstoneLimit;
    this.#disposeBusMessage = options.bus.onMessage(this.#handleEnvelope);
  }
  stats() {
    return Object.freeze({
      closed: this.#closed,
      acceptedCommands: this.#acceptedSends + this.#acceptedCloses,
      acceptedSends: this.#acceptedSends,
      acceptedCloses: this.#acceptedCloses,
      idempotentCloses: this.#idempotentCloses,
      backpressuredWrites: this.#backpressuredWrites,
      ignoredMessages: this.#ignoredMessages,
      rejectedCommands: this.#rejectedCommands,
      rejectionCounts: Object.freeze(
        Object.fromEntries(this.#rejectionCounts)
      )
    });
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#disposeBusMessage();
    this.#disposeBusMessage = () => {
    };
    this.#closeTombstones.clear();
    this.#closeTombstoneOrder.length = 0;
  }
  #handleEnvelope = (envelope) => {
    if (this.#closed) {
      return;
    }
    if (!NETWORK_COMMAND_MESSAGE_TYPES.has(envelope.messageType)) {
      this.#ignoredMessages += 1;
      return;
    }
    try {
      this.#assertAddress(envelope);
      const sessionId = envelope.sessionId;
      if (sessionId === null) {
        this.#reject(
          MASTER_NETWORK_COMMAND_REJECTION_REASON.MISSING_SESSION,
          envelope,
          `${envelope.messageType} requires a Session ID`
        );
      }
      if (envelope.messageType === IPC_MESSAGE_TYPE.NET_SEND) {
        this.#acceptSend(envelope, sessionId);
      } else {
        this.#acceptClose(envelope, sessionId);
      }
    } catch (error) {
      if (!isReceiverRejection(error)) {
        this.#recordRejection(
          MASTER_NETWORK_COMMAND_REJECTION_REASON.WRITE_FAILED,
          envelope,
          "network command receiver failed unexpectedly",
          error
        );
      }
    }
  };
  #assertAddress(envelope) {
    if (envelope.sourceRole !== PROCESS_ROLE.WORKER && envelope.sourceRole !== PROCESS_ROLE.TASK_WORKER && envelope.sourceRole !== PROCESS_ROLE.USER_TASK_WORKER || envelope.sourceWorkerId === null || envelope.sourceGeneration === null) {
      this.#reject(
        MASTER_NETWORK_COMMAND_REJECTION_REASON.INVALID_SOURCE,
        envelope,
        `${envelope.messageType} must originate from a supervised Worker`
      );
    }
    if (envelope.targetRole !== PROCESS_ROLE.MASTER || envelope.targetWorkerId !== null) {
      this.#reject(
        MASTER_NETWORK_COMMAND_REJECTION_REASON.INVALID_TARGET,
        envelope,
        `${envelope.messageType} must target Master`
      );
    }
    if (envelope.correlationId !== null || envelope.flags !== 0) {
      this.#reject(
        MASTER_NETWORK_COMMAND_REJECTION_REASON.INVALID_METADATA,
        envelope,
        `${envelope.messageType} cannot carry correlation or response flags`
      );
    }
  }
  #acceptSend(envelope, sessionId) {
    let command;
    try {
      command = decodeNetworkSendCommandPayload(envelope.payload);
    } catch (error) {
      this.#reject(
        MASTER_NETWORK_COMMAND_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_SEND payload is invalid",
        error
      );
    }
    const result = command.protocol === "tcp" ? this.#writer.sendSession(sessionId, command.data) : this.#writer.pushSession(sessionId, command.data, command.opcode);
    if (!result.accepted) {
      this.#rejectWrite(envelope, result);
    }
    this.#acceptedSends += 1;
    if (result.backpressured) {
      this.#backpressuredWrites += 1;
    }
    this.#context.metrics.recordNetworkCommandAccepted(result.backpressured);
  }
  #acceptClose(envelope, sessionId) {
    let command;
    try {
      command = decodeNetworkCloseCommandPayload(envelope.payload);
    } catch (error) {
      this.#reject(
        MASTER_NETWORK_COMMAND_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_CLOSE_COMMAND payload is invalid",
        error
      );
    }
    if (this.#closeTombstones.has(sessionId)) {
      this.#acceptedCloses += 1;
      this.#idempotentCloses += 1;
      this.#context.metrics.recordNetworkCommandAccepted(false);
      return;
    }
    const result = this.#writer.closeSession(sessionId, command.code, command.reason);
    if (!result.accepted) {
      this.#rejectWrite(envelope, result);
    }
    this.#rememberClosed(sessionId);
    this.#acceptedCloses += 1;
    this.#context.metrics.recordNetworkCommandAccepted(false);
  }
  #rejectWrite(envelope, result) {
    this.#reject(
      result.reason,
      envelope,
      `${envelope.messageType} was rejected by the Master writer: ${result.reason}`,
      result.error
    );
  }
  #rememberClosed(sessionId) {
    if (this.#closeTombstoneLimit === 0 || this.#closeTombstones.has(sessionId)) {
      return;
    }
    this.#closeTombstones.add(sessionId);
    this.#closeTombstoneOrder.push(sessionId);
    while (this.#closeTombstoneOrder.length > this.#closeTombstoneLimit) {
      const expired = this.#closeTombstoneOrder.shift();
      if (expired !== void 0) {
        this.#closeTombstones.delete(expired);
      }
    }
  }
  #reject(reason, envelope, message, cause) {
    this.#recordRejection(reason, envelope, message, cause);
    throw new MasterNetworkCommandRejectedError(
      reason,
      envelope.messageType,
      envelope.sessionId,
      message,
      cause
    );
  }
  #recordRejection(reason, envelope, message, error) {
    this.#rejectedCommands += 1;
    this.#rejectionCounts.set(reason, (this.#rejectionCounts.get(reason) ?? 0) + 1);
    this.#context.metrics.recordNetworkCommandRejected(
      reason === MASTER_NETWORK_COMMAND_REJECTION_REASON.WRITE_FAILED || reason === MASTER_NETWORK_COMMAND_REJECTION_REASON.OUTPUT_SEQUENCE_EXHAUSTED
    );
    this.#context.log("warn", "runtime.network.command_rejected", {
      reason,
      messageType: envelope.messageType,
      sourceRole: envelope.sourceRole,
      sourceWorkerId: envelope.sourceWorkerId,
      sessionId: envelope.sessionId,
      message,
      ...error === void 0 ? {} : describeError(error)
    });
  }
};
var MasterNetworkCommandRejectedError = class extends Error {
  reason;
  messageType;
  sessionId;
  constructor(reason, messageType, sessionId, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "MasterNetworkCommandRejectedError";
    this.reason = reason;
    this.messageType = messageType;
    this.sessionId = sessionId;
  }
};

// src/connection/connection-registry.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";

// src/connection/session-manager.ts
var MAX_SESSION_SLOTS = SESSION_ID_LAYOUT.maxSlotIndex + 1;
var SessionCapacityExhaustedError = class extends Error {
  constructor(capacity, retiredSlots) {
    super(
      `Session capacity exhausted: capacity=${capacity}, retiredSlots=${retiredSlots}`
    );
    this.name = "SessionCapacityExhaustedError";
  }
};
function assertIntegerInRange3(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a safe integer in [${min}, ${max}], got ${value}`);
  }
}
var SessionManager = class {
  gatewayId = 0;
  masterGeneration;
  capacity;
  #slots = /* @__PURE__ */ new Map();
  #freeSlotIndexes = [];
  #nextSlotIndex = 0;
  #activeCount = 0;
  #retiredSlotCount = 0;
  constructor(options) {
    assertIntegerInRange3(
      "masterGeneration",
      options.masterGeneration,
      0,
      SESSION_ID_LAYOUT.maxMasterGeneration
    );
    const capacity = options.maxConnections ?? MAX_SESSION_SLOTS;
    assertIntegerInRange3("maxConnections", capacity, 1, MAX_SESSION_SLOTS);
    this.masterGeneration = options.masterGeneration;
    this.capacity = capacity;
  }
  get activeCount() {
    return this.#activeCount;
  }
  get allocatedSlotCount() {
    return this.#slots.size;
  }
  get freeSlotCount() {
    return this.#freeSlotIndexes.length;
  }
  get retiredSlotCount() {
    return this.#retiredSlotCount;
  }
  get availableCount() {
    return this.capacity - this.#activeCount - this.#retiredSlotCount;
  }
  acquire() {
    const reusableSlotIndex = this.#freeSlotIndexes.pop();
    let slot;
    if (reusableSlotIndex === void 0) {
      if (this.#nextSlotIndex >= this.capacity) {
        throw new SessionCapacityExhaustedError(this.capacity, this.#retiredSlotCount);
      }
      slot = {
        slotIndex: this.#nextSlotIndex,
        generation: 1,
        sessionId: null,
        retired: false
      };
      this.#nextSlotIndex += 1;
      this.#slots.set(slot.slotIndex, slot);
    } else {
      const reusableSlot = this.#slots.get(reusableSlotIndex);
      if (reusableSlot === void 0 || reusableSlot.retired || reusableSlot.sessionId !== null || reusableSlot.generation >= SESSION_ID_LAYOUT.maxSessionGeneration) {
        throw new Error(`Session slot ${reusableSlotIndex} violates reuse invariants`);
      }
      reusableSlot.generation += 1;
      slot = reusableSlot;
    }
    const sessionId = encodeSessionId({
      gatewayId: this.gatewayId,
      masterGeneration: this.masterGeneration,
      slotIndex: slot.slotIndex,
      sessionGeneration: slot.generation
    });
    slot.sessionId = sessionId;
    this.#activeCount += 1;
    return sessionId;
  }
  release(sessionId) {
    if (!isSessionId(sessionId)) {
      return false;
    }
    const parts = decodeSessionId(sessionId);
    if (parts.gatewayId !== this.gatewayId || parts.masterGeneration !== this.masterGeneration || parts.slotIndex >= this.capacity) {
      return false;
    }
    const slot = this.#slots.get(parts.slotIndex);
    if (slot === void 0 || slot.sessionId !== sessionId || slot.retired) {
      return false;
    }
    slot.sessionId = null;
    this.#activeCount -= 1;
    if (slot.generation === SESSION_ID_LAYOUT.maxSessionGeneration) {
      slot.retired = true;
      this.#retiredSlotCount += 1;
    } else {
      this.#freeSlotIndexes.push(slot.slotIndex);
    }
    return true;
  }
  isCurrent(sessionId) {
    if (!isSessionId(sessionId)) {
      return false;
    }
    const parts = decodeSessionId(sessionId);
    if (parts.gatewayId !== this.gatewayId || parts.masterGeneration !== this.masterGeneration) {
      return false;
    }
    return this.#slots.get(parts.slotIndex)?.sessionId === sessionId;
  }
};

// src/connection/connection-registry.ts
var activeConnectionClosedHandler = new AsyncLocalStorage2();
function freezePeerInfo(peerInfo) {
  return Object.freeze({ ...peerInfo });
}
function assertNonNegativeSafeInteger3(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
var ConnectionRegistry = class {
  #sessions;
  #operations;
  #clock;
  #onClosed;
  #onRecordChanged;
  #activityPublishIntervalMs;
  #bySessionId = /* @__PURE__ */ new Map();
  #byHandle = /* @__PURE__ */ new Map();
  #pendingClosed = /* @__PURE__ */ new Set();
  #pendingOnClosed = /* @__PURE__ */ new Set();
  constructor(options) {
    this.#sessions = options.sessions;
    this.#operations = options.operations;
    this.#clock = options.clock ?? new SystemClock();
    this.#onClosed = options.onClosed;
    this.#onRecordChanged = options.onRecordChanged;
    this.#activityPublishIntervalMs = options.activityPublishIntervalMs ?? 0;
    assertNonNegativeSafeInteger3(
      "activityPublishIntervalMs",
      this.#activityPublishIntervalMs
    );
  }
  get size() {
    return this.#bySessionId.size;
  }
  [Symbol.iterator]() {
    return this.#bySessionId.keys();
  }
  add(handle, protocolState) {
    if (this.#byHandle.has(handle)) {
      throw new Error("Connection handle is already registered");
    }
    const peerInfo = freezePeerInfo(this.#operations.getPeerInfo(handle));
    const sessionId = this.#sessions.acquire();
    let connectedAt;
    try {
      connectedAt = this.#clock.wallTimeMs();
    } catch (error) {
      if (!this.#sessions.release(sessionId)) {
        throw new AggregateError(
          [
            error,
            new Error(`Connection ${sessionId} failed to roll back its Session slot`)
          ],
          "Connection registration failed"
        );
      }
      throw error;
    }
    let resolveClosed;
    let rejectClosed;
    const closed = new Promise((resolve4, reject) => {
      resolveClosed = resolve4;
      rejectClosed = reject;
    });
    let resolveOnClosedDone;
    let rejectOnClosedDone;
    const onClosedDone = new Promise((resolve4, reject) => {
      resolveOnClosedDone = resolve4;
      rejectOnClosedDone = reject;
    });
    void closed.catch(() => void 0);
    void onClosedDone.catch(() => void 0);
    this.#pendingClosed.add(closed);
    this.#pendingOnClosed.add(onClosedDone);
    void closed.then(
      () => this.#pendingClosed.delete(closed),
      () => this.#pendingClosed.delete(closed)
    );
    void onClosedDone.then(
      () => this.#pendingOnClosed.delete(onClosedDone),
      () => this.#pendingOnClosed.delete(onClosedDone)
    );
    const record = {
      sessionId,
      handle,
      state: CONNECTION_STATE.ACCEPTED,
      protocolState,
      ownerWorkerId: null,
      inputSequence: 0,
      outputSequence: 0,
      inputBufferedBytes: 0,
      outputBufferedBytes: 0,
      outputBufferFull: false,
      overflow: false,
      connectedAt,
      lastActiveAt: connectedAt,
      lastPublishedActiveAt: connectedAt,
      peerInfo,
      closeCause: void 0,
      closeCauseSet: false,
      closed,
      resolveClosed,
      rejectClosed,
      onClosedDone,
      resolveOnClosedDone,
      rejectOnClosedDone
    };
    this.#bySessionId.set(sessionId, record);
    this.#byHandle.set(handle, sessionId);
    try {
      return this.#publish(record);
    } catch (error) {
      this.#bySessionId.delete(sessionId);
      this.#byHandle.delete(handle);
      this.#pendingClosed.delete(closed);
      this.#pendingOnClosed.delete(onClosedDone);
      const failures = [error];
      try {
        if (!this.#sessions.release(sessionId)) {
          failures.push(
            new Error(`Connection ${sessionId} failed to roll back its Session slot`)
          );
        }
      } catch (releaseError) {
        failures.push(releaseError);
      }
      const rejection = failures.length === 1 ? failures[0] : new AggregateError(failures, "Connection shared publication rollback failed");
      rejectClosed(rejection);
      rejectOnClosedDone(rejection);
      throw rejection;
    }
  }
  has(sessionId) {
    return this.#bySessionId.has(sessionId);
  }
  get(sessionId) {
    const record = this.#bySessionId.get(sessionId);
    return record === void 0 ? void 0 : this.#snapshot(record);
  }
  getByHandle(handle) {
    const sessionId = this.#byHandle.get(handle);
    return sessionId === void 0 ? void 0 : this.get(sessionId);
  }
  getSessionId(handle) {
    return this.#byHandle.get(handle);
  }
  getHandle(sessionId) {
    return this.#bySessionId.get(sessionId)?.handle;
  }
  setProtocolState(sessionId, protocolState) {
    const record = this.#bySessionId.get(sessionId);
    if (record === void 0 || record.state === CONNECTION_STATE.CLOSING) {
      return void 0;
    }
    record.protocolState = protocolState;
    return this.#publish(record);
  }
  markHandshaking(sessionId) {
    return this.#transition(sessionId, CONNECTION_STATE.HANDSHAKING);
  }
  markOpen(sessionId) {
    return this.#transition(sessionId, CONNECTION_STATE.OPEN);
  }
  assignOwner(sessionId, ownerWorkerId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    if (ownerWorkerId !== null && (!Number.isSafeInteger(ownerWorkerId) || ownerWorkerId < 0)) {
      throw new RangeError(`ownerWorkerId must be null or a non-negative safe integer`);
    }
    if (record.ownerWorkerId === null) {
      record.ownerWorkerId = ownerWorkerId;
      return this.#publish(record);
    }
    if (record.ownerWorkerId !== ownerWorkerId) {
      throw new Error(
        `Connection ${sessionId} owner cannot be reassigned from ${record.ownerWorkerId} to ${ownerWorkerId}`
      );
    }
    return this.#publish(record);
  }
  nextInputSequence(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    record.inputSequence = this.#nextSequence("inputSequence", record.inputSequence);
    return record.inputSequence;
  }
  nextOutputSequence(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    record.outputSequence = this.#nextSequence("outputSequence", record.outputSequence);
    return record.outputSequence;
  }
  synchronizeSequences(sessionId, inputSequence, outputSequence) {
    assertNonNegativeSafeInteger3("inputSequence", inputSequence);
    assertNonNegativeSafeInteger3("outputSequence", outputSequence);
    const record = this.#bySessionId.get(sessionId);
    if (record === void 0) {
      return void 0;
    }
    if (inputSequence < record.inputSequence || outputSequence < record.outputSequence) {
      throw new RangeError(
        `Connection ${sessionId} data-plane sequences cannot move backwards`
      );
    }
    if (inputSequence === record.inputSequence && outputSequence === record.outputSequence) {
      return this.#snapshot(record);
    }
    record.inputSequence = inputSequence;
    record.outputSequence = outputSequence;
    return this.#publish(record);
  }
  setBufferedBytes(sessionId, inputBufferedBytes, outputBufferedBytes) {
    assertNonNegativeSafeInteger3("inputBufferedBytes", inputBufferedBytes);
    assertNonNegativeSafeInteger3("outputBufferedBytes", outputBufferedBytes);
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    if (record.inputBufferedBytes === inputBufferedBytes && record.outputBufferedBytes === outputBufferedBytes) {
      return this.#snapshot(record);
    }
    record.inputBufferedBytes = inputBufferedBytes;
    record.outputBufferedBytes = outputBufferedBytes;
    return this.#publish(record);
  }
  setOverflow(sessionId, overflow) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    if (record.overflow === overflow) {
      return this.#snapshot(record);
    }
    record.overflow = overflow;
    return this.#publish(record);
  }
  setOutputBufferFull(sessionId, outputBufferFull) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    if (record.outputBufferFull === outputBufferFull) {
      return this.#snapshot(record);
    }
    record.outputBufferFull = outputBufferFull;
    return this.#publish(record);
  }
  touch(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    record.lastActiveAt = this.#clock.wallTimeMs();
    return this.#publish(record);
  }
  touchActivity(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return false;
    }
    record.lastActiveAt = this.#clock.wallTimeMs();
    if (record.lastActiveAt - record.lastPublishedActiveAt >= this.#activityPublishIntervalMs) {
      this.#publish(record);
    }
    return true;
  }
  pauseConnection(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return false;
    }
    this.#operations.pauseConnection(record.handle);
    return true;
  }
  resumeConnection(sessionId) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return false;
    }
    this.#operations.resumeConnection(record.handle);
    return true;
  }
  write(sessionId, data) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    const result = this.#operations.write(record.handle, data);
    if (typeof result.backpressured !== "boolean") {
      throw new TypeError("write result backpressured must be a boolean");
    }
    assertNonNegativeSafeInteger3("write result bufferedBytes", result.bufferedBytes);
    const bufferedBytesChanged = record.outputBufferedBytes !== result.bufferedBytes;
    record.outputBufferedBytes = result.bufferedBytes;
    if (bufferedBytesChanged) {
      this.#publish(record);
    }
    return Object.freeze({
      backpressured: result.backpressured,
      bufferedBytes: result.bufferedBytes
    });
  }
  beginClose(sessionId, cause) {
    const record = this.#bySessionId.get(sessionId);
    if (record === void 0 || record.state === CONNECTION_STATE.CLOSING) {
      return false;
    }
    this.#markClosing(record, cause);
    let publicationError;
    try {
      this.#publish(record);
    } catch (error) {
      publicationError = error;
    }
    try {
      this.#operations.closeConnection(record.handle, cause);
    } catch (error) {
      this.finalizeClose(record.handle, error);
    }
    if (publicationError !== void 0) {
      throw publicationError;
    }
    return true;
  }
  finalizeClose(handle, cause) {
    const sessionId = this.#byHandle.get(handle);
    if (sessionId === void 0) {
      return false;
    }
    const record = this.#bySessionId.get(sessionId);
    if (record === void 0) {
      this.#byHandle.delete(handle);
      return false;
    }
    const closeFailures = [];
    if (record.state !== CONNECTION_STATE.CLOSING) {
      this.#markClosing(record, cause);
      try {
        this.#publish(record);
      } catch (error) {
        closeFailures.push(error);
      }
    }
    assertConnectionTransition(record.state, CONNECTION_STATE.CLOSED);
    record.state = CONNECTION_STATE.CLOSED;
    try {
      record.lastActiveAt = this.#clock.wallTimeMs();
    } catch (error) {
      closeFailures.push(error);
    }
    try {
      this.#publish(record);
    } catch (error) {
      closeFailures.push(error);
    }
    this.#bySessionId.delete(record.sessionId);
    this.#byHandle.delete(record.handle);
    let released = false;
    try {
      released = this.#sessions.release(record.sessionId);
    } catch (error) {
      closeFailures.push(error);
    }
    const snapshot = this.#snapshot(record);
    if (!released) {
      closeFailures.push(
        new Error(`Connection ${record.sessionId} finalized with a stale Session slot`)
      );
    }
    this.#completeClosed(record, snapshot, closeFailures);
    return true;
  }
  async close(sessionId, cause) {
    const record = this.#bySessionId.get(sessionId);
    if (record === void 0) {
      return false;
    }
    const failures = [];
    try {
      this.beginClose(sessionId, cause);
    } catch (error) {
      failures.push(error);
    }
    const results = await Promise.allSettled([
      record.closed,
      ...this.#shouldJoinOnClosed() ? [record.onClosedDone] : []
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason);
      }
    }
    this.#throwCloseFailures(failures, `Connection ${sessionId} close failed`);
    return true;
  }
  async closeAll(cause) {
    const records = [...this.#bySessionId.values()];
    const pendingClosed = [...this.#pendingClosed];
    const pendingOnClosed = this.#shouldJoinOnClosed() ? [...this.#pendingOnClosed] : [];
    const failures = [];
    for (const record of records) {
      try {
        this.beginClose(record.sessionId, cause);
      } catch (error) {
        failures.push(error);
      }
    }
    const results = await Promise.allSettled([
      ...pendingClosed,
      ...pendingOnClosed
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason);
      }
    }
    this.#throwCloseFailures(failures, "ConnectionRegistry close failed");
  }
  #transition(sessionId, state) {
    const record = this.#findUsable(sessionId);
    if (record === void 0) {
      return void 0;
    }
    assertConnectionTransition(record.state, state);
    record.state = state;
    record.lastActiveAt = this.#clock.wallTimeMs();
    return this.#publish(record);
  }
  #findUsable(sessionId) {
    const record = this.#bySessionId.get(sessionId);
    return record === void 0 || record.state === CONNECTION_STATE.CLOSING ? void 0 : record;
  }
  #nextSequence(name, current) {
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`${name} exhausted the safe integer range`);
    }
    return current + 1;
  }
  #markClosing(record, cause) {
    assertConnectionTransition(record.state, CONNECTION_STATE.CLOSING);
    record.state = CONNECTION_STATE.CLOSING;
    if (!record.closeCauseSet) {
      record.closeCause = cause;
      record.closeCauseSet = true;
    }
  }
  #shouldJoinOnClosed() {
    const invocation = activeConnectionClosedHandler.getStore();
    return invocation?.active !== true || invocation.registry !== this;
  }
  #throwCloseFailures(failures, message) {
    if (failures.length === 0) {
      return;
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    throw new AggregateError(failures, message);
  }
  #completeClosed(record, snapshot, closeFailures) {
    if (closeFailures.length === 0) {
      record.resolveClosed();
    } else if (closeFailures.length === 1) {
      record.rejectClosed(closeFailures[0]);
    } else {
      record.rejectClosed(
        new AggregateError(closeFailures, `Connection ${record.sessionId} close failed`)
      );
    }
    if (this.#onClosed === void 0) {
      record.resolveOnClosedDone();
      return;
    }
    const invocation = {
      active: true,
      registry: this
    };
    let result;
    try {
      result = activeConnectionClosedHandler.run(
        invocation,
        () => this.#onClosed?.(snapshot)
      );
    } catch (error) {
      invocation.active = false;
      record.rejectOnClosedDone(error);
      return;
    }
    void Promise.resolve(result).then(
      () => {
        invocation.active = false;
        record.resolveOnClosedDone();
      },
      (error) => {
        invocation.active = false;
        record.rejectOnClosedDone(error);
      }
    );
  }
  #snapshot(record) {
    return Object.freeze({
      sessionId: record.sessionId,
      state: record.state,
      protocolState: record.protocolState,
      ownerWorkerId: record.ownerWorkerId,
      inputSequence: record.inputSequence,
      outputSequence: record.outputSequence,
      inputBufferedBytes: record.inputBufferedBytes,
      outputBufferedBytes: record.outputBufferedBytes,
      outputBufferFull: record.outputBufferFull,
      overflow: record.overflow,
      connectedAt: record.connectedAt,
      lastActiveAt: record.lastActiveAt,
      peerInfo: record.peerInfo,
      closeCause: record.closeCause,
      closed: record.closed
    });
  }
  #publish(record) {
    const snapshot = this.#snapshot(record);
    this.#onRecordChanged?.(snapshot);
    record.lastPublishedActiveAt = record.lastActiveAt;
    return snapshot;
  }
};

// src/shared-state/shared-runtime-state.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/shared-state/native-binding.ts
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var require2 = createRequire(import.meta.url);
var here = dirname(fileURLToPath(import.meta.url));
var addonPath = resolve(
  here,
  "..",
  "..",
  "build",
  "Release",
  "ts_swoole_runtime_state.node"
);
var cachedBinding;
function loadNativeRuntimeStateBinding() {
  cachedBinding ??= require2(addonPath);
  return cachedBinding;
}

// src/shared-state/types.ts
var SHARED_RUNTIME_SCHEMA_VERSION = 1;
var SHARED_RUNTIME_REGION_NAME_MAX_BYTES = 255;
var SHARED_RUNTIME_CAPABILITY_TOKEN_MAX_BYTES = 128;
var SHARED_RUNTIME_LAYOUT_HASH_MAX_BYTES = 128;
var SHARED_RUNTIME_DESCRIPTOR_KEYS = Object.freeze([
  "schemaVersion",
  "layoutHash",
  "regionName",
  "regionBytes",
  "capabilityToken",
  "masterPid",
  "masterGeneration",
  "connectionCapacity",
  "workerCapacity"
]);
var textEncoder2 = new TextEncoder();
function assertPlainExactRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("SharedRuntimeDescriptor must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("SharedRuntimeDescriptor must be a plain object");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw new TypeError("SharedRuntimeDescriptor must not contain symbol keys");
  }
  const stringKeys = keys;
  if (stringKeys.length !== SHARED_RUNTIME_DESCRIPTOR_KEYS.length || SHARED_RUNTIME_DESCRIPTOR_KEYS.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(
      `SharedRuntimeDescriptor must contain exactly: ${SHARED_RUNTIME_DESCRIPTOR_KEYS.join(", ")}`
    );
  }
  return value;
}
function byteLength(value) {
  return textEncoder2.encode(value).byteLength;
}
function assertBoundedVisibleAscii(name, value, maximumBytes) {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > maximumBytes || !/^[\x21-\x7e]+$/.test(value)) {
    throw new TypeError(
      `${name} must contain 1 to ${maximumBytes} bytes of visible ASCII`
    );
  }
  return value;
}
function assertRegionName(value) {
  const regionName = assertBoundedVisibleAscii(
    "regionName",
    value,
    SHARED_RUNTIME_REGION_NAME_MAX_BYTES
  );
  if (regionName.length < 2 || regionName[0] !== "/" || regionName.slice(1).includes("/")) {
    throw new TypeError(
      "regionName must be a POSIX shared-memory name beginning with one slash"
    );
  }
  return regionName;
}
function assertPositiveSafeInteger2(name, value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}
function assertMasterGeneration(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > SESSION_ID_LAYOUT.maxMasterGeneration) {
    throw new TypeError(
      `masterGeneration must be a safe integer in [0, ${SESSION_ID_LAYOUT.maxMasterGeneration}]`
    );
  }
  return value;
}
function assertConnectionCapacity(value) {
  const capacity = assertPositiveSafeInteger2("connectionCapacity", value);
  const maximum = SESSION_ID_LAYOUT.maxSlotIndex + 1;
  if (capacity > maximum) {
    throw new TypeError(`connectionCapacity must not exceed ${maximum}`);
  }
  return capacity;
}
function assertExpected(descriptor, expected) {
  for (const key of Object.keys(expected)) {
    const expectedValue = expected[key];
    if (expectedValue !== void 0 && descriptor[key] !== expectedValue) {
      throw new TypeError(`${key} does not match the expected shared runtime`);
    }
  }
}
function validateSharedRuntimeDescriptor(value, expected = {}) {
  const descriptor = assertPlainExactRecord(value);
  if (descriptor.schemaVersion !== SHARED_RUNTIME_SCHEMA_VERSION) {
    throw new TypeError(
      `schemaVersion must be ${SHARED_RUNTIME_SCHEMA_VERSION}`
    );
  }
  const validated = Object.freeze({
    schemaVersion: SHARED_RUNTIME_SCHEMA_VERSION,
    layoutHash: assertBoundedVisibleAscii(
      "layoutHash",
      descriptor.layoutHash,
      SHARED_RUNTIME_LAYOUT_HASH_MAX_BYTES
    ),
    regionName: assertRegionName(descriptor.regionName),
    regionBytes: assertPositiveSafeInteger2("regionBytes", descriptor.regionBytes),
    capabilityToken: assertBoundedVisibleAscii(
      "capabilityToken",
      descriptor.capabilityToken,
      SHARED_RUNTIME_CAPABILITY_TOKEN_MAX_BYTES
    ),
    masterPid: createProcessPid(
      typeof descriptor.masterPid === "number" ? descriptor.masterPid : Number.NaN
    ),
    masterGeneration: assertMasterGeneration(descriptor.masterGeneration),
    connectionCapacity: assertConnectionCapacity(descriptor.connectionCapacity),
    workerCapacity: assertPositiveSafeInteger2(
      "workerCapacity",
      descriptor.workerCapacity
    )
  });
  assertExpected(validated, expected);
  return validated;
}
function createDetachedSharedRuntimeDescriptor(options) {
  return validateSharedRuntimeDescriptor({
    schemaVersion: SHARED_RUNTIME_SCHEMA_VERSION,
    layoutHash: "detached-test-runtime-v1",
    regionName: `/ts_swoole_detached_${options.masterPid}_${options.masterGeneration}`,
    regionBytes: 1,
    capabilityToken: "detached-test-runtime",
    masterPid: options.masterPid,
    masterGeneration: options.masterGeneration,
    connectionCapacity: options.connectionCapacity,
    workerCapacity: options.workerCapacity
  });
}

// src/shared-state/shared-runtime-state.ts
var SHARED_CONNECTION_STATE_CODES = new Map(
  CONNECTION_STATES.map((state, index) => [state, index + 1])
);
var SHARED_WORKER_STATE_CODES = new Map(
  WORKER_STATES.map((state, index) => [state, index + 1])
);
var SHARED_PROCESS_ROLE_CODES = Object.freeze({
  [PROCESS_ROLE.WORKER]: 1,
  [PROCESS_ROLE.TASK_WORKER]: 2,
  [PROCESS_ROLE.USER_TASK_WORKER]: 3
});
var SHARED_PROTOCOL_CODES = Object.freeze({ tcp: 1, websocket: 2 });
var SHARED_PROTOCOL_STATES = Object.freeze({
  TCP: 1,
  WEBSOCKET_HANDSHAKING: 2,
  WEBSOCKET_OPEN: 3
});
var SHARED_STAT_METRIC_COUNT = 96;
var SHARED_ATOMIC_CAPACITY = 16;
var SHARED_LOCK_CAPACITY = 16;
var SHARED_ATOMIC_STAT_BASE = 64;
var SHARED_RUNTIME_STAT_METRIC = Object.freeze({
  NETWORK_INPUT_PAUSE: 0,
  NETWORK_INPUT_RESUME: 1,
  NETWORK_INPUT_TIMEOUT: 2,
  NETWORK_OUTPUT_FULL: 3,
  NETWORK_OUTPUT_EMPTY: 4,
  NETWORK_OUTPUT_OVERFLOW: 5,
  NETWORK_OUTPUT_TIMEOUT: 6,
  NETWORK_OUTPUT_REJECTION: 7
});
function codeFor(values, value, name) {
  const code = values.get(value);
  if (code === void 0) {
    throw new TypeError(`${name} is not supported by the shared runtime ABI: ${value}`);
  }
  return code;
}
function stateFromCode(values, code, name) {
  const value = values[code - 1];
  if (value === void 0) {
    throw new TypeError(`shared ${name} code is invalid: ${code}`);
  }
  return value;
}
function processRoleFromCode(code) {
  if (code === SHARED_PROCESS_ROLE_CODES.WORKER) {
    return PROCESS_ROLE.WORKER;
  }
  if (code === SHARED_PROCESS_ROLE_CODES.TASK_WORKER) {
    return PROCESS_ROLE.TASK_WORKER;
  }
  if (code === SHARED_PROCESS_ROLE_CODES.USER_TASK_WORKER) {
    return PROCESS_ROLE.USER_TASK_WORKER;
  }
  throw new TypeError(`shared Worker role code is invalid: ${code}`);
}
function toNativeConnection(record) {
  return {
    ...record,
    state: codeFor(SHARED_CONNECTION_STATE_CODES, record.state, "Connection state"),
    protocol: SHARED_PROTOCOL_CODES[record.protocol]
  };
}
function fromNativeConnection(record) {
  const state = typeof record.state === "string" ? record.state : stateFromCode(CONNECTION_STATES, record.state, "Connection state");
  if (!CONNECTION_STATES.includes(state)) {
    throw new TypeError(`shared Connection state is invalid: ${state}`);
  }
  const protocol = record.protocol === SHARED_PROTOCOL_CODES.tcp || record.protocol === "tcp" ? "tcp" : record.protocol === SHARED_PROTOCOL_CODES.websocket || record.protocol === "websocket" ? "websocket" : null;
  if (protocol === null) {
    throw new TypeError(`shared protocol code is invalid: ${record.protocol}`);
  }
  return Object.freeze({
    ...record,
    sessionId: record.sessionId,
    ownerWorkerId: record.ownerWorkerId,
    state,
    protocol
  });
}
function toNativeWorker(record) {
  return {
    ...record,
    role: SHARED_PROCESS_ROLE_CODES[record.role],
    state: codeFor(SHARED_WORKER_STATE_CODES, record.state, "Worker state")
  };
}
function fromNativeWorker(record) {
  const state = typeof record.state === "string" ? record.state : stateFromCode(WORKER_STATES, record.state, "Worker state");
  if (!WORKER_STATES.includes(state)) {
    throw new TypeError(`shared Worker state is invalid: ${state}`);
  }
  const role = typeof record.role === "string" ? record.role === PROCESS_ROLE.WORKER || record.role === PROCESS_ROLE.TASK_WORKER || record.role === PROCESS_ROLE.USER_TASK_WORKER ? record.role : (() => {
    throw new TypeError(`shared Worker role is invalid: ${record.role}`);
  })() : processRoleFromCode(record.role);
  return Object.freeze({
    ...record,
    workerId: record.workerId,
    taskWorkerId: record.taskWorkerId,
    pid: record.pid,
    generation: record.generation,
    role,
    state
  });
}
function assertMetric(metricId, delta) {
  if (!Number.isSafeInteger(metricId) || metricId < 0 || metricId >= SHARED_STAT_METRIC_COUNT) {
    throw new RangeError(
      `metricId must be an integer in [0, ${SHARED_STAT_METRIC_COUNT - 1}]`
    );
  }
  if (!Number.isSafeInteger(delta)) {
    throw new RangeError("shared stat delta must be a safe integer");
  }
}
function assertSharedPrimitiveId(name, value, capacity) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= capacity) {
    throw new RangeError(`${name} must be an integer in [0, ${capacity - 1}]`);
  }
}
var NativeSharedRuntimeStateReader = class {
  descriptor;
  masterGeneration;
  binding;
  handle;
  #closed = false;
  constructor(binding, handle, descriptor) {
    this.binding = binding;
    this.handle = handle;
    this.descriptor = descriptor;
    this.masterGeneration = descriptor.masterGeneration;
  }
  probeConnection(sessionId) {
    if (this.#closed) {
      return Object.freeze({ status: "closed" });
    }
    const probe = this.binding.readConnection(this.handle, sessionId);
    return probe.record === void 0 ? Object.freeze({ status: probe.status }) : Object.freeze({
      status: probe.status,
      record: fromNativeConnection(probe.record)
    });
  }
  probeConnectionAdmission(sessionId) {
    if (this.#closed) {
      return Object.freeze({ status: "closed", overflow: false });
    }
    const value = this.binding.probeConnectionAdmission(this.handle, sessionId);
    const statusCode = value & 255;
    const status = statusCode === 1 ? "open" : statusCode === 2 ? "closed" : statusCode === 3 ? "stale" : statusCode === 4 ? "busy" : "unknown";
    return Object.freeze({
      status,
      overflow: status === "open" && (value & 256) !== 0
    });
  }
  snapshotOpenSessionIds() {
    if (this.#closed) {
      return Object.freeze([]);
    }
    return Object.freeze(
      this.binding.snapshotOpenSessionIds(this.handle).map((value) => value)
    );
  }
  connectionCount() {
    if (this.#closed) {
      return 0;
    }
    return this.binding.connectionCount(this.handle);
  }
  snapshotWorkers() {
    if (this.#closed) {
      return Object.freeze([]);
    }
    return Object.freeze(
      this.binding.snapshotWorkers(this.handle).map(fromNativeWorker)
    );
  }
  addStat(metricId, delta = 1) {
    assertMetric(metricId, delta);
    if (this.#closed) {
      throw new Error("shared runtime state reader is closed");
    }
    return this.binding.addStat(this.handle, metricId, delta);
  }
  snapshotStats() {
    if (this.#closed) {
      return Object.freeze(Array.from({ length: SHARED_STAT_METRIC_COUNT }, () => 0));
    }
    return Object.freeze([...this.binding.snapshotStats(this.handle)]);
  }
  atomicGet(atomicId) {
    assertSharedPrimitiveId("atomicId", atomicId, SHARED_ATOMIC_CAPACITY);
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.atomicGet(this.handle, atomicId);
  }
  atomicAdd(atomicId, delta) {
    assertSharedPrimitiveId("atomicId", atomicId, SHARED_ATOMIC_CAPACITY);
    return this.addStat(SHARED_ATOMIC_STAT_BASE + atomicId, delta);
  }
  atomicSet(atomicId, value) {
    assertSharedPrimitiveId("atomicId", atomicId, SHARED_ATOMIC_CAPACITY);
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.atomicSet(this.handle, atomicId, value);
  }
  atomicCompareSet(atomicId, expected, value) {
    assertSharedPrimitiveId("atomicId", atomicId, SHARED_ATOMIC_CAPACITY);
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.atomicCompareSet(this.handle, atomicId, expected, value);
  }
  lockTry(lockId, ownerToken) {
    assertSharedPrimitiveId("lockId", lockId, SHARED_LOCK_CAPACITY);
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.lockTry(this.handle, lockId, ownerToken);
  }
  lockRelease(lockId, ownerToken) {
    assertSharedPrimitiveId("lockId", lockId, SHARED_LOCK_CAPACITY);
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.lockRelease(this.handle, lockId, ownerToken);
  }
  clearLocks(ownerToken) {
    if (this.#closed) throw new Error("shared runtime state reader is closed");
    return this.binding.lockClearOwner(this.handle, ownerToken);
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    if (!this.binding.close(this.handle)) {
      throw new Error("shared runtime reader close was rejected");
    }
  }
  markClosed() {
    this.#closed = true;
  }
};
var NativeMasterSharedRuntimeState = class extends NativeSharedRuntimeStateReader {
  recovered;
  previousCleanShutdown;
  #key;
  #ledgerDirectory;
  #purgeLedgerOnRelease;
  #released = false;
  constructor(binding, handle, descriptor, recovered, previousCleanShutdown, key, ledgerDirectory, purgeLedgerOnRelease) {
    super(binding, handle, descriptor);
    this.recovered = recovered;
    this.previousCleanShutdown = previousCleanShutdown;
    this.#key = key;
    this.#ledgerDirectory = ledgerDirectory;
    this.#purgeLedgerOnRelease = purgeLedgerOnRelease;
  }
  publishConnection(record) {
    const parts = decodeSessionId(record.sessionId);
    if (parts.slotIndex !== record.slotIndex || parts.sessionGeneration !== record.sessionGeneration || parts.masterGeneration !== record.masterGeneration || parts.gatewayId !== record.gatewayId || record.masterGeneration !== this.masterGeneration) {
      throw new TypeError("shared Connection record does not match its Session ID");
    }
    if (!this.binding.publishConnection(this.handle, toNativeConnection(record))) {
      throw new Error(`shared Connection ${record.sessionId} publication was rejected`);
    }
  }
  publishWorker(record) {
    if (!this.binding.publishWorker(this.handle, toNativeWorker(record))) {
      throw new Error(`shared Worker ${record.workerId} publication was rejected`);
    }
  }
  release(cleanShutdown) {
    if (this.#released) {
      return;
    }
    try {
      if (!this.binding.destroy(this.handle, cleanShutdown)) {
        throw new Error("shared runtime Master release was rejected");
      }
    } catch (error) {
      this.markClosed();
      this.#released = true;
      throw error;
    }
    this.markClosed();
    this.#released = true;
    if (this.#purgeLedgerOnRelease) {
      this.binding.purgeLedger({
        key: this.#key,
        ledgerDirectory: this.#ledgerDirectory
      });
    }
  }
  close(_reason) {
    this.release(false);
  }
};
function effectiveConnectionCapacity(settings) {
  return Math.min(
    settings.max_conn ?? SESSION_ID_LAYOUT.maxSlotIndex + 1,
    SESSION_ID_LAYOUT.maxSlotIndex + 1
  );
}
function createRuntimeStateKey(settings, identity) {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return createHash2("sha256").update(`${uid}\0${identity}\0${settings.protocol}\0${settings.host}\0${settings.port}`).digest("hex");
}
var NativeSharedRuntimeStateProvider = class {
  #binding;
  constructor(binding = loadNativeRuntimeStateBinding()) {
    this.#binding = binding;
  }
  claimMaster(options) {
    const ledgerDirectory = options.ledgerDirectory ?? join(
      tmpdir(),
      `ts-swoole-runtime-state-${typeof process.getuid === "function" ? process.getuid() : 0}`
    );
    mkdirSync(ledgerDirectory, { recursive: true, mode: 448 });
    const purgeLedgerOnRelease = options.runtimeKey === void 0;
    const key = options.runtimeKey ?? createRuntimeStateKey(
      options.settings,
      `${process.cwd()}\0ephemeral:${process.pid}:${randomUUID()}`
    );
    const workerCapacity = options.settings.worker_num + options.settings.task_worker_num + (options.settings.user_task_worker_num ?? 0);
    if (workerCapacity > 4294967295) {
      throw new RangeError(
        "worker_num + task_worker_num + user_task_worker_num must fit the shared uint32 ABI"
      );
    }
    const claim = this.#binding.claimMaster({
      key,
      ledgerDirectory,
      connectionCapacity: effectiveConnectionCapacity(options.settings),
      workerCapacity,
      masterPid: options.masterPid,
      generationLimit: SESSION_ID_LAYOUT.maxMasterGeneration
    });
    let descriptor;
    try {
      descriptor = validateSharedRuntimeDescriptor(claim.descriptor, {
        masterPid: options.masterPid,
        masterGeneration: claim.masterGeneration,
        connectionCapacity: effectiveConnectionCapacity(options.settings),
        workerCapacity
      });
    } catch (error) {
      const cleanupFailures = [];
      let destroyed = false;
      try {
        if (!this.#binding.destroy(claim.handle, false)) {
          throw new Error("shared runtime claim rollback was rejected");
        }
        destroyed = true;
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
      if (purgeLedgerOnRelease && destroyed) {
        try {
          if (!this.#binding.purgeLedger({ key, ledgerDirectory })) {
            throw new Error("shared runtime claim ledger purge was rejected");
          }
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          [error, ...cleanupFailures],
          "shared runtime descriptor validation and claim rollback both failed"
        );
      }
      throw error;
    }
    return new NativeMasterSharedRuntimeState(
      this.#binding,
      claim.handle,
      descriptor,
      claim.recovered,
      claim.previousCleanShutdown,
      key,
      ledgerDirectory,
      purgeLedgerOnRelease
    );
  }
  attachReader(descriptor) {
    const validated = validateSharedRuntimeDescriptor(descriptor);
    return new NativeSharedRuntimeStateReader(
      this.#binding,
      this.#binding.attachReader(validated),
      validated
    );
  }
};
function sharedProtocolState(protocol, websocketOpen) {
  if (protocol === "tcp") {
    return SHARED_PROTOCOL_STATES.TCP;
  }
  return websocketOpen ? SHARED_PROTOCOL_STATES.WEBSOCKET_OPEN : SHARED_PROTOCOL_STATES.WEBSOCKET_HANDSHAKING;
}

// src/network/node-network-adapter.ts
import {
  createServer
} from "node:net";
var DEFAULT_NETWORK_READ_CHUNK_BYTES = 64 * 1024;
function forEachNetworkReadChunk(data, listener, maxChunkBytes = DEFAULT_NETWORK_READ_CHUNK_BYTES) {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 1) {
    throw new RangeError("maxChunkBytes must be a positive safe integer");
  }
  for (let offset = 0; offset < data.byteLength; offset += maxChunkBytes) {
    listener(data.subarray(offset, Math.min(data.byteLength, offset + maxChunkBytes)));
  }
}
var NodeNetworkConnection = class {
  adapterConnectionId = /* @__PURE__ */ Symbol("node-network-connection");
  peerInfo;
  #socket;
  #closing = false;
  constructor(socket) {
    this.#socket = socket;
    this.peerInfo = Object.freeze({
      remoteAddress: socket.remoteAddress ?? "",
      remotePort: socket.remotePort ?? 0,
      localAddress: socket.localAddress ?? "",
      localPort: socket.localPort ?? 0
    });
  }
  get destroyed() {
    return this.#socket.destroyed;
  }
  pause() {
    this.#socket.pause();
  }
  resume() {
    this.#socket.resume();
  }
  write(data) {
    if (this.#closing || this.#socket.destroyed || this.#socket.writableEnded || !this.#socket.writable) {
      throw new Error("Node network connection is not writable");
    }
    const accepted = this.#socket.write(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    );
    return Object.freeze({
      backpressured: !accepted,
      bufferedBytes: this.#socket.writableLength
    });
  }
  close(reason) {
    if (this.#closing || this.#socket.destroyed) {
      return;
    }
    this.#closing = true;
    if (!this.#socket.writable) {
      this.#socket.destroy(reason instanceof Error ? reason : void 0);
      return;
    }
    this.#socket.end();
    this.#socket.destroySoon();
  }
  forceClose(reason) {
    if (this.#socket.destroyed) {
      return;
    }
    this.#closing = true;
    this.#socket.destroy(reason instanceof Error ? reason : void 0);
  }
  setNoDelay(noDelay) {
    this.#socket.setNoDelay(noDelay);
  }
  onData(listener) {
    this.#socket.on("data", listener);
  }
  onDrain(listener) {
    this.#socket.on("drain", listener);
  }
  onEnd(listener) {
    this.#socket.on("end", listener);
  }
  onError(listener) {
    this.#socket.on("error", listener);
  }
  onClose(listener) {
    this.#socket.on("close", listener);
  }
};
function listenerInfo(address) {
  if (address === null || typeof address === "string") {
    throw new Error("Node network listener did not expose a TCP address");
  }
  return Object.freeze({
    host: address.address,
    port: address.port,
    family: address.family
  });
}
function isServerNotRunning(error) {
  return error instanceof Error && "code" in error && error.code === "ERR_SERVER_NOT_RUNNING";
}
var NodeNetworkAdapter = class {
  #connections = /* @__PURE__ */ new Set();
  #server;
  #events;
  #listenPromise;
  #closePromise;
  #listenResolved = false;
  #closeRequested = false;
  #noDelay = false;
  get activeConnectionCount() {
    return this.#connections.size;
  }
  listen(options, events) {
    if (this.#listenPromise !== void 0) {
      return this.#listenPromise;
    }
    if (this.#closeRequested) {
      return Promise.reject(new Error("Node network adapter is closing"));
    }
    this.#events = events;
    this.#noDelay = options.noDelay ?? false;
    const server = createServer({ allowHalfOpen: false }, (socket) => {
      this.#accept(socket);
    });
    this.#server = server;
    this.#listenPromise = new Promise((resolve4, reject) => {
      let settled = false;
      server.on("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
          return;
        }
        try {
          this.#events?.onListenerError(error);
        } catch {
        }
      });
      const listenOptions = options.backlog === void 0 ? { host: options.host, port: options.port } : { host: options.host, port: options.port, backlog: options.backlog };
      server.listen(listenOptions, () => {
        if (settled) {
          return;
        }
        if (this.#closeRequested) {
          settled = true;
          void this.#closeNativeListener().finally(() => {
            reject(new Error("Node network adapter closed while listening"));
          });
          return;
        }
        settled = true;
        this.#listenResolved = true;
        resolve4(listenerInfo(server.address()));
      });
    });
    void this.#listenPromise.catch(() => {
    });
    return this.#listenPromise;
  }
  closeListener() {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#closeRequested = true;
    this.#closePromise = (async () => {
      const listenPromise = this.#listenPromise;
      if (listenPromise !== void 0 && !this.#listenResolved) {
        await listenPromise.catch(() => {
        });
      }
      await this.#closeNativeListener();
    })();
    return this.#closePromise;
  }
  pauseConnection(connection) {
    this.#requireConnection(connection).pause();
  }
  resumeConnection(connection) {
    this.#requireConnection(connection).resume();
  }
  write(connection, data) {
    return this.#requireConnection(connection).write(data);
  }
  closeConnection(connection, reason) {
    if (!this.#connections.has(connection)) {
      throw new Error("Node network connection belongs to another adapter");
    }
    connection.close(reason);
  }
  getPeerInfo(connection) {
    return this.#requireConnection(connection).peerInfo;
  }
  async close(reason) {
    const listenerClose = this.closeListener();
    for (const connection of [...this.#connections]) {
      connection.forceClose(reason);
    }
    await listenerClose;
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
  #accept(socket) {
    const connection = new NodeNetworkConnection(socket);
    connection.setNoDelay(this.#noDelay);
    this.#connections.add(connection);
    connection.onData((data) => {
      this.#invokeConnectionCallback(connection, () => {
        forEachNetworkReadChunk(data, (chunk) => {
          this.#events?.onData(connection, chunk);
        });
      });
    });
    connection.onDrain(() => {
      this.#invokeConnectionCallback(connection, () => {
        this.#events?.onDrain(connection);
      });
    });
    connection.onEnd(() => {
      this.#invokeConnectionCallback(connection, () => {
        this.#events?.onEnd(connection);
      });
    });
    connection.onError((error) => {
      this.#reportConnectionError(connection, error);
    });
    connection.onClose((hadError) => {
      this.#connections.delete(connection);
      try {
        this.#events?.onClose(connection, hadError);
      } catch {
      }
    });
    if (this.#closeRequested) {
      connection.forceClose();
      return;
    }
    this.#invokeConnectionCallback(connection, () => {
      this.#events?.onConnection(connection);
    });
  }
  #invokeConnectionCallback(connection, callback) {
    try {
      callback();
    } catch (error) {
      this.#reportConnectionError(connection, error);
      connection.forceClose(error);
    }
  }
  #reportConnectionError(connection, error) {
    try {
      this.#events?.onError(connection, error);
    } catch {
    }
  }
  #requireConnection(connection) {
    if (!this.#connections.has(connection) || connection.destroyed) {
      throw new Error("Node network connection is closed or belongs to another adapter");
    }
    return connection;
  }
  #closeNativeListener() {
    const server = this.#server;
    if (server === void 0 || !server.listening) {
      return Promise.resolve();
    }
    return new Promise((resolve4, reject) => {
      server.close((error) => {
        if (error !== void 0 && !isServerNotRunning(error)) {
          reject(error);
          return;
        }
        resolve4();
      });
    });
  }
};

// src/native/rust-data-plane-binding.ts
import { createRequire as createRequire2 } from "node:module";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var require3 = createRequire2(import.meta.url);
var here2 = dirname2(fileURLToPath2(import.meta.url));
var addonPath2 = resolve2(
  here2,
  "..",
  "..",
  "build",
  "Release",
  "alloy_core_native.node"
);
var cachedBinding2;
function loadRustDataPlaneBinding() {
  cachedBinding2 ??= require3(addonPath2);
  return cachedBinding2;
}

// src/network/rust-network-adapter.ts
var BATCH_HEADER_BYTES = 4;
var EVENT_RECORD_BYTES = 12;
var CONNECTED_PAYLOAD_HEADER_BYTES = 8;
var EVENT_CONNECTED = 1;
var EVENT_DATA = 2;
var EVENT_END = 3;
var EVENT_ERROR = 4;
var EVENT_CLOSE = 5;
var EVENT_LISTENER_ERROR = 6;
var EVENT_BUFFER = 7;
var BUFFER_STATE_EMPTY = 0;
var BUFFER_STATE_FULL = 1;
var BUFFER_STATE_OVERFLOW = 2;
var WORKER_EVENT_CONNECT = 3;
var WORKER_EVENT_CLOSE = 4;
var WORKER_EVENT_BUFFER = 5;
var POLL_MAX_EVENTS = 4096;
var POLL_MAX_BYTES = 8 * 1024 * 1024;
var textDecoder = new TextDecoder();
var RustNetworkConnection = class {
  adapterConnectionId = /* @__PURE__ */ Symbol("rust-network-connection");
  nativeId;
  peerInfo;
  closed = false;
  inputSequence = 0;
  outputSequence = 0;
  bufferEventSequence = 0;
  constructor(nativeId, peerInfo) {
    this.nativeId = nativeId;
    this.peerInfo = peerInfo;
  }
};
function decodeBufferState(value) {
  if (value === BUFFER_STATE_EMPTY) {
    return "empty";
  }
  if (value === BUFFER_STATE_FULL) {
    return "full";
  }
  if (value === BUFFER_STATE_OVERFLOW) {
    return "overflow";
  }
  throw new TypeError(`Rust network buffer state ${value} is invalid`);
}
function readSafeUInt64BE(buffer, offset, name) {
  const value = buffer.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`Rust network ${name} exceeds JavaScript safe range`);
  }
  return Number(value);
}
function decodeBatch(batch) {
  if (batch.byteLength < BATCH_HEADER_BYTES) {
    throw new TypeError("Rust network event batch is truncated");
  }
  const count = batch.readUInt32BE(0);
  const events = [];
  let offset = BATCH_HEADER_BYTES;
  for (let index = 0; index < count; index += 1) {
    if (batch.byteLength - offset < EVENT_RECORD_BYTES) {
      throw new TypeError("Rust network event record is truncated");
    }
    const kind = batch[offset];
    const flags = batch[offset + 1];
    const connectionId = batch.readUInt32BE(offset + 4);
    const payloadBytes = batch.readUInt32BE(offset + 8);
    const payloadStart = offset + EVENT_RECORD_BYTES;
    const payloadEnd = payloadStart + payloadBytes;
    if (payloadEnd > batch.byteLength) {
      throw new TypeError("Rust network event payload is truncated");
    }
    events.push({
      kind,
      flags,
      connectionId,
      payload: batch.subarray(payloadStart, payloadEnd)
    });
    offset = payloadEnd;
  }
  if (offset !== batch.byteLength) {
    throw new TypeError("Rust network event batch contains trailing bytes");
  }
  return events;
}
function decodePeerInfo(payload) {
  if (payload.byteLength < CONNECTED_PAYLOAD_HEADER_BYTES) {
    throw new TypeError("Rust network connected event is truncated");
  }
  const remotePort = payload.readUInt16BE(0);
  const localPort = payload.readUInt16BE(2);
  const remoteAddressBytes = payload.readUInt16BE(4);
  const localAddressBytes = payload.readUInt16BE(6);
  const remoteStart = CONNECTED_PAYLOAD_HEADER_BYTES;
  const remoteEnd = remoteStart + remoteAddressBytes;
  const localEnd = remoteEnd + localAddressBytes;
  if (localEnd !== payload.byteLength) {
    throw new TypeError("Rust network connected addresses are invalid");
  }
  return Object.freeze({
    remoteAddress: textDecoder.decode(payload.subarray(remoteStart, remoteEnd)),
    remotePort,
    localAddress: textDecoder.decode(payload.subarray(remoteEnd, localEnd)),
    localPort
  });
}
var RustNetworkAdapter = class {
  deliversTcpFrames = true;
  routesTcpFramesToWorkers;
  #native;
  #options;
  #connections = /* @__PURE__ */ new Map();
  #events;
  #listenPromise;
  #closePromise;
  #pumpPromise;
  #closeRequested = false;
  constructor(native, options = {}) {
    this.#native = native ?? new (loadRustDataPlaneBinding()).NativeTcpServer();
    this.#options = Object.freeze({ ...options });
    this.routesTcpFramesToWorkers = options.dataPlanePath !== void 0;
  }
  get activeConnectionCount() {
    return this.#connections.size;
  }
  listen(options, events) {
    if (this.#listenPromise !== void 0) {
      return this.#listenPromise;
    }
    if (this.#closeRequested) {
      return Promise.reject(new Error("Rust network adapter is closing"));
    }
    this.#events = events;
    try {
      const info = this.#native.start({
        host: options.host,
        port: options.port,
        noDelay: options.noDelay ?? false,
        maxConnections: this.#options.maxConnections ?? 1024,
        maxFrameBytes: this.#options.maxFrameBytes ?? 512 * 1024,
        socketBufferBytes: this.#options.socketBufferBytes ?? 1024 * 1024,
        ...this.#options.bufferHighWatermarkBytes === void 0 ? {} : { bufferHighWatermarkBytes: this.#options.bufferHighWatermarkBytes },
        ...this.#options.bufferLowWatermarkBytes === void 0 ? {} : { bufferLowWatermarkBytes: this.#options.bufferLowWatermarkBytes },
        runtimeThreads: this.#options.runtimeThreads ?? 1,
        ...this.#options.dataPlanePath === void 0 ? {} : { dataPlanePath: this.#options.dataPlanePath },
        ...this.#options.dataPlaneQueueMessages === void 0 ? {} : { dataPlaneQueueMessages: this.#options.dataPlaneQueueMessages }
      });
      this.#listenPromise = Promise.resolve(Object.freeze(info));
      this.#pumpPromise = this.#pumpEvents();
    } catch (error) {
      this.#listenPromise = Promise.reject(error);
      void this.#listenPromise.catch(() => {
      });
    }
    return this.#listenPromise;
  }
  closeListener() {
    this.#native.stopAccepting();
    return Promise.resolve();
  }
  pauseConnection(connection) {
    const active = this.#requireConnection(connection);
    if (!this.#native.pause(active.nativeId)) {
      throw new Error("Rust network connection could not be paused");
    }
  }
  resumeConnection(connection) {
    const active = this.#requireConnection(connection);
    if (!this.#native.resume(active.nativeId)) {
      throw new Error("Rust network connection could not be resumed");
    }
  }
  write(connection, data) {
    const active = this.#requireConnection(connection);
    const result = this.#native.write(active.nativeId, data);
    if (!result.accepted) {
      throw new Error("Rust network connection is not writable");
    }
    return Object.freeze({
      backpressured: result.backpressured,
      bufferedBytes: result.bufferedBytes
    });
  }
  closeConnection(connection) {
    const active = this.#requireConnection(connection);
    this.#native.closeConnection(active.nativeId);
  }
  getPeerInfo(connection) {
    return this.#requireConnection(connection).peerInfo;
  }
  bindDataPlaneRoute(connection, route) {
    const active = this.#requireConnection(connection);
    if (!this.routesTcpFramesToWorkers) {
      return;
    }
    if (!this.#native.registerSession(
      active.nativeId,
      route.sessionId,
      route.workerId,
      route.workerGeneration,
      route.inputSequence,
      route.outputSequence
    )) {
      throw new Error("Rust network connection could not bind its Worker route");
    }
  }
  getDataPlaneCounters(connection) {
    if (!this.routesTcpFramesToWorkers) {
      return void 0;
    }
    const counters = connection.closed ? {
      inputSequence: connection.inputSequence,
      outputSequence: connection.outputSequence
    } : this.#native.sessionCounters(this.#requireConnection(connection).nativeId);
    return counters === void 0 ? void 0 : Object.freeze({ ...counters });
  }
  deliverDataPlaneControl(event) {
    if (!this.routesTcpFramesToWorkers) {
      return Promise.reject(new Error("Rust Worker data plane is not enabled"));
    }
    return this.#native.deliverWorkerControl(
      {
        workerId: event.workerId,
        workerGeneration: event.workerGeneration,
        eventKind: event.type === "connect" ? WORKER_EVENT_CONNECT : event.type === "close" ? WORKER_EVENT_CLOSE : WORKER_EVENT_BUFFER,
        sessionId: event.sessionId,
        sequence: event.sequence,
        timeoutMs: 5e3
      },
      event.payload
    );
  }
  async close() {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#closeRequested = true;
    this.#closePromise = Promise.resolve().then(() => {
      this.#native.close();
      this.#connections.clear();
    });
    return this.#closePromise;
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
  async #pumpEvents() {
    try {
      while (!this.#closeRequested && (this.#native.running || this.#connections.size !== 0)) {
        const events = decodeBatch(
          await this.#native.waitEvents(POLL_MAX_EVENTS, POLL_MAX_BYTES, 100)
        );
        for (const event of events) {
          this.#dispatch(event);
        }
      }
    } catch (error) {
      this.#reportListenerError(error);
      if (!this.#closeRequested) {
        void this.close();
      }
    }
  }
  #dispatch(event) {
    if (event.kind === EVENT_CONNECTED) {
      const connection2 = new RustNetworkConnection(
        event.connectionId,
        decodePeerInfo(event.payload)
      );
      this.#connections.set(connection2.nativeId, connection2);
      this.#invoke(connection2, () => this.#events?.onConnection(connection2));
      return;
    }
    if (event.kind === EVENT_LISTENER_ERROR) {
      this.#reportListenerError(new Error(textDecoder.decode(event.payload)));
      return;
    }
    const connection = this.#connections.get(event.connectionId);
    if (connection === void 0) {
      return;
    }
    if (event.kind === EVENT_DATA) {
      this.#invoke(connection, () => this.#events?.onData(connection, event.payload));
    } else if (event.kind === EVENT_END) {
      this.#invoke(connection, () => this.#events?.onEnd(connection));
    } else if (event.kind === EVENT_ERROR) {
      this.#invoke(connection, () => {
        this.#events?.onError(connection, new Error(textDecoder.decode(event.payload)));
      });
    } else if (event.kind === EVENT_BUFFER) {
      if (event.payload.byteLength !== 16) {
        this.#invoke(connection, () => {
          throw new TypeError("Rust network buffer event is invalid");
        });
        return;
      }
      const bufferedBytes = readSafeUInt64BE(
        event.payload,
        0,
        "buffered byte count"
      );
      const sequence = readSafeUInt64BE(event.payload, 8, "buffer event sequence");
      if (sequence <= connection.bufferEventSequence) {
        return;
      }
      connection.bufferEventSequence = sequence;
      const state = decodeBufferState(event.flags);
      this.#invoke(connection, () => {
        this.#events?.onBufferChange?.(connection, state, bufferedBytes);
      });
    } else if (event.kind === EVENT_CLOSE) {
      if (event.payload.byteLength === 16) {
        const inputSequence = Number(event.payload.readBigUInt64BE(0));
        const outputSequence = Number(event.payload.readBigUInt64BE(8));
        if (Number.isSafeInteger(inputSequence) && Number.isSafeInteger(outputSequence)) {
          connection.inputSequence = inputSequence;
          connection.outputSequence = outputSequence;
        }
      }
      connection.closed = true;
      this.#connections.delete(connection.nativeId);
      try {
        this.#events?.onClose(connection, (event.flags & 1) !== 0);
      } catch {
      }
    }
  }
  #invoke(connection, callback) {
    try {
      callback();
    } catch (error) {
      try {
        this.#events?.onError(connection, error);
      } catch {
      }
      this.#native.closeConnection(connection.nativeId);
    }
  }
  #reportListenerError(error) {
    try {
      this.#events?.onListenerError(error);
    } catch {
    }
  }
  #requireConnection(connection) {
    if (connection.closed || this.#connections.get(connection.nativeId) !== connection) {
      throw new Error("Rust network connection is closed or belongs to another adapter");
    }
    return connection;
  }
};

// src/network/tcp-frame-codec.ts
var DEFAULT_TCP_MAX_FRAME_BYTES = 512 * 1024;
var DEFAULT_TCP_LENGTH_OFFSET = 0;
var DEFAULT_TCP_LENGTH_FIELD_BYTES = 4;
var DEFAULT_TCP_BODY_OFFSET = 5;
var TcpFrameProtocolError = class extends Error {
  code;
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TcpFrameProtocolError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
};
var EMPTY_BUFFER2 = Buffer.alloc(0);
function assertNonNegativeSafeInteger4(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function maximumUnsignedValue(byteLength2) {
  return byteLength2 === 4 ? 4294967295 : 2 ** (byteLength2 * 8) - 1;
}
var TcpFrameCodec = class {
  lengthOffset;
  lengthFieldBytes;
  bodyOffset;
  maxFrameBytes;
  #headerBytes;
  #buffer = EMPTY_BUFFER2;
  constructor(options = {}) {
    this.lengthOffset = options.lengthOffset ?? DEFAULT_TCP_LENGTH_OFFSET;
    this.lengthFieldBytes = options.lengthFieldBytes ?? DEFAULT_TCP_LENGTH_FIELD_BYTES;
    this.bodyOffset = options.bodyOffset ?? DEFAULT_TCP_BODY_OFFSET;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_TCP_MAX_FRAME_BYTES;
    assertNonNegativeSafeInteger4("lengthOffset", this.lengthOffset);
    assertNonNegativeSafeInteger4("bodyOffset", this.bodyOffset);
    assertNonNegativeSafeInteger4("maxFrameBytes", this.maxFrameBytes);
    const lengthFieldEnd = this.lengthOffset + this.lengthFieldBytes;
    if (this.bodyOffset < lengthFieldEnd) {
      throw new RangeError(
        `bodyOffset ${this.bodyOffset} must not overlap the length field ending at ${lengthFieldEnd}`
      );
    }
    if (this.maxFrameBytes < this.bodyOffset) {
      throw new RangeError(
        `maxFrameBytes ${this.maxFrameBytes} must be at least bodyOffset ${this.bodyOffset}`
      );
    }
    this.#headerBytes = Math.max(this.bodyOffset, lengthFieldEnd);
  }
  get bufferedBytes() {
    return this.#buffer.byteLength;
  }
  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("TCP chunk must be a Uint8Array");
    }
    if (chunk.byteLength === 0) {
      return Object.freeze([]);
    }
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.#buffer = this.#buffer.byteLength === 0 ? incoming : Buffer.concat([this.#buffer, incoming]);
    const frames = [];
    let offset = 0;
    while (this.#buffer.byteLength - offset >= this.#headerBytes) {
      const bodyLength = this.#buffer.readUIntBE(
        offset + this.lengthOffset,
        this.lengthFieldBytes
      );
      const frameLength = this.bodyOffset + bodyLength;
      if (!Number.isSafeInteger(frameLength)) {
        this.#buffer = EMPTY_BUFFER2;
        throw new TcpFrameProtocolError(
          "LENGTH_OUT_OF_RANGE",
          "TCP frame length is outside the safe integer range",
          { bodyLength, bodyOffset: this.bodyOffset }
        );
      }
      if (frameLength > this.maxFrameBytes) {
        this.#buffer = EMPTY_BUFFER2;
        throw new TcpFrameProtocolError(
          "FRAME_TOO_LARGE",
          `TCP frame size ${frameLength} exceeds ${this.maxFrameBytes} bytes`,
          { bodyLength, frameLength, maxFrameBytes: this.maxFrameBytes }
        );
      }
      if (this.#buffer.byteLength - offset < frameLength) {
        break;
      }
      frames.push(
        offset === 0 && frameLength === this.#buffer.byteLength ? this.#buffer : this.#buffer.subarray(offset, offset + frameLength)
      );
      offset += frameLength;
    }
    if (offset !== 0) {
      this.#buffer = offset === this.#buffer.byteLength ? EMPTY_BUFFER2 : Buffer.from(this.#buffer.subarray(offset));
    }
    return Object.freeze(frames);
  }
  encode(body, header) {
    if (!(body instanceof Uint8Array)) {
      throw new TypeError("TCP frame body must be a Uint8Array");
    }
    if (header !== void 0 && header.byteLength !== this.bodyOffset) {
      throw new RangeError(
        `TCP frame header must contain exactly ${this.bodyOffset} bytes`
      );
    }
    const frameLength = this.bodyOffset + body.byteLength;
    if (frameLength > this.maxFrameBytes) {
      throw new TcpFrameProtocolError(
        "FRAME_TOO_LARGE",
        `TCP frame size ${frameLength} exceeds ${this.maxFrameBytes} bytes`,
        { bodyLength: body.byteLength, frameLength, maxFrameBytes: this.maxFrameBytes }
      );
    }
    if (body.byteLength > maximumUnsignedValue(this.lengthFieldBytes)) {
      throw new TcpFrameProtocolError(
        "LENGTH_OUT_OF_RANGE",
        `TCP body size ${body.byteLength} does not fit a ${this.lengthFieldBytes}-byte length field`,
        { bodyLength: body.byteLength, lengthFieldBytes: this.lengthFieldBytes }
      );
    }
    const frame = Buffer.allocUnsafe(frameLength);
    if (header === void 0) {
      frame.fill(0, 0, this.bodyOffset);
    } else {
      frame.set(header, 0);
    }
    frame.writeUIntBE(body.byteLength, this.lengthOffset, this.lengthFieldBytes);
    frame.set(body, this.bodyOffset);
    return frame;
  }
  reset() {
    this.#buffer = EMPTY_BUFFER2;
  }
};

// src/network/rust-tcp-frame-codec.ts
var ERROR_SEPARATOR = "|";
function assertNonNegativeSafeInteger5(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function nativeProtocolError(error) {
  if (!(error instanceof Error)) {
    throw error;
  }
  const marker = error.message.lastIndexOf("FRAME_TOO_LARGE|") >= 0 ? "FRAME_TOO_LARGE" : error.message.lastIndexOf("LENGTH_OUT_OF_RANGE|") >= 0 ? "LENGTH_OUT_OF_RANGE" : void 0;
  if (marker === void 0) {
    throw error;
  }
  const encoded = error.message.slice(error.message.lastIndexOf(marker));
  const fields = encoded.split(ERROR_SEPARATOR).slice(1).map(Number);
  if (marker === "FRAME_TOO_LARGE") {
    const [bodyLength2, frameLength, maxFrameBytes] = fields;
    throw new TcpFrameProtocolError(
      marker,
      `TCP frame size ${frameLength} exceeds ${maxFrameBytes} bytes`,
      { bodyLength: bodyLength2, frameLength, maxFrameBytes }
    );
  }
  const [bodyLength, context] = fields;
  throw new TcpFrameProtocolError(
    marker,
    "TCP frame length is outside the supported range",
    { bodyLength, context }
  );
}
var RustTcpFrameCodec = class {
  lengthOffset;
  lengthFieldBytes;
  bodyOffset;
  maxFrameBytes;
  #native;
  constructor(options = {}) {
    this.lengthOffset = options.lengthOffset ?? DEFAULT_TCP_LENGTH_OFFSET;
    this.lengthFieldBytes = options.lengthFieldBytes ?? DEFAULT_TCP_LENGTH_FIELD_BYTES;
    this.bodyOffset = options.bodyOffset ?? DEFAULT_TCP_BODY_OFFSET;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_TCP_MAX_FRAME_BYTES;
    assertNonNegativeSafeInteger5("lengthOffset", this.lengthOffset);
    assertNonNegativeSafeInteger5("bodyOffset", this.bodyOffset);
    assertNonNegativeSafeInteger5("maxFrameBytes", this.maxFrameBytes);
    const lengthFieldEnd = this.lengthOffset + this.lengthFieldBytes;
    if (this.bodyOffset < lengthFieldEnd) {
      throw new RangeError(
        `bodyOffset ${this.bodyOffset} must not overlap the length field ending at ${lengthFieldEnd}`
      );
    }
    if (this.maxFrameBytes < this.bodyOffset) {
      throw new RangeError(
        `maxFrameBytes ${this.maxFrameBytes} must be at least bodyOffset ${this.bodyOffset}`
      );
    }
    const { NativeTcpFrameCodec } = loadRustDataPlaneBinding();
    this.#native = new NativeTcpFrameCodec(
      this.lengthOffset,
      this.lengthFieldBytes,
      this.bodyOffset,
      this.maxFrameBytes
    );
  }
  get bufferedBytes() {
    return this.#native.bufferedBytes;
  }
  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("TCP chunk must be a Uint8Array");
    }
    try {
      return Object.freeze(this.#native.push(chunk));
    } catch (error) {
      nativeProtocolError(error);
    }
  }
  encode(body, header) {
    if (!(body instanceof Uint8Array)) {
      throw new TypeError("TCP frame body must be a Uint8Array");
    }
    if (header !== void 0 && header.byteLength !== this.bodyOffset) {
      throw new RangeError(
        `TCP frame header must contain exactly ${this.bodyOffset} bytes`
      );
    }
    try {
      return this.#native.encode(body, header);
    } catch (error) {
      nativeProtocolError(error);
    }
  }
  reset() {
    this.#native.reset();
  }
};

// src/network/network-server.ts
var HTTP_BAD_REQUEST = Buffer.from(
  "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
  "ascii"
);
var HTTP_UPGRADE_REQUIRED = Buffer.from(
  "HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nSec-WebSocket-Version: 13\r\nContent-Length: 0\r\n\r\n",
  "ascii"
);
var SHARED_ACTIVITY_PUBLISH_INTERVAL_MS = 1e3;
var NETWORK_GRACEFUL_CLOSE_TIMEOUT_MS = 250;
var DEFAULT_NETWORK_EVENT_SINK_CLOSE_TIMEOUT_MS = 1e3;
var DEFAULT_BUFFER_OUTPUT_SIZE = 2 * 1024 * 1024;
var DEFAULT_SOCKET_BUFFER_SIZE = 1 * 1024 * 1024;
var DEFAULT_BACKPRESSURE_TIMEOUT_MS = 5e3;
function readString2(read, fallback) {
  try {
    return String(read());
  } catch {
    return fallback;
  }
}
function describeError2(error) {
  let errorValue = null;
  try {
    if (error instanceof Error) {
      errorValue = error;
    }
  } catch {
  }
  if (errorValue !== null) {
    return {
      errorName: readString2(() => errorValue.name, "Error"),
      errorMessage: readString2(
        () => errorValue.message,
        "<unreadable error message>"
      )
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: readString2(() => error, "<unprintable thrown value>")
  };
}
function closedCause(kind, details = {}) {
  return Object.freeze({ kind, ...details });
}
var NetworkServer = class {
  sessions;
  connections;
  #context;
  #adapter;
  #sharedStats;
  #eventSink;
  #eventSinkCloseTimeoutMs;
  #protocol;
  #tcpFrameCodecFactory;
  #webSocketHandshakeParserFactory;
  #webSocketFrameParserFactory;
  #bufferOutputSize;
  #socketBufferSize;
  #bufferHighWatermark;
  #bufferLowWatermark;
  #backpressureTimeoutMs;
  #idleTimeoutMs;
  #readTimeoutMs;
  #writeTimeoutMs;
  #outputDrainTimers = /* @__PURE__ */ new Map();
  #lastReadAt = /* @__PURE__ */ new Map();
  #lastWriteAt = /* @__PURE__ */ new Map();
  #activityTimeoutTimer;
  #bufferFullEvents = 0;
  #bufferEmptyEvents = 0;
  #bufferOverflowEvents = 0;
  #drainTimeouts = 0;
  #writeRejections = 0;
  #address;
  #listenPromise;
  #stopAcceptingPromise;
  #listenerCloseCompletion;
  #closeConnectionsPromise;
  #closePromise;
  #accepting = true;
  #closing = false;
  constructor(options) {
    if (options.eventSink !== void 0 && options.eventSinkFactory !== void 0) {
      throw new TypeError("NetworkServer accepts either eventSink or eventSinkFactory, not both");
    }
    this.#context = options.context;
    this.#adapter = options.adapter ?? ((options.rustDataPlane === true || process.env.ALLOY_CORE_RUST_NETWORK === "1") && options.context.settings.protocol === "tcp" ? new RustNetworkAdapter(void 0, {
      ...options.context.settings.max_conn === void 0 ? {} : { maxConnections: options.context.settings.max_conn },
      ...options.context.settings.socket_buffer_size === void 0 ? {} : { socketBufferBytes: options.context.settings.socket_buffer_size },
      ...options.context.settings.buffer_high_watermark === void 0 ? {} : {
        bufferHighWatermarkBytes: options.context.settings.buffer_high_watermark
      },
      ...options.context.settings.buffer_low_watermark === void 0 ? {} : {
        bufferLowWatermarkBytes: options.context.settings.buffer_low_watermark
      },
      ...options.rustDataPlane === true ? {
        dataPlanePath: rustDataPlanePath(
          options.context.masterPid,
          options.context.masterGeneration
        ),
        dataPlaneQueueMessages: 4096,
        runtimeThreads: 1
      } : {}
    }) : new NodeNetworkAdapter());
    this.#sharedStats = options.sharedConnections;
    this.#eventSinkCloseTimeoutMs = options.eventSinkCloseTimeoutMs ?? DEFAULT_NETWORK_EVENT_SINK_CLOSE_TIMEOUT_MS;
    assertTimerDelay(
      this.#eventSinkCloseTimeoutMs,
      "eventSinkCloseTimeoutMs"
    );
    this.#protocol = options.context.settings.protocol;
    const outputSettings = options.context.settings;
    this.#bufferOutputSize = outputSettings.buffer_output_size ?? DEFAULT_BUFFER_OUTPUT_SIZE;
    this.#socketBufferSize = outputSettings.socket_buffer_size ?? DEFAULT_SOCKET_BUFFER_SIZE;
    this.#bufferHighWatermark = outputSettings.buffer_high_watermark ?? Math.floor(this.#socketBufferSize * 0.8);
    this.#bufferLowWatermark = outputSettings.buffer_low_watermark ?? 0;
    this.#backpressureTimeoutMs = outputSettings.backpressure_timeout_ms ?? DEFAULT_BACKPRESSURE_TIMEOUT_MS;
    this.#idleTimeoutMs = outputSettings.idle_timeout_ms;
    this.#readTimeoutMs = outputSettings.read_timeout_ms;
    this.#writeTimeoutMs = outputSettings.write_timeout_ms;
    assertTimerDelay(this.#backpressureTimeoutMs, "backpressure_timeout_ms");
    this.#tcpFrameCodecFactory = options.tcpFrameCodecFactory ?? (process.env.ALLOY_CORE_RUST_TCP_CODEC === "1" ? () => new RustTcpFrameCodec() : () => new TcpFrameCodec());
    this.#webSocketHandshakeParserFactory = options.webSocketHandshakeParserFactory ?? (() => new WebSocketHandshakeParser());
    this.#webSocketFrameParserFactory = options.webSocketFrameParserFactory ?? (() => new WebSocketFrameParser());
    const layoutCapacity = SESSION_ID_LAYOUT.maxSlotIndex + 1;
    const configuredCapacity = options.context.settings.max_conn ?? layoutCapacity;
    const capacity = Math.min(configuredCapacity, layoutCapacity);
    if (configuredCapacity > layoutCapacity) {
      options.context.log("warn", "runtime.network.max_conn_clamped", {
        configuredMaxConnections: configuredCapacity,
        effectiveMaxConnections: capacity
      });
    }
    this.sessions = new SessionManager({
      masterGeneration: options.context.masterGeneration,
      maxConnections: capacity
    });
    this.connections = new ConnectionRegistry({
      sessions: this.sessions,
      operations: this.#adapter,
      clock: options.context.clock,
      activityPublishIntervalMs: SHARED_ACTIVITY_PUBLISH_INTERVAL_MS,
      onClosed: (connection) => this.#handleClosed(connection),
      ...options.sharedConnections === void 0 ? {} : {
        onRecordChanged: (record) => {
          try {
            const parts = decodeSessionId(record.sessionId);
            const protocol = record.protocolState.kind;
            options.sharedConnections?.publishConnection({
              sessionId: record.sessionId,
              slotIndex: parts.slotIndex,
              sessionGeneration: parts.sessionGeneration,
              masterGeneration: parts.masterGeneration,
              gatewayId: parts.gatewayId,
              ownerWorkerId: record.ownerWorkerId,
              state: record.state,
              protocol,
              protocolState: sharedProtocolState(
                protocol,
                protocol === "tcp" || record.protocolState.phase === "open"
              ),
              remoteAddress: record.peerInfo.remoteAddress,
              remotePort: record.peerInfo.remotePort,
              serverPort: record.peerInfo.localPort,
              connectedAtMs: record.connectedAt,
              lastActiveAtMs: record.lastActiveAt,
              outputBufferBytes: record.outputBufferedBytes,
              outputBufferFull: record.outputBufferFull,
              overflow: record.overflow
            });
          } catch (error) {
            options.context.metrics.recordError();
            options.context.log("error", "runtime.shared.connection_publish_failed", {
              sessionId: record.sessionId,
              error: error instanceof Error ? error.message : String(error)
            });
            options.context.requestStop(error);
            throw error;
          }
        }
      }
    });
    this.#eventSink = options.eventSink ?? options.eventSinkFactory?.(this.connections);
  }
  get address() {
    return this.#address;
  }
  get routesTcpFramesToWorkers() {
    return this.#adapter.routesTcpFramesToWorkers === true;
  }
  routeSessionToWorker(sessionId, workerId, workerGeneration) {
    const bind = this.#adapter.bindDataPlaneRoute;
    if (typeof bind !== "function") {
      return;
    }
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state !== "OPEN") {
      throw new Error(`Connection ${sessionId} is unavailable for native routing`);
    }
    const handle = this.connections.getHandle(sessionId);
    if (handle === void 0) {
      throw new Error(`Connection ${sessionId} has no native handle`);
    }
    bind.call(this.#adapter, handle, {
      sessionId,
      workerId,
      workerGeneration,
      inputSequence: record.inputSequence,
      outputSequence: record.outputSequence
    });
  }
  deliverDataPlaneControl(type, sessionId, workerId, workerGeneration, sequence, payload) {
    const deliver = this.#adapter.deliverDataPlaneControl;
    if (typeof deliver !== "function") {
      return Promise.reject(new Error("Network adapter has no native control lane"));
    }
    const serialized = JSON.stringify(payload);
    if (typeof serialized !== "string") {
      return Promise.reject(new TypeError("Native control payload is not JSON serializable"));
    }
    return deliver.call(this.#adapter, {
      type,
      sessionId,
      workerId,
      workerGeneration,
      sequence,
      payload: Buffer.from(serialized, "utf8")
    });
  }
  synchronizeDataPlaneSession(sessionId) {
    const readCounters = this.#adapter.getDataPlaneCounters;
    if (typeof readCounters !== "function") {
      return;
    }
    const handle = this.connections.getHandle(sessionId);
    if (handle === void 0) {
      return;
    }
    const counters = readCounters.call(this.#adapter, handle);
    if (counters !== void 0) {
      this.connections.synchronizeSequences(
        sessionId,
        counters.inputSequence,
        counters.outputSequence
      );
    }
  }
  async waitForDataPlaneSessionPaused(sessionId, timeoutMs = 5e3) {
    const readCounters = this.#adapter.getDataPlaneCounters;
    if (typeof readCounters !== "function") {
      return;
    }
    const startedAt = this.#context.clock.monotonicTimeMs();
    while (true) {
      const handle = this.connections.getHandle(sessionId);
      if (handle === void 0) {
        return;
      }
      const counters = readCounters.call(this.#adapter, handle);
      if (counters === void 0 || counters.paused === true) {
        this.synchronizeDataPlaneSession(sessionId);
        return;
      }
      if (this.#context.clock.monotonicTimeMs() - startedAt >= timeoutMs) {
        throw new Error(
          `Connection ${sessionId} native data plane did not pause within ${timeoutMs}ms`
        );
      }
      await new Promise((resolve4) => setTimeout(resolve4, 1));
    }
  }
  get closing() {
    return this.#closing;
  }
  stats() {
    let inputQueuedBytes = 0;
    let outputBufferedBytes = 0;
    let outputBufferFullConnections = 0;
    let outputBufferOverflowConnections = 0;
    for (const sessionId of this.connections) {
      const record = this.connections.get(sessionId);
      if (record === void 0) {
        continue;
      }
      inputQueuedBytes = this.#boundedAdd(
        inputQueuedBytes,
        record.inputBufferedBytes
      );
      outputBufferedBytes = Math.min(
        Number.MAX_SAFE_INTEGER,
        outputBufferedBytes + record.outputBufferedBytes
      );
      if (record.outputBufferFull) {
        outputBufferFullConnections += 1;
      }
      if (record.overflow) {
        outputBufferOverflowConnections += 1;
      }
    }
    const sinkStats = this.#eventSink?.stats?.();
    inputQueuedBytes = this.#boundedAdd(
      inputQueuedBytes,
      sinkStats?.pendingBytes ?? 0
    );
    return Object.freeze({
      inputQueuedBytes,
      inputPausedConnections: sinkStats?.pausedConnections ?? 0,
      inputPauseEvents: sinkStats?.pauseTransitions ?? 0,
      inputResumeEvents: sinkStats?.resumeTransitions ?? 0,
      inputTimeouts: sinkStats?.recoveryTimeouts ?? 0,
      inputRejections: sinkStats?.queueRejections ?? 0,
      bufferFullEvents: this.#bufferFullEvents,
      bufferEmptyEvents: this.#bufferEmptyEvents,
      bufferOverflowEvents: this.#bufferOverflowEvents,
      drainTimeouts: this.#drainTimeouts,
      writeRejections: this.#writeRejections,
      outputBufferedBytes,
      outputBufferFullConnections,
      outputBufferOverflowConnections
    });
  }
  sendSession(sessionId, data) {
    const record = this.#commandRecord(sessionId, "tcp");
    if ("accepted" in record) {
      return this.#recordWriteRejection(record);
    }
    if (data.byteLength === 0) {
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.INVALID_PAYLOAD,
        error: new TypeError("TCP send data must not be empty")
      }));
    }
    const sizeRejection = this.#messageSizeRejection(sessionId, data.byteLength);
    if (sizeRejection !== void 0) {
      return this.#recordWriteRejection(sizeRejection);
    }
    return this.#writeCommand(sessionId, data, false);
  }
  pushSession(sessionId, data, opcode) {
    const record = this.#commandRecord(sessionId, "websocket");
    if ("accepted" in record) {
      return this.#recordWriteRejection(record);
    }
    const sizeRejection = this.#messageSizeRejection(sessionId, data.byteLength);
    if (sizeRejection !== void 0) {
      return this.#recordWriteRejection(sizeRejection);
    }
    let frame;
    let closeAfterWrite = false;
    try {
      if (opcode === WEB_SOCKET_OPCODE.CLOSE) {
        const reason = new TextDecoder("utf-8", { fatal: true }).decode(data);
        frame = encodeWebSocketCloseFrame(1e3, reason);
        closeAfterWrite = true;
      } else {
        frame = encodeWebSocketFrame({
          opcode,
          data
        });
      }
    } catch (error) {
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.INVALID_PAYLOAD,
        error
      }));
    }
    return this.#writeCommand(sessionId, frame, closeAfterWrite);
  }
  closeSession(sessionId, code = 1e3, reason = "") {
    const record = this.connections.get(sessionId);
    if (record === void 0) {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.UNKNOWN_SESSION
      });
    }
    if (record.state === "CLOSING") {
      return Object.freeze({
        accepted: true,
        outputSequence: null,
        backpressured: false,
        closeStarted: false
      });
    }
    if (record.state !== "OPEN") {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.SESSION_NOT_OPEN
      });
    }
    if (record.protocolState.kind === "websocket") {
      try {
        this.#writeInternal(sessionId, encodeWebSocketCloseFrame(code, reason));
      } catch (error) {
        return this.#recordWriteRejection(Object.freeze({
          accepted: false,
          reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.INVALID_PAYLOAD,
          error
        }));
      }
    }
    const closeStarted = this.connections.beginClose(
      sessionId,
      closedCause("worker-close-command")
    );
    return Object.freeze({
      accepted: true,
      outputSequence: null,
      backpressured: false,
      closeStarted
    });
  }
  listen() {
    if (this.#listenPromise !== void 0) {
      return this.#listenPromise;
    }
    if (!this.#accepting || this.#closing || this.#context.signal.aborted) {
      return Promise.reject(new Error("NetworkServer cannot listen while closing"));
    }
    const settings = this.#context.settings;
    const listenOptions = settings.backlog === void 0 ? {
      host: settings.host,
      port: settings.port,
      noDelay: settings.open_tcp_nodelay ?? false
    } : {
      host: settings.host,
      port: settings.port,
      backlog: settings.backlog,
      noDelay: settings.open_tcp_nodelay ?? false
    };
    const events = {
      onConnection: (connection) => this.#handleConnection(connection),
      onData: (connection, data) => this.#handleData(connection, data),
      onDrain: (connection) => this.#handleDrain(connection),
      onBufferChange: (connection, state, bufferedBytes) => this.#handleBufferChange(connection, state, bufferedBytes),
      onEnd: (connection) => this.#handleEnd(connection),
      onError: (connection, error) => this.#handleConnectionError(connection, error),
      onClose: (connection, hadError) => this.#handleNativeClose(connection, hadError),
      onListenerError: (error) => this.#handleListenerError(error)
    };
    this.#listenPromise = (async () => {
      const address = await this.#adapter.listen(listenOptions, events);
      if (!this.#accepting || this.#closing || this.#context.signal.aborted) {
        throw new Error("NetworkServer closed while the listener was starting");
      }
      this.#address = Object.freeze({ ...address });
      this.#context.log("info", "runtime.network.listening", {
        host: address.host,
        port: address.port,
        family: address.family,
        protocol: this.#protocol
      });
      this.#scheduleActivityTimeoutSweep();
    })();
    void this.#listenPromise.catch(() => {
    });
    return this.#listenPromise;
  }
  close(reason) {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#closing = true;
    this.#activityTimeoutTimer?.cancel(reason);
    this.#activityTimeoutTimer = void 0;
    let resolveClose;
    let rejectClose;
    const closePromise = new Promise((resolve4, reject) => {
      resolveClose = resolve4;
      rejectClose = reject;
    });
    this.#closePromise = closePromise;
    void this.#performClose(reason).then(resolveClose, rejectClose);
    void closePromise.catch(() => void 0);
    return closePromise;
  }
  stopAccepting(_reason) {
    if (this.#stopAcceptingPromise !== void 0) {
      return this.#stopAcceptingPromise;
    }
    this.#accepting = false;
    this.#listenerCloseCompletion = this.#captureCleanup(
      () => this.#adapter.closeListener()
    );
    void this.#listenerCloseCompletion.catch(() => void 0);
    this.#address = void 0;
    this.#stopAcceptingPromise = Promise.resolve();
    void this.#stopAcceptingPromise.catch(() => void 0);
    return this.#stopAcceptingPromise;
  }
  closeConnections(reason) {
    if (this.#closeConnectionsPromise !== void 0) {
      return this.#closeConnectionsPromise;
    }
    this.#closing = true;
    this.#activityTimeoutTimer?.cancel(reason);
    this.#activityTimeoutTimer = void 0;
    this.#closeConnectionsPromise = this.#performConnectionsClose(reason);
    void this.#closeConnectionsPromise.catch(() => void 0);
    return this.#closeConnectionsPromise;
  }
  async #performClose(reason) {
    const stopAccepting = this.stopAccepting(reason);
    const listenerClose = this.#listenerCloseCompletion ?? stopAccepting;
    const closeConnections = this.closeConnections(reason);
    const adapterClose = this.#adapter.routesTcpFramesToWorkers === true ? closeConnections.then(
      () => this.#captureCleanup(() => this.#adapter.close(reason)),
      () => this.#captureCleanup(() => this.#adapter.close(reason))
    ) : void 0;
    const closeEventSink = () => this.#captureCleanup(() => this.#eventSink?.close?.(reason));
    const eventSinkClose = adapterClose === void 0 ? closeConnections.then(closeEventSink, closeEventSink) : Promise.allSettled([closeConnections, adapterClose]).then(closeEventSink);
    const results = await Promise.allSettled([
      stopAccepting,
      listenerClose,
      closeConnections,
      ...adapterClose === void 0 ? [] : [adapterClose],
      eventSinkClose
    ]);
    const failures = results.flatMap(
      (result) => result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "NetworkServer cleanup failed");
    }
  }
  async #performConnectionsClose(reason) {
    for (const timer of this.#outputDrainTimers.values()) {
      timer.cancel(reason);
    }
    this.#outputDrainTimers.clear();
    for (const sessionId of this.connections) {
      const record = this.connections.get(sessionId);
      if (record?.state === "OPEN" && record.protocolState.kind === "websocket") {
        this.#writeInternal(sessionId, encodeWebSocketCloseFrame(1001));
      }
    }
    const registryClose = this.#captureCleanup(() => this.connections.closeAll(reason));
    if (this.#adapter.routesTcpFramesToWorkers === true) {
      await registryClose;
      return;
    }
    let startAdapterClose;
    const adapterClose = new Promise((resolve4, reject) => {
      let started = false;
      startAdapterClose = () => {
        if (started) {
          return;
        }
        started = true;
        void this.#captureCleanup(() => this.#adapter.close(reason)).then(resolve4, reject);
      };
    });
    void adapterClose.catch(() => void 0);
    let gracefulCloseTimer;
    let timerClose;
    try {
      gracefulCloseTimer = this.#context.timers.setTimeout(
        NETWORK_GRACEFUL_CLOSE_TIMEOUT_MS,
        startAdapterClose
      );
      timerClose = gracefulCloseTimer.done;
      void timerClose.then(startAdapterClose, startAdapterClose);
    } catch (error) {
      timerClose = Promise.reject(error);
      startAdapterClose();
    }
    const finishGracePeriod = () => {
      gracefulCloseTimer?.cancel(reason);
      startAdapterClose();
    };
    void registryClose.then(finishGracePeriod, finishGracePeriod);
    const results = await Promise.allSettled([
      registryClose,
      timerClose,
      adapterClose
    ]);
    const failures = results.flatMap(
      (result) => result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "NetworkServer connection cleanup failed");
    }
  }
  #captureCleanup(cleanup) {
    try {
      return Promise.resolve(cleanup());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  #handleConnection(connection) {
    if (!this.#accepting || this.#closing) {
      this.#closeUnregistered(connection, closedCause("server-closing"));
      return;
    }
    const protocolState = this.#protocol === "tcp" ? { kind: "tcp", frames: this.#tcpFrameCodecFactory() } : {
      kind: "websocket",
      phase: "handshaking",
      handshake: this.#webSocketHandshakeParserFactory(),
      frames: this.#webSocketFrameParserFactory()
    };
    let record;
    try {
      record = this.connections.add(connection, protocolState);
      const now = this.#context.clock.wallTimeMs();
      this.#lastReadAt.set(record.sessionId, now);
      this.#lastWriteAt.set(record.sessionId, now);
    } catch (error) {
      if (error instanceof SessionCapacityExhaustedError) {
        this.#context.log("warn", "runtime.network.connection_rejected", {
          reason: "max_conn",
          activeConnections: this.connections.size,
          capacity: this.sessions.capacity
        });
      } else {
        this.#context.log("error", "runtime.network.connection_registration_failed", {
          ...describeError2(error)
        });
      }
      this.#closeUnregistered(connection, error);
      return;
    }
    try {
      if (protocolState.kind === "tcp") {
        const opened = this.connections.markOpen(record.sessionId);
        if (opened !== void 0) {
          void this.#emit({
            type: "opened",
            protocol: "tcp",
            sessionId: opened.sessionId,
            connectedAt: opened.connectedAt,
            peerInfo: opened.peerInfo
          }).catch(() => void 0);
        }
      } else {
        this.connections.markHandshaking(record.sessionId);
      }
    } catch (error) {
      this.#context.log("error", "runtime.network.connection_open_failed", {
        sessionId: record.sessionId,
        ...describeError2(error)
      });
      this.connections.beginClose(record.sessionId, error);
    }
  }
  #handleData(connection, data) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId === void 0) {
      this.#closeUnregistered(connection, closedCause("unknown-connection-data"));
      return;
    }
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING") {
      return;
    }
    this.connections.touchActivity(sessionId);
    this.#lastReadAt.set(sessionId, this.#context.clock.wallTimeMs());
    try {
      if (record.protocolState.kind === "tcp") {
        this.#handleTcpData(sessionId, record.protocolState, data);
      } else {
        this.#handleWebSocketData(sessionId, record.protocolState, data);
      }
    } catch (error) {
      this.#handleProtocolError(sessionId, record.protocolState, error);
    }
  }
  #handleTcpData(sessionId, protocolState, data) {
    const frames = this.#adapter.deliversTcpFrames === true ? [Buffer.from(data.buffer, data.byteOffset, data.byteLength)] : protocolState.frames.push(data);
    this.#setInputBufferedBytes(
      sessionId,
      this.#adapter.deliversTcpFrames === true ? 0 : protocolState.frames.bufferedBytes
    );
    for (const frame of frames) {
      const inputSequence = this.connections.nextInputSequence(sessionId);
      if (inputSequence === void 0) {
        return;
      }
      void this.#emit({
        type: "message",
        protocol: "tcp",
        sessionId,
        inputSequence,
        data: frame,
        finish: true
      }).catch(() => void 0);
      if (this.connections.get(sessionId)?.state === "CLOSING") {
        return;
      }
    }
  }
  #handleWebSocketData(sessionId, protocolState, data) {
    let frameData = data;
    if (protocolState.phase === "handshaking") {
      const result = protocolState.handshake.push(data);
      this.#setInputBufferedBytes(sessionId, protocolState.handshake.bufferedBytes);
      if (result === null) {
        return;
      }
      this.#writeInternal(
        sessionId,
        createWebSocketHandshakeResponse(result.request)
      );
      protocolState.phase = "open";
      const opened = this.connections.markOpen(sessionId);
      if (opened === void 0) {
        return;
      }
      void this.#emit({
        type: "opened",
        protocol: "websocket",
        sessionId,
        connectedAt: opened.connectedAt,
        peerInfo: opened.peerInfo,
        request: result.request
      }).catch(() => void 0);
      frameData = result.remainingData;
    }
    if (frameData.byteLength === 0 || this.connections.get(sessionId)?.state === "CLOSING") {
      return;
    }
    const events = protocolState.frames.push(frameData);
    this.#setInputBufferedBytes(sessionId, protocolState.frames.bufferedBytes);
    this.#handleWebSocketEvents(sessionId, events);
  }
  #handleWebSocketEvents(sessionId, events) {
    for (const event of events) {
      if (event.type === "message") {
        const inputSequence = this.connections.nextInputSequence(sessionId);
        if (inputSequence === void 0) {
          return;
        }
        void this.#emit({
          type: "message",
          protocol: "websocket",
          sessionId,
          inputSequence,
          data: event.data,
          opcode: event.opcode,
          finish: true
        }).catch(() => void 0);
      } else if (event.type === "ping") {
        this.#writeInternal(
          sessionId,
          encodeWebSocketFrame({
            opcode: WEB_SOCKET_OPCODE.PONG,
            data: event.data
          })
        );
      } else if (event.type === "close") {
        const closeFrame = event.code === null ? encodeWebSocketFrame({ opcode: WEB_SOCKET_OPCODE.CLOSE }) : encodeWebSocketCloseFrame(event.code, event.reason);
        this.#writeInternal(sessionId, closeFrame);
        this.connections.beginClose(
          sessionId,
          closedCause("websocket-close", {
            code: event.code,
            reason: event.reason
          })
        );
      }
      if (this.connections.get(sessionId)?.state === "CLOSING") {
        return;
      }
    }
  }
  #handleProtocolError(sessionId, protocolState, error) {
    this.#context.log("warn", "runtime.network.protocol_error", {
      sessionId,
      protocol: protocolState.kind,
      ...describeError2(error)
    });
    if (protocolState.kind === "websocket") {
      if (protocolState.phase === "handshaking") {
        const response = error instanceof WebSocketProtocolError && error.details.httpStatus === 426 ? HTTP_UPGRADE_REQUIRED : HTTP_BAD_REQUEST;
        this.#writeInternal(sessionId, response);
      } else {
        const closeCode = error instanceof WebSocketProtocolError ? error.closeCode ?? 1002 : 1002;
        try {
          this.#writeInternal(sessionId, encodeWebSocketCloseFrame(closeCode));
        } catch {
        }
      }
    }
    this.connections.beginClose(sessionId, error);
  }
  #handleEnd(connection) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId !== void 0) {
      this.connections.beginClose(sessionId, closedCause("remote-end"));
    }
  }
  #handleDrain(connection) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId === void 0) {
      return;
    }
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING") {
      return;
    }
    const outputBufferedBytes = 0;
    this.connections.setBufferedBytes(
      sessionId,
      record.inputBufferedBytes,
      outputBufferedBytes
    );
    this.connections.setOverflow(sessionId, false);
    if (record.outputBufferFull && outputBufferedBytes <= this.#bufferLowWatermark) {
      this.connections.setOutputBufferFull(sessionId, false);
      this.#cancelDrainTimeout(sessionId);
      this.#bufferEmptyEvents = this.#incrementCounter(this.#bufferEmptyEvents);
      this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_EMPTY);
      this.#recordMetric(() => this.#context.metrics.recordNetworkOutputBufferEmpty());
      this.#emitBufferEvent(sessionId, record.protocolState.kind, "empty");
    }
    this.connections.touchActivity(sessionId);
  }
  #handleBufferChange(connection, state, bufferedBytes) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId === void 0) {
      return;
    }
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING") {
      return;
    }
    if (!Number.isSafeInteger(bufferedBytes) || bufferedBytes < 0) {
      this.#handleConnectionError(
        connection,
        new TypeError("native output buffered bytes must be a non-negative safe integer")
      );
      return;
    }
    if (state === "empty") {
      if (bufferedBytes > this.#bufferLowWatermark) {
        this.#handleConnectionError(
          connection,
          new TypeError(
            `native empty transition exceeds low watermark: ${bufferedBytes}`
          )
        );
        return;
      }
      this.connections.setBufferedBytes(
        sessionId,
        record.inputBufferedBytes,
        bufferedBytes
      );
      this.connections.setOverflow(sessionId, false);
      if (record.outputBufferFull) {
        this.connections.setOutputBufferFull(sessionId, false);
        this.#cancelDrainTimeout(sessionId);
        this.#bufferEmptyEvents = this.#incrementCounter(this.#bufferEmptyEvents);
        this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_EMPTY);
        this.#recordMetric(() => this.#context.metrics.recordNetworkOutputBufferEmpty());
        this.#emitBufferEvent(sessionId, record.protocolState.kind, "empty");
      }
      this.connections.touchActivity(sessionId);
      return;
    }
    const threshold = state === "overflow" ? this.#socketBufferSize : this.#bufferHighWatermark;
    const observedBytes = Math.max(
      record.outputBufferedBytes,
      bufferedBytes,
      threshold
    );
    this.connections.setBufferedBytes(
      sessionId,
      record.inputBufferedBytes,
      observedBytes
    );
    this.#updateOutputBufferState(
      sessionId,
      record.protocolState.kind,
      observedBytes
    );
    this.connections.touchActivity(sessionId);
  }
  #handleConnectionError(connection, error) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId !== void 0) {
      this.#context.log("warn", "runtime.network.connection_error", {
        sessionId,
        ...describeError2(error)
      });
      this.connections.beginClose(sessionId, error);
    }
  }
  #handleNativeClose(connection, hadError) {
    const sessionId = this.connections.getSessionId(connection);
    if (sessionId !== void 0) {
      const counters = this.#adapter.getDataPlaneCounters?.(connection);
      if (counters !== void 0) {
        this.connections.synchronizeSequences(
          sessionId,
          counters.inputSequence,
          counters.outputSequence
        );
      }
    }
    this.connections.finalizeClose(
      connection,
      closedCause("native-close", { hadError })
    );
  }
  #handleClosed(record) {
    this.#lastReadAt.delete(record.sessionId);
    this.#lastWriteAt.delete(record.sessionId);
    this.#cancelDrainTimeout(record.sessionId, record.closeCause);
    const event = {
      type: "closed",
      protocol: record.protocolState.kind,
      sessionId: record.sessionId,
      ownerWorkerId: record.ownerWorkerId,
      inputSequence: record.inputSequence,
      outputSequence: record.outputSequence,
      connectedAt: record.connectedAt,
      lastActiveAt: record.lastActiveAt,
      peerInfo: record.peerInfo,
      outputBufferedBytes: record.outputBufferedBytes,
      outputBufferState: record.overflow ? "overflow" : record.outputBufferFull ? "full" : "empty",
      cause: record.closeCause
    };
    if (this.#eventSink === void 0) {
      return Promise.resolve();
    }
    const delivery = this.#emit(event, false);
    void delivery.catch(() => void 0);
    let rejectTimeout;
    const timeout = new Promise((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeoutError = new Error(
      "Network event sink close delivery for Session " + record.sessionId + " timed out after " + this.#eventSinkCloseTimeoutMs + "ms"
    );
    const timer = this.#context.timers.setTimeout(
      this.#eventSinkCloseTimeoutMs,
      () => {
        this.#handleEventSinkFailure(event, timeoutError, false);
        rejectTimeout(timeoutError);
      }
    );
    return Promise.race([delivery, timeout]).finally(() => {
      timer.cancel();
    });
  }
  #handleListenerError(error) {
    this.#context.metrics.recordError();
    this.#context.log("error", "runtime.network.listener_error", describeError2(error));
    this.#context.requestStop(error);
    void this.close(error).catch((cleanupError) => {
      this.#context.log(
        "error",
        "runtime.network.listener_cleanup_failed",
        describeError2(cleanupError)
      );
    });
  }
  #writeInternal(sessionId, data) {
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING" || record.outputSequence >= Number.MAX_SAFE_INTEGER) {
      return false;
    }
    if (this.#outputOverflowRejection(record) !== void 0) {
      this.#writeRejections = this.#incrementCounter(this.#writeRejections);
      this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_REJECTION);
      return false;
    }
    try {
      const result = this.connections.write(sessionId, data);
      if (result === void 0) {
        return false;
      }
      const outputSequence = this.connections.nextOutputSequence(sessionId);
      if (outputSequence === void 0) {
        return false;
      }
      this.connections.touchActivity(sessionId);
      this.#lastWriteAt.set(sessionId, this.#context.clock.wallTimeMs());
      this.#updateOutputBufferState(
        sessionId,
        record.protocolState.kind,
        result.bufferedBytes
      );
      return true;
    } catch (error) {
      this.connections.beginClose(sessionId, error);
      return false;
    }
  }
  #commandRecord(sessionId, protocol) {
    if (this.#closing) {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.SESSION_NOT_OPEN
      });
    }
    const record = this.connections.get(sessionId);
    if (record === void 0) {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.UNKNOWN_SESSION
      });
    }
    if (record.state !== "OPEN") {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.SESSION_NOT_OPEN
      });
    }
    if (record.protocolState.kind !== protocol) {
      return Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.PROTOCOL_MISMATCH
      });
    }
    return record;
  }
  #writeCommand(sessionId, data, closeAfterWrite) {
    const record = this.connections.get(sessionId);
    if (record === void 0) {
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.UNKNOWN_SESSION
      }));
    }
    if (record.state !== "OPEN") {
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.SESSION_NOT_OPEN
      }));
    }
    if (record.outputSequence >= Number.MAX_SAFE_INTEGER) {
      const error = new RangeError(
        `Connection ${sessionId} outputSequence exhausted the safe integer range`
      );
      this.connections.beginClose(sessionId, error);
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.OUTPUT_SEQUENCE_EXHAUSTED,
        error
      }));
    }
    const overflowRejection = this.#outputOverflowRejection(record);
    if (overflowRejection !== void 0) {
      return this.#recordWriteRejection(overflowRejection);
    }
    try {
      const write = this.connections.write(sessionId, data);
      if (write === void 0) {
        return this.#recordWriteRejection(Object.freeze({
          accepted: false,
          reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.SESSION_NOT_OPEN
        }));
      }
      const outputSequence = this.connections.nextOutputSequence(sessionId);
      if (outputSequence === void 0) {
        throw new Error(
          `Connection ${sessionId} disappeared after an accepted write`
        );
      }
      this.connections.touchActivity(sessionId);
      this.#lastWriteAt.set(sessionId, this.#context.clock.wallTimeMs());
      this.#updateOutputBufferState(
        sessionId,
        record.protocolState.kind,
        write.bufferedBytes
      );
      if (closeAfterWrite) {
        this.connections.beginClose(
          sessionId,
          closedCause("websocket-close-command", { code: 1e3 })
        );
        this.#cancelDrainTimeout(sessionId);
      }
      return Object.freeze({
        accepted: true,
        outputSequence,
        backpressured: write.backpressured,
        closeStarted: closeAfterWrite
      });
    } catch (error) {
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.network.command_write_failed", {
        sessionId,
        ...describeError2(error)
      });
      this.connections.beginClose(sessionId, error);
      return this.#recordWriteRejection(Object.freeze({
        accepted: false,
        reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.WRITE_FAILED,
        error
      }));
    }
  }
  #setInputBufferedBytes(sessionId, inputBufferedBytes) {
    const record = this.connections.get(sessionId);
    if (record !== void 0) {
      this.connections.setBufferedBytes(
        sessionId,
        inputBufferedBytes,
        record.outputBufferedBytes
      );
    }
  }
  #messageSizeRejection(sessionId, messageBytes) {
    if (messageBytes <= this.#bufferOutputSize) {
      return void 0;
    }
    const error = new FrameworkError(
      "MESSAGE_TOO_LARGE",
      `Network message for Session ${sessionId} is ${messageBytes} bytes; limit is ${this.#bufferOutputSize}`,
      {
        sessionId,
        messageBytes,
        bufferOutputSize: this.#bufferOutputSize
      }
    );
    return Object.freeze({
      accepted: false,
      reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.MESSAGE_TOO_LARGE,
      error
    });
  }
  #outputOverflowRejection(record) {
    if (!record.overflow && record.outputBufferedBytes < this.#socketBufferSize) {
      return void 0;
    }
    this.#updateOutputBufferState(
      record.sessionId,
      record.protocolState.kind,
      record.outputBufferedBytes
    );
    const error = new FrameworkError(
      "OUTPUT_BUFFER_OVERFLOW",
      `Connection ${record.sessionId} output buffer is full at ${record.outputBufferedBytes} bytes`,
      {
        sessionId: record.sessionId,
        outputBufferedBytes: record.outputBufferedBytes,
        socketBufferSize: this.#socketBufferSize
      }
    );
    return Object.freeze({
      accepted: false,
      reason: NETWORK_COMMAND_WRITE_REJECTION_REASON.OUTPUT_BUFFER_OVERFLOW,
      error
    });
  }
  #updateOutputBufferState(sessionId, protocol, outputBufferedBytes) {
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING") {
      return;
    }
    const becameFull = outputBufferedBytes > 0 && !record.outputBufferFull && (outputBufferedBytes >= this.#bufferHighWatermark || outputBufferedBytes >= this.#socketBufferSize);
    const becameOverflow = !record.overflow && outputBufferedBytes >= this.#socketBufferSize;
    if (becameFull) {
      this.connections.setOutputBufferFull(sessionId, true);
    }
    if (becameOverflow) {
      this.connections.setOverflow(sessionId, true);
    }
    if (becameFull) {
      this.#bufferFullEvents = this.#incrementCounter(this.#bufferFullEvents);
      this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_FULL);
      this.#recordMetric(() => this.#context.metrics.recordNetworkOutputBufferFull());
      this.#startDrainTimeout(sessionId);
      this.#emitBufferEvent(sessionId, protocol, "full");
    }
    if (becameOverflow) {
      this.#bufferOverflowEvents = this.#incrementCounter(
        this.#bufferOverflowEvents
      );
      this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_OVERFLOW);
      this.#recordMetric(() => this.#context.metrics.recordNetworkOutputBufferOverflow());
      this.#emitBufferEvent(sessionId, protocol, "overflow");
    }
  }
  #emitBufferEvent(sessionId, protocol, state) {
    void this.#emit({ type: "buffer", state, protocol, sessionId }).catch(
      () => void 0
    );
  }
  #startDrainTimeout(sessionId) {
    if (this.#outputDrainTimers.has(sessionId)) {
      return;
    }
    try {
      const timer = this.#context.timers.setTimeout(
        this.#backpressureTimeoutMs,
        () => this.#handleDrainTimeout(sessionId)
      );
      this.#outputDrainTimers.set(sessionId, timer);
    } catch (error) {
      this.connections.beginClose(sessionId, error);
    }
  }
  #cancelDrainTimeout(sessionId, reason) {
    const timer = this.#outputDrainTimers.get(sessionId);
    if (timer === void 0) {
      return;
    }
    this.#outputDrainTimers.delete(sessionId);
    timer.cancel(reason);
  }
  #handleDrainTimeout(sessionId) {
    this.#outputDrainTimers.delete(sessionId);
    const record = this.connections.get(sessionId);
    if (record === void 0 || record.state === "CLOSING" || !record.outputBufferFull) {
      return;
    }
    const error = new FrameworkError(
      "DRAIN_TIMEOUT",
      `Connection ${sessionId} output buffer did not drain within ${this.#backpressureTimeoutMs}ms`,
      {
        sessionId,
        timeoutMs: this.#backpressureTimeoutMs,
        outputBufferedBytes: record.outputBufferedBytes
      }
    );
    this.#drainTimeouts = this.#incrementCounter(this.#drainTimeouts);
    this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_TIMEOUT);
    this.#context.metrics.recordError();
    this.#context.log("warn", "runtime.network.output_drain_timeout", {
      sessionId,
      outputBufferedBytes: record.outputBufferedBytes,
      timeoutMs: this.#backpressureTimeoutMs
    });
    this.connections.beginClose(sessionId, error);
  }
  #recordWriteRejection(rejection) {
    this.#writeRejections = this.#incrementCounter(this.#writeRejections);
    this.#recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_REJECTION);
    return rejection;
  }
  #recordSharedStat(metricId) {
    const addStat = this.#sharedStats?.addStat;
    if (typeof addStat !== "function") {
      return;
    }
    try {
      addStat.call(this.#sharedStats, metricId);
    } catch (error) {
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.shared.stat_publish_failed", {
        metricId,
        error: error instanceof Error ? error.message : String(error)
      });
      this.#context.requestStop(error);
    }
  }
  #incrementCounter(current) {
    return current >= Number.MAX_SAFE_INTEGER ? current : current + 1;
  }
  #scheduleActivityTimeoutSweep() {
    if (this.#closing || this.#idleTimeoutMs === void 0 && this.#readTimeoutMs === void 0 && this.#writeTimeoutMs === void 0) {
      return;
    }
    const configured = [this.#idleTimeoutMs, this.#readTimeoutMs, this.#writeTimeoutMs].filter((value) => value !== void 0);
    const delayMs = Math.max(100, Math.min(...configured, 1e3));
    this.#activityTimeoutTimer = this.#context.timers.setTimeout(delayMs, () => {
      this.#activityTimeoutTimer = void 0;
      this.#sweepActivityTimeouts();
      this.#scheduleActivityTimeoutSweep();
    });
  }
  #sweepActivityTimeouts() {
    const now = this.#context.clock.wallTimeMs();
    for (const sessionId of this.connections) {
      const record = this.connections.get(sessionId);
      if (record === void 0 || record.state === "CLOSING") continue;
      const lastReadAt = this.#lastReadAt.get(sessionId) ?? record.connectedAt;
      const lastWriteAt = this.#lastWriteAt.get(sessionId) ?? record.connectedAt;
      const idleAt = Math.max(lastReadAt, lastWriteAt);
      const timeout = this.#idleTimeoutMs !== void 0 && now - idleAt >= this.#idleTimeoutMs ? { kind: "idle", limit: this.#idleTimeoutMs, elapsed: now - idleAt } : this.#readTimeoutMs !== void 0 && now - lastReadAt >= this.#readTimeoutMs ? { kind: "read", limit: this.#readTimeoutMs, elapsed: now - lastReadAt } : this.#writeTimeoutMs !== void 0 && now - lastWriteAt >= this.#writeTimeoutMs ? { kind: "write", limit: this.#writeTimeoutMs, elapsed: now - lastWriteAt } : void 0;
      if (timeout === void 0) continue;
      const error = new FrameworkError(
        "DRAIN_TIMEOUT",
        `Connection ${sessionId} ${timeout.kind} timeout after ${timeout.elapsed}ms`,
        { sessionId, timeoutKind: timeout.kind, timeoutMs: timeout.limit }
      );
      this.#context.log("warn", "runtime.network.activity_timeout", {
        sessionId,
        timeoutKind: timeout.kind,
        timeoutMs: timeout.limit,
        elapsedMs: timeout.elapsed
      });
      this.connections.beginClose(sessionId, error);
    }
  }
  #boundedAdd(left, right) {
    return Math.min(Number.MAX_SAFE_INTEGER, left + right);
  }
  #recordMetric(record) {
    try {
      record();
    } catch {
    }
  }
  async #emit(event, closeOnFailure = true) {
    const frozenEvent = Object.freeze(event);
    try {
      await this.#eventSink?.handle(frozenEvent);
    } catch (error) {
      this.#handleEventSinkFailure(frozenEvent, error, closeOnFailure);
      throw error;
    }
  }
  #handleEventSinkFailure(event, error, closeOnFailure) {
    this.#context.log("error", "runtime.network.event_sink_failed", {
      eventType: event.type,
      sessionId: event.sessionId,
      ...describeError2(error)
    });
    if (closeOnFailure) {
      this.connections.beginClose(event.sessionId, error);
    }
  }
  #closeUnregistered(connection, reason) {
    try {
      this.#adapter.closeConnection(connection, reason);
    } catch {
    }
  }
};

// src/process/process-supervisor.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { AsyncLocalStorage as AsyncLocalStorage4 } from "node:async_hooks";
import { constants as OS_CONSTANTS } from "node:os";

// src/task/master-task-router.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/process/worker-registry.ts
function assertPoolSize(name, value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}, got ${value}`);
  }
}
function freezeSlot(slot) {
  return Object.freeze({ ...slot });
}
function freezeRecord(record) {
  return Object.freeze({ ...record });
}
var WorkerRegistry = class {
  workerNum;
  taskWorkerNum;
  userTaskWorkerNum;
  #clock;
  #onRecordChanged;
  #records = /* @__PURE__ */ new Map();
  #issuedInstances = /* @__PURE__ */ new WeakSet();
  constructor(options) {
    assertPoolSize("workerNum", options.workerNum, 1);
    assertPoolSize("taskWorkerNum", options.taskWorkerNum, 0);
    const userTaskWorkerNum = options.userTaskWorkerNum ?? 0;
    assertPoolSize("userTaskWorkerNum", userTaskWorkerNum, 0);
    const size = options.workerNum + options.taskWorkerNum + userTaskWorkerNum;
    if (!Number.isSafeInteger(size)) {
      throw new RangeError(
        `workerNum + taskWorkerNum + userTaskWorkerNum must be a safe integer, got ${size}`
      );
    }
    this.workerNum = options.workerNum;
    this.taskWorkerNum = options.taskWorkerNum;
    this.userTaskWorkerNum = userTaskWorkerNum;
    this.#clock = options.clock ?? new SystemClock();
    this.#onRecordChanged = options.onRecordChanged;
  }
  get size() {
    return this.workerNum + this.taskWorkerNum + this.userTaskWorkerNum;
  }
  get activeSize() {
    return this.#records.size;
  }
  *slots() {
    for (let index = 0; index < this.workerNum; index += 1) {
      yield freezeSlot({
        workerId: createWorkerId(index),
        role: PROCESS_ROLE.WORKER,
        taskWorkerId: null
      });
    }
    for (let index = 0; index < this.taskWorkerNum; index += 1) {
      const taskWorkerId = createTaskWorkerId(index);
      yield freezeSlot({
        workerId: toGlobalTaskWorkerId(this.workerNum, taskWorkerId, this.taskWorkerNum),
        role: PROCESS_ROLE.TASK_WORKER,
        taskWorkerId
      });
    }
    for (let index = 0; index < this.userTaskWorkerNum; index += 1) {
      yield freezeSlot({
        workerId: toGlobalUserTaskWorkerId(
          this.workerNum,
          this.taskWorkerNum,
          createTaskWorkerId(index),
          this.userTaskWorkerNum
        ),
        role: PROCESS_ROLE.USER_TASK_WORKER,
        taskWorkerId: null
      });
    }
  }
  getSlot(workerId) {
    const slot = this.#findSlot(workerId);
    return slot === void 0 ? void 0 : freezeSlot(slot);
  }
  get(workerId) {
    const record = this.#records.get(workerId);
    return record === void 0 ? void 0 : this.#snapshotRecord(record);
  }
  require(workerId) {
    return this.#snapshotRecord(this.#requireRecord(workerId));
  }
  snapshot() {
    return Object.freeze(
      [...this.#records.values()].sort((left, right) => left.workerId - right.workerId).map((record) => this.#snapshotRecord(record))
    );
  }
  isCurrent(instance) {
    if (!this.#isIssuedInstance(instance)) {
      return false;
    }
    const record = this.#records.get(instance.workerId);
    return record !== void 0 && record.generation === instance.generation;
  }
  beginSpawn(workerId) {
    const slot = this.#requireSlot(workerId);
    const previous = this.#records.get(workerId);
    let generation;
    let restartCount;
    if (previous === void 0) {
      generation = createWorkerGeneration(1);
      restartCount = 0;
    } else {
      assertWorkerTransition(previous.state, WORKER_STATE.SPAWNING);
      generation = createWorkerGeneration(previous.generation + 1);
      restartCount = previous.restartCount + 1;
    }
    const record = {
      ...slot,
      pid: null,
      generation,
      state: WORKER_STATE.SPAWNING,
      restartCount,
      startedAt: this.#clock.wallTimeMs(),
      readyAt: null,
      lastHeartbeatAt: null
    };
    this.#records.set(workerId, record);
    try {
      return this.#publishRecord(record, true);
    } catch (error) {
      if (previous === void 0) {
        this.#records.delete(workerId);
      } else {
        this.#records.set(workerId, previous);
      }
      throw error;
    }
  }
  attachProcess(instance, pid) {
    const record = this.#findCurrent(instance);
    if (record === void 0) {
      return void 0;
    }
    const workerPid = createProcessPid(pid);
    if (record.state === WORKER_STATE.BOOTING && record.pid === workerPid) {
      return this.#snapshotRecord(record);
    }
    assertWorkerTransition(record.state, WORKER_STATE.BOOTING);
    const previous = { ...record };
    record.pid = workerPid;
    record.state = WORKER_STATE.BOOTING;
    return this.#publishRecordWithRollback(record, previous);
  }
  markReady(instance) {
    return this.#transition(instance, WORKER_STATE.READY, (record) => {
      record.readyAt = this.#clock.wallTimeMs();
    });
  }
  markRunning(instance) {
    return this.#transition(instance, WORKER_STATE.RUNNING);
  }
  markDraining(instance) {
    return this.#transition(instance, WORKER_STATE.DRAINING);
  }
  markExited(instance) {
    const record = this.#findCurrent(instance);
    if (record === void 0) {
      return void 0;
    }
    if (record.state === WORKER_STATE.EXITED || record.state === WORKER_STATE.FAILED) {
      return this.#snapshotRecord(record);
    }
    assertWorkerTransition(record.state, WORKER_STATE.EXITED);
    const previous = { ...record };
    record.state = WORKER_STATE.EXITED;
    return this.#publishRecordWithRollback(record, previous);
  }
  markFailed(instance) {
    const record = this.#findCurrent(instance);
    if (record === void 0) {
      return void 0;
    }
    if (record.state === WORKER_STATE.FAILED || record.state === WORKER_STATE.EXITED) {
      return this.#snapshotRecord(record);
    }
    assertWorkerTransition(record.state, WORKER_STATE.FAILED);
    const previous = { ...record };
    record.state = WORKER_STATE.FAILED;
    return this.#publishRecordWithRollback(record, previous);
  }
  markHeartbeat(instance) {
    const record = this.#findCurrent(instance);
    if (record === void 0) {
      return void 0;
    }
    if (record.pid === null || record.state === WORKER_STATE.SPAWNING || record.state === WORKER_STATE.EXITED || record.state === WORKER_STATE.FAILED) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `Worker ${record.workerId} cannot record a heartbeat from ${record.state}`,
        {
          workerId: record.workerId,
          generation: record.generation,
          state: record.state
        }
      );
    }
    const previous = { ...record };
    record.lastHeartbeatAt = this.#clock.wallTimeMs();
    return this.#publishRecordWithRollback(record, previous);
  }
  #transition(instance, state, update) {
    const record = this.#findCurrent(instance);
    if (record === void 0) {
      return void 0;
    }
    assertWorkerTransition(record.state, state);
    const previous = { ...record };
    update?.(record);
    record.state = state;
    return this.#publishRecordWithRollback(record, previous);
  }
  #findSlot(workerId) {
    if (!Number.isSafeInteger(workerId) || workerId < 0 || workerId >= this.size) {
      return void 0;
    }
    if (workerId < this.workerNum) {
      return {
        workerId: createWorkerId(workerId),
        role: PROCESS_ROLE.WORKER,
        taskWorkerId: null
      };
    }
    if (workerId < this.workerNum + this.taskWorkerNum) {
      return {
        workerId: createWorkerId(workerId),
        role: PROCESS_ROLE.TASK_WORKER,
        taskWorkerId: toTaskWorkerId(this.workerNum, workerId, this.taskWorkerNum)
      };
    }
    return {
      workerId: createWorkerId(workerId),
      role: PROCESS_ROLE.USER_TASK_WORKER,
      taskWorkerId: null
    };
  }
  #requireSlot(workerId) {
    const slot = this.#findSlot(workerId);
    if (slot === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `Worker ${workerId} is outside configured registry slots`,
        {
          workerId,
          workerNum: this.workerNum,
          taskWorkerNum: this.taskWorkerNum,
          userTaskWorkerNum: this.userTaskWorkerNum
        }
      );
    }
    return slot;
  }
  #requireRecord(workerId) {
    this.#requireSlot(workerId);
    const record = this.#records.get(workerId);
    if (record === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `Worker ${workerId} has no registered process instance`,
        { workerId }
      );
    }
    return record;
  }
  #findCurrent(instance) {
    if (!this.#isIssuedInstance(instance)) {
      return void 0;
    }
    const record = this.#requireRecord(instance.workerId);
    return record.generation === instance.generation ? record : void 0;
  }
  #snapshotRecord(record, issueInstance = false) {
    const snapshot = freezeRecord(record);
    if (issueInstance) {
      this.#issuedInstances.add(snapshot);
    }
    return snapshot;
  }
  #publishRecord(record, issueInstance = false) {
    const snapshot = this.#snapshotRecord(record, issueInstance);
    this.#onRecordChanged?.(snapshot);
    return snapshot;
  }
  #publishRecordWithRollback(record, previous) {
    try {
      return this.#publishRecord(record);
    } catch (error) {
      Object.assign(record, previous);
      throw error;
    }
  }
  #isIssuedInstance(instance) {
    return typeof instance === "object" && instance !== null && this.#issuedInstances.has(instance);
  }
};

// src/task/task-protocol.ts
var TASK_PROTOCOL_VERSION = 1;
var TASK_PROTOCOL_HEADER_BYTES = 64;
var TASK_PAYLOAD_KIND = Object.freeze({
  WORKER_DISPATCH: 1,
  SCHEDULED_DISPATCH: 2,
  FINISH: 3
});
var TASK_PAYLOAD_ENCODING = Object.freeze({
  NONE: 0,
  JSON: 1,
  BINARY: 2
});
var TASK_PROTOCOL_HEADER_OFFSETS = Object.freeze({
  VERSION: 0,
  KIND: 1,
  ENCODING: 2,
  FLAGS: 3,
  PAYLOAD_BYTES: 4,
  TASK_ID: 8,
  SOURCE_WORKER_ID: 16,
  SOURCE_GENERATION: 24,
  REQUESTED_TASK_WORKER_ID: 32,
  SELECTED_TASK_WORKER_ID: 40,
  SELECTED_WORKER_ID: 48,
  SELECTED_GENERATION: 56
});
var UINT64_NULL = 0xffffffffffffffffn;
var UINT32_MAX2 = 4294967295;
var TASK_FLAG_HAS_RESULT = 1;
var TASK_ALLOWED_FLAGS = TASK_FLAG_HAS_RESULT;
var MAX_JSON_DEPTH = 100;
var strictTextDecoder4 = new TextDecoder("utf-8", { fatal: true });
function isUint8Array(value) {
  try {
    return value instanceof Uint8Array;
  } catch {
    return false;
  }
}
function copyBinary(value, name) {
  try {
    return Buffer.from(value);
  } catch {
    throw new TypeError(`${name} must be an inspectable Uint8Array`);
  }
}
function inspectObject(value, name) {
  try {
    return {
      prototype: Object.getPrototypeOf(value),
      ownKeys: Reflect.ownKeys(value)
    };
  } catch {
    throw new TypeError(`${name} must be an inspectable JSON value`);
  }
}
function requireDataDescriptor(value, key, name) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw new TypeError(`${name} must be an inspectable JSON data field`);
  }
  if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${name} must be an enumerable JSON data field`);
  }
  return descriptor;
}
function snapshotJsonValue(value, name, seen, depth) {
  if (depth > MAX_JSON_DEPTH) {
    throw new TypeError(`${name} exceeds the maximum JSON nesting depth`);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${name} numbers must be finite`);
    }
    return value;
  }
  if (typeof value !== "object" || isUint8Array(value)) {
    throw new TypeError(`${name} must be JSON-safe or a top-level Uint8Array`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${name} must not contain cycles`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const { ownKeys: ownKeys2 } = inspectObject(value, name);
      const expectedKeys = /* @__PURE__ */ new Set(["length"]);
      const snapshot2 = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        expectedKeys.add(key);
        const descriptor = requireDataDescriptor(value, key, `${name}[${index}]`);
        snapshot2.push(snapshotJsonValue(
          descriptor.value,
          `${name}[${index}]`,
          seen,
          depth + 1
        ));
      }
      if (ownKeys2.length !== expectedKeys.size || ownKeys2.some((key) => !expectedKeys.has(key))) {
        throw new TypeError(`${name} arrays must not contain holes or extra properties`);
      }
      return Object.freeze(snapshot2);
    }
    const { prototype, ownKeys } = inspectObject(value, name);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${name} objects must have Object or null prototype`);
    }
    const snapshot = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") {
        throw new TypeError(`${name} objects must not contain symbol keys`);
      }
      const descriptor = requireDataDescriptor(value, key, `${name}.${key}`);
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: snapshotJsonValue(descriptor.value, `${name}.${key}`, seen, depth + 1)
      });
    }
    return Object.freeze(snapshot);
  } finally {
    seen.delete(value);
  }
}
function encodeApplicationPayload(value, name) {
  if (isUint8Array(value)) {
    return {
      encoding: TASK_PAYLOAD_ENCODING.BINARY,
      bytes: copyBinary(value, name)
    };
  }
  const snapshot = snapshotJsonValue(value, name, /* @__PURE__ */ new WeakSet(), 0);
  let serialized;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    throw new TypeError(`${name} must be serializable JSON`);
  }
  return {
    encoding: TASK_PAYLOAD_ENCODING.JSON,
    bytes: Buffer.from(serialized, "utf8")
  };
}
function decodeApplicationPayload(encoding, payload, name) {
  if (encoding === TASK_PAYLOAD_ENCODING.BINARY) {
    return Buffer.from(payload);
  }
  if (encoding !== TASK_PAYLOAD_ENCODING.JSON) {
    throw new TypeError(`${name} must use JSON or binary encoding`);
  }
  let text;
  try {
    text = strictTextDecoder4.decode(payload);
  } catch {
    throw new TypeError(`${name} JSON contains invalid UTF-8`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError(`${name} contains invalid JSON`);
  }
  return snapshotJsonValue(parsed, name, /* @__PURE__ */ new WeakSet(), 0);
}
function requireSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
function requireWorkerId2(value, name) {
  return createWorkerId(requireSafeInteger(value, name));
}
function requireTaskWorkerId(value, name) {
  return createTaskWorkerId(requireSafeInteger(value, name));
}
function requireGeneration(value, name) {
  return createWorkerGeneration(requireSafeInteger(value, name));
}
function requireNullableTaskWorkerId(value, name) {
  return value === null ? null : requireTaskWorkerId(value, name);
}
function assertPayloadSize(byteLength2) {
  if (byteLength2 > UINT32_MAX2) {
    throw new RangeError(`Task payload exceeds ${UINT32_MAX2} bytes`);
  }
}
function writeSafeInteger(payload, offset, value, name) {
  payload.writeBigUInt64BE(BigInt(requireSafeInteger(value, name)), offset);
}
function writeNullableTaskWorkerId(payload, offset, value, name) {
  if (value === null) {
    payload.writeBigUInt64BE(UINT64_NULL, offset);
    return;
  }
  payload.writeBigUInt64BE(BigInt(requireTaskWorkerId(value, name)), offset);
}
function writeNullField(payload, offset) {
  payload.writeBigUInt64BE(UINT64_NULL, offset);
}
function createPayload(kind, options, requestedTaskWorkerId, selection, applicationPayload, flags) {
  assertPayloadSize(applicationPayload.bytes.byteLength);
  const payload = Buffer.alloc(TASK_PROTOCOL_HEADER_BYTES + applicationPayload.bytes.byteLength);
  payload[TASK_PROTOCOL_HEADER_OFFSETS.VERSION] = TASK_PROTOCOL_VERSION;
  payload[TASK_PROTOCOL_HEADER_OFFSETS.KIND] = kind;
  payload[TASK_PROTOCOL_HEADER_OFFSETS.ENCODING] = applicationPayload.encoding;
  payload[TASK_PROTOCOL_HEADER_OFFSETS.FLAGS] = flags;
  payload.writeUInt32BE(applicationPayload.bytes.byteLength, TASK_PROTOCOL_HEADER_OFFSETS.PAYLOAD_BYTES);
  writeSafeInteger(payload, TASK_PROTOCOL_HEADER_OFFSETS.TASK_ID, options.taskId, "taskId");
  writeSafeInteger(
    payload,
    TASK_PROTOCOL_HEADER_OFFSETS.SOURCE_WORKER_ID,
    options.sourceWorkerId,
    "sourceWorkerId"
  );
  writeSafeInteger(
    payload,
    TASK_PROTOCOL_HEADER_OFFSETS.SOURCE_GENERATION,
    options.sourceGeneration,
    "sourceGeneration"
  );
  writeNullableTaskWorkerId(
    payload,
    TASK_PROTOCOL_HEADER_OFFSETS.REQUESTED_TASK_WORKER_ID,
    requestedTaskWorkerId,
    "requestedTaskWorkerId"
  );
  if (selection === null) {
    writeNullField(payload, TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_TASK_WORKER_ID);
    writeNullField(payload, TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_WORKER_ID);
    writeNullField(payload, TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_GENERATION);
  } else {
    writeSafeInteger(
      payload,
      TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_TASK_WORKER_ID,
      selection.selectedTaskWorkerId,
      "selectedTaskWorkerId"
    );
    writeSafeInteger(
      payload,
      TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_WORKER_ID,
      selection.selectedWorkerId,
      "selectedWorkerId"
    );
    writeSafeInteger(
      payload,
      TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_GENERATION,
      selection.selectedGeneration,
      "selectedGeneration"
    );
  }
  payload.set(applicationPayload.bytes, TASK_PROTOCOL_HEADER_BYTES);
  return payload;
}
function encodeWorkerTaskDispatchPayload(options) {
  const requestedTaskWorkerId = requireNullableTaskWorkerId(
    options.requestedTaskWorkerId,
    "requestedTaskWorkerId"
  );
  return createPayload(
    TASK_PAYLOAD_KIND.WORKER_DISPATCH,
    options,
    requestedTaskWorkerId,
    null,
    encodeApplicationPayload(options.data, "Task dispatch data"),
    0
  );
}
function encodeScheduledTaskDispatchPayload(options) {
  const requestedTaskWorkerId = requireNullableTaskWorkerId(
    options.requestedTaskWorkerId,
    "requestedTaskWorkerId"
  );
  return createPayload(
    TASK_PAYLOAD_KIND.SCHEDULED_DISPATCH,
    options,
    requestedTaskWorkerId,
    options,
    encodeApplicationPayload(options.data, "Scheduled task data"),
    0
  );
}
function encodeTaskFinishPayload(options) {
  const applicationPayload = options.hasResult ? encodeApplicationPayload(options.result, "Task finish result") : { encoding: TASK_PAYLOAD_ENCODING.NONE, bytes: Buffer.alloc(0) };
  const selection = optionalSelection(options);
  if (options.hasResult && selection === null) {
    throw new TypeError("Task finish with a result requires a selected Task Worker identity");
  }
  return createPayload(
    TASK_PAYLOAD_KIND.FINISH,
    options,
    null,
    selection,
    applicationPayload,
    options.hasResult ? TASK_FLAG_HAS_RESULT : 0
  );
}
function optionalSelection(value) {
  const fields = [
    value.selectedTaskWorkerId,
    value.selectedWorkerId,
    value.selectedGeneration
  ];
  if (fields.every((field) => field === null)) {
    return null;
  }
  if (fields.some((field) => field === null)) {
    throw new TypeError("Task selection must be complete or entirely null");
  }
  return {
    selectedTaskWorkerId: requireTaskWorkerId(
      value.selectedTaskWorkerId,
      "selectedTaskWorkerId"
    ),
    selectedWorkerId: requireWorkerId2(value.selectedWorkerId, "selectedWorkerId"),
    selectedGeneration: requireGeneration(
      value.selectedGeneration,
      "selectedGeneration"
    )
  };
}
function requireKind(value) {
  if (value !== TASK_PAYLOAD_KIND.WORKER_DISPATCH && value !== TASK_PAYLOAD_KIND.SCHEDULED_DISPATCH && value !== TASK_PAYLOAD_KIND.FINISH) {
    throw new TypeError("Task payload contains an unknown kind");
  }
  return value;
}
function requireEncoding(value) {
  if (value !== TASK_PAYLOAD_ENCODING.NONE && value !== TASK_PAYLOAD_ENCODING.JSON && value !== TASK_PAYLOAD_ENCODING.BINARY) {
    throw new TypeError("Task payload contains an unknown encoding");
  }
  return value;
}
function readSafeInteger(payload, offset, name) {
  const value = payload.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return Number(value);
}
function readNullableTaskWorkerId(payload, offset, name) {
  const value = payload.readBigUInt64BE(offset);
  if (value === UINT64_NULL) {
    return null;
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${name} must be null or a non-negative safe integer`);
  }
  return createTaskWorkerId(Number(value));
}
function decodeHeader(value) {
  if (!isUint8Array(value) || value.byteLength < TASK_PROTOCOL_HEADER_BYTES) {
    throw new TypeError("Task payload must contain a complete fixed binary header");
  }
  const bytes = copyBinary(value, "Task payload");
  if (bytes[TASK_PROTOCOL_HEADER_OFFSETS.VERSION] !== TASK_PROTOCOL_VERSION) {
    throw new TypeError("Task payload has an unsupported version");
  }
  const kind = requireKind(bytes[TASK_PROTOCOL_HEADER_OFFSETS.KIND]);
  const encoding = requireEncoding(bytes[TASK_PROTOCOL_HEADER_OFFSETS.ENCODING]);
  const flags = bytes[TASK_PROTOCOL_HEADER_OFFSETS.FLAGS];
  if ((flags & ~TASK_ALLOWED_FLAGS) !== 0) {
    throw new TypeError("Task payload contains unknown flags");
  }
  const payloadBytes = bytes.readUInt32BE(TASK_PROTOCOL_HEADER_OFFSETS.PAYLOAD_BYTES);
  const expectedBytes = TASK_PROTOCOL_HEADER_BYTES + payloadBytes;
  if (bytes.byteLength !== expectedBytes) {
    throw new TypeError(
      bytes.byteLength < expectedBytes ? "Task payload body is truncated" : "Task payload contains trailing bytes"
    );
  }
  return {
    kind,
    encoding,
    flags,
    payload: Buffer.from(bytes.subarray(TASK_PROTOCOL_HEADER_BYTES)),
    taskId: readSafeInteger(bytes, TASK_PROTOCOL_HEADER_OFFSETS.TASK_ID, "taskId"),
    sourceWorkerId: requireWorkerId2(
      readSafeInteger(bytes, TASK_PROTOCOL_HEADER_OFFSETS.SOURCE_WORKER_ID, "sourceWorkerId"),
      "sourceWorkerId"
    ),
    sourceGeneration: requireGeneration(
      readSafeInteger(
        bytes,
        TASK_PROTOCOL_HEADER_OFFSETS.SOURCE_GENERATION,
        "sourceGeneration"
      ),
      "sourceGeneration"
    ),
    requestedTaskWorkerId: readNullableTaskWorkerId(
      bytes,
      TASK_PROTOCOL_HEADER_OFFSETS.REQUESTED_TASK_WORKER_ID,
      "requestedTaskWorkerId"
    ),
    selectedTaskWorkerId: readNullableTaskWorkerId(
      bytes,
      TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_TASK_WORKER_ID,
      "selectedTaskWorkerId"
    ),
    selectedWorkerId: (() => {
      const value2 = bytes.readBigUInt64BE(TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_WORKER_ID);
      return value2 === UINT64_NULL ? null : requireWorkerId2(Number(value2), "selectedWorkerId");
    })(),
    selectedGeneration: (() => {
      const value2 = bytes.readBigUInt64BE(TASK_PROTOCOL_HEADER_OFFSETS.SELECTED_GENERATION);
      return value2 === UINT64_NULL ? null : requireGeneration(Number(value2), "selectedGeneration");
    })()
  };
}
function requireNoSelection(header) {
  if (header.selectedTaskWorkerId !== null || header.selectedWorkerId !== null || header.selectedGeneration !== null) {
    throw new TypeError("Worker task dispatch must not contain a selected Task Worker");
  }
}
function requireSelection(header) {
  if (header.selectedTaskWorkerId === null || header.selectedWorkerId === null || header.selectedGeneration === null) {
    throw new TypeError("Task payload requires a complete selected Task Worker identity");
  }
  return {
    selectedTaskWorkerId: header.selectedTaskWorkerId,
    selectedWorkerId: header.selectedWorkerId,
    selectedGeneration: header.selectedGeneration
  };
}
function optionalDecodedSelection(header) {
  const fields = [
    header.selectedTaskWorkerId,
    header.selectedWorkerId,
    header.selectedGeneration
  ];
  if (fields.every((field) => field === null)) {
    return {
      selectedTaskWorkerId: null,
      selectedWorkerId: null,
      selectedGeneration: null
    };
  }
  if (fields.some((field) => field === null)) {
    throw new TypeError("Task payload selection must be complete or entirely null");
  }
  return requireSelection(header);
}
function assertDispatchHeader(header) {
  if (header.flags !== 0) {
    throw new TypeError("Task dispatch flags must be zero");
  }
  if (header.encoding === TASK_PAYLOAD_ENCODING.NONE) {
    throw new TypeError("Task dispatch must contain JSON or binary data");
  }
}
function decodeTaskProtocolPayload(value) {
  const header = decodeHeader(value);
  const taskKey2 = {
    taskId: header.taskId,
    sourceWorkerId: header.sourceWorkerId,
    sourceGeneration: header.sourceGeneration
  };
  if (header.kind === TASK_PAYLOAD_KIND.WORKER_DISPATCH) {
    assertDispatchHeader(header);
    requireNoSelection(header);
    return Object.freeze({
      protocolVersion: TASK_PROTOCOL_VERSION,
      kind: TASK_PAYLOAD_KIND.WORKER_DISPATCH,
      ...taskKey2,
      requestedTaskWorkerId: header.requestedTaskWorkerId,
      data: decodeApplicationPayload(header.encoding, header.payload, "Task dispatch data")
    });
  }
  if (header.kind === TASK_PAYLOAD_KIND.SCHEDULED_DISPATCH) {
    assertDispatchHeader(header);
    const selection2 = requireSelection(header);
    return Object.freeze({
      protocolVersion: TASK_PROTOCOL_VERSION,
      kind: TASK_PAYLOAD_KIND.SCHEDULED_DISPATCH,
      ...taskKey2,
      requestedTaskWorkerId: header.requestedTaskWorkerId,
      ...selection2,
      data: decodeApplicationPayload(header.encoding, header.payload, "Scheduled task data")
    });
  }
  if (header.requestedTaskWorkerId !== null) {
    throw new TypeError("Task finish must not contain a requested Task Worker ID");
  }
  const hasResult = (header.flags & TASK_FLAG_HAS_RESULT) !== 0;
  if (!hasResult) {
    if (header.encoding !== TASK_PAYLOAD_ENCODING.NONE || header.payload.byteLength !== 0) {
      throw new TypeError("Task finish without a result must use empty NONE encoding");
    }
    return Object.freeze({
      protocolVersion: TASK_PROTOCOL_VERSION,
      kind: TASK_PAYLOAD_KIND.FINISH,
      ...taskKey2,
      ...optionalDecodedSelection(header),
      hasResult: false
    });
  }
  if (header.encoding === TASK_PAYLOAD_ENCODING.NONE) {
    throw new TypeError("Task finish with a result must use JSON or binary encoding");
  }
  const selection = requireSelection(header);
  return Object.freeze({
    protocolVersion: TASK_PROTOCOL_VERSION,
    kind: TASK_PAYLOAD_KIND.FINISH,
    ...taskKey2,
    ...selection,
    hasResult: true,
    result: decodeApplicationPayload(header.encoding, header.payload, "Task finish result")
  });
}
function decodeWorkerTaskDispatchPayload(value) {
  const payload = decodeTaskProtocolPayload(value);
  if (payload.kind !== TASK_PAYLOAD_KIND.WORKER_DISPATCH) {
    throw new TypeError("Task payload is not a Worker-to-Master dispatch");
  }
  return payload;
}
function decodeScheduledTaskDispatchPayload(value) {
  const payload = decodeTaskProtocolPayload(value);
  if (payload.kind !== TASK_PAYLOAD_KIND.SCHEDULED_DISPATCH) {
    throw new TypeError("Task payload is not a Master-to-Task dispatch");
  }
  return payload;
}
function decodeTaskFinishPayload(value) {
  const payload = decodeTaskProtocolPayload(value);
  if (payload.kind !== TASK_PAYLOAD_KIND.FINISH) {
    throw new TypeError("Task payload is not a Task finish");
  }
  return payload;
}

// src/task/task-scheduler.ts
function isReady(record) {
  return record.state === WORKER_STATE.READY || record.state === WORKER_STATE.RUNNING;
}
function unknownTaskWorkerError(message, taskWorkerId, taskWorkerNum) {
  return new FrameworkError(
    FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
    message,
    { taskWorkerId, taskWorkerNum }
  );
}
function parseConfiguredTaskWorkerId(value, taskWorkerNum, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= taskWorkerNum) {
    throw unknownTaskWorkerError(
      `${name} must be a pool-local Task Worker ID in [0, ${taskWorkerNum})`,
      value,
      taskWorkerNum
    );
  }
  return createTaskWorkerId(value);
}
function normalizeRequestedTaskWorkerId(value, taskWorkerNum) {
  if (taskWorkerNum === 0) {
    throw unknownTaskWorkerError(
      "TaskScheduler has no configured Task Worker pool",
      value,
      taskWorkerNum
    );
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw unknownTaskWorkerError(
      "requestedTaskWorkerId must be a non-negative safe integer",
      value,
      taskWorkerNum
    );
  }
  return createTaskWorkerId(value % taskWorkerNum);
}
var TaskScheduler = class {
  #registry;
  #reservedTaskWorkerIds;
  #suspendedWorkerIds = /* @__PURE__ */ new Set();
  #nextAutomaticTaskWorkerId = 0;
  #sealed = false;
  #selected = 0;
  #rejected = 0;
  #automatic = 0;
  #explicit = 0;
  constructor(options) {
    if (!(options.registry instanceof WorkerRegistry)) {
      throw new TypeError("TaskScheduler requires a WorkerRegistry");
    }
    this.#registry = options.registry;
    const reserved = /* @__PURE__ */ new Set();
    for (const value of options.reservedTaskWorkerIds ?? []) {
      reserved.add(
        parseConfiguredTaskWorkerId(
          value,
          this.#registry.taskWorkerNum,
          "reservedTaskWorkerId"
        )
      );
    }
    this.#reservedTaskWorkerIds = reserved;
  }
  select(requestedTaskWorkerId) {
    try {
      if (this.#sealed) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          "TaskScheduler is sealed"
        );
      }
      const selected = requestedTaskWorkerId === void 0 ? this.#selectAutomatic() : this.#selectExplicit(requestedTaskWorkerId);
      this.#selected += 1;
      if (requestedTaskWorkerId === void 0) {
        this.#automatic += 1;
      } else {
        this.#explicit += 1;
      }
      return selected;
    } catch (error) {
      this.#rejected += 1;
      throw error;
    }
  }
  seal(_reason) {
    this.#sealed = true;
  }
  suspend(workerId) {
    this.#requireTaskWorkerSlot(workerId);
    this.#suspendedWorkerIds.add(workerId);
  }
  resume(workerId) {
    this.#requireTaskWorkerSlot(workerId);
    this.#suspendedWorkerIds.delete(workerId);
  }
  stats() {
    return Object.freeze({
      sealed: this.#sealed,
      suspendedWorkerIds: Object.freeze(
        [...this.#suspendedWorkerIds].sort((left, right) => left - right)
      ),
      selected: this.#selected,
      rejected: this.#rejected,
      automatic: this.#automatic,
      explicit: this.#explicit
    });
  }
  #selectAutomatic() {
    const taskWorkerNum = this.#registry.taskWorkerNum;
    if (taskWorkerNum === 0) {
      throw unknownTaskWorkerError(
        "TaskScheduler has no configured Task Worker pool",
        null,
        taskWorkerNum
      );
    }
    if (this.#reservedTaskWorkerIds.size >= taskWorkerNum) {
      throw unknownTaskWorkerError(
        "TaskScheduler has no non-reserved Task Worker slots",
        null,
        taskWorkerNum
      );
    }
    const candidates = this.#registry.snapshot().filter(
      (record) => record.role === PROCESS_ROLE.TASK_WORKER && record.taskWorkerId !== null && !this.#reservedTaskWorkerIds.has(record.taskWorkerId) && !this.#suspendedWorkerIds.has(record.workerId) && isReady(record)
    ).sort((left, right) => left.taskWorkerId - right.taskWorkerId);
    if (candidates.length === 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        "TaskScheduler has no READY automatic Task Worker candidates",
        {
          taskWorkerNum,
          reservedTaskWorkerIds: [...this.#reservedTaskWorkerIds].sort(
            (left, right) => left - right
          ),
          suspendedWorkerIds: [...this.#suspendedWorkerIds].sort(
            (left, right) => left - right
          )
        }
      );
    }
    const selected = candidates.find(
      (record) => record.taskWorkerId >= this.#nextAutomaticTaskWorkerId
    ) ?? candidates[0];
    this.#nextAutomaticTaskWorkerId = (selected.taskWorkerId + 1) % taskWorkerNum;
    return selected;
  }
  #selectExplicit(requestedTaskWorkerId) {
    const taskWorkerId = normalizeRequestedTaskWorkerId(
      requestedTaskWorkerId,
      this.#registry.taskWorkerNum
    );
    const workerId = toGlobalTaskWorkerId(
      this.#registry.workerNum,
      taskWorkerId,
      this.#registry.taskWorkerNum
    );
    const slot = this.#requireTaskWorkerSlot(workerId);
    if (slot.taskWorkerId !== taskWorkerId) {
      throw unknownTaskWorkerError(
        `Task Worker ${taskWorkerId} does not map to a Task Worker slot`,
        taskWorkerId,
        this.#registry.taskWorkerNum
      );
    }
    if (this.#suspendedWorkerIds.has(workerId)) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        `Task Worker ${taskWorkerId} is suspended`,
        {
          taskWorkerId,
          workerId,
          suspended: true
        }
      );
    }
    const record = this.#registry.get(workerId);
    if (record === void 0 || !isReady(record)) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        `Task Worker ${taskWorkerId} is not READY`,
        {
          taskWorkerId,
          workerId,
          state: record?.state ?? null
        }
      );
    }
    if (record.role !== PROCESS_ROLE.TASK_WORKER || record.taskWorkerId !== taskWorkerId) {
      throw unknownTaskWorkerError(
        `Worker ${workerId} is not Task Worker ${taskWorkerId}`,
        taskWorkerId,
        this.#registry.taskWorkerNum
      );
    }
    return record;
  }
  #requireTaskWorkerSlot(workerId) {
    const slot = this.#registry.getSlot(workerId);
    if (slot === void 0 || slot.role !== PROCESS_ROLE.TASK_WORKER) {
      throw unknownTaskWorkerError(
        `Worker ${workerId} is not a configured global Task Worker ID`,
        workerId,
        this.#registry.taskWorkerNum
      );
    }
    return slot;
  }
};

// src/task/master-task-router.ts
var DEFAULT_MASTER_TASK_ROUTER_TOMBSTONE_LIMIT = 4096;
var DEFAULT_MASTER_TASK_ROUTER_MAX_PENDING_ASSIGNMENTS = 4096;
function assertNonNegativeSafeInteger6(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function taskKey(task) {
  return `${task.sourceWorkerId}:${task.sourceGeneration}:${task.taskId}`;
}
function canReceiveTaskCompletion(record) {
  return record.state === WORKER_STATE.READY || record.state === WORKER_STATE.RUNNING || record.state === WORKER_STATE.DRAINING;
}
function sameTask(left, right) {
  return left.taskId === right.taskId && left.sourceWorkerId === right.sourceWorkerId && left.sourceGeneration === right.sourceGeneration;
}
function sameSelection(left, right) {
  return left.selectedTaskWorkerId === right.selectedTaskWorkerId && left.selectedWorkerId === right.selectedWorkerId && left.selectedGeneration === right.selectedGeneration;
}
function hasSelection(payload) {
  return payload.selectedTaskWorkerId !== null && payload.selectedWorkerId !== null && payload.selectedGeneration !== null;
}
function asTaskSelection(record) {
  if (record.role !== PROCESS_ROLE.TASK_WORKER || record.taskWorkerId === null) {
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
      `Worker ${record.workerId} is not a Task Worker`,
      { workerId: record.workerId, role: record.role }
    );
  }
  return Object.freeze({
    selectedTaskWorkerId: record.taskWorkerId,
    selectedWorkerId: record.workerId,
    selectedGeneration: record.generation
  });
}
var MasterTaskRouter = class {
  #bus;
  #registry;
  #scheduler;
  #onDeliveryError;
  #tombstoneLimit;
  #maxPendingAssignments;
  #assignmentsByKey = /* @__PURE__ */ new Map();
  #assignmentsByMessageId = /* @__PURE__ */ new Map();
  #completedTaskKeys = /* @__PURE__ */ new Set();
  #completedAssignmentIds = /* @__PURE__ */ new Set();
  #tombstones = [];
  #peerCleanupTail = Promise.resolve();
  #completionRetryTail = Promise.resolve();
  #disposeMessage;
  #disposePeerUnavailable;
  #closed = false;
  #accepted = 0;
  #rejected = 0;
  #pendingAssignmentRejections = 0;
  #finished = 0;
  #abandoned = 0;
  #stale = 0;
  #duplicate = 0;
  #deliveryErrors = 0;
  #ignored = 0;
  constructor(options) {
    if (options.bus.localIdentity.role !== PROCESS_ROLE.MASTER || options.bus.localIdentity.workerId !== null || options.bus.localIdentity.generation !== null) {
      throw new TypeError("MasterTaskRouter requires a Master ProcessBus");
    }
    if (!(options.registry instanceof WorkerRegistry)) {
      throw new TypeError("MasterTaskRouter requires a WorkerRegistry");
    }
    if (!(options.scheduler instanceof TaskScheduler)) {
      throw new TypeError("MasterTaskRouter requires a TaskScheduler");
    }
    const tombstoneLimit = options.tombstoneLimit ?? DEFAULT_MASTER_TASK_ROUTER_TOMBSTONE_LIMIT;
    assertNonNegativeSafeInteger6("tombstoneLimit", tombstoneLimit);
    const maxPendingAssignments = options.maxPendingAssignments ?? DEFAULT_MASTER_TASK_ROUTER_MAX_PENDING_ASSIGNMENTS;
    assertNonNegativeSafeInteger6("maxPendingAssignments", maxPendingAssignments);
    this.#bus = options.bus;
    this.#registry = options.registry;
    this.#scheduler = options.scheduler;
    this.#onDeliveryError = options.onDeliveryError;
    this.#tombstoneLimit = tombstoneLimit;
    this.#maxPendingAssignments = maxPendingAssignments;
    this.#disposeMessage = this.#bus.onMessage(this.#handleEnvelope);
    this.#disposePeerUnavailable = this.#bus.onPeerUnavailable(this.#handlePeerUnavailable);
  }
  stats() {
    return Object.freeze({
      closed: this.#closed,
      accepted: this.#accepted,
      rejected: this.#rejected,
      pending: this.#assignmentsByKey.size,
      maxPendingAssignments: this.#maxPendingAssignments,
      pendingAssignmentRejections: this.#pendingAssignmentRejections,
      finished: this.#finished,
      abandoned: this.#abandoned,
      stale: this.#stale,
      duplicate: this.#duplicate,
      deliveryErrors: this.#deliveryErrors,
      ignored: this.#ignored
    });
  }
  async drain() {
    while (true) {
      const peerCleanup = this.#peerCleanupTail;
      const completionRetry = this.#completionRetryTail;
      await Promise.all([peerCleanup, completionRetry]);
      if (peerCleanup === this.#peerCleanupTail && completionRetry === this.#completionRetryTail) {
        return;
      }
    }
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#disposeMessage();
    this.#disposePeerUnavailable();
    this.#disposeMessage = () => {
    };
    this.#disposePeerUnavailable = () => {
    };
    this.#abandoned += this.#assignmentsByKey.size;
    this.#assignmentsByKey.clear();
    this.#assignmentsByMessageId.clear();
    this.#completedTaskKeys.clear();
    this.#completedAssignmentIds.clear();
    this.#tombstones.length = 0;
  }
  #handleEnvelope = (envelope) => {
    if (this.#closed) {
      return;
    }
    if (envelope.messageType === IPC_MESSAGE_TYPE.TASK_DISPATCH) {
      this.#handleDispatch(envelope);
      return;
    }
    if (envelope.messageType === IPC_MESSAGE_TYPE.TASK_FINISH) {
      this.#handleFinish(envelope);
      return;
    }
    this.#ignored += 1;
  };
  #handlePeerUnavailable = (identity) => {
    if (this.#closed || identity.role === PROCESS_ROLE.MASTER || identity.role === PROCESS_ROLE.USER_TASK_WORKER || identity.workerId === null || identity.generation === null) {
      return;
    }
    const unavailableIdentity = Object.freeze({
      role: identity.role,
      workerId: identity.workerId,
      generation: identity.generation
    });
    this.#peerCleanupTail = this.#peerCleanupTail.then(async () => {
      try {
        await this.#bus.drain();
      } catch (error) {
        this.#deliveryFailed(error);
      }
      if (this.#closed) {
        return;
      }
      this.#cleanupUnavailablePeer(unavailableIdentity);
    });
    void this.#peerCleanupTail.catch(() => void 0);
  };
  #cleanupUnavailablePeer(identity) {
    for (const assignment of [...this.#assignmentsByKey.values()]) {
      if (identity.role === PROCESS_ROLE.WORKER && assignment.sourceWorkerId === identity.workerId && assignment.sourceGeneration === identity.generation) {
        this.#removeAssignment(assignment);
        this.#rememberCompletion(assignment.key, assignment.assignmentMessageId);
        this.#abandoned += 1;
        continue;
      }
      if (identity.role === PROCESS_ROLE.TASK_WORKER && assignment.selectedWorkerId === identity.workerId && assignment.selectedGeneration === identity.generation) {
        this.#removeAssignment(assignment);
        this.#rememberCompletion(assignment.key, assignment.assignmentMessageId);
        this.#abandoned += 1;
        this.#sendCompletion(
          assignment,
          assignment,
          false,
          assignment.sourceDispatchMessageId
        );
      }
    }
  }
  #handleDispatch(envelope) {
    let payload;
    try {
      this.#assertDispatchEnvelope(envelope);
      payload = decodeWorkerTaskDispatchPayload(envelope.payload);
    } catch {
      this.#rejected += 1;
      return;
    }
    if (payload.sourceWorkerId !== envelope.sourceWorkerId || payload.sourceGeneration !== envelope.sourceGeneration) {
      this.#rejected += 1;
      return;
    }
    if (!this.#isCurrentSource(payload)) {
      this.#rejected += 1;
      this.#stale += 1;
      return;
    }
    const key = taskKey(payload);
    if (this.#assignmentsByKey.has(key) || this.#completedTaskKeys.has(key)) {
      this.#rejected += 1;
      this.#duplicate += 1;
      return;
    }
    if (this.#assignmentsByKey.size >= this.#maxPendingAssignments) {
      this.#rejected += 1;
      this.#pendingAssignmentRejections += 1;
      this.#abandoned += 1;
      this.#rememberCompletion(key, null);
      this.#sendCompletion(
        payload,
        null,
        false,
        envelope.messageId,
        void 0,
        false,
        false
      );
      return;
    }
    let selected;
    try {
      selected = this.#scheduler.select(payload.requestedTaskWorkerId ?? void 0);
    } catch {
      this.#rejected += 1;
      this.#abandoned += 1;
      this.#rememberCompletion(key, null);
      this.#sendCompletion(payload, null, false, envelope.messageId);
      return;
    }
    let selection;
    let assignmentMessageId;
    let scheduledPayload;
    try {
      selection = asTaskSelection(selected);
      assignmentMessageId = createMessageId(`task-assignment:${randomUUID2()}`);
      scheduledPayload = encodeScheduledTaskDispatchPayload({
        taskId: payload.taskId,
        sourceWorkerId: payload.sourceWorkerId,
        sourceGeneration: payload.sourceGeneration,
        requestedTaskWorkerId: payload.requestedTaskWorkerId,
        ...selection,
        data: payload.data
      });
    } catch {
      this.#rejected += 1;
      this.#abandoned += 1;
      this.#rememberCompletion(key, null);
      this.#sendCompletion(payload, null, false, envelope.messageId);
      return;
    }
    const assignment = Object.freeze({
      key,
      taskId: payload.taskId,
      sourceWorkerId: payload.sourceWorkerId,
      sourceGeneration: payload.sourceGeneration,
      sourceDispatchMessageId: envelope.messageId,
      assignmentMessageId,
      ...selection
    });
    let completion;
    try {
      completion = this.#bus.enqueue({
        messageType: IPC_MESSAGE_TYPE.TASK_DISPATCH,
        targetRole: PROCESS_ROLE.TASK_WORKER,
        targetWorkerId: assignment.selectedWorkerId,
        messageId: assignment.assignmentMessageId,
        correlationId: createCorrelationId(envelope.messageId),
        payload: scheduledPayload
      }).completion;
    } catch (error) {
      this.#rejected += 1;
      this.#abandoned += 1;
      this.#deliveryFailed(error);
      this.#rememberCompletion(key, assignment.assignmentMessageId);
      this.#sendCompletion(assignment, assignment, false, envelope.messageId);
      return;
    }
    this.#assignmentsByKey.set(key, assignment);
    this.#assignmentsByMessageId.set(assignment.assignmentMessageId, assignment);
    this.#accepted += 1;
    void completion.catch((error) => {
      if (this.#assignmentsByKey.get(key) !== assignment) {
        return;
      }
      this.#removeAssignment(assignment);
      this.#rememberCompletion(key, assignment.assignmentMessageId);
      this.#abandoned += 1;
      this.#deliveryFailed(error);
      this.#sendCompletion(
        assignment,
        assignment,
        false,
        assignment.sourceDispatchMessageId
      );
    });
  }
  #handleFinish(envelope) {
    let payload;
    try {
      this.#assertFinishEnvelope(envelope);
      payload = decodeTaskFinishPayload(envelope.payload);
    } catch {
      this.#rejected += 1;
      return;
    }
    const correlationId = envelope.correlationId;
    const assignmentMessageId = correlationId;
    if (this.#completedAssignmentIds.has(assignmentMessageId)) {
      this.#rejected += 1;
      this.#duplicate += 1;
      return;
    }
    const assignment = this.#assignmentsByMessageId.get(assignmentMessageId);
    if (assignment === void 0) {
      this.#rejected += 1;
      return;
    }
    if (!hasSelection(payload)) {
      this.#rejected += 1;
      return;
    }
    if (!sameTask(payload, assignment) || !sameSelection(payload, assignment) || envelope.sourceWorkerId !== assignment.selectedWorkerId || envelope.sourceGeneration !== assignment.selectedGeneration) {
      this.#rejected += 1;
      if (envelope.sourceWorkerId === assignment.selectedWorkerId && envelope.sourceGeneration !== assignment.selectedGeneration) {
        this.#stale += 1;
      }
      return;
    }
    this.#removeAssignment(assignment);
    this.#rememberCompletion(assignment.key, assignment.assignmentMessageId);
    this.#finished += 1;
    if (!this.#sendCompletion(
      payload,
      assignment,
      payload.hasResult,
      assignment.sourceDispatchMessageId,
      payload,
      true
    )) {
      this.#abandoned += 1;
    }
  }
  #assertDispatchEnvelope(envelope) {
    if (envelope.sourceRole !== PROCESS_ROLE.WORKER || envelope.sourceWorkerId === null || envelope.sourceGeneration === null || envelope.targetRole !== PROCESS_ROLE.MASTER || envelope.targetWorkerId !== null || envelope.flags !== 0 || envelope.correlationId !== null || envelope.sessionId !== null) {
      throw new TypeError("TASK_DISPATCH has invalid source, target, or metadata");
    }
  }
  #assertFinishEnvelope(envelope) {
    if (envelope.sourceRole !== PROCESS_ROLE.TASK_WORKER || envelope.sourceWorkerId === null || envelope.sourceGeneration === null || envelope.targetRole !== PROCESS_ROLE.MASTER || envelope.targetWorkerId !== null || envelope.flags !== 0 || envelope.correlationId === null || envelope.sessionId !== null) {
      throw new TypeError("TASK_FINISH has invalid source, target, or metadata");
    }
  }
  #isCurrentSource(task) {
    const source = this.#registry.get(task.sourceWorkerId);
    return source !== void 0 && source.role === PROCESS_ROLE.WORKER && source.generation === task.sourceGeneration;
  }
  #sendCompletion(task, selection, hasResult, sourceDispatchMessageId, resultPayload, countAsyncFailureAsAbandoned = false, retryOnFailure = true) {
    const source = this.#registry.get(task.sourceWorkerId);
    if (source === void 0 || source.role !== PROCESS_ROLE.WORKER || source.generation !== task.sourceGeneration || !canReceiveTaskCompletion(source)) {
      this.#stale += 1;
      return false;
    }
    const completionPayload = hasResult && resultPayload?.hasResult === true ? encodeTaskFinishPayload({
      taskId: task.taskId,
      sourceWorkerId: task.sourceWorkerId,
      sourceGeneration: task.sourceGeneration,
      ...selection ?? resultPayload,
      hasResult: true,
      result: resultPayload.result
    }) : encodeTaskFinishPayload({
      taskId: task.taskId,
      sourceWorkerId: task.sourceWorkerId,
      sourceGeneration: task.sourceGeneration,
      ...selection ?? {
        selectedTaskWorkerId: null,
        selectedWorkerId: null,
        selectedGeneration: null
      },
      hasResult: false
    });
    const sendOptions = {
      messageType: IPC_MESSAGE_TYPE.TASK_FINISH,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: task.sourceWorkerId,
      correlationId: createCorrelationId(sourceDispatchMessageId),
      payload: completionPayload
    };
    let completion;
    try {
      completion = this.#bus.enqueue(sendOptions).completion;
    } catch (error) {
      this.#deliveryFailed(error);
      if (retryOnFailure) {
        this.#scheduleCompletionRetry(
          sendOptions,
          task.sourceWorkerId,
          task.sourceGeneration,
          countAsyncFailureAsAbandoned
        );
      }
      return true;
    }
    void completion.catch((error) => {
      this.#deliveryFailed(error);
      if (retryOnFailure) {
        this.#scheduleCompletionRetry(
          sendOptions,
          task.sourceWorkerId,
          task.sourceGeneration,
          countAsyncFailureAsAbandoned
        );
      }
    });
    return true;
  }
  #scheduleCompletionRetry(options, sourceWorkerId, sourceGeneration, countFailureAsAbandoned) {
    this.#completionRetryTail = this.#completionRetryTail.then(async () => {
      try {
        await this.#bus.drain();
      } catch (error) {
        this.#deliveryFailed(error);
      }
      if (this.#closed) {
        if (countFailureAsAbandoned) {
          this.#abandoned += 1;
        }
        return;
      }
      const source = this.#registry.get(sourceWorkerId);
      if (source === void 0 || source.role !== PROCESS_ROLE.WORKER || source.generation !== sourceGeneration || !canReceiveTaskCompletion(source)) {
        this.#stale += 1;
        if (countFailureAsAbandoned) {
          this.#abandoned += 1;
        }
        return;
      }
      try {
        const retry = this.#bus.enqueue(options);
        await retry.completion;
      } catch (error) {
        if (countFailureAsAbandoned) {
          this.#abandoned += 1;
        }
        this.#deliveryFailed(error);
      }
    });
    void this.#completionRetryTail.catch(() => void 0);
  }
  #removeAssignment(assignment) {
    if (this.#assignmentsByKey.get(assignment.key) === assignment) {
      this.#assignmentsByKey.delete(assignment.key);
    }
    if (this.#assignmentsByMessageId.get(assignment.assignmentMessageId) === assignment) {
      this.#assignmentsByMessageId.delete(assignment.assignmentMessageId);
    }
  }
  #rememberCompletion(key, assignmentMessageId) {
    if (this.#tombstoneLimit === 0) {
      return;
    }
    this.#completedTaskKeys.add(key);
    if (assignmentMessageId !== null) {
      this.#completedAssignmentIds.add(assignmentMessageId);
    }
    this.#tombstones.push({ key, assignmentMessageId });
    while (this.#tombstones.length > this.#tombstoneLimit) {
      const expired = this.#tombstones.shift();
      if (expired === void 0) {
        break;
      }
      this.#completedTaskKeys.delete(expired.key);
      if (expired.assignmentMessageId !== null) {
        this.#completedAssignmentIds.delete(expired.assignmentMessageId);
      }
    }
  }
  #deliveryFailed(error) {
    this.#deliveryErrors += 1;
    try {
      this.#onDeliveryError?.(error);
    } catch {
    }
  }
};

// src/process/child-control-protocol.ts
var CHILD_CONTROL_SCHEMA_VERSION = 2;
var LIFECYCLE_CONTROL_SCHEMA_VERSION = 1;
var LIFECYCLE_CONTROL_ACTION = Object.freeze({
  DRAIN_REQUEST: "DRAIN_REQUEST",
  DRAINED: "DRAINED",
  RESTART_REQUEST: "RESTART_REQUEST",
  RELOAD_REQUEST: "RELOAD_REQUEST",
  SHUTDOWN_REQUEST: "SHUTDOWN_REQUEST"
});
var LIFECYCLE_CONTROL_ACTIONS = Object.freeze(
  Object.values(LIFECYCLE_CONTROL_ACTION)
);
var BOOTSTRAP_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "bootstrapToken",
  "role",
  "workerId",
  "taskWorkerId",
  "workerGeneration",
  "settings",
  "configVersion",
  "masterPid",
  "masterGeneration",
  "sharedRuntime"
]);
var READY_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "bootstrapToken",
  "role",
  "workerId",
  "taskWorkerId",
  "workerGeneration",
  "configVersion",
  "workerPid"
]);
var CAPACITY_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "bootstrapToken",
  "role",
  "workerId",
  "taskWorkerId",
  "workerGeneration",
  "configVersion",
  "pressured",
  "pendingMessages",
  "pendingBytes"
]);
var SHUTDOWN_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "bootstrapToken",
  "role",
  "workerId",
  "taskWorkerId",
  "workerGeneration",
  "configVersion",
  "masterGeneration"
]);
var LIFECYCLE_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "action",
  "bootstrapToken",
  "role",
  "workerId",
  "taskWorkerId",
  "workerGeneration",
  "configVersion",
  "requestId"
]);
var RESTART_REQUEST_PAYLOAD_KEYS = Object.freeze([
  ...LIFECYCLE_PAYLOAD_KEYS,
  "targetWorkerId"
]);
var RELOAD_REQUEST_PAYLOAD_KEYS = Object.freeze([
  ...LIFECYCLE_PAYLOAD_KEYS,
  "onlyTaskWorkers"
]);
function assertPlainExactRecord2(value, expectedKeys, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${name} must not contain symbol keys`);
  }
  const stringKeys = keys;
  if (stringKeys.length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${name} must contain exactly: ${expectedKeys.join(", ")}`);
  }
  return value;
}
function assertNonNegativeSafeInteger7(name, value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
function assertBoolean(name, value) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}
function assertBootstrapToken(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new TypeError("bootstrapToken must contain 1 to 128 characters");
  }
  return value;
}
function assertLifecycleRequestId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new TypeError("requestId must contain 1 to 128 characters");
  }
  return value;
}
function assertLifecycleAction(value) {
  if (!LIFECYCLE_CONTROL_ACTIONS.includes(value)) {
    throw new TypeError("CONTROL_DRAIN action is invalid");
  }
  return value;
}
function assertChildRole(value) {
  if (value !== PROCESS_ROLE.WORKER && value !== PROCESS_ROLE.TASK_WORKER && value !== PROCESS_ROLE.USER_TASK_WORKER) {
    throw new TypeError("role must be WORKER, TASK_WORKER, or USER_TASK_WORKER");
  }
  return value;
}
function parseWorkerId(value) {
  if (typeof value !== "number") {
    throw new TypeError("workerId must be a non-negative safe integer");
  }
  return createWorkerId(value);
}
function parseTaskWorkerId(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number") {
    throw new TypeError("taskWorkerId must be null or a non-negative safe integer");
  }
  return createTaskWorkerId(value);
}
function parseWorkerGeneration(value) {
  if (typeof value !== "number") {
    throw new TypeError("workerGeneration must be a non-negative safe integer");
  }
  return createWorkerGeneration(value);
}
function parseProcessPid(name, value) {
  if (typeof value !== "number") {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return createProcessPid(value);
}
function assertWorkerLayout(role, workerId, taskWorkerId, settings) {
  if (role === PROCESS_ROLE.WORKER) {
    if (taskWorkerId !== null) {
      throw new TypeError("WORKER bootstrap must use taskWorkerId=null");
    }
    if (workerId >= settings.worker_num) {
      throw new TypeError("WORKER workerId is outside the event worker range");
    }
    return;
  }
  if (role === PROCESS_ROLE.USER_TASK_WORKER) {
    if (taskWorkerId !== null) {
      throw new TypeError("USER_TASK_WORKER bootstrap must use taskWorkerId=null");
    }
    const start = settings.worker_num + settings.task_worker_num;
    const end = start + (settings.user_task_worker_num ?? 0);
    if (workerId < start || workerId >= end) {
      throw new TypeError("USER_TASK_WORKER workerId is outside the user task worker range");
    }
    return;
  }
  if (taskWorkerId === null) {
    throw new TypeError("TASK_WORKER bootstrap requires taskWorkerId");
  }
  const expectedWorkerId = toGlobalTaskWorkerId(
    settings.worker_num,
    taskWorkerId,
    settings.task_worker_num
  );
  if (workerId !== expectedWorkerId) {
    throw new TypeError("TASK_WORKER workerId does not match taskWorkerId");
  }
}
function parseControlEnvelope(value, messageType) {
  const issues = validateIpcEnvelope(value);
  if (issues.length > 0) {
    throw new TypeError(
      `invalid ${messageType} envelope: ${issues.map((issue2) => issue2.message).join("; ")}`
    );
  }
  const envelope = value;
  if (envelope.messageType !== messageType) {
    throw new TypeError(`expected ${messageType}, got ${envelope.messageType}`);
  }
  if (envelope.flags !== 0 || envelope.sessionId !== null) {
    throw new TypeError(`${messageType} must use flags=0 and sessionId=null`);
  }
  return envelope;
}
function asIpcPayload(value) {
  return value;
}
function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new TypeError(`${name} does not match the bootstrap attempt`);
  }
}
function parseLifecycleTargetWorkerId(value, bootstrap) {
  const workerId = parseWorkerId(value);
  const workerCount = bootstrap.settings.worker_num + bootstrap.settings.task_worker_num + (bootstrap.settings.user_task_worker_num ?? 0);
  if (workerId >= workerCount) {
    throw new TypeError("targetWorkerId is outside the configured process pool");
  }
  return workerId;
}
function createBootstrapControlEnvelope(options) {
  const settings = loadRuntimeSettings(options.settings);
  const role = assertChildRole(options.role);
  const configVersion = assertNonNegativeSafeInteger7(
    "configVersion",
    options.configVersion
  );
  const masterGeneration = assertNonNegativeSafeInteger7(
    "masterGeneration",
    options.masterGeneration
  );
  const bootstrapToken = assertBootstrapToken(options.bootstrapToken);
  const masterPid = parseProcessPid("masterPid", options.masterPid);
  const connectionCapacity = Math.min(
    settings.max_conn ?? SESSION_ID_LAYOUT.maxSlotIndex + 1,
    SESSION_ID_LAYOUT.maxSlotIndex + 1
  );
  const sharedRuntime = validateSharedRuntimeDescriptor(options.sharedRuntime, {
    masterPid,
    masterGeneration,
    connectionCapacity,
    workerCapacity: settings.worker_num + settings.task_worker_num + (settings.user_task_worker_num ?? 0)
  });
  assertWorkerLayout(role, options.workerId, options.taskWorkerId, settings);
  const payload = Object.freeze({
    schemaVersion: CHILD_CONTROL_SCHEMA_VERSION,
    bootstrapToken,
    role,
    workerId: options.workerId,
    taskWorkerId: options.taskWorkerId,
    workerGeneration: options.workerGeneration,
    settings,
    configVersion,
    masterPid,
    masterGeneration,
    sharedRuntime
  });
  const envelope = createIpcEnvelope({
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: createMessageId(options.messageId),
    messageType: IPC_MESSAGE_TYPE.CONTROL_BOOTSTRAP,
    sourceRole: PROCESS_ROLE.MASTER,
    sourceWorkerId: null,
    sourceGeneration: null,
    targetRole: role,
    targetWorkerId: options.workerId,
    correlationId: null,
    sessionId: null,
    sequence: createIpcSequence(options.sequence ?? 0),
    flags: 0,
    payload: asIpcPayload(payload)
  });
  parseBootstrapControlEnvelope(envelope);
  return envelope;
}
function parseBootstrapControlEnvelope(value) {
  const envelope = parseControlEnvelope(value, IPC_MESSAGE_TYPE.CONTROL_BOOTSTRAP);
  if (envelope.sourceRole !== PROCESS_ROLE.MASTER || envelope.sourceWorkerId !== null || envelope.sourceGeneration !== null || envelope.correlationId !== null) {
    throw new TypeError("CONTROL_BOOTSTRAP must originate from MASTER without correlation");
  }
  const payload = assertPlainExactRecord2(
    envelope.payload,
    BOOTSTRAP_PAYLOAD_KEYS,
    "CONTROL_BOOTSTRAP payload"
  );
  assertEqual("schemaVersion", payload.schemaVersion, CHILD_CONTROL_SCHEMA_VERSION);
  const bootstrapToken = assertBootstrapToken(payload.bootstrapToken);
  const role = assertChildRole(payload.role);
  const workerId = parseWorkerId(payload.workerId);
  const taskWorkerId = parseTaskWorkerId(payload.taskWorkerId);
  const workerGeneration = parseWorkerGeneration(payload.workerGeneration);
  const settings = loadRuntimeSettings(payload.settings);
  const configVersion = assertNonNegativeSafeInteger7(
    "configVersion",
    payload.configVersion
  );
  const masterPid = parseProcessPid("masterPid", payload.masterPid);
  const masterGeneration = assertNonNegativeSafeInteger7(
    "masterGeneration",
    payload.masterGeneration
  );
  const connectionCapacity = Math.min(
    settings.max_conn ?? SESSION_ID_LAYOUT.maxSlotIndex + 1,
    SESSION_ID_LAYOUT.maxSlotIndex + 1
  );
  const sharedRuntime = validateSharedRuntimeDescriptor(payload.sharedRuntime, {
    masterPid,
    masterGeneration,
    connectionCapacity,
    workerCapacity: settings.worker_num + settings.task_worker_num + (settings.user_task_worker_num ?? 0)
  });
  assertWorkerLayout(role, workerId, taskWorkerId, settings);
  assertEqual("targetRole", envelope.targetRole, role);
  assertEqual("targetWorkerId", envelope.targetWorkerId, workerId);
  return Object.freeze({
    bootstrapMessageId: createMessageId(envelope.messageId),
    bootstrapSequence: createIpcSequence(envelope.sequence),
    bootstrapToken,
    role,
    workerId,
    taskWorkerId,
    workerGeneration,
    settings,
    configVersion,
    masterPid,
    masterGeneration,
    sharedRuntime
  });
}
function createReadyControlEnvelope(bootstrap, options) {
  const workerPid = parseProcessPid("workerPid", options.workerPid);
  const payload = Object.freeze({
    schemaVersion: CHILD_CONTROL_SCHEMA_VERSION,
    bootstrapToken: bootstrap.bootstrapToken,
    role: bootstrap.role,
    workerId: bootstrap.workerId,
    taskWorkerId: bootstrap.taskWorkerId,
    workerGeneration: bootstrap.workerGeneration,
    configVersion: bootstrap.configVersion,
    workerPid
  });
  const envelope = createIpcEnvelope({
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: createMessageId(options.messageId),
    messageType: IPC_MESSAGE_TYPE.CONTROL_READY,
    sourceRole: bootstrap.role,
    sourceWorkerId: bootstrap.workerId,
    sourceGeneration: bootstrap.workerGeneration,
    targetRole: PROCESS_ROLE.MASTER,
    targetWorkerId: null,
    correlationId: createCorrelationId(bootstrap.bootstrapMessageId),
    sessionId: null,
    sequence: createIpcSequence(options.sequence ?? 0),
    flags: 0,
    payload: asIpcPayload(payload)
  });
  parseReadyControlEnvelope(envelope, bootstrap, workerPid);
  return envelope;
}
function parseReadyControlEnvelope(value, bootstrap, expectedWorkerPid) {
  const envelope = parseControlEnvelope(value, IPC_MESSAGE_TYPE.CONTROL_READY);
  assertEqual("sourceRole", envelope.sourceRole, bootstrap.role);
  assertEqual("sourceWorkerId", envelope.sourceWorkerId, bootstrap.workerId);
  assertEqual(
    "sourceGeneration",
    envelope.sourceGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("targetRole", envelope.targetRole, PROCESS_ROLE.MASTER);
  assertEqual("targetWorkerId", envelope.targetWorkerId, null);
  assertEqual("correlationId", envelope.correlationId, bootstrap.bootstrapMessageId);
  const payload = assertPlainExactRecord2(
    envelope.payload,
    READY_PAYLOAD_KEYS,
    "CONTROL_READY payload"
  );
  assertEqual("schemaVersion", payload.schemaVersion, CHILD_CONTROL_SCHEMA_VERSION);
  assertEqual("bootstrapToken", payload.bootstrapToken, bootstrap.bootstrapToken);
  assertEqual("role", payload.role, bootstrap.role);
  assertEqual("workerId", payload.workerId, bootstrap.workerId);
  assertEqual("taskWorkerId", payload.taskWorkerId, bootstrap.taskWorkerId);
  assertEqual(
    "workerGeneration",
    payload.workerGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("configVersion", payload.configVersion, bootstrap.configVersion);
  const workerPid = parseProcessPid("workerPid", payload.workerPid);
  assertEqual("workerPid", workerPid, expectedWorkerPid);
  return Object.freeze({
    messageId: createMessageId(envelope.messageId),
    sequence: createIpcSequence(envelope.sequence),
    workerPid
  });
}
function createCapacityControlEnvelope(bootstrap, options) {
  const pressured = assertBoolean("pressured", options.pressured);
  const pendingMessages = assertNonNegativeSafeInteger7(
    "pendingMessages",
    options.pendingMessages
  );
  const pendingBytes = assertNonNegativeSafeInteger7(
    "pendingBytes",
    options.pendingBytes
  );
  const payload = Object.freeze({
    schemaVersion: CHILD_CONTROL_SCHEMA_VERSION,
    bootstrapToken: bootstrap.bootstrapToken,
    role: bootstrap.role,
    workerId: bootstrap.workerId,
    taskWorkerId: bootstrap.taskWorkerId,
    workerGeneration: bootstrap.workerGeneration,
    configVersion: bootstrap.configVersion,
    pressured,
    pendingMessages,
    pendingBytes
  });
  const envelope = createIpcEnvelope({
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: createMessageId(options.messageId),
    messageType: IPC_MESSAGE_TYPE.CONTROL_CAPACITY,
    sourceRole: bootstrap.role,
    sourceWorkerId: bootstrap.workerId,
    sourceGeneration: bootstrap.workerGeneration,
    targetRole: PROCESS_ROLE.MASTER,
    targetWorkerId: null,
    correlationId: createCorrelationId(bootstrap.bootstrapMessageId),
    sessionId: null,
    sequence: createIpcSequence(options.sequence ?? 1),
    flags: 0,
    payload: asIpcPayload(payload)
  });
  parseCapacityControlEnvelope(envelope, bootstrap);
  return envelope;
}
function parseCapacityControlEnvelope(value, bootstrap) {
  const envelope = parseControlEnvelope(value, IPC_MESSAGE_TYPE.CONTROL_CAPACITY);
  assertEqual("sourceRole", envelope.sourceRole, bootstrap.role);
  assertEqual("sourceWorkerId", envelope.sourceWorkerId, bootstrap.workerId);
  assertEqual(
    "sourceGeneration",
    envelope.sourceGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("targetRole", envelope.targetRole, PROCESS_ROLE.MASTER);
  assertEqual("targetWorkerId", envelope.targetWorkerId, null);
  assertEqual("correlationId", envelope.correlationId, bootstrap.bootstrapMessageId);
  const payload = assertPlainExactRecord2(
    envelope.payload,
    CAPACITY_PAYLOAD_KEYS,
    "CONTROL_CAPACITY payload"
  );
  assertEqual("schemaVersion", payload.schemaVersion, CHILD_CONTROL_SCHEMA_VERSION);
  assertEqual("bootstrapToken", payload.bootstrapToken, bootstrap.bootstrapToken);
  assertEqual("role", payload.role, bootstrap.role);
  assertEqual("workerId", payload.workerId, bootstrap.workerId);
  assertEqual("taskWorkerId", payload.taskWorkerId, bootstrap.taskWorkerId);
  assertEqual(
    "workerGeneration",
    payload.workerGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("configVersion", payload.configVersion, bootstrap.configVersion);
  const pressured = assertBoolean("pressured", payload.pressured);
  const pendingMessages = assertNonNegativeSafeInteger7(
    "pendingMessages",
    payload.pendingMessages
  );
  const pendingBytes = assertNonNegativeSafeInteger7(
    "pendingBytes",
    payload.pendingBytes
  );
  return Object.freeze({
    messageId: createMessageId(envelope.messageId),
    sequence: createIpcSequence(envelope.sequence),
    pressured,
    pendingMessages,
    pendingBytes
  });
}
function createShutdownControlEnvelope(bootstrap, options) {
  const payload = Object.freeze({
    schemaVersion: CHILD_CONTROL_SCHEMA_VERSION,
    bootstrapToken: bootstrap.bootstrapToken,
    role: bootstrap.role,
    workerId: bootstrap.workerId,
    taskWorkerId: bootstrap.taskWorkerId,
    workerGeneration: bootstrap.workerGeneration,
    configVersion: bootstrap.configVersion,
    masterGeneration: bootstrap.masterGeneration
  });
  const envelope = createIpcEnvelope({
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: createMessageId(options.messageId),
    messageType: IPC_MESSAGE_TYPE.CONTROL_SHUTDOWN,
    sourceRole: PROCESS_ROLE.MASTER,
    sourceWorkerId: null,
    sourceGeneration: null,
    targetRole: bootstrap.role,
    targetWorkerId: bootstrap.workerId,
    correlationId: createCorrelationId(bootstrap.bootstrapMessageId),
    sessionId: null,
    sequence: createIpcSequence(options.sequence ?? 1),
    flags: 0,
    payload: asIpcPayload(payload)
  });
  parseShutdownControlEnvelope(envelope, bootstrap);
  return envelope;
}
function parseShutdownControlEnvelope(value, bootstrap) {
  const envelope = parseControlEnvelope(value, IPC_MESSAGE_TYPE.CONTROL_SHUTDOWN);
  assertEqual("sourceRole", envelope.sourceRole, PROCESS_ROLE.MASTER);
  assertEqual("sourceWorkerId", envelope.sourceWorkerId, null);
  assertEqual("sourceGeneration", envelope.sourceGeneration, null);
  assertEqual("targetRole", envelope.targetRole, bootstrap.role);
  assertEqual("targetWorkerId", envelope.targetWorkerId, bootstrap.workerId);
  assertEqual("correlationId", envelope.correlationId, bootstrap.bootstrapMessageId);
  const payload = assertPlainExactRecord2(
    envelope.payload,
    SHUTDOWN_PAYLOAD_KEYS,
    "CONTROL_SHUTDOWN payload"
  );
  assertEqual("schemaVersion", payload.schemaVersion, CHILD_CONTROL_SCHEMA_VERSION);
  assertEqual("bootstrapToken", payload.bootstrapToken, bootstrap.bootstrapToken);
  assertEqual("role", payload.role, bootstrap.role);
  assertEqual("workerId", payload.workerId, bootstrap.workerId);
  assertEqual("taskWorkerId", payload.taskWorkerId, bootstrap.taskWorkerId);
  assertEqual(
    "workerGeneration",
    payload.workerGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("configVersion", payload.configVersion, bootstrap.configVersion);
  assertEqual(
    "masterGeneration",
    payload.masterGeneration,
    bootstrap.masterGeneration
  );
  return envelope;
}
function createLifecycleControlEnvelope(bootstrap, action, options, actionPayload = {}) {
  const requestId = assertLifecycleRequestId(options.requestId);
  const payload = Object.freeze({
    schemaVersion: LIFECYCLE_CONTROL_SCHEMA_VERSION,
    action,
    bootstrapToken: bootstrap.bootstrapToken,
    role: bootstrap.role,
    workerId: bootstrap.workerId,
    taskWorkerId: bootstrap.taskWorkerId,
    workerGeneration: bootstrap.workerGeneration,
    configVersion: bootstrap.configVersion,
    requestId,
    ...actionPayload
  });
  const masterAuthored = action === LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST;
  const envelope = createIpcEnvelope({
    protocolVersion: IPC_PROTOCOL_VERSION,
    messageId: createMessageId(options.messageId),
    messageType: IPC_MESSAGE_TYPE.CONTROL_DRAIN,
    sourceRole: masterAuthored ? PROCESS_ROLE.MASTER : bootstrap.role,
    sourceWorkerId: masterAuthored ? null : bootstrap.workerId,
    sourceGeneration: masterAuthored ? null : bootstrap.workerGeneration,
    targetRole: masterAuthored ? bootstrap.role : PROCESS_ROLE.MASTER,
    targetWorkerId: masterAuthored ? bootstrap.workerId : null,
    correlationId: createCorrelationId(bootstrap.bootstrapMessageId),
    sessionId: null,
    sequence: createIpcSequence(options.sequence ?? 1),
    flags: 0,
    payload: asIpcPayload(payload)
  });
  parseLifecycleControlEnvelope(envelope, bootstrap);
  return envelope;
}
function createDrainRequest(bootstrap, options) {
  return createLifecycleControlEnvelope(
    bootstrap,
    LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST,
    options
  );
}
function createDrained(bootstrap, options) {
  return createLifecycleControlEnvelope(
    bootstrap,
    LIFECYCLE_CONTROL_ACTION.DRAINED,
    options
  );
}
function createRestartRequest(bootstrap, options) {
  const targetWorkerId = parseLifecycleTargetWorkerId(
    options.targetWorkerId,
    bootstrap
  );
  return createLifecycleControlEnvelope(
    bootstrap,
    LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST,
    options,
    { targetWorkerId }
  );
}
function createReloadRequest(bootstrap, options) {
  const onlyTaskWorkers = assertBoolean(
    "onlyTaskWorkers",
    options.onlyTaskWorkers
  );
  return createLifecycleControlEnvelope(
    bootstrap,
    LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST,
    options,
    { onlyTaskWorkers }
  );
}
function createShutdownRequest(bootstrap, options) {
  return createLifecycleControlEnvelope(
    bootstrap,
    LIFECYCLE_CONTROL_ACTION.SHUTDOWN_REQUEST,
    options
  );
}
function parseLifecycleControlEnvelope(value, bootstrap) {
  const envelope = parseControlEnvelope(value, IPC_MESSAGE_TYPE.CONTROL_DRAIN);
  if (typeof envelope.payload !== "object" || envelope.payload === null || Array.isArray(envelope.payload) || envelope.payload instanceof Uint8Array) {
    throw new TypeError("CONTROL_DRAIN payload must be a plain object");
  }
  const action = assertLifecycleAction(
    envelope.payload.action
  );
  const expectedKeys = action === LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST ? RESTART_REQUEST_PAYLOAD_KEYS : action === LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST ? RELOAD_REQUEST_PAYLOAD_KEYS : LIFECYCLE_PAYLOAD_KEYS;
  const payload = assertPlainExactRecord2(
    envelope.payload,
    expectedKeys,
    "CONTROL_DRAIN payload"
  );
  assertEqual(
    "schemaVersion",
    payload.schemaVersion,
    LIFECYCLE_CONTROL_SCHEMA_VERSION
  );
  assertEqual("bootstrapToken", payload.bootstrapToken, bootstrap.bootstrapToken);
  assertEqual("role", payload.role, bootstrap.role);
  assertEqual("workerId", payload.workerId, bootstrap.workerId);
  assertEqual("taskWorkerId", payload.taskWorkerId, bootstrap.taskWorkerId);
  assertEqual(
    "workerGeneration",
    payload.workerGeneration,
    bootstrap.workerGeneration
  );
  assertEqual("configVersion", payload.configVersion, bootstrap.configVersion);
  const requestId = assertLifecycleRequestId(payload.requestId);
  const masterAuthored = action === LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST;
  assertEqual(
    "sourceRole",
    envelope.sourceRole,
    masterAuthored ? PROCESS_ROLE.MASTER : bootstrap.role
  );
  assertEqual(
    "sourceWorkerId",
    envelope.sourceWorkerId,
    masterAuthored ? null : bootstrap.workerId
  );
  assertEqual(
    "sourceGeneration",
    envelope.sourceGeneration,
    masterAuthored ? null : bootstrap.workerGeneration
  );
  assertEqual(
    "targetRole",
    envelope.targetRole,
    masterAuthored ? bootstrap.role : PROCESS_ROLE.MASTER
  );
  assertEqual(
    "targetWorkerId",
    envelope.targetWorkerId,
    masterAuthored ? bootstrap.workerId : null
  );
  assertEqual("correlationId", envelope.correlationId, bootstrap.bootstrapMessageId);
  const common = {
    messageId: createMessageId(envelope.messageId),
    sequence: createIpcSequence(envelope.sequence),
    requestId
  };
  switch (action) {
    case LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST:
      return Object.freeze({
        ...common,
        action
      });
    case LIFECYCLE_CONTROL_ACTION.DRAINED:
      return Object.freeze({
        ...common,
        action
      });
    case LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST:
      return Object.freeze({
        ...common,
        action,
        targetWorkerId: parseLifecycleTargetWorkerId(
          payload.targetWorkerId,
          bootstrap
        )
      });
    case LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST:
      return Object.freeze({
        ...common,
        action,
        onlyTaskWorkers: assertBoolean(
          "onlyTaskWorkers",
          payload.onlyTaskWorkers
        )
      });
    case LIFECYCLE_CONTROL_ACTION.SHUTDOWN_REQUEST:
      return Object.freeze({
        ...common,
        action
      });
  }
}

// src/process/node-child-process-adapter.ts
import {
  fork
} from "node:child_process";
function createDeferred3() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function spawnFailure(entrypoint, cause) {
  return new Error(`failed to spawn managed child ${String(entrypoint)}`, { cause });
}
var NodeManagedChildProcess = class {
  spawned;
  closed;
  ownsReceivedMessages = true;
  #child;
  #entrypoint;
  #compactIpcEnvelopes;
  #spawnedDeferred = createDeferred3();
  #closedDeferred = createDeferred3();
  #messageListeners = /* @__PURE__ */ new Map();
  #disconnectListeners = /* @__PURE__ */ new Map();
  #spawnSettled = false;
  #closedSettled = false;
  #firstError;
  constructor(child, entrypoint, compactIpcEnvelopes) {
    this.#child = child;
    this.#entrypoint = entrypoint;
    this.#compactIpcEnvelopes = compactIpcEnvelopes;
    this.spawned = this.#spawnedDeferred.promise;
    this.closed = this.#closedDeferred.promise;
    void this.spawned.catch(() => void 0);
    child.once("spawn", this.#onSpawn);
    child.on("error", this.#onError);
    child.once("close", this.#onClose);
  }
  get connected() {
    return this.#child.connected;
  }
  startSend(message) {
    if (!this.#child.connected) {
      const completed = Promise.reject(
        new Error("managed child IPC channel is closed")
      );
      return Object.freeze({ backpressured: false, completed });
    }
    const completedDeferred = createDeferred3();
    let accepted = true;
    try {
      const wireMessage = this.#compactIpcEnvelopes ? encodeNodeIpcWireMessage(message) : message;
      accepted = this.#child.send(wireMessage, (error) => {
        if (error === null) {
          completedDeferred.resolve();
        } else {
          completedDeferred.reject(error);
        }
      });
    } catch (error) {
      completedDeferred.reject(error);
    }
    return Object.freeze({
      backpressured: !accepted,
      completed: completedDeferred.promise
    });
  }
  send(message) {
    return this.startSend(message).completed;
  }
  onMessage(listener) {
    if (this.#closedSettled) {
      return () => {
      };
    }
    const existing = this.#messageListeners.get(listener);
    if (existing !== void 0) {
      return () => this.#removeMessageListener(listener, existing);
    }
    const wrapped = (message) => listener(
      this.#compactIpcEnvelopes ? decodeNodeIpcWireMessage(message) : message
    );
    this.#messageListeners.set(listener, wrapped);
    this.#child.on("message", wrapped);
    return () => this.#removeMessageListener(listener, wrapped);
  }
  onDisconnect(listener) {
    if (this.#closedSettled || !this.#child.connected) {
      return () => {
      };
    }
    const existing = this.#disconnectListeners.get(listener);
    if (existing !== void 0) {
      return () => this.#removeDisconnectListener(listener, existing);
    }
    const wrapped = () => listener();
    this.#disconnectListeners.set(listener, wrapped);
    this.#child.on("disconnect", wrapped);
    return () => this.#removeDisconnectListener(listener, wrapped);
  }
  kill(signal) {
    return this.#child.kill(signal);
  }
  #onSpawn = () => {
    if (this.#spawnSettled) {
      return;
    }
    const pid = this.#child.pid;
    if (pid === void 0) {
      const error = spawnFailure(
        this.#entrypoint,
        new Error("child emitted spawn without a process id")
      );
      this.#firstError ??= error;
      this.#spawnSettled = true;
      this.#spawnedDeferred.reject(error);
      return;
    }
    this.#spawnSettled = true;
    this.#spawnedDeferred.resolve(createProcessPid(pid));
  };
  #onError = (error) => {
    this.#firstError ??= error;
    if (!this.#spawnSettled) {
      this.#spawnSettled = true;
      this.#spawnedDeferred.reject(spawnFailure(this.#entrypoint, error));
    }
  };
  #onClose = (code, signal) => {
    if (this.#closedSettled) {
      return;
    }
    this.#closedSettled = true;
    if (!this.#spawnSettled) {
      const error = spawnFailure(
        this.#entrypoint,
        this.#firstError ?? new Error("child closed before emitting spawn")
      );
      this.#firstError ??= error;
      this.#spawnSettled = true;
      this.#spawnedDeferred.reject(error);
    }
    this.#removeUserListeners();
    this.#child.off("error", this.#onError);
    const result = this.#firstError === void 0 ? Object.freeze({ code, signal }) : Object.freeze({ code, signal, error: this.#firstError });
    this.#closedDeferred.resolve(result);
  };
  #removeMessageListener(listener, wrapped) {
    if (this.#messageListeners.get(listener) !== wrapped) {
      return;
    }
    this.#messageListeners.delete(listener);
    this.#child.off("message", wrapped);
  }
  #removeDisconnectListener(listener, wrapped) {
    if (this.#disconnectListeners.get(listener) !== wrapped) {
      return;
    }
    this.#disconnectListeners.delete(listener);
    this.#child.off("disconnect", wrapped);
  }
  #removeUserListeners() {
    for (const wrapped of this.#messageListeners.values()) {
      this.#child.off("message", wrapped);
    }
    this.#messageListeners.clear();
    for (const wrapped of this.#disconnectListeners.values()) {
      this.#child.off("disconnect", wrapped);
    }
    this.#disconnectListeners.clear();
  }
};
var NodeChildProcessSpawner = class {
  spawn(options) {
    const compactIpcEnvelopes = options.compactIpcEnvelopes === true;
    const child = fork(options.entrypoint, [], {
      env: {
        ...process.env,
        ...options.env,
        ...compactIpcEnvelopes ? { ALLOY_CORE_COMPACT_IPC: "1" } : {}
      },
      execArgv: [],
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    return new NodeManagedChildProcess(
      child,
      options.entrypoint,
      compactIpcEnvelopes
    );
  }
};

// src/process/process-bus.ts
import { AsyncLocalStorage as AsyncLocalStorage3 } from "node:async_hooks";
import { randomBytes } from "node:crypto";
var PROCESS_BUS_FLAG_EXPECT_RESPONSE = 1;
var PROCESS_BUS_FLAG_RESPONSE = 2;
var PROCESS_BUS_FLAG_ERROR_RESPONSE = 4;
var PROCESS_BUS_FLAG = Object.freeze({
  EXPECT_RESPONSE: PROCESS_BUS_FLAG_EXPECT_RESPONSE,
  RESPONSE: PROCESS_BUS_FLAG_RESPONSE,
  ERROR_RESPONSE: PROCESS_BUS_FLAG_ERROR_RESPONSE
});
var DEFAULT_PROCESS_BUS_REQUEST_TIMEOUT_MS = 3e4;
var DEFAULT_PROCESS_BUS_MAX_PENDING_REQUESTS = 1024;
var DEFAULT_PROCESS_BUS_MAILBOX_MAX_MESSAGES = 1024;
var DEFAULT_PROCESS_BUS_MAILBOX_MAX_BYTES = 8 * 1024 * 1024;
var CONTROL_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  IPC_MESSAGE_TYPE.CONTROL_BOOTSTRAP,
  IPC_MESSAGE_TYPE.CONTROL_READY,
  IPC_MESSAGE_TYPE.CONTROL_DRAIN,
  IPC_MESSAGE_TYPE.CONTROL_SHUTDOWN,
  IPC_MESSAGE_TYPE.CONTROL_HEARTBEAT,
  IPC_MESSAGE_TYPE.CONTROL_CAPACITY
]);
var DRAINING_TARGET_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  IPC_MESSAGE_TYPE.TASK_FINISH,
  IPC_MESSAGE_TYPE.NET_CLOSE
]);
var RESERVED_BUS_FLAGS = PROCESS_BUS_FLAG_EXPECT_RESPONSE | PROCESS_BUS_FLAG_RESPONSE | PROCESS_BUS_FLAG_ERROR_RESPONSE;
var activeMailboxHandler = new AsyncLocalStorage3();
var processBusPeerHandleBrand = /* @__PURE__ */ Symbol("ProcessBusPeerHandle");
function createDeferred4() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function assertNonNegativeCapacity(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function assertPositiveTimeout(name, value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
    throw new RangeError(`${name} must be a safe integer in [1, 2147483647], got ${value}`);
  }
}
function assertIdentity(identity, name) {
  if (identity.role === PROCESS_ROLE.MASTER) {
    if (identity.workerId !== null || identity.generation !== null) {
      throw new TypeError(`${name} MASTER identity must use null workerId and generation`);
    }
    return;
  }
  if (identity.workerId === null || !Number.isSafeInteger(identity.workerId) || identity.workerId < 0 || identity.generation === null || !Number.isSafeInteger(identity.generation) || identity.generation < 0) {
    throw new TypeError(
      `${name} ${identity.role} identity requires non-negative workerId and generation`
    );
  }
}
function freezeIdentity(identity) {
  assertIdentity(identity, "process bus");
  return Object.freeze({ ...identity });
}
function freezeTransportCapacityState(state) {
  return Object.freeze({ ...state });
}
function transportCapacityState(transport) {
  const stats = transport.stats();
  return Object.freeze({
    pressured: stats.dataPressured,
    nativeBackpressured: stats.backpressured,
    dataPendingMessages: stats.dataPendingMessages,
    dataPendingBytes: stats.dataPendingBytes,
    dataMaxMessages: stats.dataMaxMessages,
    dataMaxBytes: stats.dataMaxBytes,
    dataHighWaterMessages: stats.dataHighWaterMessages,
    dataHighWaterBytes: stats.dataHighWaterBytes,
    dataLowWaterMessages: stats.dataLowWaterMessages,
    dataLowWaterBytes: stats.dataLowWaterBytes
  });
}
function addressKey(address) {
  const role = "targetRole" in address ? address.targetRole : address.role;
  const workerId = "targetWorkerId" in address ? address.targetWorkerId : address.workerId;
  return `${role}:${workerId === null ? "master" : workerId}`;
}
function isReadyState(state) {
  return state === WORKER_STATE.READY || state === WORKER_STATE.RUNNING;
}
function hasFlag(flags, flag) {
  return (flags & flag) !== 0;
}
function assertDataEnvelope(envelope) {
  if (CONTROL_MESSAGE_TYPES.has(envelope.messageType)) {
    throw new TypeError(
      `ProcessBus only routes data messages, got ${envelope.messageType}`
    );
  }
  const response = hasFlag(envelope.flags, PROCESS_BUS_FLAG_RESPONSE);
  const errorResponse = hasFlag(envelope.flags, PROCESS_BUS_FLAG_ERROR_RESPONSE);
  const expectsResponse = hasFlag(envelope.flags, PROCESS_BUS_FLAG_EXPECT_RESPONSE);
  if (errorResponse && !response) {
    throw new TypeError("ERROR_RESPONSE must also set RESPONSE");
  }
  if (response && expectsResponse) {
    throw new TypeError("an IPC envelope cannot be both a request and a response");
  }
  if (response && envelope.correlationId === null) {
    throw new TypeError("RESPONSE requires correlationId");
  }
}
function assertUserFlags(flags) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 4294967295) {
    throw new RangeError(`flags must be an unsigned 32-bit integer, got ${flags}`);
  }
  if ((flags & RESERVED_BUS_FLAGS) !== 0) {
    throw new TypeError("send/request/reply flags cannot contain ProcessBus reserved flags");
  }
}
function channelClosedError2(message, details = {}) {
  return new FrameworkError(FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED, message, details);
}
function workerNotReadyError(identity, message) {
  return new FrameworkError(FRAMEWORK_ERROR_CODE.WORKER_NOT_READY, message, {
    role: identity.role,
    workerId: identity.workerId,
    generation: identity.generation
  });
}
function staleGenerationError(identity, message) {
  return new FrameworkError(FRAMEWORK_ERROR_CODE.STALE_GENERATION, message, {
    role: identity.role,
    workerId: identity.workerId,
    generation: identity.generation
  });
}
function asFrameworkError(error) {
  if (error instanceof FrameworkError) {
    return error;
  }
  return channelClosedError2(
    "IPC route failed",
    error instanceof Error ? { cause: error.message } : {}
  );
}
function jsonSafeDetails(details) {
  const result = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return Object.freeze(result);
}
function frameworkErrorPayload(error) {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: jsonSafeDetails(error.details)
  });
}
function remoteFrameworkError(envelope) {
  const payload = envelope.payload;
  if (typeof payload === "object" && payload !== null && !(payload instanceof Uint8Array) && !Array.isArray(payload)) {
    const candidate = payload;
    if (typeof candidate.code === "string" && FRAMEWORK_ERROR_CODES.includes(candidate.code)) {
      return new FrameworkError(
        candidate.code,
        typeof candidate.message === "string" ? candidate.message : "remote ProcessBus request failed",
        typeof candidate.details === "object" && candidate.details !== null ? candidate.details : {}
      );
    }
  }
  return channelClosedError2("remote ProcessBus request returned an invalid error response");
}
var ProcessBusRequestTimeoutError = class extends Error {
  messageId;
  timeoutMs;
  constructor(messageId, timeoutMs) {
    super(`ProcessBus request ${messageId} timed out after ${timeoutMs}ms`);
    this.name = "ProcessBusRequestTimeoutError";
    this.messageId = messageId;
    this.timeoutMs = timeoutMs;
  }
};
var ProcessBus = class {
  localIdentity;
  #registry;
  #codec;
  #timers;
  #metrics;
  #ownsTimers;
  #requestTimeoutMs;
  #maxPendingRequests;
  #mailboxMaxMessages;
  #mailboxMaxBytes;
  #messageIdPrefix;
  #messageIdFactory;
  #peerByHandle = /* @__PURE__ */ new WeakMap();
  #peers = /* @__PURE__ */ new Set();
  #activePeers = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  #handlers = /* @__PURE__ */ new Set();
  #peerUnavailableHandlers = /* @__PURE__ */ new Set();
  #peerCapacityHandlers = /* @__PURE__ */ new Set();
  #mailbox = [];
  #mailboxDrainWaiters = /* @__PURE__ */ new Set();
  #sequenceByTarget = /* @__PURE__ */ new Map();
  #state = "open";
  #localActive;
  #localRequestsSealed = false;
  #mailboxInFlight;
  #mailboxScheduled = false;
  #mailboxMessages = 0;
  #mailboxBytes = 0;
  #closePromise;
  #messageCounter = 0;
  #sentMessages = 0;
  #receivedMessages = 0;
  #forwardedMessages = 0;
  #localMessages = 0;
  #settledResponses = 0;
  #errorResponses = 0;
  #lateResponses = 0;
  #wrongPeerResponses = 0;
  #rejectedMessages = 0;
  #rejectionCounts = /* @__PURE__ */ new Map();
  #requestTimeouts = 0;
  #pendingRequestRejections = 0;
  #staleGenerationRejections = 0;
  #handlerErrors = 0;
  constructor(options) {
    const identity = options.identity ?? options.localIdentity;
    if (identity === void 0) {
      throw new TypeError("ProcessBus requires identity or localIdentity");
    }
    if (options.identity !== void 0 && options.localIdentity !== void 0 && (options.identity.role !== options.localIdentity.role || options.identity.workerId !== options.localIdentity.workerId || options.identity.generation !== options.localIdentity.generation)) {
      throw new TypeError("ProcessBus identity and localIdentity must match");
    }
    this.localIdentity = freezeIdentity(identity);
    if (this.localIdentity.role === PROCESS_ROLE.MASTER) {
      if (options.registry === void 0) {
        throw new TypeError("Master ProcessBus requires a WorkerRegistry");
      }
      this.#registry = options.registry;
      this.#localActive = true;
    } else {
      if (options.registry !== void 0) {
        throw new TypeError("Worker ProcessBus cannot own a WorkerRegistry");
      }
      this.#registry = void 0;
      this.#localActive = false;
    }
    this.#ownsTimers = options.timers === void 0;
    this.#timers = options.timers ?? new SystemTimerScheduler({
      onCallbackError: () => void 0
    });
    this.#metrics = options.metrics;
    this.#codec = options.codec ?? new IpcEnvelopeCodec();
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_PROCESS_BUS_REQUEST_TIMEOUT_MS;
    this.#maxPendingRequests = options.maxPendingRequests ?? DEFAULT_PROCESS_BUS_MAX_PENDING_REQUESTS;
    this.#mailboxMaxMessages = options.mailboxMaxMessages ?? DEFAULT_PROCESS_BUS_MAILBOX_MAX_MESSAGES;
    this.#mailboxMaxBytes = options.mailboxMaxBytes ?? DEFAULT_PROCESS_BUS_MAILBOX_MAX_BYTES;
    assertPositiveTimeout("requestTimeoutMs", this.#requestTimeoutMs);
    assertNonNegativeCapacity("maxPendingRequests", this.#maxPendingRequests);
    assertNonNegativeCapacity("mailboxMaxMessages", this.#mailboxMaxMessages);
    assertNonNegativeCapacity("mailboxMaxBytes", this.#mailboxMaxBytes);
    this.#messageIdPrefix = options.messageIdFactory === void 0 ? randomBytes(12).toString("base64url") : void 0;
    this.#messageIdFactory = options.messageIdFactory;
  }
  activateLocal() {
    this.#assertOpen();
    this.#localActive = true;
  }
  attachPeer(options) {
    this.#assertOpen();
    const identity = freezeIdentity({
      role: options.role,
      workerId: options.workerId,
      generation: options.generation
    });
    this.#assertAllowedPeer(identity);
    const handle = Object.freeze({
      [processBusPeerHandleBrand]: true
    });
    const peer = {
      handle,
      identity,
      transport: options.transport,
      localCapacity: transportCapacityState(options.transport),
      remotePressured: false,
      disposeCapacity: () => {
      },
      phase: "attached"
    };
    this.#peerByHandle.set(handle, peer);
    this.#peers.add(peer);
    let subscribing = true;
    peer.disposeCapacity = options.transport.onCapacityChange((state) => {
      const wasPressured = this.#peerIsPressured(peer);
      peer.localCapacity = freezeTransportCapacityState(state);
      if (!subscribing && wasPressured !== this.#peerIsPressured(peer)) {
        this.#recordPeerPressureTransition(peer);
        this.#notifyPeerCapacityHandlers(peer);
      }
    });
    subscribing = false;
    this.#notifyPeerCapacityHandlers(peer);
    void options.transport.closed.then(
      () => this.#onPeerTransportClosed(peer),
      () => this.#onPeerTransportClosed(peer)
    ).catch(() => void 0);
    return handle;
  }
  activatePeer(handle) {
    this.#assertOpen();
    const peer = this.#requirePeer(handle);
    if (peer.phase === "detached") {
      throw channelClosedError2("cannot activate a detached ProcessBus peer");
    }
    if (peer.phase === "superseded") {
      throw staleGenerationError(peer.identity, "cannot reactivate a superseded ProcessBus peer");
    }
    this.#assertPeerCurrentAndReady(peer);
    const key = addressKey(peer.identity);
    const previous = this.#activePeers.get(key);
    if (previous !== void 0 && previous !== peer) {
      this.#deactivatePeer(
        previous,
        "superseded",
        staleGenerationError(previous.identity, "ProcessBus peer was superseded")
      );
    }
    peer.phase = "active";
    this.#activePeers.set(key, peer);
  }
  async detachPeer(handle, reason) {
    const peer = this.#peerByHandle.get(handle);
    if (peer === void 0) {
      return;
    }
    if (peer.phase !== "detached") {
      this.#deactivatePeer(peer, "detached", asFrameworkError(reason));
    }
    this.#peers.delete(peer);
    await peer.transport.close(reason);
  }
  async acceptFrom(handle, value) {
    let peer;
    let decoded;
    try {
      this.#assertCanRoute();
      peer = this.#requireActivePeer(handle);
      this.#assertLocalActive();
      this.#assertPeerCurrentAndReady(peer, true);
      decoded = this.#codec.decode(value);
      assertDataEnvelope(decoded.envelope);
      this.#assertTrustedSource(peer, decoded.envelope);
      this.#assertIncomingTarget(decoded.envelope);
    } catch (error) {
      this.#recordRejection(error);
      throw error;
    }
    this.#receivedMessages += 1;
    if (hasFlag(decoded.envelope.flags, PROCESS_BUS_FLAG_RESPONSE)) {
      await this.#acceptResponse(peer, decoded.envelope);
      return;
    }
    if (this.localIdentity.role === PROCESS_ROLE.MASTER && !this.#isLocalTarget(decoded.envelope) && hasFlag(decoded.envelope.flags, PROCESS_BUS_FLAG_EXPECT_RESPONSE)) {
      await this.#forwardRequest(peer, decoded.envelope);
      return;
    }
    try {
      await this.#routeEnvelope(decoded.envelope, void 0);
    } catch (error) {
      this.#recordRejection(error);
      if (hasFlag(decoded.envelope.flags, PROCESS_BUS_FLAG_EXPECT_RESPONSE)) {
        await this.#sendErrorResponse(peer, decoded.envelope, asFrameworkError(error));
        return;
      }
      throw error;
    }
  }
  send(options) {
    this.#assertCanRoute();
    this.#assertLocalActive();
    const flags = options.flags ?? 0;
    assertUserFlags(flags);
    const envelope = this.#createLocalEnvelope({
      ...options,
      flags,
      correlationId: options.correlationId ?? null
    });
    assertDataEnvelope(envelope);
    return this.#routeAndCount(envelope);
  }
  enqueue(options) {
    let completion;
    try {
      this.#assertCanRoute();
      this.#assertLocalActive();
      const flags = options.flags ?? 0;
      assertUserFlags(flags);
      const envelope = this.#createLocalEnvelope({
        ...options,
        flags,
        correlationId: options.correlationId ?? null
      });
      assertDataEnvelope(envelope);
      completion = this.#admitEnvelope(envelope, void 0);
    } catch (error) {
      this.#recordRejection(error);
      throw error;
    }
    const trackedCompletion = completion.then(
      () => {
        this.#sentMessages += 1;
      },
      (error) => {
        this.#recordRejection(error);
        throw error;
      }
    );
    void trackedCompletion.catch(() => void 0);
    return Object.freeze({ completion: trackedCompletion });
  }
  request(options) {
    this.#assertCanRoute();
    this.#assertLocalActive();
    this.#assertLocalRequestsOpen();
    const userFlags = options.flags ?? 0;
    assertUserFlags(userFlags);
    const timeoutMs = options.timeoutMs ?? this.#requestTimeoutMs;
    assertPositiveTimeout("timeoutMs", timeoutMs);
    const envelope = this.#createLocalEnvelope({
      ...options,
      flags: userFlags | PROCESS_BUS_FLAG_EXPECT_RESPONSE,
      correlationId: null
    });
    assertDataEnvelope(envelope);
    if (this.#pending.has(envelope.messageId)) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `duplicate ProcessBus request messageId ${envelope.messageId}`
      );
    }
    try {
      this.#assertPendingRequestCapacity();
    } catch (error) {
      this.#recordRejection(error);
      throw error;
    }
    const deferred = createDeferred4();
    const pending = {
      kind: "local",
      request: envelope,
      timeoutMs,
      timeout: void 0,
      deferred,
      expectedTarget: Object.freeze({
        targetRole: envelope.targetRole,
        targetWorkerId: envelope.targetWorkerId
      }),
      expectedPeer: void 0,
      expectedGeneration: void 0
    };
    this.#pending.set(envelope.messageId, pending);
    pending.timeout = this.#startPendingTimer(pending);
    void this.#routeAndCount(envelope, pending).catch((error) => {
      if (this.#pending.get(envelope.messageId) !== pending) {
        return;
      }
      this.#deletePending(pending);
      deferred.reject(error);
    });
    return deferred.promise;
  }
  reply(request, options) {
    this.#assertCanRoute();
    this.#assertLocalActive();
    const decoded = this.#codec.decode(request).envelope;
    assertDataEnvelope(decoded);
    if (!hasFlag(decoded.flags, PROCESS_BUS_FLAG_EXPECT_RESPONSE) || hasFlag(decoded.flags, PROCESS_BUS_FLAG_RESPONSE)) {
      throw new TypeError("reply requires an EXPECT_RESPONSE request envelope");
    }
    const userFlags = options.flags ?? 0;
    assertUserFlags(userFlags);
    const flags = userFlags | PROCESS_BUS_FLAG_RESPONSE | (options.error === true ? PROCESS_BUS_FLAG_ERROR_RESPONSE : 0);
    const envelope = this.#createLocalEnvelope({
      messageType: decoded.messageType,
      targetRole: decoded.sourceRole,
      targetWorkerId: decoded.sourceWorkerId,
      payload: options.payload,
      sessionId: options.sessionId === void 0 ? decoded.sessionId : options.sessionId,
      ...options.sequence === void 0 ? {} : { sequence: options.sequence },
      flags,
      correlationId: createCorrelationId(decoded.messageId),
      ...options.messageId === void 0 ? {} : { messageId: options.messageId }
    });
    assertDataEnvelope(envelope);
    return this.#routeAndCount(envelope);
  }
  onMessage(handler) {
    if (this.#state !== "open") {
      return () => {
      };
    }
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
  onPeerUnavailable(handler) {
    if (this.#state !== "open") {
      return () => {
      };
    }
    this.#peerUnavailableHandlers.add(handler);
    return () => {
      this.#peerUnavailableHandlers.delete(handler);
    };
  }
  onPeerCapacityChange(handler) {
    if (this.#state !== "open") {
      return () => {
      };
    }
    this.#peerCapacityHandlers.add(handler);
    for (const peer of this.#peers) {
      if (peer.phase !== "detached") {
        this.#notifyPeerCapacityHandler(handler, peer);
      }
    }
    return () => {
      this.#peerCapacityHandlers.delete(handler);
    };
  }
  setPeerRemotePressure(handle, pressured) {
    this.#assertOpen();
    if (typeof pressured !== "boolean") {
      throw new TypeError("peer remote pressure must be a boolean");
    }
    const peer = this.#requirePeer(handle);
    if (peer.phase === "detached") {
      throw channelClosedError2("ProcessBus peer is detached");
    }
    if (peer.phase === "superseded") {
      throw staleGenerationError(peer.identity, "ProcessBus peer was superseded");
    }
    if (peer.remotePressured === pressured) {
      return;
    }
    const wasPressured = this.#peerIsPressured(peer);
    peer.remotePressured = pressured;
    if (wasPressured !== this.#peerIsPressured(peer)) {
      this.#recordPeerPressureTransition(peer);
      this.#notifyPeerCapacityHandlers(peer);
    }
  }
  sealLocalRequests(reason) {
    if (this.#localRequestsSealed) {
      return;
    }
    this.#localRequestsSealed = true;
    const error = channelClosedError2(
      "ProcessBus no longer accepts local requests",
      reason instanceof Error ? { reason: reason.message } : {}
    );
    this.#cancelLocalPendingRequests(error);
  }
  async drain() {
    await this.#waitForMailboxIdle();
    await Promise.all(
      [...this.#peers].filter((peer) => peer.phase !== "detached").map((peer) => peer.transport.drain())
    );
  }
  close(reason) {
    const invocation = activeMailboxHandler.getStore();
    const calledFromOwnHandler = invocation?.active === true && invocation.bus === this;
    if (this.#closePromise !== void 0) {
      return calledFromOwnHandler ? Promise.resolve() : this.#closePromise;
    }
    this.#state = "closing";
    this.#localActive = false;
    this.#localRequestsSealed = true;
    const error = channelClosedError2(
      "ProcessBus is closed",
      reason instanceof Error ? { reason: reason.message } : {}
    );
    this.#cancelAllPendingRequests(error);
    this.#clearQueuedMailbox();
    for (const peer of this.#peers) {
      this.#disposePeerCapacity(peer);
      if (peer.phase !== "detached") {
        peer.transport.sealData(reason);
      }
    }
    this.#closePromise = this.#waitForMailboxIdle().then(async () => {
      this.#handlers.clear();
      this.#peerUnavailableHandlers.clear();
      this.#peerCapacityHandlers.clear();
      if (this.#ownsTimers) {
        await this.#timers.close(reason);
      }
      this.#state = "closed";
    });
    return calledFromOwnHandler ? Promise.resolve() : this.#closePromise;
  }
  stats() {
    return Object.freeze({
      state: this.#state,
      localActive: this.#localActive,
      attachedPeers: [...this.#peers].filter((peer) => peer.phase !== "detached").length,
      activePeers: this.#activePeers.size,
      pressuredPeers: [...this.#activePeers.values()].filter(
        (peer) => this.#peerIsPressured(peer)
      ).length,
      pendingRequests: this.#pending.size,
      maxPendingRequests: this.#maxPendingRequests,
      pendingRequestRejections: this.#pendingRequestRejections,
      mailboxMessages: this.#mailboxMessages,
      mailboxBytes: this.#mailboxBytes,
      mailboxQueuedMessages: this.#mailbox.length,
      mailboxInFlightMessages: this.#mailboxInFlight === void 0 ? 0 : 1,
      sentMessages: this.#sentMessages,
      receivedMessages: this.#receivedMessages,
      forwardedMessages: this.#forwardedMessages,
      localMessages: this.#localMessages,
      settledResponses: this.#settledResponses,
      errorResponses: this.#errorResponses,
      lateResponses: this.#lateResponses,
      wrongPeerResponses: this.#wrongPeerResponses,
      rejectedMessages: this.#rejectedMessages,
      handlerErrors: this.#handlerErrors,
      requestTimeouts: this.#requestTimeouts,
      staleGenerationRejections: this.#staleGenerationRejections,
      rejectionCounts: Object.freeze(
        Object.fromEntries(this.#rejectionCounts)
      ),
      peers: Object.freeze(
        [...this.#peers].map((peer) => Object.freeze({
          identity: peer.identity,
          phase: peer.phase,
          transport: peer.transport.stats()
        }))
      )
    });
  }
  #assertOpen() {
    if (this.#state !== "open") {
      throw channelClosedError2("ProcessBus is closed");
    }
  }
  #assertCanRoute() {
    this.#assertOpen();
  }
  #assertLocalActive() {
    if (!this.#localActive) {
      throw workerNotReadyError(
        this.localIdentity,
        "local ProcessBus data routing is not active"
      );
    }
  }
  #assertAllowedPeer(identity) {
    if (this.localIdentity.role === PROCESS_ROLE.MASTER) {
      if (identity.role === PROCESS_ROLE.MASTER) {
        throw new TypeError("Master ProcessBus can only attach Worker or Task Worker peers");
      }
      return;
    }
    if (identity.role !== PROCESS_ROLE.MASTER || identity.workerId !== null || identity.generation !== null) {
      throw new TypeError("Worker ProcessBus only accepts the exact MASTER peer");
    }
  }
  #requirePeer(handle) {
    const peer = this.#peerByHandle.get(handle);
    if (peer === void 0) {
      throw channelClosedError2("unknown ProcessBus peer handle");
    }
    return peer;
  }
  #requireActivePeer(handle) {
    const peer = this.#requirePeer(handle);
    if (peer.phase === "attached") {
      throw workerNotReadyError(peer.identity, "ProcessBus peer is not active");
    }
    if (peer.phase === "superseded") {
      throw staleGenerationError(peer.identity, "ProcessBus peer was superseded");
    }
    if (peer.phase === "detached") {
      throw channelClosedError2("ProcessBus peer is detached");
    }
    if (this.#activePeers.get(addressKey(peer.identity)) !== peer) {
      throw staleGenerationError(peer.identity, "ProcessBus peer is no longer current");
    }
    return peer;
  }
  #assertPeerCurrentAndReady(peer, allowDraining = false) {
    if (this.localIdentity.role !== PROCESS_ROLE.MASTER) {
      return;
    }
    const registry = this.#registry;
    const workerId = peer.identity.workerId;
    if (workerId === null) {
      throw new TypeError("Master ProcessBus peer must have a workerId");
    }
    const slot = registry.getSlot(workerId);
    if (slot === void 0 || slot.role !== peer.identity.role) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `ProcessBus peer ${peer.identity.role}:${workerId} does not match a registry slot`
      );
    }
    const record = registry.get(workerId);
    if (record === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `ProcessBus peer ${workerId} has no registry record`
      );
    }
    if (record.generation !== peer.identity.generation) {
      throw staleGenerationError(peer.identity, "ProcessBus peer generation is stale");
    }
    if (!isReadyState(record.state) && !(allowDraining && record.state === WORKER_STATE.DRAINING)) {
      throw workerNotReadyError(peer.identity, `ProcessBus peer is ${record.state}`);
    }
  }
  #assertTrustedSource(peer, envelope) {
    if (this.localIdentity.role !== PROCESS_ROLE.MASTER) {
      return;
    }
    if (envelope.sourceRole !== peer.identity.role || envelope.sourceWorkerId !== peer.identity.workerId || envelope.sourceGeneration !== peer.identity.generation) {
      throw staleGenerationError(peer.identity, "IPC envelope source does not match its peer handle");
    }
  }
  #assertIncomingTarget(envelope) {
    if (this.localIdentity.role !== PROCESS_ROLE.MASTER && !this.#isLocalTarget(envelope)) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        "Master peer delivered an IPC envelope for a different local worker",
        {
          targetRole: envelope.targetRole,
          targetWorkerId: envelope.targetWorkerId
        }
      );
    }
  }
  #isLocalTarget(target) {
    return target.targetRole === this.localIdentity.role && target.targetWorkerId === this.localIdentity.workerId;
  }
  #nextMessageId() {
    this.#messageCounter += 1;
    const prefix = this.#messageIdPrefix ?? this.#messageIdFactory();
    return createMessageId(
      `${prefix}.${this.#messageCounter.toString(36)}`
    );
  }
  #nextSequence(target) {
    const key = addressKey(target);
    const sequence = this.#sequenceByTarget.get(key) ?? 0;
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`ProcessBus sequence exhausted for ${key}`);
    }
    this.#sequenceByTarget.set(key, sequence + 1);
    return createIpcSequence(sequence);
  }
  #createLocalEnvelope(options) {
    const target = {
      targetRole: options.targetRole,
      targetWorkerId: options.targetWorkerId
    };
    const envelope = {
      protocolVersion: IPC_PROTOCOL_VERSION,
      messageId: options.messageId ?? this.#nextMessageId(),
      messageType: options.messageType,
      sourceRole: this.localIdentity.role,
      sourceWorkerId: this.localIdentity.workerId,
      sourceGeneration: this.localIdentity.generation,
      targetRole: options.targetRole,
      targetWorkerId: options.targetWorkerId,
      correlationId: options.correlationId,
      sessionId: options.sessionId ?? null,
      sequence: options.sequence ?? this.#nextSequence(target),
      flags: options.flags ?? 0,
      payload: options.payload
    };
    return options.ownsPayload ? this.#codec.encodeOwned(envelope).envelope : this.#codec.encodeLocal(envelope).envelope;
  }
  async #routeAndCount(envelope, pending) {
    try {
      await this.#routeEnvelope(envelope, pending);
      this.#sentMessages += 1;
    } catch (error) {
      this.#recordRejection(error);
      throw error;
    }
  }
  async #routeEnvelope(envelope, pending) {
    await this.#admitEnvelope(envelope, pending);
  }
  #admitEnvelope(envelope, pending) {
    this.#assertCanRoute();
    if (this.#isLocalTarget(envelope)) {
      if (pending !== void 0) {
        pending.expectedPeer = null;
        pending.expectedGeneration = this.localIdentity.generation;
      }
      if (hasFlag(envelope.flags, PROCESS_BUS_FLAG_RESPONSE)) {
        return this.#acceptResponse(null, envelope);
      }
      this.#enqueueMailbox(this.#codec.encode(envelope));
      return Promise.resolve();
    }
    const peer = this.#resolveTargetPeer(envelope);
    if (pending !== void 0) {
      pending.expectedPeer = peer;
      pending.expectedGeneration = this.localIdentity.role === PROCESS_ROLE.MASTER ? peer.identity.generation : void 0;
    }
    return peer.transport.send(envelope, PROCESS_TRANSPORT_LANE.DATA);
  }
  #resolveTargetPeer(target) {
    if (this.localIdentity.role !== PROCESS_ROLE.MASTER) {
      const master = this.#activePeers.get(addressKey({
        targetRole: PROCESS_ROLE.MASTER,
        targetWorkerId: null
      }));
      if (master === void 0 || master.phase !== "active") {
        throw channelClosedError2("Worker ProcessBus has no active MASTER peer");
      }
      return master;
    }
    if (target.targetRole === PROCESS_ROLE.MASTER) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        "MASTER target must be routed to the local mailbox"
      );
    }
    const workerId = target.targetWorkerId;
    if (workerId === null) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `${target.targetRole} target requires workerId`
      );
    }
    const registry = this.#registry;
    const slot = registry.getSlot(workerId);
    if (slot === void 0 || slot.role !== target.targetRole) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `unknown ProcessBus target ${target.targetRole}:${workerId}`,
        { targetRole: target.targetRole, targetWorkerId: workerId }
      );
    }
    const record = registry.get(workerId);
    const allowsDrainingTarget = record?.state === WORKER_STATE.DRAINING && target.targetRole === PROCESS_ROLE.WORKER && target.sourceRole === PROCESS_ROLE.MASTER && DRAINING_TARGET_MESSAGE_TYPES.has(target.messageType);
    if (record === void 0 || !isReadyState(record.state) && !allowsDrainingTarget) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        `ProcessBus target ${target.targetRole}:${workerId} cannot receive ${target.messageType} while ${record?.state ?? "missing"}`,
        {
          targetRole: target.targetRole,
          targetWorkerId: workerId,
          messageType: target.messageType,
          state: record?.state ?? null
        }
      );
    }
    const peer = this.#activePeers.get(addressKey(target));
    if (peer === void 0 || peer.phase !== "active") {
      throw channelClosedError2(
        `ProcessBus target ${target.targetRole}:${workerId} has no active transport`,
        { targetRole: target.targetRole, targetWorkerId: workerId }
      );
    }
    if (peer.identity.generation !== record.generation) {
      throw staleGenerationError(peer.identity, "ProcessBus target peer generation is stale");
    }
    return peer;
  }
  #enqueueMailbox(encoded) {
    if (encoded.byteLength > this.#mailboxMaxBytes) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
        `ProcessBus local mailbox message size ${encoded.byteLength} can never fit in the mailbox (${this.#mailboxMaxBytes} bytes) (messageType=${String(encoded.envelope.messageType)} sessionId=${String(encoded.envelope.sessionId)} correlationId=${String(encoded.envelope.correlationId)})`,
        {
          byteLength: encoded.byteLength,
          mailboxMaxBytes: this.#mailboxMaxBytes,
          maxMessageBytes: this.#codec.maxMessageBytes,
          messageType: encoded.envelope.messageType,
          sessionId: encoded.envelope.sessionId,
          correlationId: encoded.envelope.correlationId
        }
      );
    }
    if (this.#mailboxMessages >= this.#mailboxMaxMessages || encoded.byteLength > this.#mailboxMaxBytes - this.#mailboxBytes) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
        "ProcessBus local mailbox is full",
        {
          maxMessages: this.#mailboxMaxMessages,
          maxBytes: this.#mailboxMaxBytes,
          pendingMessages: this.#mailboxMessages,
          pendingBytes: this.#mailboxBytes,
          messageBytes: encoded.byteLength
        }
      );
    }
    this.#mailbox.push(encoded);
    this.#mailboxMessages += 1;
    this.#mailboxBytes += encoded.byteLength;
    this.#localMessages += 1;
    this.#scheduleMailbox();
  }
  #scheduleMailbox() {
    if (this.#mailboxScheduled || this.#mailboxInFlight !== void 0 || this.#mailbox.length === 0 || this.#state !== "open") {
      return;
    }
    this.#mailboxScheduled = true;
    queueMicrotask(() => {
      this.#mailboxScheduled = false;
      void this.#pumpMailbox().catch(() => {
      });
    });
  }
  async #pumpMailbox() {
    if (this.#mailboxInFlight !== void 0 || this.#state !== "open") {
      return;
    }
    const item = this.#mailbox.shift();
    if (item === void 0) {
      this.#settleMailboxDrainWaiters();
      return;
    }
    this.#mailboxInFlight = item;
    for (const handler of [...this.#handlers]) {
      const invocation = { active: true, bus: this };
      try {
        await activeMailboxHandler.run(invocation, () => handler(item.envelope));
      } catch {
        this.#handlerErrors += 1;
      } finally {
        invocation.active = false;
      }
    }
    if (this.#mailboxInFlight === item) {
      this.#mailboxInFlight = void 0;
      this.#mailboxMessages -= 1;
      this.#mailboxBytes -= item.byteLength;
    }
    this.#settleMailboxDrainWaiters();
    this.#scheduleMailbox();
  }
  #clearQueuedMailbox() {
    for (const item of this.#mailbox.splice(0)) {
      this.#mailboxMessages -= 1;
      this.#mailboxBytes -= item.byteLength;
    }
    this.#settleMailboxDrainWaiters();
  }
  #waitForMailboxIdle() {
    if (this.#mailboxMessages === 0) {
      return Promise.resolve();
    }
    const deferred = createDeferred4();
    this.#mailboxDrainWaiters.add(deferred);
    return deferred.promise;
  }
  #settleMailboxDrainWaiters() {
    if (this.#mailboxMessages !== 0) {
      return;
    }
    for (const waiter of this.#mailboxDrainWaiters) {
      waiter.resolve();
    }
    this.#mailboxDrainWaiters.clear();
  }
  async #forwardRequest(sourcePeer, request) {
    if (this.#pending.has(request.messageId)) {
      await this.#sendErrorResponse(
        sourcePeer,
        request,
        new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          `duplicate forwarded request messageId ${request.messageId}`
        )
      );
      return;
    }
    try {
      this.#assertPendingRequestCapacity();
    } catch (error) {
      this.#recordRejection(error);
      await this.#sendErrorResponse(sourcePeer, request, asFrameworkError(error));
      return;
    }
    let targetPeer;
    try {
      targetPeer = this.#resolveTargetPeer(request);
    } catch (error) {
      this.#recordRejection(error);
      await this.#sendErrorResponse(sourcePeer, request, asFrameworkError(error));
      return;
    }
    const pending = {
      kind: "forwarded",
      request,
      sourcePeer,
      targetPeer,
      timeoutMs: this.#requestTimeoutMs,
      timeout: void 0
    };
    this.#pending.set(request.messageId, pending);
    pending.timeout = this.#startPendingTimer(pending);
    try {
      await targetPeer.transport.send(request, PROCESS_TRANSPORT_LANE.DATA);
      this.#forwardedMessages += 1;
    } catch (error) {
      this.#recordRejection(error);
      if (this.#pending.get(request.messageId) === pending) {
        this.#deletePending(pending);
        await this.#sendErrorResponse(sourcePeer, request, asFrameworkError(error));
      }
    }
  }
  async #acceptResponse(incomingPeer, response) {
    const correlationId = response.correlationId;
    if (correlationId === null) {
      this.#rejectedMessages += 1;
      throw new TypeError("response correlationId cannot be null");
    }
    const pending = this.#pending.get(correlationId);
    if (pending === void 0) {
      this.#lateResponses += 1;
      return;
    }
    if (pending.kind === "local") {
      if (!this.#matchesLocalPending(pending, incomingPeer, response)) {
        this.#wrongPeerResponses += 1;
        return;
      }
      this.#deletePending(pending);
      this.#settledResponses += 1;
      if (hasFlag(response.flags, PROCESS_BUS_FLAG_ERROR_RESPONSE)) {
        this.#errorResponses += 1;
        pending.deferred.reject(remoteFrameworkError(response));
      } else {
        pending.deferred.resolve(response);
      }
      return;
    }
    if (!this.#matchesForwardedPending(pending, incomingPeer, response)) {
      this.#wrongPeerResponses += 1;
      return;
    }
    this.#deletePending(pending);
    this.#settledResponses += 1;
    if (hasFlag(response.flags, PROCESS_BUS_FLAG_ERROR_RESPONSE)) {
      this.#errorResponses += 1;
    }
    if (!this.#isPeerUsable(pending.sourcePeer)) {
      return;
    }
    try {
      await pending.sourcePeer.transport.send(response, PROCESS_TRANSPORT_LANE.DATA);
      this.#forwardedMessages += 1;
    } catch {
      this.#rejectedMessages += 1;
    }
  }
  #matchesLocalPending(pending, incomingPeer, response) {
    if (pending.expectedPeer === void 0 || pending.expectedPeer !== incomingPeer) {
      return false;
    }
    if (!this.#isLocalTarget(response)) {
      return false;
    }
    if (hasFlag(response.flags, PROCESS_BUS_FLAG_ERROR_RESPONSE) && response.sourceRole === PROCESS_ROLE.MASTER && response.sourceWorkerId === null && response.sourceGeneration === null) {
      return incomingPeer === null ? pending.expectedTarget.targetRole === PROCESS_ROLE.MASTER : incomingPeer.identity.role === PROCESS_ROLE.MASTER;
    }
    return response.sourceRole === pending.expectedTarget.targetRole && response.sourceWorkerId === pending.expectedTarget.targetWorkerId && (pending.expectedGeneration === void 0 || response.sourceGeneration === pending.expectedGeneration);
  }
  #matchesForwardedPending(pending, incomingPeer, response) {
    return incomingPeer === pending.targetPeer && this.#isPeerUsable(pending.targetPeer) && response.sourceRole === pending.targetPeer.identity.role && response.sourceWorkerId === pending.targetPeer.identity.workerId && response.sourceGeneration === pending.targetPeer.identity.generation && response.targetRole === pending.sourcePeer.identity.role && response.targetWorkerId === pending.sourcePeer.identity.workerId;
  }
  async #sendErrorResponse(sourcePeer, request, error) {
    if (!this.#isPeerUsable(sourcePeer)) {
      return;
    }
    const response = this.#createLocalEnvelope({
      messageType: request.messageType,
      targetRole: request.sourceRole,
      targetWorkerId: request.sourceWorkerId,
      payload: frameworkErrorPayload(error),
      sessionId: request.sessionId,
      flags: PROCESS_BUS_FLAG_RESPONSE | PROCESS_BUS_FLAG_ERROR_RESPONSE,
      correlationId: createCorrelationId(request.messageId)
    });
    try {
      await sourcePeer.transport.send(response, PROCESS_TRANSPORT_LANE.DATA);
      this.#sentMessages += 1;
      this.#errorResponses += 1;
    } catch (sendError) {
      this.#recordRejection(sendError);
    }
  }
  #startPendingTimer(pending) {
    return this.#timers.setTimeout(pending.timeoutMs, () => {
      if (this.#pending.get(pending.request.messageId) !== pending) {
        return;
      }
      this.#deletePending(pending);
      this.#requestTimeouts += 1;
      if (pending.kind === "local") {
        pending.deferred.reject(
          new ProcessBusRequestTimeoutError(pending.request.messageId, pending.timeoutMs)
        );
        return;
      }
      void this.#sendErrorResponse(
        pending.sourcePeer,
        pending.request,
        channelClosedError2("forwarded ProcessBus request timed out", {
          timeoutMs: pending.timeoutMs
        })
      ).catch(() => void 0);
    });
  }
  #cancelLocalPendingRequests(error) {
    for (const pending of [...this.#pending.values()]) {
      if (pending.kind !== "local") {
        continue;
      }
      this.#deletePending(pending);
      pending.deferred.reject(error);
    }
  }
  #cancelAllPendingRequests(error) {
    for (const pending of [...this.#pending.values()]) {
      this.#deletePending(pending);
      if (pending.kind === "local") {
        pending.deferred.reject(error);
      }
    }
  }
  #deletePending(pending) {
    if (this.#pending.get(pending.request.messageId) !== pending) {
      return;
    }
    this.#pending.delete(pending.request.messageId);
    pending.timeout?.cancel();
    pending.timeout = void 0;
  }
  #assertPendingRequestCapacity() {
    if (this.#pending.size < this.#maxPendingRequests) {
      return;
    }
    this.#pendingRequestRejections += 1;
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
      "ProcessBus pending request capacity is full",
      {
        maxPendingRequests: this.#maxPendingRequests,
        pendingRequests: this.#pending.size
      }
    );
  }
  #peerIsPressured(peer) {
    return peer.localCapacity.pressured || peer.remotePressured;
  }
  #notifyPeerCapacityHandlers(peer) {
    for (const handler of [...this.#peerCapacityHandlers]) {
      this.#notifyPeerCapacityHandler(handler, peer);
    }
  }
  #recordPeerPressureTransition(peer) {
    try {
      this.#metrics?.recordIpcPressureTransition(this.#peerIsPressured(peer));
    } catch {
    }
  }
  #notifyPeerCapacityHandler(handler, peer) {
    try {
      handler(Object.freeze({
        identity: peer.identity,
        localCapacity: peer.localCapacity,
        remotePressured: peer.remotePressured,
        pressured: this.#peerIsPressured(peer)
      }));
    } catch {
      this.#handlerErrors += 1;
    }
  }
  #disposePeerCapacity(peer) {
    peer.disposeCapacity();
    peer.disposeCapacity = () => {
    };
  }
  #recordRejection(error) {
    this.#rejectedMessages += 1;
    if (!(error instanceof FrameworkError)) {
      return;
    }
    this.#rejectionCounts.set(
      error.code,
      (this.#rejectionCounts.get(error.code) ?? 0) + 1
    );
    if (error.code === FRAMEWORK_ERROR_CODE.STALE_GENERATION) {
      this.#staleGenerationRejections += 1;
    }
  }
  #targetFailure(peer, error) {
    return new FrameworkError(
      error.code,
      error.message,
      {
        ...error.details,
        targetRole: peer.identity.role,
        targetWorkerId: peer.identity.workerId,
        targetGeneration: peer.identity.generation
      }
    );
  }
  #isPeerUsable(peer) {
    if (peer.phase !== "active" || this.#activePeers.get(addressKey(peer.identity)) !== peer) {
      return false;
    }
    try {
      this.#assertPeerCurrentAndReady(peer);
      return true;
    } catch {
      return false;
    }
  }
  #onPeerTransportClosed(peer) {
    if (peer.phase !== "detached") {
      this.#deactivatePeer(
        peer,
        "detached",
        channelClosedError2("ProcessBus peer transport closed")
      );
    }
    this.#peers.delete(peer);
  }
  #deactivatePeer(peer, phase, error) {
    const wasActive = peer.phase === "active";
    if (peer.phase === "detached") {
      return;
    }
    this.#disposePeerCapacity(peer);
    const targetError = this.#targetFailure(peer, error);
    peer.phase = phase;
    if (this.#activePeers.get(addressKey(peer.identity)) === peer) {
      this.#activePeers.delete(addressKey(peer.identity));
    }
    if (wasActive) {
      for (const handler of [...this.#peerUnavailableHandlers]) {
        try {
          handler(peer.identity, targetError);
        } catch {
          this.#handlerErrors += 1;
        }
      }
    }
    for (const pending of [...this.#pending.values()]) {
      if (pending.kind === "local" && pending.expectedPeer === peer) {
        this.#deletePending(pending);
        this.#recordRejection(targetError);
        pending.deferred.reject(targetError);
        continue;
      }
      if (pending.kind !== "forwarded") {
        continue;
      }
      if (pending.sourcePeer === peer) {
        this.#deletePending(pending);
        continue;
      }
      if (pending.targetPeer === peer) {
        this.#deletePending(pending);
        this.#recordRejection(targetError);
        void this.#sendErrorResponse(
          pending.sourcePeer,
          pending.request,
          targetError
        ).catch(() => void 0);
      }
    }
  }
  #assertLocalRequestsOpen() {
    if (this.#localRequestsSealed) {
      throw channelClosedError2(
        "ProcessBus no longer accepts local requests"
      );
    }
  }
};

// src/process/process-supervisor.ts
var DEFAULT_READY_TIMEOUT_MS = 5e3;
var DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 1e3;
var DEFAULT_TERMINATE_TIMEOUT_MS = 1e3;
var DEFAULT_RESTART_BACKOFF_BASE_MS = 50;
var DEFAULT_RESTART_BACKOFF_MAX_MS = 1e3;
var DEFAULT_RESTART_WINDOW_MS = 1e4;
var DEFAULT_MAX_RESTARTS_PER_WINDOW = 5;
var DEFAULT_RESTART_STABLE_MS = 3e4;
var activeProcessSupervisorLifecycle = new AsyncLocalStorage4();
function createDeferred5() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function assertNonNegativeSafeInteger8(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function errorString(error) {
  try {
    return String(error);
  } catch {
    return "<unprintable error>";
  }
}
function stoppingError() {
  return new FrameworkError(
    FRAMEWORK_ERROR_CODE.INVALID_STATE,
    "ProcessSupervisor is stopping"
  );
}
function posixSignalNumber(signal) {
  return signal === null ? 0 : OS_CONSTANTS.signals[signal] ?? 0;
}
var ProcessSupervisor = class {
  registry;
  bus;
  taskScheduler;
  taskRouter;
  #context;
  #spawner;
  #entrypoint;
  #timers;
  #readyTimeoutMs;
  #gracefulShutdownTimeoutMs;
  #terminateTimeoutMs;
  #restartBackoffBaseMs;
  #restartBackoffMaxMs;
  #restartWindowMs;
  #maxRestartsPerWindow;
  #restartStableMs;
  #configVersion;
  #masterGeneration;
  #sharedRuntime;
  #childEnvironment;
  #compactIpcEnvelopes;
  #onWorkerError;
  #onBeforeReload;
  #attempts = /* @__PURE__ */ new Map();
  #restartStates = /* @__PURE__ */ new Map();
  #restartTimers = /* @__PURE__ */ new Set();
  #workerLifecycleCoordinator;
  #lifecycleOperation;
  #lifecycleOperationName;
  #spawnAllPromise;
  #readyPromise;
  #startPromise;
  #stopPromise;
  #poolReady = false;
  #stopping = false;
  #stopped = false;
  constructor(options) {
    const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    const gracefulShutdownTimeoutMs = options.gracefulShutdownTimeoutMs ?? DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS;
    const terminateTimeoutMs = options.terminateTimeoutMs ?? DEFAULT_TERMINATE_TIMEOUT_MS;
    const restartBackoffBaseMs = options.restartBackoffBaseMs ?? DEFAULT_RESTART_BACKOFF_BASE_MS;
    const restartBackoffMaxMs = options.restartBackoffMaxMs ?? DEFAULT_RESTART_BACKOFF_MAX_MS;
    const restartWindowMs = options.restartWindowMs ?? DEFAULT_RESTART_WINDOW_MS;
    const maxRestartsPerWindow = options.maxRestartsPerWindow ?? DEFAULT_MAX_RESTARTS_PER_WINDOW;
    const restartStableMs = options.restartStableMs ?? DEFAULT_RESTART_STABLE_MS;
    const configVersion = options.configVersion ?? 1;
    const masterGeneration = options.context.masterGeneration;
    assertTimerDelay(readyTimeoutMs, "readyTimeoutMs");
    assertTimerDelay(gracefulShutdownTimeoutMs, "gracefulShutdownTimeoutMs");
    assertTimerDelay(terminateTimeoutMs, "terminateTimeoutMs");
    assertTimerDelay(restartBackoffBaseMs, "restartBackoffBaseMs");
    assertTimerDelay(restartBackoffMaxMs, "restartBackoffMaxMs");
    assertTimerDelay(restartWindowMs, "restartWindowMs");
    assertTimerDelay(restartStableMs, "restartStableMs");
    if (restartBackoffBaseMs > restartBackoffMaxMs) {
      throw new RangeError(
        "restartBackoffBaseMs must not exceed restartBackoffMaxMs"
      );
    }
    if (!Number.isSafeInteger(maxRestartsPerWindow) || maxRestartsPerWindow < 1) {
      throw new RangeError(
        `maxRestartsPerWindow must be a positive safe integer, got ${maxRestartsPerWindow}`
      );
    }
    assertNonNegativeSafeInteger8("configVersion", configVersion);
    const registry = options.registry ?? new WorkerRegistry({
      workerNum: options.context.settings.worker_num,
      taskWorkerNum: options.context.settings.task_worker_num,
      userTaskWorkerNum: options.context.settings.user_task_worker_num ?? 0,
      clock: options.context.clock,
      ...options.sharedWorkers === void 0 ? {} : {
        onRecordChanged: (record) => {
          try {
            options.sharedWorkers?.publishWorker(record);
          } catch (error) {
            options.context.metrics.recordError();
            options.context.log("error", "runtime.shared.worker_publish_failed", {
              workerId: record.workerId,
              generation: record.generation,
              state: record.state,
              error: errorString(error)
            });
            options.context.requestStop(error);
            throw error;
          }
        }
      }
    });
    if (registry.workerNum !== options.context.settings.worker_num || registry.taskWorkerNum !== options.context.settings.task_worker_num || registry.userTaskWorkerNum !== (options.context.settings.user_task_worker_num ?? 0)) {
      throw new TypeError("WorkerRegistry pool sizes must match RuntimeContext settings");
    }
    this.#context = options.context;
    this.registry = registry;
    this.#spawner = options.spawner ?? new NodeChildProcessSpawner();
    this.#entrypoint = options.entrypoint ?? new URL(
      import.meta.url.endsWith(".js") ? "./worker-entry-main.js" : "./worker-entry-main.ts",
      import.meta.url
    );
    this.#timers = options.timers ?? options.context.timers;
    this.#readyTimeoutMs = readyTimeoutMs;
    this.#gracefulShutdownTimeoutMs = gracefulShutdownTimeoutMs;
    this.#terminateTimeoutMs = terminateTimeoutMs;
    this.#restartBackoffBaseMs = restartBackoffBaseMs;
    this.#restartBackoffMaxMs = restartBackoffMaxMs;
    this.#restartWindowMs = restartWindowMs;
    this.#maxRestartsPerWindow = maxRestartsPerWindow;
    this.#restartStableMs = restartStableMs;
    this.#configVersion = configVersion;
    this.#masterGeneration = masterGeneration;
    this.#sharedRuntime = options.sharedRuntime ?? createDetachedSharedRuntimeDescriptor({
      masterPid: options.context.masterPid,
      masterGeneration,
      connectionCapacity: Math.min(
        options.context.settings.max_conn ?? 1048576,
        1048576
      ),
      workerCapacity: options.context.settings.worker_num + options.context.settings.task_worker_num + (options.context.settings.user_task_worker_num ?? 0)
    });
    this.#childEnvironment = options.childEnvironment === void 0 ? void 0 : Object.freeze({ ...options.childEnvironment });
    this.#compactIpcEnvelopes = options.compactIpcEnvelopes ?? false;
    this.#onWorkerError = options.onWorkerError;
    this.#onBeforeReload = options.onBeforeReload;
    this.bus = new ProcessBus({
      localIdentity: {
        role: PROCESS_ROLE.MASTER,
        workerId: null,
        generation: null
      },
      registry,
      timers: this.#timers,
      metrics: this.#context.metrics
    });
    this.taskScheduler = new TaskScheduler({
      registry,
      ...options.reservedTaskWorkerIds === void 0 ? {} : { reservedTaskWorkerIds: options.reservedTaskWorkerIds }
    });
    this.taskRouter = new MasterTaskRouter({
      bus: this.bus,
      registry,
      scheduler: this.taskScheduler,
      onDeliveryError: (error) => {
        this.#context.metrics.recordError();
        this.#context.log("error", "runtime.task.delivery_failed", {
          error: errorString(error)
        });
      }
    });
  }
  spawnAll() {
    if (this.#stopping) {
      return Promise.reject(stoppingError());
    }
    if (this.#spawnAllPromise !== void 0) {
      return this.#spawnAllPromise;
    }
    this.#spawnAllPromise = (async () => {
      try {
        const slots = [...this.registry.slots()].sort((left, right) => {
          const leftPriority = left.role === PROCESS_ROLE.WORKER ? 1 : 0;
          const rightPriority = right.role === PROCESS_ROLE.WORKER ? 1 : 0;
          return leftPriority - rightPriority || left.workerId - right.workerId;
        });
        await Promise.all(slots.map((slot) => this.#spawnSlot(slot)));
      } catch (error) {
        await this.stop(error);
        throw error;
      }
    })();
    return this.#spawnAllPromise;
  }
  waitUntilReady() {
    if (this.#stopping) {
      return Promise.reject(stoppingError());
    }
    if (this.#readyPromise !== void 0) {
      return this.#readyPromise;
    }
    this.#readyPromise = (async () => {
      try {
        await this.spawnAll();
        const attempts = [...this.#attempts.values()];
        await Promise.all(attempts.map((attempt) => attempt.ready.promise));
        if (this.#stopping) {
          throw stoppingError();
        }
        this.#poolReady = true;
      } catch (error) {
        await this.stop(error);
        throw error;
      }
    })();
    return this.#readyPromise;
  }
  start() {
    if (this.#stopping) {
      return Promise.reject(stoppingError());
    }
    this.#startPromise ??= this.waitUntilReady();
    return this.#startPromise;
  }
  setWorkerLifecycleCoordinator(coordinator) {
    if (this.#workerLifecycleCoordinator !== void 0 && this.#workerLifecycleCoordinator !== coordinator) {
      throw new Error("ProcessSupervisor already has a Worker lifecycle coordinator");
    }
    this.#workerLifecycleCoordinator = coordinator;
  }
  getWorkerGeneration(workerId) {
    return this.registry.get(workerId)?.generation ?? null;
  }
  requestWorkerRestart(workerId, reason = "RuntimeServer.stop") {
    const slot = this.registry.getSlot(workerId);
    if (slot === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `Worker ${workerId} is outside the configured process pool`,
        { workerId }
      );
    }
    const record = this.registry.get(workerId);
    if (record === void 0 || record.state !== WORKER_STATE.READY && record.state !== WORKER_STATE.RUNNING) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        `Worker ${workerId} is not ready for restart`,
        { workerId, state: record?.state ?? null }
      );
    }
    return this.#startLifecycleOperation(
      `restart:${workerId}`,
      () => this.#performPlannedRestart(slot, reason)
    );
  }
  requestReload(onlyTaskWorkers = false, reason = "RuntimeServer.reload") {
    return this.#startLifecycleOperation(
      onlyTaskWorkers ? "reload:task-workers" : "reload:all-workers",
      async () => {
        await this.#onBeforeReload?.();
        const slots = [...this.registry.slots()].filter((slot) => !onlyTaskWorkers || slot.role !== PROCESS_ROLE.WORKER).sort((left, right) => {
          const leftPriority = left.role === PROCESS_ROLE.WORKER ? 0 : 1;
          const rightPriority = right.role === PROCESS_ROLE.WORKER ? 0 : 1;
          return leftPriority - rightPriority || left.workerId - right.workerId;
        });
        for (const slot of slots) {
          if (this.#stopping) {
            throw stoppingError();
          }
          await this.#performPlannedRestart(slot, reason);
        }
      }
    );
  }
  stop(reason, hooks = {}) {
    if (this.#stopPromise !== void 0) {
      return this.#stopPromise;
    }
    this.#stopping = true;
    for (const timer of [...this.#restartTimers]) {
      timer.cancel(reason);
    }
    this.#stopPromise = this.#performStop(reason, hooks);
    return this.#stopPromise;
  }
  close(reason) {
    return this.stop(reason);
  }
  async #spawnSlot(slot, lifecycleManaged = false) {
    const instance = this.registry.beginSpawn(slot.workerId);
    let child;
    try {
      child = this.#spawner.spawn({
        entrypoint: this.#entrypoint,
        compactIpcEnvelopes: this.#compactIpcEnvelopes,
        ...this.#childEnvironment === void 0 ? {} : { env: this.#childEnvironment }
      });
    } catch (error) {
      this.registry.markFailed(instance);
      throw error;
    }
    if (this.#stopping) {
      this.registry.markFailed(instance);
      try {
        child.kill("SIGKILL");
      } catch {
      }
      await child.closed;
      throw stoppingError();
    }
    let transport;
    let peerHandle;
    try {
      transport = new BoundedProcessTransport(child);
      peerHandle = this.bus.attachPeer({
        role: instance.role,
        workerId: instance.workerId,
        generation: instance.generation,
        transport
      });
    } catch (error) {
      this.registry.markFailed(instance);
      await transport?.close(error);
      try {
        child.kill("SIGKILL");
      } catch {
      }
      await child.closed;
      throw error;
    }
    if (transport === void 0 || peerHandle === void 0) {
      throw new Error("ProcessSupervisor failed to assemble a worker attempt");
    }
    const ready = createDeferred5();
    void ready.promise.catch(() => void 0);
    const attempt = {
      instance,
      child,
      transport,
      peerHandle,
      ready,
      disposers: [],
      bootstrap: void 0,
      pid: void 0,
      readyTimer: void 0,
      failureTimer: void 0,
      readyAtMonotonicMs: void 0,
      terminationSignal: void 0,
      readySettled: false,
      readyPromiseSettled: false,
      readyCompleting: false,
      disconnected: false,
      closedHandled: false,
      plannedExit: false,
      shutdownRequested: false,
      lifecycleManaged,
      drainRequest: void 0,
      peerDetached: createDeferred5()
    };
    void attempt.peerDetached.promise.catch(() => void 0);
    this.#attempts.set(instance.workerId, attempt);
    attempt.disposers.push(
      transport.onMessage((envelope) => {
        this.#handleMessage(attempt, envelope);
      }),
      transport.onProtocolError((error, rawMessage) => {
        this.#handleProtocolError(attempt, error, rawMessage);
      }),
      child.onDisconnect(() => this.#handleDisconnect(attempt))
    );
    void child.closed.then((result) => this.#handleClosed(attempt, result)).catch((error) => this.#reportCloseObserverFailure(attempt, error));
    try {
      const pid = await child.spawned;
      attempt.pid = pid;
      if (this.#stopping || this.#attempts.get(instance.workerId) !== attempt) {
        throw stoppingError();
      }
      const booting = this.registry.attachProcess(instance, pid);
      if (booting === void 0) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.STALE_GENERATION,
          `Worker ${instance.workerId} spawn belongs to a stale generation`,
          { workerId: instance.workerId, generation: instance.generation }
        );
      }
      const nonce = this.#context.idGenerator.next();
      const bootstrapEnvelope = createBootstrapControlEnvelope({
        messageId: `bootstrap-${nonce}`,
        bootstrapToken: randomUUID3(),
        role: instance.role,
        workerId: instance.workerId,
        taskWorkerId: instance.taskWorkerId,
        workerGeneration: instance.generation,
        settings: this.#context.settings,
        configVersion: this.#configVersion,
        masterPid: this.#context.masterPid,
        masterGeneration: this.#masterGeneration,
        sharedRuntime: this.#sharedRuntime
      });
      attempt.bootstrap = parseBootstrapControlEnvelope(bootstrapEnvelope);
      attempt.readyTimer = this.#timers.setTimeout(this.#readyTimeoutMs, () => {
        this.#handleReadyTimeout(attempt);
      });
      await transport.send(
        bootstrapEnvelope,
        PROCESS_TRANSPORT_LANE.CONTROL
      );
      if (this.#stopping) {
        throw stoppingError();
      }
      return attempt;
    } catch (error) {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
      throw error;
    }
  }
  #handleMessage(attempt, message) {
    if (this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance) || attempt.bootstrap === void 0 || attempt.pid === void 0) {
      return;
    }
    if (attempt.readySettled) {
      if (message.messageType === IPC_MESSAGE_TYPE.CONTROL_DRAIN) {
        try {
          this.#handleLifecycleControl(
            attempt,
            parseLifecycleControlEnvelope(message, attempt.bootstrap)
          );
        } catch (error) {
          this.#reportRejectedIpcMessage(attempt, error);
        }
        return;
      }
      if (message.messageType === IPC_MESSAGE_TYPE.CONTROL_CAPACITY) {
        try {
          const capacity = parseCapacityControlEnvelope(message, attempt.bootstrap);
          this.bus.setPeerRemotePressure(attempt.peerHandle, capacity.pressured);
        } catch (error) {
          this.#reportRejectedIpcMessage(attempt, error);
        }
        return;
      }
      void this.bus.acceptFrom(attempt.peerHandle, message).catch((error) => {
        this.#reportRejectedIpcMessage(attempt, error);
      });
      return;
    }
    if (this.#stopping) {
      return;
    }
    try {
      parseReadyControlEnvelope(message, attempt.bootstrap, attempt.pid);
    } catch (error) {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
      return;
    }
    let ready;
    try {
      ready = this.registry.markReady(attempt.instance);
    } catch (error) {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
      return;
    }
    if (ready === void 0) {
      return;
    }
    try {
      this.bus.activatePeer(attempt.peerHandle);
    } catch (error) {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
      return;
    }
    attempt.readySettled = true;
    attempt.readyCompleting = true;
    void this.#completeReady(attempt).catch((error) => {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
    });
  }
  async #completeReady(attempt) {
    if (this.#stopping || this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      throw stoppingError();
    }
    if (attempt.instance.role === PROCESS_ROLE.TASK_WORKER) {
      this.taskScheduler.resume(attempt.instance.workerId);
    } else if (attempt.instance.role === PROCESS_ROLE.WORKER) {
      await this.#workerLifecycleCoordinator?.restoreWorker(
        attempt.instance.workerId
      );
    }
    attempt.readyAtMonotonicMs = this.#context.clock.monotonicTimeMs();
    attempt.readyCompleting = false;
    attempt.readyPromiseSettled = true;
    attempt.readyTimer?.cancel();
    attempt.lifecycleManaged = false;
    attempt.ready.resolve();
  }
  #handleLifecycleControl(attempt, control) {
    switch (control.action) {
      case LIFECYCLE_CONTROL_ACTION.DRAINED: {
        const pending = attempt.drainRequest;
        if (pending === void 0 || pending.requestId !== control.requestId) {
          throw new TypeError(
            `Worker ${attempt.instance.workerId} returned an unknown drain request ${control.requestId}`
          );
        }
        pending.completed.resolve();
        return;
      }
      case LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST:
        this.requestWorkerRestart(
          control.targetWorkerId,
          `Worker ${attempt.instance.workerId} requested restart`
        );
        return;
      case LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST:
        this.requestReload(
          control.onlyTaskWorkers,
          `Worker ${attempt.instance.workerId} requested reload`
        );
        return;
      case LIFECYCLE_CONTROL_ACTION.SHUTDOWN_REQUEST:
        this.#context.requestStop(
          new Error(`Worker ${attempt.instance.workerId} requested Runtime shutdown`)
        );
        return;
      case LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST:
        throw new TypeError("Master cannot receive a Worker-authored DRAIN_REQUEST");
    }
  }
  #handleProtocolError(attempt, error, _rawMessage) {
    if (this.#stopping || this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      return;
    }
    if (!attempt.readySettled) {
      this.#failAttempt(attempt, error);
      this.#terminateFailedAttempt(attempt);
      return;
    }
    this.#reportRejectedIpcMessage(attempt, error);
  }
  #reportRejectedIpcMessage(attempt, error) {
    this.#context.metrics.recordError();
    this.#context.log("error", "runtime.process.ipc_message_rejected", {
      workerId: attempt.instance.workerId,
      generation: attempt.instance.generation,
      error: errorString(error)
    });
  }
  #handleReadyTimeout(attempt) {
    if (attempt.readyPromiseSettled || this.#stopping || this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      return;
    }
    const error = new FrameworkError(
      FRAMEWORK_ERROR_CODE.READY_TIMEOUT,
      `Worker ${attempt.instance.workerId} did not become READY within ${this.#readyTimeoutMs}ms`,
      {
        workerId: attempt.instance.workerId,
        generation: attempt.instance.generation,
        timeoutMs: this.#readyTimeoutMs
      }
    );
    this.#failAttempt(attempt, error);
    this.#terminateFailedAttempt(attempt);
  }
  #handleDisconnect(attempt) {
    if (attempt.disconnected || this.#stopping || this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      return;
    }
    attempt.disconnected = true;
    const error = new FrameworkError(
      FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
      `Worker ${attempt.instance.workerId} disconnected from the control channel`,
      {
        workerId: attempt.instance.workerId,
        generation: attempt.instance.generation
      }
    );
    this.#failAttempt(attempt, error);
    this.#terminateFailedAttempt(attempt);
  }
  async #handleClosed(attempt, result) {
    if (attempt.closedHandled) {
      return;
    }
    attempt.closedHandled = true;
    attempt.readyTimer?.cancel();
    this.#cancelFailureTimer(attempt);
    for (const dispose of attempt.disposers.splice(0)) {
      dispose();
    }
    const closeError = new Error(
      `Worker ${attempt.instance.workerId} generation ${attempt.instance.generation} closed`,
      result.error === void 0 ? void 0 : { cause: result.error }
    );
    attempt.drainRequest?.completed.reject(closeError);
    attempt.drainRequest = void 0;
    await this.bus.detachPeer(attempt.peerHandle, closeError);
    attempt.peerDetached.resolve();
    if (this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      return;
    }
    const current = this.registry.require(attempt.instance.workerId);
    if (this.#stopping) {
      if (current.state === WORKER_STATE.READY || current.state === WORKER_STATE.RUNNING) {
        this.registry.markDraining(attempt.instance);
        this.registry.markExited(attempt.instance);
      } else if (current.state === WORKER_STATE.DRAINING) {
        this.registry.markExited(attempt.instance);
      } else if (current.state !== WORKER_STATE.EXITED && current.state !== WORKER_STATE.FAILED) {
        this.registry.markFailed(attempt.instance);
      }
      this.#rejectReady(attempt, stoppingError());
      return;
    }
    if (attempt.plannedExit) {
      if (current.state === WORKER_STATE.DRAINING) {
        this.registry.markExited(attempt.instance);
      } else if (current.state !== WORKER_STATE.EXITED && current.state !== WORKER_STATE.FAILED) {
        this.registry.markFailed(attempt.instance);
      }
      this.#rejectReady(
        attempt,
        new FrameworkError(
          FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
          `Planned Worker ${attempt.instance.workerId} exit completed`,
          {
            workerId: attempt.instance.workerId,
            generation: attempt.instance.generation
          }
        )
      );
      return;
    }
    if (attempt.instance.role === PROCESS_ROLE.TASK_WORKER) {
      this.taskScheduler.suspend(attempt.instance.workerId);
    }
    this.#context.metrics.recordError();
    this.#context.log("error", "runtime.process.closed", {
      workerId: attempt.instance.workerId,
      generation: attempt.instance.generation,
      code: result.code,
      signal: result.signal,
      error: result.error === void 0 ? null : errorString(result.error)
    });
    await this.#notifyWorkerError(attempt, result);
    this.#failAttempt(attempt, closeError);
    if (this.#poolReady && !attempt.lifecycleManaged) {
      await this.#restartAfterClose(attempt);
    }
  }
  async #notifyWorkerError(attempt, result) {
    const observer = this.#onWorkerError;
    const workerPid = attempt.pid;
    if (observer === void 0 || workerPid === void 0) {
      return;
    }
    const exitCode = result.code ?? 0;
    const signal = posixSignalNumber(result.signal);
    try {
      await observer(attempt.instance.workerId, workerPid, exitCode, signal);
    } catch (error) {
      try {
        this.#context.metrics.recordError();
      } catch {
      }
      this.#context.log("error", "runtime.process.worker_error_observer_failed", {
        workerId: attempt.instance.workerId,
        workerPid,
        generation: attempt.instance.generation,
        exitCode,
        signal,
        error: errorString(error)
      });
    }
  }
  #reportCloseObserverFailure(attempt, error) {
    attempt.peerDetached.resolve();
    try {
      this.#context.metrics.recordError();
    } catch {
    }
    this.#context.log("error", "runtime.process.close_observer_failed", {
      workerId: attempt.instance.workerId,
      generation: attempt.instance.generation,
      error: errorString(error)
    });
  }
  #failAttempt(attempt, error) {
    attempt.transport.sealData(error);
    let rejection = error;
    if (this.#attempts.get(attempt.instance.workerId) === attempt && this.registry.isCurrent(attempt.instance)) {
      try {
        this.registry.markFailed(attempt.instance);
      } catch (publicationError) {
        this.#context.metrics.recordError();
        this.#context.log("error", "runtime.process.failure_state_publish_failed", {
          workerId: attempt.instance.workerId,
          generation: attempt.instance.generation,
          error: errorString(publicationError)
        });
        rejection = new AggregateError(
          [error, publicationError],
          `Worker ${attempt.instance.workerId} attempt and failure-state publication both failed`
        );
      }
    }
    this.#rejectReady(attempt, rejection);
    if (!this.#poolReady && !this.#stopping) {
      void this.stop(rejection);
    }
  }
  #rejectReady(attempt, error) {
    if (attempt.readyPromiseSettled) {
      return;
    }
    attempt.readyPromiseSettled = true;
    attempt.readyCompleting = false;
    attempt.readyTimer?.cancel();
    attempt.ready.reject(error);
  }
  #terminateFailedAttempt(attempt) {
    this.#signalAttempt(attempt, "SIGTERM");
    if (this.#stopping || attempt.closedHandled || attempt.failureTimer !== void 0 || this.#attempts.get(attempt.instance.workerId) !== attempt) {
      return;
    }
    let timer;
    try {
      timer = this.#timers.setTimeout(this.#terminateTimeoutMs, () => {
        if (attempt.failureTimer === timer) {
          attempt.failureTimer = void 0;
        }
        if (this.#stopping || attempt.closedHandled || this.#attempts.get(attempt.instance.workerId) !== attempt) {
          return;
        }
        this.#signalAttempt(attempt, "SIGKILL");
      });
      attempt.failureTimer = timer;
    } catch (error) {
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.process.failure_watchdog_failed", {
        workerId: attempt.instance.workerId,
        generation: attempt.instance.generation,
        error: errorString(error)
      });
      this.#signalAttempt(attempt, "SIGKILL");
    }
  }
  #cancelFailureTimer(attempt) {
    const timer = attempt.failureTimer;
    if (timer === void 0) {
      return;
    }
    attempt.failureTimer = void 0;
    timer.cancel();
  }
  #signalAttempt(attempt, signal) {
    if (attempt.closedHandled) {
      return;
    }
    if (attempt.terminationSignal === "SIGKILL" || attempt.terminationSignal === "SIGTERM" && signal === "SIGTERM") {
      return;
    }
    attempt.terminationSignal = signal;
    try {
      attempt.child.kill(signal);
    } catch (error) {
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.process.signal_failed", {
        workerId: attempt.instance.workerId,
        generation: attempt.instance.generation,
        signal,
        error: errorString(error)
      });
    }
  }
  async #restartAfterClose(previous) {
    if (this.#stopping || this.#attempts.get(previous.instance.workerId) !== previous) {
      return;
    }
    const slot = this.registry.getSlot(previous.instance.workerId);
    if (slot === void 0) {
      return;
    }
    let previousAttempt = previous;
    while (!this.#stopping) {
      const delayMs = this.#recordRestartFailure(
        slot.workerId,
        previousAttempt
      );
      previousAttempt = void 0;
      if (delayMs === null) {
        return;
      }
      await this.#waitForRestartDelay(delayMs);
      if (this.#stopping) {
        return;
      }
      try {
        await this.#spawnSlot(slot);
        return;
      } catch (error) {
        this.#context.metrics.recordError();
        this.#context.log("error", "runtime.process.restart_failed", {
          workerId: slot.workerId,
          delayMs,
          error: errorString(error)
        });
        if (this.#attempts.get(slot.workerId) !== previous) {
          return;
        }
      }
    }
  }
  #startLifecycleOperation(name, operation) {
    if (this.#stopping) {
      throw stoppingError();
    }
    if (this.#lifecycleOperation !== void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `ProcessSupervisor lifecycle operation ${this.#lifecycleOperationName} is already running`,
        { activeOperation: this.#lifecycleOperationName ?? null }
      );
    }
    const invocation = {
      active: true,
      supervisor: this
    };
    const completion = Promise.resolve().then(
      () => activeProcessSupervisorLifecycle.run(invocation, async () => {
        try {
          await operation();
        } finally {
          invocation.active = false;
        }
      })
    );
    this.#lifecycleOperation = completion;
    this.#lifecycleOperationName = name;
    void completion.then(
      () => {
        if (this.#lifecycleOperation === completion) {
          this.#lifecycleOperation = void 0;
          this.#lifecycleOperationName = void 0;
        }
      },
      (error) => {
        if (this.#lifecycleOperation === completion) {
          this.#lifecycleOperation = void 0;
          this.#lifecycleOperationName = void 0;
        }
        if (!this.#stopping) {
          this.#context.metrics.recordError();
          this.#context.log("error", "runtime.process.lifecycle_operation_failed", {
            operation: name,
            error: errorString(error)
          });
        }
      }
    );
    return Object.freeze({ completion });
  }
  async #performPlannedRestart(slot, reason) {
    if (this.#stopping) {
      throw stoppingError();
    }
    const attempt = this.#attempts.get(slot.workerId);
    const record = this.registry.get(slot.workerId);
    if (attempt === void 0 || record === void 0 || !this.registry.isCurrent(attempt.instance) || record.state !== WORKER_STATE.READY && record.state !== WORKER_STATE.RUNNING) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        `Worker ${slot.workerId} is not ready for a planned restart`,
        { workerId: slot.workerId, state: record?.state ?? null }
      );
    }
    attempt.plannedExit = true;
    let quiesced = false;
    try {
      if (slot.role === PROCESS_ROLE.TASK_WORKER) {
        this.taskScheduler.suspend(slot.workerId);
      } else if (slot.role === PROCESS_ROLE.WORKER) {
        await this.#workerLifecycleCoordinator?.quiesceWorker(slot.workerId);
      }
      quiesced = true;
      try {
        await this.#drainAttempt(attempt, reason);
      } catch (error) {
        this.#context.metrics.recordError();
        this.#context.log("warn", "runtime.process.planned_drain_failed", {
          workerId: slot.workerId,
          generation: attempt.instance.generation,
          error: errorString(error)
        });
        this.#signalAttempt(attempt, "SIGTERM");
      }
      this.#sendShutdown(attempt);
      await this.#waitAndEscalate([attempt]);
      await attempt.child.closed;
      await attempt.peerDetached.promise;
      if (this.#stopping) {
        return;
      }
      await this.#spawnLifecycleReplacement(slot);
      this.#resetRestartState(slot.workerId);
    } catch (error) {
      if (!attempt.closedHandled && this.registry.isCurrent(attempt.instance)) {
        attempt.plannedExit = false;
        if (slot.role === PROCESS_ROLE.TASK_WORKER) {
          this.taskScheduler.resume(slot.workerId);
        } else if (slot.role === PROCESS_ROLE.WORKER && quiesced) {
          this.#workerLifecycleCoordinator?.cancelWorkerQuiesce(slot.workerId);
        }
      }
      throw error;
    }
  }
  async #spawnLifecycleReplacement(slot) {
    let firstAttempt = true;
    while (!this.#stopping) {
      if (!firstAttempt) {
        const delayMs = this.#recordRestartFailure(slot.workerId);
        if (delayMs === null) {
          throw new FrameworkError(
            FRAMEWORK_ERROR_CODE.INVALID_STATE,
            `Worker ${slot.workerId} replacement is fused`,
            { workerId: slot.workerId }
          );
        }
        await this.#waitForRestartDelay(delayMs);
        if (this.#stopping) {
          return;
        }
      }
      firstAttempt = false;
      let replacement;
      try {
        replacement = await this.#spawnSlot(slot, true);
        await replacement.ready.promise;
        return;
      } catch (error) {
        const current = replacement ?? this.#attempts.get(slot.workerId);
        if (current?.lifecycleManaged === true && !current.closedHandled) {
          await current.child.closed.catch(() => void 0);
          await current.peerDetached.promise.catch(() => void 0);
        }
        if (this.#stopping) {
          return;
        }
        this.#context.metrics.recordError();
        this.#context.log("error", "runtime.process.planned_replacement_failed", {
          workerId: slot.workerId,
          error: errorString(error)
        });
      }
    }
  }
  #recordRestartFailure(workerId, previous) {
    const now = this.#context.clock.monotonicTimeMs();
    const state = this.#restartStates.get(workerId) ?? {
      failures: [],
      consecutiveFailures: 0,
      fused: false
    };
    this.#restartStates.set(workerId, state);
    if (previous?.readyAtMonotonicMs !== void 0 && now - previous.readyAtMonotonicMs >= this.#restartStableMs) {
      state.failures.length = 0;
      state.consecutiveFailures = 0;
      state.fused = false;
    }
    while (state.failures.length > 0 && now - state.failures[0] > this.#restartWindowMs) {
      state.failures.shift();
    }
    state.failures.push(now);
    state.consecutiveFailures += 1;
    if (state.failures.length > this.#maxRestartsPerWindow) {
      state.fused = true;
      const error = new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `Worker ${workerId} exceeded the restart rate limit`,
        {
          workerId,
          failures: state.failures.length,
          restartWindowMs: this.#restartWindowMs,
          maxRestartsPerWindow: this.#maxRestartsPerWindow
        }
      );
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.process.crash_loop_fused", {
        workerId,
        failures: state.failures.length,
        restartWindowMs: this.#restartWindowMs
      });
      this.#context.requestStop(error);
      return null;
    }
    if (state.consecutiveFailures === 1) {
      return 0;
    }
    const exponent = Math.min(30, state.consecutiveFailures - 2);
    return Math.min(
      this.#restartBackoffMaxMs,
      this.#restartBackoffBaseMs * 2 ** exponent
    );
  }
  #resetRestartState(workerId) {
    this.#restartStates.delete(workerId);
  }
  async #waitForRestartDelay(delayMs) {
    if (delayMs === 0 || this.#stopping) {
      return;
    }
    let timer;
    timer = this.#timers.setTimeout(delayMs, () => void 0);
    this.#restartTimers.add(timer);
    try {
      await timer.done;
    } finally {
      this.#restartTimers.delete(timer);
    }
  }
  async #drainAttempt(attempt, reason) {
    if (attempt.closedHandled || attempt.bootstrap === void 0 || !attempt.child.connected || this.#attempts.get(attempt.instance.workerId) !== attempt || !this.registry.isCurrent(attempt.instance)) {
      return;
    }
    const record = this.registry.get(attempt.instance.workerId);
    if (record === void 0) {
      return;
    }
    if (record.state === WORKER_STATE.READY || record.state === WORKER_STATE.RUNNING) {
      if (this.registry.markDraining(attempt.instance) === void 0) {
        return;
      }
    } else if (record.state !== WORKER_STATE.DRAINING) {
      return;
    }
    if (attempt.drainRequest !== void 0) {
      return attempt.drainRequest.completed.promise;
    }
    const requestId = `drain-${attempt.instance.workerId}-${attempt.instance.generation}-${this.#context.idGenerator.next()}`;
    const completed = createDeferred5();
    void completed.promise.catch(() => void 0);
    attempt.drainRequest = { requestId, completed };
    let timedOut = false;
    let timer;
    const timeout = new Promise((resolve4) => {
      timer = this.#timers.setTimeout(this.#gracefulShutdownTimeoutMs, () => {
        timedOut = true;
        resolve4();
      });
    });
    try {
      const envelope = createDrainRequest(attempt.bootstrap, {
        messageId: `drain-request-${this.#context.idGenerator.next()}`,
        requestId
      });
      const drained = (async () => {
        await attempt.transport.sendControlAfterData(envelope);
        await completed.promise;
      })();
      await Promise.race([drained, timeout]);
      if (timedOut) {
        const error = new FrameworkError(
          FRAMEWORK_ERROR_CODE.DRAIN_TIMEOUT,
          `Worker ${attempt.instance.workerId} did not drain within ${this.#gracefulShutdownTimeoutMs}ms`,
          {
            workerId: attempt.instance.workerId,
            generation: attempt.instance.generation,
            timeoutMs: this.#gracefulShutdownTimeoutMs,
            reason: errorString(reason)
          }
        );
        completed.reject(error);
        throw error;
      }
    } finally {
      timer?.cancel(reason);
      await timer?.done.catch(() => void 0);
      if (attempt.drainRequest?.completed === completed) {
        attempt.drainRequest = void 0;
      }
    }
  }
  async #performStop(reason, hooks) {
    if (this.#stopped) {
      return;
    }
    const activeLifecycle = this.#lifecycleOperation;
    const lifecycleInvocation = activeProcessSupervisorLifecycle.getStore();
    const calledFromActiveLifecycle = lifecycleInvocation?.active === true && lifecycleInvocation.supervisor === this;
    this.#poolReady = false;
    this.taskScheduler.seal(reason);
    this.bus.sealLocalRequests(reason);
    const attempts = [...this.#attempts.values()];
    const failures = [];
    const taskAttempts = attempts.filter(
      (attempt) => attempt.instance.role !== PROCESS_ROLE.WORKER
    );
    const eventAttempts = attempts.filter(
      (attempt) => attempt.instance.role === PROCESS_ROLE.WORKER
    );
    if (taskAttempts.length > 0) {
      await Promise.all(taskAttempts.map(
        (attempt) => this.#drainAttempt(attempt, reason).catch((error) => {
          failures.push(error);
          this.#signalAttempt(attempt, "SIGTERM");
        })
      ));
      await this.#stopAttempts(taskAttempts);
      await this.bus.drain();
      await this.taskRouter.drain();
      await this.bus.drain();
    }
    await Promise.all(eventAttempts.map(async (attempt) => {
      try {
        await this.#workerLifecycleCoordinator?.quiesceWorker(
          attempt.instance.workerId,
          { preserveOwnerAvailability: true }
        );
      } catch (error) {
        failures.push(error);
        this.#signalAttempt(attempt, "SIGTERM");
      }
      try {
        await this.#drainAttempt(attempt, reason);
      } catch (error) {
        failures.push(error);
        this.#signalAttempt(attempt, "SIGTERM");
      }
    }));
    try {
      await hooks.beforeEventWorkerShutdown?.();
    } catch (error) {
      failures.push(error);
    }
    if (hooks.beforeEventWorkerShutdown !== void 0) {
      await Promise.all(eventAttempts.map(
        (attempt) => this.#drainAttempt(attempt, reason).catch((error) => {
          failures.push(error);
          this.#signalAttempt(attempt, "SIGTERM");
        })
      ));
    }
    await this.#stopAttempts(eventAttempts);
    if (activeLifecycle !== void 0 && !calledFromActiveLifecycle) {
      await activeLifecycle.catch(() => void 0);
    }
    await Promise.all(attempts.map((attempt) => attempt.child.closed));
    await Promise.all(
      attempts.map((attempt) => attempt.peerDetached.promise)
    );
    await this.bus.drain();
    await this.taskRouter.drain();
    await this.bus.drain();
    this.taskRouter.close(reason);
    await this.bus.close(reason);
    this.#stopped = true;
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "ProcessSupervisor shutdown coordination failed");
    }
  }
  async #stopAttempts(attempts) {
    for (const attempt of attempts) {
      attempt.readyTimer?.cancel();
      this.#cancelFailureTimer(attempt);
      const record = this.registry.get(attempt.instance.workerId);
      if (record === void 0 || !this.registry.isCurrent(attempt.instance)) {
        continue;
      }
      if (record.state === WORKER_STATE.READY || record.state === WORKER_STATE.RUNNING) {
        this.registry.markDraining(attempt.instance);
        this.#sendShutdown(attempt);
      } else if (record.state === WORKER_STATE.DRAINING) {
        this.#sendShutdown(attempt);
      } else if (record.state !== WORKER_STATE.EXITED && record.state !== WORKER_STATE.FAILED) {
        this.registry.markFailed(attempt.instance);
        this.#signalAttempt(attempt, "SIGTERM");
      } else if (record.state === WORKER_STATE.FAILED) {
        this.#signalAttempt(attempt, "SIGTERM");
      }
      this.#rejectReady(attempt, stoppingError());
    }
    await this.#waitAndEscalate(attempts);
    await Promise.all(attempts.map((attempt) => attempt.child.closed));
    await Promise.all(attempts.map((attempt) => attempt.peerDetached.promise));
  }
  async #waitAndEscalate(attempts) {
    const openAttempts = attempts.filter((attempt) => !attempt.closedHandled);
    if (openAttempts.length > 0 && openAttempts.every((attempt) => attempt.terminationSignal === "SIGTERM")) {
      if (!await this.#waitForAllClosed(openAttempts, this.#terminateTimeoutMs)) {
        for (const attempt of openAttempts) {
          if (!attempt.closedHandled) {
            this.#signalAttempt(attempt, "SIGKILL");
          }
        }
      }
      return;
    }
    if (!await this.#waitForAllClosed(attempts, this.#gracefulShutdownTimeoutMs)) {
      for (const attempt of attempts) {
        if (!attempt.closedHandled) {
          this.#signalAttempt(attempt, "SIGTERM");
        }
      }
      if (!await this.#waitForAllClosed(attempts, this.#terminateTimeoutMs)) {
        for (const attempt of attempts) {
          if (!attempt.closedHandled) {
            this.#signalAttempt(attempt, "SIGKILL");
          }
        }
      }
    }
  }
  #sendShutdown(attempt) {
    if (attempt.shutdownRequested) {
      return;
    }
    attempt.shutdownRequested = true;
    try {
      if (attempt.bootstrap === void 0 || !attempt.child.connected) {
        this.#signalAttempt(attempt, "SIGTERM");
        return;
      }
      const envelope = createShutdownControlEnvelope(attempt.bootstrap, {
        messageId: `shutdown-${this.#context.idGenerator.next()}`
      });
      void attempt.transport.sendControlAfterData(envelope).catch(() => {
        this.#signalAttempt(attempt, "SIGTERM");
      });
    } catch {
      this.#signalAttempt(attempt, "SIGTERM");
    }
  }
  async #waitForAllClosed(attempts, timeoutMs) {
    if (attempts.every((attempt) => attempt.closedHandled)) {
      return true;
    }
    let resolveTimeout;
    const timeout = new Promise((resolve4) => {
      resolveTimeout = resolve4;
    });
    const timer = this.#timers.setTimeout(timeoutMs, resolveTimeout);
    const closed = Promise.all(attempts.map((attempt) => attempt.child.closed)).then(() => true);
    const result = await Promise.race([closed, timeout.then(() => false)]);
    timer.cancel();
    await timer.done.catch(() => void 0);
    return result;
  }
};

// src/metrics/runtime-metrics.ts
function assertDuration(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}
function increment(name, value) {
  if (value >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} exceeded Number.MAX_SAFE_INTEGER`);
  }
  return value + 1;
}
var RuntimeMetrics = class {
  #state;
  #startCount = 0;
  #stopCount = 0;
  #errorCount = 0;
  #logWriteErrorCount = 0;
  #activeResourceCount = 0;
  #networkCommandAcceptedCount = 0;
  #networkCommandRejectedCount = 0;
  #networkCommandBackpressureCount = 0;
  #networkCommandWriteFailureCount = 0;
  #networkOutputBufferFullCount = 0;
  #networkOutputBufferEmptyCount = 0;
  #networkOutputBufferOverflowCount = 0;
  #networkInputPauseCount = 0;
  #networkInputResumeCount = 0;
  #networkInputTimeoutCount = 0;
  #ipcPressureEnterCount = 0;
  #ipcPressureExitCount = 0;
  #lastStartDurationMs = 0;
  #lastStopDurationMs = 0;
  constructor(initialState = MASTER_STATE.CREATED) {
    if (!MASTER_STATES.includes(initialState)) {
      throw new TypeError(`unknown Master state ${String(initialState)}`);
    }
    this.#state = initialState;
  }
  setState(state) {
    if (!MASTER_STATES.includes(state)) {
      throw new TypeError(`unknown Master state ${String(state)}`);
    }
    this.#state = state;
  }
  recordStart(durationMs) {
    assertDuration("durationMs", durationMs);
    this.#startCount = increment("startCount", this.#startCount);
    this.#lastStartDurationMs = durationMs;
  }
  recordStop(durationMs) {
    assertDuration("durationMs", durationMs);
    this.#stopCount = increment("stopCount", this.#stopCount);
    this.#lastStopDurationMs = durationMs;
  }
  recordError() {
    this.#errorCount = increment("errorCount", this.#errorCount);
  }
  recordLogWriteError() {
    this.#logWriteErrorCount = increment("logWriteErrorCount", this.#logWriteErrorCount);
  }
  setActiveResourceCount(count) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("activeResourceCount must be a non-negative safe integer");
    }
    this.#activeResourceCount = count;
  }
  recordNetworkCommandAccepted(backpressured) {
    this.#networkCommandAcceptedCount = increment(
      "networkCommandAcceptedCount",
      this.#networkCommandAcceptedCount
    );
    if (backpressured) {
      this.#networkCommandBackpressureCount = increment(
        "networkCommandBackpressureCount",
        this.#networkCommandBackpressureCount
      );
    }
  }
  recordNetworkCommandRejected(writeFailure) {
    this.#networkCommandRejectedCount = increment(
      "networkCommandRejectedCount",
      this.#networkCommandRejectedCount
    );
    if (writeFailure) {
      this.#networkCommandWriteFailureCount = increment(
        "networkCommandWriteFailureCount",
        this.#networkCommandWriteFailureCount
      );
    }
  }
  recordNetworkOutputBufferFull() {
    this.#networkOutputBufferFullCount = increment(
      "networkOutputBufferFullCount",
      this.#networkOutputBufferFullCount
    );
  }
  recordNetworkOutputBufferEmpty() {
    this.#networkOutputBufferEmptyCount = increment(
      "networkOutputBufferEmptyCount",
      this.#networkOutputBufferEmptyCount
    );
  }
  recordNetworkOutputBufferOverflow() {
    this.#networkOutputBufferOverflowCount = increment(
      "networkOutputBufferOverflowCount",
      this.#networkOutputBufferOverflowCount
    );
  }
  recordNetworkInputPause() {
    this.#networkInputPauseCount = increment(
      "networkInputPauseCount",
      this.#networkInputPauseCount
    );
  }
  recordNetworkInputResume() {
    this.#networkInputResumeCount = increment(
      "networkInputResumeCount",
      this.#networkInputResumeCount
    );
  }
  recordNetworkInputTimeout() {
    this.#networkInputTimeoutCount = increment(
      "networkInputTimeoutCount",
      this.#networkInputTimeoutCount
    );
  }
  recordIpcPressureTransition(pressured) {
    if (pressured) {
      this.#ipcPressureEnterCount = increment(
        "ipcPressureEnterCount",
        this.#ipcPressureEnterCount
      );
      return;
    }
    this.#ipcPressureExitCount = increment(
      "ipcPressureExitCount",
      this.#ipcPressureExitCount
    );
  }
  snapshot() {
    return Object.freeze({
      state: this.#state,
      startCount: this.#startCount,
      stopCount: this.#stopCount,
      errorCount: this.#errorCount,
      logWriteErrorCount: this.#logWriteErrorCount,
      activeResourceCount: this.#activeResourceCount,
      networkCommandAcceptedCount: this.#networkCommandAcceptedCount,
      networkCommandRejectedCount: this.#networkCommandRejectedCount,
      networkCommandBackpressureCount: this.#networkCommandBackpressureCount,
      networkCommandWriteFailureCount: this.#networkCommandWriteFailureCount,
      networkOutputBufferFullCount: this.#networkOutputBufferFullCount,
      networkOutputBufferEmptyCount: this.#networkOutputBufferEmptyCount,
      networkOutputBufferOverflowCount: this.#networkOutputBufferOverflowCount,
      networkInputPauseCount: this.#networkInputPauseCount,
      networkInputResumeCount: this.#networkInputResumeCount,
      networkInputTimeoutCount: this.#networkInputTimeoutCount,
      ipcPressureEnterCount: this.#ipcPressureEnterCount,
      ipcPressureExitCount: this.#ipcPressureExitCount,
      lastStartDurationMs: this.#lastStartDurationMs,
      lastStopDurationMs: this.#lastStopDurationMs
    });
  }
};

// src/runtime/id-generator.ts
var SequentialIdGenerator = class {
  #current;
  constructor(start = 0) {
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new RangeError(
        `start must be a non-negative safe integer, got ${start}`
      );
    }
    this.#current = start;
  }
  next() {
    if (this.#current === Number.MAX_SAFE_INTEGER) {
      throw new RangeError("sequential ID generator exhausted the safe integer range");
    }
    this.#current += 1;
    return this.#current;
  }
};

// src/runtime/resource-scope.ts
import { AsyncLocalStorage as AsyncLocalStorage5 } from "node:async_hooks";
var activeResourceDisposer = new AsyncLocalStorage5();
function assertResourceName(name) {
  if (name.length === 0) {
    throw new TypeError("resource name must not be empty");
  }
}
function closeFailure(name, cause) {
  return new Error(`failed to close runtime resource ${name}`, { cause });
}
var ResourceScope = class {
  #entries = [];
  #onSizeChange;
  #state = "open";
  #closePromise;
  constructor(onSizeChange) {
    this.#onSizeChange = onSizeChange;
  }
  get size() {
    return this.#entries.length;
  }
  get closed() {
    return this.#state === "closed";
  }
  use(name, resource) {
    assertResourceName(name);
    this.#assertOpen();
    this.#entries.push({
      name,
      close: (reason) => resource.close(reason)
    });
    this.#notifyRegistered();
    return resource;
  }
  defer(name, disposer) {
    assertResourceName(name);
    this.#assertOpen();
    this.#entries.push({ name, close: disposer });
    this.#notifyRegistered();
  }
  close(reason) {
    const invocation = activeResourceDisposer.getStore();
    if (invocation?.active === true && invocation.scope === this) {
      return invocation.joinedClose;
    }
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#state = "closing";
    this.#closePromise = Promise.resolve().then(
      () => this.#closeEntries(reason)
    );
    return this.#closePromise;
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
  #assertOpen() {
    if (this.#state !== "open") {
      throw new Error(`resource scope is ${this.#state}`);
    }
  }
  #notifyRegistered() {
    try {
      this.#onSizeChange?.(this.size);
    } catch (error) {
      this.#entries.pop();
      try {
        this.#onSizeChange?.(this.size);
      } catch {
      }
      throw error;
    }
  }
  #notifyCleanup(failures) {
    try {
      this.#onSizeChange?.(this.size);
    } catch (error) {
      failures.push(closeFailure("ResourceScope.onSizeChange", error));
    }
  }
  async #closeEntries(reason) {
    const failures = [];
    try {
      while (this.#entries.length > 0) {
        const entry = this.#entries.at(-1);
        if (entry === void 0) {
          break;
        }
        const invocation = {
          active: true,
          joinedClose: Promise.resolve(),
          scope: this
        };
        try {
          await activeResourceDisposer.run(
            invocation,
            () => entry.close(reason)
          );
        } catch (error) {
          failures.push(closeFailure(entry.name, error));
        } finally {
          invocation.active = false;
          this.#entries.pop();
          this.#notifyCleanup(failures);
        }
      }
    } finally {
      if (this.#entries.length > 0) {
        this.#entries.length = 0;
        this.#notifyCleanup(failures);
      }
      this.#state = "closed";
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "failed to close runtime resources");
    }
  }
};

// src/runtime/structured-logger.ts
var RUNTIME_LOG_LEVELS = Object.freeze([
  "debug",
  "info",
  "warn",
  "error"
]);
function assertTimestamp(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}
function cloneJsonSafeValue(value, path, seen) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} is not JSON-safe`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${path} must not contain cycles`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const clone = value.map(
        (item, index) => cloneJsonSafeValue(item, `${path}[${index}]`, seen)
      );
      return Object.freeze(clone);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain objects`);
    }
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) {
      throw new TypeError(`${path} must not contain symbol keys`);
    }
    const entries = Object.entries(value).map(([key, item]) => [
      key,
      cloneJsonSafeValue(item, `${path}.${key}`, seen)
    ]);
    return Object.freeze(Object.fromEntries(entries));
  } finally {
    seen.delete(value);
  }
}
function isRuntimeLogFields(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function createStructuredLogRecord(timestampMs, monotonicMs, level, event, fields = {}) {
  assertTimestamp("timestampMs", timestampMs);
  assertTimestamp("monotonicMs", monotonicMs);
  if (!RUNTIME_LOG_LEVELS.includes(level)) {
    throw new TypeError(`unknown structured log level ${String(level)}`);
  }
  if (typeof event !== "string" || event.length === 0) {
    throw new TypeError("event must not be empty");
  }
  const clonedFields = cloneJsonSafeValue(fields, "fields", /* @__PURE__ */ new WeakSet());
  if (!isRuntimeLogFields(clonedFields)) {
    throw new TypeError("fields must be a plain object");
  }
  return Object.freeze({
    timestampMs,
    monotonicMs,
    level,
    event,
    fields: clonedFields
  });
}
var NOOP_STRUCTURED_LOGGER = Object.freeze({
  write(_record) {
  }
});

// src/runtime/runtime-context.ts
var RuntimeAbortError = class extends Error {
  reason;
  constructor(message, reason) {
    super(message);
    this.name = "RuntimeAbortError";
    this.reason = reason;
  }
};
function readErrorString(read, fallback) {
  try {
    return String(read());
  } catch {
    return fallback;
  }
}
function describeTimerCallbackError(error) {
  let errorValue = null;
  try {
    if (error instanceof Error) {
      errorValue = error;
    }
  } catch {
  }
  if (errorValue !== null) {
    return {
      errorName: readErrorString(() => errorValue.name, "Error"),
      errorMessage: readErrorString(
        () => errorValue.message,
        "<unreadable error message>"
      )
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: readErrorString(() => error, "<unprintable thrown value>")
  };
}
var RuntimeContext = class {
  settings;
  masterPid;
  masterGeneration;
  clock;
  timers;
  idGenerator;
  logger;
  metrics;
  #controller = new AbortController();
  #resources;
  #closePromise = null;
  #closed = false;
  constructor(options) {
    this.settings = loadRuntimeSettings(options.settings);
    this.masterPid = options.masterPid ?? createProcessPid(process.pid);
    const masterGeneration = options.masterGeneration ?? 1;
    if (!Number.isSafeInteger(masterGeneration) || masterGeneration < 0 || masterGeneration > SESSION_ID_LAYOUT.maxMasterGeneration) {
      throw new RangeError(
        `masterGeneration must be a safe integer in [0, ${SESSION_ID_LAYOUT.maxMasterGeneration}]`
      );
    }
    this.masterGeneration = masterGeneration;
    this.clock = options.clock ?? new SystemClock();
    this.idGenerator = options.idGenerator ?? new SequentialIdGenerator();
    this.logger = options.logger ?? NOOP_STRUCTURED_LOGGER;
    this.metrics = options.metrics ?? new RuntimeMetrics();
    this.metrics.setState("CREATED");
    this.timers = options.timers ?? new SystemTimerScheduler({
      clock: this.clock,
      onCallbackError: (error) => this.#reportTimerCallbackError(error)
    });
    this.#resources = new ResourceScope((size) => {
      this.metrics.setActiveResourceCount(size);
    });
    this.#resources.defer(
      "runtime.timer-scheduler",
      (reason) => this.timers.closeGlobally(reason)
    );
    const parentSignal = options.parentSignal;
    if (parentSignal !== void 0) {
      const forwardAbort = () => {
        this.requestStop(parentSignal.reason);
      };
      if (parentSignal.aborted) {
        forwardAbort();
      } else {
        parentSignal.addEventListener("abort", forwardAbort, { once: true });
        this.#resources.defer("runtime.parent-abort-listener", () => {
          parentSignal.removeEventListener("abort", forwardAbort);
        });
      }
    }
  }
  get signal() {
    return this.#controller.signal;
  }
  get resourceCount() {
    return this.#resources.size;
  }
  get closed() {
    return this.#closed;
  }
  requestStop(reason) {
    if (this.signal.aborted) {
      return false;
    }
    this.#controller.abort(reason);
    return true;
  }
  registerResource(name, resource) {
    this.#assertAcceptingResources();
    return this.#resources.use(name, resource);
  }
  deferResource(name, cleanup) {
    this.#assertAcceptingResources();
    this.#resources.defer(name, cleanup);
  }
  log(level, event, fields = {}) {
    try {
      this.logger.write(
        createStructuredLogRecord(
          this.clock.wallTimeMs(),
          this.clock.monotonicTimeMs(),
          level,
          event,
          fields
        )
      );
    } catch {
      this.metrics.recordLogWriteError();
    }
  }
  closeFromResourceDisposer(reason) {
    if (this.#closePromise === null) {
      return void 0;
    }
    const scopeClose = this.#resources.close(reason);
    return scopeClose === this.#closePromise ? void 0 : scopeClose;
  }
  joinCloseFromCallback() {
    return this.timers.joinCloseFromCallback();
  }
  closeGlobally(reason) {
    if (this.#closePromise !== null) {
      return this.#closePromise;
    }
    const closePromise = this.#resources.close(reason);
    this.#closePromise = closePromise;
    void closePromise.then(
      () => {
        this.#closed = true;
      },
      () => {
        this.#closed = true;
      }
    );
    this.requestStop(reason ?? new RuntimeAbortError("RuntimeContext is closing"));
    return closePromise;
  }
  close(reason) {
    const resourceClose = this.closeFromResourceDisposer(reason);
    if (resourceClose !== void 0) {
      return resourceClose;
    }
    const callbackClose = this.joinCloseFromCallback();
    const globalClose = this.closeGlobally(reason);
    return callbackClose ?? globalClose;
  }
  #reportTimerCallbackError(error) {
    this.metrics.recordError();
    this.log("error", "runtime.timer.callback_failed", describeTimerCallbackError(error));
  }
  #assertAcceptingResources() {
    if (this.#closed || this.signal.aborted) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "RuntimeContext cannot accept resources after stop was requested",
        { closed: this.#closed, aborted: this.signal.aborted }
      );
    }
  }
};

// src/lifecycle/master-runtime.ts
var activeInitializer = new AsyncLocalStorage6();
function createDeferred6() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function readString3(read, fallback) {
  try {
    return String(read());
  } catch {
    return fallback;
  }
}
function describeError3(error) {
  let errorValue = null;
  try {
    if (error instanceof Error) {
      errorValue = error;
    }
  } catch {
  }
  if (errorValue !== null) {
    return {
      errorName: readString3(() => errorValue.name, "Error"),
      errorMessage: readString3(
        () => errorValue.message,
        "<unreadable error message>"
      )
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: readString3(() => error, "<unprintable thrown value>")
  };
}
function createDefaultProcessSupervisor(context, sharedState) {
  const rustDataPlane = rustTcpDataPlaneEnabled(context.settings.protocol);
  return new ProcessSupervisor({
    context,
    compactIpcEnvelopes: true,
    sharedRuntime: sharedState.descriptor,
    sharedWorkers: sharedState,
    ...rustDataPlane ? { childEnvironment: { ALLOY_CORE_RUST_DATA_PLANE: "1" } } : {}
  });
}
var DefaultMasterNetworkServer = class {
  network;
  commands;
  #bus;
  #closePromise;
  constructor(network, commands, bus) {
    this.network = network;
    this.commands = commands;
    this.#bus = bus;
  }
  listen() {
    return this.network.listen();
  }
  stopAccepting(reason) {
    return this.network.stopAccepting(reason);
  }
  closeConnections(reason) {
    return this.network.closeConnections(reason);
  }
  close(reason) {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#closePromise = (async () => {
      const failures = [];
      try {
        await this.network.close(reason);
      } catch (error) {
        failures.push(error);
      }
      try {
        await this.#bus.drain();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Default network server and ProcessBus drain cleanup failed"
        );
      }
    })();
    return this.#closePromise;
  }
};
function createDefaultNetworkServer(context, processSupervisor, sharedState) {
  const bus = processSupervisor.bus;
  if (bus === void 0) {
    throw new TypeError(
      "The default NetworkServer requires a MasterProcessSupervisor with a ProcessBus"
    );
  }
  const inputMaxBytes = context.settings.buffer_input_size;
  const recoveryTimeoutMs = context.settings.backpressure_timeout_ms;
  const recordSharedStat = (metricId) => {
    if (sharedState === void 0) {
      return;
    }
    try {
      sharedState.addStat(metricId);
    } catch (error) {
      context.metrics.recordError();
      context.log("error", "runtime.shared.stat_publish_failed", {
        metricId,
        error: error instanceof Error ? error.message : String(error)
      });
      context.requestStop(error);
    }
  };
  const dispatcherMetrics = {
    recordNetworkInputPause() {
      context.metrics.recordNetworkInputPause();
      recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_PAUSE);
    },
    recordNetworkInputResume() {
      context.metrics.recordNetworkInputResume();
      recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_RESUME);
    },
    recordNetworkInputTimeout() {
      context.metrics.recordNetworkInputTimeout();
      recordSharedStat(SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_TIMEOUT);
    }
  };
  let lifecycle;
  const externalMessageDelivery = rustTcpDataPlaneEnabled(
    context.settings.protocol
  );
  let network;
  network = new NetworkServer({
    context,
    rustDataPlane: externalMessageDelivery,
    ...sharedState === void 0 ? {} : { sharedConnections: sharedState },
    eventSinkFactory: (connections) => {
      const dispatcher = new WorkerDispatcher({
        bus,
        connections,
        workerNum: context.settings.worker_num,
        externalMessageDelivery,
        ...externalMessageDelivery ? {
          externalControlDelivery: async (options) => {
            if (options.targetWorkerId == null || options.sessionId == null || options.sequence == null || options.messageType !== "NET_CONNECT" && options.messageType !== "NET_CLOSE" && options.messageType !== "NET_BUFFER_STATE") {
              throw new TypeError("Native control delivery requires a Worker Session event");
            }
            const generation = processSupervisor.getWorkerGeneration?.(
              options.targetWorkerId
            ) ?? null;
            if (generation === null) {
              throw new Error(
                `Worker ${options.targetWorkerId} has no active generation`
              );
            }
            await network.deliverDataPlaneControl(
              options.messageType === "NET_CONNECT" ? "connect" : options.messageType === "NET_CLOSE" ? "close" : "buffer",
              options.sessionId,
              options.targetWorkerId,
              generation,
              options.sequence,
              options.payload
            );
          }
        } : {},
        resolveWorkerGeneration: (workerId) => processSupervisor.getWorkerGeneration?.(workerId) ?? null,
        ...externalMessageDelivery ? {
          synchronizeSession: (sessionId) => {
            network.synchronizeDataPlaneSession(sessionId);
          },
          waitForSessionPaused: (sessionId) => network.waitForDataPlaneSessionPaused(
            sessionId,
            Math.min(recoveryTimeoutMs ?? 5e3, 1e3)
          ),
          onSessionReady: (sessionId, workerId, workerGeneration) => {
            network.routeSessionToWorker(
              sessionId,
              workerId,
              workerGeneration
            );
          }
        } : {},
        timers: context.timers,
        metrics: dispatcherMetrics,
        ...recoveryTimeoutMs === void 0 ? {} : { recoveryTimeoutMs },
        ...inputMaxBytes === void 0 ? {} : {
          sessionMaxBytes: inputMaxBytes,
          sessionHighBytes: Math.max(1, Math.floor(inputMaxBytes * 0.75)),
          sessionLowBytes: Math.floor(inputMaxBytes * 0.5)
        }
      });
      lifecycle = dispatcher;
      return dispatcher;
    }
  });
  if (lifecycle === void 0) {
    throw new Error("The default NetworkServer did not create its WorkerDispatcher");
  }
  processSupervisor.setWorkerLifecycleCoordinator?.(lifecycle);
  const commands = new MasterNetworkCommandReceiver({
    context,
    bus,
    writer: network
  });
  return new DefaultMasterNetworkServer(network, commands, bus);
}
var MasterRuntime = class {
  context;
  sharedState;
  stopped;
  #initialize;
  #hooks;
  #processSupervisorFactory;
  #networkServerFactory;
  #initializerToken = {};
  #stoppedDeferred = createDeferred6();
  #initializerCloseJoin = createDeferred6();
  #contextCloseStarted = createDeferred6();
  #state = MASTER_STATE.CREATED;
  #startPromise = null;
  #initializationDone = null;
  #stopPromise = null;
  #abortListenerAttached = false;
  #managerStarted = false;
  #managerStopped = false;
  #listenerStarted = false;
  #signalListenersAttached = false;
  #processSupervisor = null;
  #networkServer = null;
  #onAbort = () => {
    const stopPromise = this.stop(this.context.signal.reason);
    void stopPromise.catch((error) => {
      this.context.log("error", "runtime.master.abort_stop_failed", describeError3(error));
    });
  };
  #onSigterm = () => {
    void this.stop(new Error("Master Runtime received SIGTERM")).catch(
      (error) => {
        this.context.log("error", "runtime.master.signal_stop_failed", describeError3(error));
      }
    );
  };
  #onSigusr1 = () => {
    this.#requestSignalReload(false, "SIGUSR1");
  };
  #onSigusr2 = () => {
    this.#requestSignalReload(true, "SIGUSR2");
  };
  constructor(options) {
    const {
      initialize,
      hooks,
      processSupervisorFactory = createDefaultProcessSupervisor,
      networkServerFactory = createDefaultNetworkServer,
      sharedStateProvider = new NativeSharedRuntimeStateProvider(),
      runtimeKey,
      sharedStateLedgerDirectory,
      ...contextOptions
    } = options;
    const settings = loadRuntimeSettings(contextOptions.settings);
    const masterPid = contextOptions.masterPid ?? createProcessPid(process.pid);
    const sharedState = sharedStateProvider.claimMaster({
      settings,
      masterPid,
      ...runtimeKey === void 0 ? {} : { runtimeKey },
      ...sharedStateLedgerDirectory === void 0 ? {} : { ledgerDirectory: sharedStateLedgerDirectory }
    });
    try {
      if (contextOptions.masterGeneration !== void 0 && contextOptions.masterGeneration !== sharedState.masterGeneration) {
        throw new RangeError(
          `explicit masterGeneration ${contextOptions.masterGeneration} does not match allocated shared generation ${sharedState.masterGeneration}`
        );
      }
      this.context = new RuntimeContext({
        ...contextOptions,
        settings,
        masterPid,
        masterGeneration: sharedState.masterGeneration
      });
    } catch (error) {
      try {
        sharedState.release(false);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Master Runtime context creation and shared-state cleanup both failed"
        );
      }
      throw error;
    }
    this.sharedState = sharedState;
    this.#initialize = initialize ?? (() => {
    });
    this.#hooks = Object.freeze({ ...hooks });
    this.#processSupervisorFactory = processSupervisorFactory;
    this.#networkServerFactory = networkServerFactory;
    this.stopped = this.#stoppedDeferred.promise;
    void this.stopped.catch(() => {
    });
    void this.#initializerCloseJoin.promise.catch(() => {
    });
    void this.#contextCloseStarted.promise.catch(() => {
    });
  }
  get state() {
    return this.#state;
  }
  start() {
    if (this.#stopPromise !== null) {
      return Promise.reject(
        new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          `Master Runtime cannot start while stopping from ${this.#state}`,
          { state: this.#state }
        )
      );
    }
    if (this.#startPromise !== null && (this.#state === MASTER_STATE.INITIALIZING || this.#state === MASTER_STATE.SPAWNING_CHILDREN || this.#state === MASTER_STATE.WAITING_READY || this.#state === MASTER_STATE.LISTENING || this.#state === MASTER_STATE.RUNNING)) {
      return this.#startPromise;
    }
    if (this.#state !== MASTER_STATE.CREATED) {
      return Promise.reject(
        new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          `Master Runtime cannot start from ${this.#state}`,
          { state: this.#state }
        )
      );
    }
    if (this.context.signal.aborted) {
      const error = this.#abortError("Master Runtime was aborted before initialization");
      this.#startPromise = this.#rejectStartAndStop(error);
      return this.#startPromise;
    }
    const startedAt = this.context.clock.monotonicTimeMs();
    this.#transition(MASTER_STATE.INITIALIZING);
    this.#attachAbortListener();
    if (this.context.signal.aborted) {
      const error = this.#abortError("Master Runtime was aborted during initialization");
      this.#startPromise = this.#rejectStartAndStop(error);
      return this.#startPromise;
    }
    const initialization = Promise.resolve().then(async () => {
      if (this.#stopPromise !== null || this.context.signal.aborted) {
        return;
      }
      const invocation = {
        active: true,
        token: this.#initializerToken,
        stoppingHook: false
      };
      try {
        await activeInitializer.run(invocation, () => this.#initialize(this.context));
      } finally {
        invocation.active = false;
      }
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted during initialization");
      }
      const processSupervisor = this.#processSupervisorFactory(
        this.context,
        this.sharedState
      );
      this.#processSupervisor = processSupervisor;
      if (this.context.signal.aborted) {
        const abortError = this.#abortError(
          "Master Runtime was aborted before spawning children"
        );
        try {
          await processSupervisor.close(this.context.signal.reason);
        } catch (cleanupError) {
          throw new AggregateError(
            [abortError, cleanupError],
            "Master Runtime abort and ProcessSupervisor cleanup both failed"
          );
        }
        throw abortError;
      }
      try {
        this.context.registerResource(
          "runtime.process-supervisor",
          processSupervisor
        );
      } catch (error) {
        try {
          await processSupervisor.close(error);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Master ProcessSupervisor registration and cleanup both failed"
          );
        }
        throw error;
      }
      this.#transition(MASTER_STATE.SPAWNING_CHILDREN);
      try {
        await processSupervisor.spawnAll();
      } catch (error) {
        if (this.context.signal.aborted) {
          throw this.#abortError("Master Runtime was aborted while spawning children");
        }
        throw error;
      }
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted while spawning children");
      }
      this.#transition(MASTER_STATE.WAITING_READY);
      try {
        await processSupervisor.waitUntilReady();
      } catch (error) {
        if (this.context.signal.aborted) {
          throw this.#abortError("Master Runtime was aborted while waiting for children");
        }
        throw error;
      }
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted while waiting for children");
      }
      this.#managerStarted = true;
      await this.#invokeLifecycleHook(this.#hooks.onManagerStart);
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted during onManagerStart");
      }
      const networkServer = this.#networkServerFactory(
        this.context,
        processSupervisor,
        this.sharedState
      );
      this.#networkServer = networkServer;
      if (this.context.signal.aborted) {
        const abortError = this.#abortError(
          "Master Runtime was aborted before starting the network listener"
        );
        try {
          await networkServer.close(this.context.signal.reason);
        } catch (cleanupError) {
          throw new AggregateError(
            [abortError, cleanupError],
            "Master Runtime abort and NetworkServer cleanup both failed"
          );
        }
        throw abortError;
      }
      try {
        this.context.registerResource("runtime.network-server", networkServer);
      } catch (error) {
        try {
          await networkServer.close(error);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Master NetworkServer registration and cleanup both failed"
          );
        }
        throw error;
      }
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted before listening");
      }
      this.#transition(MASTER_STATE.LISTENING);
      try {
        await networkServer.listen();
      } catch (error) {
        if (this.context.signal.aborted) {
          throw this.#abortError("Master Runtime was aborted while listening");
        }
        throw error;
      }
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted while listening");
      }
      this.#listenerStarted = true;
      await this.#invokeLifecycleHook(this.#hooks.onStart);
      if (this.context.signal.aborted) {
        throw this.#abortError("Master Runtime was aborted during onStart");
      }
      this.#transition(MASTER_STATE.RUNNING);
      this.#attachSignalListeners();
    });
    this.#initializationDone = initialization.then(
      () => {
      },
      () => {
      }
    );
    this.#startPromise = (async () => {
      try {
        await initialization;
        if (this.context.signal.aborted) {
          throw this.#abortError("Master Runtime was aborted during initialization");
        }
        const duration = this.#elapsedSince(startedAt);
        this.context.metrics.recordStart(duration);
        this.context.log("info", "runtime.master.initialized", {
          state: this.#state,
          durationMs: duration
        });
        return this.context;
      } catch (error) {
        this.context.metrics.recordError();
        this.context.log("error", "runtime.master.initialization_failed", describeError3(error));
        try {
          await this.stop(error);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Master Runtime initialization and cleanup both failed"
          );
        }
        throw error;
      }
    })();
    return this.#startPromise;
  }
  stop(reason) {
    const resourceJoin = this.context.closeFromResourceDisposer(reason);
    const callbackJoin = resourceJoin === void 0 ? this.context.joinCloseFromCallback() : void 0;
    const invocation = activeInitializer.getStore();
    const calledFromInitializer = invocation?.active === true && invocation.token === this.#initializerToken && !invocation.stoppingHook;
    const calledFromStoppingHook = invocation?.active === true && invocation.token === this.#initializerToken && invocation.stoppingHook;
    if (this.#stopPromise !== null) {
      if (calledFromStoppingHook) {
        return Promise.resolve();
      }
      if (callbackJoin !== void 0) {
        return Promise.all([
          callbackJoin,
          this.#contextCloseStarted.promise
        ]).then(() => void 0);
      }
      if (resourceJoin !== void 0) {
        return resourceJoin;
      }
      if (calledFromInitializer && this.#state === MASTER_STATE.STOPPING) {
        return Promise.resolve();
      }
      return calledFromInitializer ? this.#initializerCloseJoin.promise : this.#stopPromise;
    }
    const stopReason = reason ?? new RuntimeAbortError("Master Runtime is stopping");
    this.#stopPromise = activeInitializer.exit(
      () => Promise.resolve().then(() => this.#performStop(stopReason))
    );
    const stopPromise = this.#stopPromise;
    void stopPromise.then(
      () => this.#stoppedDeferred.resolve(),
      (error) => this.#stoppedDeferred.reject(error)
    );
    this.context.requestStop(stopReason);
    if (callbackJoin !== void 0) {
      return Promise.all([
        callbackJoin,
        this.#contextCloseStarted.promise
      ]).then(() => void 0);
    }
    if (resourceJoin !== void 0) {
      return resourceJoin;
    }
    return calledFromInitializer ? this.#initializerCloseJoin.promise : stopPromise;
  }
  close(reason) {
    return this.stop(reason);
  }
  async #performStop(stopReason) {
    const stoppedAt = this.context.clock.monotonicTimeMs();
    const gracefulRuntimeStop = this.#state === MASTER_STATE.RUNNING;
    if (this.#state !== MASTER_STATE.STOPPING) {
      this.#transition(MASTER_STATE.STOPPING);
    }
    this.#detachAbortListener();
    this.#detachSignalListeners();
    const failures = [];
    let contextClose = null;
    const beginContextClose = () => {
      if (contextClose !== null) {
        return contextClose;
      }
      contextClose = this.context.closeGlobally(stopReason);
      this.#contextCloseStarted.resolve();
      void contextClose.catch(() => {
      });
      void contextClose.then(
        () => this.#initializerCloseJoin.resolve(),
        (error) => this.#initializerCloseJoin.reject(error)
      );
      return contextClose;
    };
    if (!gracefulRuntimeStop) {
      beginContextClose();
    }
    if (this.#initializationDone !== null) {
      await this.#initializationDone;
    }
    let beforeEventWorkerShutdownInvoked = false;
    const beforeEventWorkerShutdown = async () => {
      if (beforeEventWorkerShutdownInvoked) {
        return;
      }
      beforeEventWorkerShutdownInvoked = true;
      if (this.#managerStarted && !this.#managerStopped) {
        this.#managerStopped = true;
        await this.#collectLifecycleHookFailure(
          failures,
          "onManagerStop",
          this.#hooks.onManagerStop
        );
      }
      const closeConnections = this.#networkServer?.closeConnections;
      if (closeConnections !== void 0) {
        try {
          await closeConnections.call(this.#networkServer, stopReason);
        } catch (error) {
          failures.push(error);
        }
      }
    };
    if (gracefulRuntimeStop) {
      const stopAccepting = this.#networkServer?.stopAccepting;
      if (stopAccepting !== void 0) {
        try {
          await stopAccepting.call(this.#networkServer, stopReason);
        } catch (error) {
          failures.push(error);
        }
      }
      const processSupervisor = this.#processSupervisor;
      if (processSupervisor?.stop !== void 0) {
        try {
          await processSupervisor.stop(stopReason, { beforeEventWorkerShutdown });
        } catch (error) {
          failures.push(error);
        }
      }
      await beforeEventWorkerShutdown();
      beginContextClose();
    }
    try {
      await beginContextClose();
    } catch (error) {
      failures.push(error);
      try {
        this.context.metrics.recordError();
      } catch {
      }
    }
    if (!gracefulRuntimeStop) {
      await beforeEventWorkerShutdown();
    }
    if (this.#listenerStarted) {
      await this.#collectLifecycleHookFailure(
        failures,
        "onShutdown",
        this.#hooks.onShutdown
      );
    }
    try {
      this.sharedState.release(gracefulRuntimeStop && failures.length === 0);
    } catch (error) {
      failures.push(error);
    }
    this.#transition(MASTER_STATE.STOPPED);
    this.context.metrics.recordStop(this.#elapsedSince(stoppedAt));
    if (failures.length === 1) {
      this.context.log("error", "runtime.master.cleanup_failed", describeError3(failures[0]));
      throw failures[0];
    }
    if (failures.length > 1) {
      const error = new AggregateError(
        failures,
        "Master Runtime cleanup and lifecycle hooks failed"
      );
      this.context.log("error", "runtime.master.cleanup_failed", describeError3(error));
      throw error;
    }
  }
  async #invokeLifecycleHook(hook, stoppingHook = false) {
    if (hook === void 0) {
      return;
    }
    const invocation = {
      active: true,
      token: this.#initializerToken,
      stoppingHook
    };
    try {
      await activeInitializer.run(invocation, () => hook(this.context));
    } finally {
      invocation.active = false;
    }
  }
  async #collectLifecycleHookFailure(failures, hookName, hook) {
    try {
      await this.#invokeLifecycleHook(hook, true);
    } catch (error) {
      failures.push(error);
      try {
        this.context.metrics.recordError();
      } catch {
      }
      this.context.log("error", "runtime.master.lifecycle_hook_failed", {
        hook: hookName,
        ...describeError3(error)
      });
    }
  }
  async #rejectStartAndStop(error) {
    this.context.metrics.recordError();
    this.context.log("warn", "runtime.master.initialization_aborted", describeError3(error));
    try {
      await this.stop(error.reason);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Master Runtime abort and cleanup both failed"
      );
    }
    throw error;
  }
  #transition(next) {
    const previous = this.#state;
    assertMasterTransition(previous, next);
    this.#state = next;
    this.context.metrics.setState(next);
    this.context.log("debug", "runtime.master.state_changed", {
      from: previous,
      to: next
    });
  }
  #attachAbortListener() {
    if (this.#abortListenerAttached) {
      return;
    }
    this.context.signal.addEventListener("abort", this.#onAbort, { once: true });
    this.#abortListenerAttached = true;
  }
  #detachAbortListener() {
    if (!this.#abortListenerAttached) {
      return;
    }
    this.context.signal.removeEventListener("abort", this.#onAbort);
    this.#abortListenerAttached = false;
  }
  #attachSignalListeners() {
    if (this.#signalListenersAttached) {
      return;
    }
    process.on("SIGTERM", this.#onSigterm);
    process.on("SIGUSR1", this.#onSigusr1);
    process.on("SIGUSR2", this.#onSigusr2);
    this.#signalListenersAttached = true;
  }
  #detachSignalListeners() {
    if (!this.#signalListenersAttached) {
      return;
    }
    process.off("SIGTERM", this.#onSigterm);
    process.off("SIGUSR1", this.#onSigusr1);
    process.off("SIGUSR2", this.#onSigusr2);
    this.#signalListenersAttached = false;
  }
  #requestSignalReload(onlyTaskWorkers, signal) {
    try {
      const receipt = this.#processSupervisor?.requestReload?.(
        onlyTaskWorkers,
        `Master Runtime received ${signal}`
      );
      if (receipt === void 0) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          `Master Runtime cannot handle ${signal} before the process pool is ready`
        );
      }
      void receipt.completion.catch((error) => {
        this.context.log("error", "runtime.master.signal_reload_failed", {
          signal,
          ...describeError3(error)
        });
      });
    } catch (error) {
      this.context.metrics.recordError();
      this.context.log("error", "runtime.master.signal_reload_rejected", {
        signal,
        ...describeError3(error)
      });
    }
  }
  #abortError(message) {
    return new RuntimeAbortError(message, this.context.signal.reason);
  }
  #elapsedSince(startedAt) {
    return Math.max(0, this.context.clock.monotonicTimeMs() - startedAt);
  }
};

// src/process/node-parent-process-adapter.ts
function createDeferred7() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function channelClosedError3(cause) {
  return cause === void 0 ? new Error("parent IPC channel is closed") : new Error("parent IPC channel is closed", { cause });
}
function hasActiveParentProcessChannel(parent = process) {
  return parent.connected && parent.send !== void 0;
}
var NodeParentProcessEndpoint = class {
  closed;
  ownsReceivedMessages = true;
  #parent;
  #compactIpcEnvelopes;
  #closedDeferred = createDeferred7();
  #messageListeners = /* @__PURE__ */ new Set();
  #pendingSends = /* @__PURE__ */ new Set();
  #closedSettled = false;
  constructor(parent = process, compactIpcEnvelopes = parent === process && process.env.ALLOY_CORE_COMPACT_IPC === "1") {
    this.#parent = parent;
    this.#compactIpcEnvelopes = compactIpcEnvelopes;
    this.closed = this.#closedDeferred.promise;
    if (!hasActiveParentProcessChannel(parent)) {
      this.#settleClosed({ reason: "not-connected" });
      return;
    }
    parent.on("message", this.#onMessage);
    parent.once("disconnect", this.#onDisconnect);
    if (!parent.connected) {
      this.#onDisconnect();
    }
  }
  get connected() {
    return !this.#closedSettled && this.#parent.connected;
  }
  startSend(message) {
    const send = this.#parent.send;
    if (!this.connected || send === void 0) {
      return Object.freeze({
        backpressured: false,
        completed: Promise.reject(channelClosedError3())
      });
    }
    const deferred = createDeferred7();
    this.#pendingSends.add(deferred);
    let settled = false;
    const settle = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      this.#pendingSends.delete(deferred);
      if (error === null) {
        deferred.resolve();
      } else {
        deferred.reject(error);
      }
    };
    let accepted = true;
    try {
      accepted = send.call(
        this.#parent,
        this.#compactIpcEnvelopes ? encodeNodeIpcWireMessage(message) : message,
        settle
      );
    } catch (error) {
      settle(error instanceof Error ? error : new Error("parent IPC send failed", {
        cause: error
      }));
    }
    return Object.freeze({
      backpressured: !accepted,
      completed: deferred.promise
    });
  }
  onMessage(listener) {
    if (this.#closedSettled) {
      return () => {
      };
    }
    this.#messageListeners.add(listener);
    return () => {
      this.#messageListeners.delete(listener);
    };
  }
  disconnect() {
    if (this.#closedSettled) {
      return;
    }
    if (!this.#parent.connected) {
      this.#settleClosed({ reason: "disconnect" });
      return;
    }
    try {
      this.#parent.disconnect();
    } catch (error) {
      this.#settleClosed({ reason: "disconnect-failed", error });
    }
  }
  #onMessage = (message) => {
    if (this.#closedSettled) {
      return;
    }
    const decoded = this.#compactIpcEnvelopes ? decodeNodeIpcWireMessage(message) : message;
    for (const listener of [...this.#messageListeners]) {
      listener(decoded);
    }
  };
  #onDisconnect = () => {
    this.#settleClosed({ reason: "disconnect" });
  };
  #settleClosed(result) {
    if (this.#closedSettled) {
      return;
    }
    this.#closedSettled = true;
    this.#parent.removeListener("message", this.#onMessage);
    this.#parent.removeListener("disconnect", this.#onDisconnect);
    this.#messageListeners.clear();
    const error = channelClosedError3(result.error);
    for (const pending of this.#pendingSends) {
      pending.reject(error);
    }
    this.#pendingSends.clear();
    this.#closedDeferred.resolve(Object.freeze({ ...result }));
  }
};

// src/process/worker-entry.ts
import { randomUUID as randomUUID6 } from "node:crypto";

// src/dispatch/worker-network-event-receiver.ts
var NETWORK_EVENT_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  IPC_MESSAGE_TYPE.NET_CONNECT,
  IPC_MESSAGE_TYPE.NET_MESSAGE,
  IPC_MESSAGE_TYPE.NET_CLOSE,
  IPC_MESSAGE_TYPE.NET_BUFFER_STATE
]);
var WORKER_NETWORK_EVENT_REJECTION_REASON = Object.freeze({
  INVALID_SOURCE: "INVALID_SOURCE",
  INVALID_TARGET: "INVALID_TARGET",
  INVALID_METADATA: "INVALID_METADATA",
  MISSING_SESSION: "MISSING_SESSION",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  OWNER_MISMATCH: "OWNER_MISMATCH",
  DUPLICATE_SESSION: "DUPLICATE_SESSION",
  UNKNOWN_SESSION: "UNKNOWN_SESSION",
  DUPLICATE_SEQUENCE: "DUPLICATE_SEQUENCE",
  OUT_OF_ORDER_SEQUENCE: "OUT_OF_ORDER_SEQUENCE",
  PROTOCOL_MISMATCH: "PROTOCOL_MISMATCH",
  CLOSE_SEQUENCE_MISMATCH: "CLOSE_SEQUENCE_MISMATCH",
  INVALID_BUFFER_TRANSITION: "INVALID_BUFFER_TRANSITION"
});
var WorkerNetworkEventRejectedError = class extends Error {
  reason;
  messageType;
  sessionId;
  constructor(reason, envelope, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "WorkerNetworkEventRejectedError";
    this.reason = reason;
    this.messageType = envelope.messageType;
    this.sessionId = envelope.sessionId;
  }
};
var WorkerNetworkEventReceiver = class {
  localWorkerId;
  #sessions = /* @__PURE__ */ new Map();
  #connectListeners = /* @__PURE__ */ new Set();
  #messageListeners = /* @__PURE__ */ new Set();
  #closeListeners = /* @__PURE__ */ new Set();
  #bufferListeners = /* @__PURE__ */ new Set();
  #rejectionCounts = /* @__PURE__ */ new Map();
  #onMessageComplete;
  #disposeBusMessage;
  #closed = false;
  #acceptedConnects = 0;
  #acceptedMessages = 0;
  #completedMessages = 0;
  #acceptedCloses = 0;
  #acceptedBufferEvents = 0;
  #bufferFullEvents = 0;
  #bufferOverflowEvents = 0;
  #bufferEmptyEvents = 0;
  #ignoredEvents = 0;
  #rejectedEvents = 0;
  #callbackErrors = 0;
  constructor(options) {
    this.localWorkerId = createWorkerId(options.localWorkerId);
    const identity = options.bus.localIdentity;
    if (identity.role !== PROCESS_ROLE.WORKER || identity.workerId !== this.localWorkerId || identity.generation === null) {
      throw new TypeError(
        "WorkerNetworkEventReceiver requires the matching event Worker ProcessBus identity"
      );
    }
    this.#onMessageComplete = options.onMessageComplete;
    this.#disposeBusMessage = options.bus.onMessage(this.#handleEnvelope);
  }
  onConnect(listener) {
    return this.#addListener(this.#connectListeners, listener);
  }
  onMessage(listener) {
    return this.#addListener(this.#messageListeners, listener);
  }
  acceptNativeTcpMessage(sessionId, sequence, data) {
    if (this.#closed) {
      return;
    }
    const state = this.#sessions.get(sessionId);
    if (state === void 0) {
      throw new Error(
        `native NET_MESSAGE references unknown Session ${sessionId}`
      );
    }
    if (state.protocol !== "tcp") {
      throw new Error(
        `native NET_MESSAGE for Session ${sessionId} requires TCP`
      );
    }
    if (sequence < state.nextSequence) {
      this.#ignoredEvents += 1;
      return;
    }
    if (sequence !== state.nextSequence) {
      throw new Error(
        `native NET_MESSAGE for Session ${sessionId} expected sequence ${state.nextSequence}, got ${sequence}`
      );
    }
    state.nextSequence += 1;
    this.#acceptedMessages += 1;
    let completion;
    try {
      completion = this.#invokeListeners(this.#messageListeners, Object.freeze({
        type: "message",
        sessionId,
        sequence,
        payload: Object.freeze({
          protocol: "tcp",
          data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
          finish: true
        })
      }));
    } catch (error) {
      this.#completeMessage();
      throw error;
    }
    if (completion === void 0) {
      this.#completeMessage();
      return;
    }
    return completion.finally(() => this.#completeMessage());
  }
  acceptNativeTcpConnect(sessionId, sequence, payload) {
    return this.#acceptConnect(
      this.#createNativeEnvelope(
        IPC_MESSAGE_TYPE.NET_CONNECT,
        sessionId,
        sequence,
        payload
      ),
      sessionId
    );
  }
  acceptNativeTcpClose(sessionId, sequence, payload) {
    return this.#acceptClose(
      this.#createNativeEnvelope(
        IPC_MESSAGE_TYPE.NET_CLOSE,
        sessionId,
        sequence,
        payload
      ),
      sessionId
    );
  }
  acceptNativeTcpBuffer(sessionId, sequence, payload) {
    return this.#acceptBufferState(
      this.#createNativeEnvelope(
        IPC_MESSAGE_TYPE.NET_BUFFER_STATE,
        sessionId,
        sequence,
        payload
      ),
      sessionId
    );
  }
  onClose(listener) {
    return this.#addListener(this.#closeListeners, listener);
  }
  onBuffer(listener) {
    return this.#addListener(this.#bufferListeners, listener);
  }
  stats() {
    return Object.freeze({
      closed: this.#closed,
      activeSessions: this.#sessions.size,
      acceptedEvents: this.#acceptedConnects + this.#acceptedMessages + this.#acceptedCloses + this.#acceptedBufferEvents,
      acceptedConnects: this.#acceptedConnects,
      acceptedMessages: this.#acceptedMessages,
      completedMessages: this.#completedMessages,
      acceptedCloses: this.#acceptedCloses,
      acceptedBufferEvents: this.#acceptedBufferEvents,
      bufferFullEvents: this.#bufferFullEvents,
      bufferOverflowEvents: this.#bufferOverflowEvents,
      bufferEmptyEvents: this.#bufferEmptyEvents,
      ignoredEvents: this.#ignoredEvents,
      rejectedEvents: this.#rejectedEvents,
      callbackErrors: this.#callbackErrors,
      rejectionCounts: Object.freeze(
        Object.fromEntries(this.#rejectionCounts)
      )
    });
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#disposeBusMessage();
    this.#disposeBusMessage = () => {
    };
    this.#sessions.clear();
    this.#connectListeners.clear();
    this.#messageListeners.clear();
    this.#closeListeners.clear();
    this.#bufferListeners.clear();
  }
  #handleEnvelope = async (envelope) => {
    if (this.#closed) {
      return;
    }
    if (!NETWORK_EVENT_MESSAGE_TYPES.has(envelope.messageType)) {
      this.#ignoredEvents += 1;
      return;
    }
    this.#assertEnvelopeAddress(envelope);
    const sessionId = envelope.sessionId;
    if (sessionId === null) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.MISSING_SESSION,
        envelope,
        `${envelope.messageType} requires a Session ID`
      );
    }
    switch (envelope.messageType) {
      case IPC_MESSAGE_TYPE.NET_CONNECT:
        await this.#acceptConnect(envelope, sessionId);
        return;
      case IPC_MESSAGE_TYPE.NET_MESSAGE:
        await this.#acceptMessage(envelope, sessionId);
        return;
      case IPC_MESSAGE_TYPE.NET_CLOSE:
        await this.#acceptClose(envelope, sessionId);
        return;
      case IPC_MESSAGE_TYPE.NET_BUFFER_STATE:
        await this.#acceptBufferState(envelope, sessionId);
        return;
      default:
        return;
    }
  };
  #createNativeEnvelope(messageType, sessionId, sequence, payload) {
    return createIpcEnvelope({
      protocolVersion: IPC_PROTOCOL_VERSION,
      messageId: createMessageId(`native-${messageType}-${sessionId}-${sequence}`),
      messageType,
      sourceRole: PROCESS_ROLE.MASTER,
      sourceWorkerId: null,
      sourceGeneration: null,
      targetRole: PROCESS_ROLE.WORKER,
      targetWorkerId: this.localWorkerId,
      correlationId: null,
      sessionId,
      sequence,
      flags: 0,
      payload
    });
  }
  #assertEnvelopeAddress(envelope) {
    if (envelope.sourceRole !== PROCESS_ROLE.MASTER || envelope.sourceWorkerId !== null || envelope.sourceGeneration !== null) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_SOURCE,
        envelope,
        `${envelope.messageType} must originate from Master`
      );
    }
    if (envelope.targetRole !== PROCESS_ROLE.WORKER || envelope.targetWorkerId !== this.localWorkerId) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_TARGET,
        envelope,
        `${envelope.messageType} must target Worker ${this.localWorkerId}`
      );
    }
    if (envelope.correlationId !== null || envelope.flags !== 0) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_METADATA,
        envelope,
        `${envelope.messageType} cannot carry correlation or response flags`
      );
    }
  }
  #acceptConnect(envelope, sessionId) {
    if (this.#sessions.has(sessionId)) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.DUPLICATE_SESSION,
        envelope,
        `Session ${sessionId} already has an active NET_CONNECT`
      );
    }
    const payload = this.#decodeConnect(envelope);
    const resumed = isNetworkResumePayload(payload);
    if (!resumed && envelope.sequence !== 0) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.OUT_OF_ORDER_SEQUENCE,
        envelope,
        `NET_CONNECT for Session ${sessionId} requires sequence 0`
      );
    }
    if (resumed && envelope.sequence !== payload.inputSequence) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.OUT_OF_ORDER_SEQUENCE,
        envelope,
        `NET_CONNECT resume for Session ${sessionId} sequence ${envelope.sequence} does not match restored inputSequence ${payload.inputSequence}`
      );
    }
    this.#assertOwner(envelope, payload.ownerWorkerId);
    this.#sessions.set(sessionId, {
      protocol: payload.protocol,
      nextSequence: resumed ? payload.inputSequence + 1 : 1,
      bufferState: resumed ? payload.outputBufferState : "empty"
    });
    this.#acceptedConnects += 1;
    return this.#invokeListeners(this.#connectListeners, Object.freeze({
      type: "connect",
      sessionId,
      sequence: envelope.sequence,
      payload
    }));
  }
  #acceptMessage(envelope, sessionId) {
    const state = this.#requireSession(envelope, sessionId);
    this.#assertSequence(envelope, state.nextSequence);
    const payload = this.#decodeMessage(envelope);
    this.#assertProtocol(envelope, state.protocol, payload.protocol);
    state.nextSequence += 1;
    this.#acceptedMessages += 1;
    let completion;
    try {
      completion = this.#invokeListeners(this.#messageListeners, Object.freeze({
        type: "message",
        sessionId,
        sequence: envelope.sequence,
        payload
      }));
    } catch (error) {
      this.#completeMessage();
      throw error;
    }
    if (completion === void 0) {
      this.#completeMessage();
      return;
    }
    return completion.finally(() => this.#completeMessage());
  }
  #acceptClose(envelope, sessionId) {
    const state = this.#requireSession(envelope, sessionId);
    this.#assertSequence(envelope, state.nextSequence);
    const payload = this.#decodeClose(envelope);
    this.#assertOwner(envelope, payload.ownerWorkerId);
    this.#assertProtocol(envelope, state.protocol, payload.protocol);
    if (payload.inputSequence !== envelope.sequence - 1) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.CLOSE_SEQUENCE_MISMATCH,
        envelope,
        `NET_CLOSE for Session ${sessionId} has inconsistent final inputSequence`
      );
    }
    this.#sessions.delete(sessionId);
    this.#acceptedCloses += 1;
    return this.#invokeListeners(this.#closeListeners, Object.freeze({
      type: "close",
      sessionId,
      sequence: envelope.sequence,
      payload
    }));
  }
  #acceptBufferState(envelope, sessionId) {
    const session = this.#requireSession(envelope, sessionId);
    let payload;
    try {
      payload = decodeNetworkBufferStatePayload(envelope.payload);
    } catch (error) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_BUFFER_STATE payload is invalid",
        error
      );
    }
    this.#assertOwner(envelope, payload.ownerWorkerId);
    this.#assertProtocol(envelope, session.protocol, payload.protocol);
    this.#assertBufferTransition(envelope, session.bufferState, payload.state);
    session.bufferState = payload.state === NETWORK_BUFFER_STATE.EMPTY ? "empty" : payload.state;
    this.#acceptedBufferEvents += 1;
    if (payload.state === NETWORK_BUFFER_STATE.FULL) {
      this.#bufferFullEvents += 1;
    } else if (payload.state === NETWORK_BUFFER_STATE.OVERFLOW) {
      this.#bufferOverflowEvents += 1;
    } else {
      this.#bufferEmptyEvents += 1;
    }
    return this.#invokeListeners(this.#bufferListeners, Object.freeze({
      type: "buffer",
      sessionId,
      sequence: envelope.sequence,
      payload
    }));
  }
  #assertBufferTransition(envelope, previous, next) {
    const valid = previous === "empty" && next === NETWORK_BUFFER_STATE.FULL || previous === NETWORK_BUFFER_STATE.FULL && next === NETWORK_BUFFER_STATE.OVERFLOW || (previous === NETWORK_BUFFER_STATE.FULL || previous === NETWORK_BUFFER_STATE.OVERFLOW) && next === NETWORK_BUFFER_STATE.EMPTY;
    if (!valid) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_BUFFER_TRANSITION,
        envelope,
        `NET_BUFFER_STATE cannot transition from ${previous} to ${next}`
      );
    }
  }
  #decodeConnect(envelope) {
    try {
      return decodeNetworkConnectPayload(envelope.payload);
    } catch (error) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_CONNECT payload is invalid",
        error
      );
    }
  }
  #decodeMessage(envelope) {
    try {
      return decodeNetworkMessagePayload(envelope.payload);
    } catch (error) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_MESSAGE payload is invalid",
        error
      );
    }
  }
  #decodeClose(envelope) {
    try {
      return decodeNetworkClosePayload(envelope.payload);
    } catch (error) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.INVALID_PAYLOAD,
        envelope,
        "NET_CLOSE payload is invalid",
        error
      );
    }
  }
  #assertOwner(envelope, ownerWorkerId) {
    if (ownerWorkerId !== this.localWorkerId) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.OWNER_MISMATCH,
        envelope,
        `${envelope.messageType} owner does not match Worker ${this.localWorkerId}`
      );
    }
  }
  #assertProtocol(envelope, expected, actual) {
    if (actual !== expected) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.PROTOCOL_MISMATCH,
        envelope,
        `${envelope.messageType} protocol ${actual} does not match ${expected}`
      );
    }
  }
  #requireSession(envelope, sessionId) {
    const state = this.#sessions.get(sessionId);
    if (state === void 0) {
      this.#reject(
        WORKER_NETWORK_EVENT_REJECTION_REASON.UNKNOWN_SESSION,
        envelope,
        `${envelope.messageType} references unknown Session ${sessionId}`
      );
    }
    return state;
  }
  #assertSequence(envelope, expected) {
    if (envelope.sequence === expected) {
      return;
    }
    const reason = envelope.sequence < expected ? WORKER_NETWORK_EVENT_REJECTION_REASON.DUPLICATE_SEQUENCE : WORKER_NETWORK_EVENT_REJECTION_REASON.OUT_OF_ORDER_SEQUENCE;
    this.#reject(
      reason,
      envelope,
      `${envelope.messageType} sequence ${envelope.sequence} does not match ${expected}`
    );
  }
  #reject(reason, envelope, message, cause) {
    this.#rejectedEvents += 1;
    this.#rejectionCounts.set(reason, (this.#rejectionCounts.get(reason) ?? 0) + 1);
    throw new WorkerNetworkEventRejectedError(reason, envelope, message, cause);
  }
  #addListener(listeners, listener) {
    if (this.#closed) {
      return () => {
      };
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  #completeMessage() {
    this.#completedMessages += 1;
    try {
      this.#onMessageComplete?.(this.#completedMessages);
    } catch {
    }
  }
  #invokeListeners(listeners, event) {
    const snapshot = [...listeners];
    const failures = [];
    for (let index = 0; index < snapshot.length; index += 1) {
      try {
        const completion = snapshot[index](event);
        if (completion !== void 0) {
          return this.#continueInvokingListeners(
            snapshot,
            event,
            index + 1,
            completion,
            failures
          );
        }
      } catch (error) {
        failures.push(error);
      }
    }
    this.#finishListenerFailures(failures);
  }
  async #continueInvokingListeners(listeners, event, index, pending, failures) {
    let completion = pending;
    for (; ; ) {
      try {
        await completion;
      } catch (error) {
        failures.push(error);
      }
      completion = void 0;
      while (index < listeners.length) {
        try {
          const result = listeners[index++](event);
          if (result !== void 0) {
            completion = result;
            break;
          }
        } catch (error) {
          failures.push(error);
        }
      }
      if (completion === void 0) {
        this.#finishListenerFailures(failures);
        return;
      }
    }
  }
  #finishListenerFailures(failures) {
    this.#callbackErrors += failures.length;
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "Worker network event callbacks failed");
    }
  }
};

// src/dispatch/worker-network-command-sender.ts
var DEFAULT_NETWORK_COMMAND_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
function invalidSessionError(sessionId) {
  let rendered = "<unprintable>";
  try {
    rendered = String(sessionId);
  } catch {
  }
  return new FrameworkError(
    FRAMEWORK_ERROR_CODE.INVALID_SESSION,
    `invalid Session ID: ${rendered}`
  );
}
function invalidArgumentError(message) {
  return new FrameworkError(FRAMEWORK_ERROR_CODE.INVALID_STATE, message);
}
function asCommandErrorCode(error) {
  try {
    if (error instanceof FrameworkError) {
      return error.code;
    }
  } catch {
  }
  return FRAMEWORK_ERROR_CODE.INVALID_STATE;
}
var WorkerNetworkCommandSender = class {
  #bus;
  #onDeliveryError;
  #maxPayloadBytes;
  #nativeDataPlane;
  #sharedState;
  #overflowSessions = /* @__PURE__ */ new Set();
  #sealed = false;
  #acceptedCommands = 0;
  #rejectedCommands = 0;
  #deliveryErrors = 0;
  #overflowRejections = 0;
  #lastError = null;
  constructor(options) {
    const identity = options.bus.localIdentity;
    if (identity.role !== PROCESS_ROLE.WORKER && identity.role !== PROCESS_ROLE.TASK_WORKER && identity.role !== PROCESS_ROLE.USER_TASK_WORKER || identity.workerId === null || identity.generation === null) {
      throw new TypeError(
        "WorkerNetworkCommandSender requires a supervised Worker ProcessBus"
      );
    }
    this.#bus = options.bus;
    this.#sharedState = options.sharedState;
    this.#onDeliveryError = options.onDeliveryError;
    this.#nativeDataPlane = options.nativeDataPlane;
    this.#maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_NETWORK_COMMAND_MAX_PAYLOAD_BYTES;
    if (!Number.isSafeInteger(this.#maxPayloadBytes) || this.#maxPayloadBytes < 1) {
      throw new RangeError("maxPayloadBytes must be a positive safe integer");
    }
  }
  push(sessionId, data, opcode = WEB_SOCKET_OPCODE.TEXT) {
    return this.#admit(
      sessionId,
      () => encodeNetworkSendCommandPayload({
        protocol: "websocket",
        data: this.#requireData(data, true),
        opcode
      })
    );
  }
  send(sessionId, data) {
    try {
      const value = this.#requireData(data, false);
      return this.#admit(
        sessionId,
        () => encodeNetworkSendCommandPayload({
          protocol: "tcp",
          data: value
        }),
        IPC_MESSAGE_TYPE.NET_SEND,
        typeof value === "string" ? Buffer.from(value) : value
      );
    } catch (error) {
      this.#rejectedCommands += 1;
      this.#recordSharedRejection();
      this.#lastError = asCommandErrorCode(error);
      return false;
    }
  }
  close(sessionId, code = 1e3, reason = "") {
    return this.#admit(
      sessionId,
      () => encodeNetworkCloseCommandPayload(code, reason),
      IPC_MESSAGE_TYPE.NET_CLOSE_COMMAND,
      null
    );
  }
  getLastError() {
    return this.#lastError;
  }
  stats() {
    return Object.freeze({
      sealed: this.#sealed,
      acceptedCommands: this.#acceptedCommands,
      rejectedCommands: this.#rejectedCommands,
      deliveryErrors: this.#deliveryErrors,
      overflowSessions: this.#overflowSessions.size,
      overflowRejections: this.#overflowRejections,
      lastError: this.#lastError
    });
  }
  seal(_reason) {
    this.#sealed = true;
  }
  setOutputOverflow(sessionId, overflow) {
    if (!isSessionId(sessionId)) {
      throw invalidSessionError(sessionId);
    }
    if (overflow) {
      this.#overflowSessions.add(sessionId);
    } else {
      this.#overflowSessions.delete(sessionId);
    }
  }
  forgetSession(sessionId) {
    this.#overflowSessions.delete(sessionId);
  }
  #admit(sessionId, createPayload2, messageType = IPC_MESSAGE_TYPE.NET_SEND, nativePayload) {
    try {
      if (this.#sealed) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
          "Worker network command sender is sealed"
        );
      }
      if (!isSessionId(sessionId)) {
        throw invalidSessionError(sessionId);
      }
      const sharedProbe = this.#sharedState?.probeConnectionAdmission?.(sessionId) ?? this.#sharedState?.probeConnection(sessionId);
      if (sharedProbe !== void 0 && sharedProbe.status !== "open") {
        const code = sharedProbe.status === "stale" ? FRAMEWORK_ERROR_CODE.STALE_GENERATION : sharedProbe.status === "closed" ? FRAMEWORK_ERROR_CODE.SESSION_CLOSED : sharedProbe.status === "unknown" ? FRAMEWORK_ERROR_CODE.INVALID_SESSION : FRAMEWORK_ERROR_CODE.INVALID_STATE;
        throw new FrameworkError(
          code,
          `Session ${sessionId} failed shared network command precheck: ${sharedProbe.status}`,
          { sessionId, sharedStatus: sharedProbe.status }
        );
      }
      const outputOverflow = (sharedProbe !== void 0 && "overflow" in sharedProbe ? sharedProbe.overflow : sharedProbe?.record?.overflow) ?? (this.#sharedState === void 0 && this.#overflowSessions.has(sessionId));
      if (messageType === IPC_MESSAGE_TYPE.NET_SEND && outputOverflow) {
        this.#overflowRejections += 1;
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.OUTPUT_BUFFER_OVERFLOW,
          `Session ${sessionId} output buffer is overflowed`,
          { sessionId }
        );
      }
      if (this.#nativeDataPlane !== void 0 && nativePayload !== void 0) {
        if (nativePayload !== null && nativePayload.byteLength > this.#maxPayloadBytes) {
          throw new FrameworkError(
            FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
            `network command payload exceeds buffer_output_size ${this.#maxPayloadBytes}`,
            {
              byteLength: nativePayload.byteLength,
              maxPayloadBytes: this.#maxPayloadBytes
            }
          );
        }
        const result = nativePayload === null ? this.#nativeDataPlane.closeSession(sessionId) : this.#nativeDataPlane.send(sessionId, nativePayload);
        if (!result.accepted) {
          throw new FrameworkError(
            result.backpressured ? FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL : FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
            result.backpressured ? "Rust Worker data-plane queue is full" : "Rust Worker data-plane channel is unavailable",
            { sessionId }
          );
        }
        this.#acceptedCommands += 1;
        this.#lastError = null;
        return true;
      }
      const payload = createPayload2();
      if (messageType === IPC_MESSAGE_TYPE.NET_SEND && payload instanceof Uint8Array && payload.byteLength - NETWORK_SEND_HEADER_BYTES > this.#maxPayloadBytes) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
          `network command payload exceeds buffer_output_size ${this.#maxPayloadBytes}`,
          {
            byteLength: payload.byteLength - NETWORK_SEND_HEADER_BYTES,
            maxPayloadBytes: this.#maxPayloadBytes
          }
        );
      }
      const receipt = this.#bus.enqueue({
        messageType,
        targetRole: PROCESS_ROLE.MASTER,
        targetWorkerId: null,
        sessionId,
        payload,
        ownsPayload: true
      });
      void receipt.completion.catch((error) => {
        this.#deliveryErrors += 1;
        try {
          this.#onDeliveryError?.(error);
        } catch {
        }
      });
      this.#acceptedCommands += 1;
      this.#lastError = null;
      return true;
    } catch (error) {
      this.#rejectedCommands += 1;
      this.#recordSharedRejection();
      this.#lastError = asCommandErrorCode(error);
      return false;
    }
  }
  #recordSharedRejection() {
    const addStat = this.#sharedState?.addStat;
    if (typeof addStat !== "function") {
      return;
    }
    try {
      addStat.call(
        this.#sharedState,
        SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_REJECTION
      );
    } catch {
    }
  }
  #requireData(data, allowEmpty) {
    if (typeof data !== "string" && !(data instanceof Uint8Array)) {
      throw invalidArgumentError("network command data must be a string or Uint8Array");
    }
    if (!allowEmpty && (typeof data === "string" ? data.length === 0 : data.byteLength === 0)) {
      throw invalidArgumentError("network command data must not be empty");
    }
    return data;
  }
};

// src/task/worker-task-runtime.ts
import { AsyncLocalStorage as AsyncLocalStorage7 } from "node:async_hooks";
import { randomUUID as randomUUID4 } from "node:crypto";
var DEFAULT_WORKER_TASK_RUNTIME_MAX_PENDING_TASKS = 1024;
function assertPoolSize2(name, value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
}
function asFrameworkErrorCode(error) {
  try {
    if (error instanceof FrameworkError) {
      return error.code;
    }
  } catch {
  }
  return FRAMEWORK_ERROR_CODE.INVALID_STATE;
}
function closedError(message) {
  return new FrameworkError(FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED, message);
}
function createDeferred8() {
  let resolve4;
  const promise = new Promise((resolvePromise) => {
    resolve4 = resolvePromise;
  });
  return { promise, resolve: resolve4 };
}
var WorkerTaskRuntime = class {
  #bus;
  #workerNum;
  #taskWorkerNum;
  #maxPendingTasks;
  #localWorkerId;
  #localGeneration;
  #localTaskWorkerId;
  #onDeliveryError;
  #taskHandlers = /* @__PURE__ */ new Set();
  #finishHandlers = /* @__PURE__ */ new Set();
  #pendingTasks = /* @__PURE__ */ new Map();
  #activeTask = new AsyncLocalStorage7();
  #completionRetryTail = Promise.resolve();
  #pendingTasksDrain;
  #disposeBusMessage;
  #nextTaskId = 0;
  #closed = false;
  #sealed = false;
  #newTasksSealed = false;
  #acceptedTasks = 0;
  #rejectedTasks = 0;
  #pendingTaskRejections = 0;
  #receivedTasks = 0;
  #admittedFinishes = 0;
  #receivedFinishes = 0;
  #completionAcks = 0;
  #abandonedTasks = 0;
  #callbackErrors = 0;
  #rejectedMessages = 0;
  #deliveryErrors = 0;
  #completionRetries = 0;
  #failedCompletions = 0;
  #lastError = null;
  constructor(options) {
    assertPoolSize2("workerNum", options.workerNum, 1);
    assertPoolSize2("taskWorkerNum", options.taskWorkerNum, 0);
    const userTaskWorkerNum = options.userTaskWorkerNum ?? 0;
    assertPoolSize2("userTaskWorkerNum", userTaskWorkerNum, 0);
    const maxPendingTasks = options.maxPendingTasks ?? DEFAULT_WORKER_TASK_RUNTIME_MAX_PENDING_TASKS;
    assertPoolSize2("maxPendingTasks", maxPendingTasks, 0);
    const identity = options.bus.localIdentity;
    if (identity.role !== PROCESS_ROLE.WORKER && identity.role !== PROCESS_ROLE.TASK_WORKER && identity.role !== PROCESS_ROLE.USER_TASK_WORKER || identity.workerId === null || identity.generation === null) {
      throw new TypeError(
        "WorkerTaskRuntime requires a supervised Worker ProcessBus identity"
      );
    }
    const configuredSize = options.workerNum + options.taskWorkerNum + userTaskWorkerNum;
    if (!Number.isSafeInteger(configuredSize) || identity.workerId >= configuredSize) {
      throw new TypeError("WorkerTaskRuntime identity is outside the configured process pool");
    }
    if (identity.role === PROCESS_ROLE.WORKER && !isEventWorkerId(identity.workerId, options.workerNum)) {
      throw new TypeError("WorkerTaskRuntime Worker identity is outside the Event Worker pool");
    }
    if (identity.role === PROCESS_ROLE.TASK_WORKER && identity.workerId < options.workerNum) {
      throw new TypeError("WorkerTaskRuntime Task Worker identity is outside the Task pool");
    }
    this.#bus = options.bus;
    this.#workerNum = options.workerNum;
    this.#taskWorkerNum = options.taskWorkerNum;
    this.#maxPendingTasks = maxPendingTasks;
    this.#localWorkerId = identity.workerId;
    this.#localGeneration = identity.generation;
    this.#localTaskWorkerId = identity.role === PROCESS_ROLE.TASK_WORKER ? toTaskWorkerId(options.workerNum, identity.workerId, options.taskWorkerNum) : null;
    this.#onDeliveryError = options.onDeliveryError;
    this.#disposeBusMessage = options.bus.onMessage(this.#handleEnvelope);
  }
  task(data, taskWorkerId) {
    try {
      if (this.#sealed || this.#newTasksSealed) {
        throw closedError("Worker task sender is sealed");
      }
      if (this.#bus.localIdentity.role !== PROCESS_ROLE.WORKER) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          "Task Workers cannot dispatch another task"
        );
      }
      if (this.#taskWorkerNum === 0) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
          "No Task Workers are configured"
        );
      }
      const requestedTaskWorkerId = taskWorkerId === void 0 ? null : this.#requireTaskWorkerId(taskWorkerId);
      if (this.#pendingTasks.size >= this.#maxPendingTasks) {
        this.#pendingTaskRejections += 1;
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
          "Worker task pending capacity is full",
          {
            maxPendingTasks: this.#maxPendingTasks,
            pendingTasks: this.#pendingTasks.size
          }
        );
      }
      if (this.#nextTaskId >= Number.MAX_SAFE_INTEGER) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          "Worker task ID sequence is exhausted"
        );
      }
      const taskId = this.#nextTaskId;
      const dispatchMessageId = createMessageId(
        `task:${this.#localWorkerId}:${this.#localGeneration}:${taskId}:${randomUUID4()}`
      );
      const receipt = this.#bus.enqueue({
        messageType: IPC_MESSAGE_TYPE.TASK_DISPATCH,
        targetRole: PROCESS_ROLE.MASTER,
        targetWorkerId: null,
        messageId: dispatchMessageId,
        payload: encodeWorkerTaskDispatchPayload({
          taskId,
          sourceWorkerId: this.#localWorkerId,
          sourceGeneration: this.#localGeneration,
          requestedTaskWorkerId,
          data
        })
      });
      this.#pendingTasks.set(taskId, { dispatchMessageId });
      this.#nextTaskId += 1;
      this.#acceptedTasks += 1;
      this.#lastError = null;
      this.#observeDelivery(receipt.completion, () => {
        if (this.#pendingTasks.get(taskId)?.dispatchMessageId === dispatchMessageId) {
          this.#pendingTasks.delete(taskId);
          this.#abandonedTasks += 1;
          this.#settlePendingTasksDrain();
        }
      });
      return taskId;
    } catch (error) {
      this.#rejectedTasks += 1;
      this.#lastError = asFrameworkErrorCode(error);
      return false;
    }
  }
  finish(result) {
    try {
      if (this.#sealed) {
        throw closedError("Worker task runtime is sealed");
      }
      if (this.#bus.localIdentity.role !== PROCESS_ROLE.TASK_WORKER) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          "finish() is only available inside a Task Worker callback"
        );
      }
      const execution = this.#activeTask.getStore();
      if (execution === void 0 || execution.finished) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          execution === void 0 ? "finish() requires an active Task callback" : "Task callback has already finished"
        );
      }
      this.#enqueueFinish(execution, true, result);
      this.#lastError = null;
      return true;
    } catch (error) {
      this.#lastError = asFrameworkErrorCode(error);
      return false;
    }
  }
  onTask(handler) {
    return this.#addListener(this.#taskHandlers, handler);
  }
  onFinish(handler) {
    return this.#addListener(this.#finishHandlers, handler);
  }
  getLastError() {
    return this.#lastError;
  }
  sealNewTasks(_reason) {
    this.#newTasksSealed = true;
  }
  seal(_reason) {
    this.#newTasksSealed = true;
    this.#sealed = true;
  }
  stats() {
    return Object.freeze({
      closed: this.#closed,
      sealed: this.#sealed,
      newTasksSealed: this.#newTasksSealed,
      pendingTasks: this.#pendingTasks.size,
      maxPendingTasks: this.#maxPendingTasks,
      pendingTaskRejections: this.#pendingTaskRejections,
      acceptedTasks: this.#acceptedTasks,
      rejectedTasks: this.#rejectedTasks,
      receivedTasks: this.#receivedTasks,
      admittedFinishes: this.#admittedFinishes,
      receivedFinishes: this.#receivedFinishes,
      completionAcks: this.#completionAcks,
      abandonedTasks: this.#abandonedTasks,
      callbackErrors: this.#callbackErrors,
      rejectedMessages: this.#rejectedMessages,
      deliveryErrors: this.#deliveryErrors,
      completionRetries: this.#completionRetries,
      failedCompletions: this.#failedCompletions,
      lastError: this.#lastError
    });
  }
  async drain() {
    while (true) {
      const retry = this.#completionRetryTail;
      await retry;
      if (retry === this.#completionRetryTail) {
        return;
      }
    }
  }
  drainPendingTasks() {
    if (this.#pendingTasks.size === 0) {
      return Promise.resolve();
    }
    this.#pendingTasksDrain ??= createDeferred8();
    return this.#pendingTasksDrain.promise;
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.seal();
    this.#disposeBusMessage();
    this.#disposeBusMessage = () => {
    };
    this.#abandonedTasks += this.#pendingTasks.size;
    this.#pendingTasks.clear();
    this.#settlePendingTasksDrain();
    this.#taskHandlers.clear();
    this.#finishHandlers.clear();
  }
  #handleEnvelope = async (envelope) => {
    if (this.#closed) {
      return;
    }
    if (envelope.messageType === IPC_MESSAGE_TYPE.TASK_DISPATCH) {
      await this.#acceptTaskDispatch(envelope);
      return;
    }
    if (envelope.messageType === IPC_MESSAGE_TYPE.TASK_FINISH) {
      await this.#acceptTaskFinish(envelope);
    }
  };
  async #acceptTaskDispatch(envelope) {
    try {
      if (this.#bus.localIdentity.role !== PROCESS_ROLE.TASK_WORKER) {
        throw new TypeError("TASK_DISPATCH can only be delivered to a Task Worker");
      }
      this.#assertMasterEnvelope(envelope, PROCESS_ROLE.TASK_WORKER);
      if (envelope.correlationId === null) {
        throw new TypeError("TASK_DISPATCH requires the source dispatch correlation ID");
      }
      const payload = decodeScheduledTaskDispatchPayload(envelope.payload);
      if (payload.selectedWorkerId !== this.#localWorkerId || payload.selectedGeneration !== this.#localGeneration || payload.selectedTaskWorkerId !== this.#localTaskWorkerId) {
        throw new TypeError("TASK_DISPATCH selected identity does not match this Task Worker");
      }
      if (!isEventWorkerId(payload.sourceWorkerId, this.#workerNum)) {
        throw new TypeError("TASK_DISPATCH sourceWorkerId is not an Event Worker");
      }
      this.#receivedTasks += 1;
      const execution = {
        payload,
        assignmentMessageId: envelope.messageId,
        finished: false,
        cleanupRetryScheduled: false
      };
      await this.#activeTask.run(execution, async () => {
        for (const handler of [...this.#taskHandlers]) {
          let result;
          try {
            result = await handler(payload.taskId, payload.sourceWorkerId, payload.data);
          } catch (error) {
            this.#callbackErrors += 1;
            this.#reportDeliveryError(error);
            break;
          }
          if (!execution.finished && result !== void 0 && result !== null) {
            try {
              this.#enqueueFinish(execution, true, result);
            } catch (error) {
              this.#deliveryErrors += 1;
              this.#lastError = asFrameworkErrorCode(error);
              this.#reportDeliveryError(error);
            }
          }
          if (execution.finished) {
            break;
          }
        }
        if (!execution.finished) {
          try {
            this.#enqueueFinish(execution, false);
          } catch (error) {
            this.#deliveryErrors += 1;
            this.#lastError = asFrameworkErrorCode(error);
            this.#reportDeliveryError(error);
            this.#scheduleCompletionAckRetry(execution);
          }
        }
      });
    } catch (error) {
      this.#rejectedMessages += 1;
      throw error;
    }
  }
  async #acceptTaskFinish(envelope) {
    try {
      if (this.#bus.localIdentity.role !== PROCESS_ROLE.WORKER) {
        throw new TypeError("TASK_FINISH can only be delivered to an Event Worker");
      }
      this.#assertMasterEnvelope(envelope, PROCESS_ROLE.WORKER);
      const payload = decodeTaskFinishPayload(envelope.payload);
      if (payload.sourceWorkerId !== this.#localWorkerId || payload.sourceGeneration !== this.#localGeneration) {
        throw new TypeError("TASK_FINISH source identity does not match this Worker generation");
      }
      const pending = this.#pendingTasks.get(payload.taskId);
      if (pending === void 0 || envelope.correlationId !== createCorrelationId(pending.dispatchMessageId)) {
        throw new TypeError("TASK_FINISH does not match a pending Worker task");
      }
      this.#pendingTasks.delete(payload.taskId);
      this.#settlePendingTasksDrain();
      this.#receivedFinishes += 1;
      if (!payload.hasResult) {
        this.#completionAcks += 1;
        return;
      }
      for (const handler of [...this.#finishHandlers]) {
        try {
          await handler(payload.taskId, payload.result);
        } catch (error) {
          this.#callbackErrors += 1;
          this.#reportDeliveryError(error);
        }
      }
    } catch (error) {
      this.#rejectedMessages += 1;
      throw error;
    }
  }
  #assertMasterEnvelope(envelope, targetRole) {
    if (envelope.sourceRole !== PROCESS_ROLE.MASTER || envelope.sourceWorkerId !== null || envelope.sourceGeneration !== null) {
      throw new TypeError(`${envelope.messageType} must originate from Master`);
    }
    if (envelope.targetRole !== targetRole || envelope.targetWorkerId !== this.#localWorkerId) {
      throw new TypeError(`${envelope.messageType} targets a different Worker`);
    }
    if (envelope.sessionId !== null || envelope.flags !== 0) {
      throw new TypeError(`${envelope.messageType} contains invalid envelope metadata`);
    }
  }
  #enqueueFinish(execution, hasResult, result) {
    const payload = execution.payload;
    const finishPayload = hasResult ? encodeTaskFinishPayload({
      taskId: payload.taskId,
      sourceWorkerId: payload.sourceWorkerId,
      sourceGeneration: payload.sourceGeneration,
      selectedTaskWorkerId: payload.selectedTaskWorkerId,
      selectedWorkerId: payload.selectedWorkerId,
      selectedGeneration: payload.selectedGeneration,
      hasResult: true,
      result
    }) : encodeTaskFinishPayload({
      taskId: payload.taskId,
      sourceWorkerId: payload.sourceWorkerId,
      sourceGeneration: payload.sourceGeneration,
      selectedTaskWorkerId: payload.selectedTaskWorkerId,
      selectedWorkerId: payload.selectedWorkerId,
      selectedGeneration: payload.selectedGeneration,
      hasResult: false
    });
    const receipt = this.#bus.enqueue({
      messageType: IPC_MESSAGE_TYPE.TASK_FINISH,
      targetRole: PROCESS_ROLE.MASTER,
      targetWorkerId: null,
      correlationId: createCorrelationId(execution.assignmentMessageId),
      payload: finishPayload
    });
    execution.finished = true;
    this.#admittedFinishes += 1;
    this.#observeDelivery(
      receipt.completion,
      () => this.#scheduleCompletionAckRetry(execution)
    );
  }
  #scheduleCompletionAckRetry(execution) {
    if (execution.cleanupRetryScheduled) {
      return;
    }
    execution.cleanupRetryScheduled = true;
    execution.finished = true;
    this.#completionRetries += 1;
    this.#completionRetryTail = this.#completionRetryTail.then(async () => {
      try {
        await this.#bus.drain();
      } catch (error) {
        this.#deliveryErrors += 1;
        this.#reportDeliveryError(error);
      }
      if (this.#closed) {
        this.#failedCompletions += 1;
        return;
      }
      const payload = execution.payload;
      try {
        const retry = this.#bus.enqueue({
          messageType: IPC_MESSAGE_TYPE.TASK_FINISH,
          targetRole: PROCESS_ROLE.MASTER,
          targetWorkerId: null,
          correlationId: createCorrelationId(execution.assignmentMessageId),
          payload: encodeTaskFinishPayload({
            taskId: payload.taskId,
            sourceWorkerId: payload.sourceWorkerId,
            sourceGeneration: payload.sourceGeneration,
            selectedTaskWorkerId: payload.selectedTaskWorkerId,
            selectedWorkerId: payload.selectedWorkerId,
            selectedGeneration: payload.selectedGeneration,
            hasResult: false
          })
        });
        await retry.completion;
      } catch (error) {
        this.#deliveryErrors += 1;
        this.#failedCompletions += 1;
        this.#reportDeliveryError(error);
      }
    });
    void this.#completionRetryTail.catch(() => void 0);
  }
  #requireTaskWorkerId(value) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= this.#taskWorkerNum) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `taskWorkerId must be in [0, ${this.#taskWorkerNum})`
      );
    }
    return createTaskWorkerId(value);
  }
  #observeDelivery(completion, onFailure) {
    void completion.catch((error) => {
      this.#deliveryErrors += 1;
      onFailure?.();
      this.#reportDeliveryError(error);
    });
  }
  #reportDeliveryError(error) {
    try {
      this.#onDeliveryError?.(error);
    } catch {
    }
  }
  #settlePendingTasksDrain() {
    if (this.#pendingTasks.size !== 0 || this.#pendingTasksDrain === void 0) {
      return;
    }
    const drain = this.#pendingTasksDrain;
    this.#pendingTasksDrain = void 0;
    drain.resolve();
  }
  #addListener(set, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Worker task listener must be a function");
    }
    if (this.#sealed) {
      return () => {
      };
    }
    set.add(listener);
    return () => set.delete(listener);
  }
};

// src/runtime/worker-runtime-context.ts
var WorkerRuntimeContext = class _WorkerRuntimeContext extends RuntimeContext {
  worker_id;
  worker_pid;
  taskworker;
  setting;
  master_pid;
  generation;
  role;
  taskWorkerId;
  configVersion;
  constructor(bootstrap, workerPid, dependencies) {
    super({
      ...dependencies,
      settings: bootstrap.settings,
      masterPid: bootstrap.masterPid,
      masterGeneration: bootstrap.masterGeneration
    });
    this.worker_id = bootstrap.workerId;
    this.worker_pid = workerPid;
    this.taskworker = bootstrap.role !== PROCESS_ROLE.WORKER;
    this.setting = this.settings;
    this.master_pid = this.masterPid;
    this.generation = bootstrap.workerGeneration;
    this.role = bootstrap.role;
    this.taskWorkerId = bootstrap.taskWorkerId;
    this.configVersion = bootstrap.configVersion;
    Object.freeze(this);
  }
  static fromValidatedBootstrap(bootstrap, actualWorkerPid, dependencies = {}) {
    return new _WorkerRuntimeContext(
      bootstrap,
      createProcessPid(actualWorkerPid),
      dependencies
    );
  }
};
function createWorkerRuntimeContext(bootstrap, actualWorkerPid, dependencies = {}) {
  return WorkerRuntimeContext.fromValidatedBootstrap(
    bootstrap,
    actualWorkerPid,
    dependencies
  );
}

// src/process/worker-process-messenger.ts
var WORKER_PROCESS_MESSAGE_REJECTION_REASON = Object.freeze({
  INVALID_SOURCE: "INVALID_SOURCE",
  INVALID_TARGET: "INVALID_TARGET",
  INVALID_METADATA: "INVALID_METADATA"
});
var WorkerProcessMessageRejectedError = class extends Error {
  reason;
  envelope;
  constructor(reason, envelope, message) {
    super(message);
    this.name = "WorkerProcessMessageRejectedError";
    this.reason = reason;
    this.envelope = envelope;
  }
};
function assertPoolSize3(name, value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${name} must be a safe integer >= ${minimum}, got ${value}`
    );
  }
}
function isWorkerRole(role) {
  return role === PROCESS_ROLE.WORKER || role === PROCESS_ROLE.TASK_WORKER || role === PROCESS_ROLE.USER_TASK_WORKER;
}
function asMessengerErrorCode(error) {
  try {
    if (error instanceof FrameworkError) {
      return error.code;
    }
  } catch {
  }
  return FRAMEWORK_ERROR_CODE.INVALID_STATE;
}
var WorkerProcessMessenger = class {
  workerNum;
  taskWorkerNum;
  userTaskWorkerNum;
  #bus;
  #onDeliveryError;
  #listeners = /* @__PURE__ */ new Set();
  #requestListeners = /* @__PURE__ */ new Set();
  #rejectionCounts = /* @__PURE__ */ new Map();
  #disposeBusMessage;
  #sealed = false;
  #closed = false;
  #acceptedSends = 0;
  #rejectedSends = 0;
  #deliveryErrors = 0;
  #receivedMessages = 0;
  #ignoredMessages = 0;
  #rejectedMessages = 0;
  #callbackErrors = 0;
  #lastError = null;
  constructor(options) {
    assertPoolSize3("workerNum", options.workerNum, 1);
    assertPoolSize3("taskWorkerNum", options.taskWorkerNum, 0);
    const userTaskWorkerNum = options.userTaskWorkerNum ?? 0;
    assertPoolSize3("userTaskWorkerNum", userTaskWorkerNum, 0);
    if (!Number.isSafeInteger(options.workerNum + options.taskWorkerNum + userTaskWorkerNum)) {
      throw new RangeError("configured process pool must be a safe integer");
    }
    const identity = options.bus.localIdentity;
    if (!isWorkerRole(identity.role) || identity.workerId === null || identity.generation === null || !Number.isSafeInteger(identity.generation) || identity.generation < 0 || !this.#matchesRole(
      identity.role,
      identity.workerId,
      options.workerNum,
      options.taskWorkerNum,
      userTaskWorkerNum
    )) {
      throw new TypeError(
        "WorkerProcessMessenger requires a matching Worker or Task Worker ProcessBus identity"
      );
    }
    this.workerNum = options.workerNum;
    this.taskWorkerNum = options.taskWorkerNum;
    this.userTaskWorkerNum = userTaskWorkerNum;
    this.#bus = options.bus;
    this.#onDeliveryError = options.onDeliveryError;
    this.#disposeBusMessage = options.bus.onMessage(this.#handleEnvelope);
  }
  sendMessage(message, targetWorkerId) {
    try {
      if (this.#sealed || this.#closed) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
          "Worker process messenger is sealed"
        );
      }
      const targetRole = this.#targetRole(targetWorkerId);
      const receipt = this.#bus.enqueue({
        messageType: IPC_MESSAGE_TYPE.PROCESS_MESSAGE,
        targetRole,
        targetWorkerId,
        payload: message
      });
      void receipt.completion.catch((error) => {
        this.#deliveryErrors += 1;
        try {
          this.#onDeliveryError?.(error);
        } catch {
        }
      });
      this.#acceptedSends += 1;
      this.#lastError = null;
      return true;
    } catch (error) {
      this.#rejectedSends += 1;
      this.#lastError = asMessengerErrorCode(error);
      return false;
    }
  }
  async requestMessage(message, targetWorkerId, timeoutMs) {
    if (this.#sealed || this.#closed) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
        "Worker process messenger is sealed"
      );
    }
    if (this.#bus.request === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "Worker process messenger bus does not support requests"
      );
    }
    const response = await this.#bus.request({
      messageType: IPC_MESSAGE_TYPE.PROCESS_MESSAGE,
      targetRole: this.#targetRole(targetWorkerId),
      targetWorkerId,
      payload: message,
      ...timeoutMs === void 0 ? {} : { timeoutMs }
    });
    return response.payload;
  }
  onPipeMessage(listener) {
    if (this.#closed) {
      return () => {
      };
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  onPipeRequest(listener) {
    if (this.#closed) {
      return () => {
      };
    }
    this.#requestListeners.add(listener);
    return () => {
      this.#requestListeners.delete(listener);
    };
  }
  getLastError() {
    return this.#lastError;
  }
  stats() {
    return Object.freeze({
      sealed: this.#sealed,
      closed: this.#closed,
      acceptedSends: this.#acceptedSends,
      rejectedSends: this.#rejectedSends,
      deliveryErrors: this.#deliveryErrors,
      receivedMessages: this.#receivedMessages,
      ignoredMessages: this.#ignoredMessages,
      rejectedMessages: this.#rejectedMessages,
      callbackErrors: this.#callbackErrors,
      rejectionCounts: Object.freeze(
        Object.fromEntries(this.#rejectionCounts)
      ),
      lastError: this.#lastError
    });
  }
  seal(_reason) {
    this.#sealed = true;
  }
  close(_reason) {
    if (this.#closed) {
      return;
    }
    this.#sealed = true;
    this.#closed = true;
    this.#disposeBusMessage();
    this.#disposeBusMessage = () => {
    };
    this.#listeners.clear();
    this.#requestListeners.clear();
  }
  #handleEnvelope = async (envelope) => {
    if (this.#closed) {
      return;
    }
    if (envelope.messageType !== IPC_MESSAGE_TYPE.PROCESS_MESSAGE) {
      this.#ignoredMessages += 1;
      return;
    }
    const sourceWorkerId = this.#requireTrustedSource(envelope);
    this.#assertLocalTarget(envelope);
    this.#receivedMessages += 1;
    if ((envelope.flags & PROCESS_BUS_FLAG_EXPECT_RESPONSE) !== 0) {
      this.#assertRequestMetadata(envelope);
      const payload = await this.#invokeRequestListener(sourceWorkerId, envelope.payload);
      if (this.#bus.reply === void 0) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.INVALID_STATE,
          "Worker process messenger bus does not support replies"
        );
      }
      await this.#bus.reply(envelope, { payload });
      return;
    }
    this.#assertNeutralMetadata(envelope);
    await this.#invokeListeners(sourceWorkerId, envelope.payload);
  };
  #targetRole(targetWorkerId) {
    if (!Number.isSafeInteger(targetWorkerId) || targetWorkerId < 0 || targetWorkerId >= this.workerNum + this.taskWorkerNum + this.userTaskWorkerNum) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `target Worker ID ${String(targetWorkerId)} is outside the configured process pool`,
        {
          targetWorkerId,
          workerNum: this.workerNum,
          taskWorkerNum: this.taskWorkerNum,
          userTaskWorkerNum: this.userTaskWorkerNum
        }
      );
    }
    return targetWorkerId < this.workerNum ? PROCESS_ROLE.WORKER : targetWorkerId < this.workerNum + this.taskWorkerNum ? PROCESS_ROLE.TASK_WORKER : PROCESS_ROLE.USER_TASK_WORKER;
  }
  #requireTrustedSource(envelope) {
    const sourceWorkerId = envelope.sourceWorkerId;
    if (!isWorkerRole(envelope.sourceRole) || sourceWorkerId === null || envelope.sourceGeneration === null || !Number.isSafeInteger(envelope.sourceGeneration) || envelope.sourceGeneration < 0 || !this.#matchesRole(
      envelope.sourceRole,
      sourceWorkerId,
      this.workerNum,
      this.taskWorkerNum,
      this.userTaskWorkerNum
    )) {
      this.#reject(
        WORKER_PROCESS_MESSAGE_REJECTION_REASON.INVALID_SOURCE,
        envelope,
        "PROCESS_MESSAGE has an invalid or untrusted source identity"
      );
    }
    return sourceWorkerId;
  }
  #assertLocalTarget(envelope) {
    const identity = this.#bus.localIdentity;
    if (envelope.targetRole !== identity.role || envelope.targetWorkerId !== identity.workerId) {
      this.#reject(
        WORKER_PROCESS_MESSAGE_REJECTION_REASON.INVALID_TARGET,
        envelope,
        "PROCESS_MESSAGE does not target the local process identity"
      );
    }
  }
  #assertNeutralMetadata(envelope) {
    if (envelope.correlationId !== null || envelope.sessionId !== null || envelope.flags !== 0) {
      this.#reject(
        WORKER_PROCESS_MESSAGE_REJECTION_REASON.INVALID_METADATA,
        envelope,
        "PROCESS_MESSAGE cannot carry correlation, Session, or reserved flags"
      );
    }
  }
  #assertRequestMetadata(envelope) {
    if (envelope.correlationId !== null || envelope.sessionId !== null || envelope.flags !== PROCESS_BUS_FLAG_EXPECT_RESPONSE || (envelope.flags & PROCESS_BUS_FLAG_RESPONSE) !== 0) {
      this.#reject(
        WORKER_PROCESS_MESSAGE_REJECTION_REASON.INVALID_METADATA,
        envelope,
        "PROCESS_MESSAGE request has invalid correlation, Session, or flags"
      );
    }
  }
  #matchesRole(role, workerId, workerNum, taskWorkerNum, userTaskWorkerNum) {
    if (!Number.isSafeInteger(workerId) || workerId < 0) {
      return false;
    }
    if (role === PROCESS_ROLE.WORKER) {
      return workerId < workerNum;
    }
    if (role === PROCESS_ROLE.TASK_WORKER) {
      return workerId >= workerNum && workerId < workerNum + taskWorkerNum;
    }
    return workerId >= workerNum + taskWorkerNum && workerId < workerNum + taskWorkerNum + userTaskWorkerNum;
  }
  #reject(reason, envelope, message) {
    this.#rejectedMessages += 1;
    this.#rejectionCounts.set(reason, (this.#rejectionCounts.get(reason) ?? 0) + 1);
    throw new WorkerProcessMessageRejectedError(reason, envelope, message);
  }
  async #invokeListeners(sourceWorkerId, message) {
    const failures = [];
    for (const listener of [...this.#listeners]) {
      try {
        await listener(sourceWorkerId, message);
      } catch (error) {
        failures.push(error);
      }
    }
    this.#callbackErrors += failures.length;
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "Worker process message callbacks failed");
    }
  }
  async #invokeRequestListener(sourceWorkerId, message) {
    const listeners = [...this.#requestListeners];
    if (listeners.length !== 1) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `PROCESS_MESSAGE request requires exactly one listener, received ${listeners.length}`
      );
    }
    try {
      return await listeners[0](sourceWorkerId, message);
    } catch (error) {
      this.#callbackErrors += 1;
      throw error;
    }
  }
};

// src/process/worker-lifecycle-controller.ts
import { randomUUID as randomUUID5 } from "node:crypto";
function asLifecycleErrorCode(error) {
  try {
    if (error instanceof FrameworkError) {
      return error.code;
    }
  } catch {
  }
  return FRAMEWORK_ERROR_CODE.INVALID_STATE;
}
var WorkerLifecycleController = class {
  #bootstrap;
  #transport;
  #onDeliveryError;
  #sequence = 1;
  #closed = false;
  #acceptedRequests = 0;
  #rejectedRequests = 0;
  #restartRequests = 0;
  #reloadRequests = 0;
  #shutdownRequests = 0;
  #deliveryErrors = 0;
  #lastError = null;
  constructor(options) {
    if (options.transport === null || typeof options.transport !== "object") {
      throw new TypeError("WorkerLifecycleController requires a ProcessTransport");
    }
    this.#bootstrap = options.bootstrap;
    this.#transport = options.transport;
    this.#onDeliveryError = options.onDeliveryError;
  }
  stop(targetWorkerId = this.#bootstrap.workerId) {
    return this.#admit(
      LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST,
      (request) => createRestartRequest(this.#bootstrap, {
        ...request,
        targetWorkerId: this.#requireTargetWorkerId(targetWorkerId)
      })
    );
  }
  reload(onlyTaskWorkers = false) {
    return this.#admit(
      LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST,
      (request) => createReloadRequest(this.#bootstrap, {
        ...request,
        onlyTaskWorkers: this.#requireBoolean(
          "onlyTaskWorkers",
          onlyTaskWorkers
        )
      })
    );
  }
  shutdown() {
    return this.#admit(
      LIFECYCLE_CONTROL_ACTION.SHUTDOWN_REQUEST,
      (request) => createShutdownRequest(this.#bootstrap, request)
    );
  }
  getLastError() {
    return this.#lastError;
  }
  stats() {
    return Object.freeze({
      closed: this.#closed,
      acceptedRequests: this.#acceptedRequests,
      rejectedRequests: this.#rejectedRequests,
      restartRequests: this.#restartRequests,
      reloadRequests: this.#reloadRequests,
      shutdownRequests: this.#shutdownRequests,
      deliveryErrors: this.#deliveryErrors,
      lastError: this.#lastError
    });
  }
  close(_reason) {
    this.#closed = true;
  }
  #admit(action, createEnvelope) {
    try {
      if (this.#closed) {
        throw new FrameworkError(
          FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
          "Worker lifecycle controller is closed"
        );
      }
      const nonce = randomUUID5();
      const requestId = `lifecycle:${this.#bootstrap.workerId}:${this.#bootstrap.workerGeneration}:${this.#sequence}:${nonce}`;
      const envelope = createEnvelope({
        messageId: `${action.toLowerCase()}:${requestId}`,
        requestId,
        sequence: this.#sequence
      });
      const completion = this.#transport.send(
        envelope,
        PROCESS_TRANSPORT_LANE.CONTROL
      );
      this.#sequence += 1;
      this.#acceptedRequests += 1;
      if (action === LIFECYCLE_CONTROL_ACTION.RESTART_REQUEST) {
        this.#restartRequests += 1;
      } else if (action === LIFECYCLE_CONTROL_ACTION.RELOAD_REQUEST) {
        this.#reloadRequests += 1;
      } else {
        this.#shutdownRequests += 1;
      }
      this.#lastError = null;
      void completion.catch((error) => {
        this.#deliveryErrors += 1;
        try {
          this.#onDeliveryError?.(error);
        } catch {
        }
      });
      return true;
    } catch (error) {
      this.#rejectedRequests += 1;
      this.#lastError = asLifecycleErrorCode(error);
      return false;
    }
  }
  #requireTargetWorkerId(value) {
    const workerCount = this.#bootstrap.settings.worker_num + this.#bootstrap.settings.task_worker_num + (this.#bootstrap.settings.user_task_worker_num ?? 0);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= workerCount) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `Worker ${String(value)} is outside the configured process pool`,
        { workerId: value, workerCount }
      );
    }
    return value;
  }
  #requireBoolean(name, value) {
    if (typeof value !== "boolean") {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `${name} must be a boolean`
      );
    }
    return value;
  }
};

// src/network/rust-worker-data-plane.ts
var BATCH_HEADER_BYTES2 = 4;
var EVENT_RECORD_BYTES2 = 24;
var EVENT_DATA2 = 1;
var EVENT_BARRIER = 2;
var EVENT_CONNECT = 3;
var EVENT_CLOSE2 = 4;
var EVENT_BUFFER2 = 5;
var POLL_MAX_EVENTS2 = 4096;
var POLL_MAX_BYTES2 = 8 * 1024 * 1024;
function readSafeUInt64BE2(buffer, offset) {
  const value = buffer.readUInt32BE(offset) * 4294967296 + buffer.readUInt32BE(offset + 4);
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Rust Worker data-plane integer exceeds JavaScript safe range");
  }
  return value;
}
function writeSafeUInt64BE(buffer, value, offset) {
  const high = Math.floor(value / 4294967296);
  buffer.writeUInt32BE(high, offset);
  buffer.writeUInt32BE(value - high * 4294967296, offset + 4);
}
var RustWorkerDataPlane = class {
  #context;
  #receiver;
  #native;
  #closePromise;
  #drainPromise;
  #resolveDrain;
  #rejectDrain;
  #drainBarrierId;
  #activeMessages = 0;
  #closing = false;
  constructor(options) {
    this.#context = options.context;
    this.#receiver = options.receiver;
    this.#native = options.native ?? new (loadRustDataPlaneBinding()).NativeWorkerDataPlane();
    this.#native.start({
      path: options.path,
      workerId: createWorkerId(options.context.worker_id),
      generation: options.context.generation,
      queueMessages: options.queueMessages ?? 4096,
      reconnectDelayMs: 5
    });
    void this.#pump();
  }
  get connected() {
    return this.#native.connected;
  }
  send(sessionId, data) {
    return this.#native.send(sessionId, data);
  }
  closeSession(sessionId) {
    return this.#native.closeSession(sessionId);
  }
  drain() {
    if (this.#closing) {
      return Promise.resolve();
    }
    if (this.#drainPromise !== void 0) {
      return this.#drainPromise;
    }
    this.#drainPromise = new Promise((resolve4, reject) => {
      this.#resolveDrain = resolve4;
      this.#rejectDrain = reject;
    });
    const drainPromise = this.#drainPromise;
    this.#maintainDrainBarrier();
    return drainPromise;
  }
  close(_reason) {
    if (this.#closePromise !== void 0) {
      return this.#closePromise;
    }
    this.#closing = true;
    this.#settleDrain();
    this.#closePromise = Promise.resolve().then(() => {
      this.#native.close();
    });
    return this.#closePromise;
  }
  async #pump() {
    try {
      while (!this.#closing && this.#native.running) {
        const batch = await this.#native.waitEvents(
          POLL_MAX_EVENTS2,
          POLL_MAX_BYTES2,
          100
        );
        if (batch.byteLength < BATCH_HEADER_BYTES2) {
          throw new TypeError("Rust Worker data-plane batch is truncated");
        }
        const count = batch.readUInt32BE(0);
        const acknowledgements = /* @__PURE__ */ new Map();
        const sessionTails = /* @__PURE__ */ new Map();
        let failed = false;
        let firstFailure;
        const schedule = (sessionId, operation) => {
          const previous = sessionTails.get(sessionId);
          let completion;
          if (previous === void 0) {
            try {
              completion = operation();
            } catch (error) {
              completion = Promise.reject(error);
            }
          } else {
            completion = previous.then(operation);
          }
          if (completion === void 0) {
            return;
          }
          sessionTails.set(sessionId, completion);
          void completion.catch((error) => {
            if (!failed) {
              failed = true;
              firstFailure = error;
            }
          });
        };
        let offset = BATCH_HEADER_BYTES2;
        let completedDrainBarrier = false;
        for (let index = 0; index < count; index += 1) {
          if (batch.byteLength - offset < EVENT_RECORD_BYTES2) {
            throw new TypeError("Rust Worker data-plane event is truncated");
          }
          const kind = batch[offset];
          if (kind !== EVENT_DATA2 && kind !== EVENT_BARRIER && kind !== EVENT_CONNECT && kind !== EVENT_CLOSE2 && kind !== EVENT_BUFFER2) {
            throw new TypeError(`Rust Worker data-plane event kind ${kind} is invalid`);
          }
          const sessionId = readSafeUInt64BE2(batch, offset + 4);
          const sequence = readSafeUInt64BE2(batch, offset + 12);
          const payloadBytes = batch.readUInt32BE(offset + 20);
          const payloadStart = offset + EVENT_RECORD_BYTES2;
          const payloadEnd = payloadStart + payloadBytes;
          if (payloadEnd > batch.byteLength) {
            throw new TypeError("Rust Worker data-plane event payload is truncated");
          }
          if (kind === EVENT_BARRIER) {
            if (sessionId !== 0 || sequence < 1 || payloadBytes !== 0) {
              throw new TypeError("Rust Worker data-plane barrier is invalid");
            }
            if (sequence === this.#drainBarrierId) {
              completedDrainBarrier = true;
            }
            offset = payloadEnd;
            continue;
          }
          if (!isSessionId(sessionId)) {
            throw new TypeError("Rust Worker data-plane Session ID is invalid");
          }
          if (this.#receiver === void 0) {
            throw new Error("Task Worker received an inbound native network event");
          }
          if (kind === EVENT_CONNECT || kind === EVENT_CLOSE2 || kind === EVENT_BUFFER2) {
            if (payloadBytes <= 8) {
              throw new TypeError("Rust Worker control event identity is invalid");
            }
            const controlId = readSafeUInt64BE2(batch, payloadStart);
            if (controlId < 1) {
              throw new TypeError("Rust Worker control event ID is invalid");
            }
            const controlPayloadStart = payloadStart + 8;
            let payload;
            try {
              payload = JSON.parse(batch.toString("utf8", controlPayloadStart, payloadEnd));
            } catch (error) {
              throw new TypeError("Rust Worker control event payload is invalid JSON", {
                cause: error
              });
            }
            if (kind === EVENT_CONNECT) {
              schedule(sessionId, () => {
                const completion = this.#receiver.acceptNativeTcpConnect(
                  sessionId,
                  createIpcSequence(sequence),
                  payload
                );
                return this.#acknowledgeControlAfter(
                  completion,
                  kind,
                  sessionId,
                  sequence,
                  controlId
                );
              });
            } else if (kind === EVENT_CLOSE2) {
              schedule(sessionId, () => {
                const completion = this.#receiver.acceptNativeTcpClose(
                  sessionId,
                  createIpcSequence(sequence),
                  payload
                );
                return this.#acknowledgeControlAfter(
                  completion,
                  kind,
                  sessionId,
                  sequence,
                  controlId
                );
              });
            } else {
              schedule(sessionId, () => {
                const completion = this.#receiver.acceptNativeTcpBuffer(
                  sessionId,
                  createIpcSequence(sequence),
                  payload
                );
                return this.#acknowledgeControlAfter(
                  completion,
                  kind,
                  sessionId,
                  sequence,
                  controlId
                );
              });
            }
            offset = payloadEnd;
            continue;
          }
          if (sequence < 1) {
            throw new TypeError("Rust Worker data-plane event identity is invalid");
          }
          schedule(sessionId, () => {
            this.#activeMessages += 1;
            let completion;
            try {
              completion = this.#receiver.acceptNativeTcpMessage(
                sessionId,
                createIpcSequence(sequence),
                batch.subarray(payloadStart, payloadEnd)
              );
            } catch (error) {
              this.#activeMessages -= 1;
              throw error;
            }
            if (completion === void 0) {
              this.#activeMessages -= 1;
              acknowledgements.set(sessionId, sequence);
              return;
            }
            return completion.then(() => {
              acknowledgements.set(sessionId, sequence);
            }).finally(() => {
              this.#activeMessages -= 1;
            });
          });
          offset = payloadEnd;
        }
        if (offset !== batch.byteLength) {
          throw new TypeError("Rust Worker data-plane batch contains trailing bytes");
        }
        if (sessionTails.size !== 0) {
          await Promise.allSettled(sessionTails.values());
        }
        if (failed) {
          throw firstFailure;
        }
        if (acknowledgements.size !== 0) {
          const payload = Buffer.allocUnsafe(acknowledgements.size * 16);
          let acknowledgementOffset = 0;
          for (const [sessionId, sequence] of acknowledgements) {
            writeSafeUInt64BE(payload, sessionId, acknowledgementOffset);
            writeSafeUInt64BE(payload, sequence, acknowledgementOffset + 8);
            acknowledgementOffset += 16;
          }
          if (!this.#native.acknowledge(payload)) {
            throw new Error("Rust Worker data-plane acknowledgement was rejected");
          }
        }
        if (completedDrainBarrier) {
          this.#settleDrain();
        } else {
          this.#maintainDrainBarrier();
        }
      }
      if (!this.#closing) {
        throw new Error("Rust Worker data-plane thread stopped unexpectedly");
      }
    } catch (error) {
      if (this.#closing) {
        return;
      }
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.worker.rust_data_plane_failed", {
        workerId: this.#context.worker_id,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      this.#context.requestStop(error);
      this.#rejectPendingDrain(error);
    }
  }
  #acknowledgeControlAfter(completion, kind, sessionId, sequence, controlId) {
    if (completion === void 0) {
      this.#acknowledgeControl(kind, sessionId, sequence, controlId);
      return;
    }
    return completion.then(() => {
      this.#acknowledgeControl(kind, sessionId, sequence, controlId);
    });
  }
  #acknowledgeControl(kind, sessionId, sequence, controlId) {
    if (!this.#native.acknowledgeControl(kind, sessionId, sequence, controlId)) {
      throw new Error("Rust Worker control acknowledgement was rejected");
    }
  }
  #settleDrain() {
    const resolve4 = this.#resolveDrain;
    if (resolve4 === void 0) {
      return;
    }
    this.#resolveDrain = void 0;
    this.#rejectDrain = void 0;
    this.#drainPromise = void 0;
    this.#drainBarrierId = void 0;
    resolve4();
  }
  #maintainDrainBarrier() {
    if (this.#drainPromise === void 0 || this.#closing) {
      return;
    }
    if (!this.#native.running) {
      if (this.#activeMessages === 0 && this.#native.pendingEvents === 0) {
        this.#settleDrain();
      }
      return;
    }
    if (!this.#native.connected) {
      this.#drainBarrierId = void 0;
      return;
    }
    if (this.#drainBarrierId !== void 0) {
      return;
    }
    const barrierId = this.#native.requestDrain();
    if (Number.isSafeInteger(barrierId) && barrierId >= 1) {
      this.#drainBarrierId = barrierId;
    } else {
      this.#drainBarrierId = void 0;
    }
  }
  #rejectPendingDrain(error) {
    const reject = this.#rejectDrain;
    if (reject === void 0) {
      return;
    }
    this.#resolveDrain = void 0;
    this.#rejectDrain = void 0;
    this.#drainPromise = void 0;
    this.#drainBarrierId = void 0;
    reject(error);
  }
};

// src/process/worker-entry.ts
var CONTROL_MESSAGE_TYPES2 = /* @__PURE__ */ new Set([
  IPC_MESSAGE_TYPE.CONTROL_BOOTSTRAP,
  IPC_MESSAGE_TYPE.CONTROL_READY,
  IPC_MESSAGE_TYPE.CONTROL_DRAIN,
  IPC_MESSAGE_TYPE.CONTROL_SHUTDOWN,
  IPC_MESSAGE_TYPE.CONTROL_HEARTBEAT,
  IPC_MESSAGE_TYPE.CONTROL_CAPACITY
]);
var DEFAULT_WORKER_ENTRY_BUSINESS_MAX_MESSAGES = DEFAULT_DATA_QUEUE_MAX_MESSAGES;
var DEFAULT_WORKER_ENTRY_BUSINESS_MAX_BYTES = DEFAULT_DATA_QUEUE_MAX_BYTES;
var DEFAULT_WORKER_ENTRY_BUSINESS_HIGH_MESSAGES = DEFAULT_DATA_QUEUE_HIGH_MESSAGES;
var DEFAULT_WORKER_ENTRY_BUSINESS_HIGH_BYTES = DEFAULT_DATA_QUEUE_HIGH_BYTES;
var DEFAULT_WORKER_ENTRY_BUSINESS_LOW_MESSAGES = DEFAULT_DATA_QUEUE_LOW_MESSAGES;
var DEFAULT_WORKER_ENTRY_BUSINESS_LOW_BYTES = DEFAULT_DATA_QUEUE_LOW_BYTES;
function createDeferred9() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function assertCapacity3(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}
function assertWatermarkOrder2(name, low, high, max) {
  if (low > high || high > max) {
    throw new RangeError(
      `${name} watermarks must satisfy low <= high <= max, got ${low} <= ${high} <= ${max}`
    );
  }
}
function parentDisconnectReason(result) {
  return result.reason === "not-connected" ? new Error("Worker entry requires an active Node IPC channel") : new Error(
    "Master IPC disconnected",
    result.error === void 0 ? void 0 : { cause: result.error }
  );
}
var DEFAULT_PARENT_DISCONNECT_EXIT_GRACE_MS = 1e4;
function defaultForcedExit(code) {
  process.stderr.write(
    `[alloy-core] worker ${String(process.pid)} forced exit ${String(code)}: master IPC disconnected and cleanup did not finish in time
`
  );
  process.exit(code);
}
var WorkerEntryMessageMux = class {
  #bootstrap = createDeferred9();
  #stopped = createDeferred9();
  #codec;
  #businessMaxMessages;
  #businessMaxBytes;
  #businessHighMessages;
  #businessHighBytes;
  #businessLowMessages;
  #businessLowBytes;
  #onBusinessCapacityChange;
  #parentDisconnectExitGraceMs;
  #forceExit;
  #businessQueue = [];
  #phase = "bootstrap";
  #bootstrapValue;
  #context;
  #bus;
  #masterPeer;
  #stopOutcome;
  #activeDrainRequest;
  #drainRequestWaiter;
  #queuedDrainRequests = [];
  #businessInFlight;
  #businessPendingMessages = 0;
  #businessPendingBytes = 0;
  #businessQueuedBytes = 0;
  #businessPressured = false;
  #acceptedBusinessMessages = 0;
  #rejectedBusinessMessages = 0;
  #completedBusinessMessages = 0;
  #failedBusinessMessages = 0;
  #drainDeferred;
  #disposeMessage;
  #disposeProtocolError;
  /** 父进程断开后武装的硬退出兜底，见 #armForcedExit */
  #forcedExitTimer;
  constructor(transport, endpoint, options = {}) {
    const businessMaxMessages = options.businessMaxMessages ?? DEFAULT_WORKER_ENTRY_BUSINESS_MAX_MESSAGES;
    const businessMaxBytes = options.businessMaxBytes ?? DEFAULT_WORKER_ENTRY_BUSINESS_MAX_BYTES;
    const businessHighMessages = options.businessHighMessages ?? Math.min(DEFAULT_WORKER_ENTRY_BUSINESS_HIGH_MESSAGES, businessMaxMessages);
    const businessHighBytes = options.businessHighBytes ?? Math.min(DEFAULT_WORKER_ENTRY_BUSINESS_HIGH_BYTES, businessMaxBytes);
    const businessLowMessages = options.businessLowMessages ?? Math.min(DEFAULT_WORKER_ENTRY_BUSINESS_LOW_MESSAGES, businessHighMessages);
    const businessLowBytes = options.businessLowBytes ?? Math.min(DEFAULT_WORKER_ENTRY_BUSINESS_LOW_BYTES, businessHighBytes);
    assertCapacity3("businessMaxMessages", businessMaxMessages);
    assertCapacity3("businessMaxBytes", businessMaxBytes);
    assertCapacity3("businessHighMessages", businessHighMessages);
    assertCapacity3("businessHighBytes", businessHighBytes);
    assertCapacity3("businessLowMessages", businessLowMessages);
    assertCapacity3("businessLowBytes", businessLowBytes);
    assertWatermarkOrder2(
      "business message",
      businessLowMessages,
      businessHighMessages,
      businessMaxMessages
    );
    assertWatermarkOrder2(
      "business byte",
      businessLowBytes,
      businessHighBytes,
      businessMaxBytes
    );
    this.#codec = options.codec ?? new IpcEnvelopeCodec();
    this.#businessMaxMessages = businessMaxMessages;
    this.#businessMaxBytes = businessMaxBytes;
    this.#businessHighMessages = businessHighMessages;
    this.#businessHighBytes = businessHighBytes;
    this.#businessLowMessages = businessLowMessages;
    this.#businessLowBytes = businessLowBytes;
    this.#onBusinessCapacityChange = options.onBusinessCapacityChange;
    this.#parentDisconnectExitGraceMs = options.parentDisconnectExitGraceMs ?? DEFAULT_PARENT_DISCONNECT_EXIT_GRACE_MS;
    assertCapacity3("parentDisconnectExitGraceMs", this.#parentDisconnectExitGraceMs);
    this.#forceExit = options.forceExit ?? defaultForcedExit;
    this.#disposeMessage = transport.onMessage(this.#onEnvelope);
    this.#disposeProtocolError = transport.onProtocolError((error) => {
      this.fail(error);
    });
    void endpoint.closed.then((result) => {
      if (this.#phase === "stopping") {
        return;
      }
      const error = parentDisconnectReason(result);
      if (result.reason !== "not-connected") {
        this.#armForcedExit();
      }
      this.#beginStop(error, this.#phase === "bootstrap", false);
    }).catch((error) => {
      this.fail(error);
    });
  }
  /**
   * 武装「清理卡死就强制退出」的兜底。
   *
   * timer 用 `unref()`：清理正常完成时进程会自然退出，它不会把事件循环多留 10 秒。
   * 清理真的卡住时（IO 不返回），这个 timer 是子进程唯一的退出路径。
   *
   * 刻意**不做解除**：兜底一旦武装就有效到进程退出。原因是本类能观察到的最晚时点
   * `dispose()` 位于 `runWorkerEntry` 清理流程的**起点之前**，真正容易卡住的部分
   * （关闭连接、释放共享内存、等 bus drain）全在它之后。若在 `dispose()` 里清掉
   * timer，覆盖窗口只剩几毫秒，兜底等于不存在。而 `unref()` 已经保证它不会拖住
   * 正常退出，所以「不解除」不会带来误杀，只会覆盖住真正需要它的那段路径。
   */
  #armForcedExit() {
    if (this.#forcedExitTimer !== void 0) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      this.#forcedExitTimer = void 0;
      this.#forceExit(1);
    }, this.#parentDisconnectExitGraceMs);
    timer.unref();
    this.#forcedExitTimer = timer;
  }
  get stopping() {
    return this.#stopOutcome !== void 0;
  }
  receiveBootstrap() {
    return this.#bootstrap.promise;
  }
  bindRuntime(context, bus, masterPeer) {
    this.#context = context;
    this.#bus = bus;
    this.#masterPeer = masterPeer;
    if (this.#stopOutcome !== void 0) {
      context.requestStop(this.#stopOutcome.reason);
    }
  }
  startRunning() {
    if (this.#stopOutcome !== void 0) {
      return;
    }
    if (this.#phase !== "initializing") {
      throw new Error(`cannot start worker message mux from ${this.#phase}`);
    }
    this.#phase = "running";
  }
  waitForStop() {
    return this.#stopped.promise;
  }
  waitForDrainRequest() {
    if (this.#stopOutcome !== void 0) {
      return Promise.resolve(null);
    }
    if (this.#activeDrainRequest !== void 0) {
      return Promise.reject(new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "Worker drain request is already active"
      ));
    }
    const queued = this.#queuedDrainRequests.shift();
    if (queued !== void 0) {
      this.#activeDrainRequest = queued;
      return Promise.resolve(queued);
    }
    this.#drainRequestWaiter ??= createDeferred9();
    return this.#drainRequestWaiter.promise;
  }
  completeDrain(request) {
    if (this.#phase !== "draining" || this.#activeDrainRequest !== request) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "Worker drain completion does not match the active request"
      );
    }
    this.#activeDrainRequest = void 0;
    if (this.#queuedDrainRequests.length === 0) {
      this.#phase = "running";
    }
  }
  fail(error) {
    this.#beginStop(error, true, false);
  }
  drain() {
    if (this.#businessPendingMessages === 0) {
      return Promise.resolve();
    }
    this.#drainDeferred ??= createDeferred9();
    return this.#drainDeferred.promise;
  }
  stats() {
    return Object.freeze({
      phase: this.#phase,
      stopping: this.stopping,
      maxMessages: this.#businessMaxMessages,
      maxBytes: this.#businessMaxBytes,
      pressured: this.#businessPressured,
      highWaterMessages: this.#businessHighMessages,
      highWaterBytes: this.#businessHighBytes,
      lowWaterMessages: this.#businessLowMessages,
      lowWaterBytes: this.#businessLowBytes,
      pendingMessages: this.#businessPendingMessages,
      pendingBytes: this.#businessPendingBytes,
      queuedMessages: this.#businessQueue.length,
      queuedBytes: this.#businessQueuedBytes,
      inFlightMessages: this.#businessInFlight === void 0 ? 0 : 1,
      inFlightBytes: this.#businessInFlight?.byteLength ?? 0,
      acceptedMessages: this.#acceptedBusinessMessages,
      rejectedMessages: this.#rejectedBusinessMessages,
      completedMessages: this.#completedBusinessMessages,
      failedMessages: this.#failedBusinessMessages,
      draining: this.#drainDeferred !== void 0
    });
  }
  dispose() {
    this.#phase = "stopping";
    this.#disposeMessage();
    this.#disposeProtocolError();
    this.#disposeMessage = () => {
    };
    this.#disposeProtocolError = () => {
    };
    this.#queuedDrainRequests.length = 0;
    this.#settleDrainWaiter(null);
    this.#settleDrain();
  }
  #onEnvelope = (envelope) => {
    if (this.#phase === "stopping") {
      return;
    }
    if (this.#phase === "bootstrap") {
      try {
        const bootstrap = parseBootstrapControlEnvelope(envelope);
        this.#bootstrapValue = bootstrap;
        this.#phase = "initializing";
        this.#bootstrap.resolve(bootstrap);
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    if (envelope.messageType === IPC_MESSAGE_TYPE.CONTROL_DRAIN) {
      try {
        this.#acceptDrainRequest(envelope);
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    if (CONTROL_MESSAGE_TYPES2.has(envelope.messageType)) {
      try {
        parseShutdownControlEnvelope(envelope, this.#requireBootstrap());
        this.#beginStop("CONTROL_SHUTDOWN", false, true);
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    if (this.#phase === "initializing") {
      this.fail(new FrameworkError(
        FRAMEWORK_ERROR_CODE.WORKER_NOT_READY,
        "Worker received business IPC before READY"
      ));
      return;
    }
    this.#enqueueBusiness(envelope);
  };
  #acceptDrainRequest(envelope) {
    if (this.#phase !== "running" && this.#phase !== "draining") {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `Worker cannot accept a drain request from ${this.#phase}`
      );
    }
    const request = parseLifecycleControlEnvelope(
      envelope,
      this.#requireBootstrap()
    );
    if (request.action !== LIFECYCLE_CONTROL_ACTION.DRAIN_REQUEST) {
      throw new TypeError("Worker only accepts Master-authored DRAIN_REQUEST controls");
    }
    const pendingDrainRequests = this.#queuedDrainRequests.length + (this.#activeDrainRequest === void 0 ? 0 : 1);
    if (pendingDrainRequests >= DEFAULT_CONTROL_QUEUE_MAX_MESSAGES) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
        "Worker drain barrier queue is full",
        {
          maxRequests: DEFAULT_CONTROL_QUEUE_MAX_MESSAGES,
          pendingRequests: pendingDrainRequests
        }
      );
    }
    this.#phase = "draining";
    if (this.#activeDrainRequest === void 0 && this.#drainRequestWaiter !== void 0) {
      this.#activeDrainRequest = request;
      this.#settleDrainWaiter(request);
      return;
    }
    this.#queuedDrainRequests.push(request);
  }
  #requireBootstrap() {
    if (this.#bootstrapValue === void 0) {
      throw new Error("worker message mux has no validated bootstrap");
    }
    return this.#bootstrapValue;
  }
  #enqueueBusiness(envelope) {
    const bus = this.#bus;
    const masterPeer = this.#masterPeer;
    if (bus === void 0 || masterPeer === void 0) {
      this.fail(new Error("worker ProcessBus is not bound"));
      return;
    }
    let encoded;
    try {
      encoded = this.#codec.decode(envelope);
    } catch (error) {
      this.#rejectedBusinessMessages += 1;
      this.fail(error);
      return;
    }
    if (this.#businessPendingMessages >= this.#businessMaxMessages || encoded.byteLength > this.#businessMaxBytes - this.#businessPendingBytes) {
      this.#rejectedBusinessMessages += 1;
      this.fail(new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL,
        "Worker entry business IPC queue is full",
        {
          maxMessages: this.#businessMaxMessages,
          maxBytes: this.#businessMaxBytes,
          pendingMessages: this.#businessPendingMessages,
          pendingBytes: this.#businessPendingBytes,
          messageBytes: encoded.byteLength
        }
      ));
      return;
    }
    this.#businessQueue.push(encoded);
    this.#businessPendingMessages += 1;
    this.#businessPendingBytes += encoded.byteLength;
    this.#businessQueuedBytes += encoded.byteLength;
    this.#acceptedBusinessMessages += 1;
    this.#updateBusinessPressure();
    this.#pumpBusiness();
  }
  #pumpBusiness() {
    if (this.#businessInFlight !== void 0) {
      return;
    }
    const pending = this.#businessQueue.shift();
    if (pending === void 0) {
      this.#settleDrain();
      return;
    }
    const bus = this.#requireBus();
    const masterPeer = this.#requireMasterPeer();
    this.#businessQueuedBytes -= pending.byteLength;
    this.#businessInFlight = pending;
    void Promise.resolve().then(() => bus.acceptFrom(masterPeer, pending.envelope)).then(
      () => this.#settleBusiness(pending, false),
      (error) => this.#settleBusiness(pending, true, error)
    );
  }
  #settleBusiness(pending, failed, error) {
    if (this.#businessInFlight !== pending) {
      return;
    }
    this.#businessInFlight = void 0;
    this.#businessPendingMessages -= 1;
    this.#businessPendingBytes -= pending.byteLength;
    this.#updateBusinessPressure();
    if (failed) {
      this.#failedBusinessMessages += 1;
      this.fail(error);
    } else {
      this.#completedBusinessMessages += 1;
    }
    this.#settleDrain();
    this.#pumpBusiness();
  }
  #requireBus() {
    if (this.#bus === void 0) {
      throw new Error("worker ProcessBus is not bound");
    }
    return this.#bus;
  }
  #requireMasterPeer() {
    if (this.#masterPeer === void 0) {
      throw new Error("worker master ProcessBus peer is not bound");
    }
    return this.#masterPeer;
  }
  #settleDrain() {
    if (this.#businessPendingMessages !== 0 || this.#drainDeferred === void 0) {
      return;
    }
    const deferred = this.#drainDeferred;
    this.#drainDeferred = void 0;
    deferred.resolve();
  }
  #capacityState() {
    return Object.freeze({
      pressured: this.#businessPressured,
      pendingMessages: this.#businessPendingMessages,
      pendingBytes: this.#businessPendingBytes,
      maxMessages: this.#businessMaxMessages,
      maxBytes: this.#businessMaxBytes,
      highWaterMessages: this.#businessHighMessages,
      highWaterBytes: this.#businessHighBytes,
      lowWaterMessages: this.#businessLowMessages,
      lowWaterBytes: this.#businessLowBytes
    });
  }
  #updateBusinessPressure() {
    const atHighWater = this.#businessPendingMessages >= this.#businessHighMessages || this.#businessPendingBytes >= this.#businessHighBytes;
    const atOrBelowLowWater = this.#businessPendingMessages <= this.#businessLowMessages && this.#businessPendingBytes <= this.#businessLowBytes;
    const nextPressured = this.#businessPressured ? !atOrBelowLowWater : atHighWater;
    if (nextPressured === this.#businessPressured) {
      return;
    }
    this.#businessPressured = nextPressured;
    const listener = this.#onBusinessCapacityChange;
    if (listener === void 0) {
      return;
    }
    try {
      listener(this.#capacityState());
    } catch {
    }
  }
  #beginStop(reason, failed, invokeWorkerStop) {
    if (this.#stopOutcome !== void 0) {
      return;
    }
    const previousPhase = this.#phase;
    const outcome = Object.freeze({ reason, failed, invokeWorkerStop });
    this.#stopOutcome = outcome;
    this.#phase = "stopping";
    this.#context?.requestStop(reason);
    if (previousPhase === "bootstrap") {
      this.#bootstrap.reject(reason);
    }
    this.#queuedDrainRequests.length = 0;
    this.#settleDrainWaiter(null);
    this.#stopped.resolve(outcome);
    this.#settleDrain();
  }
  #settleDrainWaiter(request) {
    const waiter = this.#drainRequestWaiter;
    if (waiter === void 0) {
      return;
    }
    this.#drainRequestWaiter = void 0;
    waiter.resolve(request);
  }
};
async function collectCleanupFailure(failures, cleanup) {
  try {
    await cleanup();
  } catch (error) {
    failures.push(error);
  }
}
async function runWorkerEntry(options = {}) {
  const endpoint = new NodeParentProcessEndpoint();
  const transport = new BoundedProcessTransport(endpoint);
  let capacityBootstrap;
  let capacityControlEnabled = false;
  let capacitySequence = 1;
  let mux;
  mux = new WorkerEntryMessageMux(transport, endpoint, {
    onBusinessCapacityChange: (state) => {
      if (!capacityControlEnabled || capacityBootstrap === void 0 || mux.stopping) {
        return;
      }
      let completion;
      try {
        const envelope = createCapacityControlEnvelope(capacityBootstrap, {
          messageId: `capacity:${process.pid}:${capacitySequence}:${randomUUID6()}`,
          sequence: capacitySequence,
          pressured: state.pressured,
          pendingMessages: state.pendingMessages,
          pendingBytes: state.pendingBytes
        });
        capacitySequence += 1;
        completion = transport.send(envelope, PROCESS_TRANSPORT_LANE.CONTROL);
      } catch (error) {
        mux.fail(error);
        return;
      }
      void completion.catch((error) => {
        mux.fail(error);
      });
    }
  });
  let context;
  let sharedState;
  let sharedStateRegistered = false;
  let bus;
  let networkEvents;
  let networkCommands;
  let rustDataPlane;
  let tasks;
  let processMessages;
  let lifecycle;
  let initializerContext;
  let initializationSucceeded = false;
  let workerExitInvoked = false;
  let maxRequestStopRequested = false;
  let invokeWorkerStop = false;
  let executionFailed = false;
  let executionError;
  let closeReason = "Worker entry completed";
  try {
    const bootstrap = await mux.receiveBootstrap();
    capacityBootstrap = bootstrap;
    const sharedStateProvider = options.sharedStateProvider ?? new NativeSharedRuntimeStateProvider();
    sharedState = sharedStateProvider.attachReader(bootstrap.sharedRuntime);
    context = createWorkerRuntimeContext(bootstrap, process.pid);
    context.registerResource("worker.shared-runtime-state", sharedState);
    sharedStateRegistered = true;
    context.registerResource("worker.process-transport", transport);
    lifecycle = context.registerResource(
      "worker.lifecycle-controller",
      new WorkerLifecycleController({
        bootstrap,
        transport,
        onDeliveryError: (error) => {
          context?.log("error", "runtime.worker.lifecycle_delivery_failed", {
            workerId: context.worker_id,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
    bus = context.registerResource("worker.process-bus", new ProcessBus({
      localIdentity: {
        role: context.role,
        workerId: context.worker_id,
        generation: context.generation
      },
      timers: context.timers,
      metrics: context.metrics
    }));
    const masterPeer = bus.attachPeer({
      role: PROCESS_ROLE.MASTER,
      workerId: null,
      generation: null,
      transport
    });
    bus.activatePeer(masterPeer);
    tasks = context.registerResource("worker.tasks", new WorkerTaskRuntime({
      bus,
      workerNum: context.settings.worker_num,
      taskWorkerNum: context.settings.task_worker_num,
      userTaskWorkerNum: context.settings.user_task_worker_num ?? 0,
      onDeliveryError: (error) => {
        context?.log("error", "runtime.worker.task_delivery_failed", {
          workerId: context.worker_id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }));
    processMessages = context.registerResource(
      "worker.process-messages",
      new WorkerProcessMessenger({
        bus,
        workerNum: context.settings.worker_num,
        taskWorkerNum: context.settings.task_worker_num,
        userTaskWorkerNum: context.settings.user_task_worker_num ?? 0,
        onDeliveryError: (error) => {
          context?.log("error", "runtime.worker.process_message_delivery_failed", {
            workerId: context.worker_id,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
    if (context.role === PROCESS_ROLE.WORKER) {
      const maxRequest = context.settings.max_request ?? 0;
      const lifecycleController = lifecycle;
      networkEvents = context.registerResource(
        "worker.network-events",
        new WorkerNetworkEventReceiver({
          bus,
          localWorkerId: context.worker_id,
          ...maxRequest === 0 ? {} : {
            onMessageComplete: (completedMessages) => {
              if (maxRequestStopRequested || completedMessages < maxRequest) {
                return;
              }
              maxRequestStopRequested = true;
              if (!lifecycleController.stop()) {
                context?.log("error", "runtime.worker.max_request_stop_rejected", {
                  workerId: context.worker_id,
                  completedMessages,
                  maxRequest,
                  error: lifecycleController.getLastError()
                });
              }
            }
          }
        })
      );
    }
    if (process.env.ALLOY_CORE_RUST_DATA_PLANE === "1" && context.settings.protocol === "tcp") {
      rustDataPlane = context.registerResource(
        "worker.rust-data-plane",
        new RustWorkerDataPlane({
          context,
          ...networkEvents === void 0 ? {} : { receiver: networkEvents },
          path: rustDataPlanePath(context.master_pid, context.masterGeneration)
        })
      );
    }
    networkCommands = new WorkerNetworkCommandSender({
      bus,
      sharedState,
      ...rustDataPlane === void 0 ? {} : { nativeDataPlane: rustDataPlane },
      ...context.settings.buffer_output_size === void 0 ? {} : { maxPayloadBytes: context.settings.buffer_output_size },
      onDeliveryError: (error) => {
        context?.log("error", "runtime.worker.network_command_delivery_failed", {
          workerId: context.worker_id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    });
    mux.bindRuntime(context, bus, masterPeer);
    if (!mux.stopping) {
      initializerContext = Object.freeze({
        context,
        sharedState,
        bus,
        networkEvents: networkEvents ?? null,
        networkCommands,
        tasks,
        processMessages,
        lifecycle
      });
      await options.initialize?.(initializerContext);
      initializationSucceeded = true;
    }
    if (!mux.stopping) {
      if (initializerContext === void 0) {
        throw new Error("Worker initializer context is unavailable before READY");
      }
      const ready = createReadyControlEnvelope(bootstrap, {
        messageId: `ready:${context.worker_pid}:${randomUUID6()}`,
        workerPid: createProcessPid(process.pid)
      });
      bus.activateLocal();
      const readySent = transport.send(ready, PROCESS_TRANSPORT_LANE.CONTROL);
      capacityControlEnabled = true;
      mux.startRunning();
      await readySent;
      options.onReady?.(initializerContext);
    }
    while (true) {
      const drainRequest = await mux.waitForDrainRequest();
      if (drainRequest === null) {
        break;
      }
      if (initializerContext === void 0) {
        throw new Error("Worker initializer context is unavailable during drain");
      }
      context.requestStop(drainRequest);
      tasks.sealNewTasks(drainRequest);
      bus.sealLocalRequests(drainRequest);
      await mux.drain();
      await bus.drain();
      await rustDataPlane?.drain();
      await tasks.drainPendingTasks();
      await tasks.drain();
      await bus.drain();
      if (!mux.stopping && initializationSucceeded && !workerExitInvoked) {
        workerExitInvoked = true;
        await options.onWorkerExit?.(initializerContext);
        await tasks.drain();
        await bus.drain();
      }
      if (mux.stopping) {
        break;
      }
      const drainedSequence = context.idGenerator.next();
      const drained = transport.sendControlAfterData(
        createDrained(bootstrap, {
          messageId: `drained:${context.worker_id}:${context.generation}:${drainedSequence}:${randomUUID6()}`,
          sequence: drainedSequence,
          requestId: drainRequest.requestId
        })
      );
      mux.completeDrain(drainRequest);
      await drained;
    }
    const stop = await mux.waitForStop();
    closeReason = stop.reason;
    if (stop.failed) {
      throw stop.reason;
    }
    invokeWorkerStop = stop.invokeWorkerStop && initializationSucceeded;
  } catch (error) {
    executionFailed = true;
    executionError = error;
    closeReason = error;
    mux.fail(error);
  }
  context?.requestStop(closeReason);
  mux.dispose();
  tasks?.sealNewTasks(closeReason);
  const cleanupFailures = [];
  if (bus !== void 0) {
    await collectCleanupFailure(
      cleanupFailures,
      () => bus.sealLocalRequests(closeReason)
    );
  }
  await collectCleanupFailure(cleanupFailures, () => mux.drain());
  if (bus !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => bus.drain());
  }
  if (tasks !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => tasks.drain());
  }
  if (bus !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => bus.drain());
  }
  if (invokeWorkerStop && initializerContext !== void 0 && options.onWorkerStop !== void 0) {
    await collectCleanupFailure(
      cleanupFailures,
      () => options.onWorkerStop?.(initializerContext)
    );
  }
  networkCommands?.seal(closeReason);
  processMessages?.seal(closeReason);
  tasks?.seal(closeReason);
  lifecycle?.close(closeReason);
  if (bus !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => bus.drain());
  }
  if (rustDataPlane !== void 0) {
    await collectCleanupFailure(
      cleanupFailures,
      () => rustDataPlane.close(closeReason)
    );
  }
  if (networkEvents !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => networkEvents.close(closeReason));
  }
  if (processMessages !== void 0) {
    await collectCleanupFailure(
      cleanupFailures,
      () => processMessages.close(closeReason)
    );
  }
  if (tasks !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => tasks.close(closeReason));
  }
  if (bus !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => bus.close(closeReason));
  }
  if (context !== void 0) {
    await collectCleanupFailure(cleanupFailures, () => context.closeGlobally(closeReason));
  } else {
    await collectCleanupFailure(cleanupFailures, () => transport.close(closeReason));
  }
  if (sharedState !== void 0 && !sharedStateRegistered) {
    await collectCleanupFailure(cleanupFailures, () => sharedState?.close(closeReason));
  }
  endpoint.disconnect();
  await endpoint.closed;
  if (executionFailed && cleanupFailures.length > 0) {
    throw new AggregateError(
      [executionError, ...cleanupFailures],
      "Worker entry and cleanup both failed"
    );
  }
  if (executionFailed) {
    throw executionError;
  }
  if (cleanupFailures.length === 1) {
    throw cleanupFailures[0];
  }
  if (cleanupFailures.length > 1) {
    throw new AggregateError(cleanupFailures, "Worker entry cleanup failed");
  }
}

// src/runtime/runtime-server.ts
var EMPTY_RUNTIME_CAPACITY_STATS = Object.freeze({
  ipcPendingRequests: 0,
  ipcPendingMessages: 0,
  ipcPendingBytes: 0,
  ipcPressuredPeers: 0,
  ipcRejectionCount: 0,
  inputPausedConnections: 0,
  inputQueuedBytes: 0,
  inputPauseCount: 0,
  inputResumeCount: 0,
  inputTimeoutCount: 0,
  inputRejectionCount: 0,
  outputFullConnections: 0,
  outputOverflowConnections: 0,
  outputQueuedBytes: 0,
  outputFullCount: 0,
  outputEmptyCount: 0,
  outputOverflowCount: 0,
  outputTimeoutCount: 0,
  outputRejectionCount: 0,
  taskPending: 0,
  taskAssignments: 0,
  taskRejectionCount: 0
});

// src/runtime/runtime-server-facade.ts
var WEB_SOCKET_STATUS_ACTIVE = 3;
var RUNTIME_CALLBACK_NAMES = Object.freeze([
  "onStart",
  "onShutdown",
  "onManagerStart",
  "onManagerStop",
  "onWorkerStart",
  "onWorkerExit",
  "onWorkerStop",
  "onWorkerError",
  "onBeforeReload",
  "onConnect",
  "onOpen",
  "onReceive",
  "onMessage",
  "onRequest",
  "onClose",
  "onTask",
  "onFinish",
  "onPipeMessage",
  "onPipeRequest",
  "onBufferFull",
  "onBufferEmpty"
]);
var DynamicRuntimeConnectionView = class {
  #sessions;
  #size;
  constructor(sessions, size) {
    this.#sessions = sessions;
    this.#size = size;
  }
  get size() {
    return this.#size();
  }
  *[Symbol.iterator]() {
    yield* [...this.#sessions()];
  }
};
function unixSeconds(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return 0;
  }
  return Math.max(0, Math.floor(milliseconds / 1e3));
}
function connectionInfo(connection) {
  const common = {
    remote_ip: connection.remoteAddress,
    remote_port: connection.remotePort,
    server_port: connection.serverPort,
    connect_time: unixSeconds(connection.connectedAtMs),
    last_time: unixSeconds(connection.lastActiveAtMs)
  };
  return Object.freeze(
    connection.protocol === "websocket" ? { ...common, websocket_status: WEB_SOCKET_STATUS_ACTIVE } : common
  );
}
function sharedConnectionInfo(connection) {
  return connectionInfo({
    protocol: connection.protocol,
    remoteAddress: connection.remoteAddress,
    remotePort: connection.remotePort,
    serverPort: connection.serverPort,
    connectedAtMs: connection.connectedAtMs,
    lastActiveAtMs: connection.lastActiveAtMs,
    outputBufferedBytes: connection.outputBufferBytes,
    outputBufferFull: connection.outputBufferFull,
    outputOverflow: connection.overflow
  });
}
function asRuntimeConnectionSnapshot(protocol, remoteAddress, remotePort, serverPort, connectedAtMs, lastActiveAtMs) {
  return {
    protocol,
    remoteAddress,
    remotePort,
    serverPort,
    connectedAtMs,
    lastActiveAtMs,
    outputBufferedBytes: 0,
    outputBufferFull: false,
    outputOverflow: false
  };
}
function boundedAdd(left, right) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}
function freezeCapacityStats(capacity = {}) {
  return Object.freeze({ ...EMPTY_RUNTIME_CAPACITY_STATS, ...capacity });
}
function ipcCapacityStats(stats) {
  let pendingMessages = stats?.mailboxMessages ?? 0;
  let pendingBytes = stats?.mailboxBytes ?? 0;
  for (const peer of stats?.peers ?? []) {
    pendingMessages = boundedAdd(
      pendingMessages,
      peer.transport.pendingMessages
    );
    pendingBytes = boundedAdd(pendingBytes, peer.transport.pendingBytes);
  }
  return {
    ipcPendingRequests: stats?.pendingRequests ?? 0,
    ipcPendingMessages: pendingMessages,
    ipcPendingBytes: pendingBytes,
    ipcPressuredPeers: stats?.pressuredPeers ?? 0,
    ipcRejectionCount: stats?.rejectionCounts?.[FRAMEWORK_ERROR_CODE.IPC_QUEUE_FULL] ?? 0
  };
}
function optionalStats(source) {
  if (source === null || source === void 0 || typeof source.stats !== "function") {
    return void 0;
  }
  return source.stats();
}
function safeSharedRead(sharedState, read, failureValue) {
  if (sharedState === void 0) {
    return void 0;
  }
  try {
    return read(sharedState);
  } catch {
    return failureValue;
  }
}
function sharedStat(stats, metricId) {
  if (stats === void 0) {
    return void 0;
  }
  return stats[metricId] ?? 0;
}
var LocalRuntimeServerFacade = class {
  #errorCounts = /* @__PURE__ */ new Map();
  #lastError = null;
  #invalidSessions = 0;
  #staleGenerations = 0;
  task(_data, _taskWorkerId) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  finish(_data) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  sendMessage(_message, _targetWorkerId) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  requestMessage(_message, _targetWorkerId, _timeoutMs) {
    return Promise.reject(new FrameworkError(
      FRAMEWORK_ERROR_CODE.INVALID_STATE,
      "RuntimeServer process requests are unavailable"
    ));
  }
  push(_fd, _data, _opcode) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  send(_fd, _data) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  close(_fd, _code, _reason) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  exist(_fd) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  connection_info(_fd) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  connection_owner(_fd) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  workers() {
    return Object.freeze([]);
  }
  addStat(_metricId, _delta) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  snapshotStats() {
    return Object.freeze([]);
  }
  atomicGet(_atomicId) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  atomicAdd(_atomicId, _delta) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  atomicSet(_atomicId, _value) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  atomicCompareSet(_atomicId, _expected, _value) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  lockTry(_lockId, _ownerToken = process.pid) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  async lockAcquire(lockId, ownerToken = process.pid, timeoutMs = 5e3) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lockTry(lockId, ownerToken)) return true;
      await new Promise((resolve4) => setTimeout(resolve4, 1));
    }
    return false;
  }
  lockRelease(_lockId, _ownerToken = process.pid) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  stop(_workerId) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  reload(_onlyTaskWorker) {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  shutdown() {
    return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  getLastError() {
    return this.#lastError;
  }
  delegated(result, succeeded, error) {
    if (succeeded) {
      this.#lastError = null;
      return result;
    }
    this.recordFailure(error ?? FRAMEWORK_ERROR_CODE.INVALID_STATE);
    return result;
  }
  succeed(result) {
    this.#lastError = null;
    return result;
  }
  fail(code) {
    this.recordFailure(code);
    return false;
  }
  runtimeStats(connections, workers, taskWorkers, staleGenerations = 0, invalidSessions = 0, externalErrors = {}, capacity = {}) {
    const mergedErrors = new Map(this.#errorCounts);
    for (const [code, count] of Object.entries(externalErrors)) {
      if (count === void 0 || count === 0) {
        continue;
      }
      const typedCode = code;
      mergedErrors.set(typedCode, (mergedErrors.get(typedCode) ?? 0) + count);
    }
    const errors = Object.freeze(
      Object.fromEntries(mergedErrors)
    );
    return Object.freeze({
      connections,
      workers,
      taskWorkers,
      invalidSessions: this.#invalidSessions + invalidSessions,
      staleGenerations: this.#staleGenerations + staleGenerations,
      capacity: freezeCapacityStats(capacity),
      errors
    });
  }
  #recordCount(code) {
    const current = this.#errorCounts.get(code) ?? 0;
    this.#errorCounts.set(code, current + 1);
  }
  recordFailure(code) {
    this.#lastError = code;
    this.#recordCount(code);
    if (code === FRAMEWORK_ERROR_CODE.INVALID_SESSION || code === FRAMEWORK_ERROR_CODE.SESSION_CLOSED) {
      this.#invalidSessions += 1;
    }
    if (code === FRAMEWORK_ERROR_CODE.STALE_GENERATION) {
      this.#staleGenerations += 1;
    }
  }
};
var MasterRuntimeServerFacade = class extends LocalRuntimeServerFacade {
  worker_id = null;
  worker_pid = null;
  taskworker = false;
  generation = null;
  setting;
  master_pid;
  connections;
  #context;
  #sharedState;
  #network = null;
  #supervisor = null;
  #networkCommands = null;
  constructor(context, sharedState) {
    super();
    this.#context = context;
    this.#sharedState = sharedState;
    this.setting = context.settings;
    this.master_pid = context.masterPid;
    this.connections = new DynamicRuntimeConnectionView(
      () => safeSharedRead(
        this.#sharedState,
        (state) => state.snapshotOpenSessionIds(),
        Object.freeze([])
      ) ?? this.#openConnectionIds(),
      () => safeSharedRead(
        this.#sharedState,
        (state) => state.connectionCount(),
        0
      ) ?? this.#openConnectionIds().length
    );
  }
  attachNetwork(network, commands) {
    if (this.#network !== null && this.#network !== network) {
      throw new Error("Master RuntimeServer facade already has a NetworkServer");
    }
    this.#network = network;
    if (commands !== void 0) {
      if (this.#networkCommands !== null && this.#networkCommands !== commands) {
        throw new Error("Master RuntimeServer facade already has a command receiver");
      }
      this.#networkCommands = commands;
    }
  }
  attachSupervisor(supervisor) {
    if (this.#supervisor !== null && this.#supervisor !== supervisor) {
      throw new Error("Master RuntimeServer facade already has a ProcessSupervisor");
    }
    this.#supervisor = supervisor;
  }
  async requestMessage(message, targetWorkerId, timeoutMs) {
    const supervisor = this.#supervisor;
    if (supervisor === null) {
      throw new FrameworkError(FRAMEWORK_ERROR_CODE.INVALID_STATE, "Process supervisor is unavailable");
    }
    const slot = supervisor.registry.getSlot(targetWorkerId);
    if (slot === void 0) {
      throw new FrameworkError(
        FRAMEWORK_ERROR_CODE.UNKNOWN_WORKER,
        `target Worker ID ${targetWorkerId} is outside the configured process pool`
      );
    }
    const response = await supervisor.bus.request({
      messageType: IPC_MESSAGE_TYPE.PROCESS_MESSAGE,
      targetRole: slot.role,
      targetWorkerId,
      payload: message,
      ...timeoutMs === void 0 ? {} : { timeoutMs }
    });
    return response.payload;
  }
  connection_owner(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    try {
      const probe = this.#sharedState?.probeConnection(fd);
      return probe?.status === "open" && probe.record?.ownerWorkerId !== null && probe.record?.ownerWorkerId !== void 0 ? this.succeed(probe.record.ownerWorkerId) : this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  workers() {
    const records = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotWorkers(),
      Object.freeze([])
    ) ?? this.#supervisor?.registry.snapshot() ?? [];
    return Object.freeze(records.map((record) => Object.freeze({
      workerId: record.workerId,
      role: record.role,
      state: record.state,
      pid: record.pid,
      generation: record.generation
    })));
  }
  addStat(metricId, delta = 1) {
    try {
      return this.succeed(this.#sharedState?.addStat(metricId, delta) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  snapshotStats() {
    return safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotStats(),
      Object.freeze([])
    ) ?? Object.freeze([]);
  }
  atomicGet(atomicId) {
    try {
      return this.succeed(this.#sharedState?.atomicGet?.(atomicId) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicAdd(atomicId, delta) {
    try {
      return this.succeed(this.#sharedState?.atomicAdd?.(atomicId, delta) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicSet(atomicId, value) {
    try {
      return this.succeed(this.#sharedState?.atomicSet?.(atomicId, value) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicCompareSet(atomicId, expected, value) {
    try {
      return this.succeed(this.#sharedState?.atomicCompareSet?.(atomicId, expected, value) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  lockTry(lockId, ownerToken = process.pid) {
    try {
      return this.succeed(this.#sharedState?.lockTry?.(lockId, ownerToken) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  lockRelease(lockId, ownerToken = process.pid) {
    try {
      return this.succeed(this.#sharedState?.lockRelease?.(lockId, ownerToken) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  exist(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    let sharedProbe;
    try {
      sharedProbe = this.#sharedState?.probeConnection(fd);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    if (sharedProbe !== void 0) {
      return this.succeed(sharedProbe.status === "open");
    }
    const record = this.#network?.connections.get(fd);
    if (record?.state !== CONNECTION_STATE.OPEN) {
      return this.succeed(false);
    }
    return this.succeed(true);
  }
  connection_info(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    let sharedProbe;
    try {
      sharedProbe = this.#sharedState?.probeConnection(fd);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    if (sharedProbe !== void 0) {
      return sharedProbe.status === "open" && sharedProbe.record !== void 0 ? this.succeed(sharedConnectionInfo(sharedProbe.record)) : this.succeed(false);
    }
    const record = this.#network?.connections.get(fd);
    if (record?.state !== CONNECTION_STATE.OPEN) {
      return this.succeed(false);
    }
    const protocol = record.protocolState.kind;
    return this.succeed(connectionInfo(asRuntimeConnectionSnapshot(
      protocol,
      record.peerInfo.remoteAddress,
      record.peerInfo.remotePort,
      record.peerInfo.localPort,
      record.connectedAt,
      record.lastActiveAt
    )));
  }
  stop(workerId) {
    if (workerId === void 0 || this.#supervisor === null) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    try {
      const receipt = this.#supervisor.requestWorkerRestart(
        workerId,
        "Master RuntimeServer.stop"
      );
      this.#observeLifecycleCompletion("stop", receipt.completion);
      return this.succeed(true);
    } catch (error) {
      return this.fail(this.#lifecycleErrorCode(error));
    }
  }
  reload(onlyTaskWorker = false) {
    if (this.#supervisor === null || typeof onlyTaskWorker !== "boolean") {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    try {
      const receipt = this.#supervisor.requestReload(
        onlyTaskWorker,
        "Master RuntimeServer.reload"
      );
      this.#observeLifecycleCompletion("reload", receipt.completion);
      return this.succeed(true);
    } catch (error) {
      return this.fail(this.#lifecycleErrorCode(error));
    }
  }
  shutdown() {
    const accepted = this.#context.requestStop(
      new Error("Master RuntimeServer.shutdown requested")
    );
    return accepted ? this.succeed(true) : this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
  }
  stats() {
    const records = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotWorkers(),
      Object.freeze([])
    ) ?? this.#supervisor?.registry.snapshot() ?? [];
    const sharedStats = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotStats(),
      Object.freeze([])
    );
    const activeRecords = records.filter(
      (record) => record.pid !== null && record.state !== WORKER_STATE.EXITED && record.state !== WORKER_STATE.FAILED
    );
    const busStats = optionalStats(this.#supervisor?.bus);
    const routerStats = optionalStats(this.#supervisor?.taskRouter);
    const commandStats = optionalStats(this.#networkCommands);
    const networkStats = optionalStats(this.#network);
    const unknownSessions = commandStats?.rejectionCounts[MASTER_NETWORK_COMMAND_REJECTION_REASON.UNKNOWN_SESSION] ?? 0;
    const nonOpenSessions = commandStats?.rejectionCounts[MASTER_NETWORK_COMMAND_REJECTION_REASON.SESSION_NOT_OPEN] ?? 0;
    const missingSessions = commandStats?.rejectionCounts[MASTER_NETWORK_COMMAND_REJECTION_REASON.MISSING_SESSION] ?? 0;
    const invalidSessions = unknownSessions + nonOpenSessions + missingSessions;
    const externalErrors = {
      ...busStats?.rejectionCounts ?? {}
    };
    const addError = (code, count) => {
      if (count !== 0) {
        externalErrors[code] = (externalErrors[code] ?? 0) + count;
      }
    };
    addError(FRAMEWORK_ERROR_CODE.INVALID_SESSION, unknownSessions + missingSessions);
    addError(FRAMEWORK_ERROR_CODE.SESSION_CLOSED, nonOpenSessions);
    addError(
      FRAMEWORK_ERROR_CODE.MESSAGE_TOO_LARGE,
      commandStats?.rejectionCounts[MASTER_NETWORK_COMMAND_REJECTION_REASON.MESSAGE_TOO_LARGE] ?? 0
    );
    addError(
      FRAMEWORK_ERROR_CODE.OUTPUT_BUFFER_OVERFLOW,
      commandStats?.rejectionCounts[MASTER_NETWORK_COMMAND_REJECTION_REASON.OUTPUT_BUFFER_OVERFLOW] ?? 0
    );
    addError(
      FRAMEWORK_ERROR_CODE.DRAIN_TIMEOUT,
      (networkStats?.inputTimeouts ?? 0) + (networkStats?.drainTimeouts ?? 0)
    );
    addError(FRAMEWORK_ERROR_CODE.STALE_GENERATION, routerStats?.stale ?? 0);
    addError(FRAMEWORK_ERROR_CODE.INVALID_STATE, routerStats?.rejected ?? 0);
    addError(
      FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
      routerStats?.deliveryErrors ?? 0
    );
    return this.runtimeStats(
      safeSharedRead(
        this.#sharedState,
        (state) => state.connectionCount(),
        0
      ) ?? this.#openConnectionIds().length,
      activeRecords.filter((record) => record.role === PROCESS_ROLE.WORKER).length,
      activeRecords.filter((record) => record.role === PROCESS_ROLE.TASK_WORKER).length,
      (busStats?.staleGenerationRejections ?? 0) + (routerStats?.stale ?? 0),
      invalidSessions,
      externalErrors,
      {
        ...ipcCapacityStats(busStats),
        inputPausedConnections: networkStats?.inputPausedConnections ?? 0,
        inputQueuedBytes: networkStats?.inputQueuedBytes ?? 0,
        inputPauseCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_PAUSE
        ) ?? networkStats?.inputPauseEvents ?? 0,
        inputResumeCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_RESUME
        ) ?? networkStats?.inputResumeEvents ?? 0,
        inputTimeoutCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_TIMEOUT
        ) ?? networkStats?.inputTimeouts ?? 0,
        inputRejectionCount: networkStats?.inputRejections ?? 0,
        outputFullConnections: networkStats?.outputBufferFullConnections ?? 0,
        outputOverflowConnections: networkStats?.outputBufferOverflowConnections ?? 0,
        outputQueuedBytes: networkStats?.outputBufferedBytes ?? 0,
        outputFullCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_FULL
        ) ?? networkStats?.bufferFullEvents ?? 0,
        outputEmptyCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_EMPTY
        ) ?? networkStats?.bufferEmptyEvents ?? 0,
        outputOverflowCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_OVERFLOW
        ) ?? networkStats?.bufferOverflowEvents ?? 0,
        outputTimeoutCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_TIMEOUT
        ) ?? networkStats?.drainTimeouts ?? 0,
        outputRejectionCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_REJECTION
        ) ?? networkStats?.writeRejections ?? 0,
        taskAssignments: routerStats?.pending ?? 0,
        taskRejectionCount: routerStats?.pendingAssignmentRejections ?? 0
      }
    );
  }
  #openConnectionIds() {
    const connections = this.#network?.connections;
    if (connections === void 0) {
      return [];
    }
    return [...connections].filter(
      (sessionId) => connections.get(sessionId)?.state === CONNECTION_STATE.OPEN
    );
  }
  #observeLifecycleCompletion(operation, completion) {
    void completion.catch((error) => {
      this.#context.metrics.recordError();
      this.#context.log("error", "runtime.server.lifecycle_operation_failed", {
        operation,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
  #lifecycleErrorCode(error) {
    return error instanceof FrameworkError ? error.code : FRAMEWORK_ERROR_CODE.INVALID_STATE;
  }
};
var WorkerRuntimeServerFacade = class extends LocalRuntimeServerFacade {
  worker_id;
  worker_pid;
  taskworker;
  setting;
  master_pid;
  generation;
  connections;
  #context;
  #bus;
  #networkCommands;
  #tasks;
  #processMessages;
  #lifecycle;
  #sharedState;
  #connectionSnapshots = /* @__PURE__ */ new Map();
  #bufferFullCount = 0;
  #bufferEmptyCount = 0;
  #bufferOverflowCount = 0;
  constructor(options) {
    super();
    this.#context = options.context;
    this.#bus = options.bus;
    this.#networkCommands = options.networkCommands;
    this.#tasks = options.tasks;
    this.#processMessages = options.processMessages;
    this.#lifecycle = options.lifecycle ?? null;
    this.#sharedState = options.sharedState;
    this.worker_id = options.context.worker_id;
    this.worker_pid = options.context.worker_pid;
    this.taskworker = options.context.taskworker;
    this.setting = options.context.setting;
    this.master_pid = options.context.master_pid;
    this.generation = options.context.generation;
    this.connections = new DynamicRuntimeConnectionView(
      () => safeSharedRead(
        this.#sharedState,
        (state) => state.snapshotOpenSessionIds(),
        Object.freeze([])
      ) ?? this.#connectionSnapshots.keys(),
      () => safeSharedRead(
        this.#sharedState,
        (state) => state.connectionCount(),
        0
      ) ?? this.#connectionSnapshots.size
    );
  }
  task(data, taskWorkerId) {
    const result = this.#tasks.task(data, taskWorkerId);
    return this.delegated(result, result !== false, this.#tasks.getLastError());
  }
  finish(data) {
    const result = this.#tasks.finish(data);
    return this.delegated(result, result, this.#tasks.getLastError());
  }
  sendMessage(message, targetWorkerId) {
    const result = this.#processMessages.sendMessage(message, targetWorkerId);
    return this.delegated(
      result,
      result,
      this.#processMessages.getLastError()
    );
  }
  requestMessage(message, targetWorkerId, timeoutMs) {
    return this.#processMessages.requestMessage(
      message,
      targetWorkerId,
      timeoutMs
    );
  }
  connection_owner(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    try {
      const probe = this.#sharedState?.probeConnection(fd);
      return probe?.status === "open" && probe.record?.ownerWorkerId !== null && probe.record?.ownerWorkerId !== void 0 ? this.succeed(probe.record.ownerWorkerId) : this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  workers() {
    return Object.freeze((this.#sharedState?.snapshotWorkers() ?? []).map((record) => Object.freeze({
      workerId: record.workerId,
      role: record.role,
      state: record.state,
      pid: record.pid,
      generation: record.generation
    })));
  }
  addStat(metricId, delta = 1) {
    try {
      return this.succeed(this.#sharedState?.addStat(metricId, delta) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  snapshotStats() {
    try {
      return this.#sharedState?.snapshotStats() ?? Object.freeze([]);
    } catch {
      return Object.freeze([]);
    }
  }
  atomicGet(atomicId) {
    try {
      return this.succeed(this.#sharedState?.atomicGet?.(atomicId) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicAdd(atomicId, delta) {
    try {
      return this.succeed(this.#sharedState?.atomicAdd?.(atomicId, delta) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicSet(atomicId, value) {
    try {
      return this.succeed(this.#sharedState?.atomicSet?.(atomicId, value) ?? 0);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  atomicCompareSet(atomicId, expected, value) {
    try {
      return this.succeed(this.#sharedState?.atomicCompareSet?.(atomicId, expected, value) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  lockTry(lockId, ownerToken = process.pid) {
    try {
      return this.succeed(this.#sharedState?.lockTry?.(lockId, ownerToken) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  lockRelease(lockId, ownerToken = process.pid) {
    try {
      return this.succeed(this.#sharedState?.lockRelease?.(lockId, ownerToken) ?? false);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
  }
  push(fd, data, opcode) {
    const result = opcode === void 0 ? this.#networkCommands.push(fd, data) : this.#networkCommands.push(fd, data, opcode);
    return this.delegated(result, result, this.#networkCommands.getLastError());
  }
  send(fd, data) {
    const result = this.#networkCommands.send(fd, data);
    return this.delegated(result, result, this.#networkCommands.getLastError());
  }
  close(fd, code, reason) {
    const result = this.#networkCommands.close(fd, code, reason);
    return this.delegated(result, result, this.#networkCommands.getLastError());
  }
  exist(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    let sharedProbe;
    try {
      sharedProbe = this.#sharedState?.probeConnection(fd);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    return this.succeed(
      sharedProbe === void 0 ? this.#connectionSnapshots.has(fd) : sharedProbe.status === "open"
    );
  }
  connection_info(fd) {
    if (!isSessionId(fd)) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_SESSION);
    }
    let sharedProbe;
    try {
      sharedProbe = this.#sharedState?.probeConnection(fd);
    } catch {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    if (sharedProbe !== void 0) {
      return sharedProbe.status === "open" && sharedProbe.record !== void 0 ? this.succeed(sharedConnectionInfo(sharedProbe.record)) : this.succeed(false);
    }
    const connection = this.#connectionSnapshots.get(fd);
    if (connection === void 0) {
      return this.succeed(false);
    }
    return this.succeed(connectionInfo(connection));
  }
  stop(workerId) {
    if (this.#lifecycle === null) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    const result = workerId === void 0 ? this.#lifecycle.stop() : this.#lifecycle.stop(workerId);
    return this.delegated(result, result, this.#lifecycle.getLastError());
  }
  reload(onlyTaskWorker = false) {
    if (this.#lifecycle === null) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    const result = this.#lifecycle.reload(onlyTaskWorker);
    return this.delegated(result, result, this.#lifecycle.getLastError());
  }
  shutdown() {
    if (this.#lifecycle === null) {
      return this.fail(FRAMEWORK_ERROR_CODE.INVALID_STATE);
    }
    const result = this.#lifecycle.shutdown();
    return this.delegated(result, result, this.#lifecycle.getLastError());
  }
  stats() {
    const busStats = optionalStats(this.#bus);
    const taskStats = optionalStats(this.#tasks);
    const commandStats = optionalStats(this.#networkCommands);
    const sharedWorkers = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotWorkers(),
      Object.freeze([])
    );
    const sharedStats = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotStats(),
      Object.freeze([])
    );
    let outputFullConnections = 0;
    let outputOverflowConnections = 0;
    let outputQueuedBytes = 0;
    const sharedSessionIds = safeSharedRead(
      this.#sharedState,
      (state) => state.snapshotOpenSessionIds(),
      Object.freeze([])
    );
    const connectionSnapshots = sharedSessionIds === void 0 ? [...this.#connectionSnapshots.values()] : sharedSessionIds.flatMap((sessionId) => {
      const probe = safeSharedRead(
        this.#sharedState,
        (state) => state.probeConnection(sessionId),
        Object.freeze({ status: "busy" })
      );
      return probe?.status === "open" && probe.record !== void 0 ? [{
        protocol: probe.record.protocol,
        remoteAddress: probe.record.remoteAddress,
        remotePort: probe.record.remotePort,
        serverPort: probe.record.serverPort,
        connectedAtMs: probe.record.connectedAtMs,
        lastActiveAtMs: probe.record.lastActiveAtMs,
        outputBufferedBytes: probe.record.outputBufferBytes,
        outputBufferFull: probe.record.outputBufferFull,
        outputOverflow: probe.record.overflow
      }] : [];
    });
    for (const connection of connectionSnapshots) {
      outputQueuedBytes = boundedAdd(
        outputQueuedBytes,
        connection.outputBufferedBytes
      );
      if (connection.outputBufferFull) {
        outputFullConnections += 1;
      }
      if (connection.outputOverflow) {
        outputOverflowConnections += 1;
      }
    }
    return this.runtimeStats(
      safeSharedRead(
        this.#sharedState,
        (state) => state.connectionCount(),
        0
      ) ?? this.#connectionSnapshots.size,
      sharedWorkers?.filter(
        (record) => record.pid !== null && record.role === PROCESS_ROLE.WORKER && record.state !== WORKER_STATE.EXITED && record.state !== WORKER_STATE.FAILED
      ).length ?? this.setting.worker_num,
      sharedWorkers?.filter(
        (record) => record.pid !== null && record.role === PROCESS_ROLE.TASK_WORKER && record.state !== WORKER_STATE.EXITED && record.state !== WORKER_STATE.FAILED
      ).length ?? this.setting.task_worker_num,
      0,
      0,
      {},
      {
        ...ipcCapacityStats(busStats),
        inputPauseCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_PAUSE
        ) ?? 0,
        inputResumeCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_RESUME
        ) ?? 0,
        inputTimeoutCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_INPUT_TIMEOUT
        ) ?? 0,
        outputFullConnections,
        outputOverflowConnections,
        outputQueuedBytes,
        outputFullCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_FULL
        ) ?? this.#bufferFullCount,
        outputEmptyCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_EMPTY
        ) ?? this.#bufferEmptyCount,
        outputOverflowCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_OVERFLOW
        ) ?? this.#bufferOverflowCount,
        outputTimeoutCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_TIMEOUT
        ) ?? 0,
        outputRejectionCount: sharedStat(
          sharedStats,
          SHARED_RUNTIME_STAT_METRIC.NETWORK_OUTPUT_REJECTION
        ) ?? commandStats?.rejectedCommands ?? 0,
        taskPending: taskStats?.pendingTasks ?? 0,
        taskRejectionCount: taskStats?.pendingTaskRejections ?? 0
      }
    );
  }
  acceptConnection(event) {
    const peer = event.payload.peerInfo;
    const snapshot = asRuntimeConnectionSnapshot(
      event.payload.protocol,
      peer.remoteAddress,
      peer.remotePort,
      peer.localPort,
      event.payload.connectedAt,
      isNetworkResumePayload(event.payload) ? event.payload.lastActiveAt : event.payload.connectedAt
    );
    if (isNetworkResumePayload(event.payload)) {
      snapshot.outputBufferedBytes = event.payload.outputBufferedBytes;
      snapshot.outputBufferFull = event.payload.outputBufferState !== NETWORK_BUFFER_STATE.EMPTY;
      snapshot.outputOverflow = event.payload.outputBufferState === NETWORK_BUFFER_STATE.OVERFLOW;
      const setOutputOverflow = this.#networkCommands.setOutputOverflow;
      if (typeof setOutputOverflow === "function") {
        setOutputOverflow.call(
          this.#networkCommands,
          event.sessionId,
          snapshot.outputOverflow
        );
      }
    }
    this.#connectionSnapshots.set(event.sessionId, snapshot);
  }
  touchConnection(event) {
    const connection = this.#connectionSnapshots.get(event.sessionId);
    if (connection !== void 0) {
      connection.lastActiveAtMs = this.#context.clock.wallTimeMs();
    }
  }
  applyBufferState(event) {
    const connection = this.#connectionSnapshots.get(event.sessionId);
    if (connection === void 0) {
      return;
    }
    connection.outputBufferedBytes = event.payload.bufferedBytes;
    if (event.payload.state === NETWORK_BUFFER_STATE.FULL) {
      if (!connection.outputBufferFull) {
        this.#bufferFullCount = boundedAdd(this.#bufferFullCount, 1);
      }
      connection.outputBufferFull = true;
    }
    if (event.payload.state === NETWORK_BUFFER_STATE.OVERFLOW) {
      if (!connection.outputOverflow) {
        this.#bufferOverflowCount = boundedAdd(this.#bufferOverflowCount, 1);
      }
      connection.outputBufferFull = true;
      connection.outputOverflow = true;
      const setOutputOverflow = this.#networkCommands.setOutputOverflow;
      if (typeof setOutputOverflow === "function") {
        setOutputOverflow.call(this.#networkCommands, event.sessionId, true);
      }
    } else if (event.payload.state === NETWORK_BUFFER_STATE.EMPTY) {
      if (connection.outputBufferFull || connection.outputOverflow) {
        this.#bufferEmptyCount = boundedAdd(this.#bufferEmptyCount, 1);
      }
      connection.outputBufferFull = false;
      connection.outputOverflow = false;
      const setOutputOverflow = this.#networkCommands.setOutputOverflow;
      if (typeof setOutputOverflow === "function") {
        setOutputOverflow.call(this.#networkCommands, event.sessionId, false);
      }
    }
  }
  forgetConnection(sessionId) {
    this.#connectionSnapshots.delete(sessionId);
    const forgetSession = this.#networkCommands.forgetSession;
    if (typeof forgetSession === "function") {
      forgetSession.call(this.#networkCommands, sessionId);
    }
  }
};
function normalizeRuntimeCallbacks(callbacks) {
  if (callbacks === void 0) {
    return Object.freeze({});
  }
  if (typeof callbacks !== "object" || callbacks === null) {
    throw new TypeError("Runtime callbacks must be an object");
  }
  const normalized = {};
  for (const name of RUNTIME_CALLBACK_NAMES) {
    const callback = callbacks[name];
    if (callback === void 0) {
      continue;
    }
    if (typeof callback !== "function") {
      throw new TypeError(`Runtime callback ${name} must be a function`);
    }
    normalized[name] = callback.bind(callbacks);
  }
  return Object.freeze(normalized);
}
function invokeRuntimeCallback(_name, callback) {
  return callback();
}
function bindWorkerRuntimeCallbacks(options) {
  const disposers = [];
  const { server, callbacks, facade } = options;
  const invoke = options.invoke ?? invokeRuntimeCallback;
  if (options.networkEvents !== null) {
    disposers.push(
      options.networkEvents.onConnect((event) => {
        facade.acceptConnection(event);
        if (isNetworkResumePayload(event.payload)) {
          return;
        }
        if (event.payload.protocol === "tcp") {
          return invoke(
            "onConnect",
            () => callbacks.onConnect?.(server, event.sessionId, 0)
          );
        }
        if (event.payload.request === null) {
          throw new TypeError("WebSocket NET_CONNECT requires a handshake request");
        }
        const request = Object.freeze({
          fd: event.sessionId,
          ...event.payload.request
        });
        return invoke("onOpen", () => callbacks.onOpen?.(server, request));
      }),
      options.networkEvents.onMessage((event) => {
        facade.touchConnection(event);
        if (event.payload.protocol === "tcp") {
          return invoke(
            "onReceive",
            () => callbacks.onReceive?.(
              server,
              event.sessionId,
              0,
              event.payload.data
            )
          );
        }
        const frame = Object.freeze({
          fd: event.sessionId,
          data: event.payload.data,
          opcode: event.payload.opcode,
          finish: event.payload.finish
        });
        return invoke("onMessage", () => callbacks.onMessage?.(server, frame));
      }),
      options.networkEvents.onClose((event) => {
        facade.forgetConnection(event.sessionId);
        return invoke(
          "onClose",
          () => callbacks.onClose?.(server, event.sessionId, 0)
        );
      })
    );
    const onBuffer = options.networkEvents.onBuffer;
    if (typeof onBuffer === "function") {
      disposers.push(onBuffer.call(options.networkEvents, (event) => {
        facade.applyBufferState(event);
        if (event.payload.state === NETWORK_BUFFER_STATE.FULL) {
          return invoke(
            "onBufferFull",
            () => callbacks.onBufferFull?.(server, event.sessionId)
          );
        } else if (event.payload.state === NETWORK_BUFFER_STATE.EMPTY) {
          return invoke(
            "onBufferEmpty",
            () => callbacks.onBufferEmpty?.(server, event.sessionId)
          );
        }
      }));
    }
  }
  if (callbacks.onTask !== void 0) {
    disposers.push(options.tasks.onTask(
      (taskId, sourceWorkerId, data) => invoke(
        "onTask",
        () => callbacks.onTask?.(server, taskId, sourceWorkerId, data)
      )
    ));
  }
  if (callbacks.onFinish !== void 0) {
    disposers.push(options.tasks.onFinish(
      (taskId, data) => invoke("onFinish", () => callbacks.onFinish?.(server, taskId, data))
    ));
  }
  if (callbacks.onPipeMessage !== void 0) {
    disposers.push(options.processMessages.onPipeMessage(
      (sourceWorkerId, message) => invoke(
        "onPipeMessage",
        () => callbacks.onPipeMessage?.(server, sourceWorkerId, message)
      )
    ));
  }
  if (callbacks.onPipeRequest !== void 0) {
    disposers.push(options.processMessages.onPipeRequest(
      (sourceWorkerId, message) => invoke(
        "onPipeRequest",
        async () => await callbacks.onPipeRequest?.(server, sourceWorkerId, message)
      )
    ));
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
  };
}

// src/runtime/runtime-server-application.ts
var RUNTIME_CHILD_ENVIRONMENT_KEY = "TS_SWOOLE_RUNTIME_CHILD";
var RUNTIME_SERVER_SHARED_STATE_IDENTITY = "ts-swoole-runtime-server-endpoint-v1";
var EMPTY_CONNECTIONS = Object.freeze({
  size: 0,
  *[Symbol.iterator]() {
  }
});
function createDeferred10() {
  let resolve4;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve4 = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve4, reject };
}
function defaultEntrypoint() {
  const entrypoint = process.argv[1];
  if (entrypoint === void 0 || entrypoint.length === 0) {
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.INVALID_STATE,
      "RuntimeServer requires an explicit entrypoint outside a main module"
    );
  }
  return resolve3(entrypoint);
}
function normalizeEntrypoint(entrypoint) {
  return typeof entrypoint === "string" && entrypoint.startsWith("file:") ? new URL(entrypoint) : entrypoint;
}
function createRuntimeServerStateKey(settings, _entrypoint) {
  return settings.port === 0 ? void 0 : createRuntimeStateKey(settings, RUNTIME_SERVER_SHARED_STATE_IDENTITY);
}
function isRuntimeChild() {
  return process.env[RUNTIME_CHILD_ENVIRONMENT_KEY] === "1";
}
var RuntimeServer = class {
  stopped;
  #settings;
  #callbacks;
  #entrypoint;
  #reservedTaskWorkerIds;
  #parentSignal;
  #readyTimeoutMs;
  #gracefulShutdownTimeoutMs;
  #terminateTimeoutMs;
  #runtimeChild;
  #initialMasterPid;
  #stopped = createDeferred10();
  #detachedErrorCounts = /* @__PURE__ */ new Map();
  #activeCallback = new AsyncLocalStorage8();
  #facade = null;
  #runtime = null;
  #startPromise = null;
  #disposePromise = null;
  #detachedLastError = null;
  #terminal = false;
  constructor(options) {
    if (typeof options !== "object" || options === null) {
      throw new TypeError("RuntimeServer options must be an object");
    }
    this.#settings = loadRuntimeSettings(options.settings);
    this.#callbacks = normalizeRuntimeCallbacks(options.callbacks);
    this.#entrypoint = options.entrypoint === void 0 ? void 0 : normalizeEntrypoint(options.entrypoint);
    this.#reservedTaskWorkerIds = options.reservedTaskWorkerIds === void 0 ? void 0 : Object.freeze([...options.reservedTaskWorkerIds]);
    this.#parentSignal = options.parentSignal;
    this.#readyTimeoutMs = options.readyTimeoutMs;
    this.#gracefulShutdownTimeoutMs = options.gracefulShutdownTimeoutMs;
    this.#terminateTimeoutMs = options.terminateTimeoutMs;
    this.#runtimeChild = isRuntimeChild();
    this.#initialMasterPid = createProcessPid(
      this.#runtimeChild ? process.ppid : process.pid
    );
    this.stopped = this.#stopped.promise;
    void this.stopped.catch(() => void 0);
  }
  get worker_id() {
    return this.#facade?.worker_id ?? null;
  }
  get worker_pid() {
    return this.#facade?.worker_pid ?? null;
  }
  get taskworker() {
    return this.#facade?.taskworker ?? false;
  }
  get setting() {
    return this.#facade?.setting ?? this.#settings;
  }
  get master_pid() {
    return this.#facade?.master_pid ?? this.#initialMasterPid;
  }
  get generation() {
    return this.#facade?.generation ?? null;
  }
  get connections() {
    return this.#facade?.connections ?? EMPTY_CONNECTIONS;
  }
  start() {
    const activeCallback = this.#activeCallback.getStore();
    if (activeCallback !== void 0) {
      return Promise.reject(new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `RuntimeServer cannot start from ${activeCallback}`
      ));
    }
    if (this.#terminal || this.#disposePromise !== null) {
      return Promise.reject(new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "RuntimeServer cannot start after stopping or disposal"
      ));
    }
    if (this.#startPromise !== null) {
      return this.#startPromise;
    }
    this.#startPromise = this.#runtimeChild ? this.#startWorker() : this.#startMaster();
    return this.#startPromise;
  }
  task(data, taskWorkerId) {
    return this.#delegate((facade) => taskWorkerId === void 0 ? facade.task(data) : facade.task(data, taskWorkerId));
  }
  finish(data) {
    return this.#delegate((facade) => facade.finish(data));
  }
  sendMessage(message, targetWorkerId) {
    return this.#delegate((facade) => facade.sendMessage(message, targetWorkerId));
  }
  requestMessage(message, targetWorkerId, timeoutMs) {
    const facade = this.#facade;
    if (facade === null) {
      return Promise.reject(new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        "RuntimeServer is not started"
      ));
    }
    return facade.requestMessage(message, targetWorkerId, timeoutMs);
  }
  push(fd, data, opcode) {
    return this.#delegate((facade) => opcode === void 0 ? facade.push(fd, data) : facade.push(fd, data, opcode));
  }
  send(fd, data) {
    return this.#delegate((facade) => facade.send(fd, data));
  }
  close(fd, code, reason) {
    return this.#delegate((facade) => facade.close(fd, code, reason));
  }
  exist(fd) {
    return this.#delegate((facade) => facade.exist(fd));
  }
  connection_info(fd) {
    return this.#delegate((facade) => facade.connection_info(fd));
  }
  connection_owner(fd) {
    return this.#delegate((facade) => facade.connection_owner(fd));
  }
  workers() {
    return this.#facade?.workers() ?? Object.freeze([]);
  }
  addStat(metricId, delta) {
    return this.#delegate(
      (facade) => delta === void 0 ? facade.addStat(metricId) : facade.addStat(metricId, delta)
    );
  }
  snapshotStats() {
    return this.#facade?.snapshotStats() ?? Object.freeze([]);
  }
  atomicGet(atomicId) {
    return this.#delegate((facade) => facade.atomicGet(atomicId));
  }
  atomicAdd(atomicId, delta) {
    return this.#delegate((facade) => facade.atomicAdd(atomicId, delta));
  }
  atomicSet(atomicId, value) {
    return this.#delegate((facade) => facade.atomicSet(atomicId, value));
  }
  atomicCompareSet(atomicId, expected, value) {
    return this.#delegate((facade) => facade.atomicCompareSet(atomicId, expected, value));
  }
  lockTry(lockId, ownerToken) {
    return this.#delegate(
      (facade) => ownerToken === void 0 ? facade.lockTry(lockId) : facade.lockTry(lockId, ownerToken)
    );
  }
  lockAcquire(lockId, ownerToken, timeoutMs) {
    const facade = this.#facade;
    if (facade === null) return Promise.resolve(false);
    return facade.lockAcquire(lockId, ownerToken, timeoutMs);
  }
  lockRelease(lockId, ownerToken) {
    return this.#delegate(
      (facade) => ownerToken === void 0 ? facade.lockRelease(lockId) : facade.lockRelease(lockId, ownerToken)
    );
  }
  stop(workerId) {
    return this.#delegate(
      (facade) => workerId === void 0 ? facade.stop() : facade.stop(workerId)
    );
  }
  reload(onlyTaskWorker) {
    return this.#delegate((facade) => onlyTaskWorker === void 0 ? facade.reload() : facade.reload(onlyTaskWorker));
  }
  shutdown() {
    return this.#delegate((facade) => facade.shutdown());
  }
  stats() {
    const base = this.#facade?.stats() ?? Object.freeze({
      connections: 0,
      workers: 0,
      taskWorkers: 0,
      invalidSessions: 0,
      staleGenerations: 0,
      capacity: EMPTY_RUNTIME_CAPACITY_STATS,
      errors: Object.freeze({})
    });
    if (this.#detachedErrorCounts.size === 0) {
      return base;
    }
    const errors = /* @__PURE__ */ new Map();
    for (const [code, count] of Object.entries(base.errors)) {
      if (count !== void 0) {
        errors.set(code, count);
      }
    }
    for (const [code, count] of this.#detachedErrorCounts) {
      errors.set(code, (errors.get(code) ?? 0) + count);
    }
    return Object.freeze({
      ...base,
      errors: Object.freeze(
        Object.fromEntries(errors)
      )
    });
  }
  getLastError() {
    return this.#detachedLastError;
  }
  dispose(reason) {
    const activeCallback = this.#runtimeChild ? this.#activeCallback.getStore() : void 0;
    if (activeCallback !== void 0) {
      return Promise.reject(new FrameworkError(
        FRAMEWORK_ERROR_CODE.INVALID_STATE,
        `Worker RuntimeServer cannot dispose from ${activeCallback}`
      ));
    }
    if (!this.#runtimeChild && this.#runtime !== null) {
      const currentJoin = this.#runtime.stop(reason);
      this.#disposePromise ??= this.#runtime.stopped;
      return currentJoin;
    }
    if (this.#disposePromise !== null) {
      return this.#disposePromise;
    }
    if (this.#runtimeChild) {
      if (this.#startPromise === null) {
        this.#disposePromise = Promise.resolve();
        this.#resolveStopped();
        return this.#disposePromise;
      }
      this.#disposePromise = this.stopped;
      return this.#disposePromise;
    }
    this.#disposePromise = Promise.resolve();
    this.#resolveStopped();
    return this.#disposePromise;
  }
  async [Symbol.asyncDispose]() {
    await this.dispose("RuntimeServer async disposal");
  }
  async #startMaster() {
    try {
      const entrypoint = this.#entrypoint ?? defaultEntrypoint();
      const runtimeKey = createRuntimeServerStateKey(this.#settings, entrypoint);
      let facade;
      const runtime = new MasterRuntime({
        settings: this.#settings,
        ...runtimeKey === void 0 ? {} : { runtimeKey },
        ...this.#parentSignal === void 0 ? {} : { parentSignal: this.#parentSignal },
        hooks: {
          onManagerStart: () => this.#invokeCallback(
            "onManagerStart",
            () => this.#callbacks.onManagerStart?.(this)
          ),
          onStart: () => this.#invokeCallback(
            "onStart",
            () => this.#callbacks.onStart?.(this)
          ),
          onManagerStop: () => this.#invokeCallback(
            "onManagerStop",
            () => this.#callbacks.onManagerStop?.(this)
          ),
          onShutdown: () => this.#invokeCallback(
            "onShutdown",
            () => this.#callbacks.onShutdown?.(this)
          )
        },
        processSupervisorFactory: (context, sharedState) => {
          const supervisor = new ProcessSupervisor({
            context,
            compactIpcEnvelopes: true,
            sharedRuntime: sharedState.descriptor,
            sharedWorkers: sharedState,
            entrypoint,
            ...this.#readyTimeoutMs === void 0 ? {} : { readyTimeoutMs: this.#readyTimeoutMs },
            ...this.#gracefulShutdownTimeoutMs === void 0 ? {} : { gracefulShutdownTimeoutMs: this.#gracefulShutdownTimeoutMs },
            ...this.#terminateTimeoutMs === void 0 ? {} : { terminateTimeoutMs: this.#terminateTimeoutMs },
            childEnvironment: {
              [RUNTIME_CHILD_ENVIRONMENT_KEY]: "1",
              ...rustTcpDataPlaneEnabled(context.settings.protocol) ? { ALLOY_CORE_RUST_DATA_PLANE: "1" } : {}
            },
            ...this.#reservedTaskWorkerIds === void 0 ? {} : { reservedTaskWorkerIds: this.#reservedTaskWorkerIds },
            onWorkerError: (workerId, workerPid, exitCode, signal) => this.#invokeCallback("onWorkerError", async () => {
              sharedState.clearLocks?.(workerPid);
              await this.#callbacks.onWorkerError?.(
                this,
                workerId,
                workerPid,
                exitCode,
                signal
              );
            }),
            onBeforeReload: () => this.#invokeCallback(
              "onBeforeReload",
              () => this.#callbacks.onBeforeReload?.(this)
            )
          });
          facade.attachSupervisor(supervisor);
          return supervisor;
        },
        networkServerFactory: (context, supervisor, sharedState) => {
          const network = createDefaultNetworkServer(
            context,
            supervisor,
            sharedState
          );
          facade.attachNetwork(network.network, network.commands);
          return network;
        }
      });
      facade = new MasterRuntimeServerFacade(runtime.context, runtime.sharedState);
      this.#runtime = runtime;
      this.#facade = facade;
      void runtime.stopped.then(
        () => this.#resolveStopped(),
        (error) => this.#rejectStopped(error)
      );
      await runtime.start();
      return this;
    } catch (error) {
      if (this.#runtime === null) {
        this.#rejectStopped(error);
      }
      throw error;
    }
  }
  async #startWorker() {
    if (!hasActiveParentProcessChannel()) {
      const error = new FrameworkError(
        FRAMEWORK_ERROR_CODE.IPC_CHANNEL_CLOSED,
        "Runtime child marker requires an active parent IPC channel"
      );
      this.#rejectStopped(error);
      throw error;
    }
    const ready = createDeferred10();
    let readyObserved = false;
    const runPromise = runWorkerEntry({
      initialize: async (runtime) => {
        const facade = new WorkerRuntimeServerFacade({
          context: runtime.context,
          bus: runtime.bus,
          networkCommands: runtime.networkCommands,
          tasks: runtime.tasks,
          processMessages: runtime.processMessages,
          lifecycle: runtime.lifecycle,
          sharedState: runtime.sharedState
        });
        this.#facade = facade;
        const disposeCallbacks = bindWorkerRuntimeCallbacks({
          server: this,
          callbacks: this.#callbacks,
          facade,
          networkEvents: runtime.networkEvents,
          tasks: runtime.tasks,
          processMessages: runtime.processMessages,
          invoke: (name, callback) => this.#invokeCallback(name, callback)
        });
        runtime.context.deferResource(
          "worker.public-runtime-callbacks",
          disposeCallbacks
        );
        await this.#invokeCallback(
          "onWorkerStart",
          () => this.#callbacks.onWorkerStart?.(this, runtime.context.worker_id)
        );
      },
      onReady: () => {
        readyObserved = true;
        ready.resolve();
      },
      onWorkerStop: async (runtime) => {
        await this.#invokeCallback(
          "onWorkerStop",
          () => this.#callbacks.onWorkerStop?.(this, runtime.context.worker_id)
        );
      },
      onWorkerExit: async (runtime) => {
        await this.#invokeCallback(
          "onWorkerExit",
          () => this.#callbacks.onWorkerExit?.(this, runtime.context.worker_id)
        );
      }
    });
    void runPromise.then(
      () => this.#resolveStopped(),
      (error) => this.#rejectStopped(error)
    );
    await Promise.race([
      ready.promise,
      runPromise.then(() => {
        if (!readyObserved) {
          throw new FrameworkError(
            FRAMEWORK_ERROR_CODE.INVALID_STATE,
            "Worker RuntimeServer stopped before becoming READY"
          );
        }
      })
    ]);
    if (readyObserved) {
      return this;
    }
    throw new FrameworkError(
      FRAMEWORK_ERROR_CODE.INVALID_STATE,
      "Worker RuntimeServer stopped before becoming READY"
    );
  }
  #detachedFailure() {
    this.#detachedLastError = FRAMEWORK_ERROR_CODE.INVALID_STATE;
    const count = this.#detachedErrorCounts.get(FRAMEWORK_ERROR_CODE.INVALID_STATE) ?? 0;
    this.#detachedErrorCounts.set(FRAMEWORK_ERROR_CODE.INVALID_STATE, count + 1);
    return false;
  }
  #delegate(operation) {
    const facade = this.#facade;
    if (facade === null) {
      return this.#detachedFailure();
    }
    const result = operation(facade);
    this.#detachedLastError = facade.getLastError();
    return result;
  }
  #invokeCallback(name, callback) {
    return this.#activeCallback.run(name, callback);
  }
  #resolveStopped() {
    this.#terminal = true;
    this.#stopped.resolve();
  }
  #rejectStopped(error) {
    this.#terminal = true;
    this.#stopped.reject(error);
  }
};
export {
  CONNECTION_STATE,
  CONNECTION_STATES,
  FRAMEWORK_ERROR_CODE,
  FRAMEWORK_ERROR_CODES,
  FrameworkError,
  IPC_MESSAGE_TYPE,
  IPC_MESSAGE_TYPES,
  IPC_PROTOCOL_VERSION,
  MASTER_STATE,
  MASTER_STATES,
  PROCESS_ROLE,
  PROCESS_ROLES,
  RuntimeServer,
  SHARED_ATOMIC_CAPACITY,
  SHARED_LOCK_CAPACITY,
  WORKER_STATE,
  WORKER_STATES,
  assertConnectionTransition,
  assertEnvelopeSourceGeneration,
  assertMasterTransition,
  assertWorkerTransition,
  canConnectionTransition,
  canMasterTransition,
  canWorkerTransition,
  createCorrelationId,
  createIpcEnvelope,
  createIpcSequence,
  createMessageId,
  createProcessPid,
  createTaskWorkerId,
  createWorkerGeneration,
  createWorkerId,
  isEventWorkerId,
  isTaskWorkerId,
  isUserTaskWorkerId,
  toGlobalTaskWorkerId,
  toGlobalUserTaskWorkerId,
  toTaskWorkerId,
  validateIpcEnvelope
};
//# sourceMappingURL=index.mjs.map
