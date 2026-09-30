# Household and business catalog

240 independently placeable objects in 15 transparent sprite atlases. Each of 13 businesses has 16 additions: Bakery, Tavern, Inn, Blacksmith, Apothecary, Tailor, General Store, Stable, Warehouse, Mill & Granary, Farm & Barn, Carpenter, and Market & Food Stalls. Another 16 objects cover households and 16 are modular counter sections.

Furniture and map props are bare, overhead objects. Containers are empty. The 112 inventory goods use three-quarter illustrations and include descriptions, editable suggested prices, and quantity handling. They are ordinary goods without automatic mechanical bonuses. Inventory items remain private to their authorized holders.

Counter kits come in oak, walnut, pine and stone, each with straight, inner corner, outer corner and end sections. Standard depth is 40 map units; rotate in 90-degree increments and align flat edges. Default dimensions: straight 80 x 40, inner 80 x 80, outer 40 x 40, end 60 x 40.

Art was generated with the built-in image generation tool using existing site artwork as style references. Exact final prompts are in site/assets/map-art/business-prompts.json. Original atlases are business_*-atlas.png; individual crops are in items/. business-bounds.json and business-manifest.json record the actual pixel coordinates, sizes, titles and views. Crop coordinates follow the generated images rather than assuming their requested dimensions.

Restart the site normally and refresh the browser to load the code and install the new catalog. Seeding covers existing and new campaigns, including custom rulesets; edited or deleted seeded cards are not recreated.

Looted inventory copies no longer appear as duplicate cards in the item archive. They remain available on the holder with their quantities, equipment and ownership preserved. Existing economy logic stacks matching goods and keeps distinct customized items separate.

Validation: catalog installation and preservation tests, all map types save/reload, economy regression suite, and browser checks covering all 240 images, archive filtering, descriptions and stable art after renaming.
