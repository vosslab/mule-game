// Unit tests for the full-stage auction viewBox geometry module.
//
// These pin the region rects' endpoints (not re-hardcoded coordinates: every
// assertion reads the exported region constants), lane-center placement, the
// runway's price-to-x monotonicity, and the crate/usage-bar/label-clamp
// helpers' bounds. Run via `node --import tsx --test tests/test_auction_geometry.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  VIEW_BOX_WIDTH,
  VIEW_BOX_HEIGHT,
  TOP_BAND_REGION,
  DOCK_REGION,
  BUY_RAIL_REGION,
  RUNWAY_REGION,
  SELL_RAIL_REGION,
  TIMER_REGION,
  LANE_COUNT,
  LANE_FIELD_REGION,
  PENNANT_BAND_REGION,
  PENNANT_BAND_HEIGHT,
  PENNANT_PLATE_HEIGHT,
  pennantPlateCenterY,
  pennantLeaderY,
  laneCenterY,
  laneHeight,
  priceToX,
  stockToCrateCount,
  MAX_RAIL_CRATES,
  CRATE_GLYPH_SIZE,
  RAIL_STOCK_FONT_SIZE,
  RAIL_STOCK_CRATE_GAP,
  railFootBand,
  railStockBaselineY,
  railCrateBaseY,
  railCrateY,
  railCrateStackTop,
  railTextBaselineY,
  usageToBarWidth,
  USAGE_BAR_MAX_WIDTH,
  clampLabelX,
  rectWidth,
  rectHeight,
  railTextColumn,
  RAIL_QUOTE_FONT_SIZE,
  RAIL_LABEL_FONT_SIZE,
  AVATAR_SIZE,
  AVATAR_TAG_HEIGHT,
  LABEL_GUTTER_COUNT,
  BANNER_GUTTER,
  CAPTION_GUTTER,
  BANNER_WIDTH,
  WALL_LABEL_MAX_WIDTH,
  laneOccupantBand,
  labelGutterBand,
  labelGutterCenterY,
  bandHeight,
  separateLabelPair,
} from "../src/ui/scenes/auction_geometry.ts";

//============================================
/**
 * Whether two vertical bands share any y. Touching edges (one band's bottom
 * equal to the next's top) do NOT overlap -- that is the exact relationship a
 * lane's occupant band has with the gutter beneath it.
 *
 * @param a - First band.
 * @param b - Second band.
 * @returns True when the two bands intersect over a nonzero span.
 */
function bandsOverlap(a, b) {
  return a.top < b.bottom && b.top < a.bottom;
}

test("viewBox dimensions are the fixed 16:10 stage", () => {
  assert.equal(VIEW_BOX_WIDTH, 960);
  assert.equal(VIEW_BOX_HEIGHT, 600);
});

test("regions tile the viewBox without gaps or overlap along x", () => {
  assert.equal(DOCK_REGION.left, 0);
  assert.equal(DOCK_REGION.right, BUY_RAIL_REGION.left);
  assert.equal(BUY_RAIL_REGION.right, RUNWAY_REGION.left);
  assert.equal(RUNWAY_REGION.right, SELL_RAIL_REGION.left);
  assert.ok(SELL_RAIL_REGION.right <= VIEW_BOX_WIDTH);
});

test("top band and timer regions bound the middle bands vertically", () => {
  assert.equal(TOP_BAND_REGION.top, 0);
  assert.equal(TOP_BAND_REGION.bottom, RUNWAY_REGION.top);
  assert.ok(TIMER_REGION.top >= RUNWAY_REGION.bottom);
  assert.ok(TIMER_REGION.bottom <= VIEW_BOX_HEIGHT);
});

// Asserted as a RELATION (equal spacing, in order, half a row from each end),
// never as the four numbers themselves: the region rects are declared retunable
// in auction_geometry.ts's own header, so echoing the four figures back here
// would fail a legitimate retune for a reason that has nothing to do with
// laneCenterY's behavior (docs/PYTEST_STYLE.md, "brittle tests").
test("laneCenterY: the lane centers are evenly spaced, in order, down the lane field", () => {
  const centers = [];
  for (let slot = 0; slot < LANE_COUNT; slot += 1) {
    centers.push(laneCenterY(slot));
  }
  for (let slot = 0; slot + 1 < LANE_COUNT; slot += 1) {
    const spacing = centers[slot + 1] - centers[slot];
    assert.equal(spacing, laneHeight(), `lanes ${slot} and ${slot + 1} are not one row apart`);
  }
  // The first and last centers sit half a row inside the LANE FIELD, which is
  // what makes the four rows fill it exactly rather than drifting to one end.
  // The field, not the runway: the runway's top strip is the pennant band, and
  // lanes centered against the runway would walk avatars up into it.
  assert.equal(centers[0] - LANE_FIELD_REGION.top, laneHeight() / 2);
  assert.equal(LANE_FIELD_REGION.bottom - centers[LANE_COUNT - 1], laneHeight() / 2);
});

test("laneCenterY: every lane center falls inside the lane field", () => {
  for (let slot = 0; slot < LANE_COUNT; slot += 1) {
    const y = laneCenterY(slot);
    assert.ok(y > LANE_FIELD_REGION.top);
    assert.ok(y < LANE_FIELD_REGION.bottom);
  }
});

// --- The pennant band: the market's header, above the walking floor ----------
//
// The regression this class of test pins: the BID/ASK pennants name the two
// prices the auction turns on, and they used to live in a gutter BETWEEN two
// lane rows -- safe only because a y-band derivation said so. They now live in a
// band above every lane, and the guarantee changes kind: a pennant cannot
// collide with an avatar because avatars are in the lane field and the band is
// not. These assert that structural disjointness directly.

test("PENNANT_BAND_REGION and LANE_FIELD_REGION tile the runway with no gap or overlap", () => {
  assert.equal(PENNANT_BAND_REGION.top, RUNWAY_REGION.top);
  assert.equal(PENNANT_BAND_REGION.bottom, LANE_FIELD_REGION.top);
  assert.equal(LANE_FIELD_REGION.bottom, RUNWAY_REGION.bottom);
  assert.equal(rectHeight(PENNANT_BAND_REGION), PENNANT_BAND_HEIGHT);
  // Both share the runway's x span: a pennant's x is a PRICE, read against the
  // same axis the avatars walk. A band inset from the runway would silently
  // rescale that axis for the two labels whose entire job is to mark it.
  assert.equal(PENNANT_BAND_REGION.left, RUNWAY_REGION.left);
  assert.equal(PENNANT_BAND_REGION.right, RUNWAY_REGION.right);
  assert.equal(LANE_FIELD_REGION.left, RUNWAY_REGION.left);
  assert.equal(LANE_FIELD_REGION.right, RUNWAY_REGION.right);
});

// The load-bearing assertion of the move: no avatar, in any lane, at any price,
// can reach any part of the band. Everything else about the pennants -- the
// splay, the clamp, the leaders -- is legibility. This is safety.
test("PENNANT_BAND_REGION: no lane's occupant band reaches into the pennant band", () => {
  for (let slot = 0; slot < LANE_COUNT; slot += 1) {
    const occupant = laneOccupantBand(slot);
    assert.ok(
      occupant.top >= PENNANT_BAND_REGION.bottom,
      `lane ${slot}'s occupant band (${occupant.top}-${occupant.bottom}) reaches into the ` +
        `pennant band (${PENNANT_BAND_REGION.top}-${PENNANT_BAND_REGION.bottom})`,
    );
  }
});

test("pennantPlateCenterY: the whole plate sits inside the band, clear of the lane field", () => {
  const plateTop = pennantPlateCenterY() - PENNANT_PLATE_HEIGHT / 2;
  const plateBottom = pennantPlateCenterY() + PENNANT_PLATE_HEIGHT / 2;
  assert.ok(plateTop >= PENNANT_BAND_REGION.top, "the pennant plate escapes the band's top");
  assert.ok(plateBottom <= LANE_FIELD_REGION.top, "the pennant plate reaches the lane field");
});

// The leader rail is the band's LOWEST drawn element and the y each dashed price
// line starts at, so it is the one that has to clear the floor by a real margin
// rather than merely not touch it.
test("pennantLeaderY: the leader rail sits below the plate and above the lane field", () => {
  const plateBottom = pennantPlateCenterY() + PENNANT_PLATE_HEIGHT / 2;
  assert.ok(pennantLeaderY() > plateBottom, "the leader rail runs through its own plate");
  assert.ok(pennantLeaderY() < LANE_FIELD_REGION.top, "the leader rail drops into the lane field");
});

test("priceToX: floor maps to the runway's left edge, ceiling to its right edge", () => {
  assert.equal(priceToX(10, 10, 50), RUNWAY_REGION.left);
  assert.equal(priceToX(50, 10, 50), RUNWAY_REGION.right);
});

test("priceToX: a rising price walks the x coordinate rightward (monotonic)", () => {
  const low = priceToX(20, 10, 50);
  const mid = priceToX(30, 10, 50);
  const high = priceToX(40, 10, 50);
  assert.ok(low < mid);
  assert.ok(mid < high);
});

test("priceToX: out-of-band prices clamp onto the runway", () => {
  assert.equal(priceToX(-5, 10, 50), RUNWAY_REGION.left);
  assert.equal(priceToX(999, 10, 50), RUNWAY_REGION.right);
});

test("priceToX: a zero-width band centers rather than dividing by zero", () => {
  const center = (RUNWAY_REGION.left + RUNWAY_REGION.right) / 2;
  assert.equal(priceToX(20, 20, 20), center);
});

test("stockToCrateCount: empty and full stock hit the crate-count bounds", () => {
  assert.equal(stockToCrateCount(0, 100), 0);
  assert.equal(stockToCrateCount(100, 100), MAX_RAIL_CRATES);
});

test("stockToCrateCount: a non-positive max stock renders zero crates", () => {
  assert.equal(stockToCrateCount(5, 0), 0);
});

test("usageToBarWidth: zero and full amounts hit the bar-width bounds", () => {
  assert.equal(usageToBarWidth(0, 10), 0);
  assert.equal(usageToBarWidth(10, 10), USAGE_BAR_MAX_WIDTH);
});

test("usageToBarWidth: a non-positive max amount renders a zero-width bar", () => {
  assert.equal(usageToBarWidth(5, 0), 0);
});

test("clampLabelX: a label that already fits stays put", () => {
  const x = clampLabelX(DOCK_REGION.left + 10, 30, DOCK_REGION);
  assert.equal(x, DOCK_REGION.left + 10);
});

test("clampLabelX: a label pinned past the right edge clamps back inside", () => {
  const labelWidth = 30;
  const x = clampLabelX(DOCK_REGION.right, labelWidth, DOCK_REGION);
  assert.equal(x, DOCK_REGION.right - labelWidth);
});

test("clampLabelX: a label wider than the region pins to the left edge", () => {
  const regionWidth = DOCK_REGION.right - DOCK_REGION.left;
  const x = clampLabelX(DOCK_REGION.left, regionWidth + 50, DOCK_REGION);
  assert.equal(x, DOCK_REGION.left);
});

// --- Lane occupant bands and the label gutters between them -----------------
//
// The regression these pin: a label drawn at a y an avatar can reach WILL be
// collided with, because avatars sweep the whole runway width by construction.
// The gutters are the only bands that are safe at every price, so their
// emptiness is asserted here rather than eyeballed in one frame.

test("laneOccupantBand: covers the avatar sprite box plus its head decoration", () => {
  const band = laneOccupantBand(0);
  const centerY = laneCenterY(0);
  assert.equal(band.bottom, centerY + AVATAR_SIZE / 2);
  assert.equal(band.top, centerY - AVATAR_SIZE / 2 - AVATAR_TAG_HEIGHT);
  assert.ok(bandHeight(band) === AVATAR_SIZE + AVATAR_TAG_HEIGHT);
});

test("laneOccupantBand: every lane's occupied band stays inside the lane field", () => {
  for (let slot = 0; slot < LANE_COUNT; slot += 1) {
    const band = laneOccupantBand(slot);
    assert.ok(band.top >= LANE_FIELD_REGION.top, `lane ${slot} tag escapes the lane field's top`);
    assert.ok(
      band.bottom <= LANE_FIELD_REGION.bottom,
      `lane ${slot} escapes the lane field's bottom`,
    );
  }
});

test("laneOccupantBand: neighboring lanes never overlap each other", () => {
  for (let slot = 0; slot + 1 < LANE_COUNT; slot += 1) {
    const above = laneOccupantBand(slot);
    const below = laneOccupantBand(slot + 1);
    assert.ok(!bandsOverlap(above, below), `lanes ${slot} and ${slot + 1} overlap`);
  }
});

test("labelGutterBand: every gutter has usable height", () => {
  assert.equal(LABEL_GUTTER_COUNT, LANE_COUNT - 1);
  for (let index = 0; index < LABEL_GUTTER_COUNT; index += 1) {
    assert.ok(bandHeight(labelGutterBand(index)) > 0, `gutter ${index} is empty`);
  }
});

// This is the load-bearing assertion of the whole module: NO gutter may
// intersect ANY lane's occupied band. Every runway label derives its y from a
// gutter, so this one check is what makes all of them collision-free at every
// price, in every lane, at once.
test("labelGutterBand: no gutter intersects any lane's occupant band", () => {
  for (let index = 0; index < LABEL_GUTTER_COUNT; index += 1) {
    const gutter = labelGutterBand(index);
    for (let slot = 0; slot < LANE_COUNT; slot += 1) {
      const occupant = laneOccupantBand(slot);
      assert.ok(
        !bandsOverlap(gutter, occupant),
        `gutter ${index} (${gutter.top}-${gutter.bottom}) collides with lane ${slot} ` +
          `(${occupant.top}-${occupant.bottom})`,
      );
    }
  }
});

test("labelGutterCenterY: each gutter's center sits inside its own band", () => {
  for (let index = 0; index < LABEL_GUTTER_COUNT; index += 1) {
    const band = labelGutterBand(index);
    const centerY = labelGutterCenterY(index);
    assert.ok(centerY > band.top && centerY < band.bottom);
  }
});

// The pennants no longer claim a gutter -- they left the floor entirely for the
// pennant band -- so the remaining two claimants are the banner and the crossing
// caption. What still has to hold is that no two label classes silently pick the
// same band: they are assigned from different modules (auction_arena.tsx and
// auction_trade_fx.ts), which is exactly how they would come to overlap.
test("gutter assignments: the label classes claim different gutters", () => {
  const assigned = [BANNER_GUTTER, CAPTION_GUTTER];
  assert.equal(new Set(assigned).size, assigned.length, "two label classes share a gutter");
  for (const index of assigned) {
    assert.ok(index >= 0 && index < LABEL_GUTTER_COUNT, `gutter ${index} does not exist`);
  }
});

// The banner and the wall labels deliberately SHARE BANNER_GUTTER. That is only
// safe because they can never share an x: the banner is centered on the runway
// and the wall labels are pinned to its two extreme edges.
test("BANNER_GUTTER: the centered banner leaves both wall labels a clear x span", () => {
  const centerX = RUNWAY_REGION.left + rectWidth(RUNWAY_REGION) / 2;
  const bannerLeft = centerX - BANNER_WIDTH / 2;
  const bannerRight = centerX + BANNER_WIDTH / 2;
  assert.ok(
    bannerLeft - RUNWAY_REGION.left >= WALL_LABEL_MAX_WIDTH,
    "the banner reaches into the CHEAP label's x span",
  );
  assert.ok(
    RUNWAY_REGION.right - bannerRight >= WALL_LABEL_MAX_WIDTH,
    "the banner reaches into the EXPENSIVE label's x span",
  );
});

// --- separateLabelPair: the BID/ASK pennants at a cleared market -------------
//
// The region is PENNANT_BAND_REGION, the rect the pennants are actually clamped
// into by auction_arena.tsx, not the runway they used to be clamped into. The
// two currently share an x span, so passing the runway here would still pass --
// which is the point of naming the real one: if the band is ever inset from the
// runway, these edge cases follow it instead of quietly testing the wrong rect.

test("separateLabelPair: a pair already far apart keeps both preferred positions", () => {
  const pair = separateLabelPair(300, 700, 92, 140, PENNANT_BAND_REGION);
  assert.equal(pair.low, 300);
  assert.equal(pair.high, 700);
});

test("separateLabelPair: a converged pair splays to the minimum separation", () => {
  const pair = separateLabelPair(500, 500, 92, 140, PENNANT_BAND_REGION);
  assert.equal(pair.high - pair.low, 140);
  assert.equal((pair.low + pair.high) / 2, 500);
});

// The exact regression: bid == ask == the band CEILING. Clamping the two plates
// independently used to land them 74% on top of each other, hiding the BID
// price at the moment of the trade. The pair must shift as a unit instead.
test("separateLabelPair: a pair converged at the region's right edge stays separated", () => {
  const labelWidth = 92;
  const pair = separateLabelPair(
    PENNANT_BAND_REGION.right,
    PENNANT_BAND_REGION.right,
    labelWidth,
    140,
    PENNANT_BAND_REGION,
  );
  assert.equal(pair.high - pair.low, 140);
  assert.ok(
    pair.high + labelWidth / 2 <= PENNANT_BAND_REGION.right,
    "the high label escapes the region",
  );
  assert.ok(
    pair.low - labelWidth / 2 >= PENNANT_BAND_REGION.left,
    "the low label escapes the region",
  );
});

test("separateLabelPair: a pair converged at the region's left edge stays separated", () => {
  const labelWidth = 92;
  const pair = separateLabelPair(
    PENNANT_BAND_REGION.left,
    PENNANT_BAND_REGION.left,
    labelWidth,
    140,
    PENNANT_BAND_REGION,
  );
  assert.equal(pair.high - pair.low, 140);
  assert.ok(
    pair.low - labelWidth / 2 >= PENNANT_BAND_REGION.left,
    "the low label escapes the region",
  );
});

// --- Store rail text columns: the mirror --------------------------------------
//
// The regression these pin: an avatar is centered on its price and a band-edge
// price puts its center ON the rail's runway edge, so the sprite overhangs the
// rail and covers whatever column is innermost. The sell rail used to run its
// columns in raw +x order rather than mirrored, which put the LIVE QUOTE there
// and got it measured 96.4% covered by an avatar. What must hold on BOTH rails:
// the innermost column is the static caption, and the live quote is outboard.

test("railTextColumn: the static caption is the innermost column on both rails", () => {
  for (const side of ["buy", "sell"]) {
    const label = railTextColumn(side, "label");
    const quote = railTextColumn(side, "quote");
    assert.ok(
      label.runwayInset < quote.runwayInset,
      `${side} rail puts its live quote nearer the runway than its caption`,
    );
  }
});

test("railTextColumn: the two rails are mirror images of each other", () => {
  for (const element of ["quote", "label"]) {
    const buy = railTextColumn("buy", element);
    const sell = railTextColumn("sell", element);
    assert.equal(buy.runwayInset, sell.runwayInset, `${element} sits at different depths`);
    assert.equal(buy.right - buy.left, sell.right - sell.left, `${element} widths differ`);
    assert.equal(buy.fontSize, sell.fontSize, `${element} font sizes differ`);
    // Same distance from each rail's own runway edge, measured outward.
    assert.equal(RUNWAY_REGION.left - buy.right, sell.left - RUNWAY_REGION.right);
  }
});

test("railTextColumn: no rail text ink reaches into the runway", () => {
  for (const element of ["quote", "label"]) {
    assert.ok(
      railTextColumn("buy", element).right <= RUNWAY_REGION.left,
      `the buy rail's ${element} spills into the runway`,
    );
    assert.ok(
      railTextColumn("sell", element).left >= RUNWAY_REGION.right,
      `the sell rail's ${element} spills into the runway`,
    );
  }
});

test("railTextColumn: a rail's two columns never overlap each other", () => {
  for (const side of ["buy", "sell"]) {
    const label = railTextColumn(side, "label");
    const quote = railTextColumn(side, "quote");
    const overlaps = label.left < quote.right && quote.left < label.right;
    assert.ok(!overlaps, `${side} rail prints its quote over its caption`);
  }
});

// Under rotate(-90) a glyph's ink hangs on the -x side of its baseline, so the
// baseline must land INSIDE the column it was placed for -- on either rail. Get
// this wrong on one side and the text draws a whole column away from where the
// mirror above says it is.
test("railTextColumn: each column's baseline sits inside that column's ink span", () => {
  for (const side of ["buy", "sell"]) {
    for (const element of ["quote", "label"]) {
      const column = railTextColumn(side, element);
      assert.ok(
        column.baselineX > column.left && column.baselineX <= column.right,
        `${side} ${element} baseline ${column.baselineX} is outside [${column.left}, ${column.right}]`,
      );
    }
  }
});

test("railTextColumn: the caption's column is narrower than the quote's", () => {
  // The caption is the sacrificial innermost column, so it is the smaller text;
  // this is what leaves the quote room to sit outboard of it inside a 40-unit
  // rail. If the two font sizes ever invert, the layout above stops being the
  // deliberate trade it is documented as.
  assert.ok(RAIL_LABEL_FONT_SIZE < RAIL_QUOTE_FONT_SIZE);
});

test("separateLabelPair: an INVERTED pair (ask left of bid) still separates", () => {
  // The engine really does produce an inverted pair: both sides step in the same
  // tick, so a player-vs-player cross overshoots (auction_arena.tsx's header).
  const pair = separateLabelPair(520, 480, 92, 140, PENNANT_BAND_REGION);
  assert.ok(pair.high - pair.low >= 140);
  assert.ok(pair.low < pair.high, "the pair did not resolve into left/right order");
});

// --- Store rail stock: the number and the crates it counts --------------------
//
// The regression these pin: the stock number floated in a label gutter at
// roughly lane-2 height while the crates it counts were stacked ~200 units below
// it, so the count and the picture of the count read as two unrelated facts. A
// number belongs adjacent to the thing it counts. Both are now derived from one
// anchor -- the avatar-free strip at the rail's foot -- so "adjacent" is a
// property of the layout rather than a coincidence of two literals.

test("railFootBand: the rail's foot strip is below every lane's occupant band", () => {
  const foot = railFootBand();
  assert.ok(bandHeight(foot) > 0, "the rail's foot strip has no height");
  for (let slot = 0; slot < LANE_COUNT; slot += 1) {
    const occupant = laneOccupantBand(slot);
    assert.ok(
      !bandsOverlap(foot, occupant),
      `the rail's foot strip (${foot.top}-${foot.bottom}) collides with lane ${slot} ` +
        `(${occupant.top}-${occupant.bottom})`,
    );
  }
});

// The point of the strip: an avatar at a band-edge price overhangs the rail (see
// auction_geometry.ts's rail-text section), so the crates above the strip really
// can be sat on. That costs nothing -- they are the picture. The NUMBER is the
// fact, so its ink has to be somewhere no avatar reaches.
test("railStockBaselineY: the stock number's ink sits entirely inside the foot strip", () => {
  const foot = railFootBand();
  const baseline = railStockBaselineY();
  const inkTop = baseline - RAIL_STOCK_FONT_SIZE;
  assert.ok(inkTop >= foot.top, "the stock number's ink reaches up into the last lane");
  assert.ok(baseline <= foot.bottom, "the stock number's baseline drops below the rail");
});

test("railCrateBaseY: the crate stack is seated directly on top of the number it counts", () => {
  const inkTop = railStockBaselineY() - RAIL_STOCK_FONT_SIZE;
  const gap = inkTop - railCrateBaseY();
  assert.equal(gap, RAIL_STOCK_CRATE_GAP, "the crates drifted away from their own count");
  // A gap of one crate glyph or more and the two stop reading as one statement.
  assert.ok(gap < CRATE_GLYPH_SIZE, "the count is further from its crates than a crate is tall");
});

test("railCrateY: crates stack upward from the base, one glyph apart, without gaps", () => {
  assert.equal(railCrateY(0) + CRATE_GLYPH_SIZE, railCrateBaseY());
  for (let index = 0; index + 1 < MAX_RAIL_CRATES; index += 1) {
    const rise = railCrateY(index) - railCrateY(index + 1);
    assert.equal(rise, CRATE_GLYPH_SIZE, `crates ${index} and ${index + 1} are not stacked flush`);
  }
  assert.equal(railCrateStackTop(), railCrateY(MAX_RAIL_CRATES - 1));
});

test("railCrateStackTop: even a FULL stack stays inside the rail", () => {
  assert.ok(railCrateStackTop() >= BUY_RAIL_REGION.top, "a full crate stack overflows the rail");
});

// The rotated texts used to start at a literal offset from the rail's foot. Once
// the crate stack moved under them, that literal was a collision waiting for a
// full stock: derive it from the stack's own ceiling instead.
test("railTextBaselineY: the rotated rail texts clear the top of a FULL crate stack", () => {
  assert.ok(
    railTextBaselineY() < railCrateStackTop(),
    "the rail's rotated texts print over a full crate stack",
  );
  assert.ok(railTextBaselineY() > BUY_RAIL_REGION.top, "the rail's rotated texts escape the rail");
});
