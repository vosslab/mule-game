#!/usr/bin/env bash
# Validate every delivered round-4 SVG and report cast completeness.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

failure_count=0
for artist_dir in bakeoff/alien_cast4/artist_1 bakeoff/alien_cast4/artist_2 \
		bakeoff/alien_cast4/artist_3 bakeoff/alien_cast4/artist_4 \
		bakeoff/alien_cast4/artist_5 bakeoff/alien_cast4/artist_6; do
	name="${artist_dir##*/}"
	svg_count=$(ls "$artist_dir"/*.svg 2>/dev/null | wc -l | tr -d ' ')
	if [ -f "$artist_dir/interpretations.md" ]; then
		interp="interp:YES"
	else
		interp="interp:NO"
		failure_count=$((failure_count + 1))
	fi
	xml_fail=0
	lint_fail=0
	for svg in "$artist_dir"/*.svg; do
		[ -e "$svg" ] || continue
		if ! xmllint --noout "$svg" 2>/dev/null; then
			xml_fail=$((xml_fail + 1))
		fi
		base=$(basename "$svg" .svg)
		if [ "$base" != "mule" ]; then
			if ! python3 devel/lint_alien_svg.py -i "$svg" >/dev/null 2>&1; then
				lint_fail=$((lint_fail + 1))
			fi
		fi
	done
	echo "$name svgs:$svg_count $interp xml_fail:$xml_fail lint_fail:$lint_fail"
	failure_count=$((failure_count + xml_fail + lint_fail))
done

if [ "$failure_count" -gt 0 ]; then
	exit 1
fi
