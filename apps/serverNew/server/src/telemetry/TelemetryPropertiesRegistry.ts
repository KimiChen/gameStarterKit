export interface TelemetryPropertiesProvider {
    readonly name: string
    provide(source: unknown): { [key: string]: any }
}

export class TelemetryPropertiesRegistry {
    private static providers: readonly TelemetryPropertiesProvider[] = []

    static setProviders(providers: readonly TelemetryPropertiesProvider[]) {
        const names = providers.map((provider) => provider.name)
        if (new Set(names).size !== names.length) {
            throw new Error(`Telemetry property provider names must be unique: ${names.join(',')}`)
        }
        this.providers = [...providers]
    }

    static collect(source: unknown) {
        const properties: { [key: string]: any } = {}
        for (const provider of this.providers) {
            Object.assign(properties, provider.provide(source))
        }
        return properties
    }

    static providerNames() {
        return this.providers.map((provider) => provider.name)
    }
}
