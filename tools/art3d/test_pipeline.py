"""SC5 authoring acceptance + destructive artifact/Unity mutations in temporary directories."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import numpy as np
import UnityPy
import jsonschema
from PIL import Image
from pipeline import Glb, HERE, read_config, require, validate_model
from unity_extract import extract
from materials import map_materials
from convert import convert
from textures import textures, externalize, png_bytes
from lod import lod, make_lod
from roundtrip import compare_lod, compare_main, verify

spec=importlib.util.spec_from_file_location('unity_fixture',HERE/'unity-fixture.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='art3d-sc5-');cls.root=Path(cls.tmp.name)
        cls.source=cls.root/'input'/'fixture.assets';fixture.generate(cls.source)
        cls.configs={}
        for kind in ('static','skinned'):
            config=json.loads((HERE/'fixtures'/f'{kind}.conversion.json').read_text())
            config['source']['path']=str(cls.source);config['workDir']=str(cls.root/kind/'work');config['outputDir']=str(cls.root/kind/'out')
            cfg_file=cls.root/f'{kind}.json';cfg_file.write_text(json.dumps(config));cfg=read_config(cfg_file)
            for step in (extract,map_materials,convert,textures,lod,verify):step(cfg)
            cls.configs[kind]=cfg
        cls.main_path=cls.configs['skinned']['outputDir']/'SK_OfflineColumn.glb'
        cls.variant_path=cls.configs['skinned']['outputDir']/'lod_1.glb'

    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()

    def setUp(self):
        self.case=tempfile.TemporaryDirectory(dir=self.root,prefix='case-');self.addCleanup(self.case.cleanup)
        self.path=Path(self.case.name);self.main=Glb.load(self.main_path);self.variant=Glb.load(self.variant_path)
        self.policy=self.configs['skinned']['lod']

    def cfg_copy(self):
        cfg=copy.deepcopy(self.configs['skinned']);cfg['workDir']=self.path/'work';cfg['outputDir']=self.path/'out'
        shutil.copytree(self.configs['skinned']['workDir'],cfg['workDir']);shutil.copytree(self.configs['skinned']['outputDir'],cfg['outputDir'])
        return cfg

    def bad_lod(self,message=None):
        with self.assertRaises(ValueError) as error:compare_lod(self.main,self.variant,.25,self.policy)
        if message:self.assertIn(message,str(error.exception))

    def change_accessor(self,model,index,transform):
        desc=model.doc['accessors'][index];array=model.array(index);transform(array)
        new=model.add(array,desc['type'],desc['componentType']);model.doc['accessors'][index]=model.doc['accessors'][new]

    def mutate_unity(self,pid,mutation):
        cfg=self.cfg_copy();env=UnityPy.load(str(self.source));obj=next(o for o in env.objects if o.path_id==pid)
        data=obj.read_typetree();mutation(data);obj.save_typetree(data)
        source=self.path/'mutated.assets';source.write_bytes(obj.assets_file.save());cfg['source']['path']=source
        return cfg

    def test_fixture_real_unity_read_and_deterministic(self):
        self.assertEqual(self.source.read_bytes(),fixture.fixture_bytes())
        types={o.type.name for o in UnityPy.load(str(self.source)).objects}
        self.assertTrue({'Mesh','Material','Texture2D','AnimationClip','SkinnedMeshRenderer'}<=types)

    def test_both_full_chains(self):
        for cfg in self.configs.values():
            report=verify(cfg);self.assertEqual(report['status'],'passed')
            self.assertEqual(report['main']['triangles'],1200)
            self.assertEqual([v['triangles'] for v in report['variants']],[297,118])

    def test_four_nonzero_influences_and_two_one_second_clips(self):
        summary=validate_model(self.main,self.main_path)
        self.assertEqual(summary['bones'],[4]);self.assertEqual([a['duration'] for a in summary['animations']],[1,1])
        for p in self.main.doc['meshes'][0]['primitives']:
            self.assertTrue((self.main.array(p['attributes']['WEIGHTS_0'])>0).all())

    def test_image_externalized_and_payload_dropped(self):
        intermediate=Glb.load(self.configs['skinned']['workDir']/'SK_OfflineColumn.glb')
        self.assertIn('bufferView',intermediate.doc['images'][0]);self.assertNotIn('bufferView',self.main.doc['images'][0])
        self.assertLess(len(self.main.blob),len(intermediate.blob));self.assertEqual(self.main.doc['images'][0]['uri'],'T_SK_OfflineColumn_0_BC.png')

    def test_conversion_axes_uv_and_winding_independent(self):
        raw=json.loads((self.configs['static']['workDir']/'extracted.json').read_text())
        glb=Glb.load(self.configs['static']['outputDir']/'SM_OfflineColumn.glb')
        p=glb.doc['meshes'][0]['primitives'][0]
        self.assertEqual(glb.array(p['attributes']['POSITION'])[0].tolist(),[1,0,.5])
        self.assertEqual(glb.array(p['attributes']['TEXCOORD_0'])[0].tolist(),[0,0])
        compare_main(raw,glb)

    def test_missing_lod_fails(self):
        cfg=self.cfg_copy();(cfg['outputDir']/'lod_2.glb').unlink()
        with self.assertRaisesRegex(ValueError,'Missing LOD'):verify(cfg)

    def test_standard_color_to_linear_with_alpha_unchanged(self):
        cfg=self.cfg_copy();path=cfg['workDir']/'extracted.json';data=json.loads(path.read_text())
        data['materials'][0]['baseColor']=[.5,.04,1,.4];path.write_text(json.dumps(data))
        map_materials(cfg)
        color=json.loads((cfg['workDir']/'materials.json').read_text())['materials'][0]['pbrMetallicRoughness']['baseColorFactor']
        np.testing.assert_allclose(color,[.21404114048223255,.0030959752321981426,1,.4],rtol=0,atol=1e-12)

    def test_gamma_color_passthrough_fails_roundtrip(self):
        raw=json.loads((self.configs['skinned']['workDir']/'extracted.json').read_text())
        for source,material in zip(raw['materials'],self.main.doc['materials']):
            material['pbrMetallicRoughness']['baseColorFactor']=source['baseColor']
        with self.assertRaisesRegex(ValueError,'PBR mapping'):compare_main(raw,self.main)

    def test_no_triangle_reduction_fails(self):
        self.variant=self.main;self.bad_lod('triangle target')

    def test_wrong_material_slot_fails(self):
        self.variant.doc['meshes'][0]['primitives'][0]['material']=1;self.bad_lod('material slot')

    def test_removed_primitive_fails(self):
        self.variant.doc['meshes'][0]['primitives'].pop();self.bad_lod('primitive')

    def test_lost_skeleton_fails(self):
        self.variant.doc['skins']=[];self.bad_lod('Missing skin')

    def test_lost_weights_fails(self):
        self.variant.doc['meshes'][0]['primitives'][0]['attributes'].pop('WEIGHTS_0');self.bad_lod('skin')

    def test_changed_weights_fails(self):
        index=self.variant.doc['meshes'][0]['primitives'][0]['attributes']['WEIGHTS_0']
        self.change_accessor(self.variant,index,lambda a:a.__setitem__((0,slice(None)),[1,0,0,0]));self.bad_lod('retained')

    def test_invalid_weights_sum_fails(self):
        index=self.variant.doc['meshes'][0]['primitives'][0]['attributes']['WEIGHTS_0']
        self.change_accessor(self.variant,index,lambda a:a.__setitem__((0,0),.8));self.bad_lod('weights')

    def test_out_of_range_joint_fails(self):
        index=self.variant.doc['meshes'][0]['primitives'][0]['attributes']['JOINTS_0']
        self.change_accessor(self.variant,index,lambda a:a.__setitem__((0,0),99));self.bad_lod('Bone index')

    def test_lost_animation_fails(self):
        self.variant.doc['animations'].pop();self.bad_lod('Lost animation')

    def test_wrong_animation_target_fails(self):
        self.variant.doc['animations'][0]['channels'][0]['target']['node']=1;self.bad_lod('binding')

    def test_changed_animation_duration_fails(self):
        i=self.variant.doc['animations'][0]['samplers'][0]['input']
        self.change_accessor(self.variant,i,lambda a:a.__setitem__((-1,0),2));self.bad_lod('duration')

    def test_changed_animation_slope_fails(self):
        i=self.variant.doc['animations'][0]['samplers'][0]['output']
        self.change_accessor(self.variant,i,lambda a:a.__setitem__((0,0),.4));self.bad_lod('tangent')

    def test_changed_inverse_bind_fails(self):
        i=self.variant.doc['skins'][0]['inverseBindMatrices']
        self.change_accessor(self.variant,i,lambda a:a.__setitem__((0,13),7));self.bad_lod('bind')

    def test_lost_uv2_fails(self):
        self.variant.doc['meshes'][0]['primitives'][0]['attributes'].pop('TEXCOORD_1');self.bad_lod('UV1')

    def test_changed_uv_fails(self):
        i=self.variant.doc['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']
        self.change_accessor(self.variant,i,lambda a:a.__setitem__((0,0),.123));self.bad_lod('retained')

    def test_reversed_triangle_fails(self):
        i=self.variant.doc['meshes'][0]['primitives'][0]['indices']
        self.change_accessor(self.variant,i,lambda a:a.__setitem__((slice(0,3),0),a[:3,0][[0,2,1]]));self.bad_lod('winding')

    def test_nonfinite_attribute_fails(self):
        i=self.variant.doc['meshes'][0]['primitives'][0]['attributes']['POSITION']
        a=self.variant.doc['accessors'][i];v=self.variant.doc['bufferViews'][a['bufferView']]
        self.variant.blob[v['byteOffset']:v['byteOffset']+4]=np.float32(np.nan).tobytes();self.bad_lod('Nonfinite')

    def test_morph_target_refused(self):
        self.main.doc['meshes'][0]['primitives'][0]['targets']=[{'POSITION':0}]
        with self.assertRaisesRegex(ValueError,'morph'):make_lod(self.main,.25,.01)

    def test_varying_skin_influences_require_manual_variants(self):
        i=self.main.doc['meshes'][0]['primitives'][0]['attributes']['WEIGHTS_0']
        self.change_accessor(self.main,i,lambda a:a.__setitem__((0,slice(None)),[.5,.2,.2,.1]))
        with self.assertRaisesRegex(ValueError,'manual variants'):make_lod(self.main,.25,.01)

    def test_bounds_loss_refused_even_with_valid_original_vertices(self):
        # Replace one face's triangles by repeated interior triangles: all attributes retained,
        # count/slots/rig still valid, but the geometry no longer covers the source bounding box.
        p=self.variant.doc['meshes'][0]['primitives'][0];idx=self.variant.array(p['indices']).ravel()
        i=p['indices'];self.change_accessor(self.variant,i,lambda a:a.__setitem__((slice(None),0),np.tile(idx[:3],len(idx)//3)))
        self.bad_lod('bounds')

    def test_embedded_image_rejected_in_final_gate(self):
        self.variant.doc['images'][0]={'bufferView':0,'mimeType':'image/png'}
        with self.assertRaisesRegex(ValueError,'Embedded'):validate_model(self.variant,self.variant_path)

    def test_unsafe_image_uris_refused(self):
        for uri in ('https://example.com/x.png','../../escape.png','%2e%2e/escape.png','/tmp/x.png','T.png?download=1'):
            with self.subTest(uri=uri):
                self.variant.doc['images'][0]={'uri':uri}
                with self.assertRaises(ValueError):validate_model(self.variant,self.variant_path)

    def test_missing_png_refused(self):
        cfg=self.cfg_copy();next(cfg['outputDir'].glob('*.png')).unlink()
        with self.assertRaisesRegex(ValueError,'Missing image'):verify(cfg)

    def test_external_buffers_refused(self):
        self.variant.doc['buffers'][0]['uri']='secret.bin';target=self.path/'bad.glb'
        # encode canonicalizes buffers, so mutate the serialized JSON chunk explicitly.
        data=self.variant.encode();length=int.from_bytes(data[12:16],'little');doc=json.loads(data[20:20+length]);doc['buffers'][0]['uri']='secret.bin'
        document=json.dumps(doc,separators=(',',':')).encode();document+=b' '*(-len(document)%4);binary=data[20+length:]
        import struct
        target.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(document)+len(binary))+struct.pack('<I4s',len(document),b'JSON')+document+binary)
        with self.assertRaisesRegex(ValueError,'External'):Glb.load(target)

    def test_truncated_glb_refused(self):
        target=self.path/'bad.glb';target.write_bytes(self.main.encode()[:-1])
        with self.assertRaisesRegex(ValueError,'header'):Glb.load(target)

    def test_accessor_range_refused(self):
        self.variant.doc['accessors'][0]['count']=10**9;self.bad_lod('bounds')

    def test_unknown_extensions_refused(self):
        self.variant.doc['materials'][0]['extensions']={'KHR_materials_unlit':{}};self.bad_lod('extensions')

    def test_data_uri_externalizes(self):
        raw=(self.main_path.parent/self.main.doc['images'][0]['uri']).read_bytes()
        self.main.doc['images'][0]={'uri':'data:image/png;base64,'+base64.b64encode(raw).decode()}
        result,images=externalize(self.main,self.main_path.parent,self.path,'Test',256)
        self.assertEqual(images[0]['dimensions'],[256,256]);validate_model(result,self.path/'test.glb')

    def test_jpeg_to_png(self):
        data=io.BytesIO();Image.new('RGB',(256,256),(123,44,9)).save(data,format='JPEG')
        encoded,size=png_bytes(data.getvalue(),512);self.assertTrue(encoded.startswith(b'\x89PNG'));self.assertEqual(size,[256,256])

    def test_nonpot_texture_refused(self):
        data=io.BytesIO();Image.new('RGBA',(257,512)).save(data,format='PNG')
        with self.assertRaisesRegex(ValueError,'POT'):png_bytes(data.getvalue(),512)

    def test_source_is_readonly(self):
        before=self.source.read_bytes();verify(self.configs['skinned']);self.assertEqual(before,self.source.read_bytes())

    def test_unknown_shader_refused(self):
        cfg=self.mutate_unity(48,lambda d:d.update(m_Name='Custom/Ocean'));extract(cfg)
        with self.assertRaisesRegex(ValueError,'shader'):map_materials(cfg)

    def test_unity_compressed_animation_refused(self):
        cfg=self.mutate_unity(300,lambda d:d.update(m_Compressed=True))
        with self.assertRaisesRegex(ValueError,'compressed'):extract(cfg)

    def test_unity_mecanim_refused(self):
        cfg=self.mutate_unity(300,lambda d:d.update(m_Legacy=False))
        with self.assertRaisesRegex(ValueError,'Mecanim'):extract(cfg)

    def test_unity_weighted_curve_refused(self):
        cfg=self.mutate_unity(300,lambda d:d['m_RotationCurves'][0]['curve']['m_Curve'][0].update(weightedMode=1))
        with self.assertRaisesRegex(ValueError,'Weighted'):extract(cfg)

    def test_unity_missing_animation_target_refused(self):
        cfg=self.mutate_unity(300,lambda d:d['m_RotationCurves'][0].update(path='Missing'))
        with self.assertRaisesRegex(ValueError,'target missing'):extract(cfg)

    def test_unity_external_reference_refused(self):
        cfg=self.mutate_unity(102,lambda d:d['m_Mesh'].update(m_FileID=1))
        with self.assertRaisesRegex(ValueError,'External Unity'):extract(cfg)

    def test_config_unknown_field_refused(self):
        raw=json.loads((HERE/'fixtures/skinned.conversion.json').read_text());raw['ignoreErrors']=True
        p=self.path/'bad.json';p.write_text(json.dumps(raw))
        with self.assertRaises(jsonschema.ValidationError):read_config(p)

    def test_stale_extraction_refused(self):
        cfg=self.cfg_copy();data=json.loads((cfg['workDir']/'extracted.json').read_text());data['sourceSha256']='bad'
        (cfg['workDir']/'extracted.json').write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Stale'):verify(cfg)

    def test_edited_intermediate_cannot_impersonate_source(self):
        cfg=self.cfg_copy();data=json.loads((cfg['workDir']/'extracted.json').read_text())
        data['nodes'][0]['name']='EditedInBetween'
        (cfg['workDir']/'extracted.json').write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'read-only Unity source'):verify(cfg)


if __name__=='__main__':unittest.main()
