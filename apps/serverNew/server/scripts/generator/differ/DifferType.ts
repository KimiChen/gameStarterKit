export enum DifferType {
    Invalid,
    Bean,
    Hash,
    HashJson,
}

export namespace DifferType {
    export function parseFrom(fileName: string, extendsName?: string): DifferType {
        switch (extendsName) {
            case 'Bean':
                return DifferType.Bean
            case 'Hash':
            case 'UserHash':
            case 'ServerHash':
            case 'CenterHash':
                return DifferType.Hash
            case 'HashJson':
            case 'UserHashJson':
            case 'ServerHashJson':
            case 'CenterHashJson':
                return DifferType.HashJson
            case 'RefHash': //不需要生成
                return DifferType.Invalid
            default:
                // console.log(fileName + ' 继承类型：' + extendsName + ', 不生成')
                return DifferType.Invalid
        }
    }
}
