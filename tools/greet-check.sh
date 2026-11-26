#!/bin/bash
# greet-check: render every desk pet's welcome-back greeting through the real
# QML harness (tools/pet-harness) -> previews/ideas/welcome-back/<pet>/ (GIFs,
# sheet) + one strip per pet. Prints QML errors.
#   tools/greet-check.sh [OUT_DIR] [pet...]   pets: sys mem audio disk net games clock weather
set -e
cd "$(dirname "$0")/.."
OUT=${1:-$HOME/src/desk-widgets/pets2/previews/ideas/welcome-back}; shift || true
PETS=${@:-sys mem audio disk net games clock weather}
declare -A PLUG=( [sys]=desksys:PixelBuddy [mem]=deskmem:PixelHamster [audio]=deskaudio:PixelCat
  [disk]=deskdisk:PixelDisk [net]=desknet:PixelRouter [games]=deskgames:PixelGamer
  [clock]=deskclock:PixelOwl [weather]=deskweather:PixelFrog )
declare -A MOODS=(
  [sys]='{asleep:{mood:"idle"},calm:{mood:"chill"},busy:{mood:"work"},stressed:{mood:"hot"}}'
  [mem]='{asleep:{mood:"sleep",fill:0.3},calm:{mood:"calm",fill:0.4},busy:{mood:"busy",fill:0.6},stressed:{mood:"critical",fill:0.97}}'
  [audio]='{asleep:{playing:false,level:0},calm:{playing:true,level:0.01},busy:{playing:true,level:0.4},stressed:{playing:true,level:0.9}}'
  [disk]='{asleep:{mood:"idle"},calm:{mood:"light"},busy:{mood:"busy",util:20,readRate:20e6},stressed:{mood:"full",util:80,writeRate:90e6}}'
  [net]='{asleep:{mood:"idle"},calm:{mood:"light"},busy:{mood:"busy"},stressed:{mood:"offline"}}'
  [games]='{asleep:{mood:"idle"},calm:{mood:"ready"},busy:{mood:"playing"},stressed:{mood:"playing",strain:2}}'
  [clock]='{asleep:{mood:"sleep"},calm:{mood:"awake"},busy:{mood:"drowsy"},stressed:{mood:"awake"}}'
  [weather]='{asleep:{mood:"sleep"},calm:{mood:"cloudy"},busy:{mood:"rain"},stressed:{mood:"storm"}}' )
for pet in $PETS; do
  IFS=: read dir type <<< "${PLUG[$pet]}"
  sc=$(mktemp --suffix=.js)
  sed "s|MOODS|${MOODS[$pet]}|" tools/pet-harness/examples/greet-sc.js > "$sc"
  echo "== $pet ($dir/$type)"
  DELAY=12 tools/pet-harness/run.sh plugins/fynnp.$dir $type "$sc" "$OUT/$pet"
  tools/pet-harness/strip.sh "$OUT/$pet" 1-greet-asleep 2-greet-calm 4-greet-stressed 6-greet-still-none >/dev/null 2>&1 || true
  rm -f "$sc"
done
