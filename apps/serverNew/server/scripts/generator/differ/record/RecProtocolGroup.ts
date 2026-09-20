import { RecordGen, RecordField, RecordFieldType } from '../../util/RecordGen'
import { RecProtocolFile } from './RecProtocolFile'
import { IMsgType } from './IMsgType'
import { RecordSet } from '../../util/RecordSet'

export class RecProtocolGroup extends RecordGen {
    @RecordField()
    version = 1

    @RecordField()
    md5!: string

    @RecordField(RecProtocolFile, RecordFieldType.map)
    protocols: Map<string, RecProtocolFile> = new Map()

    name!: string

    changed = false

    oldFiles!: Set<string>

    @RecordField(RecordSet, RecordFieldType.map)
    refs: Map<string, RecordSet<string>> = new Map()

    /** 临时数据，避免多次循环获取 */
    tmpTypes: Map<string, IMsgType> = new Map()
}
