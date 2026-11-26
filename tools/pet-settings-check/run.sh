#!/bin/bash
# pet-settings-check: loads every desk pet's REAL QML offscreen and checks the
# pet settings contract: petMotion still -> no timer runs in the pet,
# calm/still -> no neighbour extras (groove, screen signs, worried looks) and
# no fidget timer, petReactions false / pet hidden -> empty input mask, no drag
# dangle, no landing (all eight pets, owl + frog included). Prints per-case timer intervals and RESULT OK|FAIL.
#   tools/pet-settings-check/run.sh [worktree]
ROOT=$(cd "${1:-$(dirname "$0")/../..}" && pwd)
HERE=$ROOT/tools/pet-settings-check
STUB=$ROOT/tools/pet-harness/qmlstub
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
fail=0
while IFS='|' read -r plug type cases; do
  [ -z "$plug" ] && continue
  cp -r "$ROOT/plugins/$plug" "$WORK/$plug"
  python3 - "$HERE/check.qml" "$WORK/$type.qml" "$WORK/$plug" "$type" "$cases" <<'PY'
import sys
s = open(sys.argv[1]).read()
s = s.replace("PLUGDIR", sys.argv[3]).replace("PETTYPE", sys.argv[4]).replace("CASES", sys.argv[5])
open(sys.argv[2], "w").write(s)
PY
  out=$(QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$STUB" QT_QPA_PLATFORM=offscreen timeout 30 /usr/lib/qt6/bin/qml "$WORK/$type.qml" 2>&1 | sed 's/^qml: //')
  echo "$out"
  echo "$out" | grep -q "RESULT OK" || fail=1
done <<'CFG'
fynnp.desksys|PixelBuddy|{type:"PixelBuddy",base:{catMood:"",gamerMood:"",breakSign:false},cases:[{name:"chill+break",props:{mood:"chill",breakSign:true}},{name:"idle+break",props:{mood:"idle",breakSign:true}},{name:"chill",props:{mood:"chill"},fidgets:true},{name:"chill+cat",props:{mood:"chill",catMood:"dance"}},{name:"chill+gamer",props:{mood:"chill",gamerMood:"launching"}},{name:"idle",props:{mood:"idle"}},{name:"work",props:{mood:"work"}}]}
fynnp.deskmem|PixelHamster|{type:"PixelHamster",base:{catMood:""},cases:[{name:"calm",props:{mood:"calm"},fidgets:true},{name:"calm+cat",props:{mood:"calm",catMood:"dance"}},{name:"busy",props:{mood:"busy"}},{name:"sleep",props:{mood:"sleep"}}]}
fynnp.deskaudio|PixelCat|{type:"PixelCat",base:{buddyMood:"",gamerMood:"",playing:false,level:0},cases:[{name:"idle",props:{level:0.1},fidgets:true},{name:"idle+buddy",props:{level:0.1,buddyMood:"load"}},{name:"dance",props:{playing:true,level:0.5}},{name:"sleep",props:{level:0}}]}
fynnp.deskdisk|PixelDisk|{type:"PixelDisk",base:{catMood:"",readRate:0,writeRate:0},cases:[{name:"light",props:{mood:"light"},fidgets:true},{name:"light+cat",props:{mood:"light",catMood:"dance"}},{name:"busy",props:{mood:"busy",readRate:2e7}},{name:"idle",props:{mood:"idle"}}]}
fynnp.desknet|PixelRouter|{type:"PixelRouter",base:{catMood:"",rx:0,tx:0},cases:[{name:"light",props:{mood:"light"},fidgets:true},{name:"light+cat",props:{mood:"light",catMood:"dance"}},{name:"busy",props:{mood:"busy",rx:2e6}},{name:"offline",props:{mood:"offline"}}]}
fynnp.deskgames|PixelGamer|{type:"PixelGamer",base:{},cases:[{name:"ready",props:{mood:"ready"},fidgets:true},{name:"playing",props:{mood:"playing"}},{name:"idle",props:{mood:"idle"}}]}
fynnp.deskclock|PixelOwl|{type:"PixelOwl",base:{},cases:[{name:"awake",props:{mood:"awake"},fidgets:true},{name:"drowsy",props:{mood:"drowsy"},fidgets:true},{name:"sleep",props:{mood:"sleep"}}]}
fynnp.deskweather|PixelFrog|{type:"PixelFrog",base:{catMood:"",gamerMood:"",cold:false},cases:[{name:"cloudy",props:{mood:"cloudy"},fidgets:true},{name:"cloudy+cat",props:{mood:"cloudy",catMood:"dance"}},{name:"sun+gamer",props:{mood:"sun",gamerMood:"launching"}},{name:"rain",props:{mood:"rain"}},{name:"sleep",props:{mood:"sleep"}}]}
CFG
[ $fail = 0 ] && echo "ALL OK" || { echo "SOME FAILED"; exit 1; }
