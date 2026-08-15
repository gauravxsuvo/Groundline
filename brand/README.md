# Brand assets

The mark is a line that runs to a ring resting tangent on it, one point of contact, marked by a small dot. Not the ring's center, the exact point where the ring touches the line. Three elements, one shared stroke weight, one accent color used once. Not final, still under review.

## Files

- `mark.svg` / `mark-on-dark.svg` - icon only, square. Favicon source, avatar, anywhere the wordmark doesn't fit.
- `logo.svg` / `logo-on-dark.svg` - mark plus wordmark, the usual lockup.
- `banner-light.svg` / `banner-dark.svg` - wide banner (1280x320) for the README header, switches automatically with GitHub's theme.

`-on-dark` files use paper-colored ink for placing on a dark surface. The default files assume a light surface.

## Colors

| Token | Hex | Use |
|---|---|---|
| Ink | `#17140F` | Text and mark on light surfaces |
| Paper | `#F8F4EC` | Text and mark on dark surfaces, light banner background |
| Accent | `#D9822B` | The one colored element, the dot at the center of the mark, always this color regardless of surface |
| Muted (light) | `#6B6358` | Secondary text on light surfaces |
| Muted (dark) | `#C9BFAF` | Secondary text on dark surfaces |

Color is used on exactly one element (the dot), never spread across the whole mark. No gradients, no glow, flat fills only.

The wordmark is Archivo (weight 650, OFL licensed), shipped as outlined vector paths rather than live `<text>`. GitHub's SVG renderer only has generic system fonts available, so live text silently falls back to plain Arial and loses the typeface. Outlining sidesteps that entirely: the letterforms are geometry, not a font reference, so they render identically everywhere. To change the wordmark, regenerate the paths with `fontTools.pens.svgPathPen` rather than hand-editing the path data.

## Using the banner in a README

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="brand/banner-light.svg">
  <img alt="Groundline" src="brand/banner-light.svg">
</picture>
```

## Regenerating previews

These are hand-written SVGs, no build step. To eyeball a change before committing, render with headless Chrome and view the PNG, don't guess from the markup:

```
chrome --headless --disable-gpu --window-size=1280,320 --screenshot=preview.png brand/banner-light.svg
```
