"""Version binding regression: pure local generated inputs; no upstream files or writes."""
import struct
import unittest
from install_to_kit import FILES, GROUPS, GENERATED_LAYOUTS, make_manifest


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.payloads = {name: (b'\x89PNG\r\n\x1a\n' + b'\0'*8 + struct.pack('>II', 256, 256)
                               if name.endswith('.png') else b'known content') for name in FILES}
        self.bindings = {name: 'old-hash' for name in GENERATED_LAYOUTS}
        self.bindings['bands.data.ts'] = 'bands-hash'

    def test_changing_pixels_moves_only_the_changed_address(self):
        before = make_manifest('s1', self.payloads, self.bindings)
        self.payloads['decor-atlas.png'] += b'changed pixels'
        after = make_manifest('s1', self.payloads, self.bindings)
        self.assertNotEqual(before['contentVersion'], after['contentVersion'])
        for name in before['assets']:
            self.assertEqual(before['assets'][name]['path'] == after['assets'][name]['path'], name != 'decor-atlas.png')

    def test_configuration_and_layout_changes_invalidate_the_right_identity(self):
        before = make_manifest('s1', self.payloads, self.bindings)
        after = make_manifest('s1', self.payloads, {**self.bindings, 'bands.data.ts': 'new'})
        self.assertNotEqual(before['contentVersion'], after['contentVersion'])
        self.assertEqual(before['atlasLayoutVersion'], after['atlasLayoutVersion'])
        after = make_manifest('s1', self.payloads, {**self.bindings, 'decor.data.ts': 'new'})
        self.assertNotEqual(before['atlasLayoutVersion'], after['atlasLayoutVersion'])
        self.assertNotEqual(before['contentVersion'], after['contentVersion'])

    def test_order_independent_and_every_asset_has_one_group(self):
        before = make_manifest('s1', self.payloads, self.bindings)
        after = make_manifest('s1', dict(reversed(list(self.payloads.items()))), dict(reversed(list(self.bindings.items()))))
        self.assertEqual(before, after)
        assets = [name for _, names in GROUPS.values() for name in names]
        self.assertEqual(len(assets), len(set(assets)))
        self.assertEqual(sum(g['sourceBytes'] for g in before['groups'].values()), sum(a['sourceBytes'] for a in before['assets'].values()))

    def test_external_configuration_binds_buffer_address_and_layout_version(self):
        before = make_manifest('s1', self.payloads, self.bindings)
        self.payloads['tops-config.json'] = b'changed scenes or layout'
        after = make_manifest('s1', self.payloads, self.bindings)
        self.assertEqual(after['assets']['tops-config.json']['type'], 'buffer')
        self.assertNotEqual(before['assets']['tops-config.json']['path'], after['assets']['tops-config.json']['path'])
        self.assertNotEqual(before['atlasLayoutVersion'], after['atlasLayoutVersion'])
        self.assertNotEqual(before['contentVersion'], after['contentVersion'])


if __name__ == '__main__':
    unittest.main()
