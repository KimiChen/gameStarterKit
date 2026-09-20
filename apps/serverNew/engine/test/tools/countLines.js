const fs = require('fs');
const path = require('path');

function countLinesInFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    return lines.length;
}

function countLinesInFolder(folderPath) {
    let totalLines = 0;

    const files = fs.readdirSync(folderPath);

    files.forEach(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
            if(!filePath.endsWith('.ts'))return
            totalLines += countLinesInFile(filePath);
        } else if (stats.isDirectory()) {
            totalLines += countLinesInFolder(filePath);
        }
    });

    return totalLines;
}

const folderPath = '../../game-service/src'; // 替换为实际的文件夹路径
const totalLines = countLinesInFolder(folderPath);
console.log(`Total lines in folder: ${totalLines}`);
