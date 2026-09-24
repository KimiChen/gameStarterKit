require('ts-node/register')

const Mocha = require('mocha')
const path = require('path')

const testFiles = [
    path.join(__dirname, 'unittest/engine-contract.test.ts'),
    path.join(__dirname, 'unittest/room-tree.test.ts'),
]
const mocha = new Mocha({ colors: true, timeout: 10000 })

for (const testFile of testFiles) {
    mocha.suite.emit('pre-require', global, testFile, mocha)
    mocha.suite.emit('require', require(testFile), testFile, mocha)
    mocha.suite.emit('post-require', global, testFile, mocha)
}

mocha.run((failures) => {
    process.exitCode = failures > 0 ? 1 : 0
})
