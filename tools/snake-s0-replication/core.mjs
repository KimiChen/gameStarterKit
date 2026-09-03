import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableJson(value));
}

export function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function assertGitSnapshot(repo, expectedCommit, { clean = true } = {}) {
  const actualCommit = git(repo, ["rev-parse", "HEAD"]);
  if (actualCommit !== expectedCommit) {
    throw new Error(`Git identity mismatch for ${repo}: expected ${expectedCommit}, got ${actualCommit}`);
  }
  const status = git(repo, ["status", "--short", "--untracked-files=all"]);
  if (clean && status !== "") throw new Error(`Source archive is dirty:\n${status}`);
  return { actualCommit, clean: status === "" };
}

export function readGitFile(repo, commit, relativePath) {
  const data = execFileSync("git", ["-C", repo, "show", `${commit}:${relativePath}`], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return { data, sha256: sha256(data), text: data.toString("utf8") };
}

export class SourceTracker {
  constructor(root) {
    this.root = fs.realpathSync(root);
    this.entries = new Map();
  }

  #absolute(relativePath) {
    const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
    const absolute = path.resolve(this.root, normalized);
    if (absolute !== this.root && !absolute.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Source path escapes archive root: ${relativePath}`);
    }
    return { absolute, normalized };
  }

  read(relativePath, purpose = "unspecified") {
    const { absolute, normalized } = this.#absolute(relativePath);
    const stat = fs.lstatSync(absolute);
    const isSymbolicLink = stat.isSymbolicLink();
    const linkTarget = isSymbolicLink ? fs.readlinkSync(absolute) : null;
    const resolvedAbsolute = fs.realpathSync(absolute);
    if (resolvedAbsolute !== this.root && !resolvedAbsolute.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Resolved source path escapes archive root: ${relativePath}`);
    }
    const data = fs.readFileSync(resolvedAbsolute);
    const resolvedRelativePath = path.relative(this.root, resolvedAbsolute).replaceAll(path.sep, "/");
    const current = this.entries.get(normalized);
    const entry = current ?? {
      path: normalized,
      kind: isSymbolicLink ? "symbolicLink" : "file",
      linkTarget,
      resolvedPath: resolvedRelativePath,
      size: data.length,
      sha256: sha256(data),
      resolvedSha256: sha256(data),
      purposes: [],
    };
    if (entry.sha256 !== sha256(data) || entry.resolvedPath !== resolvedRelativePath) {
      throw new Error(`Source identity changed during build: ${normalized}`);
    }
    if (!entry.purposes.includes(purpose)) entry.purposes.push(purpose);
    entry.purposes.sort();
    this.entries.set(normalized, entry);
    return data;
  }

  readText(relativePath, purpose) {
    return this.read(relativePath, purpose).toString("utf8");
  }

  readJson(relativePath, purpose) {
    return JSON.parse(this.readText(relativePath, purpose));
  }

  verifyUnchanged() {
    for (const entry of this.entries.values()) {
      const { absolute } = this.#absolute(entry.path);
      const resolvedAbsolute = fs.realpathSync(absolute);
      const data = fs.readFileSync(resolvedAbsolute);
      if (sha256(data) !== entry.sha256 || data.length !== entry.size) {
        throw new Error(`Source file mutated while evidence was built: ${entry.path}`);
      }
      if (entry.kind === "symbolicLink" && fs.readlinkSync(absolute) !== entry.linkTarget) {
        throw new Error(`Source symlink target mutated while evidence was built: ${entry.path}`);
      }
    }
  }

  manifest() {
    return [...this.entries.values()]
      .map((entry) => ({ ...entry, purposes: [...entry.purposes] }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

class LiteralParser {
  constructor(text, start = 0) {
    this.text = text;
    this.index = start;
  }

  fail(message) {
    throw new SyntaxError(`${message} at source offset ${this.index}`);
  }

  skip() {
    while (this.index < this.text.length) {
      if (/\s/.test(this.text[this.index])) {
        this.index += 1;
        continue;
      }
      if (this.text.startsWith("//", this.index)) {
        const end = this.text.indexOf("\n", this.index + 2);
        this.index = end < 0 ? this.text.length : end + 1;
        continue;
      }
      if (this.text.startsWith("/*", this.index)) {
        const end = this.text.indexOf("*/", this.index + 2);
        if (end < 0) this.fail("Unterminated block comment");
        this.index = end + 2;
        continue;
      }
      break;
    }
  }

  parse() {
    this.skip();
    const ch = this.text[this.index];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === '"' || ch === "'") return this.string();
    if (ch === "-" || ch === "." || /[0-9]/.test(ch ?? "")) return this.number();
    const identifier = this.identifier();
    if (identifier === "true") return true;
    if (identifier === "false") return false;
    if (identifier === "null") return null;
    this.fail(`Executable or unsupported identifier ${JSON.stringify(identifier)}`);
  }

  object() {
    const result = {};
    this.index += 1;
    this.skip();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      this.skip();
      const key = this.text[this.index] === '"' || this.text[this.index] === "'"
        ? this.string()
        : this.identifier();
      this.skip();
      if (this.text[this.index] !== ":") this.fail("Expected ':' after object key");
      this.index += 1;
      const value = this.parse();
      if (Object.hasOwn(result, key)) this.fail(`Duplicate object key ${JSON.stringify(key)}`);
      result[key] = value;
      this.skip();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",") this.fail("Expected ',' or '}' in object");
      this.index += 1;
      this.skip();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return result;
      }
    }
    this.fail("Unterminated object");
  }

  array() {
    const result = [];
    this.index += 1;
    this.skip();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      result.push(this.parse());
      this.skip();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",") this.fail("Expected ',' or ']' in array");
      this.index += 1;
      this.skip();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return result;
      }
    }
    this.fail("Unterminated array");
  }

  identifier() {
    this.skip();
    const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.text.slice(this.index));
    if (!match) this.fail("Expected identifier");
    this.index += match[0].length;
    return match[0];
  }

  string() {
    const quote = this.text[this.index++];
    let result = "";
    while (this.index < this.text.length) {
      const ch = this.text[this.index++];
      if (ch === quote) return result;
      if (ch !== "\\") {
        result += ch;
        continue;
      }
      if (this.index >= this.text.length) this.fail("Unterminated string escape");
      const escape = this.text[this.index++];
      const simple = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0" };
      if (Object.hasOwn(simple, escape)) result += simple[escape];
      else if (escape === "x") {
        const hex = this.text.slice(this.index, this.index + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("Invalid hexadecimal escape");
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += 2;
      } else if (escape === "u") {
        const hex = this.text.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid unicode escape");
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += 4;
      } else if (escape === "\n") {
        // JavaScript line continuation.
      } else result += escape;
    }
    this.fail("Unterminated string");
  }

  number() {
    this.skip();
    const match = /^-?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.index));
    if (!match) this.fail("Invalid number literal");
    this.index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) this.fail("Non-finite number literal");
    return number;
  }
}

export function parseDataLiteralAt(text, start) {
  const parser = new LiteralParser(text, start);
  const value = parser.parse();
  return { value, end: parser.index };
}

export function findPropertyLiterals(text, propertyName) {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?:^|[^A-Za-z0-9_$])${escaped}\\s*:`, "g");
  const results = [];
  for (let match = expression.exec(text); match; match = expression.exec(text)) {
    const colon = text.indexOf(":", match.index);
    const parsed = parseDataLiteralAt(text, colon + 1);
    results.push(parsed.value);
    expression.lastIndex = Math.max(expression.lastIndex, parsed.end);
  }
  return results;
}

export function expectPropertyLiteral(text, propertyName, predicate = () => true) {
  const matches = findPropertyLiterals(text, propertyName).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one data literal for ${propertyName}, found ${matches.length}`);
  }
  return matches[0];
}

export function assertIncludes(text, snippets, relativePath) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) throw new Error(`Missing source assertion in ${relativePath}: ${snippet}`);
  }
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const HEX = "0123456789abcdef";

export function decompressUuid(compressed) {
  const value = compressed.replaceAll("-", "+").replaceAll("_", "/");
  if (value.length !== 22) throw new Error(`Unsupported compressed Cocos UUID: ${compressed}`);
  let compact = value.slice(0, 2);
  for (let index = 2; index < value.length; index += 2) {
    const left = BASE64.indexOf(value[index]);
    const right = BASE64.indexOf(value[index + 1]);
    if (left < 0 || right < 0) throw new Error(`Invalid compressed Cocos UUID: ${compressed}`);
    compact += HEX[left >> 2];
    compact += HEX[((left & 3) << 2) | (right >> 4)];
    compact += HEX[right & 15];
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export function cocosNativePath(bundleName, config, logicalPath) {
  const entry = Object.entries(config.paths).find(([, value]) => value[0] === logicalPath && value[1] === 0);
  if (!entry) throw new Error(`Texture path not found in ${bundleName}: ${logicalPath}`);
  const [index] = entry;
  const uuid = decompressUuid(config.uuids[Number(index)]);
  return `remoteBundles/${bundleName}/${config.nativeBase}/${uuid.slice(0, 2)}/${uuid}.png`;
}

export function cocosAtlasPackPath(bundleName, config, logicalPath) {
  const entry = Object.entries(config.paths).find(([, value]) => value[0] === logicalPath && value[1] === 1);
  if (!entry) throw new Error(`Atlas path not found in ${bundleName}: ${logicalPath}`);
  const index = Number(entry[0]);
  const packs = Object.entries(config.packs).filter(([, indexes]) => indexes.includes(index));
  if (packs.length !== 1) throw new Error(`Expected one metadata pack for ${logicalPath}, found ${packs.length}`);
  const key = packs[0][0];
  return `remoteBundles/${bundleName}/${config.importBase}/${key.slice(0, 2)}/${key}.json`;
}

export function collectNamedRects(value, result = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRects(item, result);
  } else if (value && typeof value === "object") {
    if (typeof value.name === "string" && Array.isArray(value.rect) && value.rect.length >= 4) {
      const rect = value.rect.slice(0, 4).map(Number);
      if (rect.every(Number.isFinite)) result.set(value.name, rect);
    }
    for (const child of Object.values(value)) collectNamedRects(child, result);
  }
  return result;
}

export function lineNumbers(text, snippets) {
  const starts = [0];
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
  return snippets.map((snippet) => {
    const offset = text.indexOf(snippet);
    if (offset < 0) return { snippet, line: null };
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid;
    }
    return { snippet, line: low + 1 };
  });
}

export function listFiles(root) {
  const files = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else files.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
    }
  }
  visit(root);
  return files;
}

export function compareDirectories(expectedRoot, actualRoot) {
  const expectedFiles = listFiles(expectedRoot);
  const actualFiles = listFiles(actualRoot);
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    throw new Error(`Evidence file list differs. Expected ${expectedFiles.length}, rebuilt ${actualFiles.length}`);
  }
  const differences = [];
  for (const relativePath of expectedFiles) {
    const expected = fs.readFileSync(path.join(expectedRoot, relativePath));
    const actual = fs.readFileSync(path.join(actualRoot, relativePath));
    if (!expected.equals(actual)) differences.push(relativePath);
  }
  if (differences.length > 0) throw new Error(`Evidence differs byte-for-byte: ${differences.join(", ")}`);
  return { fileCount: expectedFiles.length };
}
