import { RecordGen, RecordField } from '../../util/RecordGen'
import { RecMsg } from './RecMsg'

export class RecApi extends RecordGen {
    @RecordField()
    serviceType!: string

    @RecordField(RecMsg)
    req: RecMsg = new RecMsg()

    @RecordField(RecMsg)
    res?: RecMsg

    /** 临时变量用于解决先解析Res接口的情况 */
    haveRes = false
}
