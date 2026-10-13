# App SDK

Apps are single HTML pages that run in a sandboxed iframe. Include the SDK and talk to the editor with a small API.

```html
<script src="https://cdn.jsdelivr.net/gh/OpenCanvasApp/community/sdk/opencanvas-sdk.js"></script>
<script>
  OpenCanvas.ready(async () => {
    const sel = await OpenCanvas.getSelection()
    await OpenCanvas.addText('Hello', { x: 100, y: 100, size: 64 })
  })
</script>
```

## Registry entry

Add this to `registry.json` in your repo:

```json
{ "id": "my-app", "name": "My app", "icon": "sparkles", "path": "apps/my-app/index.html", "permissions": ["read", "write"] }
```

Permissions are shown to the user before the app runs. Ask only for what you need.

## Publishing

Fork the community repo, add your app folder and registry entry, then open a pull request. The included GitHub workflow validates the registry.

Run `node tools/validate-registry.js` before you push.
