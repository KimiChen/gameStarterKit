const fs = require('fs')
const path = require('path')

function deleteJSFiles(folderPath) {
    fs.readdirSync(folderPath).forEach((file) => {
        const filePath = path.join(folderPath, file)
        const stats = fs.statSync(filePath)

        if (stats.isDirectory()) {
            // 递归处理子文件夹
            deleteJSFiles(filePath)
        } else {
            if (file.endsWith('.ts')) {
                const baseName = path.basename(file, '.ts')
                const jsFile = `${baseName}.js`
                const jsMapFile = `${baseName}.js.map`

                const jsFilePath = path.join(folderPath, jsFile)
                const jsMapFilePath = path.join(folderPath, jsMapFile)

                if (fs.existsSync(jsFilePath)) {
                    fs.unlinkSync(jsFilePath)
                    console.log(`Deleted: ${jsFilePath}`)
                }

                if (fs.existsSync(jsMapFilePath)) {
                    fs.unlinkSync(jsMapFilePath)
                    console.log(`Deleted: ${jsMapFilePath}`)
                }
            }
        }
    })
}

// 指定要遍历的文件夹路径
const folderPath = '../src'

deleteJSFiles(folderPath)
// console.log(__dirname)
