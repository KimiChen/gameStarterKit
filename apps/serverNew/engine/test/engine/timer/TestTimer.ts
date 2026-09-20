import { tickAfter } from '../../../src/timer/timer'

interface msg {
    uId: number
    count: number
}

function testTickAfer() {
    const d = tickAfter(
        2000,
        (m) => {
            if (!m) {
                return 0
            }
            console.log(m.a, m.b)
            return m.a + m.b
        },
        { a: 1, b: 3 },
    )
    console.log('start:', Date.now())
    d.promise
        .then((result) => {
            console.log('result', result, 't:', Date.now())
        })
        .catch((err) => {
            console.log(err)
        })
    d.cancel()

    //
    const p = { uId: 10, count: 1000 }

    const fn = (m?: msg) => {
        console.log('d2:', m, 't:', Date.now())
        return 100
    }
    const d2 = tickAfter(5000, fn, p)
    tickAfter(3000, () => {
        console.log('d3, no params! t:', Date.now())
    })
}

// 测试一些异常的场景
function testTickAferInvalid() {
    console.log('start:', Date.now())
    tickAfter(-100, () => {
        console.log('我是负的,', 'd:', Date.now())
    })

    const d = tickAfter(1000, () => {
        throw new Error('我报错')
    })
    d.promise.catch((err) => {
        console.log('catch:', err.message)
    })
}

testTickAferInvalid()
