# Install guide

How to install and run Speth's Screens: the runtime on a PC or on a Phoenix Contact WP 6000 web panel, the IDE
that designs screens, and how to connect it to a PLCnext controller.

- [1. What you are installing](#1-what-you-are-installing)
- [2. Run the runtime on a PC](#2-run-the-runtime-on-a-pc)
- [3. Run the IDE](#3-run-the-ide)
- [4. Install on a WP 6000 panel](#4-install-on-a-wp-6000-panel)
- [5. Run it in Docker](#5-run-it-in-docker)
- [6. Connect to a PLC](#6-connect-to-a-plc)
- [7. Security and logins](#7-security-and-logins)
- [8. Update](#8-update)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Reference](#10-reference)

## 1. What you are installing

| Part | What it is | Where it runs |
| --- | --- | --- |
| **Runtime** | One program (`speths-screens`). It talks to the PLCs, keeps the tag values, runs alarms, the historian, logins and scripts, and serves the **operator screen** to any browser. | A PC, a server or the panel |
| **IDE** | A web app where you design screens and deploy them to a runtime. | Your PC, in a browser. The runtime for Windows and Linux PCs serves it at `/ide/`. |
| **Project** | One file, `<name>.screens.json`, holding the screens, tags, alarms and scripts. | The IDE saves it; the runtime loads it |

The operator screen is built into every runtime, so a panel needs only the runtime. The **IDE is built into the
runtime for Windows and Linux PCs** (`windows-amd64` and `linux-amd64`): start it and open `/ide/` (section 3). The
**panel package has no IDE**: the panel only runs the program you deploy to it, and you design on your PC. The IDE is
also available from the source code, for development.

Ports used: **8080** is the runtime's default and **8090** is used on the WP panel (the panel's own settings app,
Cockpit, holds 8080). The IDE uses **5173** and a development runtime **3001**.

## 2. Run the runtime on a PC

The runtime is one file with nothing to install (no database, no Node, no Go).

1. Open the [latest release](https://github.com/Speth12/Speths_Screens/releases/latest) and download the runtime for
   your system:
   - `speths-screens-<version>-windows-amd64.exe` for Windows (with the IDE)
   - `speths-screens-<version>-linux-amd64` for Linux on a PC or server (with the IDE)
   - `speths-screens-<version>-linux-arm64` for 64-bit ARM Linux (runtime only, no IDE; the panel package is the same program)
   - the sample projects (`demo.screens.json` and others) beside them

   File names below use `v0.8.0` as an example: use the version you downloaded.
2. Check the download against `SHA256SUMS` from the same release (`Get-FileHash <file>` in PowerShell).
3. Start it with a project. In PowerShell, in the folder where you saved the files:

   ```powershell
   .\speths-screens-v0.8.0-windows-amd64.exe --mode=runtime --project=demo.screens.json
   ```

4. Open <http://localhost:8080/> for the operator screen and <http://localhost:8080/ide/> for the **IDE**. Windows may ask to allow network access the first time; allow it on a private
   network if other devices (a phone, a tablet) should reach the screen at `http://<this-PC's-address>:8080/`.

`--version` prints the version. The runtime keeps its data next to where you start it: `history.db` (trends),
`alarms.db`, `security.db` (users), `recipes.db`, `memory.db` (retained values) and `versions.db`. Start it from the
same folder each time, or give each file a path (section 10). Press Ctrl+C to stop it.

To run it as a Windows service or at logon, use Task Scheduler (trigger: at logon; action: the command above, "start
in" set to your folder) or a service wrapper such as NSSM.

## 3. Run the IDE

### With the runtime you downloaded (nothing else to install)

Start the Windows or Linux runtime (section 2) and open <http://localhost:8080/ide/>. The IDE is part of the runtime
program, so its version always matches the runtime's, and the **Local** target (the gear in the header) is that
runtime: use **Deploy** to put the open project on it, then look at <http://localhost:8080/> for what operators see.
This is the way to design and try screens on one PC.

Press **Deploy** to send a project to this runtime, or add the address of another runtime (the panel) as a target
(below). Starting the runtime with `--no-ide` turns the IDE off.

### From the source code (for development)

You need [Git](https://git-scm.com/), [Node.js 22](https://nodejs.org/)
and, only if you also want to build the runtime yourself, [Go 1.25](https://go.dev/dl/).

```powershell
git clone https://github.com/Speth12/Speths_Screens.git
cd Speths_Screens
npm ci
npm run dev          # the IDE, on http://localhost:5173
```

Open <http://localhost:5173/>. To try screens against live data, run a runtime on the same PC in development mode in a
second window (it listens on this PC only):

```powershell
go run ./cmd/speths-screens --mode=dev --project=demo.screens.json     # port 3001
```

(With a downloaded runtime: `.\speths-screens-...exe --mode=dev --project=demo.screens.json`.)

To work with a runtime on **another machine** (the panel, a server), open the **target** gear in the IDE's header, add
a target such as `http://10.0.0.118:8090`, select it and use **Pull** (read its project) or **Deploy** (send it yours).
The runtime has to be listening on the network for that (section 4). A runtime accepts requests from the IDE run with
`npm run dev` (port 5173) and from its own address; any other address, such as the IDE served by the runtime on your
PC (`http://localhost:8080`), has to be named with `--cors-origins` on the runtime you deploy to (section 4 shows
how on the panel).

Useful in the IDE: **New** (built-in or custom header and navigation), **Save** and **Load** (any `.json` file),
**Preview**, the **Desktop / Tablet / Phone** switch, the **Data** switch (live or made-up values for designing with
no PLC) and **Project properties** (settings, header and navigation, users, audit, export).

## 4. Install on a WP 6000 panel

Tested on a Phoenix Contact **WP 6101** web panel (Linux on ARM64 with a Chromium-based browser). The runtime runs as
a service of the panel's `admin` user and the panel's own screen shows it. You do not need `sudo`.

**You need** the panel's address, its `admin` password, and a PC on the same network with `ssh` and `scp` (Windows 10
and later include them).

1. **Download** `speths-screens-<version>-panel-linux-arm64.tar.gz` from the
   [latest release](https://github.com/Speth12/Speths_Screens/releases/latest). It holds the runtime, three scripts and
   a sample project.
2. **Copy it to the panel and unpack it** (replace the address with the panel's):

   ```powershell
   scp speths-screens-v0.8.0-panel-linux-arm64.tar.gz admin@10.0.0.118:/home/admin/
   ssh admin@10.0.0.118 "mkdir -p panel-test && tar -xzf speths-screens-v0.8.0-panel-linux-arm64.tar.gz -C panel-test"
   ```

3. **Install the service** on the panel. This starts the runtime now and at every boot:

   ```powershell
   ssh admin@10.0.0.118 "cd panel-test && sh install-service.sh"
   ```

   It prints the service status and `Check: curl ... (200 means it is up)`. It listens on the **panel only**
   (`127.0.0.1:8090`) with the sample project.

4. **Show it on the panel's screen.** In the panel's settings, open **Web application** and set the address to
   `http://localhost:8090/`. Restart the panel and check the screen comes back by itself.

### Design on your PC and deploy to the panel

By default nothing on the network can reach the runtime. To let the IDE on your PC Pull and Deploy:

```powershell
ssh admin@10.0.0.118 "cd panel-test && SPETHS_LISTEN=:8090 SPETHS_CORS=http://localhost:8080 sh install-service.sh"
```

`SPETHS_CORS` is the address of the IDE you design in: `http://localhost:8080` for the IDE of a runtime on your PC at
its default port (use the address and port you actually open; separate several with commas). Leave it out if you only
use the IDE from the source code with `npm run dev`. Nothing else is opened by it.

Check <http://10.0.0.118:8090/> answers from your PC, then add it as a target in the IDE (section 3).

> **This has no login unless the project turns security on.** Anyone who can reach the panel can deploy a project to
> it, write to its tags and read everything. Use it only on a network you trust, and close it again with
> `ssh admin@10.0.0.118 "cd panel-test && sh install-service.sh"` (without `SPETHS_LISTEN`). To require logins, see
> section 7.

A fixed address for the panel (a DHCP reservation in your router) saves you from changing the target.

### Notes

- **Trend history is kept in memory on the panel** (`--history=:memory:`) to spare its flash; it is lost at a
  restart. To keep it, edit `~/.config/systemd/user/speths-screens.service`, replace `--history=:memory:` with
  `--history=/home/admin/panel-test/history.db`, then `systemctl --user daemon-reload` and
  `systemctl --user restart speths-screens`. Watch the write load on the panel's storage first.
- **Another project at start-up:** copy it to `panel-test` and run `sh install-service.sh <file>.screens.json`.
- **Logs:** `journalctl --user -u speths-screens -n 50 --no-pager`
- **Remove it:** `sh uninstall-service.sh`
- **Trying it by hand:** `sh run-test.sh [project]` runs it in the foreground; Ctrl+C stops it. Stop the service
  first (two copies cannot use port 8090).
- Adding `?perf` to the web application address (`http://localhost:8090/?perf`) shows a small frame-rate readout in
  the corner for testing; leave it off in use.
- More about the panel scripts and what was measured on a WP 6101 is in [`scripts/panel/README.md`](../scripts/panel/README.md).

## 5. Run it in Docker

For a Linux server or a PC with Docker. The image is built from the source.

```sh
git clone https://github.com/Speth12/Speths_Screens.git
cd Speths_Screens
cp project/project.example.json project/project.json     # your project; or save one from the IDE here
docker compose up -d --build
```

The screen is at `http://<host>:8080/` (set `SPETHS_PORT` to use another port). The project is read from `./project`
and the data (history, users, alarms, recipes) lives in the `speths-data` volume. `docker compose logs -f` shows the
log.

`project/project.json` holds real PLC credentials once you fill them in: it is git-ignored, so keep it out of commits.

## 6. Connect to a PLC

Speth's Screens reads and writes a PLCnext controller over **REST** or **OPC UA** (and Modbus TCP, MQTT or
calculated tags). Each is a **datasource** in the project.

### On the controller (PLCnext Engineer)

- **REST:** only global variables with the **HMI** attribute are reachable.
- **OPC UA:** only variables with the **OPC** attribute are reachable.
- These are different lists: a variable can be reachable over one and not the other. Set the attribute you need in
  PLCnext Engineer and write the project to the controller. Variables set up on neither are not available to any
  datasource.
- Note the controller's address and whether it needs a login (users and rights are set up on the controller).

### In the IDE

1. Open **Datasources** and **Add datasource**. Pick the type and fill in the address:
   - REST: `https://<controller>`
   - OPC UA: `opc.tcp://<controller>:4840`
2. Controllers use **self-signed certificates**. Press **Test**: it shows the controller's certificate fingerprint.
   Choose **pinned** and paste it, so the runtime only talks to that controller. `trusted` checks against the normal
   certificate authorities, and `off` skips the check (do not use it on a real network).
3. If the controller needs a login, enter the username and password. They are stored in the project **on the
   runtime**; the IDE never shows them again, and a Pull leaves them blank. Never commit a project that
   holds real credentials.
4. **Bind widgets to tags.** A tag path is `<datasource id>:<variable>`, for example `rest:Arp.Plc.Eclr/Setpoint` or
   `opcua:ns=6;s=Arp.Plc.Eclr/Setpoint`. The IDE's tag picker lists what the controller offers. You can also put variables in
   the **namespace** (`ns:Line1.Temp`; the Variables tab in the IDE gives variables their names) so a screen does not depend on one protocol.
5. **Deploy** to the runtime. Only tags a screen, alarm or script uses are polled.

A write from the operator screen is checked before it reaches the PLC: the tag must be used by a writable widget (or a
script's write list), the user's role must allow it, and the value must be inside the widget's limits. It is then read
back, and the screen shows whether the PLC confirmed it.

### Try it without a PLC

`demo.screens.json` and the `design-directions` and `feature-tour` samples need no PLC (they use calculated and
memory tags). `plc-demo.screens.json` talks to a real controller: set its address and pin the certificates first.

## 7. Security and logins

A project's **Security** setting decides how the runtime behaves:

- **`none`** (the default): no login, everyone acts as an administrator, and the operator screen shows a "Security
  off" badge. Fine on a closed bench; not on a shared network.
- **`login`:** every request except the login page needs a token, including the operator screen's data. On the first
  start with no users the runtime creates an `admin` with a **random password written to
  `initial-admin-password`** (readable only by its owner, next to `security.db`); the first login must change it,
  which deletes the file. Users and roles (operator, supervisor, engineer, admin) are managed in the IDE under
  **Project properties → Users**.

Switching a project from `login` to `none` needs a logged-in deploy. The development runtime listens on this PC only.

## 8. Update

- **Runtime:** stop it, replace the binary with the new release's, start it. The project and data files are not
  touched. On the panel:

  ```powershell
  scp speths-screens admin@10.0.0.118:/home/admin/panel-test/speths-screens.new
  ssh admin@10.0.0.118 "cd panel-test && systemctl --user stop speths-screens && mv speths-screens.new speths-screens && chmod +x speths-screens && SPETHS_LISTEN=:8090 sh install-service.sh"
  ```

  (`speths-screens` is the file inside the panel package; leave out `SPETHS_LISTEN=:8090` to keep the panel closed to
  the network.) The operator screen is **built into the runtime**, so a runtime from before a screen change keeps
  showing the old screen however new the IDE is. Check with `speths-screens --version`.
- **IDE:** it is inside the runtime for Windows and Linux PCs, so it updates with the runtime. From the source code:
  `git pull`, `npm ci`, `npm run dev`.
- **Projects:** an older project file is upgraded when it is loaded (the IDE and the runtime both do it).
  A runtime that is older than a project refuses it ("the project is format 6; this version reads up to 5"): update
  the runtime. `speths-screens upgrade <file>` upgrades a file on disk and keeps a `.bak`.

## 9. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The panel or screen shows an old look after you updated | The operator screen is inside the runtime binary. Install a runtime built after the change, then reload the page (Ctrl+F5). |
| "the project is format N; this version reads up to M" | The runtime is older than the project. Update the runtime (section 8). |
| The IDE cannot Pull or Deploy to the panel | The panel is listening on itself only: run `install-service.sh` with `SPETHS_LISTEN=:8090`. Check <http://panel:8090/> in your browser. Wi-Fi can block wired devices: use a cable. |
| Port 8080 is in use on the panel | That is the panel's settings app. Use 8090 (the scripts do). |
| A tag shows **Bad** | The reason is shown on hover and in the datasource list. Usual causes: the variable lacks the HMI (REST) or OPC (OPC UA) attribute, the path is wrong, or the controller is unreachable. "no answer from … (timed out)" means the network. |
| A datasource will not connect and the log says the certificate was refused | The pinned fingerprint does not match (the controller's certificate changed or the pin is empty). Press **Test** in the IDE and pin the new fingerprint. |
| A write fails with "not writable in this project" | No writable widget (button, input, setpoint) is bound to that tag, or it is not in a script's write list. |
| A write says `not_confirmed` | The PLC accepted it but its program changed the value back (for example it copies another variable over it). Write the variable the program reads. |
| Charts are empty after a restart on the panel | History is in memory there by default (section 4 notes). |
| "JWT secret auto-generated; tokens will be invalidated on restart" | Normal. Pass `--jwt-secret` (32 or more random bytes) to keep logins across restarts. |

## 10. Reference

**Runtime options** (`speths-screens --help` lists them all):

| Option | Default | Meaning |
| --- | --- | --- |
| `--mode` | `dev` | `dev` (this PC only, no login) or `runtime` |
| `--addr` | `127.0.0.1:3001` dev, `:8080` runtime | Address to listen on. `:8090` listens on every network interface. |
| `--project` | none | The project file to load. A deploy from the IDE replaces it. |
| `--history`, `--history-retention` | `history.db`, 7 days | Trend database (`:memory:` keeps none) and how long to keep it |
| `--alarm-db`, `--security-db`, `--recipe-db`, `--memory-db`, `--version-db`, `--audit-db` | files in the working folder (the audit log is off unless `--audit-db` is set) | Where each store lives |
| `--cors-origins` | none | Extra web origins allowed to call the API (a differently hosted IDE) |
| `--jwt-secret` | random | Signs login tokens |
| `--version` | | Print the version and exit |
| `--healthcheck` | | Exit 0 if a runtime on `--addr` answers |

**Files:** projects `*.screens.json` (the IDE opens any `.json`); `schema.json` in the repository defines the format.

**Never commit** passwords, tokens, `*.pem`, `project/project.json`, or `panel-probe.txt` (it holds the panel's
addresses).

**Building the release files yourself** (needs Go, Node and `tar`):

```powershell
node scripts/release/build.mjs --version=v0.8.0
```

writes the Windows, Linux and panel files, the sample projects and `SHA256SUMS` to `dist/v0.8.0/`. Pushing a tag
`v*` to GitHub does the same in CI and attaches the files to a **draft** release.
