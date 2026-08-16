# Brand assets

The mark is a geometric capital G. A capital G already carries a horizontal crossbar, so the ground line is structural to the letter rather than an ornament added to it. The accent fills only the portion of that crossbar projecting into the counter, which keeps the ring an unbroken form.

Built from one circle and one stroke weight. Outer radius 40, stroke 12 (15 percent of the diameter, matched to the wordmark's optical weight), crossbar the same 12. The aperture terminal is cut on the radius, so the cut aims at the center instead of sitting at an arbitrary angle. Every endpoint falls where the circle geometry puts it.

## Files

- `mark.svg` / `mark-on-dark.svg` - icon only, square. Favicon source, avatar, anywhere the wordmark doesn't fit.
- `mark-mono.svg` - single color, inherits `currentColor`. For stamping, embroidery, one-color print, or anywhere the accent can't reproduce.
- `logo.svg` / `logo-on-dark.svg` - mark plus wordmark, the usual lockup.
- `banner-light.svg` / `banner-dark.svg` - wide banner (1280x320) for the README header, switches automatically with GitHub's theme.

`-on-dark` files use paper-colored ink for placing on a dark surface. The default files assume a light surface.

In the lockup the mark is set 26 percent larger than the wordmark's cap height and separated by half a cap height. Both are deliberate: at cap height and tight spacing the monogram reads as a first letter, giving "GGroundline". The circle also overshoots the cap height by 3 percent, the standard optical correction for a round form against flat-topped letters.

## Colors

| Token | Hex | Use |
|---|---|---|
| Ink | `#17140F` | Text and mark on light surfaces |
| Paper | `#F8F4EC` | Text and mark on dark surfaces, light banner background |
| Accent | `#C26A1E` | The crossbar inside the counter, and the banner's baseline rule. Same on every surface |
| Muted (light) | `#6B6358` | Secondary text on light surfaces |
| Muted (dark) | `#C9BFAF` | Secondary text on dark surfaces |

Ink and paper are both warm-biased rather than neutral grey, so the accent sits in an analogous relationship with them instead of fighting them. The accent is deliberately deeper and less saturated than a default orange, which reads closer to warning signage and loses contrast on the light ground.

Color lands on exactly one element and the mark is complete without it, see `mark-mono.svg`. No gradients, no glow, flat fills only.

## Type

The wordmark is Instrument Sans (OFL licensed), weight 600, tracked -0.5 percent. It is slightly condensed, which gives the wordmark more editorial texture and keeps it from competing with a perfectly circular mark. The tagline is the same family at weight 400.

Type is shipped as outlined vector paths rather than live `<text>`. GitHub's SVG renderer only has generic system fonts available, so live text silently falls back to Arial and loses the typeface entirely. Outlining sidesteps that: the letterforms are geometry, not a font reference, so they render identically everywhere.

Because the paths are outlines, they cannot be edited as text. To change any wording, reshape it from the source font. Use HarfBuzz for shaping rather than stacking advance widths, otherwise kerning pairs are ignored and the spacing will be subtly wrong:

```python
import uharfbuzz as hb                      # shaping, applies kerning
from fontTools.pens.svgPathPen import SVGPathPen   # glyph outlines
```

## Tagline

"Answers that show their work."

Says the product cites its sources without using the word "citation", and implies the guardrail: a system that shows its work is one that can also admit when it has none. Keep the period, it sets the declarative tone.

## Using the banner in a README

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="brand/banner-light.svg">
  <img alt="Groundline" src="brand/banner-light.svg">
</picture>
```

## Changing the mark

The geometry is parametric, not hand-placed. Changing the stroke weight, the crossbar length, or the terminal angle means recomputing where the arcs and edges meet, so adjust the parameters and regenerate rather than nudging path coordinates by hand. The mark is built from an outer arc, a small arc closing the crossbar's right end flush with the circle, the crossbar edges, and a return arc along the counter.

To eyeball any change before committing, render with headless Chrome and look at the PNG, don't judge it from the markup:

```
chrome --headless --disable-gpu --window-size=1280,320 --screenshot=preview.png brand/banner-light.svg
```
