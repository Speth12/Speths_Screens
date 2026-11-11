#!/bin/sh
# Makes Speth's Screens start by itself when the panel boots. Run it as admin, in this folder, with no sudo:
#
#   cd /home/admin/panel-test
#   sh install-service.sh                       # the design directions sample
#   sh install-service.sh loadtest.screens.json    # or another project in this folder
#
# It adds ONE file, ~/.config/systemd/user/speths-screens.service, and starts it as a systemd *user*
# service (the panel already runs a user session for admin at boot). It touches nothing outside your
# home folder. Stop run-test.sh first (Ctrl+C): two copies cannot both use port 8090.
# To undo it: sh uninstall-service.sh
#
# By default it listens on the panel itself only (127.0.0.1:8090), so nothing on the network can reach it.
# To let the IDE on your PC connect to it (Deploy, Pull), listen on the network instead:
#
#   SPETHS_LISTEN=:8090 sh install-service.sh
#
# The IDE that a runtime on your PC serves (http://localhost:8080/ide/) is another address, and the panel
# only accepts requests from its own address and the IDE dev server unless you name it. For Deploy and Pull
# from that IDE, add its address:
#
#   SPETHS_LISTEN=:8090 SPETHS_CORS=http://localhost:8080 sh install-service.sh
#
# (several addresses: separate them with commas). Nothing else is opened by it.
#
# THAT HAS NO LOGIN unless the project turns security on: anyone who can reach the panel can deploy a
# project to it, write to its tags and read everything. Do it only on a network you trust, and go back with
#   sh install-service.sh        (listens on the panel only again)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT="${1:-design-directions.screens.json}"
LISTEN="${SPETHS_LISTEN:-127.0.0.1:8090}"
CORS="${SPETHS_CORS:-}"   # extra browser addresses allowed to call this runtime (the IDE's address)
[ -f "$DIR/$PROJECT" ] || { echo "no such project file in $DIR: $PROJECT"; exit 1; }
chmod +x "$DIR/speths-screens"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/speths-screens.service" <<EOF
[Unit]
Description=Speth's Screens runtime
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/speths-screens --mode=runtime --addr=$LISTEN --project=$DIR/$PROJECT --history=:memory:${CORS:+ --cors-origins=$CORS}
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
case "$LISTEN" in
  127.0.0.1:*|localhost:*) ;;
  *) echo "NOTE: listening on $LISTEN, so the network can reach it, with no login. Run this script again without SPETHS_LISTEN to close it." ;;
esac
echo "Check:  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/    (200 means it is up)"
echo "Logs:   journalctl --user -u speths-screens -n 30 --no-pager"
echo "Reboot the panel, then check that the screen comes back by itself."
