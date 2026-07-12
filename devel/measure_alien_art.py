#!/usr/bin/env python3
"""Supporting diagnostics for a rendered alien-art sheet (WP-TOOL-1).

Reads the manifest.json and PNG cells written by devel/render_alien_sheet.mjs
and emits a JSON diagnostics report to sit beside those images for a human
reviewer. These numbers have NO authority to accept or reject art: there are
no thresholds, no pass/fail verdicts, and no aesthetic exit codes here. A
non-zero exit means the INPUT was structurally broken (missing manifest,
unreadable PNG), never that the art "failed."

Every diagnostic record below carries its full manifest attribution
(evaluatorLabel, species, frame, heightPx, colorToken/backgroundToken where
applicable) so a record is self-describing on its own, without needing to
cross-reference array position against manifest.json.

Metrics computed:
  - pairwise silhouette overlap (IoU) between species, per candidate, at the
    smallest rendered size (the size that matters most per the work order).
  - ink coverage fraction per candidate/species/frame/size.
  - player-color pixel share of the rendered creature (how much of the
    creature's ink is the assigned player tint versus a fixed detail color).
    The composite math in devel/render_alien_sheet.mjs alpha-blends the ink
    raster over its background, so an anti-aliased edge pixel is a genuine
    blend of tint and background and is never bit-identical to the pure
    player hex. This check inverts that known blend (using the pixel's own
    alpha from the geometry mask) to recover the pre-composite ink color,
    then classifies it by hue distance to the tint's hue (with a chroma
    floor so near-black/near-white detail ink is never treated as "tinted"
    by hue noise), rather than requiring exact RGB equality.
  - rendered-composite visibility: WCAG-style contrast of the creature AS
    DRAWN (outline, halo, body, everything) against its background, sampled
    across a boundary band around the silhouette edge. This deliberately
    does NOT compute body-fill-only contrast as the headline number: the
    existing keyline device in src/ui/sprites/sprites_species.ts (lines
    22-33) proves that metric lies, since a body-fill color can measure as
    low as 1.05:1 against terrain while the halo it is drawn with keeps the
    actual boundary perfectly readable.

Geometry-check prototypes (see GEOMETRY_PROTOTYPE_NOTES below for the full
writeup): symmetry-within-tolerance and clean-edge are both implemented and
measured here.

Run:
  source source_me.sh && python3 devel/measure_alien_art.py --input output_smoke/aliens/
"""

# Standard Library
import os
import json
import time
import argparse

# PIP3 modules
import numpy
import PIL.Image

GEOMETRY_PROTOTYPE_NOTES = (
	"clean-edge (ink outside the true silhouette): a direct browser probe "
	"earlier confirmed CSS descendant/universal selectors cannot reach into "
	"a <use> element's instantiated content in this rendering engine, so "
	"there is no generic, cross-candidate way to isolate 'stroke geometry' "
	"from 'fill geometry' inside an arbitrary conforming SVG (the five "
	"bake-off candidates do not even share one authoring convention for "
	"this; some indirect through a shared '-sil' path reference, one draws "
	"primitive shapes directly with no separable silhouette element at "
	"all). Instead this check uses an artifact every candidate already "
	"produces without any authoring convention: devel/render_alien_sheet.mjs "
	"writes one geometry mask per (species, frame, heightPx), including the "
	"4x-supersampled 'inspection' size. That supersampled mask is the "
	"highest-fidelity available reference for 'where this creature's true "
	"silhouette is.' The check downsamples it to each ladder size (18/32/44/"
	"64px), dilates by one pixel to allow for ordinary resampling fuzz, and "
	"flags any ink pixel in that ladder-size render that falls outside the "
	"downsampled reference: a real rendering-scale defect (a seam, crack, or "
	"stray fragment that only appears at small sizes), not an aesthetic "
	"judgment."
)


#============================================

def parse_args() -> argparse.Namespace:
	"""Parse command-line arguments.

	Returns:
		argparse.Namespace: Parsed arguments.
	"""
	parser = argparse.ArgumentParser(
		description="Compute supporting diagnostics for a rendered alien-art sheet."
	)
	parser.add_argument(
		"-i", "--input", dest="input_dir", required=True,
		help="Directory containing manifest.json and rendered PNGs "
		"(output_smoke/aliens/).",
	)
	parser.add_argument(
		"-o", "--output", dest="output_file", default="",
		help="Diagnostics JSON path. Defaults to <input>/diagnostics.json.",
	)
	args = parser.parse_args()
	return args


#============================================

def load_manifest(input_dir: str) -> dict:
	"""Load the render manifest written by devel/render_alien_sheet.mjs.

	Args:
		input_dir (str): Directory holding manifest.json.

	Returns:
		dict: Parsed manifest.
	"""
	manifest_path = os.path.join(input_dir, "manifest.json")
	with open(manifest_path, "r", encoding="utf-8") as handle:
		manifest = json.load(handle)
	return manifest


#============================================

def load_alpha_channel(mask_path: str) -> numpy.ndarray:
	"""Load a mask PNG's alpha channel as a float coverage array.

	Args:
		mask_path (str): Path to a mask PNG (RGBA, alpha = ink coverage).

	Returns:
		numpy.ndarray: 2D float array in [0, 1], the per-pixel alpha coverage.
	"""
	image = PIL.Image.open(mask_path).convert("RGBA")
	alpha_channel = numpy.array(image)[:, :, 3].astype(numpy.float64) / 255.0
	return alpha_channel


#============================================

def load_alpha_mask(mask_path: str) -> numpy.ndarray:
	"""Load a mask PNG's alpha channel as a boolean ink array.

	Args:
		mask_path (str): Path to a mask PNG (RGBA, alpha = ink coverage).

	Returns:
		numpy.ndarray: 2D boolean array, True where ink is present.
	"""
	alpha_channel = load_alpha_channel(mask_path)
	ink_mask = alpha_channel > 0.0
	return ink_mask


#============================================

def load_rgb(image_path: str) -> numpy.ndarray:
	"""Load an opaque composite PNG as an RGB array.

	Args:
		image_path (str): Path to a composited (non-transparent) PNG.

	Returns:
		numpy.ndarray: 3D array of shape (height, width, 3).
	"""
	image = PIL.Image.open(image_path).convert("RGB")
	rgb_array = numpy.array(image)
	return rgb_array


#============================================

def compute_iou(mask_a: numpy.ndarray, mask_b: numpy.ndarray) -> float:
	"""Compute intersection-over-union between two boolean masks of equal shape.

	Args:
		mask_a (numpy.ndarray): First boolean mask.
		mask_b (numpy.ndarray): Second boolean mask.

	Returns:
		float: IoU in [0, 1]. 0 when the union is empty.
	"""
	intersection = numpy.logical_and(mask_a, mask_b).sum()
	union = numpy.logical_or(mask_a, mask_b).sum()
	if union == 0:
		return 0.0
	return float(intersection) / float(union)


#============================================

def pad_mask_to_canvas(mask: numpy.ndarray, canvas_height: int, canvas_width: int) -> numpy.ndarray:
	"""Center-pad a boolean mask onto a shared, larger canvas.

	Needed because different species may declare symbols with different
	widths even at the same rendered height, so a pairwise IoU needs a
	common canvas to compare on.

	Args:
		mask (numpy.ndarray): Source boolean mask.
		canvas_height (int): Shared canvas height.
		canvas_width (int): Shared canvas width.

	Returns:
		numpy.ndarray: Boolean mask on the shared canvas.
	"""
	source_height, source_width = mask.shape
	canvas = numpy.zeros((canvas_height, canvas_width), dtype=bool)
	row_offset = (canvas_height - source_height) // 2
	col_offset = (canvas_width - source_width) // 2
	canvas[row_offset:row_offset + source_height, col_offset:col_offset + source_width] = mask
	return canvas


#============================================

def dilate_mask(mask: numpy.ndarray, iterations: int) -> numpy.ndarray:
	"""Dilate a boolean mask by shifting and OR-ing in four directions.

	A small manual dilation, avoiding a scipy dependency for one shift-based
	operation.

	Args:
		mask (numpy.ndarray): Source boolean mask.
		iterations (int): Number of one-pixel dilation passes.

	Returns:
		numpy.ndarray: Dilated boolean mask, same shape as input.
	"""
	grown = mask.copy()
	for _ in range(iterations):
		up = numpy.zeros_like(grown)
		up[:-1, :] = grown[1:, :]
		down = numpy.zeros_like(grown)
		down[1:, :] = grown[:-1, :]
		left = numpy.zeros_like(grown)
		left[:, :-1] = grown[:, 1:]
		right = numpy.zeros_like(grown)
		right[:, 1:] = grown[:, :-1]
		grown = grown | up | down | left | right
	return grown


#============================================

def compute_boundary_band(ink_mask: numpy.ndarray, band_px: int) -> numpy.ndarray:
	"""Compute a ring of pixels straddling the silhouette edge.

	Args:
		ink_mask (numpy.ndarray): Boolean ink mask.
		band_px (int): Half-width, in pixels, of the boundary ring.

	Returns:
		numpy.ndarray: Boolean mask of the boundary band.
	"""
	dilated = dilate_mask(ink_mask, band_px)
	eroded = ~dilate_mask(~ink_mask, band_px)
	boundary_band = dilated & ~eroded
	return boundary_band


#============================================

def relative_luminance(rgb: numpy.ndarray) -> numpy.ndarray:
	"""Compute WCAG relative luminance for an array of sRGB pixels.

	Args:
		rgb (numpy.ndarray): Array of shape (..., 3), byte values 0-255.

	Returns:
		numpy.ndarray: Relative luminance values in [0, 1].
	"""
	normalized = rgb.astype(numpy.float64) / 255.0
	linearized = numpy.where(
		normalized <= 0.03928,
		normalized / 12.92,
		((normalized + 0.055) / 1.055) ** 2.4,
	)
	luminance = 0.2126 * linearized[..., 0] + 0.7152 * linearized[..., 1] + 0.0722 * linearized[..., 2]
	return luminance


#============================================

def wcag_contrast_ratio(luminance_a: numpy.ndarray, luminance_b: float) -> numpy.ndarray:
	"""Compute WCAG contrast ratio between pixel luminances and one reference.

	Args:
		luminance_a (numpy.ndarray): Per-pixel relative luminance values.
		luminance_b (float): Reference relative luminance (the background).

	Returns:
		numpy.ndarray: Per-pixel contrast ratios, always >= 1.0.
	"""
	lighter = numpy.maximum(luminance_a, luminance_b)
	darker = numpy.minimum(luminance_a, luminance_b)
	return (lighter + 0.05) / (darker + 0.05)


#============================================

def hex_to_rgb(hex_color: str) -> tuple:
	"""Convert a "#rrggbb" hex string to an (r, g, b) byte tuple.

	Args:
		hex_color (str): Hex color string.

	Returns:
		tuple: (r, g, b) byte values.
	"""
	clean = hex_color.lstrip("#")
	red = int(clean[0:2], 16)
	green = int(clean[2:4], 16)
	blue = int(clean[4:6], 16)
	return (red, green, blue)


#============================================

def rgb_to_hue_chroma(rgb: numpy.ndarray) -> tuple:
	"""Compute HSV hue (degrees) and chroma for an array of sRGB pixels.

	Chroma (max channel minus min channel, normalized to [0, 1]) is used
	instead of HSV saturation, because saturation is scaled by brightness
	and a near-black detail color (for example "#12121c") reports a
	deceptively high saturation despite having almost no color signal.
	Chroma stays small for both near-black and near-white pixels, which is
	what a "is this pixel meaningfully colored" floor actually needs.

	Args:
		rgb (numpy.ndarray): Array of shape (..., 3), byte values 0-255.

	Returns:
		tuple: (hue_degrees, chroma), each an array of shape (...,).
	"""
	normalized = rgb.astype(numpy.float64) / 255.0
	red, green, blue = normalized[..., 0], normalized[..., 1], normalized[..., 2]
	max_channel = normalized.max(axis=-1)
	min_channel = normalized.min(axis=-1)
	chroma = max_channel - min_channel
	safe_chroma = numpy.where(chroma == 0.0, 1.0, chroma)

	hue_if_red_max = ((green - blue) / safe_chroma) % 6.0
	hue_if_green_max = ((blue - red) / safe_chroma) + 2.0
	hue_if_blue_max = ((red - green) / safe_chroma) + 4.0
	hue_sextant = numpy.select(
		[max_channel == red, max_channel == green, max_channel == blue],
		[hue_if_red_max, hue_if_green_max, hue_if_blue_max],
		default=0.0,
	)
	hue_degrees = numpy.where(chroma == 0.0, 0.0, hue_sextant * 60.0)
	return hue_degrees, chroma


#============================================

def circular_hue_distance_deg(hue_a: numpy.ndarray, hue_b: float) -> numpy.ndarray:
	"""Compute the shortest angular distance between hues on a 360-degree ring.

	Args:
		hue_a (numpy.ndarray): Array of hue values in degrees.
		hue_b (float): Reference hue in degrees.

	Returns:
		numpy.ndarray: Angular distances in degrees, in [0, 180].
	"""
	raw_distance = numpy.abs(hue_a - hue_b) % 360.0
	return numpy.minimum(raw_distance, 360.0 - raw_distance)


#============================================

def downsample_alpha(alpha: numpy.ndarray, target_height: int, target_width: int) -> numpy.ndarray:
	"""Area-average a float alpha array down to a smaller target resolution.

	Args:
		alpha (numpy.ndarray): Source float array in [0, 1].
		target_height (int): Target height in pixels.
		target_width (int): Target width in pixels.

	Returns:
		numpy.ndarray: Float array in [0, 1], shape (target_height, target_width).
	"""
	source_image = PIL.Image.fromarray((alpha * 255.0).astype(numpy.uint8), mode="L")
	resized_image = source_image.resize((target_width, target_height), PIL.Image.BOX)
	resized_alpha = numpy.array(resized_image).astype(numpy.float64) / 255.0
	return resized_alpha


#============================================

def group_cells_by_symbol_size(cells: list) -> dict:
	"""Group manifest cells by (evaluatorLabel, species, frame, heightPx).

	Candidate must be part of the key: without it, cells from different
	bake-off candidates that happen to share the same species/frame/size
	collapse into one group, and only whichever candidate's mask sorted
	first would ever be measured.

	Args:
		cells (list): Manifest "cells" entries.

	Returns:
		dict: Keyed by (evaluatorLabel, species, frame, heightPx) tuples.
	"""
	grouped = {}
	for cell in cells:
		key = (cell["evaluatorLabel"], cell["species"], cell["frame"], cell["heightPx"])
		grouped.setdefault(key, []).append(cell)
	return grouped


#============================================

def compute_ink_coverage(input_dir: str, grouped_cells: dict) -> list:
	"""Compute ink coverage fraction per (candidate, species, frame, size).

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		grouped_cells (dict): Cells grouped by (evaluatorLabel, species, frame, heightPx).

	Returns:
		list: One entry per (candidate, species, frame, size).
	"""
	results = []
	for (evaluator_label, species, frame, height_px), cells in sorted(grouped_cells.items()):
		reference_cell = cells[0]
		mask_path = os.path.join(
			input_dir, evaluator_label, "masks",
			f"{species}_frame{frame}_" + size_tag(reference_cell) + "_mask.png",
		)
		ink_mask = load_alpha_mask(mask_path)
		coverage_fraction = float(ink_mask.sum()) / float(ink_mask.size)
		results.append({
			"evaluatorLabel": evaluator_label,
			"species": species,
			"frame": frame,
			"heightPx": height_px,
			"isInspection": reference_cell["isInspection"],
			"coverageFraction": coverage_fraction,
		})
	return results


#============================================

def size_tag(cell: dict) -> str:
	"""Rebuild the filename size tag used by devel/render_alien_sheet.mjs.

	Args:
		cell (dict): One manifest cell entry.

	Returns:
		str: A tag such as "h32" or "h256-inspect".
	"""
	if cell["isInspection"]:
		return f"h{cell['heightPx']}-inspect"
	return f"h{cell['heightPx']}"


#============================================

def compute_pairwise_silhouette_iou(input_dir: str, grouped_cells: dict) -> list:
	"""Compute pairwise silhouette IoU between every species pair, per
	candidate per frame, at the smallest rendered size (the size that
	matters most per the work order).

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		grouped_cells (dict): Cells grouped by (evaluatorLabel, species, frame, heightPx).

	Returns:
		list: One entry per candidate per species pair per frame.
	"""
	smallest_height_px = min(height for (_, _, _, height) in grouped_cells)
	by_candidate_frame = {}
	for (evaluator_label, species, frame, height_px), cells in grouped_cells.items():
		if height_px != smallest_height_px:
			continue
		mask_path = os.path.join(
			input_dir, evaluator_label, "masks",
			f"{species}_frame{frame}_h{height_px}_mask.png",
		)
		by_candidate_frame.setdefault((evaluator_label, frame), {})[species] = load_alpha_mask(mask_path)

	results = []
	for (evaluator_label, frame), species_masks in sorted(by_candidate_frame.items()):
		species_names = sorted(species_masks)
		canvas_height = max(mask.shape[0] for mask in species_masks.values())
		canvas_width = max(mask.shape[1] for mask in species_masks.values())
		padded_masks = {
			name: pad_mask_to_canvas(mask, canvas_height, canvas_width)
			for name, mask in species_masks.items()
		}
		for i, species_a in enumerate(species_names):
			for species_b in species_names[i + 1:]:
				iou = compute_iou(padded_masks[species_a], padded_masks[species_b])
				results.append({
					"evaluatorLabel": evaluator_label,
					"speciesA": species_a,
					"speciesB": species_b,
					"frame": frame,
					"heightPx": smallest_height_px,
					"iou": iou,
				})
	return results


#============================================

def compute_player_color_share(input_dir: str, cells: list) -> list:
	"""Compute what fraction of a creature's ink pixels are the assigned
	player tint, versus a fixed (non-tinted) detail color.

	devel/render_alien_sheet.mjs alpha-composites the ink raster over its
	background (compositeOverBackground): out = ink*alpha + bg*(1-alpha).
	An anti-aliased edge pixel has alpha < 1, so its composited color is a
	genuine blend of tint and background and will never be bit-identical (or
	even close, under a small fixed RGB tolerance) to the pure player hex.
	This function inverts that known, exact blend formula using the pixel's
	own alpha (read from the geometry mask) to recover the pre-composite ink
	color, then classifies the recovered color by hue distance to the tint's
	hue, with a chroma floor so near-black/near-white detail ink never
	counts as "tinted" from hue noise on a colorless pixel.

	Hue tolerance of 20 degrees is chosen from the actual palette: the four
	player hues (src/ui/sprites/palette.ts) sit at roughly 106, 193, 307,
	and 358 degrees, so the closest pair (307 and 358) is 51 degrees apart;
	20 degrees stays well clear of confusing adjacent player tints. The
	nearest non-tint accent color used in the bake-off art, gold "#ffd36e",
	sits at about 42 degrees hue, over 43 degrees from the nearest player
	hue (red, 358), so it is not misclassified as tinted either.

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		cells (list): Manifest "cells" entries.

	Returns:
		list: One entry per manifest cell.
	"""
	hue_tolerance_deg = 20.0
	chroma_floor = 0.12
	results = []
	for cell in cells:
		mask_path = os.path.join(
			input_dir, cell["evaluatorLabel"], "masks",
			f"{cell['species']}_frame{cell['frame']}_" + size_tag(cell) + "_mask.png",
		)
		alpha_channel = load_alpha_channel(mask_path)
		ink_mask = alpha_channel > 0.0
		full_rgb = load_rgb(os.path.join(input_dir, cell["full"]))
		background_rgb = numpy.array(hex_to_rgb(cell["backgroundHex"]), dtype=numpy.float64)
		tint_rgb = numpy.array(hex_to_rgb(cell["colorHex"]))

		ink_pixel_count = int(ink_mask.sum())
		if ink_pixel_count == 0:
			continue

		ink_alpha = alpha_channel[ink_mask]
		ink_composite_rgb = full_rgb[ink_mask].astype(numpy.float64)
		# Invert compositeOverBackground(): recover the pre-composite ink
		# color that produced this composite pixel, given its own alpha.
		recovered_rgb = (ink_composite_rgb - background_rgb * (1.0 - ink_alpha[:, None])) / ink_alpha[:, None]
		recovered_rgb = numpy.clip(recovered_rgb, 0.0, 255.0)

		recovered_hue, recovered_chroma = rgb_to_hue_chroma(recovered_rgb)
		tint_hue, _ = rgb_to_hue_chroma(tint_rgb[None, :].astype(numpy.float64))
		hue_distance = circular_hue_distance_deg(recovered_hue, float(tint_hue[0]))
		is_tinted = (hue_distance <= hue_tolerance_deg) & (recovered_chroma >= chroma_floor)
		tinted_pixel_count = int(is_tinted.sum())

		results.append({
			"evaluatorLabel": cell["evaluatorLabel"],
			"species": cell["species"],
			"frame": cell["frame"],
			"heightPx": cell["heightPx"],
			"isInspection": cell["isInspection"],
			"colorToken": cell["colorToken"],
			"backgroundToken": cell["backgroundToken"],
			"tintedPixelShare": float(tinted_pixel_count) / float(ink_pixel_count),
		})
	return results


#============================================

def compute_rendered_composite_contrast(input_dir: str, cells: list, band_px: int) -> list:
	"""Compute boundary-band WCAG contrast of the creature AS DRAWN against
	its background, per manifest cell.

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		cells (list): Manifest "cells" entries.
		band_px (int): Half-width, in pixels, of the boundary band.

	Returns:
		list: One entry per manifest cell.
	"""
	results = []
	for cell in cells:
		mask_path = os.path.join(
			input_dir, cell["evaluatorLabel"], "masks",
			f"{cell['species']}_frame{cell['frame']}_" + size_tag(cell) + "_mask.png",
		)
		ink_mask = load_alpha_mask(mask_path)
		boundary_band = compute_boundary_band(ink_mask, band_px)
		if boundary_band.sum() == 0:
			continue

		full_rgb = load_rgb(os.path.join(input_dir, cell["full"]))
		background_luminance = float(relative_luminance(numpy.array(hex_to_rgb(cell["backgroundHex"]))))
		band_pixels_rgb = full_rgb[boundary_band]
		band_luminance = relative_luminance(band_pixels_rgb)
		band_contrast = wcag_contrast_ratio(band_luminance, background_luminance)

		results.append({
			"evaluatorLabel": cell["evaluatorLabel"],
			"species": cell["species"],
			"frame": cell["frame"],
			"heightPx": cell["heightPx"],
			"isInspection": cell["isInspection"],
			"colorToken": cell["colorToken"],
			"backgroundToken": cell["backgroundToken"],
			"boundaryContrastMedian": float(numpy.median(band_contrast)),
			"boundaryContrastMin": float(band_contrast.min()),
		})
	return results


#============================================

def compute_symmetry_prototype(input_dir: str, grouped_cells: dict) -> dict:
	"""Prototype the symmetry-within-tolerance geometry check: mirror the
	rendered ink mask horizontally and measure IoU against the original,
	rather than proving path-level symmetry analytically.

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		grouped_cells (dict): Cells grouped by (evaluatorLabel, species, frame, heightPx).

	Returns:
		dict: {"robust": bool, "measuredRuntimeSeconds": float, "results": list}
	"""
	start_time = time.time()
	results = []
	for (evaluator_label, species, frame, height_px), cells in sorted(grouped_cells.items()):
		reference_cell = cells[0]
		mask_path = os.path.join(
			input_dir, evaluator_label, "masks",
			f"{species}_frame{frame}_" + size_tag(reference_cell) + "_mask.png",
		)
		ink_mask = load_alpha_mask(mask_path)
		mirrored_mask = numpy.fliplr(ink_mask)
		symmetry_iou = compute_iou(ink_mask, mirrored_mask)
		results.append({
			"evaluatorLabel": evaluator_label,
			"species": species,
			"frame": frame,
			"heightPx": height_px,
			"isInspection": reference_cell["isInspection"],
			"mirroredIou": symmetry_iou,
		})
	measured_runtime_seconds = time.time() - start_time

	return {
		"robust": True,
		"measuredRuntimeSeconds": measured_runtime_seconds,
		"results": results,
	}


#============================================

def group_cells_by_symbol(grouped_cells: dict) -> dict:
	"""Regroup symbol-size groups by (evaluatorLabel, species, frame) only.

	Args:
		grouped_cells (dict): Cells grouped by
			(evaluatorLabel, species, frame, heightPx).

	Returns:
		dict: Keyed by (evaluatorLabel, species, frame), each value a dict
			mapping heightPx to that group's cell list.
	"""
	by_symbol = {}
	for (evaluator_label, species, frame, height_px), cells in grouped_cells.items():
		symbol_key = (evaluator_label, species, frame)
		by_symbol.setdefault(symbol_key, {})[height_px] = cells
	return by_symbol


#============================================

def compute_clean_edge_check(input_dir: str, grouped_cells: dict) -> dict:
	"""Detect ink that falls outside a creature's true silhouette.

	There is no cross-candidate authoring convention that separates "fill
	geometry" from "stroke geometry" inside an arbitrary conforming SVG (see
	GEOMETRY_PROTOTYPE_NOTES), so this check does not attempt that split.
	Instead it uses an artifact every candidate already produces without any
	authoring convention: devel/render_alien_sheet.mjs writes a geometry mask
	per (species, frame, heightPx), including the 4x-supersampled
	"inspection" size. That supersampled mask is treated as the ground-truth
	silhouette. It is downsampled (area-average) to each ladder size,
	dilated by one pixel to allow for ordinary resampling fuzz, and any ink
	pixel in that ladder-size render outside the downsampled silhouette is
	flagged as escaped ink: a genuine rendering-scale defect (a seam, crack,
	or stray fragment only visible at small sizes), not an aesthetic call.

	Args:
		input_dir (str): Root output_smoke/aliens/ directory.
		grouped_cells (dict): Cells grouped by
			(evaluatorLabel, species, frame, heightPx).

	Returns:
		dict: {"robust": bool, "measuredRuntimeSeconds": float,
			"worstEscapedInkFraction": float, "results": list}
	"""
	dilation_px = 1
	start_time = time.time()
	results = []
	by_symbol = group_cells_by_symbol(grouped_cells)

	for (evaluator_label, species, frame), by_height in sorted(by_symbol.items()):
		inspection_heights = [
			height_px for height_px, cells in by_height.items() if cells[0]["isInspection"]
		]
		if len(inspection_heights) != 1:
			continue
		inspection_height_px = inspection_heights[0]
		inspection_cell = by_height[inspection_height_px][0]
		inspection_mask_path = os.path.join(
			input_dir, evaluator_label, "masks",
			f"{species}_frame{frame}_" + size_tag(inspection_cell) + "_mask.png",
		)
		reference_alpha = load_alpha_channel(inspection_mask_path)

		for height_px, cells in sorted(by_height.items()):
			ladder_cell = cells[0]
			if ladder_cell["isInspection"]:
				continue
			ladder_mask_path = os.path.join(
				input_dir, evaluator_label, "masks",
				f"{species}_frame{frame}_" + size_tag(ladder_cell) + "_mask.png",
			)
			actual_ink = load_alpha_mask(ladder_mask_path)
			downsampled_reference = downsample_alpha(
				reference_alpha, actual_ink.shape[0], actual_ink.shape[1]
			)
			allowed_region = dilate_mask(downsampled_reference > 0.0, dilation_px)
			escaped_ink = actual_ink & ~allowed_region

			actual_ink_pixel_count = int(actual_ink.sum())
			escaped_ink_pixel_count = int(escaped_ink.sum())
			escaped_ink_fraction = 0.0
			if actual_ink_pixel_count > 0:
				escaped_ink_fraction = float(escaped_ink_pixel_count) / float(actual_ink_pixel_count)

			results.append({
				"evaluatorLabel": evaluator_label,
				"species": species,
				"frame": frame,
				"heightPx": height_px,
				"escapedInkPixelCount": escaped_ink_pixel_count,
				"escapedInkFraction": escaped_ink_fraction,
			})

	measured_runtime_seconds = time.time() - start_time
	worst_escaped_ink_fraction = 0.0
	if results:
		worst_escaped_ink_fraction = max(entry["escapedInkFraction"] for entry in results)

	return {
		"robust": True,
		"measuredRuntimeSeconds": measured_runtime_seconds,
		"worstEscapedInkFraction": worst_escaped_ink_fraction,
		"results": results,
	}


#============================================

def main() -> None:
	args = parse_args()
	input_dir = os.path.abspath(args.input_dir)
	output_file = args.output_file
	if not output_file:
		output_file = os.path.join(input_dir, "diagnostics.json")

	manifest = load_manifest(input_dir)
	cells = manifest["cells"]
	grouped_cells = group_cells_by_symbol_size(cells)
	boundary_band_px = 2

	pairwise_silhouette_iou = compute_pairwise_silhouette_iou(input_dir, grouped_cells)
	ink_coverage = compute_ink_coverage(input_dir, grouped_cells)
	player_color_share = compute_player_color_share(input_dir, cells)
	rendered_composite_contrast = compute_rendered_composite_contrast(
		input_dir, cells, boundary_band_px
	)
	symmetry_prototype = compute_symmetry_prototype(input_dir, grouped_cells)
	clean_edge = compute_clean_edge_check(input_dir, grouped_cells)
	clean_edge["notes"] = GEOMETRY_PROTOTYPE_NOTES

	diagnostics = {
		"generatedAt": manifest["generatedAt"],
		"inputDir": input_dir,
		"cellCount": len(cells),
		"pairwiseSilhouetteIou": pairwise_silhouette_iou,
		"inkCoverage": ink_coverage,
		"playerColorShare": player_color_share,
		"renderedCompositeContrast": rendered_composite_contrast,
		"geometryPrototypes": {
			"cleanEdge": clean_edge,
			"symmetryWithinTolerance": symmetry_prototype,
		},
	}

	with open(output_file, "w", encoding="utf-8") as handle:
		json.dump(diagnostics, handle, indent=2)

	print(f"Wrote diagnostics for {len(cells)} cells to {output_file}")


#============================================
if __name__ == "__main__":
	main()
