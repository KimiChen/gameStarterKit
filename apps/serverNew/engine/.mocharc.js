module.exports = {
    require: ['ts-node/register'],
    spec: ['./test/unittest/**/*.test.ts'], // 不扫描整个test目录,单开一个目的是因为里面很多旧的测试用例会报错,不全改没法执行
    exit: true,
    timeout: 999999,
    colors: true,
    bail: true,
    // fgrep: 'without config'
}
