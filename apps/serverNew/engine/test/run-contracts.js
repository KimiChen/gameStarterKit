require('ts-node/register')

const Mocha = require('mocha')
const path = require('path')

const testFile = path.join(__dirname, 'unittest/engine-contract.test.ts')
const mocha = new Mocha({ colors: true, timeout: 10000 })

mocha.suite.emit('pre-require', global, testFile, mocha)
mocha.suite.emit('require', require(testFile), testFile, mocha)
mocha.suite.emit('post-require', global, testFile, mocha)

mocha.run((failures) => {
    process.exitCode = failures > 0 ? 1 : 0
})
