/** Native capability versions belong to the host; a kit declares the versions it consumes. */
import fs from "node:fs";
import path from "node:path";

export const NATIVE_HOST_CAPABILITIES =
  "apps/serverNew/server/native-kit-capabilities.json";
export const nativeRequirementsPath = (id: string): string =>
  `apps/serverNew/kits/${id}/native-requires.json`;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
function fail(message: string): never {
  throw new Error(`[native-kit] serverNew capability: ${message}`);
}

export function assertNativeHostCapabilities(
  root: string,
  requirementsBytes: Uint8Array | undefined,
): void {
  if (requirementsBytes === undefined) return; // Earlier read-only native kits did not need additional capabilities.
  const requirements: unknown = JSON.parse(
    Buffer.from(requirementsBytes).toString("utf8"),
  );
  if (
    !object(requirements) ||
    requirements.schemaVersion !== 1 ||
    !object(requirements.capabilities) ||
    Object.keys(requirements).some(
      (key) => !["schemaVersion", "capabilities"].includes(key),
    )
  )
    fail("invalid native-requires.json");
  const required = requirements.capabilities as Record<string, unknown>;
  for (const [name, version] of Object.entries(required)) {
    if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(name) || !positive(version))
      fail(`invalid requirement ${name}`);
  }
  const hostPath = path.join(root, NATIVE_HOST_CAPABILITIES);
  if (!fs.existsSync(hostPath))
    fail(`missing host declaration ${NATIVE_HOST_CAPABILITIES}`);
  const host: unknown = JSON.parse(fs.readFileSync(hostPath, "utf8"));
  if (!object(host) || host.schemaVersion !== 1 || !object(host.capabilities))
    fail("invalid host capabilities");
  const capabilities = host.capabilities as Record<string, unknown>;
  for (const [name, version] of Object.entries(required)) {
    const offered = Object.prototype.hasOwnProperty.call(capabilities, name)
      ? capabilities[name]
      : undefined;
    if (
      !object(offered) ||
      !positive(offered.version) ||
      !positive(offered.minSupported) ||
      offered.minSupported > offered.version ||
      (version as number) < offered.minSupported ||
      (version as number) > offered.version
    ) {
      fail(
        `requires ${name}@${version}; host does not offer a compatible version`,
      );
    }
  }
}
