import { Url } from '../../src/utils/Url'

const commitActionUrl = 'http://127.0.0.1:25001/adjust/parseCommitAction'
const uId = 1023516

async function testGetCustom(menu: string = '基础工具') {
    const url = 'http://127.0.0.1:25001/adjust/getCustomFunction?uId=' + uId
    const res = await Url.postJson(url, { uId: uId, routeList: [menu] })

    console.log(JSON.stringify(res.data))
}

async function testPayAction() {
    const reqBody = {
        uId: '1023516',
        actionRequest: [
            {
                routeList: ['充值', 'pay'],
                action: {
                    route: 'function',
                    desc: '充值',
                    childNodeTemplate: null,
                    controlNode: {
                        route: '',
                        desc: '自定义：充值',
                        index: 0,
                        children: [
                            {
                                route: '$id',
                                desc: '订单号',
                                index: 0,
                                children: [],
                                actions: [],
                                isLeaf: false,
                                value: 'd17971f0-5a05-4ca2-849b-b0bf16c8f017',
                                isfromClone: false,
                                runAction: [],
                                xxxZZZEvent: {},
                                id: 229,
                            },
                        ],
                        actions: [],
                        isLeaf: false,
                        value: '',
                        isfromClone: true,
                        runAction: [],
                        xxxZZZEvent: {},
                        id: 230,
                    },
                    group: '充值',
                    className: '',
                    methodName: 'pay',
                    inApiLumen: true,
                    canCustom: true,
                    sort: 0,
                },
            },
        ],
        pageName: 'PAGE_CUSTOM_FUNCTION',
    }

    const res = await Url.postJson(commitActionUrl, reqBody, { uId: uId })

    console.log(res.data)
}

async function testPropAdd() {
    const reqBody = {
        uId: uId,
        actionRequest: [
            {
                routeList: ['道具', 'costProp'],
                action: {
                    route: 'function',
                    desc: '扣除道具',
                    childNodeTemplate: null,
                    controlNode: {
                        route: '',
                        desc: '自定义：扣除道具',
                        index: 0,
                        children: [
                            {
                                route: '$propId',
                                desc: '道具id',
                                index: 0,
                                children: [],
                                actions: [],
                                isLeaf: false,
                                value: '1001',
                                isfromClone: false,
                                runAction: [],
                                xxxZZZEvent: {},
                                id: 629,
                            },
                            {
                                route: '$num',
                                desc: '数量>0',
                                index: 1,
                                children: [],
                                actions: [],
                                isLeaf: false,
                                value: 10,
                                isfromClone: false,
                                runAction: [],
                                xxxZZZEvent: {},
                                id: 631,
                            },
                        ],
                        actions: [],
                        isLeaf: false,
                        value: '',
                        isfromClone: true,
                        runAction: [],
                        xxxZZZEvent: {},
                        id: 632,
                    },
                    group: '道具',
                    className: '',
                    methodName: 'costProp',
                    inApiLumen: false,
                    canCustom: true,
                    sort: 2,
                },
            },
        ],
        pageName: 'PAGE_CUSTOM_FUNCTION',
    }
    const res = await Url.postJson(commitActionUrl, reqBody, { uId: uId })

    console.log(res.data)
}

//void testGetCustom()
//void testGetCustom('充值')
//void testGetCustom('道具')

void testPropAdd()
