// Render the M.U.L.E. balance-sim results into a single self-contained HTML
// dashboard. Pure rendering: every gate threshold and
// metric arrives already computed in `reportData` (built by
// tests/e2e/e2e_balance_sim.mjs's `buildReportData`), so this module owns no
// sim-tuning constants of its own -- only chart layout and markup.
//
// Charts are hand-drawn inline SVG (no charting library, no external
// stylesheet or script): a multi-line price-curve chart, several small
// categorical bar charts, and a per-seed color-strip. Colors are the
// dataviz-skill reference categorical palette (docs/CLAUDE_HOOK_USAGE_GUIDE.md
// links the `dataviz` skill; palette hexes copied from its
// references/palette.md, light-mode categorical slots 1-4 plus an ordinal
// blue ramp for the seven colony rating tiers) -- entity identity (a good, a
// personality, a seat) always maps to the same fixed color, never a color
// cycled by rank. Every chart also carries a plain HTML table with the same
// values, so nothing is gated behind color perception alone.

import fs from "node:fs";
import path from "node:path";

import { RESOURCES } from "../src/engine/player.ts";
import { PERSONALITIES } from "../src/ai/personas.ts";

// Categorical palette slots 1-4 (blue, aqua, yellow, green), light mode,
// dataviz skill references/palette.md. Fixed order -- never cycled.
const PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#008300"];

// Ordinal blue ramp for the seven colony rating tiers (worst to best), same
// reference palette's sequential "blue" steps 250/300/350/400/450/550/650 --
// each step clears the ordinal 2:1 floor on the light chart surface.
const RATING_TIER_COLORS = [
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#1c5cab",
  "#104281",
];

// Chart chrome and ink tokens, dataviz skill references/palette.md "Chart
// chrome & ink" table (light mode only -- this is an internal engineering
// report, not player-facing UI, so a themed dark mode is out of scope).
const CHART_SURFACE = "#fcfcfb";
const PAGE_PLANE = "#f9f9f7";
const TEXT_PRIMARY = "#0b0b0b";
const TEXT_SECONDARY = "#52514e";
const TEXT_MUTED = "#898781";
const GRIDLINE = "#e1e0d9";
const AXIS = "#c3c2b7";

const GOOD_LABELS = { food: "Food", energy: "Energy", smithore: "Smithore", crystite: "Crystite" };
const PERSONA_LABELS = {
  land_baron: "Land baron",
  ore_speculator: "Ore speculator",
  farmer: "Farmer",
};

//============================================
/**
 * Fixed per-entity color, keyed by RESOURCES/PERSONALITIES order (identity,
 * never rank): the same good or personality always draws in the same color
 * across every chart in the report.
 */
const GOOD_COLORS = Object.fromEntries(RESOURCES.map((good, i) => [good, PALETTE[i]]));
const PERSONA_COLORS = Object.fromEntries(PERSONALITIES.map((name, i) => [name, PALETTE[i]]));
const SEAT_COLORS = [PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]];

//============================================
/**
 * Escape the five ASCII-unsafe HTML characters so any label built from plain
 * data (mode names, personality names, formatted numbers) is always safe to
 * inline into the HTML source.
 *
 * @param {string} value - Raw text to escape.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

//============================================
/**
 * An SVG path for a bar with rounded top corners and a square baseline (the
 * dataviz skill's fixed bar mark spec), so only the data end -- never the
 * baseline -- reads as rounded.
 *
 * @param {number} x - Left edge, in SVG user units.
 * @param {number} y - Top edge (the bar's value end), in SVG user units.
 * @param {number} width - Bar width, in SVG user units.
 * @param {number} height - Bar height, in SVG user units.
 * @param {number} radius - Corner radius, clamped to fit the bar.
 * @returns {string} An SVG path `d` attribute value.
 */
function roundedTopBarPath(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = y + height;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${bottom}`,
    "Z",
  ].join(" ");
}

//============================================
/**
 * Push each label's y position down (never up) so no two labels in a
 * vertically-stacked group sit closer than `minGap`, preserving the caller's
 * relative order. Used for line-chart end-labels, which can otherwise
 * collide when two series converge at the last round.
 *
 * @param {Array<{y: number}>} items - Labels, each carrying its target y.
 * @param {number} minGap - Minimum vertical spacing, in SVG user units.
 * @returns {Array<{y: number}>} A new array, same order, decluttered y values.
 */
function declutterByY(items, minGap) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i] = { ...sorted[i], y: sorted[i - 1].y + minGap };
    }
  }
  return sorted;
}

//============================================
/**
 * A multi-line chart: one polyline per series, sharing one x axis of round
 * labels and one y axis of a shared unit. Renders a legend (mandatory for
 * two or more series), a small dot with a native `<title>` tooltip at every
 * point, and one direct end-label per series (decluttered so converging
 * lines do not overlap).
 *
 * @param {object} spec - Chart spec.
 * @param {string} spec.id - DOM id for the `<figure>` anchor.
 * @param {string} spec.title - Figure caption / chart title.
 * @param {string[]} spec.xLabels - One label per x position (e.g. "R1").
 * @param {Array<{key: string, label: string, color: string, points: number[]}>} spec.series -
 *   One entry per line; `points` must have the same length as `xLabels`.
 * @returns {string} An HTML `<figure>` element containing the SVG chart.
 */
function svgLineChart({ id, title, xLabels, series }) {
  const width = 640;
  const height = 260;
  const marginLeft = 48;
  // Wide enough to hold a decluttered end-label (up to 5 characters, e.g.
  // "229.3") without clipping past the SVG's right edge.
  const marginRight = 44;
  const marginTop = 20;
  const marginBottom = 32;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const allValues = series.flatMap((s) => s.points);
  const maxValue = Math.max(1, ...allValues);
  const niceMax = Math.ceil((maxValue * 1.15) / 5) * 5;
  const stepX = xLabels.length > 1 ? plotWidth / (xLabels.length - 1) : 0;
  const xAt = (i) => marginLeft + stepX * i;
  const yAt = (v) => marginTop + plotHeight * (1 - v / niceMax);

  const gridLines = [];
  const tickCount = 4;
  for (let t = 0; t <= tickCount; t += 1) {
    const value = Math.round((niceMax * t) / tickCount);
    const y = yAt(value);
    gridLines.push(
      `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" stroke="${GRIDLINE}" stroke-width="1" />` +
        `<text x="${marginLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="axis-label">${value}</text>`,
    );
  }

  const xTicks = xLabels
    .map((label, i) => {
      if (xLabels.length > 8 && i % 2 === 1) {
        return "";
      }
      return `<text x="${xAt(i).toFixed(1)}" y="${(height - marginBottom + 16).toFixed(1)}" text-anchor="middle" class="axis-label">${escapeHtml(label)}</text>`;
    })
    .join("");

  const endLabelTargets = series.map((s) => {
    const lastIndex = s.points.length - 1;
    const lastValue = lastIndex >= 0 ? s.points[lastIndex] : 0;
    return { y: yAt(lastValue), color: s.color, text: lastValue.toFixed(1) };
  });
  const endLabels = declutterByY(endLabelTargets, 13);
  const endLabelX = xAt(xLabels.length - 1) + 6;

  const lines = series
    .map((s) => {
      const linePoints = s.points
        .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
        .join(" ");
      const dots = s.points
        .map((v, i) => {
          const x = xAt(i).toFixed(1);
          const y = yAt(v).toFixed(1);
          const tooltip = `${escapeHtml(s.label)}, ${escapeHtml(xLabels[i])}: ${v.toFixed(1)}`;
          return `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}" stroke="${CHART_SURFACE}" stroke-width="1.5"><title>${tooltip}</title></circle>`;
        })
        .join("");
      return (
        `<polyline points="${linePoints}" fill="none" stroke="${s.color}" stroke-width="2" ` +
        `stroke-linejoin="round" stroke-linecap="round" />${dots}`
      );
    })
    .join("");

  const endLabelMarkup = endLabels
    .map(
      (label) =>
        `<text x="${endLabelX.toFixed(1)}" y="${(label.y + 4).toFixed(1)}" class="end-label">${escapeHtml(label.text)}</text>`,
    )
    .join("");

  const legend = series
    .map(
      (s) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`,
    )
    .join("");

  return `<figure class="chart" id="${id}">
  <figcaption>${escapeHtml(title)}</figcaption>
  <div class="legend">${legend}</div>
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)}">
    ${gridLines.join("")}
    ${xTicks}
    <line x1="${marginLeft}" y1="${marginTop + plotHeight}" x2="${width - marginRight}" y2="${marginTop + plotHeight}" stroke="${AXIS}" stroke-width="1" />
    ${lines}
    ${endLabelMarkup}
  </svg>
</figure>`;
}

//============================================
/**
 * A simple categorical bar chart: one bar per category, each colored by the
 * category's fixed entity color, with a value label on the cap and the
 * category name on the x axis (the axis label already carries identity, so
 * no separate legend is drawn). An optional shaded reference band (e.g. a
 * pass/fail target range) draws behind the bars.
 *
 * @param {object} spec - Chart spec.
 * @param {string} spec.id - DOM id for the `<figure>` anchor.
 * @param {string} spec.title - Figure caption / chart title.
 * @param {string[]} spec.categories - One label per bar.
 * @param {number[]} spec.values - One value per bar, same length as categories.
 * @param {string[]} spec.colors - One color per bar, same length as categories.
 * @param {(value: number) => string} [spec.valueFormatter] - Formats the cap label.
 * @param {{min: number, max: number}} [spec.referenceBand] - Optional shaded
 *   target-range rectangle drawn behind the bars.
 * @returns {string} An HTML `<figure>` element containing the SVG chart.
 */
function svgBarChart({
  id,
  title,
  categories,
  values,
  colors,
  valueFormatter = (v) => `${v}`,
  referenceBand = null,
}) {
  const width = 640;
  const height = 220;
  const marginLeft = 48;
  const marginRight = 16;
  const marginTop = 28;
  const marginBottom = 40;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const bandCeiling = referenceBand ? referenceBand.max : 0;
  const maxValue = Math.max(1, ...values, bandCeiling);
  const niceMax = Math.ceil((maxValue * 1.2) / 5) * 5;
  const slotWidth = plotWidth / categories.length;
  const barWidth = Math.min(24, slotWidth - 12);
  const baselineY = marginTop + plotHeight;
  const yAt = (v) => marginTop + plotHeight * (1 - v / niceMax);

  const bandRect = referenceBand
    ? `<rect x="${marginLeft}" y="${yAt(referenceBand.max).toFixed(1)}" width="${plotWidth}" ` +
      `height="${(yAt(referenceBand.min) - yAt(referenceBand.max)).toFixed(1)}" fill="${GOOD_COLORS.energy}" fill-opacity="0.10" />`
    : "";

  const gridLines = [];
  const tickCount = 4;
  for (let t = 0; t <= tickCount; t += 1) {
    const value = Math.round((niceMax * t) / tickCount);
    const y = yAt(value);
    gridLines.push(
      `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" stroke="${GRIDLINE}" stroke-width="1" />` +
        `<text x="${marginLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="axis-label">${value}</text>`,
    );
  }

  const bars = categories
    .map((category, i) => {
      const value = values[i];
      const x = marginLeft + slotWidth * i + (slotWidth - barWidth) / 2;
      const y = yAt(value);
      const barHeight = baselineY - y;
      const label = valueFormatter(value);
      const barPath = roundedTopBarPath(x, y, barWidth, barHeight, 4);
      return (
        `<path d="${barPath}" fill="${colors[i]}"><title>${escapeHtml(category)}: ${escapeHtml(label)}</title></path>` +
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" class="bar-value">${escapeHtml(label)}</text>` +
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(height - marginBottom + 16).toFixed(1)}" text-anchor="middle" class="axis-label">${escapeHtml(category)}</text>`
      );
    })
    .join("");

  return `<figure class="chart" id="${id}">
  <figcaption>${escapeHtml(title)}</figcaption>
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)}">
    ${bandRect}
    ${gridLines.join("")}
    <line x1="${marginLeft}" y1="${baselineY}" x2="${width - marginRight}" y2="${baselineY}" stroke="${AXIS}" stroke-width="1" />
    ${bars}
  </svg>
</figure>`;
}

//============================================
/**
 * A per-seed color-strip: one small square per seeded game, colored by the
 * seat that won (gray for a game that never terminated), each carrying a
 * `<title>` tooltip naming the seed, seat, and personality. A fixed legend
 * maps seat number to color; a `<details>` table beneath lists every row so
 * the same information is available without reading color.
 *
 * @param {object} spec - Chart spec.
 * @param {string} spec.id - DOM id for the `<figure>` anchor.
 * @param {string} spec.title - Figure caption / chart title.
 * @param {Array<object>} spec.perSeedResults - One record per seeded game:
 *   `{seed, winnerIndex, personaBySeat, colonyFailed, colonyRatingTier, terminated}`.
 * @returns {string} An HTML `<figure>` element containing the SVG strip.
 */
function svgSeedStrip({ id, title, perSeedResults }) {
  const cellSize = 14;
  const gap = 2;
  const perRow = 20;
  const rows = Math.max(1, Math.ceil(perSeedResults.length / perRow));
  const width = perRow * (cellSize + gap);
  const height = rows * (cellSize + gap) + 4;

  const cells = perSeedResults
    .map((result, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = col * (cellSize + gap);
      const y = row * (cellSize + gap);
      if (result.winnerIndex === null) {
        return (
          `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${TEXT_MUTED}">` +
          `<title>seed ${result.seed}: did not terminate</title></rect>`
        );
      }
      const persona = result.personaBySeat[result.winnerIndex] ?? "no persona (seat 0)";
      const tooltip = `seed ${result.seed}: seat ${result.winnerIndex} (${persona}) won`;
      return (
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${SEAT_COLORS[result.winnerIndex]}">` +
        `<title>${escapeHtml(tooltip)}</title></rect>`
      );
    })
    .join("");

  const legend = SEAT_COLORS.map(
    (color, seat) =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>Seat ${seat}</span>`,
  ).join("");

  const tableRows = perSeedResults
    .map((result) => {
      const winnerLabel =
        result.winnerIndex === null
          ? "did not terminate"
          : `seat ${result.winnerIndex} (${result.personaBySeat[result.winnerIndex] ?? "no persona"})`;
      const colonyLabel = result.colonyFailed
        ? "failed"
        : result.colonyRatingTier === null
          ? "n/a"
          : `tier ${result.colonyRatingTier}`;
      return `<tr><td>${result.seed}</td><td>${escapeHtml(winnerLabel)}</td><td>${escapeHtml(colonyLabel)}</td></tr>`;
    })
    .join("");

  return `<figure class="chart" id="${id}">
  <figcaption>${escapeHtml(title)}</figcaption>
  <div class="legend">${legend}</div>
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)}">
    ${cells}
  </svg>
  <details>
    <summary>Table view (${perSeedResults.length} seeds)</summary>
    <table class="data-table">
      <thead><tr><th>Seed</th><th>Winner</th><th>Colony</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </details>
</figure>`;
}

//============================================
/**
 * The gate-vs-target table for one mode: every row `main()` in
 * tests/e2e/e2e_balance_sim.mjs enforces, pre-formatted by `buildGateRows` so
 * this module needs no gate-threshold constants of its own.
 *
 * @param {string} mode - "beginner" or "standard".
 * @param {Array<{label: string, value: string, target: string, pass: boolean}>} gateRows -
 *   One row per gate.
 * @returns {string} An HTML `<table>` element.
 */
function renderGateTable(mode, gateRows) {
  const rows = gateRows
    .map(
      (row) =>
        `<tr class="${row.pass ? "gate-pass" : "gate-fail"}">` +
        `<td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td>` +
        `<td>${escapeHtml(row.target)}</td><td>${row.pass ? "PASS" : "FAIL"}</td></tr>`,
    )
    .join("");
  return `<table class="gate-table" id="gate-table-${mode}">
  <caption>Gate vs target</caption>
  <thead><tr><th>Metric</th><th>Value</th><th>Target</th><th>Result</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

//============================================
/**
 * A plain data table mirroring the price-curve chart's exact averaged prices,
 * one row per round, one column per good.
 *
 * @param {Record<string, Array<{round: number, avgPrice: number}>>} priceCurve -
 *   Per-good round/avgPrice series (same shape the line chart consumes).
 * @returns {string} An HTML `<table>` element.
 */
function renderPriceCurveTable(priceCurve) {
  const rounds = priceCurve[RESOURCES[0]].map((point) => point.round);
  const header = RESOURCES.map((good) => `<th>${escapeHtml(GOOD_LABELS[good])}</th>`).join("");
  const rows = rounds
    .map((round, i) => {
      const cells = RESOURCES.map(
        (good) => `<td>${priceCurve[good][i].avgPrice.toFixed(1)}</td>`,
      ).join("");
      return `<tr><td>R${round}</td>${cells}</tr>`;
    })
    .join("");
  return `<details>
    <summary>Table view (${rounds.length} rounds)</summary>
    <table class="data-table">
      <thead><tr><th>Round</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </details>`;
}

//============================================
/**
 * Two report-only event-frequency stat tiles (wampus catches and pub gambles
 * per game), the signal the plan asks the dashboard to
 * surface alongside the gated metrics.
 *
 * @param {string} mode - "beginner" or "standard".
 * @param {{wampusCatchesPerGame: number, pubGamblesPerGame: number}} data - Mode metrics.
 * @returns {string} An HTML section with two stat tiles.
 */
function renderEventFrequencies(mode, data) {
  return `<div class="stat-tiles" id="event-frequencies-${mode}">
  <div class="stat-tile">
    <div class="stat-label">Wampus catches / game</div>
    <div class="stat-value">${data.wampusCatchesPerGame.toFixed(2)}</div>
  </div>
  <div class="stat-tile">
    <div class="stat-label">Pub gambles / game</div>
    <div class="stat-value">${data.pubGamblesPerGame.toFixed(2)}</div>
  </div>
</div>`;
}

//============================================
/**
 * Render one mode's full section: gate table, price-curve chart, trade
 * volumes, persona win rates, per-seed win strip, colony outcomes, seat
 * spread, and event frequencies.
 *
 * @param {string} mode - "beginner" or "standard".
 * @param {object} data - This mode's slice of `reportData.modes`.
 * @returns {string} An HTML `<section>` element.
 */
function renderModeSection(mode, data) {
  const modeLabel = mode === "beginner" ? "Beginner" : "Standard";

  const priceCurveChart = svgLineChart({
    id: `price-curves-${mode}`,
    title: `${modeLabel} mode: store sell price by round`,
    xLabels: data.priceCurve[RESOURCES[0]].map((point) => `R${point.round}`),
    series: RESOURCES.map((good) => ({
      key: good,
      label: GOOD_LABELS[good],
      color: GOOD_COLORS[good],
      points: data.priceCurve[good].map((point) => point.avgPrice),
    })),
  });
  const priceCurveTable = renderPriceCurveTable(data.priceCurve);

  const tradeVolumeChart = svgBarChart({
    id: `trade-volumes-${mode}`,
    title: `${modeLabel} mode: total units traded per good`,
    categories: RESOURCES.map((good) => GOOD_LABELS[good]),
    values: RESOURCES.map((good) => data.tradesByGoodTotal[good]),
    colors: RESOURCES.map((good) => GOOD_COLORS[good]),
  });

  const personaWinChart = svgBarChart({
    id: `persona-win-rates-${mode}`,
    title: `${modeLabel} mode: win rate per AI personality`,
    categories: PERSONALITIES.map((name) => PERSONA_LABELS[name]),
    values: PERSONALITIES.map((name) => data.personaWinRate[name] * 100),
    colors: PERSONALITIES.map((name) => PERSONA_COLORS[name]),
    valueFormatter: (v) => `${v.toFixed(1)}%`,
    referenceBand: {
      min: data.personaWinRateBand.min * 100,
      max: data.personaWinRateBand.max * 100,
    },
  });

  const seedStrip = svgSeedStrip({
    id: `win-rate-per-seed-${mode}`,
    title: `${modeLabel} mode: winner by seed (one cell per seeded game)`,
    perSeedResults: data.perSeedResults,
  });

  const ratingChart = svgBarChart({
    id: `colony-outcomes-${mode}`,
    title: `${modeLabel} mode: colony rating tier distribution (surviving games)`,
    categories: data.ratingTierCounts.map((_, i) => `T${i}`),
    values: data.ratingTierCounts,
    colors: RATING_TIER_COLORS,
  });

  const seatChart = svgBarChart({
    id: `seat-spread-${mode}`,
    title: `${modeLabel} mode: wins by seat`,
    categories: ["Seat 0", "Seat 1", "Seat 2", "Seat 3"],
    values: data.winnerSeatCounts,
    colors: SEAT_COLORS,
  });

  return `<section class="mode-section" id="mode-${mode}">
  <h2>${modeLabel} mode (${data.terminated}/${data.games} games terminated)</h2>
  ${renderGateTable(mode, data.gateRows)}
  ${priceCurveChart}
  ${priceCurveTable}
  ${tradeVolumeChart}
  ${personaWinChart}
  ${seedStrip}
  ${ratingChart}
  ${seatChart}
  ${renderEventFrequencies(mode, data)}
</section>`;
}

const REPORT_CSS = `
  body { margin: 0; background: ${PAGE_PLANE}; color: ${TEXT_PRIMARY};
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  header, .mode-section { max-width: 720px; margin: 0 auto; padding: 16px 24px; }
  h1 { font-size: 22px; }
  h2 { font-size: 18px; border-bottom: 1px solid ${GRIDLINE}; padding-bottom: 6px; }
  .chart { background: ${CHART_SURFACE}; border: 1px solid ${GRIDLINE}; border-radius: 6px;
    padding: 12px; margin: 16px 0; }
  figcaption { font-weight: 600; margin-bottom: 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;
    color: ${TEXT_SECONDARY}; font-size: 13px; }
  .legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .axis-label { font-size: 11px; fill: ${TEXT_MUTED}; }
  .bar-value { font-size: 11px; fill: ${TEXT_SECONDARY}; }
  .end-label { font-size: 11px; fill: ${TEXT_SECONDARY}; }
  table.gate-table, table.data-table { border-collapse: collapse; width: 100%; margin: 8px 0;
    font-size: 13px; }
  table.gate-table caption { text-align: left; font-weight: 600; margin-bottom: 4px; }
  table.gate-table th, table.gate-table td, table.data-table th, table.data-table td {
    border: 1px solid ${GRIDLINE}; padding: 4px 8px; text-align: left; }
  tr.gate-pass td:last-child { color: #006300; font-weight: 600; }
  tr.gate-fail td:last-child { color: #b3261e; font-weight: 600; }
  .stat-tiles { display: flex; gap: 16px; margin: 16px 0; }
  .stat-tile { background: ${CHART_SURFACE}; border: 1px solid ${GRIDLINE}; border-radius: 6px;
    padding: 12px 16px; }
  .stat-label { font-size: 12px; color: ${TEXT_SECONDARY}; }
  .stat-value { font-size: 22px; font-weight: 600; }
  details summary { cursor: pointer; color: ${TEXT_SECONDARY}; font-size: 13px; margin: 4px 0; }
`;

//============================================
/**
 * Render the full balance-sim dashboard as one self-contained HTML string.
 * No external stylesheet, script, or
 * font -- every chart is inline SVG and every style rule is in one embedded
 * `<style>` block, so the file opens directly from disk.
 *
 * @param {object} reportData - Built by `buildReportData` in
 *   tests/e2e/e2e_balance_sim.mjs: `{generatedAt, seedCount, modes: {beginner, standard}}`.
 * @returns {string} A complete `<!DOCTYPE html>` document.
 */
export function renderBalanceReportHtml(reportData) {
  const modeSections = ["beginner", "standard"]
    .map((mode) => renderModeSection(mode, reportData.modes[mode]))
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>M.U.L.E. balance sim dashboard</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<header>
  <h1>M.U.L.E. balance sim dashboard</h1>
  <p>Generated ${escapeHtml(reportData.generatedAt)} from ${reportData.seedCount} seeds per mode.
  Regenerate with <code>node --import tsx tests/e2e/e2e_balance_sim.mjs ${reportData.seedCount} --report</code>.</p>
</header>
${modeSections}
</body>
</html>
`;
}

//============================================
/**
 * Render the dashboard and write it to `<outputDir>/index.html`, creating
 * `outputDir` (and any missing parents) if needed.
 *
 * @param {object} reportData - See `renderBalanceReportHtml`.
 * @param {string} outputDir - Directory to write `index.html` into.
 * @returns {string} The written file's path.
 */
export function writeBalanceReport(reportData, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, "index.html");
  fs.writeFileSync(outputFile, renderBalanceReportHtml(reportData));
  return outputFile;
}
