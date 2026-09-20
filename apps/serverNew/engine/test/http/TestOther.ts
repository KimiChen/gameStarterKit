class gm {
    exchange: number = 0

    cdkey: string = ''

    doSome() {
        for (const property in this) {
            console.log(property, (this as any)[property])
        }
    }
}

function gm1() {
    new gm().doSome()

}

function gm2() {
    const itemClass = new gm()
    for (const property in itemClass) {
        console.log(property)
    }
}

function sortObjectByKeys(obj: any): any {
    return Object.keys(obj).sort().reduce((result: any, key: any) => {
        result[key] = obj[key]
        return result
    }, {})
}

function testSort() {
    const data = {
        platform_id: 1,
        g2ame_id: 1,
        g1ame_id: 1,
        g11ame_id: 1,
    }

    const a = Object.keys(data).sort()
    console.log(a)
}

//gm2()

abstract class GmConfigBase {
    constructor(data: any) {
        console.log(Object.keys(this))
    }

    public static build<T extends typeof GmConfigBase>(this: T, data: any): InstanceType<T> | undefined {
        return new (this as any)(data) as InstanceType<T>
    }
}

class GmVersion extends GmConfigBase {
    constructor(data: any) {
        super(data)

    }

    id: string = ''
}

const v = GmVersion.build({})