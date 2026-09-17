import { createHash } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function digest(seed) {
    return createHash("sha256").update(String(seed)).digest();
}

/** FairyGUI-safe id: lowercase alphanumeric, stable for a given seed. */
export function fairyId(seed, length = 8) {
    const bytes = digest(seed);
    let out = "";
    for (let i = 0; out.length < length; i += 1) {
        out += ALPHABET[bytes[i % bytes.length] % ALPHABET.length];
    }
    if (/^[0-9]/.test(out)) out = `a${out.slice(1)}`;
    return out;
}

export function childId(seed, index) {
    return `n${index}_${fairyId(seed, 4)}`;
}

export function projectId(seed) {
    return digest(seed).toString("hex").slice(0, 32);
}

export function packageIds(packageName) {
    return { id: fairyId(`pkg:${packageName}`, 8), name: packageName };
}
