# LAN HTTPS Site

A local multiplayer tabletop site for campaigns, characters, maps, inventories, dice, and optional AI storytelling and artwork. One computer hosts the Python server; players connect through their browsers on the same network.

## Contents

- [Quick start](#quick-start)
- [First-time setup](#first-time-setup)
- [Playing and creating](#playing-and-creating)
- [Optional AI tools](#optional-ai-tools)
- [Development](#development)
- [Project layout](#project-layout)
- [Backups and moving computers](#backups-and-moving-computers)
- [GitHub](#github)
- [Troubleshooting](#troubleshooting)

## Quick start

**Already set up?**

1. Double-click **[START SITE.cmd](START%20SITE.cmd)**.
2. Keep the server terminal open.
3. On the host computer, open **https://localhost:8443**.
4. Give players the **Other devices** address printed in the terminal, such as `https://192.168.1.20:8443`. Their devices must be on the same LAN or Wi-Fi.
5. Press **Ctrl+C** in the server terminal when you want to stop the site.

The site uses a self-signed HTTPS certificate. On the first visit, continue through the browser warning only if you recognize the host address. If Windows asks about network access, allow Python on **Private networks**.

> After updating Python files, restart the server. After updating browser files, refresh with **Ctrl+F5**.

## First-time setup

Use **Python 3.11 or newer**. Run commands from the project root—the folder containing this README. Internet access is needed to install dependencies.

### Windows

Open PowerShell in the project folder and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
```

This creates `.venv` and installs the packages in [requirements.txt](requirements.txt). Then use **START SITE.cmd**. The launcher prefers this project environment.

To start manually with that environment:

```powershell
.\.venv\Scripts\python.exe server.py
```

### macOS or Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

The optional local GPU artwork installer currently targets Windows with NVIDIA hardware. See [Local AI artwork](docs/LOCAL-ART.md).

## Playing and creating

### Campaigns, characters, and the Archive

- Create an account, then create a campaign or accept an invitation from the notification bell.
- Players can join before making a character. Use **Create your character** in the party row or add one in **Player Characters** later.
- Members can see each other's characters. A character's owner and the DM can edit it.
- Members can browse spells, abilities, races/species, backgrounds, classes, feats, map parts, artwork, and lore. Items and treasure follow their ownership and visibility rules.
- Reading a reference card does not grant it. Use **Create playable copy** when you want to keep the reference and give a playable version to a character.

The starter library is a curated collection, not a complete rules database. Library contents vary with the campaign ruleset and installed catalogs. See [rules attribution](site/rules-attribution.html) and [artwork attribution](site/artwork-attribution.html).

### Maps and player tools

Build maps in **Edit** mode and play in **Story** mode. Scene settings are shared across maps in the same campaign; map layouts and character positions remain separate.

Player tools include character scaling, a stats-and-notes overlay, trading and stealing, and item or dice requirements for opening containers and taking their contents. Opening requirements and take/steal requirements are configured separately.

Exit-location markers control where a player arrives from a linked map. They are visible while editing and hidden in Story mode.

For household props, business goods, furniture, and modular counters, see the [catalog guide](docs/BUSINESS-CATALOG.md).

### Inventory, equipment, and dice

Inventory supports quantities, equipment slots, hand conflicts, armor-derived AC, carried weight, and attunement. Unequipping keeps the item in inventory. Matching looted goods stack on their holder instead of creating duplicate archive cards.

For renamed or magical equipment, the DM can set **Base equipment name** and explicit equipment rules. Descriptions alone do not grant mechanical permissions. Conditions, class features, spell spending, and other situational rules still need player or DM input.

Click the **Inventory** heading to switch to the dice roller. Select the die and modifiers, then click the illustrated die. D20 checks support advantage and disadvantage; use **Dice & Table Rules** for multi-die expressions. Ordinary dice-tray results are not automatically posted to AI chat. Required map-interaction rolls use their own approval flow.

### Spell Atelier

Open **Spell Atelier** from the campaign side menu to build spells from symbols.

| Action | Control |
| --- | --- |
| Add a symbol | Drag it from a palette, or click it |
| Select several | Shift-click or drag a selection |
| Move, resize, rotate | Drag the symbol or its handles |
| Keep proportions | Hold Shift while resizing |
| Pan | Pan tool, Space-drag, or middle mouse |
| Zoom | Mouse wheel or the zoom buttons |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Copy / paste | Ctrl/Cmd+C / Ctrl/Cmd+V |
| Duplicate / delete | Ctrl/Cmd+D / Delete |

**Ask AI to read spell** interprets the design; **Draw my spell** streams an AI-generated drawing. **Stop drawing** preserves the partial result. Editing a design invalidates its previous reading. Drafts are saved in the browser per account and campaign; previews do not change campaign stats.

The glyphs and solver are fan interpretations. Proposed symbols are labeled, and AI output is not official canon. Basic checking and previews remain available without Ollama.

### Languages

The interface selects French for a French-language browser and English otherwise. Override this under **Account settings → Interface language**. UI translations are local; saved names, notes, chat, reference text, and text inside images are not automatically translated.

Ollama helpers receive the preferred language and instructions to understand multilingual prompts. You can request another response language explicitly. Results depend on the installed model.

## Optional AI tools

### Storytelling and character drafts

Install Ollama and the models you want to use on the host computer, then select a model in the campaign. Model files are separate from this repository.

The storyteller can narrate, update permitted scene fields, create campaign records, and grant cards. HP, XP, levels, spell slots, and equipment effects remain sheet actions. **Create from an idea** generates a character draft for you to review and save; it does not automatically grant equipment or create a portrait.

Story helpers prepare short continuity notes in the background. The storyteller uses available notes without waiting for a new helper response. Notes expire after five minutes and are cleared on restart; GPU contention can still affect speed.

### Local image generation

Read [Local AI artwork](docs/LOCAL-ART.md) for hardware, downloads, and generation settings. On a supported host, install the optional components with the project interpreter:

```powershell
.\.venv\Scripts\python.exe scripts/setup_local_art.py
.\.venv\Scripts\python.exe scripts/setup_background_removal.py
```

These installers download the image engine, models, and background-removal components. They are not needed for ordinary campaign play.

## Development

### VS Code

1. Open [LAN-HTTPS-Site.code-workspace](LAN-HTTPS-Site.code-workspace).
2. Install the recommended Microsoft Python and Python Debugger extensions.
3. Run **Terminal → Run Task → Setup Python environment (Windows)** if you have not completed setup.
4. Run **Python: Select Interpreter** and select `.venv/Scripts/python.exe` (`.venv/bin/python` on macOS/Linux).
5. Press **F5** and select **LAN site: HTTPS (8443)**. Stop any other server using that port first.

Tasks also include **Run LAN site**, **Install Python dependencies**, and **Python unit tests**.

### Visual Studio

Open [LAN-HTTPS-Site.sln](LAN-HTTPS-Site.sln) with the **Python development** workload installed. Select the existing `.venv` in Python Environments, set **LAN-HTTPS-Site** as the startup project, and press **F5**.

### Editing and testing

| What to change | Where to start |
| --- | --- |
| Server routes and request handling | [backend/server.py](backend/server.py) |
| Campaign maps and shared state | [backend/campaign_maps.py](backend/campaign_maps.py) |
| Persistence and accounts | [backend/storage.py](backend/storage.py) |
| Main interface | [site/index.html](site/index.html), [site/app.js](site/app.js) |
| Map interface | [site/map-workspace.js](site/map-workspace.js), [site/map2d.js](site/map2d.js) |
| Main styles | [site/styles.scss](site/styles.scss) |
| French translations | [site/i18n/fr.json](site/i18n/fr.json) |

The root `server.py` is a launcher. Custom Python scripts importing backend modules directly must add `backend/` to their import path.

With the project Python environment selected or activated:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

Selected JavaScript checks require Node.js:

```bash
node --test tests/spell-engine.test.cjs
node tests/tabletop-rules.test.cjs
```

Browser checks use Playwright and isolated preview fixtures. Some historical scripts contain machine-specific paths; inspect their setup before running them. They are separate from the Python test task.

If you edit the main Sass file, compile it with a separately installed Sass CLI:

```bash
sass site/styles.scss site/styles.css --style=compressed
```

## Project layout

| Path | Purpose |
| --- | --- |
| `backend/` | Python server, campaign rules, persistence, AI services |
| `site/` | Browser UI, translations, bundled libraries, catalog assets |
| `scripts/` | Environment setup and optional model installers |
| `tests/` | Unit tests, browser checks, preview fixtures, artifacts |
| `docs/` | [Artwork setup](docs/LOCAL-ART.md) and [catalog guide](docs/BUSINESS-CATALOG.md) |
| `data/` | Local accounts, campaigns, uploads, audio |
| `.cert/` | Local HTTPS certificate and private key |
| `local-art/` | Downloaded image engine and models |
| `art-source/` | Working source artwork |
| `logs/` | Local server diagnostics |
| `.vscode/` | Editor settings, tasks, debug configuration |

The launchers, README, requirements, workspace, and solution stay at the root.

## Backups and moving computers

1. **Stop the server.**
2. Copy the entire **`data/` folder**, including `site.db`, uploads, and audio.
3. On the destination computer, install the project dependencies.
4. Restore `data/` before starting the server.

A fresh checkout creates an empty database and local certificate on startup. AI models must be installed separately. Keep your data backup separately from the source repository.

Accounts use salted password hashes. Account changes require the current password. Personal notes and campaign access remain subject to the site's ownership and membership checks.

## GitHub

The repository includes code, runtime catalog assets, and bundled browser libraries. Its `.gitignore` excludes saved data, certificates, downloaded models, virtual environments, logs, and working source artwork.

For a new repository, use **Source Control → Publish to GitHub** in VS Code. Review the files, create the initial commit if needed, and choose the repository name and visibility. If you publish through the command line, create an empty GitHub repository first, then replace `YOUR-ACCOUNT` below:

```bash
git add .
git commit -m "Initial LAN site project"
git remote add origin https://github.com/YOUR-ACCOUNT/lan-https-site.git
git push -u origin main
```

If a remote already exists, inspect it with `git remote -v` instead of adding `origin` again.

**GitHub stores the source.** GitHub Pages cannot run this Python backend; the host computer must run the server for accounts, saved campaigns, and AI features.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Another device cannot connect | Use the terminal's LAN address, not `localhost`. Check the network and Python's Private-network firewall permission. Guest Wi-Fi may block connections between devices. |
| Browser shows a certificate warning | A self-signed LAN certificate is expected. Verify that the address belongs to your host before continuing. |
| Port 8443 is already in use | Stop the other server, or run `python server.py --port 9443` with the project environment and use port 9443 in the browser. |
| Python package is missing | Rerun the setup task, or run `python -m pip install -r requirements.txt` with the selected project interpreter. |
| Changes do not appear | Restart for Python changes; use Ctrl+F5 for browser changes. |
| AI does not respond | Check that Ollama is running on the host and that the campaign's selected model is installed. |
| Image generation fails or is slow | Check `local-art/last-error.log`, try 512 pixels, and consult the [artwork guide](docs/LOCAL-ART.md). |
| Campaigns are missing after moving computers | Stop the server and check that the original `data/` folder was restored, rather than just copying the source files. |

[Back to contents](#contents)
