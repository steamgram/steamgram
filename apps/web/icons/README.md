Icon sources for the PWA / favicons. Both are hand-written SVGs; the fonts are
rasterised, so the PNGs in `../public` are the artefacts to ship.

- `icon-source.svg`: WASD cluster with the S key lit. Used for the 512 / 192
  manifest icons, the 180 Apple touch icon and the Open Graph image.
- `favicon-source.svg`: the single S keycap, used at 96px and below
  (`favicon-96x96.png`, `favicon.ico`) and as `favicon.svg` (rounded variant),
  where the full cluster would blur.

Regenerate with any SVG rasteriser, e.g. sharp:

```js
await sharp('icon-source.svg', { density: 300 }).resize(512, 512).png().toFile('../public/web-app-manifest-512x512.png')
```
