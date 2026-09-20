import type { AttrTypeBean } from '../bean/AttrTypeBean'
import { AttributeScale } from '../rules/AttributeScale'

export class AttrTelemetryFormatter {
    static formatAttributes(attributes: Map<int, AttrTypeBean>) {
        if (!attributes) {
            return '-'
        }

        const formatted = []
        for (const [, attribute] of attributes) {
            const attributeConfig = C.attr(attribute.type)
            let value = attribute.val.toString()
            if (attributeConfig.isRate) {
                value = (attribute.val / AttributeScale.NUMBER_RATIO) * 100 + '%'
            }
            formatted.push(`${attributeConfig.name}+${value}`)
        }

        return formatted.join(',')
    }
}
