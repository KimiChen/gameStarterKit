import path from "node:path";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { generate } from "./generate";
import {
  pack,
  install,
  uninstall,
  check,
  legacySnapshot,
  walk,
} from "./package";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    out: { type: "string" },
    check: { type: "boolean" },
    help: { type: "boolean" },
  },
});
const root = path.resolve(
  values.root ?? path.resolve(__dirname, "../../../.."),
);
const [command, id] = positionals;
if (values.help || !command) {
  console.log(
    "native-kit generate [--check] | pack <id> --out <zip> | install <zip> | uninstall <id> | check [id] | test <id>; optional --root <compatible host>",
  );
  process.exit(0);
}
if (
  ["pack", "uninstall", "test"].includes(command) &&
  (!id || !/^[a-z][a-zA-Z0-9]*$/.test(id))
)
  throw Error("Invalid kit id");
const before = legacySnapshot(root);
const lock = path.join(root, "apps/serverNew/.kit-operation-lock");
const mutating =
  ["install", "uninstall", "generate"].includes(command) && !values.check;
let acquired = false;
try {
  if (mutating) {
    fs.mkdirSync(lock);
    acquired = true;
    fs.writeFileSync(
      path.join(lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        command,
        at: new Date().toISOString(),
      }),
    );
  }
  switch (command) {
    case "generate":
      generate(root, !!values.check);
      break;
    case "pack":
      if (!values.out) throw Error("pack requires --out");
      if (
        path
          .resolve(values.out)
          .startsWith(path.join(root, "apps/server") + path.sep)
      )
        throw Error("Legacy directory is read-only");
      pack(root, id, values.out);
      break;
    case "install":
      if (!id) throw Error("install requires archive");
      install(root, path.resolve(id));
      break;
    case "uninstall":
      uninstall(root, id);
      break;
    case "check":
      check(root, id);
      break;
    case "test": {
      check(root, id);
      const native = spawnSync(
        process.execPath,
        ["test/run-tests.js", "--module", id],
        { cwd: path.join(root, "apps/serverNew/server"), stdio: "inherit" },
      );
      if (native.status !== 0) throw Error("Native module tests failed");
      const tests = walk(
        root,
        `apps/serverNew/kits/${id}/verify/client`,
      ).filter((p) => p.endsWith(".test.ts"));
      if (tests.length) {
        const config = path.join(
          root,
          `apps/serverNew/kits/${id}/verify/tsconfig.client.json`,
        );
        if (!fs.existsSync(config))
          throw Error("Client tests require their strict tsconfig");
        const typed = spawnSync(
          process.execPath,
          [path.join(root, "node_modules/typescript/bin/tsc"), "-p", config],
          { cwd: root, stdio: "inherit" },
        );
        if (typed.status !== 0) throw Error("Client kit typecheck failed");

        const c = spawnSync(
          process.execPath,
          ["--import", "tsx", "--test", ...tests],
          { cwd: root, stdio: "inherit" },
        );
        if (c.status !== 0) throw Error("Client kit tests failed");
      }
      break;
    }
    default:
      throw Error("Unknown native kit command " + command);
  }
} finally {
  if (acquired) fs.rmSync(lock, { recursive: true });
  if (legacySnapshot(root) !== before)
    throw Error("Native kit operation changed the legacy server directory");
}
