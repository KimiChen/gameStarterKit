import { mapKeys, mapValues } from '../../../src/utils/common'

function testMap() {
    // 创建一个新的 Map
    const myMap = new Map()

    // 设置键值对
    myMap.set('key1', 'value1')
    myMap.set('key2', 'value2')

    // 获取值
    console.log(myMap.get('key1')) // 输出: 'value1'
    console.log(myMap.get('key2')) // 输出: 'value2'

    // 检查键是否存在
    console.log(myMap.has('key1')) // 输出: true
    console.log(myMap.has('key3')) // 输出: false

    // 获取 Map 的大小
    console.log(myMap.size) // 输出: 2

    // 删除键值对
    myMap.delete('key1')
    console.log(myMap.has('key1')) // 输出: false

    // 遍历 Map
    myMap.forEach((value, key) => {
        console.log(`${key}: ${value}`)
    })

    // 清空 Map
    myMap.clear()
    console.log(myMap.size) // 输出: 0
}
function testMap2() {
    const myMap = new Map<string, IConfHero>()
}

function testMap3() {
    const myMap = new Map()

    // 设置键值对
    myMap.set('key1', 'value1')
    myMap.set('key2', 'value2')

    // const keys = myMap.keys()

    // for (const key of keys) {
    //     myMap.delete('key1')
    //     console.log('key', key)
    // }
    // console.log(keys)

    for (const key in myMap) {
        console.log('for key:', key)
    }

    myMap.forEach((value, key) => {
        myMap.delete('key2')
        console.log('key', key)
    })
    console.log(myMap)

    console.log(myMap.get('t123'))
}

function testObjectArray() {
    const arr = [1, 2, 3]
    const obj = { a: 1, b: 2, c: 3 }
    for (const k in arr) {
        console.log('arr k', k)
    }
    for (const k in obj) {
        console.log('obj k', k)
    }
}
interface mapV {
    a: string
    b: string
}
function testMapValues() {
    const myMap = new Map<string, mapV>()
    myMap.set('k1', { a: 'a1', b: 'b1' })
    myMap.set('k2', { a: 'a2', b: 'b2' })

    const values: mapV[] = mapValues(myMap)
    console.log('values before:', values)

    for (const val of values) {
        val.a = val.a + 'haha'
    }
    console.log('values after:', values)
    console.log('myMap:', myMap)

    console.log(mapKeys(myMap))

    const myMap2 = new Map<string, mapV[]>()

    myMap2.set('k1', [
        { a: 'a11', b: 'b11' },
        { a: 'a12', b: 'b12' },
    ])
    myMap2.set('k2', [
        { a: 'a21', b: 'b21' },
        { a: 'a22', b: 'b22' },
    ])

    console.log(mapValues(myMap2))
    console.log(mapValues(myMap2)[0][0])
}

testMapValues()
