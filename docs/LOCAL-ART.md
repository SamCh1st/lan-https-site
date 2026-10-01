# Local AI artwork

Art Atelier defaults to **Local image model**. Restart the website server after updating its Python files, then refresh the browser.

The installed FLUX.2 Klein 4B Q8 model runs through stable-diffusion.cpp on the server's NVIDIA GPU. No account, API key, per-image fee or generation quota is involved. Files occupy approximately 10 GB. Generation still uses electricity and is constrained by available memory and speed. One image job runs at a time; additional jobs wait. Model helpers remain optional local Ollama models configured in the campaign.

Draw new subjects by describing their appearance, pose, composition and style. Check **Edit / add to current drawing** to send the current canvas as the visual reference. The result replaces visible artwork with one pixel image layer, preserving hidden layers. Unlock visible layers before editing. Undo restores the prior drawing. Edits are model interpretations and can change details beyond the requested change; they are not guaranteed pixel-exact.

The pixel layer can be moved, resized and painted over. It does not expose individual eyes, tusks or brushstrokes as vector objects. The previous experimental editable vector mode is still available explicitly in the AI drawing selector.

Disable **Look up D&D references** for fully offline use. Generation and editing are always local; that checkbox only retrieves optional public SRD descriptions. Helpers advise the model without fixing its subject to D&D or templates.

## Reinstall on another NVIDIA Windows computer

Run `python scripts/setup_local_art.py` once with internet access. The script downloads a pinned CUDA engine release, its runtime and model files from their publishers; it verifies the published SHA-256 checksums. No background image server is needed: the website launches a hidden process per image and releases it when complete or cancelled. The website itself must be launched normally.

If generation fails, check `local-art/last-error.log`. Stop other GPU-heavy work or try 512 pixels if memory is insufficient. Missing model files produce an explicit setup error; the site does not silently substitute primitive shapes.

After installation, run `python scripts/verify_local_art.py` with the site's Python interpreter.
It generates a real 384×512 portrait image, removes its background, checks the PNG's alpha
channel, and writes `local-art/setup-check.png`. This requires no Ollama call. On the
RTX PRO 500 Blackwell laptop GPU with 6 GB VRAM, the September 30, 2026 setup check took
32.6 seconds including background removal; the engine itself reported 24.65 seconds.
This is one setup measurement, not a promise for other prompts or sizes.

The default is one image at 512 pixels for faster generation. Choose 768 or 1024 for more
detail. The size is the longest edge: portrait and landscape preserve their aspect ratio,
including when opened in the drawing studio. Optional reference lookup and helper advice start disabled; enable their
checkboxes when wanted. The default image request does not contact Ollama.

## Styles, backgrounds, and repeatable variations

Art Atelier offers ten visual treatments plus **As described**. Style recipes add concrete
guidance about linework, materials, shading, and color while preserving the requested subject
and scene. They do not switch models. Select square, portrait, or landscape independently.

**No background — transparent PNG** starts unchecked. When checked, it deliberately overrides
scenery instructions: the renderer requests an isolated subject, then local AI removes the
backdrop before the PNG is saved. A failed removal reports an error instead of publishing an
opaque replacement. Leave it unchecked for scenes with backgrounds.

Leave **Seed** blank for random variations, or enter a whole number to repeat a render.
Batch variations use consecutive seeds. **Prompt & settings** shows the exact engine prompt,
seed, dimensions, and background choice. Download the recipe or reuse its controls; keeping
an image in the archive also saves its recipe with the artwork record. Reproduction requires the
same references, source canvas, helper output, model, and engine; seed alone is not an identity lock.

Reference descriptions are cached in server memory for up to ten minutes (at most 64 entries),
separately per user and keyed by image contents, guidance, prompt, and vision model. Access is
still checked on every request. Concurrent identical analyses share the cached result. The
renderer still starts a process per image; these changes do not claim a measured rendering speedup.

Chat images offer **Image size & shape** for the next regeneration or edit, with settings retained
for later edits. The requester and campaign creator can inspect the completed image's prompt recipe.

Text encoding runs on the CPU; diffusion and tiled VAE decoding run on CUDA.
`--max-vram -1` reserves 1 GiB of free GPU memory. Model weights remain in system
RAM and are staged to the GPU as needed. If the GPU attempt reports insufficient
memory, the engine retries once with slower CPU decoding. This avoids putting
the approximately 4 GB text encoder on the GPU and does not interrupt Ollama.

On the 6 GB laptop GPU, test generation took about 27 seconds at 512 pixels and
44 seconds at 1024 pixels, before background removal. Prompt length, image edits,
helper advice and other GPU activity can change these times.

Sources: [FLUX.2 Klein](https://bfl.ai/models/flux-2-klein), [engine generation and editing instructions](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md).

## Image references

In **Ask AI to draw → Image references**, import up to three PNG, JPEG or WebP images (under 5 MB each), or choose images attached to visible campaign records. Add a note to each image to explain its role, such as armor, colors, pose or style. References are separate from canvas layers and reset when switching campaigns.

With references attached, an installed Ollama vision model reads each image and shows its description. A vision-capable campaign helper is preferred, then the campaign model, then another installed vision model. This step runs even when optional **Helper advice** is off. If image analysis fails, generation stops with an error instead of silently ignoring references.

The local image generator receives the actual images, their descriptions, your per-image notes and your artwork prompt. **Edit / add to current drawing** also includes the current canvas as the first image. Image references require **Local image model**; experimental vector drawing does not support them. References add processing time and memory usage. Images are normalized to at most 1024 pixels per side for analysis and generation; originals remain unchanged. The server checks access to every selected image again when generation starts.

## Faster model loading from an internal drive

If the project is on an external drive, run `python scripts/cache_local_art.py` on the server computer. It copies the three installed model files (about 9 GB) to `%LOCALAPPDATA%/InHouseDnD/image-model-cache` on Windows, verifies each copy with SHA-256, and records the location in `local-art/model-cache.json`. A different destination can be supplied as the first argument. The original installation stays intact. This is a one-time disk copy, not a model download or quality change.

The renderer uses the verified cache while source and cached file sizes and timestamps match. If files change or the cache is unavailable, it falls back to the original installation. Re-run the script after replacing models. Keep at least 2 GB free beyond the model size during setup. Deleting `local-art/model-cache.json` disables the cache; cached copies can then be removed normally.

Chat image preparation searches relevant campaign candidates before asking the helper to select records. The helper stays loaded between search batches and the final prompt rewrite instead of reloading for each call. Portrait/reference images still receive vision analysis and are passed to the image engine. The chat shows preparation and engine progress. Successful engine timing details are kept in `local-art/last-render.log`, and server logs include prompt-preparation and total image-job duration.

On the RTX 4070 host, a September 30, 2026 test with a 512-pixel portrait prompt and one image reference took 38.44 seconds inside the engine and 66.11 seconds including process startup when using the verified internal SSD cache. An earlier external-drive render logged 229.47 engine seconds, mostly model reads. These are renderer measurements, not full chat latency: campaign prompt research, vision analysis, queueing and other machine activity add time. Prompts and references differed between the two measurements.
