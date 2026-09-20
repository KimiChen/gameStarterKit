export function stableClassNames(classMap: Record<string, string>, previousContent: string) {
    const discovered = Object.keys(classMap)
    const previousBody = previousContent.match(/export const classList\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    const previous = [...previousBody.matchAll(/^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*:/gm)].map((match) => match[1])
    const retained = previous.filter((name) => Object.prototype.hasOwnProperty.call(classMap, name))
    const retainedSet = new Set(retained)
    const additions = discovered.filter((name) => !retainedSet.has(name)).sort()
    return [...retained, ...additions]
}

export function registerClassSource(classMap: Record<string, string>, className: string, filePath: string) {
    const existing = classMap[className]
    if (existing && existing !== filePath) {
        throw new Error(`ClassList 类名重复 ${className}: ${existing}, ${filePath}`)
    }
    classMap[className] = filePath
}
