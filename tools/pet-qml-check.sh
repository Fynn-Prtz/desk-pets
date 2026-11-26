#!/bin/bash
# pet-qml-check: load a card's pet QML offscreen (Qt, stub qs.Commons from
# tools/qmlstub), step it through scenarios, grab every frame, report QML
# errors, and build GIFs + a contact sheet. Headless-safe (QT_QPA_PLATFORM=offscreen).
#
#   tools/pet-qml-check.sh <plugin dir> <PetType> <scenarios.js> <outdir>
#   e.g. tools/pet-qml-check.sh plugins/fynnp.desksys PixelBuddy sc.js /tmp/out
#
# scenarios.js is one JS expression evaluating to an array of
#   { name, props: {mood: …}, frames, step (clock s per frame), setup(pet, place), each(pet, place, f) }
# (see the header of tools/pet-qml-harness.qml). Prints Qt's warnings; "OK n frames" when it ran through.
set -e
TOOLS=$(cd "$(dirname "$0")" && pwd)
PLUG=$(cd "$1" && pwd); TYPE=$2; SC=$3; OUT=$4
WORK=$(mktemp -d)
cp -r "$PLUG" "$WORK/plug"
rm -rf "$OUT/frames"; mkdir -p "$OUT/frames"
python3 - "$TOOLS/pet-qml-harness.qml" "$WORK/h.qml" "$WORK/plug" "$TYPE" "$OUT/frames" "$SC" <<'PY'
import sys
s = open(sys.argv[1]).read()
s = s.replace("PLUGIN", sys.argv[3]).replace("PETTYPE", sys.argv[4]).replace("OUTDIR", sys.argv[5]).replace("SCENARIOS", open(sys.argv[6]).read())
open(sys.argv[2], "w").write(s)
PY
QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$TOOLS/qmlstub" QT_QPA_PLATFORM=offscreen timeout 180 /usr/lib/qt6/bin/qml "$WORK/h.qml" 2>&1 | grep -v "^$" | head -40
rm -rf "$WORK"
cd "$OUT/frames"
N=$(ls | wc -l)
[ "$N" -gt 0 ] || { echo "NO FRAMES"; exit 1; }
for n in $(ls | sed 's/-[0-9]*\.png$//' | sort -u); do
  magick -delay ${DELAY:-25} -loop 0 $n-*.png -filter point -resize 300% "$OUT/$n.gif"
done
magick montage $(for n in $(ls | sed 's/-[0-9]*\.png$//' | sort -u); do f=$(ls $n-*.png | sed -n 3p); echo -label $n ${f:-$n-000.png}; done) \
  -tile 6x -geometry 240x200+4+4 -filter point -background '#111' -fill '#ddd' "$OUT/sheet.png"
echo "OK $N frames -> $OUT"
