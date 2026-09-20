import path from 'path'

export function adjustFileKey(projectRoot: string, filePath: string) {
    const relativePath = path.relative(projectRoot, filePath)
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error(`adjust file is outside project root: ${filePath}`)
    }
    return relativePath.replaceAll(path.sep, '/')
}
