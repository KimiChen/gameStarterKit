import { RecBean } from '../record/RecBean'

export class TypeScriptHashJsonTemplateRenderer {
    public gen(args: RecBean) {
        const className = args.genClassName
        let initFunc = ''
        if (args.initFunc) {
            initFunc = `
            /** 初始化仅网络同步的数据,之后的变更会自动推送 */
            buildNet(data: Partial<this>) {
                super._buildNet(data)
            }
            `
        }
        const genCode = `
        
        /**  以下代码是自动生成, 非必要请勿修改 */

        class ${args.genClassName} extends ${args.className} {
        
        ${args.forEach(
            args.propsExist,
            (f) =>
                `protected _${f.name}${f.isBaseType() ? '' : '?'} : ${f.beanType()} = ${f.defaultValue}
                `,
        )}
        
        constructor(id: ${args.idFiledType}, rootKey?: string, loadOpts?: HashLoadOpts, byLoad = false) {
            super(id, rootKey, loadOpts, byLoad)
        
        ${args.forEach(
            args.propsExist,
            (f) =>
                `
                    delete (this as any).${f.name}
                `,
        )}
        
            this._id = id
        }
        
        ${initFunc}
         
        ${args.forEach(args.propsExist, (f) => {
            let str = ''
            // 基本类型
            if (f.isBaseType()) {
                str += `
                ${f.commentWrapped} 
                //@ts-ignore 
                get ${f.name}(): ${f.type} {
                    this.tryLoad('${f.name}')
                    return this._${f.name}
                }
                `

                str += `
                ${f.commentWrapped}
                //@ts-ignore 
                set ${f.name}(value: ${f.type}) {
                    ${
                        f.type === 'int' || f.type === 'number'
                            ? `if (isNaN(value)) {
                                throw new Error("${f.name} value=" + value + " is not a number or NaN") 
                           }`
                            : ''
                    }
                    ${f.type === 'int' ? 'value = Math.trunc(value)' : ''}
                    if (this._${f.name} === value) {
                        return
                    }
                    const oldVal = this._${f.name}
                    this._${f.name} = value
                    this.onChange(${className}.f_${f.name}, FieldStatus.Update, oldVal);
                }`
            } else {
                if (f.isCollectionType()) {
                    if (f.type === 'Array') {
                        str += `
                        ${f.commentWrapped}
                        //@ts-ignore 
                         get ${f.name}(): ${f.beanType()} {
                            this.tryLoad('${f.name}')
                            if (this._${f.name} === undefined) {
                                this._${f.name} = new DiffArray(${className}.f_${f.name})
                                this._${f.name}.initDiff(this, ${className}.f_${f.name}, BeanStatus.AutoInit)
                            } else if (typeof this._${f.name} === 'string') {
                                const val = JSON.parse(this._${f.name} as string)
                                this._${f.name} = new ${f.beanType()}(${className}.f_${f.name}, ...val)
                                this._${f.name}.initDiff(this, ${className}.f_${f.name}, BeanStatus.AutoInit)
                            }
                            return this._${f.name}
                        }
                    `
                    } else if (f.type === 'Map') {
                        str += `
                        ${f.commentWrapped}
                        //@ts-ignore 
                        get ${f.name}(): ${f.beanType()} {
                            this.tryLoad('${f.name}')
                            if (this._${f.name} === undefined) {
                                this._${f.name} = new ${f.beanType()}(${className}.f_${f.name})
                                if (this.writable) {
                                    this._${f.name}.initDiff(this, ${className}.f_${f.name})
                                }
                            } else if (typeof this._${f.name} === 'string') {
                                const val = JSON.parse(this._${f.name} as string)
                                this._${f.name} = new ${f.beanType()}(${className}.f_${f.name})
                                this._${f.name}.parseFromData(val)
                                this._${f.name}.initDiff(this, ${className}.f_${f.name})
                            } else if (this.diff) {
                                this._${f.name}.initDiff(this, ${className}.f_${f.name})
                            }
                            return this._${f.name}
                        }
                        `
                    }
                } else {
                    // 对象类型
                    str += `
                    ${f.commentWrapped} 
                    //@ts-ignore 
                    get ${f.name}(): ${f.type} ${f.hasQuestionToken ? '| undefined' : ''}{
                        if (!this._${f.name}) {
                            return ${f.hasQuestionToken ? 'undefined' : `new ${f.type}()`} 
                        }
                        if (typeof this._${f.name} === 'string') {
                            const val = JSON.parse(this._${f.name})
                            this._${f.name} = new ${f.type}()
                            this._${f.name}.parseFromData(val)
                            this._${f.name}.initDiff(this, ${className}.f_${f.name}, val)
                        } else {
                            this._${f.name}.initDiff(this, ${className}.f_${f.name})
                        }
                        return this._${f.name}
                    }
                    
                    `

                    str += `
                    ${f.commentWrapped}
                    //@ts-ignore 
                    set ${f.name}(value: ${f.type}) {
                        if (this._${f.name} === value) {
                            return
                        }
                        this.onChange(${className}.f_${f.name}, value ? 
                        FieldStatus.Update : FieldStatus.Delete)
                        this._${f.name} = value
                    }`
                }
            }
            return str
        })}
        
        static _class_info = new ClassInfo(super.name, this, ${args.modId}, ${args.saveType}, ${args.modType})
        
        
        ${args.forEach(args.propsExist, (f) => {
            return `
            static readonly f_${f.name} = new FieldInfo(this._class_info, '${f.name}', ${f.id}, ${f.getFieldType()},
            ${f.defaultValue}, ${f.beanCollectionTypes()}, ${f.saveType}, ${f.modType}, ${f.listen})
            `
        })}
        
        static {
        ${args.forEach(args.propsExist, (f) => {
            return `
            this._class_info.addField(${className}.f_${f.name})`
        })}
        }
        }
        export { ${args.genClassName} as ${args.className} }
        `
        return genCode
    }
}
