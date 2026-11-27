"""Screenshots and touch input for a Kindle over SSH, for developing the plugin.

    python3 scripts/kindle.py shot out.png
    python3 scripts/kindle.py tap X Y
    python3 scripts/kindle.py hold X Y
    python3 scripts/kindle.py swipe X1 Y1 X2 Y2

Coordinates are framebuffer pixels. KINDLE_HOST is an ssh host, `kindle` by default.
Touches are played on the Kindle by touch.lua (uploaded on first use) so their timing survives ssh.
"""
import os
import struct
import subprocess
import sys
import time
import zlib

HOST = os.environ.get("KINDLE_HOST", "kindle")
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ControlMaster=auto", "-o", "ControlPath=/tmp/kindle-%r@%h",
       "-o", "ControlPersist=600", HOST]
TOUCH = "/dev/input/event1"
# Scratch space on the Kindle; its /tmp is RAM and filling it crashes the Kindle UI.
SCRATCH = "/mnt/us/lexeme-dev"
PLAYER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "touch.lua")


def screen():
    """The visible width and height, and the bytes per framebuffer row, which can be wider than the screen."""
    out = subprocess.run(SSH + ["cat /sys/class/graphics/fb0/modes /sys/class/graphics/fb0/stride"],
                         capture_output=True, text=True, check=True).stdout.split()
    # modes can list the same mode more than once; the stride comes last.
    width, height = out[0].split(":")[1].split("p")[0].split("x")
    return int(width), int(height), int(out[-1])


def shot(path):
    w, h, stride = screen()
    raw = subprocess.run(SSH + [f"dd if=/dev/fb0 bs={stride} count={h} 2>/dev/null"], capture_output=True,
                         check=True).stdout
    rows = b"".join(b"\x00" + raw[y * stride:y * stride + w] for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def event(kind, code, value):
    now = time.time()
    return struct.pack("<IIHHi", int(now), int((now % 1) * 1_000_000), kind, code, value)


# Shaped like the panel's own events, recorded from a real finger: tracking id 0, a contact size that grows,
# and a few frames of slight drift. Amazon's reader crashes on touches that go down and up in one frame.
def down(x, y):
    return event(3, 0x39, 0) + event(3, 0x35, x) + event(3, 0x36, y) + event(3, 0x30, 93) + event(0, 0, 0)


def move(x, y, size=234):
    return event(3, 0x35, x) + event(3, 0x36, y) + event(3, 0x30, size) + event(0, 0, 0)


def up():
    return event(3, 0x39, -1) + event(0, 0, 0)


def press(x, y, frames):
    steps = [(lambda: down(x, y), 0.012)]
    for i in range(1, frames + 1):
        # A finger drifts a little, but more than a few pixels turns a hold into a pan.
        drift = min(i // 3, 3)
        steps.append((lambda i=i, drift=drift: move(x + drift, y + drift, min(93 + 12 * i, 234)), 0.012))
    return steps + [(up, 0)]


def touch(steps):
    """Plays the frames on the Kindle itself, so ssh latency can't stretch a tap into a long press."""
    data = b""
    for make, pause in steps:
        frame = make()
        data += f"{int(pause * 1_000_000)} {len(frame)}\n".encode() + frame
    with open(PLAYER, "rb") as f:
        player = f.read()
    subprocess.run(SSH + [f"mkdir -p {SCRATCH} && cat > {SCRATCH}/touch.lua"], input=player, check=True)
    subprocess.run(SSH + [f"cat > {SCRATCH}/touch.bin && /mnt/us/koreader/luajit {SCRATCH}/touch.lua {SCRATCH}/touch.bin"],
                   input=data, check=True)


def main(cmd, *args):
    if cmd == "shot":
        shot(args[0])
        return
    nums = [int(a) for a in args]
    if cmd == "tap":
        touch(press(*nums, frames=11))
    elif cmd == "hold":
        touch(press(*nums, frames=100))
    elif cmd == "swipe":
        x1, y1, x2, y2 = nums
        n = 12
        path = [((lambda i=i: move(x1 + (x2 - x1) * i // n, y1 + (y2 - y1) * i // n)), 0.025)
                for i in range(1, n + 1)]
        touch([(lambda: down(x1, y1), 0.05)] + path + [(up, 0)])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(*sys.argv[1:])
