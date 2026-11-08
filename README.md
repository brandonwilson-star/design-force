# Design Force

A unified **design collaboration** studio. One desk for interface, photo, motion, film, layout, and PDF — with a Claude Design–style AI mode and a NotebookLM-style sources panel. Export leaves in whatever language the next tool speaks.

Open-source lineage (not a drop-in of those binaries; a merged web studio that credits and maps onto them):

| Mode | Merges |
| --- | --- |
| **Vector & UI** | [Penpot](https://github.com/penpot/penpot), [OpenPencil](https://github.com/open-pencil/open-pencil), FigCraft |
| **Photo & Raster** | [PhotoCraft](https://github.com/storytold/photocraft), [LightCraft](https://github.com/storytold/lightcraft) |
| **Motion & Animation** | [EffectCraft](https://github.com/storytold/effectcraft) |
| **Film & Edit** | [FilmCraft](https://github.com/storytold/filmcraft) |
| **Layout & Print** | [DesignCraft](https://github.com/storytold/designcraft) |
| **PDF & Docs** | [PdfCraft](https://github.com/storytold/pdfcraft) |
| **AI Design** | Claude Design + [ArtCraft Core](https://github.com/storytold/artcraft) |

ArtCraft Core is the orchestration layer: one document, many crafts, shared sources, shared export.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

Optional: paste an Anthropic API key in **AI Design → Design chat**, or set `VITE_ANTHROPIC_API_KEY` in `.env`. Without a key, AI mode still produces a local, source-grounded artboard.

## What you can do

- Tab between design modes; the scene graph stays shared.
- Collaborate on a canvas (presence, comments, layers, inspector).
- Add **Sources** (files, URLs, notes, repos) that ground prompts — NotebookLM-style.
- Prompt designs or edits in **AI Design** that apply across modes.
- **Export any format** (`⌘E` / Export): PNG, JPEG, WebP, GIF, BMP, SVG, PDF, PDF/X, EPS, Design Force JSON, Penpot JSON, Figma/OpenPencil trees, Photoshop layers, HTML, JSX, CSS tokens, W3C tokens, Lottie, WebM, EDL, FCPXML, IDML-like XML, EPUB XHTML, slides, and extracted text.

Native vendor binaries (`.psd`, `.fig`, `.aep`, `.prproj`, `.indd`) export as structured interchange plus a flattened preview. Plug in the upstream engines when you want the exact file codec.

## License

MIT. Upstream projects keep their own licenses — see Lineage in the app.
