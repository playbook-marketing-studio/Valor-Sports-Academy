"""Valor photo grade: kill the yellow gym cast, clean whites, cooler shadows, gentle contrast, light sharpen.
Usage: grade.py <in_dir_or_file>... --out <dir> [--long 2160]"""
import sys, os, glob, subprocess, tempfile
import numpy as np
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

def srgb_to_lin(x): return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(x): return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - 0.055)

def grade(im):
    a = np.asarray(im.convert("RGB")).astype(np.float32) / 255.0
    lin = srgb_to_lin(a)
    # 1. white balance from the bright neutral-ish pixels (walls/ceiling), pulled 85% toward neutral
    lum = lin.mean(axis=2)
    mask = (lum > np.percentile(lum, 80)) & (lum < 0.98)
    ref = lin[mask].mean(axis=0) if mask.sum() > 500 else lin.reshape(-1, 3).mean(axis=0)
    gain = ref.mean() / ref
    gain = 1 + 0.85 * (gain - 1)
    lin = lin * gain
    # 2. gentle S-curve contrast in linear light + slight lift of blacks back
    x = np.clip(lin, 0, 1)
    x = x ** 1.06
    s = x - 0.5
    x = 0.5 + s * (1 + 0.18 * (1 - 4 * s * s))
    x = np.clip(x, 0, 1)
    # 3. cool the shadows slightly (Valor = red/black, not amber)
    w = np.clip(1 - x.mean(axis=2, keepdims=True) * 2.2, 0, 1)
    x = x + w * np.array([-0.006, 0.0, 0.012], dtype=np.float32)
    x = np.clip(x, 0, 1)
    out = (lin_to_srgb(x) * 255).round().astype(np.uint8)
    im2 = Image.fromarray(out)
    # 4. tame yellows a touch, keep reds punchy
    hsv = np.asarray(im2.convert("HSV")).astype(np.float32)
    h, s_, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    yellow = np.exp(-((h - 42) ** 2) / (2 * 9 ** 2))  # PIL hue 0-255; 42 ~ yellow
    s_ = s_ * (1 - 0.22 * yellow)
    red = np.exp(-((np.minimum(h, 255 - h)) ** 2) / (2 * 10 ** 2))
    s_ = s_ * (1 + 0.10 * red)
    hsv[..., 1] = np.clip(s_, 0, 255)
    im2 = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    im2 = ImageEnhance.Color(im2).enhance(0.97)
    im2 = im2.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=3))
    return im2

def main():
    args = sys.argv[1:]; out = args[args.index("--out") + 1]; long = int(args[args.index("--long") + 1]) if "--long" in args else 0
    srcs = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in ("--out", "--long"))]
    files = []
    for s in srcs:
        files += sorted(f for f in glob.glob(s + "/*") if f.lower().endswith((".jpg", ".jpeg", ".heic"))) if os.path.isdir(s) else [s]
    os.makedirs(out, exist_ok=True)
    for f in files:
        src = f
        if f.lower().endswith(".heic"):
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False).name
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "100", "-m", "/System/Library/ColorSync/Profiles/sRGB Profile.icc", f, "--out", tmp], check=True, capture_output=True)
            src = tmp
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        g = grade(im)
        if long and max(g.size) > long:
            r = long / max(g.size); g = g.resize((round(g.width * r), round(g.height * r)), Image.LANCZOS)
        g.save(os.path.join(out, os.path.basename(f).rsplit(".", 1)[0] + ".jpg"), quality=92, subsampling=1, optimize=True)
        print(os.path.basename(f))

if __name__ == "__main__": main()
