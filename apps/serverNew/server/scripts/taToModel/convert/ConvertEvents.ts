import * as ejs from 'ejs'
import * as ExcelJS from 'exceljs'
import { EventItem } from '../bean/event/EventItem'
import { FieldItem } from '../bean/event/FieldItem'
import { TelemetryEventModule } from '../bean/event/TelemetryEventModule'
import { ClassItem } from '../bean/structure/ClassItem'
import { MethodItem } from '../bean/structure/MethodItem'
import { MethodParamItem } from '../bean/structure/MethodParamItem'
import { PropertyItem } from '../bean/structure/PropertyItem'
import { TelemetryFieldTypes } from '../define/TelemetryFieldTypes'
import { IdentifierCaseFormatter } from '../util/IdentifierCaseFormatter'
import { TelemetryPropertyFormatter } from '../util/TelemetryPropertyFormatter'
import { AbstractConvert } from './AbstractConvert'

export const TELEMETRY_USER_SOURCE = '../../../src/modules/user/bean/User'

export function telemetryUserImportLine() {
    return `import { User } from '${TELEMETRY_USER_SOURCE}'`
}

export class ConvertEvents extends AbstractConvert {
    public classes: ClassItem[] = []

    protected modules: { [key: string]: TelemetryEventModule } = {}

    /**
     * 所有事件列表
     */
    protected events: { [key: string]: EventItem } = {}

    /**
     * 事件名 => 事件的类item
     */
    protected eventClasses: { [key: string]: ClassItem } = {}

    protected currModule?: TelemetryEventModule

    protected currEvent?: EventItem

    protected worksheet!: ExcelJS.Worksheet

    public async run() {
        const workerSheet = this.workBook.getWorksheet(this.config.taEventSheet)
        this.worksheet = workerSheet!

        // 逐行遍历该工作表内所有的单元格
        for (let rowNumber = 5; rowNumber <= this.worksheet.rowCount; rowNumber++) {
            const cellVal = this.worksheet.getCell(rowNumber, 6).value
            if (typeof cellVal === 'object') {
                continue
            }
            this.parseModule(rowNumber)
            this.parseEvent(rowNumber)
            this.parseField(rowNumber)
        }

        for (const k1 in this.modules) {
            const module = this.modules[k1]
            for (const k2 in module.events) {
                this.toModelClass(module.events[k2], module)
            }
            await this.toModuleClass(module)
        }
    }

    /**
     * 解析模块信息
     */
    public parseModule(rowIndex: int) {
        const name = this.worksheet.getCell(rowIndex, 2).value as string
        const desc = this.worksheet.getCell(rowIndex, 1).value as string
        if (!name && desc) {
            throw new Error(`B:${rowIndex} 模块英文名为空`)
        }

        if (!name && !desc) {
            return
        }

        if (!this.modules[name]) {
            const module = new TelemetryEventModule()
            module.name = name
            module.desc = desc
            this.modules[name] = module
        }

        this.currModule = this.modules[name]
    }

    /**
     * 解析事件信息
     * @param rowIndex
     * @returns
     */
    public parseEvent(rowIndex: int) {
        const name = this.worksheet.getCell(rowIndex, 3).value as string
        const nameCn = this.worksheet.getCell(rowIndex, 4).value as string
        const desc = this.worksheet.getCell(rowIndex, 5).value as string

        if (nameCn && !name) {
            throw new Error(`C:${rowIndex} 事件英文为空`)
        }
        if (!name && !nameCn) {
            return
        }

        if (!this.currModule) {
            throw new Error(`行${rowIndex} 模块有问题`)
        }

        if (this.events[name] && this.events[name].moduleName != this.currModule.name) {
            throw new Error(`C:${rowIndex} 事件英文名重复`)
        }

        if (!this.currModule.events[name]) {
            const eventItem = new EventItem()
            eventItem.nameCn = nameCn
            eventItem.nameEn = name
            eventItem.desc = desc
            eventItem.moduleName = this.currModule.name

            this.currModule.events[name] = eventItem
            this.events[name] = eventItem
        }

        this.currEvent = this.currModule.events[name]
    }

    /**
     * 生成字段信息
     * @param rowIndex
     */
    public parseField(rowIndex: int) {
        const nameEn = this.worksheet.getCell(rowIndex, 6).value as string
        const nameCn = this.worksheet.getCell(rowIndex, 7).value as string
        const desc = this.worksheet.getCell(rowIndex, 8).value as string

        const type = (this.worksheet.getCell(rowIndex, 9).value as string).trim()

        const replaced = nameEn.replace('#', '')
        if (!replaced) {
            throw new Error(`F:${rowIndex} 属性英文名不能为空`)
        }
        if (!TelemetryFieldTypes.TYPE_MAP[type]) {
            throw new Error(`I:${rowIndex} ${type} 属性类型非法`)
        }
        if (!this.currEvent) {
            throw new Error(`${rowIndex} ${nameEn} 事件有问题`)
        }
        if (this.currEvent.fields[replaced]) {
            throw new Error(`F:${rowIndex} ${nameEn} 属性英文名重复`)
        }

        const fieldItem = new FieldItem()
        fieldItem.nameCn = nameCn
        fieldItem.nameEn = replaced
        fieldItem.desc = String(desc)
        fieldItem.type = TelemetryFieldTypes.TYPE_MAP[type]
        fieldItem.specType = TelemetryFieldTypes.SPEC_TYPE_MAP[type] ?? ''
        fieldItem.importance = replaced !== nameEn

        this.currEvent.fields[replaced] = fieldItem
    }

    /**
     * 生成数数模型结构
     * @param event
     * @param moduleInfo
     */
    public toModelClass(event: EventItem, moduleInfo: TelemetryEventModule) {
        const importance: { [key: string]: number } = {}

        const model = new ClassItem()

        model.name = 'Ta' + IdentifierCaseFormatter.snakeToPascalCase(event.nameEn, false)
        model.savePath = this.config.taModelPath

        model.namespace = this.config.taModelNamespace
        model.appendAnnotation([`模块名:${moduleInfo.desc}`, `事件名:${event.nameCn}`, `说明:${event.desc}`])

        const eProperty = new PropertyItem()
        eProperty.name = 'EVENT_NAME'
        eProperty.appendAnnotation('事件名称')
        eProperty.type = TelemetryFieldTypes.STRING
        eProperty.readonly = true
        eProperty.value = TelemetryPropertyFormatter.formatValue(event.nameEn, TelemetryFieldTypes.STRING)

        model.properties[eProperty.name] = eProperty

        for (const name in event.fields) {
            const field = event.fields[name]
            const property = new PropertyItem()

            property.name = field.nameEn
            property.type = field.type
            property.specType = field.specType
            property.value = TelemetryFieldTypes.TYPE_MAP_DEFAULT[field.type]

            property.appendAnnotation(`字段名:${field.nameCn}`)
            property.appendAnnotation(`示例:${field.desc}`)

            model.properties[property.name] = property

            if (field.importance) {
                importance[property.name] = 1
            }
        }

        const genImport = TelemetryPropertyFormatter.createImportanceProperty(importance)
        model.properties[genImport.name] = genImport

        this.classes.push(model)

        this.eventClasses[event.nameEn] = model
    }

    /**
     * 生成模块函数结构
     * @param moduleInfo
     */
    public async toModuleClass(moduleInfo: TelemetryEventModule) {
        const classItem = new ClassItem()

        classItem.name = IdentifierCaseFormatter.snakeToPascalCase(moduleInfo.name, false)

        classItem.namespace = this.config.taModuleNamespace
        classItem.savePath = this.config.taModulePath + `${classItem.name.toLowerCase()}/`
        classItem.appendAnnotation([`模块名：${moduleInfo.name}`, `说明：${moduleInfo.desc}`])

        for (const key in moduleInfo.events) {
            const param = new MethodParamItem()
            param.name = 'user'
            param.type = 'User'
            param.index = 0

            const event = moduleInfo.events[key]

            const model = this.eventClasses[event.nameEn]

            const method = new MethodItem()
            method.eventName = IdentifierCaseFormatter.snakeToPascalCase(event.nameEn, true)
            method.name = `ta${classItem.name}_` + IdentifierCaseFormatter.snakeToPascalCase(event.nameEn, true)
            method.isStatic = true
            method.uses.push(telemetryUserImportLine())
            method.uses.push("import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'")
            method.uses.push(
                "import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'",
            )
            method.uses.push(`import { ${model.name} } from '../models/${model.name}'`)

            method.appendAnnotation(`事件名:${event.nameCn}`)
            method.appendAnnotation(`说明:${event.desc}`)
            method.params[param.index] = param

            const ejsTpl = this.projectPath + '/taToModel/tpl/EventMethodBody.ejs'
            method.body = await ejs.renderFile(ejsTpl, { model: model })

            classItem.methods.push(method)
        }

        this.classes.push(classItem)
    }
}
