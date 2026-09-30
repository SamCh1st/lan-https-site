# Local AI artwork

Art Atelier defaults to **Local image model**. Restart the website server after updating its Python files, then refresh the browser.

The installed FLUX.2 Klein 4B Q8 model runs through stable-diffusion.cpp on the server's NVIDIA GPU. No account, API key, per-image fee or generation quota is involved. Files occupy approximately 10 GB. Generation still uses electricity and is constrained by available memory and speed. One image job runs at a time; additional jobs wait. Model helpers remain optional local Ollama models configured in the campaign.

Draw new subjects by describing their appearance, pose, composition and style. Check **Edit / add to current drawing** to send the current canvas as the visual reference. The result replaces visible artwork with one pixel image layer, preserving hidden layers. Unlock visible layers before editing. Undo restores the prior drawing. Edits are model interpretations and can change details beyond the requested change; they are not guaranteed pixel-exact.

The pixel layer can be moved, resized and painted over. It does not expose individual eyes, tusks or brushstrokes as vector objects. The previous experimental editable vector mode is still available explicitly in the AI drawing selector.

Disable **Look up D&D references** for fully offline use. Generation and editing are always local; that checkbox only retrieves optional public SRD descriptions. Helpers advise the model without fixing its subject to D&D or templates.

## Reinstall on another NVIDIA Windows computer

Run `python scripts/setup_local_art.py` once with internet access. The script downloads a pinned CUDA engine release, its runtime and model files from their publishers; it verifies the published SHA-256 checksums. No background image server is needed: the website launches a hidden process per image and releases it when complete or cancelled. The website itself must be launched normally.

If generation fails, check `local-art/last-error.log`. Stop other GPU-heavy work or try 512 pixels if memory is insufficient. Missing model files produce an explicit setup error; the site does not silently substitute primitive shapes.

The default is 512 pixels for faster generation. Choose 768 or 1024 for more
detail. Optional reference lookup and helper advice start disabled; enable their
checkboxes when wanted. The default image request does not contact Ollama.

Text encoding runs on the CPU; diffusion and tiled VAE decoding run on CUDA.
`--max-vram -1` reserves 1 GiB of free GPU memory. Model weights remain in system
RAM and are staged to the GPU as needed. If the GPU attempt reports insufficient
memory, the engine retries once with slower CPU decoding. This avoids putting
the approximately 4 GB text encoder on the GPU and does not interrupt Ollama.

On the 6 GB laptop GPU, test generation took about 27 seconds at 512 pixels and
44 seconds at 1024 pixels, before background removal. Prompt length, image edits,
helper advice and other GPU activity can change these times.

Sources: [FLUX.2 Klein](https://bfl.ai/models/flux-2-klein), [engine generation and editing instructions](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md).
