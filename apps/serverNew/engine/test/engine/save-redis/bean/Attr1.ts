import { Bean } from '../../../../src/differ/bean'

class Attr1 extends Bean {
    name = ''

    lv = 1
}

/**  以下代码是自动生成, 非必要请勿修改 */

import { ClassInfo, FieldInfo } from '../../../../src/differ/diff'
import { FieldStatus } from '../../../../src/differ/status'

class Attr1Gen extends Attr1 {
    protected _name: string = ''

    protected _lv: number = 1

    constructor(data?: Partial<Attr1>) {
        super()

        if (data?.name) {
            this._name = data.name
        }
        delete (this as any).name

        if (data?.lv) {
            this._lv = data.lv
        }
        delete (this as any).lv
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
        this.onChange(Attr1Gen.f_name, FieldStatus.Update)
        this._name = value
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
        this.onChange(Attr1Gen.f_lv, FieldStatus.Update)
        this._lv = value
    }

    static _class_info = new ClassInfo(super.name, this)

    static f_name = new FieldInfo(this._class_info, 'name', 2, 'string', '')

    static f_lv = new FieldInfo(this._class_info, 'lv', 3, 'number', 1)

    static {
        this._class_info.addField(Attr1Gen.f_name)

        this._class_info.addField(Attr1Gen.f_lv)
    }
}
export { Attr1Gen as Attr1 }
