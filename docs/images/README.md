# README screenshots

These PNGs were captured directly from the running site's browser interface in dark mode on 2026-10-02. They are not image-generation outputs or interface mockups. The preview used a temporary database and deterministic sample responses, so no real campaign records or private conversations appear.

| File | View |
| --- | --- |
| [campaign-dark.png](campaign-dark.png) | Campaign workspace with compact party cards and sample styled conversation |
| [character-draft-dark.png](character-draft-dark.png) | Editable character draft with named sections and first-person behavior examples |

To refresh them, run [the isolated preview fixture](../../tests/record_generation_preview.py) using the project Python environment, then open `http://127.0.0.1:8773`. Switch the site to dark mode and enter the Generation QA campaign. The fixture uses temporary data and sample model responses rather than the live campaign database. It must remain bound to loopback.

Capture the campaign after its controls and records finish loading. For the draft form, choose Create character, enter a concept and Generate draft; the fixture supplies a sample profile. Review the visible content before capturing and stop the preview server afterward. Keep screenshots legible, free of private data and representative of the current interface. Update the capture date here and the [main README](../../README.md) when refreshing them.
