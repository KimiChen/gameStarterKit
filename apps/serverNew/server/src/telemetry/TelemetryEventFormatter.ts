export class TelemetryEventFormatter {
    static format(
        properties: { [key: string]: any },
        publicProperties?: { [key: string]: any; _important: { [key: string]: string } },
    ) {
        const formatted: { [key: string]: any } = []

        for (const propertyName in properties) {
            const propertyValue = properties[propertyName]
            let outputName = propertyName
            if (properties._important[propertyName]) {
                outputName = '#' + propertyName
            }
            formatted[outputName] = propertyValue
        }

        if (!publicProperties) {
            return formatted
        }

        Object.entries(publicProperties).forEach(([propertyName, propertyValue]) => {
            let outputName = propertyName
            if (publicProperties._important[propertyName]) {
                outputName = '#' + propertyName
            }
            if (formatted[outputName]) {
                return
            }
            formatted[outputName] = propertyValue
        })

        return formatted
    }
}
