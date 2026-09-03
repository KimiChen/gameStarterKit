# Snake S0 replication evidence tool

This Node-only tool rebuilds the S0 evidence bundle from the locked source archive and the
locked target baseline. It never executes source JavaScript and never imports source runtime
code. Source object literals are handled by a deliberately small data-only parser.

```bash
node tools/snake-s0-replication/cli.mjs \
  --source /Users/kimi/work/tanchishe/wegameVersion \
  --write

node tools/snake-s0-replication/cli.mjs \
  --source /Users/kimi/work/tanchishe/wegameVersion \
  --check

node --test tools/snake-s0-replication/snake-s0-replication.test.mjs
```

`--write` builds in a temporary directory and atomically replaces only
`docs/s/evidence/s0`. `--check` builds into a temporary directory and performs a byte-for-byte
comparison. Both modes reject a source Git identity mismatch, dirty source archive, target
baseline mismatch, source mutation during the read, and any runtime dependency on the source
archive.

The PNG files are deterministic source-derived static reconstructions. They are evidence
fixtures, not claims of original runtime screenshots and not production game assets.
