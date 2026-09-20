export type InternalJsonActionHandler = (actionParams: any, ip?: string) => Promise<string>

export class InternalJsonActionRegistry {
    private static readonly handlers = new Map<string, InternalJsonActionHandler>()

    static register(type: string, handler: InternalJsonActionHandler) {
        if (this.handlers.has(type)) {
            throw new Error(`internal JSON action handler already registered: ${type}`)
        }
        this.handlers.set(type, handler)
    }

    static async execute(type: string, actionParams: any, ip?: string): Promise<string> {
        const handler = this.handlers.get(type)
        return handler ? handler(actionParams, ip) : 'nothing to do'
    }
}
