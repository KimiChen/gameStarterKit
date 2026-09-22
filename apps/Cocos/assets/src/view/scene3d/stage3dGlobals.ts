/**
 * Fields managed by the SC1 global-token table. Colors and resource references
 * deliberately stay outside this snapshot until their engine ownership and
 * conversion boundaries are implemented.
 */
export interface Stage3DGlobalsState {
    toneMapping: "default" | "linear";
    fog: {
        enabled: boolean;
        type: "linear" | "exp" | "expSquared" | "layered";
        density: number;
        start: number;
        end: number;
    };
    ambient: { skyIllum: number };
    shadows: { enabled: boolean; kind: "planar" | "shadowMap" };
}

export interface Stage3DGlobalsPatch {
    toneMapping?: Stage3DGlobalsState["toneMapping"];
    fog?: Partial<Stage3DGlobalsState["fog"]>;
    ambient?: Partial<Stage3DGlobalsState["ambient"]>;
    shadows?: Partial<Stage3DGlobalsState["shadows"]>;
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${path} must be an object`);
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must be a plain object`);
    }
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !keys.includes(key)) {
            throw new TypeError(`${path} contains unsupported field ${String(key)}`);
        }
    }
    return value as Record<string, unknown>;
}

function booleanValue(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
    return value;
}

function enumValue<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    if (typeof value !== "string" || !allowed.includes(value as T)) {
        throw new TypeError(`${path} must be one of ${allowed.join(", ")}`);
    }
    return value as T;
}

function numberValue(value: unknown, path: string, nonnegative = false): number {
    if (typeof value !== "number" || !Number.isFinite(value) || (nonnegative && value < 0)) {
        throw new TypeError(`${path} must be a finite${nonnegative ? " nonnegative" : ""} number`);
    }
    return value;
}

/** Copy and validate a patch. An undefined field means it is not overridden. */
export function normalizeGlobalsPatch(patch: Stage3DGlobalsPatch): Stage3DGlobalsPatch {
    const source = record(patch, "globals", ["toneMapping", "fog", "ambient", "shadows"]);
    const result: Stage3DGlobalsPatch = {};
    if (source.toneMapping !== undefined) {
        result.toneMapping = enumValue(source.toneMapping, "globals.toneMapping", ["default", "linear"] as const);
    }
    if (source.fog !== undefined) {
        const fog = record(source.fog, "globals.fog", ["enabled", "type", "density", "start", "end"]);
        const normalized: Partial<Stage3DGlobalsState["fog"]> = {};
        if (fog.enabled !== undefined) normalized.enabled = booleanValue(fog.enabled, "globals.fog.enabled");
        if (fog.type !== undefined) normalized.type = enumValue(fog.type, "globals.fog.type", ["linear", "exp", "expSquared", "layered"] as const);
        if (fog.density !== undefined) normalized.density = numberValue(fog.density, "globals.fog.density", true);
        if (fog.start !== undefined) normalized.start = numberValue(fog.start, "globals.fog.start");
        if (fog.end !== undefined) normalized.end = numberValue(fog.end, "globals.fog.end");
        result.fog = normalized;
    }
    if (source.ambient !== undefined) {
        const ambient = record(source.ambient, "globals.ambient", ["skyIllum"]);
        const normalized: Partial<Stage3DGlobalsState["ambient"]> = {};
        if (ambient.skyIllum !== undefined) normalized.skyIllum = numberValue(ambient.skyIllum, "globals.ambient.skyIllum", true);
        result.ambient = normalized;
    }
    if (source.shadows !== undefined) {
        const shadows = record(source.shadows, "globals.shadows", ["enabled", "kind"]);
        const normalized: Partial<Stage3DGlobalsState["shadows"]> = {};
        if (shadows.enabled !== undefined) normalized.enabled = booleanValue(shadows.enabled, "globals.shadows.enabled");
        if (shadows.kind !== undefined) normalized.kind = enumValue(shadows.kind, "globals.shadows.kind", ["planar", "shadowMap"] as const);
        result.shadows = normalized;
    }
    return result;
}

function required<T>(value: T | undefined, path: string): T {
    if (value === undefined) throw new TypeError(`globals baseline is missing ${path}`);
    return value;
}

/** Validate every managed baseline field and return a detached snapshot. */
export function cloneGlobals(state: Stage3DGlobalsState): Stage3DGlobalsState {
    const normalized = normalizeGlobalsPatch(state);
    const fog = required(normalized.fog, "fog");
    const ambient = required(normalized.ambient, "ambient");
    const shadows = required(normalized.shadows, "shadows");
    return {
        toneMapping: required(normalized.toneMapping, "toneMapping"),
        fog: {
            enabled: required(fog.enabled, "fog.enabled"),
            type: required(fog.type, "fog.type"),
            density: required(fog.density, "fog.density"),
            start: required(fog.start, "fog.start"),
            end: required(fog.end, "fog.end"),
        },
        ambient: { skyIllum: required(ambient.skyIllum, "ambient.skyIllum") },
        shadows: {
            enabled: required(shadows.enabled, "shadows.enabled"),
            kind: required(shadows.kind, "shadows.kind"),
        },
    };
}

/** Recompute from the baseline and live tokens in acquisition order. */
export function resolveGlobals(
    baseline: Stage3DGlobalsState,
    patches: readonly Stage3DGlobalsPatch[],
): Stage3DGlobalsState {
    const result = cloneGlobals(baseline);
    for (const patch of patches) {
        const normalized = normalizeGlobalsPatch(patch);
        if (normalized.toneMapping !== undefined) result.toneMapping = normalized.toneMapping;
        if (normalized.fog !== undefined) Object.assign(result.fog, normalized.fog);
        if (normalized.ambient !== undefined) Object.assign(result.ambient, normalized.ambient);
        if (normalized.shadows !== undefined) Object.assign(result.shadows, normalized.shadows);
    }
    return result;
}
