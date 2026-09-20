function getProps(cls: Function) {
    let props = RecordGen._recordProps[cls.name]
    if (!props) {
        props = RecordGen._recordProps[cls.name] = {}
    }
    return props
}

export function RecordField<T extends typeof RecordGen>(
    recordType?: T,
    type = RecordFieldType.normal,
): PropertyDecorator {
    return function (_target: object, _propertyKey: string | symbol): void {
        const cls = (_target as typeof RecordGen).constructor
        const props = getProps(cls)
        props[_propertyKey.toString()] = {
            cls: recordType,
            type: type,
        }
        const parentCls = Object.getPrototypeOf(_target.constructor.prototype).constructor
        const parentProps = RecordGen._recordProps[parentCls.name]
        if (parentProps) {
            for (const [name, prop] of Object.entries(parentProps)) {
                if (props[name]) continue
                props[name] = prop
            }
        }
    }
}

export enum RecordFieldType {
    normal,
    array,
    map,
    objects,
}

export class RecordGen {
    [key: string]: any

    static _recordProps: { [key: string]: { [key: string]: { cls?: typeof RecordGen; type: RecordFieldType } } } = {}

    toJson(): string {
        return JSON.stringify(this.toObj(), null, 2)
    }

    protected toObj() {
        const rs: { [key: string]: any } = {}
        const props = RecordGen._recordProps[this.constructor.name]
        for (const [key, prop] of Object.entries(props)) {
            const val = this[key]
            if (val === undefined) continue
            if (prop?.cls) {
                switch (prop.type) {
                    case RecordFieldType.objects: {
                        const child: { [key: string]: any } = (rs[key] = {})
                        for (const [key1, val1] of Object.entries(val as { [key: string]: any })) {
                            child[key1] = (val1 as RecordGen).toObj()
                        }
                        break
                    }
                    case RecordFieldType.map: {
                        const child: { [key: string]: any } = (rs[key] = {})
                        for (const [key1, val1] of (this[key] as Map<string, any>).entries()) {
                            child[key1] = (val1 as RecordGen).toObj()
                        }
                        break
                    }
                    case RecordFieldType.array: {
                        const child: { [key: string]: any }[] = (rs[key] = [])
                        for (const val1 of val as { [key: string]: any }[]) {
                            child.push((val1 as RecordGen).toObj())
                        }
                        break
                    }
                    default:
                        if (val instanceof RecordGen) {
                            rs[key] = (val as RecordGen).toObj()
                        }
                }
            } else {
                rs[key] = val
            }
        }
        return rs
    }

    static parse<T extends typeof RecordGen>(this: T, json: string) {
        const j = JSON.parse(json)
        const rs = new this()
        rs.toRecord(j)
        return rs
    }

    protected toRecord(obj: any) {
        const props = (this.constructor as any)._recordProps[this.constructor.name]
        for (const [key, val] of Object.entries(obj)) {
            const prop = props[key]
            if (prop?.cls) {
                switch (prop.type) {
                    case RecordFieldType.objects: {
                        const child: { [key: string]: any } = (this[key] = {})
                        for (const [key1, val1] of Object.entries(val as { [key: string]: any })) {
                            ;(child[key1] = new prop.cls()).toRecord(val1)
                        }
                        break
                    }
                    case RecordFieldType.map: {
                        const child: Map<string, any> = (this[key] = new Map<string, any>())
                        for (const [key1, val1] of Object.entries(val as { [key: string]: any })) {
                            const child1 = new prop.cls()
                            child.set(key1, child1)
                            child1.toRecord(val1)
                        }
                        break
                    }
                    case RecordFieldType.array: {
                        const child: { [key: string]: any }[] = (this[key] = [])
                        for (const val1 of val as { [key: string]: any }[]) {
                            const child1 = new prop.cls()
                            child.push(child1)
                            child1.toRecord(val1)
                        }
                        break
                    }
                    default:
                        ;(this[key] = new prop.cls()).toRecord(val)
                }
            } else {
                this[key] = val
            }
        }
    }
}

// class R2 extends Record {
//     @RecordField()
//     id2: int = 2
//
//     id1?: int = 33
// }
//
// class R1 extends Record {
//     @RecordField()
//     id: int = 2
//
//     @RecordField(R2)
//     r2?: R2
//
//     @RecordField(R2, RecordFieldType.map)
//     r2s?: { [key: string]: R2 }
// }
//
// const r1 = R1.parse('{"id":11,"r2":{"id2":22},"r2s":{"aa":{"id2":22}}}')
// // const r1 = R1.parse(JSON.stringify({ id: 11, r2: { id2: 22 }, r2s: { aa: { id2: 22 } } }))
//
// console.log(r1)
// console.log(r1.toJson())
