"""Report inkCoverage per species/frame from measure_alien_art.py diagnostics."""

import json
import collections

DATA = "/tmp/cov.json"


#============================================

def main() -> None:
	"""Print min/max inkCoverage per species and frame across the size ladder."""
	with open(DATA, "r", encoding="ascii") as handle:
		payload = json.load(handle)
	rows = payload["cells"] if isinstance(payload, dict) and "cells" in payload else payload
	buckets = collections.defaultdict(list)
	for row in rows:
		coverage = row.get("inkCoverage")
		if coverage is None:
			continue
		buckets[(row["species"], row["frame"])].append(coverage)
	print(f"{'species':10s} {'f':>2s}  {'min':>7s} {'max':>7s}")
	for key in sorted(buckets):
		values = buckets[key]
		low = min(values) * 100.0
		high = max(values) * 100.0
		flag = "  <-- UNDER 70" if high < 70.0 else ""
		print(f"{key[0]:10s} {key[1]:>2}  {low:6.2f}% {high:6.2f}%{flag}")


if __name__ == "__main__":
	main()
