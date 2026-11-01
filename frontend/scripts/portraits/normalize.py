#!/usr/bin/env python3
"""Face-anchored, alpha-preserving portrait calibration and batch processing.

All boxes are [left, top, right, bottom], in EXIF-oriented source pixels.
The affine transform maps original source coordinates to output coordinates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageOps


MODEL_URL = ("https://huggingface.co/deepghs/anime_face_detection/resolve/"
             "main/face_detect_v1.4_s/model.onnx")
MODEL_SHA256 = "403b5bc93b6ff789b7d183418df4a1364049bac00c24acd927604a7ff6891483"
HERE = Path(__file__).resolve().parent
PAPER = "#FFF8EC"
INK = "#493B2C"
FACE = "#D78935"
TARGET = "#5B6A8C"


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2,
                                    allow_nan=False) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_image(path):
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGBA")


def composite(image):
    paper = Image.new("RGBA", image.size, PAPER)
    paper.alpha_composite(image)
    return paper.convert("RGB")


def output_size(config):
    """Choose a raster budget from CSS height; round the canvas, never stretch art."""
    w, h = config["output"]["width"], config["output"]["height"]
    density = config["output"].get("pixel_ratio")
    if density is None:
        return w, h
    scale = min(1., config["display"]["height"] * density / h)
    return max(1, round(w*scale)), max(1, round(h*scale))


def encode(image, destination, config):
    if config["format"] == "webp":
        image.save(destination, format="WEBP", lossless=False,
                   quality=config["quality"], method=config["method"],
                   alpha_quality=100)
    else:
        image.save(destination, format="PNG")


def box(value, size, name="bbox"):
    a = np.asarray(value, dtype=float)
    if a.shape != (4,) or not np.isfinite(a).all():
        raise ValueError(f"{name}: expected four finite xyxy coordinates")
    l, t, r, b = a.tolist()
    if not (0 <= l < r <= size[0] and 0 <= t < b <= size[1]):
        raise ValueError(f"{name}: outside image {size} or empty: {value}")
    return a.tolist()


def center(b):
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]


def map_box(b, scale, tx, ty):
    return [b[0] * scale + tx, b[1] * scale + ty,
            b[2] * scale + tx, b[3] * scale + ty]


def nms(candidates, threshold):
    pending = sorted(candidates, key=lambda c: -c["confidence"])
    kept = []
    while pending:
        best = pending.pop(0)
        kept.append(best)
        a = best["bbox"]
        def overlap(c):
            b = c["bbox"]
            intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(
                0, min(a[3], b[3]) - max(a[1], b[1]))
            union = ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection)
            return intersection / union
        pending = [c for c in pending if overlap(c) <= threshold]
    return kept


class Detector:
    def __init__(self, path, config):
        self.path = Path(path)
        self.config = config
        self.session = None

    def detect(self, image):
        if self.session is None:
            import onnxruntime as ort
            ort.disable_telemetry_events()
            if not self.path.is_file():
                raise ValueError(f"Detector model missing: {self.path}; use --fetch-model")
            if sha256(self.path) != MODEL_SHA256:
                raise ValueError(f"Detector checksum mismatch: {self.path.name}")
            options = ort.SessionOptions()
            options.intra_op_num_threads = self.config["threads"]
            options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(str(self.path), sess_options=options,
                                               providers=["CPUExecutionProvider"])
        edge = self.config["input_size"]
        ratio = edge / max(image.size)
        w, h = [max(1, round(v * ratio)) for v in image.size]
        left, top = (edge - w) // 2, (edge - h) // 2
        # Composite only the detector input. Output is always sampled from RGBA.
        pixels = np.full((edge, edge, 3), 114, dtype=np.uint8)
        pixels[top:top+h, left:left+w] = np.asarray(
            composite(image).resize((w, h), Image.Resampling.BILINEAR))
        tensor = np.ascontiguousarray(pixels.transpose(2, 0, 1)[None], dtype=np.float32) / 255
        prediction = self.session.run(None, {self.session.get_inputs()[0].name: tensor})[0]
        if prediction.ndim != 3 or prediction.shape[1] != 5:
            raise ValueError(f"Unexpected detector output: {prediction.shape}")
        candidates = []
        for x, y, bw, bh, confidence in prediction[0].T:
            if not np.isfinite([x, y, bw, bh, confidence]).all():
                continue
            if confidence < self.config["candidate_threshold"]:
                continue
            # Use actual rounded letterbox dimensions when mapping back.
            b = [max(0., float((x-bw/2-left)*image.width/w)),
                 max(0., float((y-bh/2-top)*image.height/h)),
                 min(float(image.width), float((x+bw/2-left)*image.width/w)),
                 min(float(image.height), float((y+bh/2-top)*image.height/h))]
            if b[2] > b[0] and b[3] > b[1]:
                candidates.append({"bbox": b, "confidence": float(confidence)})
        return nms(candidates, self.config["nms_iou"])


def resolve_face(image, override, detector, config):
    if override.get("source_size") and list(image.size) != override["source_size"]:
        raise ValueError("Manual source_size does not match this image")
    manual = override.get("face_bbox")
    if manual is None and "face_center" in override:
        cx, cy = override["face_center"]
        h = override["face_height"]
        w = override.get("face_width", h)
        manual = [cx-w/2, cy-h/2, cx+w/2, cy+h/2]
    if manual is not None:
        return {"bbox": box(manual, image.size, "face_bbox"), "confidence": None,
                "manual_override": True, "candidates": [], "issue": None}
    candidates = detector.detect(image)
    result = {"bbox": candidates[0]["bbox"] if candidates else None,
              "confidence": candidates[0]["confidence"] if candidates else None,
              "manual_override": False, "candidates": candidates, "issue": None}
    if not candidates:
        result["issue"] = "no_face"
    elif candidates[0]["confidence"] < config["confidence_threshold"]:
        result["issue"] = "low_confidence"
    elif len(candidates) > 1 and candidates[1]["confidence"] >= config["ambiguity_threshold"]:
        result["issue"] = "multiple_faces"
    return result


def bottom_crop(image, config, override):
    """Only trim contiguous bottom rows; never remove dark clothing by segmentation."""
    if "crop_bbox" in override:
        b = box(override["crop_bbox"], image.size, "crop_bbox")
        if any(v != int(v) for v in b):
            raise ValueError("crop_bbox must use integer pixel edges")
        return list(map(int, b)), "manual", []
    a = np.asarray(image)
    transparent = a[:, :, 3] <= config["alpha_threshold"]
    near_black = (a[:, :, :3].max(axis=2) <= config["black_threshold"]) & ~transparent
    empty_rows = transparent.all(axis=1)
    black_rows = ((transparent | near_black).mean(axis=1) >= config["black_row_fraction"]) & (
        near_black.mean(axis=1) >= config["black_min_coverage"])
    bottom = image.height
    while bottom and empty_rows[bottom-1]:
        bottom -= 1
    transparent_end = bottom
    if config["trim_black"]:
        while bottom and (empty_rows[bottom-1] or black_rows[bottom-1]):
            bottom -= 1
        if transparent_end - bottom < config["black_min_rows"]:
            bottom = transparent_end
    if bottom == 0:
        raise ValueError("Source is entirely transparent or a uniform bottom band")
    if image.height - bottom > image.height * config["max_fraction"]:
        return [0, 0, image.width, transparent_end], "transparent", ["large_black_band_needs_crop_override"]
    reason = "black_and_transparent" if bottom < transparent_end else "transparent"
    return [0, 0, image.width, bottom], reason if bottom < image.height else "none", []


def geometry(face, target, size, crop, head, config):
    w, h = size
    cx, cy = center(face)
    x, y = target["center_x"] * w, target["center_y"] * h
    ideal = target["face_scale"] * h / (face[3] - face[1])
    scale = ideal
    warnings = []
    # Small secondary adjustment keeps face center exact while filling a short bottom gap.
    if crop[3] > cy:
        fill = (h - y) / (crop[3] - cy)
        if fill > scale:
            if fill <= ideal * (1 + config["bottom_fill_max_scale_change"]):
                scale = fill
            else:
                warnings.append("bottom_gap_requires_scale_tradeoff")
    if head is not None and config["head_policy"] == "shrink":
        distance = cy - head[1]
        if distance > 0:
            limit = (y - config["top_margin"] * h) / distance
            if 0 < limit < scale:
                scale = limit
                warnings.append("face_scale_reduced_for_head_safety")
    tx, ty = x - scale * cx, y - scale * cy
    fb = map_box(face, scale, tx, ty)
    if fb[0] < 0 or fb[1] < 0 or fb[2] > w or fb[3] > h:
        raise ValueError("Target geometry crops the face; adjust target position/scale")
    if head is not None and map_box(head, scale, tx, ty)[1] < config["top_margin"] * h:
        warnings.append("head_above_safety_margin")
    gap = max(0., h - (crop[3] * scale + ty))
    if gap > .5:
        warnings.append("bottom_gap")
    return {"scale": scale, "ideal_scale": ideal, "translate_x": tx, "translate_y": ty,
            "final_face_bbox": fb, "final_face_center": [x, y],
            "face_scale_relative_error": scale / ideal - 1,
            "bottom_gap_px": gap,
            "final_crop": {"canvas_bbox": [0, 0, w, h],
                           "source_window": [-tx/scale, -ty/scale, (w-tx)/scale, (h-ty)/scale]},
            "warnings": warnings}


def feather_geometry(crop, transform, size, feather):
    scale = transform["scale"]
    tx = transform["translate_x"]
    left = max(0., crop[0] * scale + tx)
    right = min(float(size[0]-1), crop[2] * scale + tx - 1)
    widths = [feather["left"] * size[0], feather["right"] * size[0]]
    face = transform.get("final_face_bbox")
    if feather.get("protect_face", False) and face:
        widths = [min(widths[0], max(0., face[0]-left)),
                  min(widths[1], max(0., right-face[2]))]
    return {"left_edge": left, "right_edge": right,
            "left_width": widths[0], "right_width": widths[1]}


def render(image, crop, transform, size, feather):
    scale = transform["scale"]
    tx, ty = transform["translate_x"], transform["translate_y"]
    # Premultiplied alpha avoids halos from hidden RGB in transparent pixels.
    source = image.crop(crop).convert("RGBa")
    mapped = source.transform(size, Image.Transform.AFFINE,
                              (1/scale, 0, -tx/scale-crop[0],
                               0, 1/scale, -ty/scale-crop[1]),
                              Image.Resampling.BICUBIC).convert("RGBA")
    # Fade both canvas edges and source-frame cuts that land inside the canvas.
    xs = np.arange(size[0], dtype=float)
    fade = feather_geometry(crop, transform, size, feather)
    mask = np.ones(size[0])
    for distance, width in [(xs-fade["left_edge"], fade["left_width"]),
                            (fade["right_edge"]-xs, fade["right_width"])]:
        if width > 0:
            ramp = np.clip(distance / width, 0, 1)
            mask *= ramp * ramp * (3 - 2 * ramp)
    alpha = np.asarray(mapped.getchannel("A"), dtype=float)
    mapped.putalpha(Image.fromarray(np.uint8(np.rint(alpha * mask[None, :]))))
    return mapped


def cross(draw, xy, color):
    x, y = xy
    draw.line((x-6, y, x+6, y), fill=color, width=2)
    draw.line((x, y-6, x, y+6), fill=color, width=2)


def debug_image(source, output, record, target, size):
    before = composite(source)
    d = ImageDraw.Draw(before)
    for candidate in record.get("candidates", []):
        d.rectangle(candidate["bbox"], outline=FACE, width=2)
    if record.get("face_bbox"):
        d.rectangle(record["face_bbox"], outline=FACE, width=2)
        cross(d, center(record["face_bbox"]), FACE)
    if record.get("source_crop"):
        d.rectangle(record["source_crop"], outline=TARGET, width=2)
    if record.get("final_crop"):
        d.rectangle(record["final_crop"]["source_window"], outline=INK, width=2)
    before.thumbnail(size)
    after = composite(output) if output else Image.new("RGB", size, PAPER)
    d = ImageDraw.Draw(after)
    x, y = target["center_x"]*size[0], target["center_y"]*size[1]
    fh = target["face_scale"]*size[1]
    fw = target["face_aspect"]*fh
    d.rectangle((x-fw/2, y-fh/2, x+fw/2, y+fh/2), outline=TARGET, width=2)
    cross(d, (x, y), TARGET)
    if record.get("final_face_bbox"):
        d.rectangle(record["final_face_bbox"], outline=FACE, width=1)
        cross(d, center(record["final_face_bbox"]), FACE)
    d.rectangle((0, 0, size[0]-1, size[1]-1), outline=INK, width=2)
    result = Image.new("RGB", (size[0]*2, size[1]+44), PAPER)
    result.paste(before, (0, 0))
    result.paste(after, (size[0], 0))
    d = ImageDraw.Draw(result)
    d.text((8, size[1]+3), "SOURCE / orange: face, blue: source crop, brown: canvas crop", fill=INK)
    d.text((size[0]+8, size[1]+3), "OUTPUT / blue: target, orange: face", fill=INK)
    d.text((8, size[1]+22), record["status"] + " " + ", ".join(record.get("warnings", [])), fill=INK)
    return result


def card_geometry(target, size, display):
    if not display:
        return None
    # Existing img: height:100%; width:auto; right:Npx; top:0.
    w, h = display["width"], display["height"]
    scale = h / size[1]
    left = w - display["right"] - size[0]*scale
    return {"center_x": (left+target["center_x"]*size[0]*scale)/w,
            "center_y": target["center_y"], "face_scale": target["face_scale"],
            "card_size": [w, h], "image_left": left, "image_scale": scale}


def calibrate(config, base, detector, overrides):
    rows = []
    for ref in config["references"]:
        if ref.get("space", "image") not in ("image", "card"):
            raise ValueError("Reference space must be image or card")
        path = (base / ref["path"]).resolve()
        image = load_image(path)
        # A screenshot may provide a card rectangle; annotation is local to that rectangle.
        if "card_bbox" in ref:
            image = image.crop(box(ref["card_bbox"], image.size, "card_bbox"))
        face = resolve_face(image, overrides.get("references", {}).get(ref["id"], {}),
                            detector, config["detector"])
        if face["issue"]:
            raise ValueError(f"Reference {ref['id']}: {face['issue']}; add reference override")
        b = face["bbox"]
        cx, cy = center(b)
        rows.append({"id": ref["id"], "path": ref["path"], "sha256": sha256(path),
                     "size": list(image.size), "face_bbox": b, "confidence": face["confidence"],
                     "manual_override": face["manual_override"], "space": ref.get("space", "image"),
                     "center_x": cx/image.width, "center_y": cy/image.height,
                     "face_scale": (b[3]-b[1])/image.height,
                     "face_aspect": (b[2]-b[0])/(b[3]-b[1])})
    fields = ["center_x", "center_y", "face_scale", "face_aspect"]
    if not rows and any(config["target"].get(k) is None for k in fields):
        raise ValueError("Supply references or all four explicit target fields")
    target = {k: float(np.median([r[k] for r in rows])) for k in fields} if rows else {}
    size = output_size(config)
    display = config.get("display")
    for r in rows:
        r["normalized_card"] = ({k: r[k] for k in fields[:3]} if r["space"] == "card" else
                                 card_geometry(r, r["size"], display))
    if rows and display:
        card_x = float(np.median([r["normalized_card"]["center_x"] for r in rows]))
        image_scale = display["height"] / size[1]
        left = display["width"] - display["right"] - size[0]*image_scale
        target["center_x"] = (card_x*display["width"] - left)/(size[0]*image_scale)
    target.update({k: v for k, v in config["target"].items() if v is not None})
    if (not all(math.isfinite(v) for v in target.values()) or
        not 0 < target["face_scale"] < 1 or not 0 < target["face_aspect"] or
        not all(0 <= target[k] <= 1 for k in ("center_x", "center_y"))):
        raise ValueError("Invalid normalized target geometry")
    result = {"method": "median_of_reference_faces_then_config_overrides",
            "references": rows, "target_canvas": target,
            "output_size": list(size),
            "target_card": card_geometry(target, size, config.get("display"))}
    return result


def contact_sheets(items, folder, config, prefix):
    columns, rows = config["columns"], config["rows"]
    thumb_w, thumb_h = config["width"], config["height"]
    for start in range(0, len(items), columns*rows):
        group = items[start:start+columns*rows]
        sheet = Image.new("RGB", (columns*thumb_w, math.ceil(len(group)/columns)*(thumb_h+36)), PAPER)
        d = ImageDraw.Draw(sheet)
        for index, (name, path, status) in enumerate(group):
            x, y = index % columns * thumb_w, index // columns * (thumb_h+36)
            if path:
                image = composite(load_image(path))
                image.thumbnail((thumb_w, thumb_h))
                sheet.paste(image, (x, y))
            d.text((x+5, y+thumb_h+2), name, fill=INK)
            d.text((x+5, y+thumb_h+17), status, fill=FACE if status != "ok" else INK)
        sheet.save(folder / f"{prefix}-{start//(columns*rows)+1:02d}.jpg", quality=90)


def safe_relative(value):
    p = Path(value)
    if p.is_absolute() or ".." in p.parts or not p.name:
        raise ValueError(f"Expected relative path without traversal: {value}")
    return p


def input_jobs(root, manifest, only, output_format="png"):
    if manifest:
        entries = read_json(manifest)
        jobs = [(safe_relative(name), safe_relative(source)) for name, source in entries.items()]
    else:
        jobs = [(p.relative_to(root).with_suffix(".png"), p.relative_to(root))
                for p in sorted(root.rglob("*"))
                if p.is_file() and p.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg")]
    jobs = [(name.with_suffix("." + output_format), source) for name, source in jobs]
    if only:
        wanted = set(only)
        jobs = [(name, p) for name, p in jobs if str(name) in wanted or name.stem in wanted or str(p) in wanted]
        matched = {v for name, p in jobs for v in [str(name), name.stem, str(p)]}
        if wanted - matched:
            raise ValueError(f"Unknown --only entries: {sorted(wanted-matched)}")
    names = [str(name).casefold() for name, _ in jobs]
    if len(names) != len(set(names)):
        raise ValueError("Output filename collision; use a manifest")
    for name, source in jobs:
        if name.suffix.lower() not in (".png", ".webp"):
            raise ValueError("Output must be PNG or WebP to preserve alpha")
        if not (root/source).resolve().is_relative_to(root.resolve()):
            raise ValueError("Input symlink escapes the source directory")
    if not jobs:
        raise ValueError("No input images found")
    return jobs


def batch(args, config, detector, overrides, calibration):
    root, out = Path(args.input).resolve(), Path(args.output).resolve()
    if root == out or root.is_relative_to(out) or out.is_relative_to(root):
        raise ValueError("Input and output must be separate, non-nested directories")
    jobs = input_jobs(root, args.manifest, args.only, config["output"]["format"])
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output directory must be empty (prevents stale or overwritten results)")
    out.mkdir(parents=True, exist_ok=True)
    images_dir = out / "images"
    images_dir.mkdir()
    debug_dir = out / "debug"
    if args.debug:
        debug_dir.mkdir()
    target = calibration["target_canvas"]
    size = output_size(config)
    metadata, sheets, debug_sheets, pending = {}, [], [], {}
    for name, source in jobs:
        key = str(source.as_posix())
        override = overrides.get("images", {}).get(key, {})
        record = {"source": key, "status": "error", "face_bbox": None, "confidence": None,
                  "manual_override": False, "scale": None, "translate_x": None,
                  "translate_y": None, "final_crop": None, "warnings": []}
        image, output = None, None
        try:
            image = load_image(root/source)
            record.update(source_size=list(image.size), source_sha256=sha256(root/source),
                          foreground_bbox=image.getchannel("A").getbbox())
            if override.get("source_sha256") and override["source_sha256"] != record["source_sha256"]:
                raise ValueError("Manual source_sha256 does not match this image")
            crop, reason, warnings = bottom_crop(image, config["bottom_trim"], override)
            record.update(source_crop=crop, bottom_trim_reason=reason, warnings=warnings,
                          crop_manual_override="crop_bbox" in override)
            face = resolve_face(image, override, detector, config["detector"])
            record.update(face_bbox=face["bbox"], confidence=face["confidence"],
                          manual_override=face["manual_override"], face_manual_override=face["manual_override"],
                          candidates=face["candidates"])
            if face["issue"]:
                record.update(status="needs_review", warnings=warnings+[face["issue"]])
            else:
                b = face["bbox"]
                if b[0] < crop[0] or b[1] < crop[1] or b[2] > crop[2] or b[3] > crop[3]:
                    raise ValueError("Source crop would remove part of the face")
                head = box(override["head_bbox"], image.size, "head_bbox") if "head_bbox" in override else None
                record["head_bbox"] = head
                transform = geometry(b, target, size, crop, head, config["safety"])
                record.update(transform)
                record["warnings"] = warnings + transform["warnings"]
                record["status"] = "warning" if record["warnings"] else "ok"
                record["feather"] = feather_geometry(crop, transform, size, config["feather"])
                output = render(image, crop, transform, size, config["feather"])
                destination = images_dir/name
                destination.parent.mkdir(parents=True, exist_ok=True)
                encode(output, destination, config["output"])
                record["output"] = (Path("images")/name).as_posix()
                record["output_size"] = list(size)
                record["output_bytes"] = destination.stat().st_size
                record["output_sha256"] = sha256(destination)
                # Preview the encoded deliverable, including lossy RGB compression.
                output = load_image(destination)
                record["normalized_card"] = card_geometry(
                    {**target, "face_scale": (b[3]-b[1])*record["scale"]/size[1]}, size, config.get("display"))
        except (ValueError, OSError, KeyError, TypeError) as exc:
            record.update(status="error", error=str(exc))
        metadata[name.as_posix()] = record
        if record["status"] != "ok":
            pending[key] = {"source_size": record.get("source_size"),
                            "source_sha256": record.get("source_sha256"),
                            "suggested_face_bbox": record.get("face_bbox"),
                            "reason": record.get("error", record["warnings"])}
        sheets.append((str(name), images_dir/name if output else None, record["status"]))
        if args.debug and image:
            path = debug_dir / name.with_suffix(".jpg")
            path.parent.mkdir(parents=True, exist_ok=True)
            debug_image(image, output, record, target, size).save(path, quality=90)
            debug_sheets.append((str(name), path, record["status"]))
        print(f"{record['status']:12} {name}", flush=True)
    write_json(out/"metadata.json", metadata)
    write_json(out/"calibration.json", calibration)
    write_json(out/"config-resolved.json", config)
    write_json(out/"review-queue.json", pending)
    # Suggestions deliberately do not become manual overrides until reviewed.
    contact_sheets(sheets, out, config["preview"], "contact-sheet")
    if args.debug:
        contact_sheets(debug_sheets, out, {**config["preview"], "width": 640, "height": 264,
                                         "columns": 2, "rows": 5}, "debug-sheet")
    statuses = [r["status"] for r in metadata.values()]
    counts = {key: statuses.count(key) for key in ("ok", "warning", "needs_review", "error")}
    byte_sizes = [r["output_bytes"] for r in metadata.values() if "output_bytes" in r]
    write_json(out/"summary.json", {"counts": counts, "model_sha256": MODEL_SHA256,
                                   "output_size": list(size), "format": config["output"]["format"],
                                   "encoding": config["output"],
                                   "total_bytes": sum(byte_sizes),
                                   "mean_bytes": sum(byte_sizes)/len(byte_sizes) if byte_sizes else 0,
                                   "max_bytes": max(byte_sizes, default=0)})
    print(json.dumps(counts), flush=True)
    return 2 if counts["needs_review"] or counts["error"] else 0


def validate(config):
    for field in ("width", "height"):
        v = config["output"][field]
        if type(v) is not int or not 16 <= v <= 8192:
            raise ValueError(f"output.{field} must be an integer in [16, 8192]")
    output = config["output"]
    if output["format"] not in ("webp", "png"):
        raise ValueError("output.format must be webp or png")
    if not 0 <= output["quality"] <= 100 or type(output["method"]) is not int or not 0 <= output["method"] <= 6:
        raise ValueError("WebP quality must be 0..100 and method an integer in 0..6")
    density = output.get("pixel_ratio")
    if density is not None:
        if not math.isfinite(density) or not .5 <= density <= 4 or not config.get("display"):
            raise ValueError("output.pixel_ratio requires display dimensions and a value in [0.5, 4]")
    for side in ("left", "right"):
        if not 0 <= config["feather"][side] < .5:
            raise ValueError("Feather widths must be fractions in [0, 0.5)")
    d = config["detector"]
    if not (0 < d["candidate_threshold"] <= d["ambiguity_threshold"] <= d["confidence_threshold"] <= 1):
        raise ValueError("Invalid detector thresholds")
    if d["input_size"] != 640 or not 1 <= d["threads"] <= 32:
        raise ValueError("Detector expects 640px input and 1..32 CPU threads")
    if config["safety"]["head_policy"] not in ("warn", "shrink"):
        raise ValueError("head_policy must be warn or shrink")
    if not 0 <= config["safety"]["top_margin"] < .5:
        raise ValueError("top_margin must be in [0, 0.5)")
    if not 0 <= config["safety"]["bottom_fill_max_scale_change"] <= .25:
        raise ValueError("bottom_fill_max_scale_change must be in [0, 0.25]")
    trim = config["bottom_trim"]
    if (not 0 <= trim["alpha_threshold"] <= 255 or
        not 0 <= trim["black_threshold"] <= 255 or
        not 0 < trim["black_row_fraction"] <= 1 or
        not 0 < trim["black_min_coverage"] <= 1 or
        not 0 < trim["max_fraction"] <= 1 or trim["black_min_rows"] < 1):
        raise ValueError("Invalid bottom trim settings")
    if not 0 < d["nms_iou"] < 1:
        raise ValueError("nms_iou must be in (0, 1)")
    if config.get("display"):
        if any(not math.isfinite(config["display"][k]) for k in ("width", "height", "right")):
            raise ValueError("Display dimensions must be finite")
        if config["display"]["width"] <= 0 or config["display"]["height"] <= 0:
            raise ValueError("Display dimensions must be positive")
    for k in ("columns", "rows", "width", "height"):
        if type(config["preview"][k]) is not int or config["preview"][k] <= 0:
            raise ValueError("Preview sizes must be positive integers")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=HERE/"config.json")
    parser.add_argument("--model", type=Path, default=HERE/"models/anime-face-v1.4-s.onnx")
    parser.add_argument("--fetch-model", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--overrides", type=Path)
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--calibrate-only", type=Path, metavar="JSON")
    args = parser.parse_args()
    if args.fetch_model:
        destination, url, checksum = args.model, MODEL_URL, MODEL_SHA256
        destination.parent.mkdir(parents=True, exist_ok=True)
        partial = destination.with_suffix(".download")
        try:
            with urllib.request.urlopen(url, timeout=60) as response, partial.open("wb") as f:
                while chunk := response.read(1024*1024):
                    f.write(chunk)
            if sha256(partial) != checksum:
                raise ValueError("Downloaded model checksum mismatch")
            partial.replace(destination)
        finally:
            partial.unlink(missing_ok=True)
        print(destination)
        return 0
    config = read_json(args.config)
    validate(config)
    overrides = read_json(args.overrides) if args.overrides else {"images": {}, "references": {}}
    detector = Detector(args.model, config["detector"])
    calibration = calibrate(config, args.config.resolve().parent, detector, overrides)
    if args.calibrate_only:
        write_json(args.calibrate_only, calibration)
        return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required for batch processing")
    return batch(args, config, detector, overrides, calibration)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
