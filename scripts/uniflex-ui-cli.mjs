import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { startUniflexWebPreview } from "./lib/uniflex-web-preview.mjs";
import {
    findScreen, flagValue, injectUniflexExportArgs, knownScreenIds, loadScreenCatalog,
    resolvePreviewUrl, screenFromUrl, takeOption,
} from "./lib/uniflex-screens.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `Usage:
  npm run ui:import-psd -- --file artwork.psd --name Backpack --out .cache/psd/job-001 [--font-dir fonts] [--update]
  npm run ui:export-psd -- --screen prompt --out .cache/psd/export-001
  npm run ui:export-psd -- --url http://127.0.0.1:8000/?screen=prompt --out .cache/psd/export-001
  npm run ui:roundtrip -- --screen prompt --out .cache/psd/roundtrip-001
  npm run ui:roundtrip -- --file artwork.psd --name Prompt --out .cache/psd/from-psd
  npm run ui:check-source [-- --package .cache/psd/job-001/project-package --strict]

CLI resolution (first match):
  WEB_UI_TO_PSD_CLI    Optional override: executable path or JS entry; not a shell command.
  WEB_UI_TO_PSD_ROOT   Optional override: install root containing bin/cli.mjs.
  node_modules/web-ui-to-psd/bin/cli.mjs
                       Pinned file:vendor/web-ui-to-psd-*.tgz; default after npm ci.

CI does not need a sibling converter checkout. Chrome and uv remain machine
requirements of the converter.

Export and roundtrip default to the UniFlex adapter, #ui, and the preview ready
signal. Pass --adapter dom to forward a generic webpage. --screen starts a local
preview unless --url or UNIFLEX_PREVIEW_URL is set. Roundtrip exports, imports
the PSD, and packages UniFlex source; it does not write the project unless
--apply. This wrapper does not call the converter's pinball uniflex-build.
`;

const commands = ["import-psd", "export-psd", "roundtrip", "check-source"];

export function runProcess(executable, parameters, options) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(executable, parameters, { ...options, stdio: options?.stdio ?? "inherit" });
        child.on("error", reject);
        child.on("close", (code, signal) => {
            if (code === 0) {
                resolvePromise();
                return;
            }
            const error = new Error(`Command failed: ${executable} ${parameters.join(" ")}`);
            error.status = code ?? 1;
            error.signal = signal;
            reject(error);
        });
    });
}

export async function resolveConverter(root, env) {
    const entry = env.WEB_UI_TO_PSD_CLI
        ? resolve(root, env.WEB_UI_TO_PSD_CLI)
        : join(env.WEB_UI_TO_PSD_ROOT
            ? resolve(root, env.WEB_UI_TO_PSD_ROOT)
            : join(root, "node_modules/web-ui-to-psd"), "bin/cli.mjs");
    try {
        await access(entry);
    } catch (error) {
        throw new Error("web-ui-to-psd CLI is unavailable. Run npm ci to install the pinned vendor package, "
            + "or set WEB_UI_TO_PSD_CLI / WEB_UI_TO_PSD_ROOT to override.", { cause: error });
    }
    return [".js", ".mjs", ".cjs"].includes(extname(entry))
        ? { command: process.execPath, args: [entry] }
        : { command: entry, args: [] };
}

function assertPascalCase(name) {
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(name))
        throw new Error("--name must be a PascalCase ASCII component identifier.");
}

export async function runCli(argv, {
    root = projectRoot, env = process.env, execute = runProcess,
    startPreview = startUniflexWebPreview,
    readText = (file) => readFile(file, "utf8"),
} = {}) {
    const [command, ...args] = argv;
    if (!command || ["--help", "-h"].includes(command)) {
        console.log(help);
        return;
    }
    if (!commands.includes(command))
        throw new Error(`Unknown command: ${command}`);
    if ((command === "import-psd" || command === "export-psd" || command === "roundtrip")
        && args.includes("--help")) {
        console.log(help);
        return;
    }
    if (command === "check-source") {
        const packageIndex = args.indexOf("--package");
        if (packageIndex >= 0 && !args[packageIndex + 1])
            throw new Error("Missing --package value.");
        const verifier = join(root, "scripts/verify-uniflex-ui.mjs");
        await execute(process.execPath, [verifier, ...args], { cwd: root, env, stdio: "inherit" });
        return;
    }

    const cli = await resolveConverter(root, env);
    const run = (executable, parameters) =>
        execute(executable, parameters, { cwd: root, env, stdio: "inherit" });
    const convert = (parameters) => run(cli.command, [...cli.args, ...parameters]);

    const buildProjectPackage = async ({ file, name, output, fontDir }) => {
        const design = join(output, "design");
        const projectPackage = join(output, "project-package");
        await mkdir(dirname(output), { recursive: true });
        await mkdir(output, { recursive: true });
        await convert(["psd-import", "--file", file, "--out", design,
            ...(fontDir ? ["--font-dir", fontDir] : [])]);
        await convert(["uniflex-package", "--design", join(design, "design.json"),
            "--name", name, "--out", projectPackage]);
        const project = JSON.parse(await readText(join(projectPackage, "design.json")));
        if (project.schemaVersion !== 1 || project.kind !== "uniflex-design")
            throw new Error("Converter returned an incompatible UniFlex package.");
        const supplement = join(design, "psd-extra.json");
        if (await access(supplement).then(() => true).catch(() => false)) {
            await copyFile(supplement, join(projectPackage, "psd-extra.json"));
        }
        return projectPackage;
    };

    if (command === "import-psd") {
        const { values } = parseArgs({ args, options: {
            file: { type: "string" }, name: { type: "string" }, out: { type: "string" },
            "font-dir": { type: "string" }, update: { type: "boolean" },
        } });
        for (const key of ["file", "name", "out"]) {
            if (!values[key]?.trim()) throw new Error(`Missing --${key}.`);
        }
        assertPascalCase(values.name);
        await access(resolve(root, values.file));
        const output = resolve(root, values.out);
        const projectPackage = await buildProjectPackage({
            file: resolve(root, values.file),
            name: values.name,
            output,
            fontDir: values["font-dir"] ? resolve(root, values["font-dir"]) : undefined,
        });
        await run(process.execPath, [join(root, "scripts/import-uniflex-package.mjs"),
            ...(values.update ? ["--update"] : []), "--name", values.name, projectPackage]);
        return;
    }

    const catalog = await loadScreenCatalog(root);
    let remaining = args;
    let screenId;
    let apply = false;
    ({ args: remaining, value: screenId } = takeOption(remaining, "screen"));
    if (command === "roundtrip") {
        ({ args: remaining, value: apply } = takeOption(remaining, "apply", { boolean: true }));
    }
    const file = flagValue(remaining, "file");
    const urlFlag = flagValue(remaining, "url");
    const out = flagValue(remaining, "out");
    const nameFlag = flagValue(remaining, "name");
    const fontDirFlag = flagValue(remaining, "font-dir");
    if (!out?.trim()) throw new Error("Missing --out.");

    if (command === "roundtrip" && file) {
        if (screenId || urlFlag) throw new Error("Use either --file or --screen/--url, not both.");
        if (!nameFlag?.trim()) throw new Error("Missing --name.");
        assertPascalCase(nameFlag);
        await access(resolve(root, file));
        const output = resolve(root, out);
        const projectPackage = await buildProjectPackage({
            file: resolve(root, file),
            name: nameFlag,
            output,
            fontDir: fontDirFlag ? resolve(root, fontDirFlag) : undefined,
        });
        await run(process.execPath, [join(root, "scripts/verify-uniflex-ui.mjs"),
            "--package", projectPackage]);
        if (apply) {
            await run(process.execPath, [join(root, "scripts/import-uniflex-package.mjs"),
                "--name", nameFlag, projectPackage]);
        }
        return;
    }

    const suppliedUrl = urlFlag || env.UNIFLEX_PREVIEW_URL;
    const screen = screenId
        ? findScreen(catalog, screenId)
        : suppliedUrl ? screenFromUrl(catalog, suppliedUrl) : findScreen(catalog, null);
    if (screenId && !screen) {
        throw new Error(`Unknown UniFlex preview screen: ${screenId}. Known: ${knownScreenIds(catalog)}`);
    }
    if (command === "roundtrip" && !nameFlag && !screen) {
        throw new Error("Missing --name or --screen.");
    }
    const name = nameFlag || screen?.componentName;
    if (nameFlag) assertPascalCase(nameFlag);

    let preview;
    try {
        let base = suppliedUrl;
        if (!base) {
            preview = await startPreview({ root, port: 0 });
            base = preview.url;
        }
        const page = resolvePreviewUrl(base, screen);
        const exportDir = command === "roundtrip" ? join(resolve(root, out), "export") : resolve(root, out);
        const exportArgs = remaining.filter((arg, index, list) => {
            const previous = list[index - 1];
            if (arg === "--out" || previous === "--out") return false;
            if (command === "roundtrip" && (arg === "--name" || previous === "--name")) return false;
            if (command === "roundtrip" && (arg === "--font-dir" || previous === "--font-dir")) return false;
            return true;
        });
        await convert(["export", ...injectUniflexExportArgs(exportArgs, { url: page, screen }),
            "--out", exportDir]);
        if (command === "export-psd") return;

        const report = JSON.parse(await readText(join(exportDir, "validation.json")));
        if (!report?.psd) throw new Error("Converter export did not report a PSD path.");
        const output = resolve(root, out);
        const projectPackage = await buildProjectPackage({
            file: join(exportDir, report.psd),
            name,
            output,
            fontDir: join(exportDir, "fonts"),
        });
        await run(process.execPath, [join(root, "scripts/verify-uniflex-ui.mjs"),
            "--package", projectPackage]);
        if (apply) {
            await run(process.execPath, [join(root, "scripts/import-uniflex-package.mjs"),
                "--name", name, projectPackage]);
        }
    } finally {
        if (preview) await preview.dispose();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli(process.argv.slice(2)).catch((error) => {
        console.error(`ERROR: ${error.message}`);
        process.exitCode = Number.isInteger(error.status) && error.status > 0 ? error.status : 1;
    });
}
