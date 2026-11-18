# Third-party data

## printer-models.json

Adapted from the [Open 3D Printer Database](https://github.com/swordlab/open-3d-printer-database)
by swordlab, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes made for PrintBI: only FDM printers are kept; brand names are normalized (for example
"Voron Design" to "Voron", "Elegoo Neptune" to brand "Elegoo" with model "Neptune …"); only the
fields the app uses are kept; field names are converted to camelCase. The source commit is
recorded in the file's `commit` field.

Regenerate it with:

```bash
git clone --depth 1 https://github.com/swordlab/open-3d-printer-database.git <dir>
npm run catalog:printers -w @printbi/api -- <dir>
```

## filament-products.json

Adapted from the same [Open 3D Printer Database](https://github.com/swordlab/open-3d-printer-database)
(`materials_catalog.json`), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes made for PrintBI: only FDM filaments are kept (no resins); material type spellings are
normalized (for example "PLA-wood" to "PLA-Wood"); entries repeated with the same brand, product
and type are kept once; only the fields the app uses are kept.

Regenerate it with `npm run catalog:filaments -w @printbi/api -- <dir>`.
