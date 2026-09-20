export class TraitAnnotation {
    public annotation: string[] = []

    public appendAnnotation(value: string | string[]): void {
        if (Array.isArray(value)) {
            value = value.join('\n')
        }
        this.annotation.push(...value.split('\n'))
    }
}
