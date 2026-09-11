#!/usr/bin/env python3
"""装饰图集 icon 从原版 view prefab 提取（DisplayPath 链，拒绝手工框选）。

链路：EntityClassId → entity_map_display.csv DisplayPath → Assets/Prefabs/<DisplayPath>.prefab
→ view prefab 子树 SpriteRenderer（层 18 主件，排除 shadow/dot/UI）→ sprite PNG → 图集格。
多 sprite 组合（如传送门 behind+1+2+3）按 SortingOrder 升序叠加合成；尺寸按 PPU 统一（48px/格 世界观）。

用法：extract-decorations.py <mapId>
输出：out/<mapId>/decoration-atlas.png（tree 格仍用各国 object 真树，config atlas.tree）
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, zjcs

sys.path.insert(0, "/Volumes/KimData/apksource/sourceVersion/zjcs-1.2.6/scripts")
import render_map_full as R  # noqa: E402  复用 bundle 装载与 sprite_image

CELL = 512
# 每 kind 的原版代表（DisplayPath；tree 走 object 目录非实体）
REPRESENTATIVES = {
    "chest": "Map/Common/EntityDisplaysWorldBonusExplore/8200_view",      # 小宝箱
    "portal": "Map/Map_14/EntityDisplays/WorldDoor/8628_14_view",          # 传送门
    "stele": "Map/Map_11/EntityDisplays/WorldBuilding/6330_11_view",       # 古要塞
    "crystal": "Map/Common/EntityDisplaysWorldBonusTap/8007_view",         # 宝石矿-小
    "sword": "Map/Map_17/EntityDisplays/WorldGamePlay/6541_17_view",       # WorldGamePlay 玩法件
}


def bundle_of(display_path: str):
    """DisplayPath → bundle 子串（去尾件名、小写去斜杠）。"""
    directory = display_path.rsplit("/", 1)[0]
    return directory.lower().replace("/", "_")


def find_view_root(env, root_name: str):
    for key, go in env.gos.items():
        if go.get("m_Name") == root_name:
            return key
    return None


def collect_sprites(env, go_key, is_root=False):
    """view 子树显示主件（active=True）：SpriteRenderer 取 sprite；Spine（MeshRenderer）取材质 _MainTex 纹理。
    排除 shadow/dot/UI/隐藏兜底 icon（原版显示主体为 Spine 时静态 icon 仅兜底隐藏，不收）。"""
    EXCLUDE = ("shadow", "dot", "bg", "slider", "mask", "prohibit", "durationtip")
    fname, pid = go_key
    go = env.gos[go_key]
    out = []
    tr = None
    if not is_root and not go.get("m_IsActive", True):
        return out
    for comp in go.get("m_Component", []):
        cref = comp.get("component") or comp.get("m_Component") or {}
        obj = env.by_file.get(fname, {}).get(cref.get("m_PathID", 0))
        if obj is None:
            continue
        if obj.type.name == "Transform":
            tr = obj
        elif obj.type.name == "SpriteRenderer":
            if not go.get("m_IsActive", True):
                continue
            name = go.get("m_Name", "").lower()
            t = obj.read_typetree()
            sp = t.get("m_Sprite", {})
            sp_obj = env.resolve(fname, sp.get("m_FileID", 0), sp.get("m_PathID", 0))
            sp_name = ""
            if sp_obj is not None:
                try:
                    sp_name = sp_obj.read().m_Name.lower()
                except Exception:
                    sp_name = ""
            if any(k in name for k in EXCLUDE) or any(k in sp_name for k in EXCLUDE):
                continue
            img, ppu, pivot = env.sprite_image(fname, sp.get("m_FileID", 0), sp.get("m_PathID", 0))
            if img is not None:
                out.append({"name": go.get("m_Name", ""), "img": img, "ppu": ppu,
                            "order": t.get("m_SortingOrder", 0) or 0, "layer": t.get("m_SortingLayer", 0) or 0})
        elif obj.type.name == "MeshRenderer" and go.get("m_IsActive", True):
            name = go.get("m_Name", "").lower()
            if any(k in name for k in EXCLUDE):
                continue
            t = obj.read_typetree()
            for mref in t.get("m_Materials", []):
                mat = env.resolve(fname, mref.get("m_FileID", 0), mref.get("m_PathID", 0))
                if mat is None or mat.type.name != "Material":
                    continue
                mt = mat.read_typetree()
                for entry in mt.get("m_SavedProperties", {}).get("m_TexEnvs", []):
                    key_name = entry[0] if isinstance(entry, (list, tuple)) else None
                    if key_name not in ("_MainTex", "_BaseMap"):
                        continue
                    holder = entry[1] if isinstance(entry, (list, tuple)) and len(entry) > 1 else {}
                    tex_ref = holder.get("m_Texture", {}) if isinstance(holder, dict) else {}
                    pid2 = tex_ref.get("m_PathID", 0)
                    tex = env.resolve(fname, tex_ref.get("m_FileID", 0), pid2)
                    if tex is None:
                        # m_FileID 语义漂移兜底：全 env 按 path_id 找 Texture2D/Sprite
                        hits = [o for objs in env.by_file.values() for p2, o in objs.items()
                                if p2 == pid2 and o.type.name in ("Texture2D", "Sprite")]
                        tex = hits[0] if hits else None
                    if tex is not None and tex.type.name in ("Texture2D", "Sprite"):
                        try:
                            img = tex.read().image
                            out.append({"name": f"{go.get('m_Name', '')}#spine", "img": img.convert("RGBA"),
                                        "ppu": 168.0, "order": 0, "layer": 18})
                            break
                        except Exception:
                            pass
                if out:
                    break
    if tr is not None:
        for ch in tr.read_typetree().get("m_Children", []):
            ctr = env.trs.get((fname, ch.get("m_PathID", 0)))
            if ctr:
                child_key = (fname, ctr["m_GameObject"]["m_PathID"])
                if child_key in env.gos:
                    out += collect_sprites(env, child_key)
    return out


def compose(sprites, target_ppu=168.0):
    """多 sprite 按 (order, 名字) 叠加合成一张；PPU 统一到 target_ppu 的世界尺寸。"""
    if not sprites:
        return None
    sprites = sorted(sprites, key=lambda s: (s["order"], s["name"]))
    scaled = []
    for s in sprites:
        scale = s["ppu"] / target_ppu if s["ppu"] else 1.0
        w, h = max(1, round(s["img"].size[0] * scale)), max(1, round(s["img"].size[1] * scale))
        img = s["img"] if (w, h) == s["img"].size else s["img"].resize((w, h), Image.LANCZOS)
        scaled.append({**s, "img": img})
    width = max(s["img"].size[0] for s in scaled)
    height = sum(s["img"].size[1] for s in scaled) if len(scaled) > 1 else scaled[0]["img"].size[1]
    # 简化：多件的按最大宽叠放（层叠对齐中心底）
    height = max(s["img"].size[1] for s in scaled)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for s in scaled:
        canvas.alpha_composite(s["img"], ((width - s["img"].size[0]) // 2, height - s["img"].size[1]))
    return canvas


def crop_to_cell(img: Image.Image) -> Image.Image:
    scale = min(CELL * 0.84 / img.size[0], CELL * 0.84 / img.size[1])
    piece = img.resize((max(1, round(img.size[0] * scale)), max(1, round(img.size[1] * scale))), Image.LANCZOS)
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.paste(piece, ((CELL - piece.size[0]) // 2, (CELL - piece.size[1]) // 2), piece)
    return cell


def main() -> None:
    map_id = sys.argv[1]
    cfg = load_config()
    mc = map_config(cfg, map_id)
    have = json.load(open(R.MAP_BUNDLES))
    dev = R.parse_manifest(R.DEV_MAN)
    out_dir = Path(__file__).resolve().parent / "out" / map_id

    # kind 顺序与契约一致（tree 用各国 object 真树，非实体）
    atlas_cfg = mc.get("atlas") or {}
    kinds = ["tree", "chest", "portal", "stele", "crystal", "sword"]
    atlas = Image.new("RGBA", (CELL * 3, CELL * 2), (0, 0, 0, 0))

    for index, kind in enumerate(kinds):
        if kind == "tree":
            spec = atlas_cfg.get("tree")
            if spec:
                src = zjcs(cfg, "yoo-assets", "map-assets", "Assets", spec["src"])
                img = Image.open(src).convert("RGBA")
                if spec.get("box"):
                    img = img.crop(tuple(spec["box"]))
                cell = crop_to_cell(img)
            else:
                continue
        else:
            display_path = REPRESENTATIVES[kind]
            bundle = R.bundle_files(bundle_of(display_path), have, dev)
            if not bundle:
                raise SystemExit(f"{kind}: bundle 未找到（{display_path}）")
            env = R.Env(bundle)
            root_name = display_path.rsplit("/", 1)[1]
            root = find_view_root(env, root_name)
            if root is None:
                raise SystemExit(f"{kind}: view 根 {root_name} 未找到")
            sprites = collect_sprites(env, root, is_root=True)
            img = compose(sprites)
            if img is None:
                raise SystemExit(f"{kind}: {root_name} 无层 18 主 sprite")
            cell = crop_to_cell(img)
            print(f"  {kind}: {root_name} → {len(sprites)} sprite 合成 {img.size}")
        atlas.paste(cell, (index % 3 * CELL, index // 3 * CELL))
    atlas.save(out_dir / "decoration-atlas.png")
    print(f"{map_id}: decoration-atlas.png（view prefab 提取）→ {out_dir}")


if __name__ == "__main__":
    main()
