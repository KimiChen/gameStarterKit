import type { BackpackAction } from "../../ui-uniflex/pages/Backpack/Backpack";

export type BackpackCheckpointStep =
    | { readonly type: "press"; readonly name: string }
    | { readonly type: "back" };

export class BackpackLogic {
    readonly events: BackpackAction[] = [];
    private readonly bindings: Readonly<Record<string, BackpackAction["action"]>> = {
        "ROLE::tab-resource": "tab",
        "ROLE::item-resource-diamond-1": "select",
        "ROLE::resource-1": "primary",
        "ROLE::quantity": "select",
        "ROLE::back": "back",
    };

    onAction(action: BackpackAction): void {
        const expected = action.id === "back" ? "back"
            : /^tab-(equipment|resource|speedup|boost|other)$/.test(action.id) ? "tab"
                : action.id.startsWith("item-") ? "select"
                    : /^resource-[1-4]$/.test(action.id) ? "primary"
                        : action.id === "quantity" ? "select" : undefined;
        if (!expected || expected !== action.action)
            throw new Error(`Unbound or invalid Backpack action: ${action.id}/${action.action}`);
        this.events.push(action);
    }

    runCheckpoint(steps: readonly BackpackCheckpointStep[]): readonly BackpackAction[] {
        for (const step of steps) {
            if (step.type === "back") {
                this.onAction({ id: "back", action: "back" });
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
