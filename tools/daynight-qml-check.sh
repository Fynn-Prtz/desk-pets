#!/bin/bash
# daynight-qml-check: load every desk pet's REAL QML offscreen (tools/pet-harness)
# through the day-night routine: asleep at night (nightcap, also with a season),
# asleep by day, and the morning routine (startMorning(), stretch -> coffee),
# plus the morning with motion "still" (the cards never start it then; here it
# just has to load). Prints Qt errors; frames / GIFs / sheet per pet.
#
#   tools/daynight-qml-check.sh OUT_DIR [pet ...]   pets: penguin hamster cat dog pigeon axolotl
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(dirname "$HERE")
OUT=${1:-/tmp/daynight-qml}; shift || true
PETS=${*:-penguin hamster cat dog pigeon axolotl}
declare -A PLUG=( [penguin]=desksys [hamster]=deskmem [cat]=deskaudio [dog]=deskdisk [pigeon]=desknet [axolotl]=deskgames )
declare -A TYPE=( [penguin]=PixelBuddy [hamster]=PixelHamster [cat]=PixelCat [dog]=PixelDisk [pigeon]=PixelRouter [axolotl]=PixelGamer )
declare -A SLEEP=( [penguin]='{mood:"idle"}' [hamster]='{mood:"sleep"}' [cat]='{playing:false}' [dog]='{mood:"idle"}' [pigeon]='{mood:"idle"}' [axolotl]='{mood:"idle"}' )
declare -A AWAKE=( [penguin]='{mood:"chill"}' [hamster]='{mood:"calm"}' [cat]='{playing:true,level:0}' [dog]='{mood:"light"}' [pigeon]='{mood:"light"}' [axolotl]='{mood:"ready"}' )
for pet in $PETS; do
  sc=$(mktemp --suffix=.js)
  cat > "$sc" <<JS
(function(){
function S(name, base, extra, opt) {
  opt = opt || {}
  return { name: name, props: Object.assign({ season: "", motion: "full", night: false, morning: false }, base, extra || {}),
    frames: opt.frames || 6, step: opt.step || 0.25,
    setup: function(p) { p.touch.react("", 0); if (opt.morning) p.startMorning() } }
}
return [
  S("1-sleep-day", ${SLEEP[$pet]}),
  S("2-sleep-night", ${SLEEP[$pet]}, { night: true }),
  S("3-sleep-night-xmas", ${SLEEP[$pet]}, { night: true, season: "xmas" }),
  S("4-morning", ${AWAKE[$pet]}, { morning: true }, { morning: true, frames: 18 }),
  S("5-awake-night", ${AWAKE[$pet]}, { night: true })
]
})()
JS
  echo "== $pet"
  DELAY=25 "$HERE/pet-harness/run.sh" "$ROOT/plugins/fynnp.${PLUG[$pet]}" "${TYPE[$pet]}" "$sc" "$OUT/$pet"
  rm -f "$sc"
done
