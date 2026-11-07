#!/bin/sh
# Removes the boot-time service that install-service.sh made. Run as admin, with no sudo.
systemctl --user disable --now speths-screens.service 2>&1 || true
rm -f "$HOME/.config/systemd/user/speths-screens.service"
systemctl --user daemon-reload
echo "removed. The files in this folder are untouched; delete the folder to remove them too."
