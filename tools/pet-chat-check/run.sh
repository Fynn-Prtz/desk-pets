#!/bin/bash
# pet-chat-check: two REAL pets on stub cards exchange a pet-chat gift
# (shared/PetChat.qml) through the stub Quickshell file bus
# (tools/pet-harness/qmlstub/Quickshell). Logs both phases + gaze every 0.5 s,
# saves frames, a GIF and a strip.
#   tools/pet-chat-check/run.sh SENDER RECEIVER OUT [vertical]
#   SENDER/RECEIVER: buddy hamster cat dog pigeon gamer owl frog, optionally ":sleep"
#   e.g. tools/pet-chat-check/run.sh pigeon cat:sleep /tmp/chat
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
declare -A PLUG=([buddy]=desksys [hamster]=deskmem [cat]=deskaudio [dog]=deskdisk [pigeon]=desknet [gamer]=deskgames [owl]=deskclock [frog]=deskweather)
declare -A TYPE=([buddy]=PixelBuddy [hamster]=PixelHamster [cat]=PixelCat [dog]=PixelDisk [pigeon]=PixelRouter [gamer]=PixelGamer [owl]=PixelOwl [frog]=PixelFrog)
declare -A CALM=([buddy]='{mood:"chill"}' [hamster]='{mood:"calm"}' [cat]='{level:0.1}' [dog]='{mood:"light"}' [pigeon]='{mood:"light"}' [gamer]='{mood:"ready"}' [owl]='{mood:"awake"}' [frog]='{mood:"cloudy"}')
declare -A SLEEP=([buddy]='{mood:"idle"}' [hamster]='{mood:"sleep"}' [cat]='{level:0}' [dog]='{mood:"idle"}' [pigeon]='{mood:"idle"}' [gamer]='{mood:"idle"}' [owl]='{mood:"sleep"}' [frog]='{mood:"sleep"}')
props() { local n=${1%%:*}; [ "${1#*:}" = sleep ] && echo "${SLEEP[$n]}" || echo "${CALM[$n]}"; }
A=${1%%:*}; B=${2%%:*}; OUT=$3; V=false; [ "$4" = vertical ] && V=true
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
cp -r "$ROOT/plugins/fynnp.${PLUG[$A]}" "$WORK/a"; cp -r "$ROOT/plugins/fynnp.${PLUG[$B]}" "$WORK/b"
rm -rf "$OUT"; mkdir -p "$OUT"
sed -e "s#PLUGA#$WORK/a#; s#PLUGB#$WORK/b#; s#TYPEA#${TYPE[$A]}#; s#TYPEB#${TYPE[$B]}#; s#VERTICAL#$V#; s#OUT/#$OUT/#" \
    -e "s#PROPSA#$(props "$1")#; s#PROPSB#$(props "$2")#" "$ROOT/tools/pet-chat-check/chat.qml" > "$WORK/chat.qml"
QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$ROOT/tools/pet-harness/qmlstub" QT_QPA_PLATFORM=offscreen timeout 60 \
  /usr/lib/qt6/bin/qml "$WORK/chat.qml" 2>&1 | sed 's/^qml: //' | grep -v '^$' | head -40
sleep 0.5
magick -delay 12 -loop 0 "$OUT"/f-*.png -filter point -resize 300% "$OUT/chat.gif"
magick montage "$OUT"/f-0[0-3][02468].png -tile 5x -geometry 480x200+2+2 -filter point -background '#111' "$OUT/strip.png"
echo "ok -> $OUT"
