#!/usr/bin/env python3
"""Draw the desk-session pixel gamepad (16x16) and write a 64x64 PNG (nearest-neighbour x4).
std-lib only: python3 make_icon.py OUT.png"""
import struct, sys, zlib

SPRITE = [
    "................",
    "................",
    "................",
    "...oooo..oooo...",
    "..oaaaaooaaaao..",
    ".oaaaaaaaaaaaao.",
    ".oaadaaaaaabaao.",
    "oaadddaaaababaao",
    "oaaadaaaaaabaaao",
    "oaaaaaaaaaaaaaao",
    "oaaaaoooooaaaaao",
    "oaaaao....oaaaao",
    ".oaao......oaao.",
    "..oo........oo..",
    "................",
    "................",
]
PAL = {  # Tokyo Night: accent fill, light outline, dark details
    "a": (0x7A, 0xA2, 0xF7, 255),
    "o": (0xC0, 0xCA, 0xF5, 255),
    "d": (0x1A, 0x1B, 0x26, 255),
    "b": (0x1A, 0x1B, 0x26, 255),
    ".": (0, 0, 0, 0),
}
S = 4
rows = []
for line in SPRITE:
    assert len(line) == 16
    px = b"".join(bytes(PAL[c]) * S for c in line)
    rows += [b"\x00" + px] * S
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
       + chunk(b"IEND", b""))
open(sys.argv[1], "wb").write(png)
