`icon-source.svg` is the master for every icon in `../public`. Regenerate with sharp:

```sh
npx -y sharp-cli -i icon-source.svg -o ../public/web-app-manifest-512x512.png resize 512 512
```
(or any SVG rasterizer), then downscale to 192, 180 (apple-touch-icon), and 96 (favicon).
