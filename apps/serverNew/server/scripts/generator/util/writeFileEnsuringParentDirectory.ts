import path from 'path'
import fs from 'fs'

export function writeFileEnsuringParentDirectory(filePath: string, fileContent: string) {
    const dirname = path.dirname(filePath)

    // 如果目录不存在则创建目录
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(filePath, fileContent)
}
