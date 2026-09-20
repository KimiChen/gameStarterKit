import * as ExcelJS from 'exceljs'
import { ClassItem } from '../bean/structure/ClassItem'
import { PropertyItem } from '../bean/structure/PropertyItem'
import { TelemetryFieldTypes } from '../define/TelemetryFieldTypes'
import { TelemetryPropertyFormatter } from '../util/TelemetryPropertyFormatter'
import { AbstractConvert } from './AbstractConvert'

export class ConvertUser extends AbstractConvert {
    public class!: ClassItem

    protected DATA_FORMAT: { [key: string]: string | number } = {}

    protected METHOD: { [key: string]: string | number } = {}

    protected worksheet!: ExcelJS.Worksheet

    protected important: { [key: string]: string | number } = {}

    /**
     * @throws Exception
     */
    public run() {
        this.worksheet = this.workBook.getWorksheet(this.config.taUserSheet)!

        this.class = new ClassItem()

        this.class.name = this.config.taUserClassName
        this.class.namespace = this.config.taUserNamespace
        this.class.savePath = this.config.taUserPath

        this.class.appendAnnotation([this.class.name, '数数用户数据'])

        // 逐行遍历该工作表内所有的单元格
        for (let rowNumber = 4; rowNumber <= this.worksheet.rowCount; rowNumber++) {
            const cellVal = this.worksheet.getCell(rowNumber, 2).value
            if (typeof cellVal === 'object') {
                continue
            }

            const property = this.convertCell(rowNumber)

            this.class.properties[property.name] = property
        }

        const property1 = new PropertyItem()
        property1.name = 'DATA_FORMAT'
        property1.type = '{ [key: string]: string | number }'
        property1.value = TelemetryPropertyFormatter.formatArray(this.DATA_FORMAT)
        property1.staticOrConst = PropertyItem.IS_CONST

        const property2 = new PropertyItem()
        property2.name = 'METHOD'
        property2.type = '{ [key: string]: string | number }'
        property2.value = TelemetryPropertyFormatter.formatArray(this.METHOD)
        property2.staticOrConst = PropertyItem.IS_CONST

        this.class.properties[property1.name] = property1
        this.class.properties[property2.name] = property2
    }

    /**
     * @throws \PhpOffice\PhpSpreadsheet\Exception
     * @throws Exception
     */
    public convertCell(rowIndex: number): PropertyItem {
        let method = ''
        let format = ''
        const annotation: string[] = []
        let name = ''

        this.worksheet.getRow(rowIndex).eachCell((cell) => {
            const col = cell.address.charAt(0)
            const value = cell.value as string
            switch (col) {
                case 'A':
                    // 属性名称
                    name = value
                    break
                case 'B':
                    // 属性说明
                    annotation.push(value)
                    break
                case 'C':
                    // 属性类型
                    format = TelemetryFieldTypes.TYPE_MAP[value] ?? ''
                    break
                case 'D':
                    // 属性类型
                    method = value
                    break
                case 'E': // 事件说明
                    annotation.push(value)
                    break
            }
        })

        const replaced = name.replace('#', '')
        if (!replaced) {
            throw new Error(`A:${rowIndex} 属性英文名不能为空 ${name} => ${replaced}`)
        }
        if (this.class.properties[replaced]) {
            throw new Error(`A:${rowIndex} [${name}] 属性英文名重复`)
        }

        const property = new PropertyItem()
        property.name = replaced.toUpperCase()
        property.type = TelemetryFieldTypes.STRING
        property.value = TelemetryPropertyFormatter.formatValue(name, TelemetryFieldTypes.STRING)

        property.appendAnnotation(annotation)
        property.appendAnnotation(`@ta-var    ${format}`)
        property.appendAnnotation(`@ta-method ${method}`)

        property.staticOrConst = PropertyItem.IS_CONST

        this.DATA_FORMAT[name] = format
        this.METHOD[name] = method

        return property
    }
}
