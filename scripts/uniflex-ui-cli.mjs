import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `Usage:
  npm run ui:import-psd -- --file artwork.psd --name Backpack --out .cache/psd/job-001 [--font-dir fonts] [--update]
  npm run ui:export-psd -- --url http://127.0.0.1:8000 --out .cache/psd/export-001
  npm run ui:check-source [-- --package .cache/psd/job-001/project-package --strict]

CLI resolution (first match):
  WEB_UI_TO_PSD_CLI    Executable path or JS entry file; not a shell command.
  WEB_UI_TO_PSD_ROOT   Tool checkout/install root containing bin/cli.mjs.
  node_modules/web-ui-to-psd/bin/cli.mjs in this project.

No automatic installation or service request. Import preserves design metadata and
the project package in --out, then runs import:uniflex-ui. Build and sync are separate.
--update explicitly allows the existing project importer to overwrite source files.
`;

export async function resolveConverter(root, env) {
    const entry = env.WEB_UI_TO_PSD_CLI
        ? resolve(root, env.WEB_UI_TO_PSD_CLI)
        : join(env.WEB_UI_TO_PSD_ROOT
            ? resolve(root, env.WEB_UI_TO_PSD_ROOT)
            : join(root, "node_modules/web-ui-to-psd"), "bin/cli.mjs");
    try {
        await access(entry);
    } catch (error) {
        throw new Error("web-ui-to-psd CLI is unavailable. Install a pinned tool package, "
            + "or set WEB_UI_TO_PSD_CLI / WEB_UI_TO_PSD_ROOT.", { cause: error });
    }
    return [".js", ".mjs", ".cjs"].includes(extname(entry))
        ? { command: process.execPath, args: [entry] }
        : { command: entry, args: [] };
}

export async function runCli(argv, {
    root = projectRoot, env = process.env, execute = execFileSync,
} = {}) {
    const [command, ...args] = argv;
    if (!command || ["--help", "-h"].includes(command)) {
        console.log(help);
        return;
    }
    if (!["import-psd", "export-psd", "check-source"].includes(command))
        throw new Error(`Unknown command: ${command}`);
    if (command === "import-psd" && args.includes("--help")) {
        console.log(help);
        return;
    }
    let values;
    if (command === "import-psd") {
        ({ values } = parseArgs({ args, options: {
            file: { type: "string" }, name: { type: "string" }, out: { type: "string" },
            "font-dir": { type: "string" }, update: { type: "boolean" },
        } }));
        for (const key of ["file", "name", "out"]) {
            if (!values[key]?.trim()) throw new Error(`Missing --${key}.`);
        }
        if (!/^[A-Z][A-Za-z0-9_]*$/.test(values.name))
            throw new Error("--name must be a PascalCase ASCII component identifier.");
        await access(resolve(root, values.file));
    } else if (command === "check-source") {
        const packageIndex = args.indexOf("--package");
        if (packageIndex >= 0 && !args[packageIndex + 1])
            throw new Error("Missing --package value.");
    }
    if (command === "check-source") {
        const verifier = join(root, "scripts/verify-uniflex-ui.mjs");
        execute(process.execPath, [verifier, ...args], { cwd: root, env, stdio: "inherit" });
        return;
    }
    const cli = await resolveConverter(root, env);
    const run = (executable, parameters) =>
        execute(executable, parameters, { cwd: root, env, stdio: "inherit" });
    const convert = (parameters) => run(cli.command, [...cli.args, ...parameters]);
    if (command === "export-psd") {
        convert(["export", ...args]);
        return;
    }
    const output = resolve(root, values.out);
    await mkdir(dirname(output), { recursive: true });
    await mkdir(output, { recursive: true });
    const design = join(output, "design");
    const projectPackage = join(output, "project-package");
    convert(["psd-import", "--file", resolve(root, values.file), "--out", design,
        ...(values["font-dir"] ? ["--font-dir", resolve(root, values["font-dir"])] : [])]);
    convert(["uniflex-package", "--design", join(design, "design.json"),
        "--name", values.name, "--out", projectPackage]);
    const project = JSON.parse(await readFile(join(projectPackage, "design.json"), "utf8"));
    if (project.schemaVersion !== 1 || project.kind !== "uniflex-design")
        throw new Error("Converter returned an incompatible UniFlex package.");
    // Keep parsed PSD fields beside design.json so rasterization and component
    // decisions remain auditable after the external converter's handoff.
    const supplement = join(design, "psd-extra.json");
    if (await access(supplement).then(() => true).catch(() => false)) {
        await copyFile(supplement, join(projectPackage, "psd-extra.json"));
    }
    run(process.execPath, [join(root, "scripts/import-uniflex-package.mjs"),
        ...(values.update ? ["--update"] : []), "--name", values.name, projectPackage]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli(process.argv.slice(2)).catch((error) => {
        console.error(`ERROR: ${error.message}`);
        process.exitCode = Number.isInteger(error.status) && error.status > 0 ? error.status : 1;
    });
}
