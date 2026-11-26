#!/bin/bash
# greet-test: unit-check shared/PetGreet.qml (welcome-back events, stagger order,
# dedupe, covered cards, lock wait, off switch) offscreen against Quickshell stubs
# (tools/greet-stub). Prints PASS/FAIL lines; exit 0 = all pass.
set -eo pipefail
cd "$(dirname "$0")/.."
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
cp shared/PetGreet.qml tools/greet-stub/greet-test.qml "$W/"
QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$PWD/tools/greet-stub" QT_QPA_PLATFORM=offscreen timeout 60 /usr/lib/qt6/bin/qml "$W/greet-test.qml" 2>&1 | sed 's/^qml: //'
