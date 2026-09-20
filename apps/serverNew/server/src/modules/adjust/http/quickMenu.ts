import type { AdjustQuickMenuConfig } from '@arthropoda/game-engine'

export interface AdjustQuickMenuResponse extends AdjustQuickMenuConfig {
    url?: string
}

function replaceQuickMenuTokens(value: string, webApi: string) {
    return value
        .replaceAll('{webApi}', webApi)
        .replaceAll('{platform}', PLATFORM)
        .replaceAll('{version}', PLATFORM_VERSION)
        .replaceAll('{project}', CP.platform.project ?? '')
}

export function buildAdjustQuickMenus(webApi: string): AdjustQuickMenuResponse[] {
    const menus = CP.platform.adjustQuickMenus ?? []
    return menus
        .filter((menu) => menu.name && (menu.url || menu.routeName))
        .map((menu) => ({
            ...menu,
            url: menu.url ? replaceQuickMenuTokens(menu.url, webApi) : undefined,
            target: menu.target === '_self' ? '_self' : '_blank',
        }))
}
