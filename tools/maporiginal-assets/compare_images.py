#!/usr/bin/env python3
"""Compare identical-backend, camera/time-aligned PNGs plus mandatory local ROIs.
Thresholds are in 8-bit channel units; compression uses a separate acceptance policy.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def compare(before, after, rois, max_mae=1, delta=8, max_bad_fraction=.001):
    if before.shape != after.shape or before.ndim != 3 or before.shape[2] != 4:
        raise ValueError("matching RGBA images required")
    if not rois:
        raise ValueError("at least one local ROI is required; backgrounds must not dilute errors")
    height, width, _ = before.shape
    results = []
    for name, (x, y, w, h) in [("whole", (0, 0, width, height)), *rois]:
        if min(w, h) <= 0 or min(x, y) < 0 or x+w > width or y+h > height:
            raise ValueError(f"invalid ROI: {name}")
        difference = np.abs(before[y:y+h, x:x+w].astype(np.int16) - after[y:y+h, x:x+w].astype(np.int16))
        mae = float(difference.mean())
        fraction = float(np.mean(np.any(difference > delta, axis=2)))
        results.append({"name": name, "rect": [x, y, w, h], "mae8bit": mae,
                        "badPixelFraction": fraction, "maxDelta8bit": int(difference.max()),
                        "pass": mae <= max_mae and fraction <= max_bad_fraction})
    return {"pass": all(r["pass"] for r in results), "regions": results,
            "threshold": {"maxMae8bit": max_mae, "pixelDelta8bit": delta, "maxBadPixelFraction": max_bad_fraction}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True, type=Path)
    parser.add_argument("--after", required=True, type=Path)
    parser.add_argument("--roi", action="append", required=True, help="name:x,y,width,height in PNG pixels (repeatable)")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    rois = []
    for raw in args.roi:
        name, rect = raw.split(":", 1)
        numbers = tuple(map(int, rect.split(",")))
        if len(numbers) != 4:
            parser.error("ROI must have four coordinates")
        rois.append((name, numbers))
    arrays = [np.asarray(Image.open(p).convert("RGBA")) for p in (args.before, args.after)]
    result = compare(*arrays, rois)
    result["inputs"] = [{"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in (args.before, args.after)]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"report": str(args.out), "pass": result["pass"]}))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
