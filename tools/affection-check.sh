#!/bin/bash
# affection-check: render every desk pet's affection row + hover perk/wave through the real
# QML harness (tools/pet-harness) -> previews/ideas/affection/<pet>/ (GIFs,
# sheet) + one strip per pet. Prints QML errors.
#   tools/affection-check.sh [OUT_DIR] [pet...]   pets: sys mem audio disk net games
set -e
cd "$(dirname "$0")/.."
OUT=${1:-$HOME/src/desk-widgets/pets2/previews/ideas/affection}; shift || true
PETS=${@:-sys mem audio disk net games}
declare -A PLUG=( [sys]=desksys:PixelBuddy [mem]=deskmem:PixelHamster [audio]=deskaudio:PixelCat
  [disk]=deskdisk:PixelDisk [net]=desknet:PixelRouter [games]=deskgames:PixelGamer )
declare -A MOODS=(
  [sys]='{asleep:{mood:"idle"},calm:{mood:"chill"},busy:{mood:"work"},stressed:{mood:"hot"}}'
  [mem]='{asleep:{mood:"sleep",fill:0.3},calm:{mood:"calm",fill:0.4},busy:{mood:"busy",fill:0.6},stressed:{mood:"critical",fill:0.97}}'
  [audio]='{asleep:{playing:false,level:0},calm:{playing:true,level:0.01},busy:{playing:true,level:0.4},stressed:{playing:true,level:0.9}}'
  [disk]='{asleep:{mood:"idle"},calm:{mood:"light"},busy:{mood:"busy",util:20,readRate:20e6},stressed:{mood:"full",util:80,writeRate:90e6}}'
  [net]='{asleep:{mood:"idle"},calm:{mood:"light"},busy:{mood:"busy"},stressed:{mood:"offline"}}'
  [games]='{asleep:{mood:"idle"},calm:{mood:"ready"},busy:{mood:"playing"},stressed:{mood:"playing",strain:2}}' )
for pet in $PETS; do
  IFS=: read dir type <<< "${PLUG[$pet]}"
  sc=$(mktemp --suffix=.js)
  sed "s|MOODS|${MOODS[$pet]}|" tools/pet-harness/examples/affection-sc.js > "$sc"
  echo "== $pet ($dir/$type)"
  DELAY=12 tools/pet-harness/run.sh plugins/fynnp.$dir $type "$sc" "$OUT/$pet"
  tools/pet-harness/strip.sh "$OUT/$pet" a2-row-level5-up a3-hover-level3-perk a4-hover-level4-wave >/dev/null 2>&1 || true
  rm -f "$sc"
done
