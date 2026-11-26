#!/bin/bash
# pet-harness: render a desk pet's REAL QML item offscreen through scripted
# scenarios (mood, rates, touch reactions, drags) to PNG frames, one GIF per
# scenario and a contact sheet. Headless (QT_QPA_PLATFORM=offscreen) with a
# stub qs.Commons (Tokyo Night colours), so it runs on a server.
#
#   tools/pet-harness/run.sh PLUGIN_DIR PET_TYPE SCENARIOS.js OUT_DIR
#   e.g. tools/pet-harness/run.sh plugins/fynnp.deskdisk PixelDisk my-sc.js /tmp/out
#   DELAY=12 ... sets the GIF frame delay (1/100 s, default 25)
#
# SCENARIOS.js is a JS expression evaluating to a list of
#   { name, props: {pet property: value}, frames, step (clock s per frame),
#     setup(pet, place) (frame 0), each(pet, place, frame) }
# `place` is a stub DeskPlace { dragging, editing, dragX }; the pet's clock is
# set to 100 + frame * step. Full examples: tools/pet-harness/examples/
# (dog-sc.js for deskdisk/PixelDisk, bird-sc.js for desknet/PixelRouter).
# Then tools/pet-harness/strip.sh
# OUT_DIR NAME... lays every frame of some scenarios out in a grid.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PLUG=$(cd "$1" && pwd); TYPE=$2; SC=$3; OUT=$4
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
cp -r "$PLUG" "$WORK/plug"
rm -rf "$OUT/frames"; mkdir -p "$OUT/frames"
python3 - "$HERE/harness.qml" "$WORK/h.qml" "$WORK/plug" "$TYPE" "$OUT/frames" "$SC" <<'PY'
import sys
s = open(sys.argv[1]).read()
sc = open(sys.argv[6]).read()
s = s.replace("PLUGDIR", sys.argv[3]).replace("PETTYPE", sys.argv[4]).replace("OUT/", sys.argv[5] + "/").replace("SCENARIOS", sc)
open(sys.argv[2], "w").write(s)
PY
QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$HERE/qmlstub" QT_QPA_PLATFORM=offscreen timeout 180 /usr/lib/qt6/bin/qml "$WORK/h.qml" 2>&1 | grep -v "^$" | head -30 || true
cd "$OUT/frames"
names=$(ls | sed 's/-[0-9]*\.png$//' | sort -u)
for n in $names; do
  magick -delay ${DELAY:-25} -loop 0 $n-*.png -filter point -resize 300% "$OUT/$n.gif"
done
magick montage $(for n in $names; do f=$n-002.png; [ -f $f ] || f=$n-000.png; echo -label $n $f; done) \
  -tile 6x -geometry 240x200+4+4 -filter point -background '#111' -fill '#ddd' "$OUT/sheet.png"
echo "ok: $(echo $names | wc -w) scenarios -> $OUT"
