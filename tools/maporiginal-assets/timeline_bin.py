"""与 prefab 同序列化器的 timeline：严格消费对象块，不跳过动画轨道。"""
from prefab_bin import R, read_value


def properties(r):
    result = {}
    for _ in range(r.u32()):
        key = r.s()
        result[key] = read_value(r)
    return result


def block(r):
    cls = r.s()
    end = r.u32() + r.o
    version = r.u16()
    item = {'class': cls, 'version': version}
    if cls == 'timeline_node':
        item['path'] = r.s()
        item['clips'] = [block(r) for _ in range(r.u32())]
    elif cls in ('ctrl_clip', 'attr_ani_clip'):
        item['type'] = r.u32()
        if cls == 'attr_ani_clip': item['attr'] = r.u32()
        item['keys'] = [block(r) for _ in range(r.u32())]
    elif cls == 'clip_key':
        item['time'] = r.f32()
        item['duration'] = r.f32()
        item['value'] = read_value(r)
        item['flags'] = r.u16()
        item['props'] = properties(r)
    else: raise ValueError('未支持 timeline 对象 ' + cls)
    if r.o != end: raise ValueError('%s 残留 %d B' % (cls, end - r.o))
    return item


def parse(blob):
    r = R(blob)
    end = r.u32() + r.o
    result = {'version': r.u16(), 'name': r.s()}
    result['nodes'] = [block(r) for _ in range(r.u32())]
    if r.o != end or r.left(): raise ValueError('timeline 残留 %d B' % r.left())
    return result
