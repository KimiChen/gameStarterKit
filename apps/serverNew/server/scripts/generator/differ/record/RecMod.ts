import { RecordGen, RecordField } from '../../util/RecordGen'

export class RecMod extends RecordGen {
    @RecordField()
    id!: int

    @RecordField()
    name!: string

    @RecordField()
    type!: string

    @RecordField()
    subModType?: string

    @RecordField()
    importPath!: string

    @RecordField()
    subImportPath?: string

    @RecordField()
    isMap?: boolean

    @RecordField()
    mapKeyType?: string

    @RecordField()
    deleted?: boolean

    getProtocolType() {
        if (!this.subModType) {
            return this.type
        }
        if (this.isMap) {
            return `Map<${this.mapKeyType}, ${this.subModType}>`
        } else {
            return this.subModType
        }
    }
}
