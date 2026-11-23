-- desk-pets: frosted glass behind the desk cards and the layout-mode hotkey.
-- install.sh appends these lines (once) to ~/.config/hypr/looknfeel.lua / bindings.lua.
hl.layer_rule({ match = { namespace = "^fynnp-desksys$" }, blur = true, ignore_alpha = 0.1 })
hl.layer_rule({ match = { namespace = "^fynnp-deskaudio$" }, blur = true, ignore_alpha = 0.1 })
hl.layer_rule({ match = { namespace = "^fynnp-deskgames$" }, blur = true, ignore_alpha = 0.1 })
