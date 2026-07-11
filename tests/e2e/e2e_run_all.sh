#!/usr/bin/env bash
# e2e_run_all.sh - run every routine non-browser E2E script under tests/e2e/
# and report pass/fail for each, per docs/E2E_TESTS.md.
#
# Routine scripts (run here, in order):
#   1. e2e_mini_flow.mjs       - short scripted UI flow smoke.
#   2. e2e_full_game.mjs       - full seeded playthrough matrix (both modes).
#   3. e2e_balance_sim.mjs    - headless all-AI auction balance sim.
#   4. e2e_balance_report.mjs - balance-sim HTML dashboard check.
#   5. e2e_walkthrough.mjs    - single-seed active walkthrough (seed 3,
#      beginner mode). This is the routine walkthrough gate; it is not the
#      release gate.
#
# Explicit release-gate command (NOT run by this script):
#   node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs
#
# The sweep runs the active walkthrough across a seed x mode matrix and
# checks cross-matrix coverage; it takes several minutes, so it stays an
# explicit command a human or release process invokes directly rather than
# a step in the routine gate. Run it before a release, not on every patch.
#
# Each script already exits non-zero on its own failure; this runner just
# invokes each one in turn, records PASS/FAIL, and prints a summary. Exit
# code is 0 only when every routine script passed.
#
# Flags:
#   -h, --help          Print usage and exit 0.

set -euo pipefail

# Usage
usage() {
	cat <<'USAGE'
Usage: e2e_run_all.sh [-h|--help]

  -h, --help          Print this help and exit 0.

Runs the routine non-browser E2E scripts under tests/e2e/ and reports
PASS/FAIL for each. The full seed x mode sweep is the explicit release
gate and is not run here:

  node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs
USAGE
}

# Parse flags
while [ "$#" -gt 0 ]; do
	case "$1" in
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "ERROR: unknown flag: $1" >&2
			usage >&2
			exit 2
			;;
	esac
done

cd "$(git rev-parse --show-toplevel)"

# Step tracking (bash 3.2 compatible)
STEP_NAMES=()
STEP_STATUS=()
SUMMARY_ENABLED=0

# step_record <name> <status>
step_record() {
	STEP_NAMES+=("$1")
	STEP_STATUS+=("$2")
}

# step_run <name> <command...>
# Runs the given command. Records PASS or FAIL+summary+exit 1.
step_run() {
	local name="$1"
	shift
	echo "==> $name"
	local rc=0
	set +e
	"$@"
	rc=$?
	set -e
	if [ "$rc" -eq 0 ]; then
		step_record "$name" "PASS"
	else
		step_record "$name" "FAIL"
		print_summary
		trap - EXIT
		exit 1
	fi
}

# Summary
print_summary() {
	if [ "$SUMMARY_ENABLED" != "1" ]; then
		return 0
	fi
	local total=${#STEP_NAMES[@]}
	local failed=0
	local i=0
	echo "Summary:"
	while [ "$i" -lt "$total" ]; do
		local name="${STEP_NAMES[$i]}"
		local status="${STEP_STATUS[$i]}"
		if [ "$status" = "FAIL" ]; then
			failed=$((failed + 1))
		fi
		echo "  [$status] $name"
		i=$((i + 1))
	done
	if [ "$failed" -eq 0 ]; then
		echo "PASS: $total checks passed."
	else
		echo "FAIL: $failed of $total checks failed."
	fi
}

trap print_summary EXIT

# Steps
SUMMARY_ENABLED=1

# 1. e2e_mini_flow.mjs - short scripted UI flow smoke.
step_run e2e_mini_flow node tests/e2e/e2e_mini_flow.mjs

# 2. e2e_full_game.mjs - full seeded playthrough matrix (both modes).
step_run e2e_full_game node tests/e2e/e2e_full_game.mjs

# 3. e2e_balance_sim.mjs - headless all-AI auction balance sim.
# Needs --import tsx: game_state.ts imports sibling .ts modules by
# extensionless specifier, which Node's own type-stripping resolver does not
# follow (unlike tsx's resolver). The file's own header comment says plain
# `node`, which is stale here; flagged separately rather than fixed in this
# script (out of WP-G2 scope).
step_run e2e_balance_sim node --import tsx tests/e2e/e2e_balance_sim.mjs

# 4. e2e_balance_report.mjs - balance-sim HTML dashboard check.
step_run e2e_balance_report node --import tsx tests/e2e/e2e_balance_report.mjs

# 5. e2e_walkthrough.mjs - single-seed active walkthrough (routine gate,
# not the release-gate sweep). Fixed seed 3, beginner mode.
step_run e2e_walkthrough node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner

# All steps complete; summary prints via EXIT trap. Exit 0 (no failures
# reach here -- failure paths exit 1 directly).
exit 0
