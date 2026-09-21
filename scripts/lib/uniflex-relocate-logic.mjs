import { relative, resolve } from "node:path";

const SRC_ROOT_PREFIXES = /^(?:logic|kits)\//u;
const UNIFLEX_ROOT_PREFIXES = /^(?:components|gamecomponents|themes)\//u;

/**
 * AOT flattens author modules into `ui-uniflex/generated/`. Author-relative
 * imports keep the original `../` depth, so strip it and re-anchor:
 * `logic/` and `kits/` live under `apps/client/src/`;
 * `components/` / `gamecomponents/` / `themes/` live under `ui-uniflex/`.
 */
export function relocateAuthorImport(specifier, { client, generated }) {
    if (!specifier.startsWith(".")) return specifier;
    const rootRelative = specifier.replace(/^(?:\.\.\/)+/u, "");
    const target = SRC_ROOT_PREFIXES.test(rootRelative)
        ? resolve(client, "src", rootRelative)
        : UNIFLEX_ROOT_PREFIXES.test(rootRelative)
            ? resolve(client, "src/ui-uniflex", rootRelative)
            : resolve(client, "src/ui-uniflex", specifier);
    const path = relative(generated, target).replace(/\.js$/, "");
    return path.startsWith(".") ? path : `./${path}`;
}
