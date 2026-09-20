import { Player } from './Player'

export class ActionPlayerGetLogField extends Player {
    public doAction(params: { [key: string]: any }) {
        const field = params.field ?? null

        if (!field) {
            return {}
        }

        if (!(field in this)) {
            return {}
        }

        return {
            field: (this as any)[field](),
        }
    }
}
