import type { BackpackAction } from "../../ui-uniflex/imported/Backpack/Backpack.authoring";

export type BackpackCheckpointStep =
    | { readonly type: "press"; readonly name: string }
    | { readonly type: "back" };

export class BackpackLogic {
    readonly events: BackpackAction[] = [];
    private readonly bindings: Readonly<Record<string, BackpackAction["action"]>> = {
        "ROLE::layer-2": "primary",
        "ROLE::layer-13": "primary",
        "ROLE::layer-27": "back",
        "ROLE::layer-57": "tab",
    };

    onAction(action: BackpackAction): void {
        const expected = this.bindings[action.id === "layer-2" ? "ROLE::layer-2"
            : action.id === "layer-13" ? "ROLE::layer-13"
                : action.id === "layer-27" ? "ROLE::layer-27"
                    : action.id === "layer-57" ? "ROLE::layer-57" : ""];
        if (!expected || expected !== action.action)
            throw new Error(`Unbound or invalid Backpack action: ${action.id}/${action.action}`);
        this.events.push(action);
    }

    runCheckpoint(steps: readonly BackpackCheckpointStep[]): readonly BackpackAction[] {
        for (const step of steps) {
            if (step.type === "back") {
                this.onAction({ id: "layer-27", action: "back" });
                continue;
            }
            const stableKey = step.name.startsWith("ROLE::") ? step.name : `ROLE::${step.name}`;
            const id = Object.keys(this.bindings).find((key) => key === stableKey);
            if (!id) throw new Error(`Checkpoint target is not bound: ${step.name}`);
            this.onAction({ id: id.slice("ROLE::".length), action: this.bindings[id] });
        }
        return this.events;
    }
}
