export interface PropertyInfo {
    version: number
    properties: {
        id: number
        name: string
        type: string
        comment: string
    }[]
    extendType: string
}

export interface PropertyService {
    version: number
    class: { [key: string]: PropertyInfo }
}

interface ModInfo {
    id: int
    type: string
}

export interface HashMod {
    version: number
    mods: { [key: string]: ModInfo }
}

export const propertyService: PropertyService = {
    version: 1,
    class: {},
}

export const modProperty: HashMod = {
    version: 1,
    mods: {},
}
