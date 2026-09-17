import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const FAIRYGUI_DOM = Object.freeze({
    version: "1.0.0",
    tarball: "vendor/fairygui-dom-1.0.0.tgz",
    sha256: "d48b4dc9d107dffe9ab2abe8140e88aeec91ed1f04d258740df432d45eec4702",
    umd: "package/dist/fairygui.js",
    esm: "package/dist/fairygui.module.js",
});

export function fairyguiDomTarball(root) {
    return resolve(root, FAIRYGUI_DOM.tarball);
}

export function verifyFairyguiDomTarball(root) {
    const file = fairyguiDomTarball(root);
    if (!existsSync(file)) throw new Error(`缺少 fairygui-dom 制品：${FAIRYGUI_DOM.tarball}`);
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (actual !== FAIRYGUI_DOM.sha256) {
        throw new Error(`${FAIRYGUI_DOM.tarball} sha256 不符：期望 ${FAIRYGUI_DOM.sha256}，实得 ${actual}`);
    }
    return file;
}

/** Unpack the pinned tarball and return absolute paths to dist JS. */
export async function extractFairyguiDom(root) {
    const tarball = verifyFairyguiDomTarball(root);
    const tmp = mkdtempSync(join(tmpdir(), "fairygui-dom-"));
    try {
        mkdirSync(tmp, { recursive: true });
        execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "pipe" });
        const umd = join(tmp, FAIRYGUI_DOM.umd);
        const esm = join(tmp, FAIRYGUI_DOM.esm);
        if (!existsSync(umd)) throw new Error("fairygui-dom tarball 缺少 dist/fairygui.js");
        return { umd, esm, cleanup: () => rmSync(tmp, { recursive: true, force: true }), tmp };
    } catch (error) {
        rmSync(tmp, { recursive: true, force: true });
        throw error;
    }
}
