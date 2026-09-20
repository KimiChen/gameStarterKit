import { SourceFile } from 'ts-morph'
import { RecordGen, RecordField, RecordFieldType } from '../../util/RecordGen'
import { SourceFileFingerprint } from '../SourceFileFingerprint'
import { RecProject } from './RecProject'

export class RecFile extends RecordGen {
    @RecordField()
    md5!: string

    @RecordField()
    mtime!: int

    @RecordField()
    sourcePath?: string

    //bean的相对路径
    @RecordField()
    relativePath!: string

    @RecordField()
    version: int = 1

    @RecordField()
    name!: string

    @RecordField()
    deleted?: boolean

    sourceFile!: SourceFile

    fileInfo!: SourceFileFingerprint

    project!: RecProject

    initFile(project: RecProject, fileInfo: SourceFileFingerprint, relativeDir: string) {
        this.project = project
        this.fileInfo = fileInfo
        this.sourceFile = project.project.addSourceFileAtPath(fileInfo.path)
        this.relativePath = relativeDir + '/' + fileInfo.fileName.substring(0, fileInfo.fileName.length - 3)
        this.name = this.fileInfo.fileNameOnly()
    }

    forEach<T>(ts: IterableIterator<T>, f: (e: T) => string, sep: string = '\n'): string {
        let rs = ''
        for (const t of ts) {
            rs += f(t) + sep
        }
        return rs
    }
}
