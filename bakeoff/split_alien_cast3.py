#!/usr/bin/env python3
"""Split each cast3 combined artist sheet into per-species SVG files.

This preserves reproducible per-species evidence from the historical combined
round-3 files without applying the current contract-v2 linter to contract-v1
art.
"""

# Standard Library
import os
import re
import xml.etree.ElementTree as ET

ARTISTS = ["artist_1", "artist_2", "artist_4", "artist_5"]
SPECIES = [
	"humanoid", "flapper", "bonzoid", "gollumer",
	"spheroid", "leggite", "mechtron", "packer", "mule",
]
CAST_DIR = "bakeoff/alien_cast3"
OUT_ROOT = "output_smoke/aliens_cast3/split"

ET.register_namespace("", "http://www.w3.org/2000/svg")


#============================================

def element_species(element: ET.Element) -> str | None:
	"""Determine which species a defs direct child belongs to via its id prefix.

	Args:
		element (ET.Element): A direct child of <defs>.

	Returns:
		str | None: The species name, or None when no id matches.
	"""
	element_id = element.get("id")
	if element_id is None:
		return None
	for species in SPECIES:
		if element_id.startswith(species + "-"):
			return species
	return None


#============================================

def localname(tag: str) -> str:
	"""Strip an XML namespace from an ElementTree tag string.

	Args:
		tag (str): A tag string, possibly "{namespace}localname".

	Returns:
		str: The bare local tag name.
	"""
	if "}" in tag:
		return tag.split("}", 1)[1]
	return tag


#============================================

def serialize_children(elements: list) -> str:
	"""Serialize a list of elements to an SVG string without namespaces.

	Args:
		elements (list): ET.Element children to serialize.

	Returns:
		str: Concatenated markup.
	"""
	parts = []
	for element in elements:
		raw = ET.tostring(element, encoding="unicode")
		# Strip any xmlns declarations ElementTree re-adds per element.
		cleaned = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", raw)
		parts.append(cleaned)
	return "".join(parts)


#============================================

def split_artist(artist: str) -> dict:
	"""Split one artist's combined sheet into per-species SVG files.

	Args:
		artist (str): Artist directory name, for example "artist_2".

	Returns:
		dict: Maps species name to the written file path.
	"""
	source_path = os.path.join(CAST_DIR, artist, "aliens.svg")
	tree = ET.parse(source_path)
	root = tree.getroot()
	defs = None
	for child in root:
		if localname(child.tag) == "defs":
			defs = child
			break
	if defs is None:
		raise ValueError(f"{source_path} has no <defs>")

	by_species: dict = {species: [] for species in SPECIES}
	for child in defs:
		species = element_species(child)
		if species is not None:
			by_species[species].append(child)

	out_dir = os.path.join(OUT_ROOT, artist)
	os.makedirs(out_dir, exist_ok=True)
	written = {}
	for species, elements in by_species.items():
		if not elements:
			continue
		body = serialize_children(elements)
		svg_text = '<?xml version="1.0" encoding="UTF-8"?>\n'
		svg_text += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">\n'
		svg_text += "<defs>\n" + body + "\n</defs>\n</svg>\n"
		out_path = os.path.join(out_dir, f"{species}.svg")
		with open(out_path, "w", encoding="ascii") as handle:
			handle.write(svg_text)
		written[species] = out_path
	return written


#============================================

def main() -> None:
	"""Split every artist sheet and report the written file count."""
	for artist in ARTISTS:
		written = split_artist(artist)
		print(f"{artist}: wrote {len(written)} species files")


#============================================
if __name__ == "__main__":
	main()
