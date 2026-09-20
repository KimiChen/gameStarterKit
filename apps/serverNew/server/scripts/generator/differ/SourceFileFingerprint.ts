import fs, { readFileSync } from 'fs'
import path from 'path'
import { createHash } from 'crypto'

export class SourceFileFingerprint {
    path: string

    stats: fs.Stats

    private _md5?: string

    constructor(
        public fileDir: string,
        public fileName: string,
    ) {
        this.path = path.join(fileDir, fileName)
        this.stats = fs.statSync(this.path)
    }

    md5(reget = false) {
        if (!reget && this._md5) return this._md5
        const fileContent = readFileSync(this.path)
        const hash = createHash('md5')
        hash.update(fileContent)
        return (this._md5 = hash.digest('hex'))
    }

    mtime() {
        return this.stats.mtime.getTime()
    }

    fileNameOnly() {
        return path.parse(this.fileName).name
    }
}
