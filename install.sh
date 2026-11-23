#!/usr/bin/env bash
# desk-pets installer for Omarchy (Hyprland + omarchy-shell / Quickshell).
#
#   ./install.sh                 core: system, memory, audio, games cards, layout mode, cat screensaver plugin
#   ./install.sh --sessions      + MangoHud game-session reports (MangoHud config, Steam launcher, systemd units)
#   ./install.sh --rapl          + CPU package watts (udev rule, needs sudo; see README for the trade-off)
#   ./install.sh --screensaver   + replace Omarchy's terminal screensaver with the pixel cat
#   ./install.sh --all           everything above
#   ./install.sh --uninstall     remove links, shell.json entries and units (keeps your other config)
#
# Safe to re-run. Every config file it edits is backed up as <file>.bak.<timestamp> first.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS=(fynnp.desksys fynnp.deskmem fynnp.deskaudio fynnp.deskgames fynnp.desklayout fynnp.catsaver)
PLUGIN_DIR="$HOME/.config/omarchy/plugins"
SHELL_JSON="$HOME/.config/omarchy/shell.json"
HYPR="$HOME/.config/hypr"
BIN="$HOME/.local/bin"
TS="$(date +%s)"

want_sessions=0 want_rapl=0 want_saver=0 uninstall=0
for a in "$@"; do
  case "$a" in
    --sessions) want_sessions=1 ;;
    --rapl) want_rapl=1 ;;
    --screensaver) want_saver=1 ;;
    --all) want_sessions=1 want_rapl=1 want_saver=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;34m::\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
backup() { [[ -e "$1" ]] && cp -a "$1" "$1.bak.$TS" || true; }
need() { command -v "$1" >/dev/null 2>&1 || { warn "missing dependency: $1 ($2)"; exit 1; }; }

need jq "pacman -S jq"
need omarchy-shell "desk-pets needs Omarchy's shell (Quickshell)"

# ---------------------------------------------------------------- uninstall
if ((uninstall)); then
  say "removing plugin links"
  for p in "${PLUGINS[@]}"; do
    [[ -L "$PLUGIN_DIR/$p" ]] && rm "$PLUGIN_DIR/$p"
  done
  if [[ -f "$SHELL_JSON" ]]; then
    say "removing shell.json entries"
    backup "$SHELL_JSON"
    tmp="$(mktemp)"
    jq --argjson ids "$(printf '%s\n' "${PLUGINS[@]}" | jq -R . | jq -s .)" \
      '.plugins |= map(select((.id as $i | $ids | index($i)) | not))' "$SHELL_JSON" > "$tmp" && mv "$tmp" "$SHELL_JSON"
  fi
  if systemctl --user list-unit-files desk-session.path >/dev/null 2>&1; then
    systemctl --user disable --now desk-session.path >/dev/null 2>&1 || true
    rm -f "$HOME/.config/systemd/user/desk-session."{path,service}
    systemctl --user daemon-reload
  fi
  rm -f "$BIN/desksys-feed" "$BIN/deskmem-feed" "$BIN/desk-session"
  say "done. Hyprland snippets, MangoHud config and the Steam launcher override were left in place;"
  say "remove the 'desk-pets' lines in $HYPR/looknfeel.lua and $HYPR/bindings.lua by hand if you like."
  omarchy restart shell >/dev/null 2>&1 || true
  exit 0
fi

need cargo "install Rust, e.g. 'omarchy pkg add rust' or 'mise use -g rust'"

# ---------------------------------------------------------------- build helpers
build() { # <crate dir> <binary name> <install path>
  say "building $2"
  CARGO_TARGET_DIR="$REPO/target" cargo build --release --quiet --manifest-path "$1/Cargo.toml"
  install -Dm755 "$REPO/target/release/$2" "$3"
}
build "$REPO/helpers/desksys-feed" desksys-feed "$BIN/desksys-feed"
build "$REPO/helpers/deskmem-feed" deskmem-feed "$BIN/deskmem-feed"
build "$REPO/plugins/fynnp.deskgames/helper" deskgames-feed "$REPO/plugins/fynnp.deskgames/bin/deskgames-feed"

# ---------------------------------------------------------------- plugins
say "linking plugins into $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
for p in "${PLUGINS[@]}"; do
  dst="$PLUGIN_DIR/$p"
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    warn "$dst exists and is not a link; moving it to $dst.bak.$TS"
    mv "$dst" "$dst.bak.$TS"
  fi
  ln -sfn "$REPO/plugins/$p" "$dst"
done

# ---------------------------------------------------------------- shell.json
say "registering plugins in shell.json"
[[ -f "$SHELL_JSON" ]] || echo '{ "plugins": [] }' > "$SHELL_JSON"
backup "$SHELL_JSON"
defaults='[
  { "id": "fynnp.desksys",    "corner": "top-right",    "marginX": 32, "marginY": 58, "opacity": 0.5, "borderOpacity": 0.08, "interval": 1000 },
  { "id": "fynnp.deskmem",    "corner": "top-left",     "marginX": 32, "marginY": 58, "opacity": 0.5, "borderOpacity": 0.08, "interval": 3000 },
  { "id": "fynnp.deskaudio",  "corner": "bottom-right", "marginX": 32, "marginY": 32, "opacity": 0.5, "borderOpacity": 0.08 },
  { "id": "fynnp.deskgames",  "corner": "center-right", "marginX": 32, "marginY": 0,  "opacity": 0.5, "borderOpacity": 0.08 },
  { "id": "fynnp.desklayout", "grid": 24 },
  { "id": "fynnp.catsaver",   "timeout": 150, "fps": 8 }
]'
tmp="$(mktemp)"
jq --argjson d "$defaults" '
  .plugins = ((.plugins // []) as $p
    | $p + [ $d[] | select(.id as $i | ($p | map(.id) | index($i)) | not) ])' "$SHELL_JSON" > "$tmp" && mv "$tmp" "$SHELL_JSON"

if ((want_saver)); then
  say "switching Omarchy's terminal screensaver off (the pixel cat takes over)"
  tmp="$(mktemp)"; jq '.idle.screensaver = 0' "$SHELL_JSON" > "$tmp" && mv "$tmp" "$SHELL_JSON"
fi

# ---------------------------------------------------------------- Hyprland
append_once() { # <file> <marker> <text>
  [[ -f "$1" ]] || return 0
  grep -qF "$2" "$1" && return 0
  backup "$1"
  printf '\n%s\n' "$3" >> "$1"
}
say "adding blur rules and the SUPER+ALT+E layout hotkey"
for ns in desksys deskmem deskaudio deskgames; do
  append_once "$HYPR/looknfeel.lua" "^fynnp-$ns\$" \
    "-- desk-pets: frosted glass behind fynnp.$ns
hl.layer_rule({ match = { namespace = \"^fynnp-$ns\$\" }, blur = true, ignore_alpha = 0.1 })"
done
append_once "$HYPR/bindings.lua" "desklayout toggle" \
  "-- desk-pets: arrange the desk cards
o.bind(\"SUPER + ALT + E\", \"Arrange desk cards\", \"omarchy-shell desklayout toggle\")"

# ---------------------------------------------------------------- game sessions
if ((want_sessions)); then
  need mangohud "pacman -S mangohud lib32-mangohud"
  build "$REPO/helpers/desk-session" desk-session "$BIN/desk-session"
  install -Dm644 "$REPO/helpers/desk-session/assets/desk-session.png" \
    "$HOME/.local/share/icons/hicolor/64x64/apps/desk-session.png"

  conf="$HOME/.config/MangoHud/MangoHud.conf"
  rendered="$(sed "s|@HOME@|$HOME|g" "$REPO/extras/mangohud/MangoHud.conf")"
  if [[ -f "$conf" ]] && [[ "$(cat "$conf")" != "$rendered" ]]; then
    warn "keeping your existing $conf (desk-pets' version: extras/mangohud/MangoHud.conf)"
  else
    mkdir -p "$(dirname "$conf")" && printf '%s\n' "$rendered" > "$conf"
  fi

  desk="$HOME/.local/share/applications/steam.desktop"
  if [[ -f /usr/share/applications/steam.desktop ]] && ! grep -q 'MANGOHUD=1' "$desk" 2>/dev/null; then
    say "Steam launcher override with MANGOHUD=1 (games only; restart Steam once)"
    backup "$desk"
    sed -E 's#^Exec=(/usr/bin/)?steam#Exec=env MANGOHUD=1 /usr/bin/steam#' \
      /usr/share/applications/steam.desktop > "$desk"
    command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
  fi

  install -Dm644 "$REPO/helpers/desk-session/systemd/desk-session.service" "$HOME/.config/systemd/user/desk-session.service"
  install -Dm644 "$REPO/helpers/desk-session/systemd/desk-session.path" "$HOME/.config/systemd/user/desk-session.path"
  systemctl --user daemon-reload
  systemctl --user enable --now desk-session.path >/dev/null
fi

# ---------------------------------------------------------------- CPU watts
if ((want_rapl)); then
  say "installing the RAPL udev rule (sudo): makes CPU package energy readable for all local users"
  sudo install -m644 "$REPO/extras/udev/99-desk-pets-rapl.rules" /etc/udev/rules.d/99-desk-pets-rapl.rules
  sudo udevadm trigger --action=add --subsystem-match=powercap || true
fi

hyprctl configerrors 2>/dev/null | grep -v '^$' && warn "Hyprland reports config errors (see above)" || true
say "restarting the Omarchy shell"
omarchy restart shell >/dev/null 2>&1 || true
say "done. SUPER+ALT+E arranges the cards. Settings: the fynnp.* entries in $SHELL_JSON"
