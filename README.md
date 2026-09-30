# LAN HTTPS Site

This folder serves `site/` over HTTPS to devices on the same local network.

## Project layout

- `backend/` — Python server, campaign rules, storage, and AI services.
- `site/` — browser UI, styles, translations, bundled libraries, and catalog assets.
- `scripts/` — development environment and optional AI model installers.
- `tests/` — Python tests, browser checks, previews, and generated artifacts.
- `docs/` — artwork and catalog documentation.
- `logs/` — local server logs (ignored by Git).
- `data/`, `.cert/`, `local-art/` — local saved data, certificates, and models (ignored by Git).

Start the site using **START SITE.cmd**, the VS Code workspace, or
`python server.py` from the root. The root `server.py` is a small launcher;
edit `backend/server.py` for server behavior. Custom Python scripts that import
backend modules directly should add `backend/` to their Python import path.

## Development in VS Code or Visual Studio

Use **Python 3.11 or newer** and Git. The backend remains Python and the frontend
remains HTML/CSS/JavaScript; no .NET conversion is required.

### VS Code

1. Open **LAN-HTTPS-Site.code-workspace** (or open this folder).
2. Install the recommended Microsoft Python and Python Debugger extensions.
3. Run **Terminal > Run Task > Setup Python environment (Windows)**. This creates
   `.venv` and installs `requirements.txt`. Alternatively, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
   ```

4. Run **Python: Select Interpreter** from the Command Palette and select
   `.venv/Scripts/python.exe`.
5. Press **F5**, select **LAN site: HTTPS (8443)**, and open
   `https://localhost:8443`. Stop any existing server on that port first.

The **Python unit tests** task and Testing panel run the Python suite. Browser
scripts in `tests/` are separate historical tools; some still require local
Playwright installations and machine-specific paths. They are not part of this
workspace's automatic test command.

On macOS/Linux, create the environment with `python3 -m venv .venv`, then run
`.venv/bin/python -m pip install -r requirements.txt` and select that interpreter.
The optional local GPU image engine currently targets Windows/NVIDIA.

### Visual Studio solution

Open **LAN-HTTPS-Site.sln** in Visual Studio with the **Python development**
workload installed. Add/select the existing `.venv` under Python Environments
(run the setup command above first), set LAN-HTTPS-Site as the startup project,
then press F5. The `.sln` is for Visual Studio; VS Code uses the workspace above.
Python is interpreted, so there is no compiled .NET application to build.

### GitHub repository

The folder is configured for Git. `.gitignore` excludes accounts, campaigns,
uploads (`data/`), private TLS certificates (`.cert/`), downloaded image engines
and models (`local-art/`), virtual environments, logs, and generated previews.
Runtime catalog assets in `site/assets/` and bundled libraries in `site/vendor/`
remain included. Raw working artwork in `art-source/` stays local.

In VS Code, open **Source Control**, review the files, make an initial commit,
then choose **Publish to GitHub** and select the repository name and visibility.
Alternatively, create an empty repository on GitHub and run these commands from
this folder (replace `YOUR-ACCOUNT` and the repository name):

```powershell
git add .
git commit -m "Initial LAN site project"
git remote add origin https://github.com/YOUR-ACCOUNT/lan-https-site.git
git push -u origin main
```

Keep a separate backup of `data/` to move existing accounts, campaigns and uploads
to another computer. A fresh clone creates an empty database and fresh local
certificates on startup. Install dependencies before running `python server.py`.
Ollama and its models are installed separately. For pixel image generation, see
[LOCAL-ART.md](docs/LOCAL-ART.md) and run `python scripts/setup_local_art.py` plus
`python scripts/setup_background_removal.py` on the host when needed.

GitHub stores the source; GitHub Pages cannot run this Python backend. Continue
running the LAN server to use accounts, campaigns, and AI features.

## Start it

1. Double-click **START SITE.cmd**.
2. Keep the terminal window open.
3. Share the displayed `https://192.168.x.x:8443` address with people on the same Wi-Fi.
4. Press **Ctrl+C** in the terminal to stop it.

If Windows asks whether Python may communicate on private networks, select **Private networks** and allow it.

## Browser certificate warning

The server creates a self-signed certificate because public certificate authorities normally do not issue certificates for private LAN IP addresses. On the first visit, each device will likely show a privacy warning. Choose its advanced option and continue only if you recognize the IP as the host computer.

## Customize

Edit `site/index.html`, `site/styles.scss`, and `site/app.js`. The page uses locally bundled Bootstrap and jQuery. After changing Sass, compile it with `sass site/styles.scss site/styles.css --style=compressed`, then refresh the browser.

## Character equipment

Inventory now offers equip/unequip controls with hand conflicts, training and
Strength penalties, carried weight, armor-derived AC, and separate attunement.
Changes are saved per character through an ownership-checked transaction. Two
copies of a one-handed weapon can be equipped from a stack. Unequipping keeps
the item in inventory and does not end attunement or reduce carried weight.
Selling or transferring away copies removes their loadout effects.

The 2024 starter equipment names are recognized automatically. For renamed or
magic gear, the DM selects **Base equipment name** in the item editor. Custom
wearing positions, explicit ability/class prerequisites, magic bonuses, and
reviewed exceptions are editable there. Character equipment training exceptions
are DM-maintained in **Equipment rules**. Text descriptions are not interpreted
as permissions. Unknown rules, multiclass training, and non-2024 editions require
DM review. Equipment AC is shown separately so existing manually adjusted sheet
AC is not overwritten or counted twice. It is not a complete combat automation:
conditions, feature-specific actions, most magic effects, container contents,
ammunition consumption, and spell-component exceptions still need adjudication.
The existing custom currency stores value, not coin counts; enter actual coin
weight to include it. All owned cards count as carried, regardless of the legacy
“Stored” label. No fixed backpack inventory-slot limit is imposed.

Restart the Python server after updating. Checks: `python -m unittest discover
-s tests -p test_equipment.py` and `node tests/equipment-browser.cjs`. The browser
check uses an isolated temporary database and tests desktop/mobile controls.

## Archive visibility

Players may join and browse a campaign before creating a character. Use
"Create your character" in the party row or Add in Player Characters later;
the character form can be cancelled. Campaign members can view each other's
characters. Your own character appears first and uses the important glow in
the party row and character archive. Only its owner and the DM can edit it.

All accepted campaign members can browse spells, attacks and abilities, races and
species, backgrounds, classes, feats, map parts, artwork, and lore in the Archive,
including reference entries and their attached images. Items and treasure retain
their assignment and collection visibility rules. Browsing a spell or ability
does not grant it to a character. Editing permissions are unchanged, and archive
sharing does not give access to other campaigns or private conversations.

## Story helper performance

The storyteller uses helper notes that are already available; it never waits for
a fresh helper response. After a completed reply, one selected helper prepares
short continuity notes for a later turn. Selected helpers rotate, with at most
one background helper job across the server and no queued jobs. The first reply
has no helper notes. These are historical reminders, not research for the current
question; current messages and records take precedence.

Notes expire after five minutes, are bounded in memory, and are separated by
account, campaign, conversation, persona, audience, selected models, and visible
campaign context. Changed cards or profiles invalidate notes. Notes are lost on
restart. A busy or failed helper is skipped. Shared GPU contention and model
loading can still affect speed; this removes the mandatory helper waiting stage,
not the hardware cost of running another model.

## Spell Atelier

Inside a campaign, open the side scroll and choose **Spell Atelier**. The inventory,
attack and map/chat area becomes two symbol palettes and a parchment canvas.
Drag a symbol onto the canvas, or click it to add at the view center. Complete
examples include a fireball, water jet, gathering wind and stone-to-sand seal.

- Select and drag symbols to move them. Shift-click or drag an empty area to
  select several; drawing layers also let you select enclosing rings.
- Square handles resize/stretch, the round handle rotates, and colored arrows
  constrain movement to a symbol's local axes. Hold Shift while resizing to
  preserve proportions. Numeric fields provide precise measurements.
- **Snap**, **Grid** and **Angle** control distance and rotation increments.
  Wheel or +/− zoom; **Fit** frames the drawing. Pan with the Pan tool,
  Space-drag or the middle mouse button.
- Previous/next arrows undo and redo (Ctrl/Cmd-Z, Ctrl/Cmd-Shift-Z or Ctrl-Y).
  Delete removes selected symbols; Ctrl/Cmd-D duplicates. Escape cancels a drag.
- Ctrl/Cmd-C copies selected symbols; Ctrl/Cmd-V pastes new editable copies,
  preserving their relative layout and proposed-symbol descriptions. Each paste
  is one undoable change. Normal text clipboard behavior remains in text fields.
- Y coordinates increase upward in the ruler, cursor readout, layer list and
  position field. Existing saved drawings retain their positions.
- Drafts save on this browser, separately for each account and campaign. Edit
  history lasts for the current loaded draft. Casting is a visual preview.

**Ask AI to read spell** uses the campaign's configured Ollama model (or the first
installed model). The server retrieves and searches relevant sections of the
Independent Witch Hat Atelier Wiki's Magic, Signs and Sigils references. Lookups
are cached for six hours; if unavailable, the reader explicitly uses saved
research notes. Only fixed public reference URLs are fetched. Drawing geometry
is sent to local Ollama, not to those websites.

The reader receives measured positions, dimensions, rotations, containment,
nesting, relative areas, sign balance and nearby symbol pairs. It returns an
effect description, geometric reasoning, established mechanics and separately
labeled interpretations for invented spells. Accepted readings drive the canvas
animation; ambiguous or nonfunctional readings cannot cast. Editing invalidates
the previous reading. Without Ollama, the simpler local checker and previews work.

**Draw my spell** accepts a natural-language request and streams a new drawing
from Ollama. Each completed drawing instruction is validated and sent immediately
to the browser; symbols animate into place with explanations as the model works.
The outer ring is normally drawn open and closed last. Generated parts are spaced
inside their ring to avoid overlapping footprints. New drawings replace the
current draft only when their first valid part arrives. Every part is undoable.
**Stop drawing** preserves an editable partial draft. Navigation cancels the stream,
and stale responses cannot alter another campaign's draft. You can pan and zoom
while the AI draws; manual edits become available when it finishes or stops.

For requests whose mechanics are not established, such as a permanent-blindness
contact trap, the AI draws explicitly labeled purple **proposed symbols** and
explains which parts are conceptual. These labels and meanings survive saving,
copying and subsequent AI readings. A conceptual blueprint is not certified as a
working canonical spell. The request is limited to 2,000 characters and 40 drawing
steps, and failures preserve the parts already received.

Glyphs are original shorthand, and the solver is a fan interpretation: the series
does not define complete mathematical laws for arbitrary spells. AI outputs are
not official canon, and visual previews do not alter campaign stats or chat.

The backend must run the updated `server.py` for the AI endpoint. No new packages
are required. Tests: `node --test tests/spell-engine.test.cjs` and
`python -m unittest discover -s tests -p 'test_*.py'`. The browser test uses the
isolated `tests/serve_preview.py` server and Playwright with Edge; set
`PLAYWRIGHT_MODULE` if Playwright is installed outside the bundled runtime.
The live-stream browser test uses `tests/serve_design_preview.py` on loopback port
8767 with a deterministic AI fixture: run `node tests/spell-design.browser.cjs`.
It checks incremental delivery, interruption, clipboard groups, saved proposals
and positive-up coordinates without sending test requests to the real model.

## Accounts and saved work

The server creates data/site.db automatically. It contains user accounts,
login sessions, and saved work. Copy that file while the server is stopped to
make a backup. The database is outside the public site folder, so visitors
cannot download it.

Passwords are stored as salted PBKDF2 hashes, never as plain text. Login cookies
are HTTPS-only and inaccessible to page scripts. Database values use SQLite
parameters rather than executable SQL, and the API has no arbitrary SQL or
administrator command endpoint.

Signed-in users can change their username, email, or password from the account
window. Every settings change requires the current password, and a new password
must be entered twice.

Profiles and campaign records can include PNG, JPEG, GIF, or WebP images up to
5 MB. Uploads are stored under data/uploads outside the public website and are
served only after confirming that the signed-in account owns the image.

Campaigns remember their creator. Creators can invite existing accounts even
while those users are offline. Invitations are stored in the notification bell.
On first entry, an invited member must create a party character assigned to
their account. Only that player and the campaign creator can edit it.

Only the campaign creator can create shared campaign records. The creator marks
records as revealed when players discover them. Each player keeps separate
personal notes without changing the shared description. When signed in on the
server computer itself, the host can see every campaign and permanently delete
a campaign with its attached records.

## Tabletop rules and starter library

AI DM replies can now update the public scene (location, time, weather,
visibility, temperature, danger, pace and mood), create campaign cards, update
existing quests/encounters, and give cards to specific characters. Weapons and
items go to Inventory; spells and abilities go to Attacks & Spells. A grant from
the starter library creates a playable copy and keeps the original reference.
The AI receives character and record IDs to connect rewards and objectives to
the right people. Applied changes refresh automatically in the existing panels.
Invalid targets are skipped with a notice in the reply. The same reply cannot
apply its changes twice; editing or regenerating narration does not replay gifts.
Private replies cannot change the global scene or grant outside their audience.
HP, XP, levels, spell-slot spending and equipped-item effects remain sheet actions.
Restart the server after this update to enable the new reply processing.

In an AI campaign's new character form, **Create from an idea** accepts a
character prompt. **Generate character** uses the campaign's configured local
Ollama model to fill appearance, personality/history, class, statistics and
tabletop notes. Review the draft and click Save to create it. Generation itself
does not save records, assign ownership, grant equipment/spell cards or generate
a portrait. Model availability and generation speed depend on the host computer.
If generation fails, the current form stays intact. Closing the form discards a
pending result. Verify build choices with the DM before play.

New campaigns using revised fifth edition (2024) include 122 reference cards:
77 equipment and magic items, 19 starter spells, 13 actions, and 13 class / table
guides. Reference cards are available to read, but do not award gear or abilities.
The campaign creator can use **Create playable copy** on an item, spell, or
action reference, then link it to characters. Existing campaigns are not reseeded.
In item, spell and ability editors, **Give this … to characters** has a checkbox
for each character. Check recipients and Save to put the card in their matching panel;
uncheck and Save to remove it. Giving a reference card directly converts it to
a playable card; use Create playable copy first to retain the original reference.
Recipients can see their private gifts without revealing the card to everyone.
Panels update within a few seconds in normal and AI campaigns. Items appear
only in Inventory; spells, attacks and abilities appear only in Attacks & Spells.
Multiple checked recipients share one card and its quantity/settings; use
separate cards for separately tracked copies. Spell preparation and equipment
effects still follow the character's rules and are tracked on their sheet.
2014 and custom campaigns do not receive the 2024 library.

Character sheets track skills, saves, expertise, conditions, concentration,
spell slots, Pact Magic, Hit Dice, inspiration, equipment and feature notes.
Damage uses temporary HP first. Level and class features remain DM-controlled;
enter slot limits from your class table and save sheet changes. The dice tray
supports ordinary rolls and one-d20 advantage/disadvantage rolls. Rolls remain
local to the device. Encounters include saved initiative order and rounds.
Map placement is freeform; the DM adjudicates distances and turn legality.

Click the Inventory heading to switch that same panel to the dice roller, and
click again to return to items. Select D-4 through D-100 and click the illustrated
die. The face shows the die result; Total includes bonuses. For D-20 tests,
select an ability, skill or save from the active character's sheet. Expertise
and recorded 2024 exhaustion are included; contextual advantage/disadvantage
is selected manually. Other dice allow manual damage/healing modifiers.
Normal campaigns use the player's character; AI campaigns use the character
selected in the player tools/speaker menu. Changing characters clears manual
modifiers and old results. AI DMs are instructed to specify the dice, check and
roll mode and wait for the player to report the result. Rolls are not posted to
AI chat automatically. Use Dice & Table Rules for multi-die expressions.

Cards link to official rules. The starter library is a curated selection, not
every spell or class feature. See `site/rules-attribution.html` for SRD credit.
After updating the files, stop and restart **START SITE.cmd**, then refresh.

Verification uses isolated data: `python -m unittest discover -s tests` and
`node tests/tabletop-rules.test.cjs`. For the browser check, start
`python tests/serve_preview.py`, then run `node tests/browser-smoke.cjs` with
Playwright installed (or set `TABLETOP_PLAYWRIGHT` to its module path).
The preview uses temporary storage on port 8766, leaving `data/site.db` alone.
`node tests/rail-dice-browser.cjs` verifies the panel in both normal and AI
campaigns using the preview's isolated player fixtures.

## Interface and AI languages

The interface automatically uses French for a French browser (`fr`, `fr-CA`,
`fr-FR`, etc.) and English otherwise. Account settings → Interface language
can override this with English or French; save with your current password.
Existing accounts default to automatic detection. The local French catalog
(`site/i18n/fr.json`) requires no AI call or external translation service.
It translates interface labels and controls, including dynamically opened tools;
saved names, notes, chat messages, reference content, and text inside images or
map canvases are not automatically rewritten. Other interface languages currently
fall back to English and remain available through the browser's Translate menu.

Ollama requests include the selected/browser language. The storyteller, character
generator and other Ollama helpers are instructed to understand multilingual
prompts, answer in the language of the latest human request, and honor explicit
language requests. The preferred language is the fallback for ambiguous prompts.
JSON keys, canonical class names and other machine-readable values stay stable.
Actual language quality depends on the installed model. Existing English content
is preserved, and this does not add multilingual training to image models.
Restart the site after updating Python files and refresh each browser.

## Troubleshooting

- Both devices must be on the same Wi-Fi/LAN. Guest Wi-Fi often blocks device-to-device traffic.
- Allow Python through Windows Firewall on **Private** networks.
- If port 8443 is occupied, run `python server.py --port 9443` from this folder.
- Python 3 and the `cryptography` package are required. The launcher installs the package if needed.
