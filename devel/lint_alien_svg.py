#!/usr/bin/env python3
"""Mechanical lint for one alien species SVG (WP-LINT-1).

Enforces only the OBJECTIVE, MECHANICAL rules stated in
docs/ALIEN_ART_CONTRACT.md: XML validity, file schema (allowed elements,
attributes, and transforms), required symbol ids, viewBox geometry, id
prefixing, palette conformance, the four-color (four-HUE) budget, the
gold-accent count, the three-layer stroke stack (colors, stroke widths,
and line caps), and the one optional per-frame under-shade (its <mask>
shape and target, its rect count, exact ink fill, opacity cap, the shade's
own mask resolving to THIS frame's shapes group, and its position after
the body pass and before the face reference). `clipPath`/`clip-path` are
rejected outright: the contract's earlier revision specified the shade as
a clipPath wrapping a <use> of the shapes group, but a <use> inside a
clipPath only contributes geometry when it references a graphics element,
not a container, so that form silently rendered no shade at all. The
contract moved the shade to <mask>, which can reference a container.

Every aesthetic or rendering-scale judgment (archetype read, silhouette
distinctness, the notch floor, the limb floor, uniform-limb-length across
a many-limbed species, and frame-2 motion distance) is left to a human
reviewer and to the raster-based checks in devel/measure_alien_art.py,
because none of those can be verified reliably from the raw XML alone: see
the NOTE ON THE GEOMETRY FLOORS comment below for the false positive that
demonstrated this on real production art.

Species name is taken from the file's own basename: art/aliens/<species>.svg
means every required id is expected to be prefixed <species>-, per the
contract's own naming convention. This makes the lint work unmodified on
any future ninth species file with no species list to keep in sync.

Run:
  source source_me.sh && python3 devel/lint_alien_svg.py -i art/aliens/humanoid.svg
"""

# Standard Library
import os
import re
import argparse
import subprocess
import xml.etree.ElementTree as ET

SVG_VIEWBOX = "0 0 200 320"
HALO_STROKE_WIDTH = "28"
INK_STROKE_WIDTH = "20"
SHADE_OPACITY_MAX = 0.16
HEAD_WINDOW_MIN_SIDE = 100
HEAD_WINDOW_MAX_SIDE = 140

# Elements allowed anywhere inside <defs>, per the contract's file schema.
ALLOWED_DEFS_ELEMENTS = {
	"defs", "g", "symbol", "use", "rect", "circle", "ellipse", "path",
	"polygon", "mask",
}

# Attributes forbidden anywhere inside <defs>, per the contract's file
# schema ("Not allowed anywhere in a creature"). clip-path is forbidden
# outright: the contract's previous revision specified the under-shade as a
# clipPath wrapping a <use> of the shapes group, but a <use> inside a
# clipPath only contributes geometry when it references a graphics element,
# not a container, so that form silently renders no shade at all. The shade
# now uses <mask>, checked separately (see check_mask_form/check_shade_form)
# because "mask" is conditionally allowed, narrowly, on the shade wrapper.
FORBIDDEN_DEFS_ATTRIBUTES = {
	"style", "filter", "fill-opacity", "stroke-opacity", "clip-path",
}

# A transform is allowed only when built entirely from translate(...) and
# rotate(...) calls; scale/skew/matrix silently change stroke width.
ALLOWED_TRANSFORM_PATTERN = re.compile(
	r"^\s*(?:(?:translate|rotate)\([^()]*\)\s*)+$"
)

PALETTE_KEY_PATTERN = re.compile(r'^\s*(\w+):\s*"(#[0-9a-fA-F]{3,8})"', re.MULTILINE)


#============================================

def parse_args() -> argparse.Namespace:
	"""Parse command-line arguments.

	Returns:
		argparse.Namespace: Parsed arguments.
	"""
	parser = argparse.ArgumentParser(
		description="Lint one alien species SVG against docs/ALIEN_ART_CONTRACT.md."
	)
	parser.add_argument(
		"-i", "--input", dest="input_file", required=True,
		help="Path to art/aliens/<species>.svg.",
	)
	args = parser.parse_args()
	return args


#============================================

def get_repo_root() -> str:
	"""Locate the repository root via git.

	Returns:
		str: Absolute path to the repository root.
	"""
	result = subprocess.run(
		["git", "rev-parse", "--show-toplevel"],
		capture_output=True, text=True, check=True,
	)
	repo_root = result.stdout.strip()
	return repo_root


#============================================

def species_from_path(svg_path: str) -> str:
	"""Derive the species name from an art/aliens/<species>.svg path.

	Args:
		svg_path (str): Path to the species SVG file.

	Returns:
		str: The species stem (filename without directory or extension).
	"""
	base_name = os.path.basename(svg_path)
	species, _ext = os.path.splitext(base_name)
	return species


#============================================

def load_palette_tokens(repo_root: str) -> dict:
	"""Read every named hex token from src/ui/sprites/palette.ts.

	Mirrors the extraction pattern used by tests/test_sprite_palette.mjs
	(PALETTE_KEY_PATTERN) so the two checkers never disagree about what a
	palette token is.

	Args:
		repo_root (str): Absolute path to the repository root.

	Returns:
		dict: Maps lowercase token name to lowercase hex value (with '#').
	"""
	palette_path = os.path.join(repo_root, "src", "ui", "sprites", "palette.ts")
	with open(palette_path, "r", encoding="ascii") as handle:
		palette_source = handle.read()
	tokens = {}
	for match in PALETTE_KEY_PATTERN.finditer(palette_source):
		token_name = match.group(1)
		hex_value = match.group(2).lower()
		tokens[token_name] = hex_value
	return tokens


#============================================

def localname(tag: str) -> str:
	"""Strip an XML namespace prefix from an ElementTree tag string.

	Args:
		tag (str): A tag string, possibly "{namespace}localname".

	Returns:
		str: The bare local tag name.
	"""
	if "}" in tag:
		return tag.split("}", 1)[1]
	return tag


#============================================

def check_ascii_content(svg_path: str) -> list:
	"""Verify the file contains ASCII bytes only.

	Args:
		svg_path (str): Path to the species SVG file.

	Returns:
		list: Violation dicts, empty when the file is pure ASCII.
	"""
	with open(svg_path, "rb") as handle:
		raw_bytes = handle.read()
	violations = []
	for line_number, line_bytes in enumerate(raw_bytes.split(b"\n"), start=1):
		non_ascii_position = None
		for byte_index, byte_value in enumerate(line_bytes):
			if byte_value > 0x7F:
				non_ascii_position = byte_index
				break
		if non_ascii_position is not None:
			violations.append({
				"rule": "ascii-only",
				"message": (
					f"non-ASCII byte at line {line_number}, column "
					f"{non_ascii_position + 1}; escape it (for example &alpha;)"
				),
			})
	return violations


#============================================

def check_xml_validity(svg_path: str) -> list:
	"""Validate the file as XML using xmllint, the contract's own authority.

	The double-hyphen-in-a-comment trap gets its own named message, because
	it broke a real bake-off file and is easy to reintroduce when prose is
	written with em dashes.

	Args:
		svg_path (str): Path to the species SVG file.

	Returns:
		list: Violation dicts, empty when the file is valid XML.
	"""
	result = subprocess.run(
		["xmllint", "--noout", svg_path], capture_output=True, text=True,
	)
	if result.returncode == 0:
		return []
	stderr_text = result.stderr.strip()
	if "Double hyphen within comment" in stderr_text:
		return [{
			"rule": "xml-comment-double-hyphen",
			"message": (
				"an XML comment contains an illegal '--' sequence; use '=' "
				f"runs or single hyphens in prose instead. xmllint said: {stderr_text}"
			),
		}]
	return [{
		"rule": "xml-parse-error",
		"message": f"file is not valid XML. xmllint said: {stderr_text}",
	}]


#============================================

def find_defs(root: ET.Element) -> ET.Element:
	"""Find the single <defs> element under the SVG root.

	Args:
		root (ET.Element): The parsed <svg> root element.

	Returns:
		ET.Element: The <defs> element, or None if absent.
	"""
	for child in root:
		if localname(child.tag) == "defs":
			return child
	return None


#============================================

def check_root_viewbox(root: ET.Element) -> list:
	"""Verify the root <svg> declares the contract's canvas.

	Args:
		root (ET.Element): The parsed <svg> root element.

	Returns:
		list: Violation dicts, empty when the canvas is correct.
	"""
	view_box = root.get("viewBox")
	if view_box != SVG_VIEWBOX:
		return [{
			"rule": "root-viewbox",
			"message": (
				f'root <svg> viewBox must be "{SVG_VIEWBOX}", found {view_box!r}'
			),
		}]
	return []


#============================================

def check_defs_element_whitelist(defs: ET.Element) -> list:
	"""Verify every element inside <defs> is an allowed element type.

	Args:
		defs (ET.Element): The <defs> element.

	Returns:
		list: Violation dicts, one per disallowed element found.
	"""
	violations = []
	for element in defs.iter():
		tag = localname(element.tag)
		if tag not in ALLOWED_DEFS_ELEMENTS:
			element_id = element.get("id", "(no id)")
			violations.append({
				"rule": "defs-disallowed-element",
				"message": (
					f"<{tag}> is not allowed inside <defs> (id={element_id}); "
					"the contract's schema allows only "
					f"{sorted(ALLOWED_DEFS_ELEMENTS)}"
				),
			})
	return violations


#============================================

def check_no_clip_path_shade(defs: ET.Element) -> list:
	"""Verify the file never uses clipPath for the under-shade.

	This is the exact defect a real generated species file shipped with: a
	`<clipPath>` wrapping a `<use>` of the shapes group looks correct and
	previews fine in a browser, but per SVG a `<use>` inside a `<clipPath>`
	only contributes clip geometry when it references a GRAPHICS element,
	not a CONTAINER. The shapes group is a `<g>` container, so Chromium
	resolves the clip to EMPTY and the shade rect paints nothing, silently,
	in both the artist's preview and the game. A pixel probe on a generated
	shaded frame confirmed this: the torso above the shade and the leg
	inside the shade rect read the identical player-tint hex.

	check_defs_element_whitelist and check_defs_attribute_whitelist already
	reject `<clipPath>` and `clip-path` as generically disallowed, but this
	check exists so the exact failure mode gets its own plain-language
	message rather than a generic "not allowed" message, since this is the
	one mistake the contract most wants to make impossible to reintroduce.

	Args:
		defs (ET.Element): The <defs> element.

	Returns:
		list: Violation dicts, one per clipPath element or clip-path
			attribute found.
	"""
	violations = []
	for element in defs.iter():
		tag = localname(element.tag)
		element_id = element.get("id", "(no id)")
		if tag == "clipPath":
			violations.append({
				"rule": "shade-clip-path-does-not-render",
				"message": (
					f'<clipPath id="{element_id}"> does not render the shade it '
					"looks like it draws: a <use> inside a clipPath only "
					"contributes geometry when it references a GRAPHICS element, "
					"not the shapes group's <g> CONTAINER, so the clip resolves "
					"empty and the shade rect paints nothing. Use <mask> instead "
					'(see check_mask_form): <mask id="<species>-fN-mask"><use '
					'href="#<species>-fN-shapes" fill="#ffffff"/></mask>.'
				),
			})
		if element.get("clip-path") is not None:
			violations.append({
				"rule": "shade-clip-path-does-not-render",
				"message": (
					f'<{tag} id={element_id}> clip-path="{element.get("clip-path")}" '
					"does not render the shade it looks like it draws: a <use> "
					"inside a clipPath only contributes geometry when it "
					"references a GRAPHICS element, not the shapes group's <g> "
					"CONTAINER, so the clip resolves empty and the shade rect "
					'paints nothing. Use <g mask="url(#<species>-fN-mask)"> instead.'
				),
			})
	return violations


#============================================

def check_defs_attribute_whitelist(defs: ET.Element) -> list:
	"""Verify no element inside <defs> carries a forbidden attribute.

	Also enforces the opacity and mask placement rules: opacity may appear
	only on the shade <rect> at 0.16 or less, and the mask attribute may
	appear only on the <g> wrapping that shade rect.

	Args:
		defs (ET.Element): The <defs> element.

	Returns:
		list: Violation dicts, one per offending attribute.
	"""
	violations = []
	for element in defs.iter():
		tag = localname(element.tag)
		element_id = element.get("id", "(no id)")
		for attribute_name in element.attrib:
			if attribute_name in FORBIDDEN_DEFS_ATTRIBUTES:
				violations.append({
					"rule": "defs-forbidden-attribute",
					"message": (
						f'<{tag} id={element_id}> carries forbidden attribute '
						f'"{attribute_name}"'
					),
				})
		transform_value = element.get("transform")
		if transform_value is not None and not ALLOWED_TRANSFORM_PATTERN.match(transform_value):
			violations.append({
				"rule": "defs-forbidden-transform",
				"message": (
					f'<{tag} id={element_id}> transform="{transform_value}" is not '
					"limited to translate(...)/rotate(...); scale/skew/matrix "
					"silently change stroke width"
				),
			})
		opacity_value = element.get("opacity")
		if opacity_value is not None:
			if tag != "rect":
				violations.append({
					"rule": "defs-forbidden-opacity",
					"message": (
						f"opacity is set on a <{tag} id={element_id}>; the contract "
						"allows opacity only on the one permitted under-shade <rect>"
					),
				})
			elif float(opacity_value) > SHADE_OPACITY_MAX:
				violations.append({
					"rule": "defs-shade-opacity-too-high",
					"message": (
						f"shade <rect id={element_id}> opacity={opacity_value} exceeds "
						f"the {SHADE_OPACITY_MAX} cap"
					),
				})
		mask_value = element.get("mask")
		if mask_value is not None and tag != "g":
			violations.append({
				"rule": "defs-forbidden-mask-attribute",
				"message": (
					f'mask is set on a <{tag} id={element_id}>; the contract allows '
					"the mask attribute only on the <g> wrapping the under-shade rect"
				),
			})
	return violations


#============================================

def check_id_prefix(defs: ET.Element, species: str) -> list:
	"""Verify every id inside <defs> is prefixed with the species name.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.

	Returns:
		list: Violation dicts, one per unprefixed id.
	"""
	expected_prefix = f"{species}-"
	violations = []
	for element in defs.iter():
		element_id = element.get("id")
		if element_id is not None and not element_id.startswith(expected_prefix):
			violations.append({
				"rule": "id-missing-species-prefix",
				"message": (
					f'id="{element_id}" does not start with "{expected_prefix}"; '
					"every id in the file collides across species once inlined "
					"into one shared <defs>"
				),
			})
	return violations


#============================================

def check_required_symbols(defs: ET.Element, species: str) -> list:
	"""Verify the five required symbol ids exist as <symbol> elements.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.

	Returns:
		list: Violation dicts, one per missing required symbol.
	"""
	required_suffixes = ["frame1", "frame2", "head", "silhouette1", "silhouette2"]
	symbol_ids = {
		element.get("id") for element in defs.iter()
		if localname(element.tag) == "symbol"
	}
	violations = []
	for suffix in required_suffixes:
		expected_id = f"{species}-{suffix}"
		if expected_id not in symbol_ids:
			violations.append({
				"rule": "missing-required-symbol",
				"message": f'missing required <symbol id="{expected_id}">',
			})
	return violations


#============================================

def find_symbol(defs: ET.Element, symbol_id: str) -> ET.Element:
	"""Find a <symbol> element by id.

	Args:
		defs (ET.Element): The <defs> element.
		symbol_id (str): The id to look up.

	Returns:
		ET.Element: The matching <symbol>, or None if absent.
	"""
	for element in defs.iter():
		if localname(element.tag) == "symbol" and element.get("id") == symbol_id:
			return element
	return None


#============================================

def find_by_id(defs: ET.Element, target_id: str) -> ET.Element:
	"""Find any element inside <defs> by its id attribute.

	Args:
		defs (ET.Element): The <defs> element.
		target_id (str): The id to look up.

	Returns:
		ET.Element: The matching element, or None if absent.
	"""
	for element in defs.iter():
		if element.get("id") == target_id:
			return element
	return None


#============================================

def use_href(use_element: ET.Element) -> str:
	"""Read a <use> element's href target, stripping the leading '#'.

	Handles both the bare "href" attribute and the legacy "xlink:href" form.

	Args:
		use_element (ET.Element): A <use> element.

	Returns:
		str: The referenced id, or None if the element has no href.
	"""
	href_value = use_element.get("href")
	if href_value is None:
		for attribute_name, attribute_value in use_element.attrib.items():
			if localname(attribute_name) == "href":
				href_value = attribute_value
				break
	if href_value is None:
		return None
	return href_value.lstrip("#")


#============================================

def parse_url_reference(attribute_value: str) -> str:
	"""Extract the id from a `url(#id)` attribute value (mask, and formerly clip-path).

	Args:
		attribute_value (str): An attribute value, expected to look like
			"url(#some-id)".

	Returns:
		str: The referenced id, or None if the value is not a url(#...) form.
	"""
	if attribute_value is None:
		return None
	match = re.match(r"^url\(#([^)]+)\)$", attribute_value.strip())
	if match is None:
		return None
	return match.group(1)


#============================================

def check_symbol_viewboxes(defs: ET.Element, species: str) -> list:
	"""Verify each required symbol's viewBox matches its contract shape.

	frame1, frame2, silhouette1, and silhouette2 must reuse the full canvas.
	head is a square window between 100 and 140 units on a side that lies
	entirely inside the canvas.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.

	Returns:
		list: Violation dicts, empty when every present symbol's viewBox conforms.
	"""
	violations = []
	full_canvas_suffixes = ["frame1", "frame2", "silhouette1", "silhouette2"]
	for suffix in full_canvas_suffixes:
		symbol = find_symbol(defs, f"{species}-{suffix}")
		if symbol is None:
			continue
		view_box = symbol.get("viewBox")
		if view_box != SVG_VIEWBOX:
			violations.append({
				"rule": "symbol-viewbox",
				"message": (
					f'<symbol id="{species}-{suffix}"> viewBox must be '
					f'"{SVG_VIEWBOX}", found {view_box!r}'
				),
			})

	head_symbol = find_symbol(defs, f"{species}-head")
	if head_symbol is not None:
		violations.extend(check_head_window(head_symbol, species))
	return violations


#============================================

def check_head_window(head_symbol: ET.Element, species: str) -> list:
	"""Verify the head symbol's viewBox is a valid square crop window.

	Args:
		head_symbol (ET.Element): The <symbol id="<species>-head"> element.
		species (str): The species name derived from the file path.

	Returns:
		list: Violation dicts, empty when the window conforms.
	"""
	view_box = head_symbol.get("viewBox")
	if view_box is None:
		return [{
			"rule": "head-window-missing-viewbox",
			"message": f'<symbol id="{species}-head"> has no viewBox',
		}]
	parts = view_box.split()
	if len(parts) != 4:
		return [{
			"rule": "head-window-malformed-viewbox",
			"message": f'<symbol id="{species}-head"> viewBox="{view_box}" is malformed',
		}]
	min_x, min_y, width, height = (float(part) for part in parts)
	violations = []
	if width != height:
		violations.append({
			"rule": "head-window-not-square",
			"message": (
				f'<symbol id="{species}-head"> window is {width}x{height}, '
				"but the head crop must be square"
			),
		})
	if not (HEAD_WINDOW_MIN_SIDE <= width <= HEAD_WINDOW_MAX_SIDE):
		violations.append({
			"rule": "head-window-side-out-of-range",
			"message": (
				f'<symbol id="{species}-head"> side is {width} units, outside the '
				f"required {HEAD_WINDOW_MIN_SIDE} to {HEAD_WINDOW_MAX_SIDE} band"
			),
		})
	canvas_width, canvas_height = (float(part) for part in SVG_VIEWBOX.split()[2:4])
	if min_x < 0 or min_y < 0 or (min_x + width) > canvas_width or (min_y + height) > canvas_height:
		violations.append({
			"rule": "head-window-outside-canvas",
			"message": (
				f'<symbol id="{species}-head"> viewBox="{view_box}" extends outside '
				f'the 0 0 {canvas_width:g} {canvas_height:g} canvas'
			),
		})
	return violations


#============================================

def resolve_shapes_id(defs: ET.Element, species: str, frame_number: int) -> str:
	"""Resolve a frame's shapes-group id via its silhouette symbol.

	The silhouette symbol's own contract shape is `<use
	href="#<species>-fN-shapes" fill="#141422"/>`, so following it is a
	naming-convention-free way to find the shapes group that backs a frame.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		frame_number (int): 1 or 2.

	Returns:
		str: The resolved shapes-group id, or None if unresolvable.
	"""
	silhouette_symbol = find_symbol(defs, f"{species}-silhouette{frame_number}")
	if silhouette_symbol is None:
		return None
	use_elements = [
		child for child in silhouette_symbol.iter() if localname(child.tag) == "use"
	]
	if len(use_elements) != 1:
		return None
	return use_href(use_elements[0])


#============================================

def resolve_draw_group(defs: ET.Element, species: str, frame_number: int) -> ET.Element:
	"""Resolve a frame's draw group via its frame symbol's single <use>.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		frame_number (int): 1 or 2.

	Returns:
		ET.Element: The draw group element, or None if unresolvable.
	"""
	frame_symbol = find_symbol(defs, f"{species}-frame{frame_number}")
	if frame_symbol is None:
		return None
	frame_use_elements = [
		child for child in frame_symbol.iter() if localname(child.tag) == "use"
	]
	if len(frame_use_elements) != 1:
		return None
	return find_by_id(defs, use_href(frame_use_elements[0]))


#============================================

def check_three_layer_stack(defs: ET.Element, species: str, palette: dict) -> list:
	"""Verify the halo/ink/body three-layer stack for each present frame.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		palette (dict): Token name to hex value, from load_palette_tokens.

	Returns:
		list: Violation dicts, empty when both frames conform.
	"""
	halo_hex = palette["keylineLight"]
	ink_hex = palette["inkKeyline"]
	violations = []
	for frame_number in (1, 2):
		violations.extend(
			check_three_layer_stack_for_frame(defs, species, frame_number, halo_hex, ink_hex)
		)
	return violations


#============================================

def check_three_layer_stack_for_frame(
	defs: ET.Element, species: str, frame_number: int, halo_hex: str, ink_hex: str,
) -> list:
	"""Verify one frame's three-layer stack.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		frame_number (int): 1 or 2.
		halo_hex (str): The keylineLight token's hex value.
		ink_hex (str): The inkKeyline token's hex value.

	Returns:
		list: Violation dicts, empty when the frame's stack conforms.
	"""
	frame_symbol = find_symbol(defs, f"{species}-frame{frame_number}")
	if frame_symbol is None:
		return []
	frame_use_elements = [
		child for child in frame_symbol.iter() if localname(child.tag) == "use"
	]
	if len(frame_use_elements) != 1:
		return [{
			"rule": "frame-symbol-not-single-use",
			"message": (
				f'<symbol id="{species}-frame{frame_number}"> must contain exactly '
				f"one <use>, found {len(frame_use_elements)}"
			),
		}]
	draw_group = resolve_draw_group(defs, species, frame_number)
	if draw_group is None:
		return [{
			"rule": "frame-draw-group-missing",
			"message": (
				f'<symbol id="{species}-frame{frame_number}"> references a missing '
				"draw group"
			),
		}]

	shapes_id = resolve_shapes_id(defs, species, frame_number)
	if shapes_id is None:
		return [{
			"rule": "frame-shapes-group-unresolved",
			"message": (
				f"could not resolve the shapes-group id for frame {frame_number} "
				f'via <symbol id="{species}-silhouette{frame_number}">'
			),
		}]

	layer_use_elements = [
		child for child in draw_group
		if localname(child.tag) == "use" and use_href(child) == shapes_id
	]
	if len(layer_use_elements) != 3:
		return [{
			"rule": "three-layer-stack-wrong-count",
			"message": (
				f"frame {frame_number}'s draw group must contain exactly 3 <use> "
				f'elements referencing "#{shapes_id}" (halo, ink, body); found '
				f"{len(layer_use_elements)}"
			),
		}]

	violations = []
	violations.extend(
		check_stroked_layer(layer_use_elements[0], frame_number, "halo", halo_hex)
	)
	violations.extend(
		check_stroked_layer(layer_use_elements[1], frame_number, "ink", ink_hex)
	)
	violations.extend(check_body_layer(layer_use_elements[2], frame_number))
	return violations


#============================================

def check_stroked_layer(use_element: ET.Element, frame_number: int, layer_name: str, expected_hex: str) -> list:
	"""Verify one stroked pass (halo or ink) of the three-layer stack.

	Args:
		use_element (ET.Element): The layer's <use> element.
		frame_number (int): 1 or 2.
		layer_name (str): "halo" or "ink", for the error message.
		expected_hex (str): The layer's required fill/stroke color.

	Returns:
		list: Violation dicts, empty when the layer conforms.
	"""
	expected_width = HALO_STROKE_WIDTH if layer_name == "halo" else INK_STROKE_WIDTH
	violations = []
	fill_value = (use_element.get("fill") or "").lower()
	stroke_value = (use_element.get("stroke") or "").lower()
	if fill_value != expected_hex or stroke_value != expected_hex:
		violations.append({
			"rule": f"three-layer-{layer_name}-color",
			"message": (
				f'frame {frame_number} {layer_name} pass must have fill="{expected_hex}" '
				f'stroke="{expected_hex}", found fill="{fill_value}" stroke="{stroke_value}"'
			),
		})
	if use_element.get("stroke-width") != expected_width:
		violations.append({
			"rule": f"three-layer-{layer_name}-stroke-width",
			"message": (
				f'frame {frame_number} {layer_name} pass must have '
				f'stroke-width="{expected_width}", found '
				f'stroke-width="{use_element.get("stroke-width")}"'
			),
		})
	if use_element.get("stroke-linejoin") != "round" or use_element.get("stroke-linecap") != "round":
		violations.append({
			"rule": f"three-layer-{layer_name}-line-caps",
			"message": (
				f'frame {frame_number} {layer_name} pass must have '
				'stroke-linejoin="round" stroke-linecap="round" so the rim does '
				"not spike at corners"
			),
		})
	return violations


#============================================

def check_body_layer(use_element: ET.Element, frame_number: int) -> list:
	"""Verify the flat body pass of the three-layer stack.

	Args:
		use_element (ET.Element): The layer's <use> element.
		frame_number (int): 1 or 2.

	Returns:
		list: Violation dicts, empty when the layer conforms.
	"""
	violations = []
	if use_element.get("fill") != "currentColor":
		violations.append({
			"rule": "three-layer-body-fill",
			"message": (
				f'frame {frame_number} body pass must have fill="currentColor", '
				f'found fill="{use_element.get("fill")}"'
			),
		})
	stroke_value = use_element.get("stroke")
	if stroke_value is not None and stroke_value != "none":
		violations.append({
			"rule": "three-layer-body-has-stroke",
			"message": (
				f'frame {frame_number} body pass must carry no stroke, found '
				f'stroke="{stroke_value}"'
			),
		})
	return violations


#============================================

def collect_defs_fill_stroke_values(defs: ET.Element) -> list:
	"""Collect every fill/stroke attribute value used inside <defs>.

	Args:
		defs (ET.Element): The <defs> element.

	Returns:
		list: (element, attribute_name, value) tuples for every fill/stroke.
	"""
	entries = []
	for element in defs.iter():
		for attribute_name in ("fill", "stroke"):
			value = element.get(attribute_name)
			if value is not None:
				entries.append((element, attribute_name, value))
	return entries


#============================================

def check_palette_conformance(defs: ET.Element, palette: dict, species: str) -> list:
	"""Verify every fill/stroke value inside <defs> is currentColor, none, or
	a real palette token's hex value.

	Args:
		defs (ET.Element): The <defs> element.
		palette (dict): Token name to hex value, from load_palette_tokens.
		species (str): The species name, for error messages.

	Returns:
		list: Violation dicts, one per non-palette color literal.
	"""
	allowed_keywords = {"currentcolor", "none"}
	palette_hex_values = set(palette.values())
	violations = []
	for element, attribute_name, value in collect_defs_fill_stroke_values(defs):
		lowered_value = value.lower()
		if lowered_value in allowed_keywords:
			continue
		if lowered_value in palette_hex_values:
			continue
		tag = localname(element.tag)
		element_id = element.get("id", "(no id)")
		violations.append({
			"rule": "non-palette-color",
			"message": (
				f'species "{species}": <{tag} id={element_id}> {attribute_name}="{value}" '
				"is not currentColor, none, or a hex value listed in "
				"src/ui/sprites/palette.ts"
			),
		})
	return violations


#============================================

def check_color_budget(defs: ET.Element, palette: dict, species: str) -> list:
	"""Verify the four-color budget: body (currentColor) plus at most the
	halo, keyline, and gold accent hex values.

	The budget is four HUES, not four rendered values. The optional
	under-shade (check_shade_form) reuses the keyline ink hex at low
	opacity rather than inventing a fifth color, so it never appears here
	as a distinct fill/stroke value and this check needs no separate
	exemption for it.

	Args:
		defs (ET.Element): The <defs> element.
		palette (dict): Token name to hex value, from load_palette_tokens.
		species (str): The species name, for error messages.

	Returns:
		list: Violation dicts, one per color outside the four-color budget.
	"""
	allowed_hex_values = {
		palette["keylineLight"], palette["inkKeyline"], palette["gold"],
	}
	seen_offenders = set()
	violations = []
	for element, attribute_name, value in collect_defs_fill_stroke_values(defs):
		lowered_value = value.lower()
		if lowered_value in ("currentcolor", "none"):
			continue
		if lowered_value in allowed_hex_values:
			continue
		if lowered_value in seen_offenders:
			continue
		seen_offenders.add(lowered_value)
		tag = localname(element.tag)
		element_id = element.get("id", "(no id)")
		violations.append({
			"rule": "color-budget-exceeded",
			"message": (
				f'species "{species}": color "{value}" on <{tag} id={element_id}> is '
				"outside the four-color budget (body currentColor, halo "
				"keylineLight, keyline inkKeyline, one gold accent)"
			),
		})
	return violations


#============================================

def check_gold_accent_count(defs: ET.Element, species: str, palette: dict) -> list:
	"""Verify each present face group carries at most one gold accent shape.

	Contract v2 makes the gold accent OPTIONAL (zero is fine); only the
	cap of one per frame is mechanical law. The v1 exactly-one mandate was
	spec drift and was removed.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		palette (dict): Token name to hex value, from load_palette_tokens.

	Returns:
		list: Violation dicts, one per frame whose face group carries more
			than one gold accent.
	"""
	gold_hex = palette["gold"]
	violations = []
	for frame_number in (1, 2):
		face_group = resolve_face_group(defs, species, frame_number)
		if face_group is None:
			continue
		gold_elements = [
			element for element in face_group.iter()
			if (element.get("fill") or "").lower() == gold_hex
		]
		if len(gold_elements) > 1:
			violations.append({
				"rule": "gold-accent-count",
				"message": (
					f"frame {frame_number}'s face group may carry at most one "
					f'gold ("{gold_hex}") accent shape, found {len(gold_elements)}'
				),
			})
	return violations


#============================================

def resolve_face_group(defs: ET.Element, species: str, frame_number: int) -> ET.Element:
	"""Resolve a frame's face group by elimination inside its draw group.

	The draw group's <use> children are: 3 layer passes referencing the
	shapes group, and one more referencing the face group. Whichever <use>
	does not reference the shapes id is the face reference.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		frame_number (int): 1 or 2.

	Returns:
		ET.Element: The face group element, or None if unresolvable.
	"""
	draw_group = resolve_draw_group(defs, species, frame_number)
	if draw_group is None:
		return None
	shapes_id = resolve_shapes_id(defs, species, frame_number)
	for child in draw_group:
		if localname(child.tag) != "use":
			continue
		target_id = use_href(child)
		if target_id is not None and target_id != shapes_id:
			return find_by_id(defs, target_id)
	return None


#============================================

def check_shade_form(defs: ET.Element, species: str, palette: dict) -> list:
	"""Verify the optional per-frame under-shade, if present, matches the
	contract's one allowed form exactly.

	The shade is OPTIONAL: a frame with no `<g mask=...>` wrapper is complete
	and conforms. When one is present, this checks the parts a static reader
	can see: exactly one shade rect, its fill pinned to inkKeyline (never
	gold, never a near-miss grey), its opacity within the 0.16 cap (checked
	by check_defs_attribute_whitelist), its mask resolving to THIS frame's
	own shapes group (not the other frame's, and not some unrelated mask),
	and its position in the draw group after the body pass and before the
	face reference. It cannot check that the shade's top edge sits below the
	mouth, since that needs real path/shape coordinates compared against the
	face group's geometry; that stays a human-reviewed rule.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		palette (dict): Token name to hex value, from load_palette_tokens.

	Returns:
		list: Violation dicts, empty when every present shade conforms.
	"""
	ink_hex = palette["inkKeyline"]
	violations = []
	for frame_number in (1, 2):
		draw_group = resolve_draw_group(defs, species, frame_number)
		if draw_group is None:
			continue
		expected_shapes_id = resolve_shapes_id(defs, species, frame_number)
		draw_children = list(draw_group)
		shade_wrapper_indexes = [
			index for index, child in enumerate(draw_children)
			if localname(child.tag) == "g" and child.get("mask") is not None
		]
		if not shade_wrapper_indexes:
			continue
		if len(shade_wrapper_indexes) > 1:
			violations.append({
				"rule": "shade-more-than-one",
				"message": (
					f"frame {frame_number} carries {len(shade_wrapper_indexes)} shade "
					'wrappers (<g mask=...>); the contract allows at most one'
				),
			})
		for wrapper_index in shade_wrapper_indexes:
			violations.extend(
				check_shade_wrapper(
					defs, draw_children[wrapper_index], wrapper_index, draw_children,
					frame_number, ink_hex, expected_shapes_id,
				)
			)
	return violations


#============================================

def check_shade_wrapper(
	defs: ET.Element, shade_wrapper: ET.Element, wrapper_index: int,
	draw_children: list, frame_number: int, ink_hex: str, expected_shapes_id: str,
) -> list:
	"""Verify one shade wrapper's rect count, fill, mask target, and position.

	Args:
		defs (ET.Element): The <defs> element.
		shade_wrapper (ET.Element): The `<g mask=...>` wrapper.
		wrapper_index (int): The wrapper's position among the draw group's
			direct children.
		draw_children (list): All direct children of the draw group, in order.
		frame_number (int): 1 or 2.
		ink_hex (str): The inkKeyline token's hex value.
		expected_shapes_id (str): This frame's own shapes-group id.

	Returns:
		list: Violation dicts, empty when this one shade conforms.
	"""
	violations = []
	mask_ref = parse_url_reference(shade_wrapper.get("mask"))
	mask_element = find_by_id(defs, mask_ref) if mask_ref is not None else None
	if mask_element is not None:
		mask_use_children = [
			child for child in mask_element if localname(child.tag) == "use"
		]
		mask_target_id = use_href(mask_use_children[0]) if len(mask_use_children) == 1 else None
		if expected_shapes_id is not None and mask_target_id != expected_shapes_id:
			violations.append({
				"rule": "shade-wrong-mask-target",
				"message": (
					f'frame {frame_number} shade wrapper\'s mask="url(#{mask_ref})" '
					f'resolves to href="#{mask_target_id}", not this frame\'s own '
					f'shapes group "#{expected_shapes_id}"'
				),
			})
	rect_children = [child for child in shade_wrapper if localname(child.tag) == "rect"]
	other_children = [child for child in shade_wrapper if localname(child.tag) != "rect"]
	if len(rect_children) != 1 or other_children:
		violations.append({
			"rule": "shade-wrong-shape",
			"message": (
				f"frame {frame_number} shade wrapper must contain exactly one "
				f"<rect> and nothing else, found {len(rect_children)} rect(s) and "
				f"{len(other_children)} other element(s)"
			),
		})
	for rect in rect_children:
		fill_value = (rect.get("fill") or "").lower()
		if fill_value != ink_hex:
			violations.append({
				"rule": "shade-wrong-fill",
				"message": (
					f'frame {frame_number} shade rect must have fill="{ink_hex}" '
					f'(inkKeyline), found fill="{rect.get("fill")}"'
				),
			})
		if rect.get("opacity") is None:
			violations.append({
				"rule": "shade-missing-opacity",
				"message": f"frame {frame_number} shade rect has no opacity attribute",
			})

	# The three layer <use> elements (halo, ink, body) are always the draw
	# group's first three children per check_three_layer_stack_for_frame, so
	# the shade must sit at index 3 or later, and strictly before the face
	# reference (the draw group's last child).
	if wrapper_index < 3 or wrapper_index != len(draw_children) - 2:
		violations.append({
			"rule": "shade-wrong-position",
			"message": (
				f"frame {frame_number} shade wrapper must be painted after the "
				"body pass and immediately before the face reference"
			),
		})
	return violations


#============================================

# NOTE ON THE GEOMETRY FLOORS (notch, limb) AND UNIFORM LIMB LENGTH: an
# earlier version of this lint tried a bounding-box heuristic over <rect>/
# <circle>/<ellipse> primitives in a frame's shapes group. It immediately
# false-positived on production-quality art/aliens/humanoid.svg: the 28x18
# neck rect that welds the head to the torso measured under the 26-unit
# limb floor, even though it is fully covered by the head and torso union
# and never renders as a visible narrow limb. A primitive's raw declared
# size cannot distinguish "a hidden connector" from "a visible thin limb"
# without actually rendering the union, which is exactly why
# devel/measure_alien_art.py's own clean-edge check needed a rasterized
# silhouette mask instead of parsing path data. Approximating that check
# here would fail clean, contract-conforming art, so the notch floor, the
# limb floor, and the uniform-limb-length rule (rule 7) are intentionally
# NOT implemented in this lint. They stay authoring instructions in
# docs/ALIEN_ART_CONTRACT.md, verified by a human reviewer at 18px/32px per
# the contract's "Done when" checklist, and are a natural extension of
# devel/measure_alien_art.py's rasterized diagnostics if that ever grows a
# pass/fail gate.

#============================================

def check_mask_form(defs: ET.Element, species: str, palette: dict) -> list:
	"""Verify every <mask>, if present, has the one allowed form: a single
	white <use> of a frame's own shapes group.

	The contract's previous revision specified this as a clipPath wrapping a
	bare <use> of the shapes group. That form does not render: per SVG, a
	<use> inside a clipPath contributes clip geometry only when it
	references a GRAPHICS element, and the shapes group is a CONTAINER
	(<g>), so the clip resolves to empty and the shade paints nothing,
	silently, in both the artist's preview and the game. A <mask> CAN
	reference a container, so the shade now uses <mask> instead.

	Args:
		defs (ET.Element): The <defs> element.
		species (str): The species name derived from the file path.
		palette (dict): Token name to hex value, from load_palette_tokens.

	Returns:
		list: Violation dicts, empty when every present <mask> conforms.
	"""
	valid_shapes_ids = {
		resolve_shapes_id(defs, species, 1),
		resolve_shapes_id(defs, species, 2),
	}
	valid_shapes_ids.discard(None)
	halo_hex = palette["keylineLight"]

	violations = []
	for element in defs.iter():
		if localname(element.tag) != "mask":
			continue
		mask_id = element.get("id", "(no id)")
		child_elements = list(element)
		use_children = [child for child in child_elements if localname(child.tag) == "use"]
		if len(use_children) != 1 or len(child_elements) != 1:
			violations.append({
				"rule": "mask-wrong-shape",
				"message": (
					f'<mask id="{mask_id}"> must contain exactly one <use> and '
					"nothing else (a white use of the frame's own shapes group)"
				),
			})
			continue
		fill_value = (use_children[0].get("fill") or "").lower()
		if fill_value != halo_hex:
			violations.append({
				"rule": "mask-wrong-fill",
				"message": (
					f'<mask id="{mask_id}"> use must be painted fill="{halo_hex}" '
					f'(white), found fill="{use_children[0].get("fill")}"'
				),
			})
		target_id = use_href(use_children[0])
		if target_id not in valid_shapes_ids:
			violations.append({
				"rule": "mask-wrong-target",
				"message": (
					f'<mask id="{mask_id}"> must <use> a frame\'s own shapes group, '
					f'found href="#{target_id}"'
				),
			})
	return violations


#============================================

def run_all_checks(svg_path: str, repo_root: str) -> list:
	"""Run every lint check against one species SVG file.

	Args:
		svg_path (str): Path to the species SVG file.
		repo_root (str): Absolute path to the repository root.

	Returns:
		list: All violation dicts found, empty when the file is clean.
	"""
	species = species_from_path(svg_path)
	violations = []
	violations.extend(check_ascii_content(svg_path))
	violations.extend(check_xml_validity(svg_path))
	if violations:
		# A file that is not valid XML or not ASCII cannot be parsed further.
		return violations

	tree = ET.parse(svg_path)
	root = tree.getroot()
	violations.extend(check_root_viewbox(root))

	defs = find_defs(root)
	if defs is None:
		violations.append({
			"rule": "missing-defs",
			"message": "file has no top-level <defs> element",
		})
		return violations

	violations.extend(check_defs_element_whitelist(defs))
	violations.extend(check_no_clip_path_shade(defs))
	violations.extend(check_defs_attribute_whitelist(defs))
	violations.extend(check_id_prefix(defs, species))
	violations.extend(check_required_symbols(defs, species))
	violations.extend(check_symbol_viewboxes(defs, species))

	palette = load_palette_tokens(repo_root)
	violations.extend(check_mask_form(defs, species, palette))
	violations.extend(check_palette_conformance(defs, palette, species))
	violations.extend(check_color_budget(defs, palette, species))
	violations.extend(check_gold_accent_count(defs, species, palette))
	violations.extend(check_three_layer_stack(defs, species, palette))
	violations.extend(check_shade_form(defs, species, palette))

	return violations


#============================================

def main() -> None:
	args = parse_args()
	repo_root = get_repo_root()
	violations = run_all_checks(args.input_file, repo_root)

	if not violations:
		print(f"OK: {args.input_file} conforms to docs/ALIEN_ART_CONTRACT.md")
		return

	print(f"FAIL: {args.input_file} ({len(violations)} violation(s))")
	for violation in violations:
		print(f'  [{violation["rule"]}] {violation["message"]}')
	raise SystemExit(1)


#============================================
if __name__ == "__main__":
	main()
