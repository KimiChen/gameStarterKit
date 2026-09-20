import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { TELEMETRY_USER_SOURCE, telemetryUserImportLine } from '../../../scripts/taToModel/convert/ConvertEvents'

describe('generated telemetry imports', () => {
    it('generates telemetry modules against the module-owned User source', () => {
        assert.strictEqual(TELEMETRY_USER_SOURCE, '../../../src/modules/user/bean/User')
        assert.strictEqual(telemetryUserImportLine(), "import { User } from '../../../src/modules/user/bean/User'")
    })

    it('keeps generated event imports on their current owners', () => {
        const telemetryRoot = path.resolve(process.cwd(), 'generated/telemetry')
        const eventFiles = walkTypeScriptFiles(telemetryRoot).filter((filePath) => !filePath.includes('/models/'))
        const userImport = "import { User } from '../../../src/modules/user/bean/User'"
        const writerImport = "import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'"
        const contextImport =
            "import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'"
        let userImportCount = 0

        assert.ok(eventFiles.length > 0)
        for (const filePath of eventFiles) {
            const content = fs.readFileSync(filePath, 'utf8')
            if (content.includes(userImport)) userImportCount++
            assert.ok(content.includes(writerImport), filePath)
            assert.ok(content.includes(contextImport), filePath)
        }
        assert.ok(userImportCount > 0)
    })
})

function walkTypeScriptFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) return walkTypeScriptFiles(filePath)
        return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : []
    })
}
