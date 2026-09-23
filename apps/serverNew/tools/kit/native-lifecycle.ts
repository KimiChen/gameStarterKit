/** Persistent native data is never made writable by a file installation. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const nativeDataPath = (id: string): string =>
  `apps/serverNew/kits/${id}/native-data.json`;
export interface NativeData {
  schemaVersion: 1;
  dataVersion: number;
  minSupported: number;
  retention: "preserve";
  keys: string[];
}
export function parseNativeData(id: string, bytes: Uint8Array): NativeData {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as NativeData;
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.dataVersion) ||
    value.dataVersion < 1 ||
    !Number.isSafeInteger(value.minSupported) ||
    value.minSupported < 1 ||
    value.minSupported > value.dataVersion ||
    value.retention !== "preserve" ||
    !Array.isArray(value.keys) ||
    value.keys.length === 0 ||
    value.keys.length > 1000 ||
    value.keys.some(
      (key) =>
        typeof key !== "string" ||
        key.length > 256 ||
        !key.startsWith(`kt:${id}:`) ||
        /\s/.test(key),
    ) ||
    new Set(value.keys).size !== value.keys.length ||
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "dataVersion",
          "minSupported",
          "retention",
          "keys",
        ].includes(key),
    )
  ) {
    throw new Error("[native-kit] invalid native-data.json");
  }
  return value;
}
export function treeNativeData(root: string, id: string): Buffer | undefined {
  const file = path.join(root, nativeDataPath(id));
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}

function invoke(
  root: string,
  id: string,
  data: NativeData,
  operation: "detach" | "attach",
): void {
  // An explicit deployment target is mandatory: never guess that dev points at the intended database.
  const input = process.env.NATIVE_KIT_PROFILE;
  if (!input)
    throw new Error(
      '[native-kit] writable serverNew kit requires NATIVE_KIT_PROFILE={"platform":"…","version":"…","sid":1}; drain and stop that deployment first',
    );
  const profile = JSON.parse(input) as {
    platform: string;
    version: string;
    sid: number;
  };
  if (
    !profile ||
    typeof profile.platform !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(profile.platform) ||
    typeof profile.version !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(profile.version) ||
    !Number.isSafeInteger(profile.sid) ||
    profile.sid < 1 ||
    profile.sid > 65535 ||
    Object.keys(profile).some(
      (key) => !["platform", "version", "sid"].includes(key),
    )
  )
    throw new Error("[native-kit] invalid NATIVE_KIT_PROFILE");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/kit-lifecycle.cjs",
      "-p",
      profile.platform,
      "-v",
      profile.version,
      "--sid",
      String(profile.sid),
      "--kit",
      id,
      "--operation",
      operation,
      "--data-version",
      String(data.dataVersion),
      "--min-supported",
      String(data.minSupported),
      "--storage-keys",
      JSON.stringify([...data.keys].sort()),
    ],
    {
      cwd: path.join(root, "apps/serverNew/server"),
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `[native-kit] native kit ${operation} failed; data stays closed if detached: ${result.error?.message ?? result.stderr ?? "unknown error"}`,
    );
  const line = result.stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("[native-kit-result] "));
  if (!line) throw new Error("[native-kit] native lifecycle result missing");
  const report = JSON.parse(line.slice("[native-kit-result] ".length));
  if (
    report.kit !== id ||
    report.operation !== operation ||
    report.state?.phase !== (operation === "detach" ? "detached" : "drained")
  ) {
    throw new Error("[native-kit] native lifecycle result mismatch");
  }
}

/** Called after all file checks and before the first mutation. Failure or rollback deliberately keeps data closed. */
export function beginNativeMutation(
  root: string,
  id: string,
  bytes: Uint8Array | undefined,
): (() => void) | undefined {
  const oldBytes = treeNativeData(root, id);
  if (!bytes) {
    if (oldBytes)
      throw new Error(
        "[native-kit] cannot remove native data contract without a supported migration",
      );
    return undefined;
  }
  const data = parseNativeData(id, bytes);
  if (oldBytes) {
    const old = parseNativeData(id, oldBytes);
    if (
      old.dataVersion !== data.dataVersion ||
      old.keys.some((key) => !data.keys.includes(key))
    ) {
      throw new Error(
        "[native-kit] native data version/key removal requires a migration; this host only supports compatible retained-data upgrades",
      );
    }
  }
  invoke(root, id, data, "detach");
  return () => invoke(root, id, data, "attach");
}
