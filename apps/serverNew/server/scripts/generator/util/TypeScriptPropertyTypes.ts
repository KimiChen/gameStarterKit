import { PropertyDeclaration } from 'ts-morph'

export function getPropTypeName(prop: PropertyDeclaration) {
    return prop
        .getType()
        .getText()
        .replace(/import\("[^"]*"\)\./g, '')
}

export function isScalarType(type: string): boolean {
    switch (type) {
        case 'int':
        case 'number':
        case 'string':
        case 'boolean':
            return true
        default:
            return false
    }
}
