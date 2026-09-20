import { PropertyItem } from '../bean/structure/PropertyItem'
import { TelemetryFieldTypes } from '../define/TelemetryFieldTypes'

export class TelemetryPropertyFormatter {
    /**
     * 字符转化
     * @param array importance
     * @return PropertyItem
     */
    public static createImportanceProperty(importance: { [key: string]: string | number } = {}): PropertyItem {
        const iProperty = new PropertyItem()
        iProperty.value = this.formatArray(importance)
        iProperty.type = '{ [key: string]: string }'
        iProperty.name = '_important'
        iProperty.appendAnnotation('重要字段标识')

        iProperty.readonly = true

        return iProperty
    }

    public static formatArray(arr: { [key: string]: string | number } = {}) {
        let str = '{'
        for (const key in arr) {
            str += `['${key}']: '${arr[key]}', \n`
        }
        str += '}'
        return str //JSON.stringify(arr)
    }

    public static formatValue(value: string | boolean | { [key: string]: string | number }, dataType: string) {
        switch (dataType) {
            case TelemetryFieldTypes.STRING:
                value = `'${value}'`
                break
            case TelemetryFieldTypes.BOOL:
                value = `'${value ? 'true' : 'false'}'`
                break
            case TelemetryFieldTypes.ARRAY:
                value = this.formatArray(value as { [key: string]: string | number })
                break
        }
        return value
    }
}
