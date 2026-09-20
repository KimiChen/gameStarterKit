import { Hash } from '../../../../src/differ/hash'
import { Hero1 } from './Hero1'
import { DiffArray } from '../../../../src/differ/array'

class User1 extends Hash {
    name = ''

    lvl = 0

    uId = 0

    gc = 0

    arr?: DiffArray<number>

    hero?: Hero1

    heros?: DiffMap<number, Hero1>
}

/**  以下代码是自动生成, 非必要请勿修改 */
import { ClassInfo, FieldInfo } from '../../../../src/differ/diff'
import { BeanStatus, FieldStatus } from '../../../../src/differ/status'
import { IdFieldType } from '../../../../src/differ/bean'
import { JSONObject } from '../../../../src/differ/redis'
import { DiffMap } from '../../../../src/differ/map'

class User1Gen extends User1 {
    protected _name: string = ''

    protected _lvl: number = 0

    protected _uId: number = 0

    protected _gc: number = 0

    protected _arr?: DiffArray<number> = undefined

    protected _hero?: Hero1 = undefined

    _heros?: DiffMap<number, Hero1> = undefined

    constructor(id: IdFieldType) {
        super(id)

        delete (this as any).name

        delete (this as any).lvl

        delete (this as any).uId

        delete (this as any).gc

        delete (this as any).arr

        delete (this as any).hero

        delete (this as any).heros
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
        this.onChange(User1Gen.f_name, FieldStatus.Update)
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
        this.onChange(User1Gen.f_lvl, FieldStatus.Update)
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
        this.onChange(User1Gen.f_uId, FieldStatus.Update)
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
        this.onChange(User1Gen.f_gc, FieldStatus.Update)
        this._gc = value
    }

    //@ts-ignore
    get arr(): DiffArray<number> {
        this.tryLoad('arr')
        if (this._arr === undefined) {
            this._arr = new DiffArray(User1Gen.f_arr)
            this._arr.initDiff(this, User1Gen.f_arr, BeanStatus.AutoInit)
        } else if (!(this._arr instanceof DiffArray)) {
            const val = JSON.parse(this._arr as string)
            this._arr = new DiffArray<number>(User1Gen.f_arr, ...val)
            this._arr.initDiff(this, User1Gen.f_arr, BeanStatus.AutoInit)
        }
        return this._arr
    }

    //@ts-ignore
    get heros(): DiffMap<number, Hero1> {
        this.tryLoad('heros')
        if (this._heros === undefined) {
            this._heros = new DiffMap<number, Hero1>(User1Gen.f_heros)
            if (this.writable) {
                this._heros.initDiff(this, User1Gen.f_heros)
            }
        } else if (!(this._heros instanceof DiffMap)) {
            const val = JSON.parse(this._heros as string)
            this._heros = new DiffMap<number, Hero1>(User1Gen.f_heros)
            this._heros.parseFromData(val)
            this._heros.initDiff(this, User1Gen.f_heros)
        } else if (this.diff) {
            this._heros.initDiff(this, User1Gen.f_heros)
        }
        return this._heros
    }

    //@ts-ignore
    get hero(): Hero1 | undefined {
        this.tryLoad('hero')
        if (!this._hero) {
            return undefined
        }
        if (!(this._hero instanceof Hero1)) {
            const val = JSON.parse(this._hero)
            this._hero = new Hero1()
            this._hero.parseFromData(val)
        }
        this._hero.initDiff(this, User1Gen.f_hero)
        return this._hero
    }

    //@ts-ignore
    set hero(value: Hero1 | undefined) {
        if (this._hero === value) {
            return
        }
        this.onChange(User1Gen.f_hero, value ? FieldStatus.Update : FieldStatus.Delete)
        this._hero = value
    }

    static _class_info = new ClassInfo(super.name, this, 1)

    static f_name = new FieldInfo(this._class_info, 'name', 2, 'string', '', undefined)

    static f_lvl = new FieldInfo(this._class_info, 'lvl', 3, 'number', 0, undefined)

    static f_uId = new FieldInfo(this._class_info, 'uId', 4, 'number', 0, undefined)

    static f_gc = new FieldInfo(this._class_info, 'gc', 5, 'number', 0, undefined)

    static f_arr = new FieldInfo(this._class_info, 'arr', 6, DiffArray._class_info, undefined, ['number', undefined])

    static f_hero = new FieldInfo(this._class_info, 'hero', 7, Hero1._class_info, undefined, undefined)

    static f_heros = new FieldInfo(this._class_info, 'heros', 8, DiffMap._class_info, undefined, [
        'number',
        Hero1._class_info,
    ])

    static {
        this._class_info.addField(User1Gen.f_name)

        this._class_info.addField(User1Gen.f_lvl)

        this._class_info.addField(User1Gen.f_uId)

        this._class_info.addField(User1Gen.f_gc)

        this._class_info.addField(User1Gen.f_arr)

        this._class_info.addField(User1Gen.f_hero)

        this._class_info.addField(User1Gen.f_heros)
    }
}
export { User1Gen as User1 }
