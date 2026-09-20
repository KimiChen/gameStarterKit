import ExcelJS from '@zurmokeeper/exceljs'
import { ErrorCode } from '../../generated/errors/ErrorCode'
import { GameError } from '@arthropoda/game-engine'

const workbook = new ExcelJS.Workbook()
const worksheet = workbook.addWorksheet('Sheet1')

worksheet.columns = [
    { header: 'id', key: 'id', width: 10 },
    { header: 'zh_cn@msg', key: 'name', width: 50 },
    { header: 'key', key: 'key', width: 30 },
]
worksheet.addRow(['错误码', '错误描述', '服务端错误key'])
worksheet.addRow(['id', 'string', 'string'])

const codes = new Map<number, string>()
for (const key of Object.keys(ErrorCode)) {
    const error = ErrorCode[key as keyof typeof ErrorCode] as GameError
    const item = error.getItem()
    const duplicate = codes.get(item.code)
    if (duplicate) throw new Error(`错误码数字重复: ${item.code} (${duplicate}, ${key})`)
    codes.set(item.code, key)
    worksheet.addRow([item.code, item.message, key])
}

workbook.xlsx.writeFile('server_error_code.xlsx').then(() => {
    console.log(`ErrorCode导出成功: ${codes.size} 个错误码`)
})
