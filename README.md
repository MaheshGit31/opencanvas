# OpenCanvas

A free, open source design suite that runs in your browser. No build step, no account, no server needed.

Design for social, presentations, print, video, docs, whiteboards, sheets, code, websites and emails from one place.

## Run it

```
python3 -m http.server 8080
```

Open http://localhost:8080. Any static host works, including GitHub Pages.

## What is inside

- Canvas editor with pages, titles, locking, groups, frames, masks, pen tool, boolean ops and flattening
- Canva style right click menu and left rail, plus extras: custom fonts, symbols and generated graphics
- Keyframe timeline with presets, video and audio, and a presenter mode
- Photo suite: adjustments, curves, duotone, lighting, corner pin, background remover, magic eraser, magic grab, grab text and background generator
- 3D scenes you can drop on any page or use on their own
- Magic resize and size presets for social, print, video and screens
- Export to PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO, SVG, PDF, PPTX, HTML, ZIP, WebM, MP4 and the .opencanvas project file
- Beginner mode by default. Turn on Advanced mode for the inspector, keyframes and vector tools
- Themes, accent colors, density and rebindable shortcuts with Canva and Figma presets
- Many languages with built in packs plus machine translation for the rest

## AI tools

Pick on device or server in Settings.

On device uses in browser models and falls back to a light version when offline. On server uses the reference API in `server/`.

```
cd server && pip install -r requirements.txt && uvicorn server:app --port 8000
```

## Community

Apps and templates live in a plain GitHub repo with a `registry.json`. Add any repo in Settings, Community as `owner/repo`. The `community/` folder here is a ready to publish example. See `docs/APP_SDK.md` for building apps.

## Files

- `js/` editor, panels, photo, 3D, timeline, exporter, modes
- `css/app.css` themes and layout
- `sdk/` app SDK
- `community/` example registry
- `server/` optional AI server
- `tools/validate-registry.js` registry checker

## License

MIT
