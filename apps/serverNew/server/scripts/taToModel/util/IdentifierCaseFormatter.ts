export class IdentifierCaseFormatter {
    /**
     * 字符转化
     */
    public static snakeToPascalCase(snakeCaseString: string, isCamel: boolean): string {
        const upper = snakeCaseString
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        const strReplace = upper.replace(/\s+/g, '')
        if (isCamel) {
            return strReplace.charAt(0).toLowerCase() + strReplace.slice(1)
        }
        return strReplace
    }
}
