export class EquipTelemetryFormatter {
    static formatEffects(effectIds: int[]): string {
        if (!effectIds) {
            return '-'
        }

        const formatted = []
        for (const effectId of effectIds) {
            formatted.push(C.equip_effect(effectId).name)
        }
        return formatted.join(',')
    }
}
