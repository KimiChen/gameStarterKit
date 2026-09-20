import type { LocalAction } from '../../src/runtime/action/LocalAction'

declare const localAction: typeof LocalAction

async function assertProtocolRouteTypes() {
    const result = await localAction.call('http/OnlyJson', { json: '{}' }, 0, 1)
    if (result.isSucc) {
        result.res.json.toUpperCase()
        // @ts-expect-error OnlyJson has no undeclared response field.
        result.res.unknown
    }
    // @ts-expect-error The generated request requires json.
    await localAction.call('http/OnlyJson', {}, 0, 1)
}

void assertProtocolRouteTypes
