class FieldInfo {
    // 添加索引签名
    [key: string]: any

    classInfo!: ClassInfo

    parentField?: FieldInfo

    constructor(
        public name: string,
        public refClass?: ClassInfo | undefined,
    ) {
        if (refClass) {
            for (const fi of refClass.fis) {
                const f = new FieldInfo(fi.name)
                f.classInfo = fi.classInfo
                f.parentField = this
                this['field_' + fi.name] = f
            }
        }
    }
}

class ClassInfo {
    constructor(public fis: FieldInfo[]) {
        for (const fi of fis) {
            fi.classInfo = this
        }
    }
}
class Bean2 {
    var2: number = 99

    static field_var2 = new FieldInfo('var2')

    static field_var3 = new FieldInfo('var3')

    static ci: ClassInfo = new ClassInfo([Bean2.field_var2])
}

class Bean1 {
    bean2?: Bean2

    static field_bean2: FieldInfo & { [K in keyof typeof Bean2]: FieldInfo } = new FieldInfo('bean2', Bean2.ci) as any

    static ci: ClassInfo = new ClassInfo([Bean1.field_bean2])
}

console.log(Bean1.field_bean2.field_var2, Bean1.field_bean2.field_var3)
