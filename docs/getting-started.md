# Getting started with Speth's Screens

A short path from download to a live screen. Each step links to the [install guide](install.md) for the details.

## 1. Download

No release has been published yet. Until one is, build the same files from the source code with
`node scripts/release/build.mjs --version=v0.8.0` (needs Go and Node; see the install guide, section 10).

From the [latest release](https://github.com/Speth12/Speths_Screens/releases/latest) get:

- the runtime for your PC: `speths-screens-<version>-windows-amd64.exe` (or `-linux-amd64`). The IDE is built in.
- the sample projects (`demo.screens.json` and others).
- for a WP 6000 panel: `speths-screens-<version>-panel-linux-arm64.tar.gz`.

## 2. Start the runtime and the IDE (PC)

Double-click the program. It runs for this PC only, keeps its files in `%LOCALAPPDATA%\Speths Screens\`, picks the
first free port from 8080 and opens the IDE in your browser. Nothing else needs installing. (Starting it from a command
line works the same with no arguments; to add an option such as `--no-browser`, also give `--desktop`, or it starts as
a development runtime on port 3001.)

- IDE (design): <http://localhost:8080/ide/>
- Operator screen (what operators see): <http://localhost:8080/>

To start it with a project instead:

```powershell
.\speths-screens-v0.8.0-windows-amd64.exe --mode=runtime --project=demo.screens.json
```

## 3. Try it without a PLC

In the IDE open `demo.screens.json` (**File → Open project file…**), press **Deploy** to **This PC**, then look at
<http://localhost:8080/>. The demo uses calculated and memory tags, so no PLC is needed. The **Data** switch in the IDE
also shows made-up values while you design.

## 4. Connect to a PLC

**On the controller (PLCnext Engineer)**

- REST reaches only global variables with the **HMI** attribute; OPC UA only those with the **OPC** attribute. Set the
  one you need and write the project to the controller.
- Note the controller's address and whether it needs a login.

**In the IDE**

1. Open **Datasources → + Add**. Pick the type and enter the controller's **IP address** (OPC UA also asks for the port,
   4840). For OPC UA choose **Sign & Encrypt** and **Basic256Sha256**.
2. Press **Test**, then **Pin** before **Add**. Controllers use self-signed certificates, and a datasource added
   without a pin will not connect: its status says "certificate not pinned yet". REST and OPC UA have different
   certificates, so pin each. (To pin one added already: open its tab, Test connection, Pin it, Save changes.)
3. Enter the username and password if the controller needs them.
4. Press **Deploy**. The datasource's tab should say **Connected** within a few seconds; until a datasource is deployed
   the runtime does not know it and nothing can be browsed.
5. Open the **Variables** tab to browse the controller's variables and give them names (`ns:Line1.Temp`) so screens do
   not depend on one protocol. **OPC UA lists what the controller offers; REST may list nothing** (some controllers
   expose no list over REST), so for REST type the variable's path, such as `rest:Arp.Plc.Eclr/Setpoint`.
6. Add widgets, bind each to a tag, then **Deploy** again.

Only tags a screen, alarm or script uses are polled. A tag that shows **Bad** has its reason on hover (usually a missing
HMI/OPC attribute, a wrong path or an unreachable controller).

Writes from the operator screen are checked (a writable widget, the user's role, the widget's limits), sent, then read
back, and the screen shows whether the PLC confirmed them.

## 5. Put it on a WP 6000 panel (optional)

```powershell
scp speths-screens-v0.8.0-panel-linux-arm64.tar.gz admin@<panel>:/home/admin/
ssh admin@<panel> "mkdir -p panel-test && tar -xzf speths-screens-v0.8.0-panel-linux-arm64.tar.gz -C panel-test"
ssh admin@<panel> "cd panel-test && SPETHS_LISTEN=:8090 sh install-service.sh"
```

Then in the panel's settings, **Web application**, set `http://localhost:8090/`. In the IDE open the target gear, add
`http://<panel>:8090`, select it and press **Deploy**.

`SPETHS_LISTEN=:8090` opens the panel to the network **with no login**. Use it on a trusted network only, or turn on
logins (below).

## 6. Before real use

- **Security:** project setting `none` means no login and a "Security off" badge. For a shared network use `login`: the
  runtime writes a random `admin` password to `initial-admin-password`, and the first login must change it.
- **Updates:** replace the runtime program; project and data files are kept. The operator screen is inside the runtime,
  so an old runtime shows the old screen.
- **Never commit** passwords, tokens, `*.pem` or `project/project.json`.

Stuck? See [Troubleshooting](install.md#9-troubleshooting).
