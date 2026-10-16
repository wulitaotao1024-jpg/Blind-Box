#!/usr/bin/env python3
"""把 public/ip/*.jpg 抠背景生成同名 .png（透明）。
用法: python tools/remove_bg.py
依赖: rembg, pillow
"""
import os, glob, sys
from PIL import Image
from rembg import remove, new_session

SESSION = new_session("u2net")  # 模型已在本地 .u2net/（U2NET_HOME 指定）

SRC = os.path.join(os.path.dirname(__file__), "..", "public", "ip")
src = os.path.abspath(SRC)
files = sorted(glob.glob(os.path.join(src, "*.jpg")))
if not files:
    print("no jpg found")
    sys.exit(1)

for f in files:
    out = os.path.splitext(f)[0] + ".png"
    im = Image.open(f).convert("RGB")
    # rembg 抠图（session 必须用关键字传，第二个位置参数是 alpha_matting）
    res = remove(im, session=SESSION)
    res.save(out)
    print("saved", out, res.size)
print("done")
