import * as ExcelJS from 'exceljs'
import { ClassItem } from '../bean/structure/ClassItem'
import { AbstractConvert } from './AbstractConvert'
import { PropertyItem } from '../bean/structure/PropertyItem'
import { TelemetryFieldTypes } from '../define/TelemetryFieldTypes'
import { TelemetryPropertyFormatter } from '../util/TelemetryPropertyFormatter'

/**
 * 将 Excel 中的全局埋点属性转换为生成模型。
 */
export class TelemetryGlobalPropertiesConverter extends AbstractConvert {
    // 存储转换后的类对象
    public class!: ClassItem

    // 存储当前正在处理的工作表
    protected worksheet!: ExcelJS.Worksheet

    // 存储重要属性的映射
    protected _important: { [key: string]: string | number } = {}

    /**
     * 转换方法，用于执行具体的转换逻辑
     */
    public run() {
        this.worksheet = this.workBook.getWorksheet(this.config.taCommonSheet)!
        this.class = new ClassItem()

        // 设置类的名称、命名空间和保存路径
        this.class.name = this.config.taCommonClassName
        this.class.namespace = this.config.taCommonNamespace
        this.class.savePath = this.config.taCommonPath
        this.class.appendAnnotation([this.class.name, '数数事件公共属性'])

        // 创建一个属性对象，用于存储版本号信息
        const tProperty = new PropertyItem()
        tProperty.name = 'taVersion'
        tProperty.type = TelemetryFieldTypes.INT
        tProperty.value = 0
        tProperty.appendAnnotation('玩家数数版本号')
        this.class.properties[tProperty.name] = tProperty

        // 逐行遍历该工作表内所有的单元格
        for (let rowNumber = 5; rowNumber <= this.worksheet.rowCount; rowNumber++) {
            const cellVal = this.worksheet.getCell(rowNumber, 2).value
            if (typeof cellVal === 'object') {
                continue
            }
            const rowIndex = rowNumber
            const property = this.convertCell(rowIndex)
            if (this.class.properties[property.name]) {
                throw new Error(`第${rowIndex}行的${property.name}属性重复`)
            }
            this.class.properties[property.name] = property
        }

        // 生成重要属性列表，并将其添加到类的属性列表中
        const iProperty = TelemetryPropertyFormatter.createImportanceProperty(this._important)
        this.class.properties[iProperty.name] = iProperty
    }

    /**
     * convertCell 方法，用于将单元格数据转换为属性对象
     * @param rowIndex - 行索引
     * @returns 转换后的属性对象
     */
    public convertCell(rowIndex: int): PropertyItem {
        const property = new PropertyItem()
        // 属性名称
        const name = this.worksheet.getCell(rowIndex, 1).value as string
        const replaced = name.replace('#', '')
        if (!replaced) {
            throw new Error(`A:${rowIndex} 属性英文名不能为空 ${name} => ${replaced}`)
        }
        if (this.class.properties[replaced]) {
            throw new Error(`A:${rowIndex} ${name} 属性英文名重复`)
        }
        if (replaced != name) {
            this._important[replaced] = 1
        }
        property.name = replaced

        // 属性类型
        const type = this.worksheet.getCell(rowIndex, 3).value as string
        if (!TelemetryFieldTypes.TYPE_MAP[type]) {
            throw new Error(`C:${rowIndex} ${type} 属性类型非法`)
        }
        property.type = TelemetryFieldTypes.TYPE_MAP[type] ?? ''
        property.value = TelemetryFieldTypes.TYPE_MAP_DEFAULT[type] ?? 'undefined'

        // 事件中文名
        property.appendAnnotation(this.worksheet.getCell(rowIndex, 1).value as string)

        // 属性说明
        property.appendAnnotation(this.worksheet.getCell(rowIndex, 2).value as string)

        return property
    }
}
