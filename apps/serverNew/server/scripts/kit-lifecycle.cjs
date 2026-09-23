// Use the same Bean-aware bootstrap as the host; no separate ts-node/compiler configuration.
process.env.ALLOY_DEV_BOOTSTRAP = 'src/runtime/kit/NativeKitCli.ts'
require('../deploy/dev/entrypoint.cjs')
