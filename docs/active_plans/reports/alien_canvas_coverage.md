# Alien canvas coverage measurement

Measures CANVAS COVERAGE (painted-creature pixel area over the full 200x320 canvas box) for every alien-art source currently available, using the existing `inkCoverage` metric in `devel/measure_alien_art.py`. This metric already equals canvas coverage as defined: `devel/render_alien_sheet.mjs` renders each `<symbol>` at its own full declared viewBox (never a cropped bounding box), so ink-pixel-count divided by rendered-canvas-pixel-count is the ratio requested, not bounding-box density. Values below use the 4x-supersampled inspection render (256px tall) for the most precise vector-fill measurement; ladder-size renders (18/32/44/64px) agree with these to within normal anti-aliasing noise.

## Commands run

```bash
node devel/render_alien_sheet.mjs <one-svg-file>
source source_me.sh && python3 devel/measure_alien_art.py -i output_smoke/aliens -o <diagnostics.json path>
```

Run once per source file (single-file mode), sequentially, so each run's manifest.json and diagnostics.json describe exactly one source file before the next render overwrites manifest.json. `inkCoverage` entries were filtered to `isInspection == true` for this report.

## Full measured table (sorted by canvas coverage)

| source file | species | frame | canvas coverage % |
| --- | --- | --- | --- |
| devel/alien_bakeoff/set_2/aliens.svg | flapper | frame1 | 36.64% |
| devel/alien_bakeoff/set_2/aliens.svg | flapper | frame2 | 37.96% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | gollumer | frame2 | 45.42% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | packer | frame1 | 46.51% |
| devel/alien_bakeoff/set_3/aliens.svg | flapper | frame1 | 47.38% |
| devel/alien_bakeoff/set_4/aliens.svg | flapper | frame2 | 48.01% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | gollumer | frame2 | 49.35% |
| devel/alien_bakeoff/set_3/aliens.svg | flapper | frame2 | 51.13% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | gollumer | frame2 | 51.97% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | packer | frame2 | 52.69% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | packer | frame1 | 52.84% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | gollumer | frame1 | 54.38% |
| devel/alien_bakeoff/set_1/aliens.svg | flapper | frame1 | 55.21% |
| devel/alien_bakeoff/set_2/aliens.svg | leggite | frame2 | 56.61% |
| devel/alien_bakeoff/set_2/aliens.svg | leggite | frame1 | 57.43% |
| art/aliens/humanoid.svg | humanoid | frame2 | 57.86% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | bonzoid | frame1 | 58.01% |
| devel/alien_bakeoff/set_4/aliens.svg | flapper | frame1 | 58.93% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | bonzoid | frame1 | 59.05% |
| devel/alien_bakeoff/set_1/aliens.svg | flapper | frame2 | 59.45% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | gollumer | frame1 | 59.71% |
| devel/alien_cast/artist_3/aliens.svg | gollumer | frame2 | 59.77% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | packer | frame1 | 60.01% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | bonzoid | frame2 | 60.43% |
| devel/alien_cast/artist_2/aliens.svg | packer | frame2 | 60.63% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | bonzoid | frame2 | 60.80% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | gollumer | frame1 | 61.17% |
| devel/alien_bakeoff/set_3/aliens.svg | leggite | frame2 | 61.55% |
| art/aliens/humanoid.svg | humanoid | frame1 | 61.96% |
| devel/alien_bakeoff/set_3/aliens.svg | leggite | frame1 | 62.11% |
| devel/alien_cast/artist_1/aliens.svg | gollumer | frame2 | 62.13% |
| devel/alien_cast/artist_2/aliens.svg | gollumer | frame2 | 63.08% |
| art/aliens/gollumer.svg | gollumer | frame2 | 63.26% |
| devel/alien_bakeoff/set_4/aliens.svg | leggite | frame2 | 63.71% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | bonzoid | frame2 | 64.08% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | spheroid | frame2 | 64.33% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | spheroid | frame1 | 64.43% |
| devel/alien_bakeoff/set_4/aliens.svg | leggite | frame1 | 66.26% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | flapper | frame2 | 66.35% |
| devel/alien_cast/artist_5/aliens.svg | packer | frame2 | 66.42% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | humanoid | frame2 | 66.61% |
| devel/alien_bakeoff/set_1/aliens.svg | leggite | frame1 | 66.63% |
| devel/alien_bakeoff/set_3/aliens.svg | mechtron | frame2 | 66.87% |
| devel/alien_cast/artist_3/aliens.svg | humanoid | frame2 | 66.89% |
| devel/alien_cast/artist_5/aliens.svg | gollumer | frame2 | 66.89% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | humanoid | frame1 | 67.03% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | bonzoid | frame1 | 67.44% |
| devel/alien_bakeoff/set_1/aliens.svg | leggite | frame2 | 67.66% |
| devel/alien_bakeoff/set_2/aliens.svg | mechtron | frame2 | 68.22% |
| devel/alien_cast/artist_3/aliens.svg | humanoid | frame1 | 68.43% |
| devel/alien_bakeoff/set_2/aliens.svg | mechtron | frame1 | 69.48% |
| devel/alien_bakeoff/set_3/aliens.svg | mechtron | frame1 | 69.55% |
| devel/alien_cast/artist_3/aliens.svg | gollumer | frame1 | 69.58% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | packer | frame2 | 70.07% |
| devel/alien_cast/artist_1/aliens.svg | flapper | frame2 | 70.08% |
| art/aliens/gollumer.svg | gollumer | frame1 | 70.31% |
| devel/alien_cast/artist_4/aliens.svg | gollumer | frame2 | 70.57% |
| devel/alien_cast/artist_2/aliens.svg | gollumer | frame1 | 70.82% |
| devel/alien_cast/artist_2/aliens.svg | humanoid | frame1 | 71.04% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | leggite | frame2 | 71.10% |
| devel/alien_cast/artist_2/aliens.svg | packer | frame1 | 71.34% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | flapper | frame2 | 71.85% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | leggite | frame1 | 72.31% |
| devel/alien_cast/artist_3/aliens.svg | flapper | frame2 | 72.33% |
| devel/alien_cast/artist_2/aliens.svg | bonzoid | frame1 | 72.37% |
| devel/alien_cast/artist_2/aliens.svg | humanoid | frame2 | 72.49% |
| devel/alien_cast/artist_3/aliens.svg | packer | frame2 | 72.50% |
| devel/alien_cast/artist_1/aliens.svg | gollumer | frame1 | 72.50% |
| devel/alien_cast/artist_1/aliens.svg | packer | frame2 | 72.71% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | humanoid | frame2 | 72.88% |
| devel/alien_cast/artist_2/aliens.svg | leggite | frame2 | 73.29% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | humanoid | frame1 | 73.65% |
| devel/alien_cast/artist_5/aliens.svg | flapper | frame2 | 74.09% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | flapper | frame2 | 74.13% |
| devel/alien_cast/artist_2/aliens.svg | flapper | frame1 | 74.18% |
| devel/alien_cast/artist_2/aliens.svg | leggite | frame1 | 74.35% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | leggite | frame2 | 74.50% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | flapper | frame1 | 74.54% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | leggite | frame1 | 74.66% |
| devel/alien_cast/artist_3/aliens.svg | leggite | frame2 | 74.75% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | flapper | frame2 | 74.82% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | humanoid | frame1 | 75.30% |
| devel/alien_cast/artist_5/aliens.svg | gollumer | frame1 | 75.55% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | flapper | frame1 | 75.55% |
| devel/alien_cast/artist_2/aliens.svg | bonzoid | frame2 | 76.13% |
| devel/alien_cast/artist_5/aliens.svg | humanoid | frame1 | 76.37% |
| devel/alien_cast/artist_1/aliens.svg | humanoid | frame2 | 76.77% |
| devel/alien_cast/artist_3/aliens.svg | bonzoid | frame1 | 77.11% |
| devel/alien_cast/artist_1/aliens.svg | leggite | frame2 | 77.13% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | humanoid | frame2 | 77.16% |
| devel/alien_cast/artist_2/aliens.svg | flapper | frame2 | 77.34% |
| devel/alien_cast/artist_1/aliens.svg | humanoid | frame1 | 77.55% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | flapper | frame1 | 77.61% |
| devel/alien_cast/artist_5/aliens.svg | packer | frame1 | 77.80% |
| devel/alien_cast/artist_5/aliens.svg | flapper | frame1 | 78.04% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | mule | frame2 | 78.10% |
| devel/alien_cast/artist_4/aliens.svg | spheroid | frame1 | 78.26% |
| devel/alien_cast/artist_1/aliens.svg | bonzoid | frame2 | 78.58% |
| devel/alien_cast/artist_1/aliens.svg | leggite | frame1 | 78.59% |
| devel/alien_cast/artist_5/aliens.svg | humanoid | frame2 | 78.64% |
| devel/alien_cast/artist_5/aliens.svg | bonzoid | frame1 | 78.66% |
| devel/alien_cast/artist_3/aliens.svg | leggite | frame1 | 78.83% |
| devel/alien_cast/artist_1/aliens.svg | flapper | frame1 | 78.98% |
| devel/alien_cast/artist_4/aliens.svg | flapper | frame2 | 79.23% |
| devel/alien_cast/artist_3/aliens.svg | bonzoid | frame2 | 79.33% |
| devel/alien_cast/artist_3/aliens.svg | flapper | frame1 | 79.40% |
| devel/alien_cast/artist_4/aliens.svg | bonzoid | frame1 | 79.59% |
| devel/alien_cast/artist_1/aliens.svg | bonzoid | frame1 | 79.63% |
| devel/alien_cast/artist_4/aliens.svg | bonzoid | frame2 | 79.65% |
| devel/alien_cast/artist_4/aliens.svg | packer | frame2 | 80.14% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | leggite | frame2 | 80.40% |
| devel/alien_cast/artist_5/aliens.svg | spheroid | frame1 | 80.50% |
| devel/alien_cast/artist_4/aliens.svg | humanoid | frame1 | 80.57% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | leggite | frame1 | 80.68% |
| devel/alien_cast/artist_4/aliens.svg | humanoid | frame2 | 80.83% |
| devel/alien_cast/artist_5/aliens.svg | leggite | frame1 | 80.96% |
| devel/alien_cast/artist_1/aliens.svg | spheroid | frame1 | 81.08% |
| devel/alien_bakeoff/set_1/aliens.svg | mechtron | frame1 | 81.12% |
| devel/alien_cast/artist_4/aliens.svg | gollumer | frame1 | 81.45% |
| devel/alien_cast/artist_4/aliens.svg | leggite | frame2 | 81.54% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | mule | frame2 | 81.54% |
| devel/alien_cast/artist_2/aliens.svg | spheroid | frame1 | 81.55% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | mule | frame1 | 81.58% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | mechtron | frame2 | 81.69% |
| devel/alien_bakeoff/set_1/aliens.svg | mechtron | frame2 | 81.86% |
| devel/alien_bakeoff/set_4/aliens.svg | mechtron | frame2 | 81.88% |
| devel/alien_cast/artist_3/aliens.svg | spheroid | frame1 | 81.94% |
| devel/alien_cast/artist_5/aliens.svg | leggite | frame2 | 81.99% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | mule | frame1 | 82.07% |
| devel/alien_cast/artist_4/aliens.svg | leggite | frame1 | 82.58% |
| devel/alien_cast/artist_5/aliens.svg | bonzoid | frame2 | 82.63% |
| devel/alien_cast/artist_4/aliens.svg | flapper | frame1 | 82.68% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | flapper | frame1 | 82.80% |
| devel/alien_cast/artist_4/aliens.svg | packer | frame1 | 83.16% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | leggite | frame1 | 84.02% |
| devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) | mechtron | frame1 | 84.22% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | packer | frame2 | 84.24% |
| devel/alien_bakeoff/set_4/aliens.svg | mechtron | frame1 | 84.48% |
| devel/alien_cast/artist_1/aliens.svg | mechtron | frame2 | 84.49% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | mule | frame2 | 84.72% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | leggite | frame2 | 84.75% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | spheroid | frame1 | 85.41% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | mechtron | frame1 | 85.44% |
| devel/alien_cast/artist_1/aliens.svg | packer | frame1 | 85.57% |
| devel/alien_cast/artist_3/aliens.svg | packer | frame1 | 85.64% |
| devel/alien_cast/artist_2/aliens.svg | mechtron | frame2 | 85.65% |
| devel/alien_cast/artist_5/aliens.svg | spheroid | frame2 | 85.67% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | spheroid | frame1 | 85.86% |
| devel/alien_cast/artist_5/aliens.svg | mechtron | frame2 | 85.99% |
| devel/alien_cast/artist_3/aliens.svg | mechtron | frame2 | 86.07% |
| devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) | mechtron | frame2 | 86.18% |
| devel/alien_cast/artist_4/aliens.svg | mechtron | frame2 | 86.62% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | mechtron | frame2 | 87.01% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | mechtron | frame2 | 87.01% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | mule | frame1 | 87.55% |
| devel/alien_cast/artist_2/aliens.svg | spheroid | frame2 | 87.65% |
| devel/alien_cast/artist_5/aliens.svg | mechtron | frame1 | 87.78% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | spheroid | frame2 | 88.44% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | spheroid | frame2 | 88.55% |
| devel/alien_cast/artist_4/aliens.svg | mechtron | frame1 | 88.66% |
| devel/alien_cast/artist_3/aliens.svg | spheroid | frame2 | 88.77% |
| devel/alien_cast/artist_3/aliens.svg | mechtron | frame1 | 88.78% |
| devel/alien_cast/artist_2/aliens.svg | mechtron | frame1 | 88.79% |
| devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) | mechtron | frame1 | 88.89% |
| devel/alien_cast/artist_1/aliens.svg | mechtron | frame1 | 89.68% |
| devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) | mechtron | frame1 | 90.47% |
| devel/alien_cast/artist_4/aliens.svg | spheroid | frame2 | 90.76% |
| devel/alien_cast/artist_1/aliens.svg | spheroid | frame2 | 91.43% |

## set_5 (approved reference)

`devel/alien_bakeoff/set_5/aliens.svg` is the human-approved style base ("set 5 is by far our best artist"). Its coverage numbers ARE the reference band:

- flapper frame2: 71.85%
- leggite frame2: 74.50%
- leggite frame1: 74.66%
- flapper frame1: 75.55%
- mechtron frame2: 81.69%
- mechtron frame1: 84.22%
- **set_5 range: 71.85% - 84.22%**

## Full observed range

- Lowest: 36.64% (devel/alien_bakeoff/set_2/aliens.svg, flapper frame1)
- Highest: 91.43% (devel/alien_cast/artist_1/aliens.svg, spheroid frame2)
- The lowest values come from bake-off candidates the human did NOT pick (set_2's flapper, 36.64% and 37.96%) and from the in-progress cast3/artist_1 (gollumer 45.42%, packer 46.51%). The approved set_5 never drops below 71.85%, a large gap from these rejected/unfinished low outliers.
- The highest values come from the `alien_cast` round's spheroid species (artist_1 frame2 91.43%, artist_4 frame2 90.76%, artist_3 frame2 88.77%), a species not drawn at all in the bake-off (set_1-set_5 only drew flapper, leggite, mechtron).

## Leggite verdict

Leggite coverage across every set that drew one, low to high:

- devel/alien_bakeoff/set_2/aliens.svg frame2: 56.61%
- devel/alien_bakeoff/set_2/aliens.svg frame1: 57.43%
- devel/alien_bakeoff/set_3/aliens.svg frame2: 61.55%
- devel/alien_bakeoff/set_3/aliens.svg frame1: 62.11%
- devel/alien_bakeoff/set_4/aliens.svg frame2: 63.71%
- devel/alien_bakeoff/set_4/aliens.svg frame1: 66.26%
- devel/alien_bakeoff/set_1/aliens.svg frame1: 66.63%
- devel/alien_bakeoff/set_1/aliens.svg frame2: 67.66%
- devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) frame2: 71.10%
- devel/alien_cast3/artist_5/aliens.svg (IN PROGRESS) frame1: 72.31%
- devel/alien_cast/artist_2/aliens.svg frame2: 73.29%
- devel/alien_cast/artist_2/aliens.svg frame1: 74.35%
- devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) frame2: 74.50%
- devel/alien_bakeoff/set_5/aliens.svg (APPROVED REFERENCE) frame1: 74.66%
- devel/alien_cast/artist_3/aliens.svg frame2: 74.75%
- devel/alien_cast/artist_1/aliens.svg frame2: 77.13%
- devel/alien_cast/artist_1/aliens.svg frame1: 78.59%
- devel/alien_cast/artist_3/aliens.svg frame1: 78.83%
- devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) frame2: 80.40%
- devel/alien_cast3/artist_4/aliens.svg (IN PROGRESS) frame1: 80.68%
- devel/alien_cast/artist_5/aliens.svg frame1: 80.96%
- devel/alien_cast/artist_4/aliens.svg frame2: 81.54%
- devel/alien_cast/artist_5/aliens.svg frame2: 81.99%
- devel/alien_cast/artist_4/aliens.svg frame1: 82.58%
- devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) frame1: 84.02%
- devel/alien_cast3/artist_1/aliens.svg (IN PROGRESS) frame2: 84.75%

**In the approved set_5, leggite sits at 74.50%-74.66%, squarely inside that set's own 71.85%-84.22% band and NOT its lowest value** (set_5's flapper frame2, at 71.85%, is lower). Across all sets, leggite's range (56.61% to 84.75%) tracks the same low-to-high spread as every other species measured, and its lowest reading (56.61%, set_2, a candidate the human did not choose) is still well above the report's overall floor of concern. The leggite is not an outlier at the bottom in the data measured here. The design tension named in the work order (a narrow 32-unit column plus thin legs producing an inherently wispy creature) is not supported by these numbers: set_5's leggite achieves ordinary coverage using the same halo/ink/outline stroke stack as its other species, so the column width constraint does not appear to force low canvas coverage by itself.

## Proposed floor and ceiling

Based only on the measured evidence:

- **Floor: approximately 70% canvas coverage.** The only human-approved reference (set_5) never drops below 71.85%. Every reading below 70% in this dataset comes from either a rejected bake-off candidate (set_2's flapper at 36.64%/37.96%, set_2's leggite at 56.61%/57.43%, set_3's flapper at 47.38%/51.13%) or an in-progress file (cast3/artist_1's gollumer and packer at 45-46%). No approved art was measured below 70%.
- **Ceiling: approximately 85% canvas coverage.** set_5's highest reading is mechtron frame1 at 84.22%. Readings above 85% in this dataset belong to the `alien_cast` round's spheroid species (88-91%), a species the bake-off never evaluated, so there is no approved reference above 85%. It is presented as a soft, less-certain ceiling for the same reason: it rests on the later cast round rather than the bake-off-approved set.
- **Evidence strength:** the floor is well supported (large gap between set_5's 71.85% minimum and the next-highest rejected reading below it, set_1's flapper frame1 at 55.21%). The ceiling is weaker evidence, since no bake-off-approved species crossed 85% and the cast-round spheroid data was never bake-off-judged for wispiness/solidity at all -- it may simply be an unusually solid species design, not evidence that 85-91% is itself acceptable.
