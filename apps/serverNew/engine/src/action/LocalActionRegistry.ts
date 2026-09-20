import { IActionLogic } from './IActionLogic'

export type LocalActionClass = { new(): IActionLogic }

export class LocalActionRegistry {
    private static readonly actions = new Map<string, LocalActionClass>()

    static register(actions: Record<string, LocalActionClass>) {
        for (const [name, action] of Object.entries(actions)) {
            this.actions.set(name, action)
        }
    }

    static get(name: string) {
        return this.actions.get(name)
    }
}
