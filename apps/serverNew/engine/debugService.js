//相对于engine的service项目的路径，也可以是绝对路径
const servicePath = '../alloy-demo/alloy-server'
//相对于service的项目的engine路径，也可以是绝对路径
const enginePath = '../../alloy-engine'

var fs = require('fs')
var path = require('path')
var child_process = require('child_process')
const json5 = require("json5");
const packagePath = path.join(servicePath, 'package.json')
const tsconfigPath = path.join(servicePath, 'tsconfig.json')
const tsconfigTestPath = path.join(servicePath, 'test/engine/tsconfig.json')
let package = JSON.parse(fs.readFileSync(packagePath))
let tsconfig = json5.parse(fs.readFileSync(tsconfigPath))
let tsconfigTest = json5.parse(fs.readFileSync(tsconfigTestPath))
let codeMode = '第三方包 模式'
if(package.dependencies['@arthropoda/game-engine']) {
    codeMode = '源码 模式'
    console.log('开始替换service为engine '+codeMode)
    delete package.dependencies['@arthropoda/game-engine']
    package.dependencies["tsconfig-paths"] = "^4.2.0"
    tsconfig.compilerOptions.rootDir = "../"
    tsconfig.include.push(
        enginePath + "/src/**/*.ts",
        enginePath + "/src/**/*.d.ts",
        enginePath + "/src/**/*.tsx"
    )
    tsconfig.compilerOptions.paths =  {
        "@arthropoda/game-engine": ["../" + enginePath + "/src/index.ts"]//" + enginePath + "/src/*
    }
    tsconfig['ts-node'].require = ["tsconfig-paths/register"]
    tsconfigTest['ts-node'].require = ["tsconfig-paths/register"]
    fs.writeFileSync(packagePath, JSON.stringify(package, null, 3))
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 3))
    fs.writeFileSync(tsconfigTestPath, JSON.stringify(tsconfigTest, null, 3))
} else {
    console.log('开始替换service为engine '+codeMode)
    child_process.execSync('cd ' + servicePath+ ' && git checkout HEAD -- package.json tsconfig.json test/engine/tsconfig.json', {
        stdio: 'inherit',
    })
}
console.log('替换完成 '+codeMode)
