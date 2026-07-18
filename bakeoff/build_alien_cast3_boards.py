#!/usr/bin/env python3
"""Build pure-SVG comparison boards for the round-3 cast bake-off.

No rasterization anywhere: each board inlines the four artist sheets'
<defs> (with every id namespaced per artist so identical species ids do
not collide) and lays out <use> cells at the sizes the game draws. Open
in any browser and zoom losslessly.

Boards written to output_smoke/aliens_cast3/sheets_svg/:
  board_silhouettes.svg  artists x species, frame-1 silhouette at 18 and 32
  board_full.svg         artists x species, f1/f2 full color at 32 + head at 18
  board_green_terrain.svg worst-case player green on terrain at 32
  species_<name>.svg     one deep-dive board per species
"""

# Standard Library
import os
import re

ARTISTS = ["artist_1", "artist_2", "artist_4", "artist_5"]
SPECIES = [
	"humanoid", "flapper", "bonzoid", "gollumer",
	"spheroid", "leggite", "mechtron", "packer", "mule",
]
CAST_DIR = "bakeoff/alien_cast3"
OUT_DIR = "output_smoke/aliens_cast3/sheets_svg"

# Palette tokens mirrored from src/ui/sprites/palette.ts by value; the
# boards are review scratch, not pipeline art, so literal hexes are fine.
BG_DEEP = "#1a1a2e"
TERRAIN = "#7c9a4e"
BG_PANEL = "#22223a"
PLAYER0 = "#ff5a5f"
PLAYER2 = "#3aaa18"
TEXT = "#f6f1e4"

# Species canvas aspect: tall 200x320 for aliens, wide 320x200 for mule.
TALL_ASPECT = 200 / 320
WIDE_ASPECT = 320 / 200


#============================================

def load_namespaced_defs(artist: str) -> str:
	"""Read one artist sheet and namespace every id with the artist tag.

	Args:
		artist (str): Artist directory name, for example "artist_2".

	Returns:
		str: The artist's <defs> inner markup with namespaced ids.
	"""
	path = os.path.join(CAST_DIR, artist, "aliens.svg")
	with open(path, "r", encoding="ascii") as handle:
		text = handle.read()
	# Drop XML declaration and comments (hypothesis blocks are huge).
	text = re.sub(r"<\?xml[^>]*\?>", "", text)
	text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
	# Keep only the defs inner content.
	match = re.search(r"<defs>(.*)</defs>", text, flags=re.DOTALL)
	inner = match.group(1)
	# Namespace ids and every reference form.
	tag = artist.replace("artist_", "a")
	inner = re.sub(r'id="([^"]+)"', f'id="{tag}_\\1"', inner)
	inner = re.sub(r'href="#([^"]+)"', f'href="#{tag}_\\1"', inner)
	inner = re.sub(r"url\(#([^)]+)\)", f"url(#{tag}_\\1)", inner)
	return inner


#============================================

def symbol_ref(artist: str, species: str, suffix: str) -> str:
	"""Build the namespaced symbol id reference for a cell.

	Args:
		artist (str): Artist directory name.
		species (str): Species name.
		suffix (str): Symbol suffix, for example "frame1".

	Returns:
		str: The namespaced id, without the leading '#'.
	"""
	tag = artist.replace("artist_", "a")
	return f"{tag}_{species}-{suffix}"


#============================================

def cell_use(artist: str, species: str, suffix: str, x: float, y: float,
	height: float, color: str, background: str | None) -> str:
	"""Emit one board cell: optional background rect plus a sized <use>.

	Args:
		artist (str): Artist directory name.
		species (str): Species name.
		suffix (str): Symbol suffix to reference.
		x (float): Cell left, board units.
		y (float): Cell top, board units.
		height (float): Rendered cell height, board units.
		color (str): CSS color applied for currentColor.
		background (str | None): Background fill, or None for none.

	Returns:
		str: SVG markup for the cell.
	"""
	aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
	if suffix == "head":
		aspect = 1.0
	width = height * aspect
	markup = ""
	if background is not None:
		markup += f'<rect x="{x}" y="{y}" width="{width:.1f}" height="{height}" '
		markup += f'fill="{background}"/>'
	ref = symbol_ref(artist, species, suffix)
	markup += f'<use href="#{ref}" x="{x}" y="{y}" width="{width:.1f}" '
	markup += f'height="{height}" style="color:{color}"/>'
	return markup


#============================================

def board_shell(title: str, width: float, height: float, defs: str, body: str) -> str:
	"""Wrap defs and body markup into a complete standalone board SVG.

	Args:
		title (str): Board title text.
		width (float): Board width.
		height (float): Board height.
		defs (str): Combined namespaced defs content.
		body (str): Laid-out cells and labels.

	Returns:
		str: Full SVG document text.
	"""
	svg = '<svg xmlns="http://www.w3.org/2000/svg" '
	svg += f'viewBox="0 0 {width:.0f} {height:.0f}" '
	svg += f'width="{width:.0f}" height="{height:.0f}" '
	svg += 'font-family="monospace">\n'
	svg += f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG_DEEP}"/>\n'
	svg += f"<defs>{defs}</defs>\n"
	svg += f'<text x="12" y="24" fill="{TEXT}" font-size="16">{title}</text>\n'
	svg += body
	svg += "</svg>\n"
	return svg


#============================================

def label(x: float, y: float, text: str, size: int = 11) -> str:
	"""Emit one text label.

	Args:
		x (float): Label left.
		y (float): Label baseline.
		text (str): Label text.
		size (int): Font size.

	Returns:
		str: SVG text markup.
	"""
	return f'<text x="{x}" y="{y}" fill="{TEXT}" font-size="{size}">{text}</text>\n'


#============================================

def build_grid_board(title: str, out_name: str, defs: str, cells_per_species: list,
	color: str, background: str | None) -> None:
	"""Build one board: rows = artists, one column block per species.

	Args:
		title (str): Board title.
		out_name (str): Output filename.
		defs (str): Combined defs.
		cells_per_species (list): (suffix, height) tuples drawn left to right
			inside each species block.
		color (str): currentColor value for every cell.
		background (str | None): Per-cell background fill.
	"""
	pad = 10
	label_gutter = 90
	block_widths = []
	for species in SPECIES:
		aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
		width = 0.0
		for suffix, height in cells_per_species:
			cell_aspect = 1.0 if suffix == "head" else aspect
			width += height * cell_aspect + 6
		block_widths.append(width + pad)
	row_height = max(height for _suffix, height in cells_per_species) + pad

	total_w = label_gutter + sum(block_widths) + pad
	total_h = 40 + len(ARTISTS) * row_height + pad
	body = ""

	x = label_gutter
	for index, species in enumerate(SPECIES):
		body += label(x, 38, species)
		x += block_widths[index]

	y = 46
	for artist in ARTISTS:
		body += label(8, y + row_height / 2, artist)
		x = label_gutter
		for index, species in enumerate(SPECIES):
			cx = x
			for suffix, height in cells_per_species:
				aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
				cell_aspect = 1.0 if suffix == "head" else aspect
				# Bottom-align cells inside the row band.
				cy = y + (row_height - pad - height)
				body += cell_use(artist, species, suffix, cx, cy, height, color, background)
				cx += height * cell_aspect + 6
			x += block_widths[index]
		y += row_height

	svg_text = board_shell(title, total_w, total_h, defs, body)
	os.makedirs(OUT_DIR, exist_ok=True)
	out_path = os.path.join(OUT_DIR, out_name)
	with open(out_path, "w", encoding="ascii") as handle:
		handle.write(svg_text)
	print(f"wrote {out_path}")


#============================================

def build_species_board(species: str, defs: str) -> None:
	"""Build one per-species deep-dive board: rows = artists.

	Columns: silhouettes f1 at 18/32, f2 at 32; full f1/f2 at 32 on all
	three backgrounds; green-on-terrain worst case; head at 18/32; f1 at
	128 for close reading (still vector, zoom further at will).

	Args:
		species (str): Species name.
		defs (str): Combined defs.
	"""
	aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
	columns = [
		("silhouette1", 18, PLAYER0, BG_DEEP, "sil1 18"),
		("silhouette1", 32, PLAYER0, BG_DEEP, "sil1 32"),
		("silhouette2", 32, PLAYER0, BG_DEEP, "sil2 32"),
		("frame1", 32, PLAYER0, BG_DEEP, "f1 deep"),
		("frame2", 32, PLAYER0, BG_DEEP, "f2 deep"),
		("frame1", 32, PLAYER0, TERRAIN, "f1 terr"),
		("frame1", 32, PLAYER0, BG_PANEL, "f1 panel"),
		("frame1", 32, PLAYER2, TERRAIN, "green/terr"),
		("head", 18, PLAYER0, BG_DEEP, "head 18"),
		("head", 32, PLAYER0, BG_DEEP, "head 32"),
		("frame1", 128, PLAYER0, BG_DEEP, "f1 big"),
		("frame2", 128, PLAYER0, BG_DEEP, "f2 big"),
	]
	# The mule has no head symbol; drop the head columns for it.
	if species == "mule":
		columns = [entry for entry in columns if entry[0] != "head"]

	pad = 12
	label_gutter = 90
	col_widths = []
	for suffix, height, _color, _bg, _lab in columns:
		cell_aspect = 1.0 if suffix == "head" else aspect
		col_widths.append(max(height * cell_aspect, 52) + pad)
	row_height = max(height for _s, height, _c, _b, _l in columns) + pad

	total_w = label_gutter + sum(col_widths) + pad
	total_h = 40 + len(ARTISTS) * row_height + pad
	body = ""

	x = label_gutter
	for index, (_suffix, _height, _color, _bg, lab) in enumerate(columns):
		body += label(x, 38, lab, size=10)
		x += col_widths[index]

	y = 46
	for artist in ARTISTS:
		body += label(8, y + row_height / 2, artist)
		x = label_gutter
		for index, (suffix, height, color, bg, _lab) in enumerate(columns):
			cy = y + (row_height - pad - height)
			body += cell_use(artist, species, suffix, x, cy, height, color, bg)
			x += col_widths[index]
		y += row_height

	svg_text = board_shell(f"round 3: {species}", total_w, total_h, defs, body)
	out_path = os.path.join(OUT_DIR, f"species_{species}.svg")
	with open(out_path, "w", encoding="ascii") as handle:
		handle.write(svg_text)
	print(f"wrote {out_path}")


#============================================

def build_artist_board(artist: str, defs: str) -> None:
	"""Build one large contact sheet for a single artist's full cast.

	Layout: one column per creature. Top row frame 1 LARGE (200 tall),
	second row frame 2 LARGE, third row the two frames at game size (32)
	plus the 18 px silhouette, so the big read and the true-scale read sit
	on the same page.

	Args:
		artist (str): Artist directory name.
		defs (str): Combined namespaced defs.
	"""
	pad = 16
	label_gutter = 20
	big = 200
	small = 32
	tiny = 18

	col_widths = []
	for species in SPECIES:
		aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
		col_widths.append(big * aspect + pad)

	big_row = big + pad
	small_row = small + pad + 14
	total_w = label_gutter + sum(col_widths) + pad
	total_h = 40 + 2 * big_row + small_row + pad
	body = ""

	x = label_gutter
	for index, species in enumerate(SPECIES):
		body += label(x, 38, species, size=13)
		x += col_widths[index]

	# Row 1: frame 1 large. Row 2: frame 2 large. Row 3: game-size strip.
	x = label_gutter
	for index, species in enumerate(SPECIES):
		y1 = 46
		y2 = 46 + big_row
		y3 = 46 + 2 * big_row
		body += cell_use(artist, species, "frame1", x, y1, big, PLAYER0, BG_PANEL)
		body += cell_use(artist, species, "frame2", x, y2, big, PLAYER0, BG_PANEL)
		aspect = WIDE_ASPECT if species == "mule" else TALL_ASPECT
		sx = x
		body += cell_use(artist, species, "frame1", sx, y3, small, PLAYER0, BG_DEEP)
		sx += small * aspect + 6
		body += cell_use(artist, species, "frame2", sx, y3, small, PLAYER0, BG_DEEP)
		sx += small * aspect + 6
		body += cell_use(
			artist, species, "silhouette1", sx, y3 + (small - tiny), tiny, PLAYER0, BG_DEEP
		)
		x += col_widths[index]

	title = f"round 3 cast: {artist} (f1 large, f2 large, then f1/f2 at 32 + sil at 18)"
	svg_text = board_shell(title, total_w, total_h, defs, body)
	out_path = os.path.join(OUT_DIR, f"cast_{artist}.svg")
	with open(out_path, "w", encoding="ascii") as handle:
		handle.write(svg_text)
	print(f"wrote {out_path}")


#============================================

def main() -> None:
	"""Build every SVG board."""
	defs = ""
	for artist in ARTISTS:
		defs += load_namespaced_defs(artist)

	build_grid_board(
		"round 3 silhouettes: frame 1 at 18 and 32 (zoom freely; it is all vector)",
		"board_silhouettes.svg", defs,
		[("silhouette1", 18), ("silhouette1", 32)], PLAYER0, BG_DEEP,
	)
	build_grid_board(
		"round 3 full color: f1 + f2 at 32, head at 18, player0 on deep",
		"board_full.svg", defs,
		[("frame1", 32), ("frame2", 32), ("head", 18)], PLAYER0, BG_DEEP,
	)
	build_grid_board(
		"round 3 worst case: player green on terrain, f1 at 32",
		"board_green_terrain.svg", defs,
		[("frame1", 32)], PLAYER2, TERRAIN,
	)
	for species in SPECIES:
		build_species_board(species, defs)
	for artist in ARTISTS:
		build_artist_board(artist, defs)


#============================================
if __name__ == "__main__":
	main()
