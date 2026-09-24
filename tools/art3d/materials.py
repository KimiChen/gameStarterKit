"""Explicit opaque Unity Standard metallic workflow mapping."""
import json
from pipeline import require, sha, write_json


def linear_color(color):
    """Unity Standard serialized _Color is sRGB; glTF factors are linear (alpha unchanged)."""
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in color[:3]] + color[3:]


def map_materials(cfg):
    """Validate every material mapping and produce glTF PBR properties."""
    data = json.loads((cfg['workDir']/'extracted.json').read_text())
    require(data['sourceSha256'] == sha(cfg['source']['path']), 'Stale extraction')
    require(set(cfg['materials']) == {m['name'] for m in data['materials']}, 'Material mapping must cover exactly the extracted materials')
    output = []
    for material in data['materials']:
        entry = cfg['materials'][material['name']]
        require(entry['shader'] == material['shader'] == 'Standard', f'Unmapped shader: {material["shader"]}')
        require(all(0 <= v <= 1 for v in material['baseColor']) and all(0 <= material[k] <= 1 for k in ('metallic','roughness')), 'PBR values out of range')
        pbr = {'baseColorFactor':linear_color(material['baseColor']), 'metallicFactor':material['metallic'], 'roughnessFactor':material['roughness']}
        if 'baseColorImage' in material: pbr['baseColorTexture'] = {'index':material['baseColorImage'], 'texCoord':0}
        output.append({'name':material['name'], 'pbrMetallicRoughness':pbr, 'alphaMode':'OPAQUE', 'doubleSided':False})
    write_json(cfg['workDir']/'materials.json', {'extractedSha256':sha(cfg['workDir']/'extracted.json'), 'materials':output})
    return {'materials':len(output), 'target':'glTF metallic-roughness', 'unsupported':'custom shaders, keyword variants, other texture channels, alpha modes'}
