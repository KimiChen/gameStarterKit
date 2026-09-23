"""展开 prefab 引用与 timeline 外挂子件；保持节点层级、继承、逐帧轨道。"""
import copy
from functools import lru_cache
import prefab_bin
import timeline_bin
import asset_source as source


def walk(node):
    yield node
    for child in node.get('children', []): yield from walk(child)


def override(node, name, value):
    vectors = {'pos_x': ('position', 0), 'pos_y': ('position', 1), 'pos_z': ('position', 2),
               'scale_x': ('scale', 0), 'scale_y': ('scale', 1), 'scale_z': ('scale', 2),
               'width': ('size', 0), 'height': ('size', 1), 'angle': ('angle', 2),
               'anchor_x': ('pivot', 0), 'anchor_y': ('pivot', 1),
               'rotate_z': ('angle', 2), 'skew_x': ('skew', 0), 'skew_y': ('skew', 1)}
    fields = {'name': 'name', 'RenderComponent.renderOrder': 'low_z', 'blend_mode': 'blendMode',
              'RenderComponent.inheritBlend': 'inheritBlend', 'RenderComponent.inheritColor': 'inheritColor',
              'RenderComponent.inheritAlpha': 'inheritAlpha', 'mirror_x': 'mirror_x', 'mirror_y': 'mirror_y'}
    if name in vectors:
        key, index = vectors[name]; node[key][index] = value
    elif name in fields: node[fields[name]] = value
    elif name == 'alpha': node['color'][3] = round(value * 255)
    elif name in ('color', 'color_add'):
        node['color' if name == 'color' else 'add_color'] = [(value >> (8 * i)) & 255 for i in range(4)]
    elif name.startswith('matTagInfo.tagsInfo.normal.'):
        # 标签中的默认颜色与直接属性是同一份值，标签不覆盖实例的主动修改。
        pass
    else: raise ValueError('未支持 prefab 引用覆盖字段 ' + name)


@lru_cache(None)
def _load(path, stack=()):
    canonical = str(source.resolve(path))
    if canonical in stack: raise ValueError('循环 prefab 引用 ' + path)
    stack = (*stack, canonical)
    root = prefab_bin.parse(source.resolve(path).read_bytes())

    def expand(node):
        for component in node['components']:
            if component['class'] == 'comp_prefab':
                replacement = copy.deepcopy(_load(component['path'], stack))
                for target, diff in component['tags'].items():
                    found = replacement if target == node['name'] else next((n for n in walk(replacement) if n['name'] == target), None)
                    if found is None: raise ValueError('prefab 覆盖目标不存在 ' + target)
                    for key, value in diff['infos'].items(): override(found, key, value)
                replacement['name'] = node['name']
                return replacement
        node['children'] = [expand(child) for child in node.get('children', [])]
        for c in node['components']:
            if c['class'] == 'comp_timeline' and c['path']:
                timeline = timeline_bin.parse(source.resolve(c['path']).read_bytes())
                duration = max((k['time'] + k['duration'] for n in timeline['nodes'] for clip in n['clips'] for k in clip['keys']), default=0)
                node['timeline'] = {'duration': duration, 'offset': c['offsetTime'], 'speed': c['speed'], 'loops': c['loopTimes']}
                for track in timeline['nodes']:
                    target = node
                    for name in track['path'].split('/')[1:]:
                        target = next((n for n in target['children'] if n['name'] == name), None)
                        if target is None: raise ValueError('timeline 目标不存在 ' + track['path'])
                    target['tracks'] = track['clips']
                    for clip in track['clips']:
                        if clip['class'] == 'ctrl_clip':
                            for key in clip['keys']:
                                props = key['props']
                                if props.get('type', 'EventPlayTimeline') != 'EventPlayTimeline': raise ValueError('未支持 timeline 事件 ' + str(props))
                                child = copy.deepcopy(_load(props['path'], stack))
                                child['event'] = {'start': key['time'], 'duration': key['duration'], **props}
                                target['children'].append(child)
        return node
    return expand(root)


def load(path):
    return copy.deepcopy(_load(path))
