#!/bin/bash
# memory-test: unit-check shared/PetMemory.qml (loading, counting only "pet",
# levels, merge with other cards' keys, debounced writes, never backwards, off
# switch) offscreen against the Quickshell stubs in tools/greet-stub.
set -eo pipefail
cd "$(dirname "$0")/.."
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
cp shared/PetMemory.qml tools/greet-stub/memory-test.qml "$W/"
QT_FORCE_STDERR_LOGGING=1 QML_IMPORT_PATH="$PWD/tools/greet-stub" QT_QPA_PLATFORM=offscreen timeout 60 /usr/lib/qt6/bin/qml "$W/memory-test.qml" 2>&1 | sed 's/^qml: //'
