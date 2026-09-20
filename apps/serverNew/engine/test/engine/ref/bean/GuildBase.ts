import { ClassInfo, FieldInfo } from '../../../../src/differ/diff'
import { Hash } from '../../../../src/differ/hash'
import { FieldStatus } from '../../../../src/differ/status'
class GuildBase extends Hash {
    name = ''

    lv = 0

    uId = 0

    gc = 0
}

/**  以下代码是自动生成, 非必要请勿修改 */

class GuildBaseGen extends GuildBase {
    protected _name: string = ''

    protected _lvl: number = 0

    protected _uId: number = 0

    protected _gc: number = 0

    constructor(id: number) {
        super(id)

        delete (this as any).name
        delete (this as any).lvl
        delete (this as any).uId
        delete (this as any).gc
    }

    //@ts-ignore
    get name(): string {
        this.tryLoad('name')
        return this._name
    }

    //@ts-ignore
    set name(value: string) {
        if (this._name === value) {
            return
        }
        this.onChange(GuildBaseGen.f_name, FieldStatus.Update)
        this._name = value
    }

    //@ts-ignore
    get lvl(): number {
        this.tryLoad('lvl')
        return this._lvl
    }

    //@ts-ignore
    set lvl(value: number) {
        if (this._lvl === value) {
            return
        }
        this.onChange(GuildBaseGen.f_lvl, FieldStatus.Update)
        this._lvl = value
    }

    //@ts-ignore
    get uId(): number {
        this.tryLoad('uId')
        return this._uId
    }

    //@ts-ignore
    set uId(value: number) {
        if (this._uId === value) {
            return
        }
        this.onChange(GuildBaseGen.f_uId, FieldStatus.Update)
        this._uId = value
    }

    //@ts-ignore
    get gc(): number {
        this.tryLoad('gc')
        return this._gc
    }

    //@ts-ignore
    set gc(value: number) {
        if (this._gc === value) {
            return
        }
        this.onChange(GuildBaseGen.f_gc, FieldStatus.Update)
        this._gc = value
    }

    static _class_info = new ClassInfo(super.name, this)

    static f_name = new FieldInfo('name', 0, 'string', '')

    static f_lvl = new FieldInfo('lvl', 1, 'number', 0)

    static f_uId = new FieldInfo('uId', 2, 'number', 0)

    static f_gc = new FieldInfo('gc', 3, 'number', 0)

    static {
        this._class_info.addField(GuildBaseGen.f_name)
        this._class_info.addField(GuildBaseGen.f_lvl)
        this._class_info.addField(GuildBaseGen.f_uId)
        this._class_info.addField(GuildBaseGen.f_gc)
    }
}
export { GuildBaseGen as GuildBase }
