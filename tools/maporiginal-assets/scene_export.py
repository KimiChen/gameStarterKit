"""完整节点图导出；遇到尚未实现的语义就拒绝，不能静默掉件/换级。"""
from build_tops import normalize
from prefab_scene import walk


def textures(root):
    found = set()
    for n in walk(root):
        found.update(normalize(p) for p in [n.get('texture', ''), *n.get('frames', [])] if p)
        for t in n.get('tracks', []):
            if t['type'] == 5:
                found.update(normalize(k['value']) for k in t['keys'] if k['value'])
    return found


def compile_node(n, cell_of):
    if n['class'] not in ('node_2d', 'sprite_2d', 'frame_sprite_2d'): raise ValueError(n['class'])
    if n['blendMode'] != 0: raise ValueError('未支持的 blendMode')
    if not n['inheritColor'] or not n['inheritAlpha'] or not n['child_to_pivot']: raise ValueError('未支持的继承模式')
    if any(abs(a) > 0.001 for a in n['angle'][:2]): raise ValueError('非 2D 旋转')
    def cell(path): return cell_of[normalize(path)] if path else -1
    out = dict(name=n['name'], position=n['position'][:2], scale=n['scale'][:2], angle=n['angle'][2],
               size=n['size'], pivot=n['pivot'], skew=n['skew'], mirror=[n['mirror_x'], n['mirror_y']],
               color=n['color'], add=n['add_color'], z=n['high_z'] * 65536 + n['low_z'],
               texture=cell(n.get('texture', '')), children=[compile_node(c, cell_of) for c in n['children']])
    if n.get('frames'):
        if n['frameDuration'] <= 0: raise ValueError('非法 frameSprite 周期')
        if n['frameLoops'] != -1: raise ValueError('非循环 frameSprite')
        out.update(frames=[cell(p) for p in n['frames']], frameStart=n['frameStart'], frameDuration=n['frameDuration'])
    if 'timeline' in n: out['timeline'] = n['timeline']
    if 'event' in n: out['event'] = {k: n['event'][k] for k in ('start', 'duration')}
    tracks = []
    for t in n.get('tracks', []):
        if t['class'] == 'ctrl_clip': continue  # 外挂子件已展开为 children + event。
        if t['type'] not in (0, 1, 2, 3, 4, 5, 12, 13): raise ValueError('未知轨道 ' + str(t['type']))
        keys = []
        for k in t['keys']:
            props = k['props']
            if props.get('easing', 0) != 0 or any(any(props.get(b, [0, 0, 0])) for b in ('bez_in', 'bez_out')):
                raise ValueError('非线性轨道需扩展')
            keys.append({'time': k['time'], 'value': cell(k['value']) if t['type'] == 5 else k['value'],
                         'tween': bool(props.get('isTween', k['flags'] == 1)) and t['type'] != 5})
        tracks.append({'type': t['type'], 'keys': keys})
    if tracks: out['tracks'] = tracks
    return out
