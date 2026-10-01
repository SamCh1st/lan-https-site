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
4. Give players the **Other devices** address printed in the terminal, such as `https://SamuelPortable:8443`. Their devices must be on the same LAN or Wi-Fi. The address uses the hosting computer’s current name automatically; on another host, it uses that computer’s name. Restart after renaming the computer. If a device cannot resolve the name, use the printed **IP fallback** address. HTTPS certificates are refreshed automatically when the host name or LAN IP changes. Switching from an IP address to the computer-name URL requires signing in again because browsers treat them as separate sites; browser-local drawing drafts remain at the old address.
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

The storyteller can narrate, update permitted scene fields, create campaign records, and grant cards. HP, XP, levels, spell slots, and equipment effects remain sheet actions. **Create from an idea** generates characters, NPCs, and encounters for review before saving. Open it from a new record or the creation buttons under AI chat. NPC and encounter creation requires the campaign creator. Generation follows the active chat's **Modern**, **Medieval**, or **D&D** style, falling back to the campaign setting; regular campaigns use D&D. Modern and medieval drafts focus on people and situations without generating D&D classes or mechanics. Generation does not automatically grant equipment or create a portrait.

New characters include editable portrayal guidance and a short reminder, saved to their **Memories** page when the character is created. Existing characters have **Draft character guidance with AI** on that page: it uses their sheet and current unsaved guidance, preserves identity, and leaves the result for review. Use **Restore previous guidance** to undo the draft, or **Save character guidance** to keep it. Generation never writes learned memories.

Characters and NPCs share a name namespace within each campaign; encounter titles must also be distinct. Saving and AI story effects reject duplicates even if capitalization, accents, spacing or punctuation differ. The generator considers visible campaign records and retries a conflicting name once. Transactional save checks cover simultaneous requests and hidden records without revealing their contents. Existing duplicate records are not merged or deleted.

Story helpers prepare short continuity notes in the background. The storyteller uses available notes without waiting for a new helper response. Notes expire after five minutes and are cleared on restart; GPU contention can still affect speed.

### Local image generation

Read [Local AI artwork](docs/LOCAL-ART.md) for hardware, downloads, and generation settings. On a supported host, install the optional components with the project interpreter:

```powershell
.\.venv\Scripts\python.exe scripts/setup_local_art.py
.\.venv\Scripts\python.exe scripts/setup_background_removal.py
```

These installers download the image engine, models, and background-removal components. They are not needed for ordinary campaign play.

### Images in AI chat

Use **Import images** or **Choose from artwork library** beneath the message box to attach up to three PNG, JPEG, or WebP images (5 MB each). The library uses the same searchable grid as catalog cards and Art Atelier. Send text with images, or images alone. Attachments appear inside the sent message; use its edit button to remove an attachment and save.

AI replies receive the actual images through an installed Ollama vision model. If the selected chat model supports vision, it is used; otherwise the server selects an installed vision model for that reply without changing your saved model setting. If none is installed, the reply reports that a vision model is needed. The six most recent images within the current reply's conversation window are included; older omitted images are explicitly marked for the AI. Private conversation and audience access still apply.

### Inline AI artwork and writing styles

Write `<image>a description of the picture</image>` between sentences to draw an image at that exact position. AI characters can use the same command. Up to three images can be requested in one message. Drawing runs on the server after the message finishes, and reopening a chat reuses its saved pictures.

The image generator looks for named campaign characters, items, locations, and artwork it is allowed to use. Matching portraits and artwork become actual image references, with a local vision model describing them for the generator. Images attached to the request are prioritized. Naming the character or item explicitly gives the most reliable match.

Each generated picture offers **Save to artwork catalog**, **Regenerate**, and **Edit image**. Edit opens a change prompt and uses the current image as its source. Failed replacements keep the old picture. Catalog saves create a shared campaign artwork card; later changes to the chat image do not overwrite that saved copy. Message authors, the image requester, and the campaign creator can change a picture. Viewers who can read it can save it to the catalog.

Open the collapsible **Writing styles dictionary** under the composer or in the message editor for meanings and clickable examples. Styles can nest, and matched markers disappear in the displayed chat:

| Markers | Meaning |
| --- | --- |
| `"dialogue"` | Spoken dialogue |
| `*thought*` | A character's visible introspection |
| `#action#` | An action or scene, with a tinted background |
| `'whisper'` | Quiet speech |
| `**emphasis**` | Emphasized words |
| Backticks around text | Written messages, letters, signs, and book passages |
| Triple backticks | A longer written passage |

The formatting takes inspiration from [Perchance's published chat source snapshot](https://github.com/therealwestninja/perchance-hero-chat/blob/main/vendor/perchance-ai-character-chat/perchance_2.txt), with explicit roleplay meanings and nested styles for this site. The AI receives these same conventions. For example, a written passage can contain italic thoughts and bold emphasis. Image tags inside backticks stay quoted text rather than starting a drawing. Internal JSON updates and image-command prompts are not displayed as dialogue. The AI gets a formatting-only repair pass if it leaves style markers unclosed.

Use **Fullscreen chat** for the same fullscreen behavior as the 2D workspace, including Escape, an exit button, and side-panel toggles. On small screens the side panels start collapsed and open as drawers. Message editing and image controls remain available in fullscreen. Everything below Send is grouped under **Images & writing options**, which automatically collapses in fullscreen and shows how many images are attached.

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

### Editing and continuing chat messages

Double-click a message you can edit (or use its pencil) to edit inside its original box. The editor exposes style markers and the original `<image>...</image>` prompts. Attachments can be removed. **Auto-complete** always appends to the end of the draft, regardless of the cursor position; it finishes incomplete sentences and may add fitting detail. **Undo completion** restores the draft before the last completion. Nothing is saved or drawn until **Save**. **Cancel** discards the draft.

Chat image generation first searches permitted campaign cards for relevant characters, objects and places, then asks the chat model to write a visual prompt from the request and those facts. Relevant portraits and attachments still guide the image engine. The original image command remains editable; changes to its prompt create a new drawing in that same position. Prompt preparation requires an installed Ollama chat model.

### Character memory and portrayal

Open a character card, then use **Memories ▸** to turn from the normal sheet to its memory page. Only the character’s assigned player and the campaign creator can read or edit this page. The **Character description, personality & roleplay guidelines** field accepts appearance, temperament, values, fears, speech patterns and behavior examples. **Character reminder note** reinforces short guidance on each reply (ideally under 100 words). Use actual names or plain wording; no name placeholders are substituted. Examples guide portrayal and are not treated as past events.

Before a character answers, its local chat model reviews new, addressed messages from that conversation. It records important facts, experiences, relationships, promises, goals, preferences, beliefs and feelings, keeping supporting quotations and speaker names. Previously reviewed messages are not repeatedly summarized. The entire archive stays in SQLite; relevant memories and pinned notes are selected for the next reply alongside recent conversation and the character’s guidance. Regeneration and autocomplete also use saved recall. Automatic updates retry after failures without replacing existing memories.

On the memory page you can search, add, correct, pin or forget a memory, or turn automatic learning off while keeping existing recall. Player corrections take priority over automatic notes. Automatic notes become inactive when their source message is edited or deleted; saving a correction explicitly preserves that corrected memory. Characters can recall relevant memories and search recent dialogue from other campaign chats they are included in. The requester must still have access, and the current reply audience must fit the source chat and message audience. Private information is excluded from public replies. Corrected or forgotten memories are not reintroduced through their old source quotations. Other characters’ personal memory pages are not included in an AI’s context.

Memories and portrayal settings persist in the server’s local `data/site.db` and are included when backing up that database. Campaign ZIP export/import does not currently include these new memory tables. AI extraction and portrayal remain model-dependent; the editable archive lets you correct missed or inaccurate interpretations.

### Conversation styles and chat panels

On the left of the campaign header, choose **D&D table conversation**, **Medieval conversation**, or **Modern conversation**. The campaign creator sets the main chat style; included players can set a private chat’s style. Each private chat can keep its own setting. D&D allows direct questions and discussion with the DM without forcing an NPC performance or advancing the scene. Medieval emphasizes natural preindustrial voices; Modern supports ordinary contemporary character conversation. Character descriptions, reminders, memories and image commands remain available in every style. Outside D&D, the DM is removed from the writer and reply choices; existing messages are preserved.

The side panels follow the character selected beside the writing box: characters show their inventory, dice, attacks and spells, while the DM shows scene controls. Clicking an AI reply character does not change your writing tools. Desktop fullscreen panel widths can be dragged and are remembered separately from the 2D fullscreen layout. Shared card artwork is contained without cropping, and round portraits use centered image frames.

Text-message exchanges keep their outgoing text inside backticks, including any natural character-appropriate emojis. Whisper quotes mean actual quiet speech, not texting. The AI receives a reminder of the current communication medium; a final delivery check repairs missed text formatting or an agreed picture request before saving the reply. Picture commands remain outside written spans so they create real inline artwork. Image discussions, refusals and requests not to send pictures do not require generation.

For slow chat image generation when the project is on an external drive, see [the verified internal-drive model cache](docs/LOCAL-ART.md#faster-model-loading-from-an-internal-drive). It keeps the same image model and quality. Chat artwork now displays its preparation and rendering stages while working.
