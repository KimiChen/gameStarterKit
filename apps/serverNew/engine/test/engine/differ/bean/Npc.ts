import { HashJson } from '../../../../src/differ/hashJson'

import { Attr } from './Attr'

class Npc extends HashJson {
    name: string = ''

    x = 0

    y = 0

    attr?: Attr

    // 计算 2 个坐标点间的距离的方法
    get distance() {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2))
    }
}

/**  以下代码是自动生成, 非必要请勿修改 */

import { ClassInfo, FieldInfo } from '../../../../src/differ/diff'
import { FieldStatus } from '../../../../src/differ/status'
import { IdFieldType } from '../../../../src/differ/bean'

class NpcGen extends Npc {
    protected _name: string = ''

    protected _x: number = 0

    protected _y: number = 0

    protected _attr?: Attr = undefined

    constructor(key: string, id: IdFieldType) {
        super(key, id)

        delete (this as any).name

        delete (this as any).x

        delete (this as any).y

        delete (this as any).attr
    }

    //@ts-ignore
    get name(): string {
        return this._name
    }

    //@ts-ignore
    set name(value: string) {
        if (this._name === value) {
            return
        }
        this.onChange(NpcGen.f_name, FieldStatus.Update)
        this._name = value
    }

    //@ts-ignore
    get x(): number {
        return this._x
    }

    //@ts-ignore
    set x(value: number) {
        if (this._x === value) {
            return
        }
        this.onChange(NpcGen.f_x, FieldStatus.Update)
        this._x = value
    }

    //@ts-ignore
    get y(): number {
        return this._y
    }

    //@ts-ignore
    set y(value: number) {
        if (this._y === value) {
            return
        }
        this.onChange(NpcGen.f_y, FieldStatus.Update)
        this._y = value
    }

    //@ts-ignore
    get attr(): Attr | undefined {
        if (this._attr !== undefined) {
            this._attr.initDiff(this, NpcGen.f_attr)
        }
        return this._attr
    }

    //@ts-ignore
    set attr(value: Attr) {
        if (this._attr === value) {
            return
        }
        this.onChange(NpcGen.f_attr, value ? FieldStatus.Update : FieldStatus.Delete)
        this._attr = value
    }

    static _class_info = new ClassInfo(super.name, this)

    static f_name = new FieldInfo(this._class_info, 'name', 0, 'string', '')

    static f_x = new FieldInfo(this._class_info, 'x', 1, 'number', 0)

    static f_y = new FieldInfo(this._class_info, 'y', 2, 'number', 0)

    static f_attr = new FieldInfo(this._class_info, 'attr', 3, NpcGen._class_info, undefined)

    static {
        this._class_info.addField(NpcGen.f_name)

        this._class_info.addField(NpcGen.f_x)

        this._class_info.addField(NpcGen.f_y)

        this._class_info.addField(NpcGen.f_attr)
    }
}
export { NpcGen as Npc }
