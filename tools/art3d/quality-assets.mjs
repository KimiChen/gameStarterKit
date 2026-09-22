/** SC1-B8 preset validation; SC1-B5 reuses this alongside the full asset gate. */
export const texturePlatforms = ['android', 'ios', 'web', 'miniGame'];
export function resolveTexturePreset(builder, presetId, platform, astc) {
  const preset = builder.textureCompressConfig?.userPreset?.[presetId];
  if (!preset) throw new Error(`Unknown texture preset: ${presetId}`);
  const options = preset.overwrite?.[platform] ?? preset.options?.[platform];
  if (!options?.png || options.png.quality !== 80) throw new Error(`${presetId}/${platform}: PNG quality80 fallback required`);
  const format = presetId === '3d-default' ? 'astc_8x8' : presetId === '3d-alpha' ? 'astc_6x6' : undefined;
  if (!format || options[format]?.quality !== 'medium') throw new Error(`${presetId}/${platform}: expected ASTC medium preset`);
  return astc ? format : 'png';
}
export function verifyQualityPresets(builder) {
  if (builder.textureCompressConfig?.genMipmaps === false) throw new Error('3D compressed textures require mipmaps');
  for (const preset of ['3d-default', '3d-alpha']) for (const platform of texturePlatforms) {
    resolveTexturePreset(builder, preset, platform, true);
    resolveTexturePreset(builder, preset, platform, false);
  }
}
