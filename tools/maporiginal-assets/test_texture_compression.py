"""O4 regression: corrupt payload/mips, transparent RGB, local detail and policy drift."""
from copy import deepcopy
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from measure_compression import astc_info, image_error
from texture_policy import POLICY, apply_texture_policy, quality_failures, validate_builder
from install_to_kit import meta_for
from audit_compression_quality import verify_sources


class CompressionTests(unittest.TestCase):
    def test_astc_header_counts_blocks_not_pixels_and_rejects_trailing_mips(self):
        data = bytes.fromhex('13aba15c') + bytes([4, 4, 1]) + b''.join(n.to_bytes(3, 'little') for n in (7, 5, 1)) + b'\0' * 64
        self.assertEqual(astc_info(data)['gpuBytes'], 64)
        for bad in (data[:-1], data + b'\0' * 16, b'bad!' + data[4:]):
            with self.assertRaises(ValueError): astc_info(bad)

    def test_transparent_rgb_and_small_regions_are_not_hidden_by_background(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / 'a.png', Path(folder) / 'b.png'
            original = Image.new('RGBA', (128, 128), (90, 120, 150, 0)); original.save(a)
            original.putpixel((1, 1), (250, 250, 250, 0)); original.save(b)
            errors = image_error(a, b)
            self.assertEqual(errors['composite']['128']['visible']['pixels'], 0)
            self.assertGreater(errors['sampledRgbTransparentPixels']['mae'], 0)
            self.assertGreater(errors['sampledRgbTransparentPixels']['worstTileMae'], errors['sampledRgbTransparentPixels']['mae'])

    def test_policy_migration_preserves_identity_and_is_idempotent(self):
        meta = meta_for('bundles/test.png', 'test.png')
        before = deepcopy(meta)
        meta['userData']['customNote'] = 'keep'
        meta['subMetas']['6c48a']['userData']['mipfilter'] = 'linear'
        result = apply_texture_policy(meta, 'decor-atlas.png')
        self.assertEqual(result['uuid'], before['uuid'])
        self.assertEqual(result['subMetas']['6c48a']['uuid'], before['subMetas']['6c48a']['uuid'])
        self.assertEqual(result['userData']['customNote'], 'keep')
        self.assertEqual(result['subMetas']['6c48a']['userData']['mipfilter'], 'none')
        self.assertEqual(result, apply_texture_policy(result, 'decor-atlas.png'))
        self.assertNotIn('compressSettings', apply_texture_policy(result, 'river-mask.png')['userData'])
        with self.assertRaises(KeyError): apply_texture_policy(meta, 'unclassified.png')

    def test_platform_override_cannot_remove_lossless_png_fallback(self):
        import json
        builder = json.loads((Path(__file__).resolve().parents[2] / 'apps/Cocos/settings/v2/packages/builder.json').read_text())
        validate_builder(builder)
        builder['textureCompressConfig']['userPreset'][POLICY['preset']]['overwrite'] = {'web': {'astc_4x4': {'quality': 'medium'}}}
        with self.assertRaises(ValueError): validate_builder(builder)

    def test_quality_rejects_a_local_artifact_even_with_zero_global_mean(self):
        stats = {'pixels': 100, 'mae': 0, 'p99': 0, 'bad32Fraction': 0, 'worstTileMae': 0}
        errors = {'composite': {'128': {'visible': deepcopy(stats)}}, 'alphaEdge': deepcopy(stats)}
        self.assertEqual(quality_failures(errors), [])
        errors['composite']['128']['visible']['worstTileMae'] = POLICY['colorLimits']['worstTileMae'] + 1
        self.assertTrue(quality_failures(errors))

    def test_scene_replay_cannot_substitute_original_for_compressed_candidate(self):
        manifest = {'assets': {'test.png': {'sourceSha256': 'original'}}}
        trials = {'images': {'test.png': {'4x4': {'decodedSha256': 'decoded'}}}}
        before = {'sourceHashes': {'/test.png': 'original'}}
        verify_sources(before, manifest, trials, {})
        with self.assertRaises(ValueError): verify_sources(before, manifest, trials, {'test.png': '4x4'})
        verify_sources({'sourceHashes': {'/test.png': 'decoded'}}, manifest, trials, {'test.png': '4x4'})


if __name__ == '__main__': unittest.main()
