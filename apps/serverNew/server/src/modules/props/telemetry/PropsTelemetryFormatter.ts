import type { PropItem } from '../../../runtime/protocol/C2S/commom'
import { ItemIdDefine } from '../rules/ItemIdDefine'

export class PropsTelemetryFormatter {
    static itemTypeName(itemType: int): string {
        if (ItemIdDefine.ITEM_TYPE_FIELD_MAP[itemType]) {
            return ItemIdDefine.ITEM_TYPE_FIELD_MAP[itemType]
        }
        return String(itemType)
    }

    static formatAwards(awards: PropItem[], includeQuantity = true) {
        const formatted = []

        for (const award of awards) {
            const propId = award.propId
            const quantity = award.num

            if (propId == 0 || quantity == 0) {
                continue
            }
            if (!C.item().has(propId)) {
                continue
            }

            const itemConfig = C.item(propId)
            formatted.push(includeQuantity ? `${itemConfig.name} * ${quantity}` : itemConfig.name)
        }

        return formatted
    }
}
