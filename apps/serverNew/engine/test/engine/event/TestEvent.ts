/* eslint-disable @typescript-eslint/no-floating-promises */
import { EventSystem, EventArgs, EventHandler, EventCalculate } from '../../../src'

describe('EventSystem', () => {
  let eventSystem: EventSystem

  beforeEach(() => {
    eventSystem = new EventSystem()
  })

  test('subscribe should add handlers to the event map', () => {
    class TestEventArgs extends EventArgs {}
    const handler1 = new EventHandler<TestEventArgs>()
    const handler2 = new EventHandler<TestEventArgs>()

    eventSystem.subscribe(TestEventArgs, handler1, handler2)

    const handlerMap = eventSystem.eventMap.get(TestEventArgs.name)
    expect(handlerMap).toHaveLength(2)
    expect(handlerMap?.get(`${handler1.sort}_${handler1.constructor.name}`)).toEqual(handler1)
    expect(handlerMap?.get(`${handler2.sort}_${handler2.constructor.name}`)).toEqual(handler2)
  })

  test('publish should call handlers for the corresponding event', async () => {
    class TestEventArgs extends EventArgs {}
    const handler = new EventHandler<TestEventArgs>()

    eventSystem.subscribe(TestEventArgs, handler)

    const eventArg = new TestEventArgs()

    await eventSystem.publish(eventArg)

    // 可以添加更多的断言来验证处理逻辑
  })

  test('triggerAsync should trigger and handle asynchronous events', async () => {
    class TestEventArgs extends EventArgs {}
    const asyncHandler = new EventHandler<TestEventArgs>()
    asyncHandler.isSync = false

    eventSystem.subscribe(TestEventArgs, asyncHandler)

    const eventArg = new TestEventArgs()

    eventSystem.publish(eventArg)

    await eventSystem.triggerAsync()

    // 可以添加更多的断言来验证异步处理逻辑
  })

  test('trigger should handle specified events', async () => {
    class TestEventArgs extends EventArgs {}
    const handler = new EventHandler<TestEventArgs>()

    eventSystem.subscribe(TestEventArgs, handler)

    const eventArg = new TestEventArgs()

    await eventSystem.trigger(eventArg)

    // 可以添加更多的断言来验证处理逻辑
  })

  test('handlerCalculate should handle calculation events', async () => {
    class TestEventArgs extends EventArgs {}
    const calculateHandler = new EventCalculate<TestEventArgs>()

    eventSystem.subscribe(TestEventArgs, calculateHandler)

    await eventSystem.handlerCalculate()

    // 可以添加更多的断言来验证计算处理逻辑
  })
})
