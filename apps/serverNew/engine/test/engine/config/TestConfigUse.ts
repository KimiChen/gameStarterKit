import { Config, setConfigProxy } from '../../../src/config/config'
import * as common from '../../../src/common'
import { ContextLogic } from '../../../src/context/ContextLogic'
import fs from 'fs'
import json5 from 'json5'

common.init()
Config.loadAllConf()
setConfigProxy()

function test1() {
    console.log(C.hero().get(1001))
    console.log(C.hero(1001))

    //console.log(C.item())
    console.log(C.item_draw(1001)[0].more[0].gem.get(1))


    console.log('ChatDay:', Param.ChatDay)
    console.log('PracticeNpcAddTimesPerDay:', Param.PracticeNpcAddTimesPerDay)
    console.log('GuildCreateCost:0:', Param.GuildCreateCost[0])
    console.log('GuildCreateCost:1:', Param.GuildCreateCost[1])
}

function testPlatformConfig() {
    console.log('platformConfig:', CP.platform)
    console.log('platformConfig->centerRedis:', CP.platform.centerRedis)
    console.log('serviceConfig:', CP.service)
}

function test2() {
    console.log('length', C.hero(), C.hero().size, Object.keys(C.hero()))

    console.log(C.item().size)
}

function test3() {
    console.log(C.emoji_pack().get(1022)?.emojis[0].emojiId)
    console.log(C.emoji_pack(1002).emojis[0].emojiId)
}

// 测试对象的key是否有序
function testKeySort() {
    const filePath = ROOT_PATH + '/config_game/t.json5'
    const jsonContent = fs.readFileSync(filePath, 'utf-8')
    const jsonData = json5.parse(jsonContent)
    const keys = Object.keys(jsonData)
    let tmpArr: string[] = []
    for (let i = 0; i < keys.length; i++) {
        tmpArr.push(keys[i])
        if (tmpArr.length >= 50) {
            console.log(tmpArr)
            tmpArr = []
        }
    }
    console.log(tmpArr)
}
function testKeySort2() {
    const filePath = ROOT_PATH + '/config_game/t1.json5'
    const jsonContent = fs.readFileSync(filePath, 'utf-8')
    const jsonData = json5.parse(jsonContent)
    const keys = Object.keys(jsonData)
    let tmpArr: string[] = []
    for (let i = 0; i < keys.length; i++) {
        tmpArr.push(keys[i])
        if (tmpArr.length >= 50) {
            console.log(tmpArr)
            tmpArr = []
        }
    }
    console.log(tmpArr)
}
function testMap() {
    const myMap = new Map<string, IConfHero>()

    console.log(myMap.entries().next().value)
}

function testReadOnlyMap() {
    const originalMap = new Map<string, number>()
    originalMap.set('one', 1)
    originalMap.set('two', 2)

    const readonlyMap: ReadonlyMap<string, number> = originalMap

    console.log(readonlyMap.get('one')) // 输出：1
}
function testConfigMap() {
    const drawMap = C.equip_draw()

    console.log(drawMap.get(1)?.specialCost.get(10002))
    console.log(drawMap.get(1)?.lvRange.get(100050)?.cost)
    console.log(drawMap.get(1)?.lvRange.get(100050)?.qualityPool[1].subPoolId)
    console.log(drawMap.get(1)?.lvRange.get(100050)?.qualityPool[1].equip[2])

    const itemDrawMap = C.item_draw()

    const itemDraw1 = itemDrawMap.get(1001)
    if (itemDraw1) {
        console.log(itemDraw1[0].name)
        console.log(itemDraw1[0].more[0].name)
        console.log(itemDraw1[0].more[1].gem.get(3))
    }
    const itemDraw2 = itemDrawMap.get(1002)
    if (itemDraw2) {
        console.log(itemDraw2[1].name)
    }

    const itemCallMap = C.item_call()
    console.log(itemCallMap.get(2001)?.mores.get(11)?.gem.get(1))
}

function testConfigFunc() {
    // 长度
    const drawMap = C.equip_draw()
    console.log(drawMap.size)
    console.log(drawMap.get(1)?.lvRange.size)
    console.log(drawMap.get(1)?.lvRange.get(100050)?.qualityPool.length)

    const drawMap1 = drawMap.get(1)
    if (drawMap1) {
        console.log(drawMap1.lvRange.first())
        console.log(drawMap1.lvRange.end())
    }
    console.log(drawMap1?.lvRange.arrayKeys())
}

// test1()

// testPlatformConfig()

// test2()

//test3()

//testConfigFunc()

testConfigFunc()
