#!/usr/bin/env python3
"""Generate src/ui/sprites/sprites_species.ts from the alien art (WP-GEN-1).

The art is the source of truth. One SVG per species lives in art/aliens/, drawn
to the schema in docs/ALIEN_ART_CONTRACT.md, and this script inlines the
contents of each file's <defs> into one shared TypeScript defs builder that the
game scenes mount. A human edits a path in the SVG, runs this script, and the
running game changes.

What is carried across:
  - every element inside <defs> except the two lint-only silhouette symbols,
    which the clean-edge lint uses and the game never draws.
  - every id, rewritten with the shipped "sprite-species-" prefix, so the art's
    "humanoid-frame1" becomes the "sprite-species-humanoid-frame1" symbol id the
    scenes and the Playwright gallery specs already assert. href and mask
    references are rewritten to match.
  - nothing below </defs>: that block is the artist's preview and never ships.

The emitted TypeScript is formatted the way prettier would format it (the repo
gate runs prettier --check over src/), and generation is byte-stable: the same
art produces the same file, so tests/test_species_sprites_fresh.mjs can compare
a fresh generation against the committed file and fail on a hand edit.

Run:
  source source_me.sh && python3 devel/build_species_sprites.py
  source source_me.sh && python3 devel/build_species_sprites.py -a /tmp/art -o /tmp/out.ts
"""

# Standard Library
import os
import argparse
import subprocess
import xml.etree.ElementTree

# The eight species, in the order the Species union in src/engine/player.ts
# declares them. This order is the shipped SPECIES_NAMES order, so it is fixed
# here rather than discovered from the directory listing.
SPECIES_NAMES = (
	"humanoid",
	"gollumer",
	"mechtron",
	"packer",
	"leggite",
	"bonzoid",
	"spheroid",
	"flapper",
)

SVG_NAMESPACE = "http://www.w3.org/2000/svg"

# The editing canvas every species file is authored on (5:8, tall).
ART_VIEWBOX = "0 0 200 320"
SPRITE_WIDTH = 200
SPRITE_HEIGHT = 320

# Every id from the art is namespaced with this prefix on the way out, which is
# also what turns "<species>-frame1" into the shipped symbol id.
SYMBOL_ID_PREFIX = "sprite-species-"

# The elements the art contract allows inside <defs>. Anything else is a file
# the generator refuses to ship (a <style>, <filter>, or <image> would reach the
# game through this path). <mask> is here for exactly one job: the optional
# under-shade, which is clipped to the creature by a mask holding a white <use>
# of the frame's own shapes group.
ALLOWED_TAGS = frozenset(
	("g", "symbol", "use", "rect", "circle", "ellipse", "path", "polygon", "mask")
)

# The under-shade's earlier clipPath form is rejected on sight, because it
# renders as nothing. A <use> inside a <clipPath> contributes clip geometry only
# when it references a graphics element, so a <use> of the shapes GROUP resolves
# to an empty clip and the shade never paints, in the browser preview and in the
# game alike. Measured, then replaced by the mask form. A file still carrying the
# old spelling is a stale file, not a working one, so it stops here.
CLIP_GUIDANCE = (
	"the under-shade is clipped by a mask, not a clipPath: use "
	'<mask id="<species>-fN-mask"><use href="#<species>-fN-shapes" fill="#ffffff"/></mask> '
	'and wrap the shade rect in <g mask="url(#<species>-fN-mask)">'
)

# The lint renders these two; the game never draws them, so they are dropped.
SILHOUETTE_SYMBOL_SUFFIXES = ("-silhouette1", "-silhouette2")

# The three symbols each species file must define, as id suffixes.
SHIPPED_SYMBOL_SUFFIXES = ("-frame1", "-frame2", "-head")

# prettier's printWidth for this repo (.prettierrc).
PRINT_WIDTH = 100

DEFAULT_ART_DIR = "art/aliens"
DEFAULT_OUTPUT_FILE = "src/ui/sprites/sprites_species.ts"


#============================================

def parse_args() -> argparse.Namespace:
	"""Parse command-line arguments.

	Returns:
		argparse.Namespace: Parsed arguments.
	"""
	parser = argparse.ArgumentParser(
		description="Generate the species sprite TypeScript from art/aliens/*.svg."
	)
	parser.add_argument(
		"-a", "--art-dir", dest="art_dir", default="",
		help="Directory holding <species>.svg. Defaults to art/aliens/ in the repo.",
	)
	parser.add_argument(
		"-o", "--output", dest="output_file", default="",
		help="TypeScript file to write. Defaults to src/ui/sprites/sprites_species.ts.",
	)
	args = parser.parse_args()
	return args


#============================================

def get_repo_root() -> str:
	"""Find the repository root with git.

	Returns:
		str: Absolute path to the repository root.
	"""
	completed = subprocess.run(
		("git", "rev-parse", "--show-toplevel"),
		capture_output=True, text=True, check=True,
	)
	repo_root = completed.stdout.strip()
	return repo_root


#============================================

def strip_namespace(tag: str) -> str:
	"""Turn an ElementTree namespaced tag into its bare SVG element name.

	Args:
		tag (str): Tag as ElementTree reports it, e.g. "{http://...}rect".

	Returns:
		str: The bare element name, e.g. "rect".
	"""
	expected_prefix = "{" + SVG_NAMESPACE + "}"
	if not tag.startswith(expected_prefix):
		raise ValueError(f"element is not in the SVG namespace: {tag}")
	bare_tag = tag[len(expected_prefix):]
	return bare_tag


#============================================

def escape_attribute_value(value: str) -> str:
	"""Escape an attribute value for a double-quoted XML attribute.

	Args:
		value (str): Raw attribute value as parsed.

	Returns:
		str: Value safe to place inside double quotes.
	"""
	escaped = value.replace("&", "&amp;")
	escaped = escaped.replace("<", "&lt;")
	escaped = escaped.replace(">", "&gt;")
	escaped = escaped.replace('"', "&quot;")
	return escaped


#============================================

def prefixed_id(species: str, raw_id: str) -> str:
	"""Namespace one art id for the shared game <defs>.

	Every id in a species file is already species-prefixed (the art contract
	requires it, because all eight files land in one <defs>). This adds the
	shipped "sprite-species-" prefix on top, which is what makes the art's
	"humanoid-frame1" come out as the "sprite-species-humanoid-frame1" symbol id
	the scenes and gallery specs assert.

	Args:
		species (str): Species the id came from.
		raw_id (str): Id exactly as the art file spells it.

	Returns:
		str: The namespaced id.
	"""
	if not raw_id.startswith(f"{species}-"):
		raise ValueError(f"{species}: id '{raw_id}' is not prefixed with the species name")
	namespaced_id = SYMBOL_ID_PREFIX + raw_id
	return namespaced_id


#============================================

def rewrite_reference(species: str, value: str, attribute: str) -> str:
	"""Rewrite an href or mask value to point at the namespaced id.

	Args:
		species (str): Species the reference came from.
		value (str): Raw attribute value, "#some-id" or "url(#some-id)".
		attribute (str): Attribute name, for the error message.

	Returns:
		str: The rewritten reference.
	"""
	if attribute == "href":
		if not value.startswith("#"):
			raise ValueError(f"{species}: href '{value}' is not a local #id reference")
		rewritten = "#" + prefixed_id(species, value[1:])
		return rewritten
	if not (value.startswith("url(#") and value.endswith(")")):
		raise ValueError(f"{species}: {attribute} '{value}' is not a local url(#id) reference")
	rewritten = "url(#" + prefixed_id(species, value[len("url(#"):-1]) + ")"
	return rewritten


#============================================

def rewrite_attributes(species: str, element: xml.etree.ElementTree.Element) -> dict:
	"""Copy one element's attributes, rewriting every id and id reference.

	Args:
		species (str): Species the element came from.
		element (xml.etree.ElementTree.Element): Parsed element.

	Returns:
		dict: Attribute name to value, in document order.
	"""
	rewritten: dict = {}
	for name, value in element.attrib.items():
		if name.startswith("{"):
			raise ValueError(f"{species}: namespaced attribute '{name}' is not allowed")
		if name == "clip-path":
			raise ValueError(f"{species}: clip-path is not allowed; {CLIP_GUIDANCE}")
		if name == "id":
			rewritten[name] = prefixed_id(species, value)
		elif name in ("href", "mask"):
			rewritten[name] = rewrite_reference(species, value, name)
		else:
			rewritten[name] = value
	return rewritten


#============================================

def serialize_element(species: str, element: xml.etree.ElementTree.Element) -> list:
	"""Serialize one defs element (and its children) into markup pieces.

	One piece per line of emitted markup: a self-closing element is one piece, a
	container is an open piece, its children's pieces, and a close piece.

	Args:
		species (str): Species the element came from.
		element (xml.etree.ElementTree.Element): Parsed element.

	Returns:
		list: Markup strings, in document order.
	"""
	tag = strip_namespace(element.tag)
	if tag == "clipPath":
		raise ValueError(f"{species}: <clipPath> is not allowed; {CLIP_GUIDANCE}")
	if tag not in ALLOWED_TAGS:
		raise ValueError(f"{species}: element <{tag}> is not allowed inside <defs>")
	attributes = rewrite_attributes(species, element)
	attribute_text = ""
	for name, value in attributes.items():
		attribute_text += f' {name}="{escape_attribute_value(value)}"'
	children = list(element)
	if not children:
		pieces = [f"<{tag}{attribute_text}/>"]
		return pieces
	pieces = [f"<{tag}{attribute_text}>"]
	for child in children:
		pieces += serialize_element(species, child)
	pieces.append(f"</{tag}>")
	return pieces


#============================================

def find_defs(species: str, root: xml.etree.ElementTree.Element) -> xml.etree.ElementTree.Element:
	"""Find the single <defs> element of a species file.

	Args:
		species (str): Species being read.
		root (xml.etree.ElementTree.Element): Parsed <svg> root.

	Returns:
		xml.etree.ElementTree.Element: The <defs> element.
	"""
	defs_elements = root.findall("{" + SVG_NAMESPACE + "}defs")
	if len(defs_elements) != 1:
		raise ValueError(f"{species}: expected exactly one <defs>, found {len(defs_elements)}")
	defs_element = defs_elements[0]
	return defs_element


#============================================

def check_shipped_symbols(species: str, pieces: list) -> None:
	"""Confirm the three shipped symbols survived into the markup.

	The head symbol is the one the 18 px auction dock badge draws (art contract
	rule 8), so a species that ships without it would silently give the dock a
	full-body avatar with no readable face.

	Args:
		species (str): Species being read.
		pieces (list): Markup strings for that species.

	Returns:
		None
	"""
	for suffix in SHIPPED_SYMBOL_SUFFIXES:
		symbol_open = f'<symbol id="{SYMBOL_ID_PREFIX}{species}{suffix}"'
		matching = [piece for piece in pieces if piece.startswith(symbol_open)]
		if len(matching) != 1:
			raise ValueError(f"{species}: expected exactly one <symbol id='{species}{suffix}'>")


#============================================

def read_species_markup(art_dir: str, species: str) -> list:
	"""Read one species SVG and return its shipped markup pieces.

	Args:
		art_dir (str): Directory holding <species>.svg.
		species (str): Species to read.

	Returns:
		list: Markup strings, in document order, ids already namespaced.
	"""
	svg_path = os.path.join(art_dir, f"{species}.svg")
	if not os.path.isfile(svg_path):
		raise FileNotFoundError(f"missing species art: {svg_path}")
	tree = xml.etree.ElementTree.parse(svg_path)
	root = tree.getroot()
	view_box = root.attrib["viewBox"]
	if view_box != ART_VIEWBOX:
		raise ValueError(f"{species}: viewBox is '{view_box}', expected '{ART_VIEWBOX}'")
	defs_element = find_defs(species, root)
	pieces: list = []
	for child in defs_element:
		# Every top-level defs child carries an id: it is either a group the frames
		# draw from or a symbol the game mounts, and both are referenced by id.
		child_id = child.attrib["id"]
		# The two silhouette symbols exist for the clean-edge lint only.
		if child_id.endswith(SILHOUETTE_SYMBOL_SUFFIXES):
			continue
		pieces += serialize_element(species, child)
	check_shipped_symbols(species, pieces)
	return pieces


#============================================

def typescript_string_literal(text: str) -> str:
	"""Quote a markup string the way prettier would quote it.

	prettier picks the quote character that needs fewer escapes, and prefers
	double quotes on a tie. Markup with attributes is therefore single-quoted and
	a bare closing tag is double-quoted; emitting it this way means the generated
	file passes `prettier --check` with no reformatting step.

	Args:
		text (str): Markup string to quote.

	Returns:
		str: A TypeScript string literal.
	"""
	if text.count('"') > text.count("'"):
		escaped = text.replace("\\", "\\\\").replace("'", "\\'")
		literal = "'" + escaped + "'"
		return literal
	escaped = text.replace("\\", "\\\\").replace('"', '\\"')
	literal = '"' + escaped + '"'
	return literal


#============================================

def append_statement_lines(piece: str) -> list:
	"""Emit the `markup += ...;` statement for one markup piece.

	prettier breaks after the `+=` when the whole statement would overrun the
	100-column print width, and indents the continuation by one level. Long path
	data hits that constantly, so the rule is reproduced here rather than shelling
	out to prettier.

	Args:
		piece (str): One markup string.

	Returns:
		list: One or two TypeScript source lines.
	"""
	literal = typescript_string_literal(piece)
	single_line = f"  markup += {literal};"
	if len(single_line) <= PRINT_WIDTH:
		return [single_line]
	lines = ["  markup +=", f"    {literal};"]
	return lines


#============================================

def build_species_function(species: str, pieces: list) -> list:
	"""Build the per-species markup builder function.

	Args:
		species (str): Species the function serves.
		pieces (list): That species' markup strings.

	Returns:
		list: TypeScript source lines.
	"""
	function_name = f"build{species.capitalize()}Symbols"
	lines = ["//============================================"]
	lines.append(f"// {species.capitalize()}: symbols inlined from art/aliens/{species}.svg.")
	lines.append(f"function {function_name}(): string {{")
	lines.append('  let markup = "";')
	for piece in pieces:
		lines += append_statement_lines(piece)
	lines.append("  return markup;")
	lines.append("}")
	return lines


#============================================

def build_file_header() -> list:
	"""Build the generated file's banner and public API.

	Returns:
		list: TypeScript source lines.
	"""
	lines = [
		"/**",
		" * GENERATED FILE. Edit the art, not this file.",
		" *",
		" * Source of truth: art/aliens/<species>.svg, one editable SVG per species,",
		" * drawn to the schema in docs/ALIEN_ART_CONTRACT.md. Change a path there and",
		" * regenerate:",
		" *",
		" *   source source_me.sh && python3 devel/build_species_sprites.py",
		" *",
		" * tests/test_species_sprites_fresh.mjs regenerates into a buffer and compares,",
		" * so a hand edit to this file fails the suite instead of silently diverging",
		" * from the art.",
		" *",
		" * Player-color tint: each creature's body pass is `fill=\"currentColor\"`, so a",
		" * caller tints an instance by setting the CSS `color` property on the <use>",
		" * element or an ancestor. The white halo and the dark keyline around it are",
		" * fixed: together they keep any of the four player tints legible on terrain and",
		" * on the dark panels alike.",
		" */",
		"",
		"/** Fixed set of playable species; the order matches the Species union in src/engine/player.ts. */",
		"export const SPECIES_NAMES = [",
	]
	for species in SPECIES_NAMES:
		lines.append(f'  "{species}",')
	lines += [
		"] as const;",
		"",
		"export type SpeciesName = (typeof SPECIES_NAMES)[number];",
		"",
		"/**",
		" * Sprite size in the art's own viewBox units. The creatures are authored on a",
		" * 200x320 grid (5:8, tall), so an instance drawn into a square box would",
		" * letterbox: size a <use> from these constants instead of a square literal.",
		" */",
		f"export const SPECIES_SPRITE_WIDTH = {SPRITE_WIDTH};",
		f"export const SPECIES_SPRITE_HEIGHT = {SPRITE_HEIGHT};",
		"",
		"/** Width of a species sprite drawn at one unit of height (width = height * this). */",
		"export const SPECIES_SPRITE_ASPECT = SPECIES_SPRITE_WIDTH / SPECIES_SPRITE_HEIGHT;",
		"",
		"/**",
		" * Build the symbol id for one species animation frame, per the naming convention",
		" * `sprite-<domain>-<name>-frameN`. Both frames carry an explicit frame suffix:",
		" * species avatars always animate once mounted in a scene.",
		" *",
		" * @param species - Which species symbol to look up.",
		" * @param frame - Animation frame, 1 (idle) or 2 (motion).",
		" * @returns The `<defs>` symbol id for that species and frame.",
		" */",
		"export function speciesSymbolId(species: SpeciesName, frame: 1 | 2): string {",
		f"  return `{SYMBOL_ID_PREFIX}${{species}}-frame${{frame}}`;",
		"}",
		"",
		"/**",
		" * Build the symbol id for one species' head crop: a square window onto the head",
		" * and shoulders of frame 1. The auction dock badge draws this instead of the full",
		" * body, because at 18 px tall no full creature keeps a readable face (art contract",
		" * rule 8). The window lives in the art file's own symbol viewBox, so the crop needs",
		" * nothing from the caller but a square box.",
		" *",
		" * @param species - Which species head to look up.",
		" * @returns The `<defs>` symbol id for that species' head crop.",
		" */",
		"export function speciesHeadSymbolId(species: SpeciesName): string {",
		f"  return `{SYMBOL_ID_PREFIX}${{species}}-head`;",
		"}",
		"",
		"/**",
		" * Choose which frame id a frame-swap timer should render this tick.",
		" *",
		" * When `prefersReducedMotion` is true, hold on frame 1 (the idle pose) regardless",
		" * of the animation-driven frame index. The frame-swap timer belongs to the scene",
		" * that consumes this sprite set; this function is the pure decision logic it calls.",
		" *",
		" * @param species - Which species is animating.",
		" * @param animationFrame - The frame the animation clock is currently on.",
		" * @param prefersReducedMotion - Result of a",
		' *   `matchMedia("(prefers-reduced-motion: reduce)")` check.',
		" * @returns The symbol id to render this tick.",
		" */",
		"export function pickSpeciesFrameId(",
		"  species: SpeciesName,",
		"  animationFrame: 1 | 2,",
		"  prefersReducedMotion: boolean,",
		"): string {",
		"  if (prefersReducedMotion) {",
		"    return speciesSymbolId(species, 1);",
		"  }",
		"  return speciesSymbolId(species, animationFrame);",
		"}",
		"",
		"/**",
		" * Build the shared `<defs>` markup for every species: 8 species x (2 frames + 1",
		" * head crop) = 24 symbols, plus the geometry and face groups they draw from.",
		" *",
		" * @returns Raw SVG markup for a single `<defs>` element.",
		" */",
		"export function buildSpeciesSpriteDefsMarkup(): string {",
		'  let markup = "<defs>";',
	]
	for species in SPECIES_NAMES:
		lines.append(f"  markup += build{species.capitalize()}Symbols();")
	lines += [
		'  markup += "</defs>";',
		"  return markup;",
		"}",
	]
	return lines


#============================================

def build_typescript(art_dir: str) -> str:
	"""Build the whole generated TypeScript file from the art directory.

	Args:
		art_dir (str): Directory holding the eight species SVGs.

	Returns:
		str: The file's full text, ending in a newline.
	"""
	lines = build_file_header()
	for species in SPECIES_NAMES:
		pieces = read_species_markup(art_dir, species)
		lines.append("")
		lines += build_species_function(species, pieces)
	file_text = "\n".join(lines) + "\n"
	return file_text


#============================================

def main() -> None:
	"""Generate the species sprite TypeScript from the alien art."""
	args = parse_args()
	repo_root = get_repo_root()
	art_dir = args.art_dir
	if not art_dir:
		art_dir = os.path.join(repo_root, DEFAULT_ART_DIR)
	output_file = args.output_file
	if not output_file:
		output_file = os.path.join(repo_root, DEFAULT_OUTPUT_FILE)
	file_text = build_typescript(art_dir)
	with open(output_file, "w", encoding="ascii") as output_handle:
		output_handle.write(file_text)
	symbol_count = len(SPECIES_NAMES) * len(SHIPPED_SYMBOL_SUFFIXES)
	print(f"wrote {output_file}")
	print(f"  {len(SPECIES_NAMES)} species from {art_dir}, {symbol_count} symbols")


if __name__ == '__main__':
	main()
