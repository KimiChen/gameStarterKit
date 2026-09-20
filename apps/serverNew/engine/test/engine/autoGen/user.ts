import { DiffBean } from '../../../src/differ/diff_bean'

class User extends DiffBean {
    /**
     *  abcde
     *  egdfhgd
     */
    type = 0

    /**
     *  abcde
     *  dsts
     */
    hp = 0

    /**
     *  abcde
     *  dg
     */
    attack = 0

    /**
     *  abcde
     *  tttt
     */
    subAttr?: User
}

/**  以下代码是自动生成, 非必要请勿修改 */

import { DiffClass, DiffField, FieldStatus } from '../../../src/differ/diff'

class UserGen extends User {
    protected _type: number = 0

    protected _hp: number = 0

    protected _attack: number = 0

    protected _subAttr?: User = undefined

    /**
     *  abcde
     *  egdfhgd
     */
    //@ts-ignore
    get type(): number {
        return this._type
    }

    /**
     *  abcde
     *  egdfhgd
     */
    //@ts-ignore
    set type(value: number) {
        if (this._type === value) {
            return
        }
        this.onChange(UserGen.f_type, FieldStatus.FieldStatusUpdate)
        this._type = value
    }

    /**
     *  abcde
     *  dsts
     */
    //@ts-ignore
    get hp(): number {
        return this._hp
    }

    /**
     *  abcde
     *  dsts
     */
    //@ts-ignore
    set hp(value: number) {
        if (this._hp === value) {
            return
        }
        this.onChange(UserGen.f_hp, FieldStatus.FieldStatusUpdate)
        this._hp = value
    }

    /**
     *  abcde
     *  dg
     */
    //@ts-ignore
    get attack(): number {
        return this._attack
    }

    /**
     *  abcde
     *  dg
     */
    //@ts-ignore
    set attack(value: number) {
        if (this._attack === value) {
            return
        }
        this.onChange(UserGen.f_attack, FieldStatus.FieldStatusUpdate)
        this._attack = value
    }

    /**
     *  abcde
     *  tttt
     */
    //@ts-ignore
    get subAttr(): User {
        if (this._subAttr !== undefined) {
            this._subAttr.initDiff(UserGen.f_subAttr, this)
            return this.subAttr
        }
    }

    /**
     *  abcde
     *  tttt
     */
    //@ts-ignore
    set subAttr(value: User) {
        if (this._subAttr === value) {
            return
        }
        this.onChange(UserGen.f_subAttr, value ? FieldStatus.FieldStatusUpdate : FieldStatus.FieldStatusDelete)
        this._subAttr = value
    }

    static _diff_class = new DiffClass(this.name, this)

    static f_type = new DiffField('type', 0, 'number', 0)

    static f_hp = new DiffField('hp', 1, 'number', 0)

    static f_attack = new DiffField('attack', 2, 'number', 0)

    static f_subAttr = new DiffField('subAttr', 3, UserGen._diff_class, undefined)

    static {
        this._diff_class.addField(UserGen.f_type)

        this._diff_class.addField(UserGen.f_hp)

        this._diff_class.addField(UserGen.f_attack)

        this._diff_class.addField(UserGen.f_subAttr)
    }
}
