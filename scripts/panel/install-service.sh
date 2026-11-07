#!/bin/sh
# Makes Speth's Screens start by itself when the panel boots. Run it as admin, in this folder, with no sudo:
#
#   cd /home/admin/panel-test
#   sh install-service.sh                       # the design directions sample
#   sh install-service.sh loadtest.xhmi.json    # or another project in this folder
#
# It adds ONE file, ~/.config/systemd/user/speths-screens.service, and starts it as a systemd *user*
# service (the panel already runs a user session for admin at boot). It touches nothing outside your
# home folder. Stop run-test.sh first (Ctrl+C): two copies cannot both use port 8090.
# To undo it: sh uninstall-service.sh
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT="${1:-design-directions.xhmi.json}"
[ -f "$DIR/$PROJECT" ] || { echo "no such project file in $DIR: $PROJECT"; exit 1; }
chmod +x "$DIR/speths-screens"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/speths-screens.service" <<EOF
[Unit]
Description=Speth's Screens runtime
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/speths-screens --mode=runtime --addr=127.0.0.1:8090 --project=$DIR/$PROJECT --history=:memory:
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable speths-screens.service
# restart, not just start: running this again with another project must switch to it
systemctl --user restart speths-screens.service
sleep 2
echo
systemctl --user --no-pager --lines=8 status speths-screens.service || true
echo
echo "Check:  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/    (200 means it is up)"
echo "Logs:   journalctl --user -u speths-screens -n 30 --no-pager"
echo "Reboot the panel, then check that the screen comes back by itself."
