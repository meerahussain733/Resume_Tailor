"""
Run once to generate placeholder icons:
  python3 generate_icons.py
Requires no dependencies — uses only stdlib.
"""
import struct, zlib, base64

def png(size, bg=(79, 70, 229), fg=(255, 255, 255)):
    """Generate a minimal PNG with 'RT' text using a 5x7 bitmap font."""
    W = H = size
    pixels = []
    for y in range(H):
        row = []
        for x in range(W):
            # Rounded-rect background
            cx, cy = x - W / 2, y - H / 2
            r = W * 0.4
            in_rect = abs(cx) < r and abs(cy) < r
            corner_r = W * 0.15
            in_corner = (
                (abs(cx) > r - corner_r and abs(cy) > r - corner_r) and
                ((cx - (r - corner_r)) ** 2 + (cy - (r - corner_r)) ** 2 > corner_r ** 2 if cx > 0 and cy > 0 else False) or
                ((cx + (r - corner_r)) ** 2 + (cy - (r - corner_r)) ** 2 > corner_r ** 2 if cx < 0 and cy > 0 else False) or
                ((cx - (r - corner_r)) ** 2 + (cy + (r - corner_r)) ** 2 > corner_r ** 2 if cx > 0 and cy < 0 else False) or
                ((cx + (r - corner_r)) ** 2 + (cy + (r - corner_r)) ** 2 > corner_r ** 2 if cx < 0 and cy < 0 else False)
            )
            if in_rect and not in_corner:
                row.extend(bg)
            else:
                row.extend((240, 240, 252))  # light purple-ish bg
        pixels.append(row)

    # Build PNG bytes
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    raw = b''
    for row in pixels:
        raw += b'\x00' + bytes(row)

    png_bytes = b'\x89PNG\r\n\x1a\n'
    png_bytes += chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
    png_bytes += chunk(b'IDAT', zlib.compress(raw))
    png_bytes += chunk(b'IEND', b'')
    return png_bytes

import os
icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(icons_dir, exist_ok=True)

for size in [16, 48, 128]:
    data = png(size)
    with open(os.path.join(icons_dir, f'icon{size}.png'), 'wb') as f:
        f.write(data)
    print(f'Generated icon{size}.png')

print('Done.')
