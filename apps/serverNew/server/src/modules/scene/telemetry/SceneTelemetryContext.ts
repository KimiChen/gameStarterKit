export class SceneTelemetryContext {
    static readonly REASON_ITEM_CHANGE = '场景道具变更'

    static readonly REASON_SKILL_USE = '场景技能释放'

    static readonly SKILL_TYPE_NAMES: { [key: string]: string } = {}

    static moduleNameAndReason(): string[] {
        if (!Ctx) {
            return ['-', '-']
        }
        let moduleName = Ctx.apiName
        const separatorIndex = moduleName.indexOf('/')
        if (separatorIndex !== -1) {
            moduleName = moduleName.substring(0, separatorIndex)
        }
        return [moduleName, Ctx.apiName ?? '-']
    }
}
