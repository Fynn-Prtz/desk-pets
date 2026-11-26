#!/bin/bash
# card-check: load a desk card's REAL Service.qml offscreen with Quickshell /
# qs.Ui / qs.Commons stubs (tools/card-check/stub), a fake HOME and a given
# shell.json, then print chosen root properties and save a PNG of the card.
# Process never runs anything: it logs its command ("STUB Process run ...") and
# exits with EXIT (default 0) for commands containing curl, 0 otherwise.
# FileView reads/writes real files (in the fake HOME).
#
#   tools/card-check/run.sh PLUGIN_DIR OUT.png SHELL_JSON [PROPS] [WAITMS]
#   env: EXIT=1 (failed fetch), SETUP='cmd' (runs with $FAKEHOME set, e.g. to
#        drop a cache file), LANG_JSON=de (translations file), KEEP=1
#   e.g. tools/card-check/run.sh plugins/fynnp.deskweather /tmp/w.png \
#          '{"plugins":[{"id":"fynnp.deskweather","latitude":52.52,"longitude":13.4}]}' title,subtitle
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PLUG=$(cd "$1" && pwd); OUT=$(realpath -m "$2"); SHELLJSON=$3; PROPS=${4:-active}; WAIT=${5:-2500}
W=$(mktemp -d); [ -n "$KEEP" ] && echo "work: $W" || trap 'rm -rf "$W"' EXIT
export FAKEHOME="$W/home"
mkdir -p "$FAKEHOME/.config/omarchy" "$W/run" "$W/cache"
printf '%s\n' "$SHELLJSON" > "$FAKEHOME/.config/omarchy/shell.json"
[ -n "$SETUP" ] && (export FAKEHOME CACHE="$W/cache"; eval "$SETUP")
cp -r "$HERE/stub" "$W/stub"
grep -rl '@HOME@\|@EXIT@\|@LANG@' "$W/stub" | xargs sed -i "s|@HOME@|$FAKEHOME|; s|@RUN@|$W/run|; s|@CACHE@|$W/cache|; s|@EXIT@|${EXIT:-0}|; s|@LANG@|${LANG_JSON:-en}|"
cp -r "$PLUG" "$W/plug"
# attached Wayland layer-shell properties cannot be stubbed in QML
sed -i '/WlrLayershell\./d' "$W/plug/"*.qml
sed "s|PLUGDIR|$W/plug|; s|WAITMS|$WAIT|; s|PROPS|$PROPS|; s|OUTPNG|$OUT|g" "$HERE/harness.qml" > "$W/h.qml"
QML_XHR_ALLOW_FILE_READ=1 QML_XHR_ALLOW_FILE_WRITE=1 QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$W/stub" \
  QT_QPA_PLATFORM=offscreen timeout 60 /usr/lib/qt6/bin/qml "$W/h.qml" 2>&1 | sed "s|$W|<w>|g" | grep -v '^$' | head -60
