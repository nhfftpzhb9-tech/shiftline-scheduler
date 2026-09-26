"""Render Shiftline's small PWA icon set using only Python's standard library."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCALE = 4


def render(size: int) -> bytes:
    side = size * SCALE
    factor = side / 512
    background = (38, 51, 77, 255)
    canvas = bytearray(background * (side * side))

    def paint_round_rect(x: int, y: int, width: int, height: int, radius: int, color: tuple[int, int, int, int]) -> None:
        left = max(0, int(x * factor))
        top = max(0, int(y * factor))
        right = min(side, int((x + width) * factor))
        bottom = min(side, int((y + height) * factor))
        radius_px = radius * factor
        rgba = bytes(color)
        for py in range(top, bottom):
            cy = (py + 0.5) / factor
            for px in range(left, right):
                cx = (px + 0.5) / factor
                dx = max(x + radius - cx, 0, cx - (x + width - radius))
                dy = max(y + radius - cy, 0, cy - (y + height - radius))
                if dx * dx + dy * dy <= radius * radius:
                    offset = (py * side + px) * 4
                    canvas[offset : offset + 4] = rgba

    def paint_rect(x: int, y: int, width: int, height: int, color: tuple[int, int, int, int]) -> None:
        left, top = int(x * factor), int(y * factor)
        right, bottom = int((x + width) * factor), int((y + height) * factor)
        row = bytes(color) * (right - left)
        for py in range(top, bottom):
            offset = (py * side + left) * 4
            canvas[offset : offset + len(row)] = row

    def rounded_top(x: int, y: int, width: int, height: int, radius: int, color: tuple[int, int, int, int]) -> None:
        paint_round_rect(x, y, width, height, radius, color)
        paint_rect(x, y + radius, width, height - radius, color)

    paint_round_rect(84, 104, 344, 320, 54, (255, 255, 255, 255))
    rounded_top(84, 104, 344, 110, 54, (52, 68, 97, 255))
    paint_round_rect(158, 84, 28, 70, 14, (247, 249, 251, 255))
    paint_round_rect(326, 84, 28, 70, 14, (247, 249, 251, 255))
    paint_round_rect(126, 247, 76, 48, 16, (105, 184, 173, 255))
    paint_round_rect(218, 247, 166, 48, 16, (233, 238, 243, 255))
    paint_round_rect(126, 319, 166, 48, 16, (233, 238, 243, 255))
    paint_round_rect(308, 319, 76, 48, 16, (231, 181, 109, 255))

    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            sums = [0, 0, 0, 0]
            for sy in range(SCALE):
                for sx in range(SCALE):
                    source_x = x * SCALE + sx
                    source_y = y * SCALE + sy
                    offset = (source_y * side + source_x) * 4
                    for channel in range(4):
                        sums[channel] += canvas[offset + channel]
            row.extend(value // (SCALE * SCALE) for value in sums)
        rows.append(bytes(row))

    def chunk(kind: bytes, data: bytes) -> bytes:
        payload = kind + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    image_data = zlib.compress(b"".join(rows), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", image_data)
        + chunk(b"IEND", b"")
    )


for dimension, filename in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
    (ROOT / "public" / filename).write_bytes(render(dimension))
