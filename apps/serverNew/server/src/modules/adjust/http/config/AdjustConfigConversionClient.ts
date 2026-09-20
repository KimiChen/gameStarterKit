import fs from 'fs'
import axios from 'axios'
import { Service } from 'typedi'

@Service()
export class AdjustConfigConversionClient {
    excelTransUrl = 'http://pi/upload'

    /**
     * 获取文件解析后的内容
     * @param excelPath
     * @param fileName
     * @param toType
     */
    async convertFile(excelPath: string, fileName: string, toType: string) {
        const formData = new FormData()
        formData.append('xlsx', await fs.openAsBlob(excelPath))

        // 发送请求
        const ret = await axios.post(this.excelTransUrl, formData, {
            params: {
                fileType: toType,
                name: fileName,
                branch: 'master',
                project: 'game-config',
            },
        })

        return ret.data
    }
}
