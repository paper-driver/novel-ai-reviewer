#!/usr/bin/env python3
import os
import subprocess
from PIL import Image

build_dir = 'build'
icon_png = os.path.join(build_dir, 'icon.png')

# Create .ico for Windows
try:
    img = Image.open(icon_png).convert('RGBA')
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img_list = [img.resize((s, s), Image.Resampling.LANCZOS) for s in [size[0] for size in sizes]]
    img_list[0].save(os.path.join(build_dir, 'icon.ico'), format='ICO', sizes=sizes)
    print("OK: Created icon.ico (Windows)")
except Exception as e:
    print(f"ERROR: {e}")

# Create .icns for macOS using magick
try:
    result = subprocess.run(
        ['magick', icon_png, os.path.join(build_dir, 'icon.icns')],
        capture_output=True,
        text=True,
        timeout=10
    )
    if result.returncode == 0:
        print("OK: Created icon.icns (macOS)")
    else:
        print(f"ERROR: ICNS creation failed: {result.stderr}")
except Exception as e:
    print(f"ERROR: ICNS creation error: {e}")

# Verify files
print("\nIcon files ready:")
for f in ['icon.png', 'icon.ico', 'icon.icns']:
    path = os.path.join(build_dir, f)
    if os.path.exists(path):
        print(f"  ✓ {f}")
