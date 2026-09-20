import fs from 'fs'
import path from 'path'

export class UtilDir {
    /**
     * 
     * @param dirPath 
     * @param isDeep 是否读子目录
     * @param fileExtensions 正则形式的文件过滤 value为: .txt .json .ts
     * @param returnAbsolute  是返回绝对地址，还是相对地址
     * @returns 
     */
    // eslint-disable-next-line max-len
    public static getFilesInDirectory(dirPath: string, isDeep: boolean = true, fileExtensions: string[] = [], returnAbsolute: boolean = true): string[] {
        let results: string[] = []
        const list = fs.readdirSync(dirPath)
        let isMatch: boolean = false
        list.forEach((file) => {
            const filePath = path.join(dirPath, file)
            const stat = fs.statSync(filePath)

            if (stat && stat.isDirectory()) {
                if (isDeep) {
                    // 递归进入子目录
                    results = results.concat(this.getFilesInDirectory(filePath, isDeep, fileExtensions))
                }
            } else {
                isMatch = true
                if (fileExtensions.length > 0) {
                    if (!(fileExtensions.includes(path.extname(filePath)))) {
                        isMatch = false
                    }
                }
                if (isMatch) {
                    // 是文件，添加到结果数组
                    if (returnAbsolute) {
                        results.push(filePath)
                    } else {
                        results.push(file)
                    }
                }
            }
        })
        return results
    }
}
