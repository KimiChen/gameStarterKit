/**
 * Shared, dependency-free helpers for project.metadata.json and the generated
 * shared project identity source.  Keep this module free of repository paths
 * so init-project can also operate on a copied starter tree via --root.
 */

export const PROJECT_METADATA_SCHEMA_VERSION = 1;

// The negative lookahead is an absolute end-of-string assertion.  JavaScript's
// `$` also matches immediately before a trailing line terminator, which would
// otherwise let values such as `arena\n` pass these identity checks.
export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}(?![\s\S])/;
export const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?![\s\S])/;
export const PACKAGE_SCOPE_PATTERN = /^@[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?![\s\S])/;

/**
 * Return the package names used by this monorepo.  `scope` is optional so the
 * initializer can also create an unscoped private starter package.
 */
export function packageNames({ name, scope }) {
  const scoped = (suffix) => scope ? `${scope}/${suffix}` : suffix;
  return {
    root: scoped(name),
    shared: scoped("shared"),
    server: scoped("server"),
    website: scoped("website"),
    client: `${name}-client`,
  };
}

/**
 * Exact generated content for apps/shared/src/project.ts.  The file is a
 * projection of project.metadata.json and must never become a second source
 * of identity values.
 */
export function projectSourceContent(metadata) {
  const q = (value) => JSON.stringify(value);
  const scope = metadata.scope === null ? "null" : q(metadata.scope);
  return `/**\n * Generated from project.metadata.json by scripts/init-project.mjs.\n * Do not edit: change the metadata and run npm run init:project.\n */\nexport const PROJECT_METADATA_SCHEMA_VERSION = ${metadata.schemaVersion};\nexport const PROJECT_ID = ${q(metadata.projectId)};\nexport const PROJECT_NAME = ${q(metadata.name)};\nexport const PROJECT_DISPLAY_NAME = ${q(metadata.displayName)};\nexport const PROJECT_SCOPE = ${scope};\nexport const PROJECT_PACKAGE_NAME = ${q(metadata.packages.root)};\nexport const DEMO_BRAND = ${q(metadata.brand)};\n`;
}

export function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")) return false;
  const normalized = value.replaceAll("\\", "/");
  // Keep metadata paths portable and rooted below the selected checkout on
  // both POSIX and Windows.  Reject drive-relative/absolute paths, dot
  // segments, empty segments and control characters instead of relying on the
  // host platform's path.join semantics.
  if (normalized !== value || /^[A-Za-z]:/.test(normalized)) return false;
  if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(normalized)) return false;
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) return false;
  return normalized === value;
}

export function normalizeScope(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new Error(`scope 非法：「${value ?? ""}」——须为 @scope 形式（仅字母、数字、点、下划线、连字符）`);
  }
  if (value === "" || value === "none" || value === "null" || value === "unscoped") return null;
  const normalized = value.startsWith("@") ? value : `@${value}`;
  if (!PACKAGE_SCOPE_PATTERN.test(normalized)) {
    throw new Error(`scope 非法：「${value}」——须为 @scope 形式（仅字母、数字、点、下划线、连字符）`);
  }
  return normalized;
}

export function validateProjectId(value) {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) {
    throw new Error(`project-id 非法：「${value ?? ""}」——须匹配 ^[a-z][a-z0-9_]{0,31}$`);
  }
  return value;
}

export function validateName(value) {
  if (typeof value !== "string" || !PACKAGE_NAME_PATTERN.test(value) || value === "." || value === "..") {
    throw new Error(`name 非法：「${value ?? ""}」——须为 1–128 位 npm 包名片段`);
  }
  return value;
}

export function validateText(value, flag, max = 128) {
  if (typeof value !== "string" || value.length < 1 || value.length > max
    || /[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) {
    throw new Error(`${flag} 非法：须为 1–${max} 个无控制字符文本`);
  }
  return value;
}

export function assertPackageNames(metadata) {
  const expected = packageNames(metadata);
  const actual = metadata.packages;
  const seen = new Map();
  for (const key of Object.keys(expected)) {
    const name = expected[key];
    // npm package identities are effectively case-insensitive across the
    // registry and on common developer filesystems.  Keep the starter's
    // existing allowance for uppercase names, but reject collisions such as
    // `Shared` vs `shared` before npm creates an ambiguous workspace graph.
    const identity = name.toLowerCase();
    const previous = seen.get(identity);
    if (previous !== undefined) {
      throw new Error(`packages.${key} 与 packages.${previous} 重名：${name}；请更换 name，避免 workspace 包名碰撞`);
    }
    seen.set(identity, key);
    if (!actual || actual[key] !== expected[key]) {
      throw new Error(`packages.${key} 与项目身份不一致：应为 ${expected[key]}，实际为 ${actual?.[key] ?? "<missing>"}`);
    }
  }
}
