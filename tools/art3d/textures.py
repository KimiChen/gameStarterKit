#!/usr/bin/env python3
"""Decode supported images, remove embedded payloads and rewrite same-directory PNG URIs."""
import base64
import io
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image
from pipeline import Glb, atomic_write, require, run_cli, sha, validate_model, write_json


def image_bytes(glb, item, directory):
    if 'bufferView' in item:
        require('uri' not in item, 'Image cannot contain both URI and bufferView')
        view = glb.doc['bufferViews'][item['bufferView']]
        begin, size = view.get('byteOffset',0), view['byteLength']
        require(view.get('buffer') == 0 and begin >= 0 and size > 0 and begin+size <= len(glb.blob), 'Embedded image bounds')
        return bytes(glb.blob[begin:begin+size])
    uri = item.get('uri','')
    if uri.startswith('data:'):
        require(uri.startswith(('data:image/png;base64,','data:image/jpeg;base64,')), 'Unsupported image data URI')
        return base64.b64decode(uri.split(',',1)[1], validate=True)
    parts = urlsplit(uri)
    require(uri and not parts.scheme and not parts.netloc and not parts.query and not parts.fragment, 'External/remote image URI rejected')
    decoded = unquote(uri)
    require(not Path(decoded).is_absolute() and '\\' not in decoded and '\x00' not in decoded, 'Invalid image URI')
    source = (directory/decoded).resolve()
    require(source.is_relative_to(directory.resolve()) and source.is_file(), 'Image escapes source root or is missing')
    return source.read_bytes()


def png_bytes(data, max_size):
    with Image.open(io.BytesIO(data)) as image:
        require(image.format in ('PNG','JPEG','TGA','WEBP'), 'Unsupported image encoding')
        image.load()
        width,height = image.size
        require(256 <= width <= 8192 and 256 <= height <= 8192 and width & (width-1) == 0 and height & (height-1) == 0,
                'Surface texture must be POT and at least 256; source cap 8192')
        image = image.convert('RGBA')
        if max(width,height) > max_size:
            ratio = max_size/max(width,height)
            target = (round(width*ratio),round(height*ratio))
            require(min(target)>=256, 'Downsize would violate minimum256; author a different atlas')
            image = image.resize(target, Image.Resampling.LANCZOS)
        output = io.BytesIO(); image.save(output, format='PNG', optimize=False, compress_level=9)
        return output.getvalue(), list(image.size)


def externalize(glb, source_dir, output_dir, model, max_size=1024):
    # The converter currently supports BC only; reject other slots rather than rename linear data BC.
    for material in glb.doc.get('materials',[]):
        require(not any(k in material for k in ('normalTexture','occlusionTexture','emissiveTexture'))
                and 'metallicRoughnessTexture' not in material.get('pbrMetallicRoughness',{}), 'Unmapped texture channel')
    pending = []
    for i,item in enumerate(glb.doc.get('images',[])):
        data, dimensions = png_bytes(image_bytes(glb,item,Path(source_dir)),max_size)
        name = f'T_{model}_{i}_BC.png'
        pending.append((name,data,dimensions))
    for item,(name,_,_) in zip(glb.doc.get('images',[]),pending):
        item.pop('bufferView',None); item.pop('mimeType',None); item['uri'] = name
    result = glb.packed()
    for name,data,_ in pending: atomic_write(Path(output_dir)/name,data)
    return result, [{'file':name,'dimensions':dim,'sha256':sha(Path(output_dir)/name)} for name,_,dim in pending]


def textures(cfg):
    """Normalize/externalize image payloads from the intermediate GLB to standalone PNGs."""
    source = cfg['workDir']/(cfg['model']+'.glb')
    result,images = externalize(Glb.load(source),source.parent,cfg['outputDir'],cfg['model'],cfg.get('textureMaxSize',1024))
    target = cfg['outputDir']/(cfg['model']+'.glb')
    summary = validate_model(result,target)
    result.save(target)
    report = {'sourceSha256':sha(source),'modelSha256':sha(target),'images':images, **summary}
    write_json(cfg['workDir']/'textures-report.json',report)
    return report


if __name__ == '__main__': run_cli(textures)
