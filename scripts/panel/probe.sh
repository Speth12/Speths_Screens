#!/bin/sh
# Read-only facts about a WP 6000 panel, for planning how to run Speth's Screens on it.
# It changes nothing: it only reads system information and prints it. Put it in any folder you can
# write to (the folder WinSCP opens when you log in, your home folder, is fine), then run, in that folder:
#
#   sh probe.sh > panel-probe.txt 2>&1
#
# and copy panel-probe.txt back with WinSCP (refresh the right-hand pane) and send it. It prints no passwords, but look it
# over before you share it. Commands that do not exist on the panel just report "not found".

say() { printf '\n===== %s =====\n' "$1"; }
try() { "$@" 2>&1 || echo "(failed: $*)"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "who and where"
try date
try uname -a
try id
try uptime

say "architecture"
try uname -m
if [ -r /proc/cpuinfo ]; then grep -E 'model name|Hardware|Model|CPU part|CPU implementer|Features|processor' /proc/cpuinfo | head -20; fi

say "operating system"
try cat /etc/os-release
for f in /etc/issue /etc/version /etc/firmware /etc/phoenix* /etc/plcnext*; do [ -r "$f" ] && { echo "--- $f"; head -5 "$f"; }; done

say "memory"
if have free; then try free -m; else try grep -E 'MemTotal|MemFree|MemAvailable|SwapTotal' /proc/meminfo; fi

say "storage (where could a program and its data live, and what is writable)"
try df -h
try mount

say "init system and services (how a program would start at boot)"
if have systemctl; then try systemctl --version; try systemctl list-units --type=service --state=running --no-pager; try systemctl list-unit-files --type=service --no-pager; else echo "systemctl not found"; fi
[ -d /etc/init.d ] && { echo "--- /etc/init.d"; ls /etc/init.d; }
[ -d /etc/systemd/system ] && { echo "--- /etc/systemd/system"; ls -la /etc/systemd/system; }

say "running processes"
if have ps; then ps -ef 2>/dev/null || ps aux 2>/dev/null || ps; fi

say "tools available"
for t in docker podman systemctl chromium chromium-browser qtbrowser sh bash curl wget tar gzip unzip sqlite3 python3 openssl ssh sshd; do
  if have "$t"; then echo "$t: $(command -v "$t")"; else echo "$t: not found"; fi
done

say "network"
if have ip; then try ip addr; else try ifconfig; fi
if have ss; then try ss -ltnp; elif have netstat; then try netstat -ltn; fi

say "where a web runtime would be installed (read only)"
for d in /opt /usr/local /home /data /var/lib; do [ -d "$d" ] && { echo "--- $d"; ls -la "$d" | head -30; }; done

say "the panel's own browser (what shows the screen)"
if have ps; then (ps -ef 2>/dev/null || ps aux 2>/dev/null) | grep -i -E 'browser|chrom|qt|webengine|kiosk' | grep -v grep; fi

echo
echo "done. changed nothing."
