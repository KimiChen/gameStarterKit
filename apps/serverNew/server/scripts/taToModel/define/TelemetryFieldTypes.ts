export class TelemetryFieldTypes {
    /** 数数数据类型映射 */
    static readonly TYPE_MAP: { [key: string]: string } = {
        ['字符']: 'string',
        ['字符串']: 'string',
        ['时间']: 'number',
        ['数值']: 'number',
        ['浮点数']: 'number',
        ['布尔']: 'boolean',
        ['列表']: 'Array<any>',
    }

    static readonly TYPE_MAP_DEFAULT: { [key: string]: string } = {
        ['string']: "''",
        ['number']: '0',
        ['boolean']: 'false',
        ['Array<any>']: '[]',
        ['字符']: "''",
        ['字符串']: "''",
        ['时间']: '0',
        ['数值']: '0',
        ['浮点数']: '0',
        ['布尔']: 'false',
        ['列表']: '[]',
    }

    static readonly SPEC_TYPE_MAP: { [key: string]: string } = {
        ['时间']: 'time',
    }

    static readonly STRING = 'string'

    static readonly BOOL = 'bool'

    static readonly INT = 'int'

    static readonly ARRAY = 'array'

    static readonly FLOAT = 'float'

    static readonly SPEC_TIME = 'time'
}
