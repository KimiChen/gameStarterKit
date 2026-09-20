const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')

describe('telemetry source layout', () => {
    it('keeps telemetry runtime sources outside the generic service directory', () => {
        const sources = {
            'src/telemetry/consumers/AbstractConsumer.ts': 'AbstractConsumer',
            'src/telemetry/consumers/FileConsumer.ts': 'FileConsumer',
            'src/telemetry/TelemetryEventFormatter.ts': 'TelemetryEventFormatter',
            'src/telemetry/TelemetryEventWriter.ts': 'TelemetryEventWriter',
            'src/telemetry/TelemetryAttachTask.ts': 'TelemetryAttachTask',
            'src/telemetry/TelemetryPropertiesRegistry.ts': 'TelemetryPropertiesRegistry',
            'src/telemetry/TelemetryBatchState.ts': 'TelemetryBatchState',
            'src/telemetry/consumers/ThinkingDataAnalytics.ts': 'ThinkingDataAnalytics',
            'src/telemetry/consumers/ThinkingDataException.ts': 'ThinkingDataException',
            'src/telemetry/consumers/ThinkingDataNetworkException.ts': 'ThinkingDataNetworkException',
        }

        for (const [source, exportName] of Object.entries(sources)) {
            const content = fs.readFileSync(path.join(root, source), 'utf8')
            assert.match(content, new RegExp(`export (?:abstract )?class ${exportName}\\b`))
        }
        assert.strictEqual(fs.existsSync(path.join(root, 'src/service/statTa')), false)
        assert.strictEqual(fs.existsSync(path.join(root, 'src/telemetry/TelemetryUserContext.ts')), false)
        assert.strictEqual(fs.existsSync(path.join(root, 'src/telemetry/StatValueLabels.ts')), false)
    })

    it('keeps business mapping imports out of the common telemetry layer', () => {
        const telemetryFiles = walkTypeScriptFiles(path.join(root, 'src/telemetry'))
        for (const filePath of telemetryFiles) {
            const content = fs.readFileSync(filePath, 'utf8')
            assert.doesNotMatch(content, /from ['"]\.\.\/modules\//, filePath)
            assert.doesNotMatch(content, /\b(?:TaskDefine|AttrTypeBean|ItemIdDefine|User)\b/, filePath)
        }
    })

    function walkTypeScriptFiles(directory) {
        return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const filePath = path.join(directory, entry.name)
            if (entry.isDirectory()) return walkTypeScriptFiles(filePath)
            return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : []
        })
    }
})
