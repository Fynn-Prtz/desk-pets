#!/bin/bash
# strip.sh OUT_DIR SCENARIO [SCENARIO...]: every frame of the given scenarios
# (rendered by run.sh into OUT_DIR/frames) in an 8-wide grid -> OUT_DIR/strip.png
OUT=$1; shift
args=()
for n in "$@"; do for f in "$OUT"/frames/$n-*.png; do args+=(-label "$(basename "$f" .png)" "$f"); done; done
magick montage "${args[@]}" -tile 8x -geometry 240x200+2+2 -filter point -background '#111' -fill '#ddd' "$OUT/strip.png"
