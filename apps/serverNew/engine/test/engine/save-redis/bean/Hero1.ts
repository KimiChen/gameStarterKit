import { Bean } from '../../../../src/differ/bean'

import { Attr1 } from './Attr1'

class Hero1 extends Bean {
    hId = 0

    lv = 0

    attr?: Attr1

    attrs?: DiffMap<number, Attr1>

    arr?: DiffArray<number>
}

/**  以下代码是自动生成, 非必要请勿修改 */

import { ClassInfo, FieldInfo } from '../../../../src/differ/diff'
import { BeanStatus, FieldStatus } from '../../../../src/differ/status'
import { DiffMap } from '../../../../src/differ/map'
import { DiffArray } from '../../../../src/differ/array'

class Hero1Gen extends Hero1 {
    protected _hId: number = 0

    protected _lv: number = 0

    protected _attr?: Attr1 = undefined

    protected _attrs?: DiffMap<number, Attr1> = undefined

    protected _arr?: DiffArray<number> = undefined

    constructor(data?: Partial<Hero1>) {
        super()

        if (data?.hId) {
            this._hId = data.hId
        }
        delete (this as any).hId

        if (data?.lv) {
            this._lv = data.lv
        }
        delete (this as any).lv

        if (data?.attr) {
            this._attr = data.attr
        }
        delete (this as any).attr

        if (data?.attrs) {
            this._attrs = data.attrs
        }
        delete (this as any).attrs

        if (data?.arr) {
            this._arr = data.arr
        }
        delete (this as any).arr
    }

    //@ts-ignore
    get hId(): number {
        return this._hId
    }

    //@ts-ignore
    set hId(value: number) {
        if (this._hId === value) {
            return
        }
        this.onChange(Hero1Gen.f_hId, FieldStatus.Update)
        this._hId = value
    }

    //@ts-ignore
    get lv(): number {
        return this._lv
    }

    //@ts-ignore
    set lv(value: number) {
        if (this._lv === value) {
            return
        }
        this.onChange(Hero1Gen.f_lv, FieldStatus.Update)
        this._lv = value
    }

    //@ts-ignore
    get attr(): Attr1 | undefined {
        if (!this._attr) {
            return undefined
        }
        if (!(this._attr instanceof Attr1)) {
            const val = this._attr
            this._attr = new Attr1()
            this._attr.parseFromData(val)
            this._attr.initDiff(this, Hero1Gen.f_attr, val)
        } else {
            this._attr.initDiff(this, Hero1Gen.f_attr)
        }
        return this._attr
    }

    //@ts-ignore
    set attr(value: Attr1) {
        if (this._attr === value) {
            return
        }
        this.onChange(Hero1Gen.f_attr, value ? FieldStatus.Update : FieldStatus.Delete)
        this._attr = value
    }

    //@ts-ignore
    get arr(): DiffArray<number> {
        if (this._arr === undefined) {
            this._arr = new DiffArray(Hero1Gen.f_arr)
            this._arr.initDiff(this, Hero1Gen.f_arr, BeanStatus.AutoInit)
        } else if (!(this._arr instanceof DiffArray)) {
            const val = this._arr as number[]
            this._arr = new DiffArray<number>(Hero1Gen.f_arr, ...val)
            this._arr.initDiff(this, Hero1Gen.f_arr, BeanStatus.AutoInit)
        }
        return this._arr
    }

    //@ts-ignore
    get attrs(): DiffMap<number, Attr1> {
        if (this._attrs === undefined) {
            this._attrs = new DiffMap<number, Attr1>(Hero1Gen.f_attrs)
            if (this.writable) {
                this._attrs.initDiff(this, Hero1Gen.f_attrs)
            }
        } else if (!(this._attrs instanceof DiffMap)) {
            const val = this._attrs
            this._attrs = new DiffMap<number, Attr1>(Hero1Gen.f_attrs)
            this._attrs.parseFromData(val)
            this._attrs.initDiff(this, Hero1Gen.f_attrs)
        } else if (this.diff) {
            this._attrs.initDiff(this, Hero1Gen.f_attrs)
        }
        return this._attrs
    }

    static _class_info = new ClassInfo(super.name, this)

    static f_hId = new FieldInfo(this._class_info, 'hId', 2, 'number', 0)

    static f_lv = new FieldInfo(this._class_info, 'lv', 3, 'number', 0)

    static f_attr = new FieldInfo(this._class_info, 'attr', 4, Attr1._class_info, undefined)

    static f_attrs = new FieldInfo(this._class_info, 'attrs', 5, DiffMap._class_info, undefined, [
        'number',
        Attr1._class_info,
    ])

    static f_arr = new FieldInfo(this._class_info, 'arr', 6, DiffArray._class_info, undefined, ['number', undefined])

    static {
        this._class_info.addField(Hero1Gen.f_hId)

        this._class_info.addField(Hero1Gen.f_lv)

        this._class_info.addField(Hero1Gen.f_attr)

        this._class_info.addField(Hero1Gen.f_attrs)

        this._class_info.addField(Hero1Gen.f_arr)
    }
}
export { Hero1Gen as Hero1 }
