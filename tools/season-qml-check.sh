#!/bin/bash
# season-qml-check: load every desk pet's REAL QML offscreen (tools/pet-harness)
# in each season ("" xmas spooky party), calm + petted (+ party with motion
# "still"), print Qt errors and write frames / GIFs / a contact sheet per pet.
#
#   tools/season-qml-check.sh OUT_DIR [pet ...]   pets: penguin hamster cat dog pigeon axolotl owl frog
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(dirname "$HERE")
OUT=${1:-/tmp/season-qml}; shift || true
PETS=${*:-penguin hamster cat dog pigeon axolotl owl frog}
declare -A PLUG=( [penguin]=desksys [hamster]=deskmem [cat]=deskaudio [dog]=deskdisk [pigeon]=desknet [axolotl]=deskgames [owl]=deskclock [frog]=deskweather )
declare -A TYPE=( [penguin]=PixelBuddy [hamster]=PixelHamster [cat]=PixelCat [dog]=PixelDisk [pigeon]=PixelRouter [axolotl]=PixelGamer [owl]=PixelOwl [frog]=PixelFrog )
declare -A CALM=( [penguin]='{mood:"chill"}' [hamster]='{mood:"calm"}' [cat]='{playing:false}' [dog]='{mood:"light"}' [pigeon]='{mood:"light"}' [axolotl]='{mood:"ready"}' [owl]='{mood:"awake"}' [frog]='{mood:"cloudy"}' )
for pet in $PETS; do
  sc=$(mktemp --suffix=.js)
  cat > "$sc" <<JS
(function(){
var calm = ${CALM[$pet]}
function S(name, season, extra, opt) {
  opt = opt || {}
  var props = Object.assign({ season: season, motion: "full" }, calm, extra || {})
  return { name: name, props: props, frames: opt.frames || 6, step: opt.step || 0.25,
    setup: function(p) { p.touch.react(opt.react || "", opt.react ? 100000 : 0) } }
}
var out = []
var seasons = ["", "xmas", "spooky", "party"]
for (var i = 0; i < seasons.length; i++) {
  var n = seasons[i] || "none"
  out.push(S(i + "a-" + n + "-calm", seasons[i]))
  out.push(S(i + "b-" + n + "-pet", seasons[i], {}, { react: "pet", step: 0.125, frames: 16 }))
}
out.push(S("4-party-pet-still", "party", { motion: "still" }, { react: "pet", step: 0.125, frames: 8 }))
return out
})()
JS
  echo "== $pet"
  DELAY=12 "$HERE/pet-harness/run.sh" "$ROOT/plugins/fynnp.${PLUG[$pet]}" "${TYPE[$pet]}" "$sc" "$OUT/$pet"
  rm -f "$sc"
done
