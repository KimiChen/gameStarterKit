import * as fs from 'fs'

export class UtilFile {

    /** 读取一块文件,输出行内容,没有回车结束的完整一行的将被忽略, 可通过返回值中的offset重新传入来分片读取 */
    static async readLines(filePath: string, offset: number, readBytes: number): Promise<{
        nextOffset: number, lines: string[], linesInfo: { startOffset: number, endOffset: number }[]
    }> {
        const f = fs.openSync(filePath, 'r')
        try {
            const liens: string[] = []
            const linesINfo: { startOffset: number, endOffset: number }[] = []

            let nextOffset = offset
            let lineStartOffset = offset
            const buf = Buffer.alloc(readBytes)
            fs.readSync(f, buf, 0, readBytes, offset)
            let line: number[] = []
            const LF = ['\r'.charCodeAt(0), '\n'.charCodeAt(0)]
            for (const b of buf) {
                if (LF.includes(b)) {
                    nextOffset += 1
                    nextOffset += line.length
                    if (line.length > 0) {
                        liens.push(Buffer.from(line).toString('utf-8'))
                        linesINfo.push({ startOffset: lineStartOffset, endOffset: nextOffset })
                        lineStartOffset = nextOffset
                    }
                    line = []
                    continue
                } else {
                    line.push(b)
                }
            }
            return { nextOffset: nextOffset, lines: liens, linesInfo: linesINfo}
        } finally {
            fs.closeSync(f)
        }
    }
}