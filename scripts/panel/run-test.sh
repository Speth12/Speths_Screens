#!/bin/sh
# Starts Speth's Screens on the panel for a test. It listens on the panel itself only (127.0.0.1), so
# nothing on the network can reach it, and it keeps its history in memory so the test writes almost
# nothing to the panel's flash. Everything it creates is in this folder; delete the folder to remove it.
#
#   cd /home/admin/panel-test
#   sh run-test.sh                      # the design directions sample (no PLC needed)
#   sh run-test.sh loadtest.screens.json   # a heavy screen: 250 widgets, 500 driven properties
#
# Stop it with Ctrl+C. Then point the panel's Web application URL at  http://localhost:8090
cd "$(dirname "$0")" || exit 1
PROJECT="${1:-design-directions.screens.json}"
[ -f "$PROJECT" ] || { echo "no such project file here: $PROJECT"; exit 1; }
chmod +x ./speths-screens
echo "Speth's Screens on this panel, project $PROJECT"
echo "Open  http://localhost:8090  in the panel's Web application URL. Ctrl+C stops it."
exec ./speths-screens --mode=runtime --addr=127.0.0.1:8090 --project="$PROJECT" --history=:memory:
