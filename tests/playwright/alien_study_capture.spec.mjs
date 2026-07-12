import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";

const SPECIES_ENTRY = path.join(REPO_ROOT, "src", "ui", "sprites", "sprites_species.ts");
const BUNDLE_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alien-study-d-bundle-"));
const BUNDLE_OUT_FILE = path.join(BUNDLE_OUT_DIR, "sprites_species_bundle.js");
const MODULE_GLOBAL_NAME = "AlienStudySpeciesModule";
const OUTPUT_PATH = "/private/tmp/mule-alien-study-D/contact-sheet.png";

const STUDY_SPECIES = [
  { name: "gollumer", label: "GOLLUMER" },
  { name: "mechtron", label: "MECHTRON" },
  { name: "flapper", label: "FLAPPER" },
];

const PLAYER_COLORS = [
  { label: "CORAL", value: "#ff5a5f" },
  { label: "CYAN", value: "#4fd8ff" },
  { label: "GREEN", value: "#3aaa18" },
  { label: "PINK", value: "#f872e8" },
];

const BACKGROUNDS = [
  { label: "D", value: "#1a1a2e" },
  { label: "T", value: "#7c9a4e" },
];

test.beforeAll(() => {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  execFileSync("npx", [
    "esbuild",
    SPECIES_ENTRY,
    "--bundle",
    "--format=iife",
    `--global-name=${MODULE_GLOBAL_NAME}`,
    "--target=es2020",
    "--platform=browser",
    `--outfile=${BUNDLE_OUT_FILE}`,
  ]);
});

test("capture Candidate D alien study at true 32px scale", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 560 });
  await page.goto("/");
  await page.addScriptTag({ path: BUNDLE_OUT_FILE });

  const frameIds = await page.evaluate(
    ({ backgrounds, globalName, playerColors, studySpecies }) => {
      const speciesModule = window[globalName];
      const container = document.createElement("section");
      const cellSize = 32;
      const gridColumns = `88px repeat(${playerColors.length * backgrounds.length}, ${cellSize}px)`;
      container.id = "alien-study-d-contact-sheet";
      container.setAttribute("aria-label", "Candidate D alien SVG contact sheet at actual 32 pixel scale");
      container.style.background = "#1a1a2e";
      container.style.border = "2px solid #4a4a68";
      container.style.boxSizing = "border-box";
      container.style.color = "#e6e6e6";
      container.style.display = "inline-flex";
      container.style.flexDirection = "column";
      container.style.fontFamily = "monospace";
      container.style.gap = "8px";
      container.style.padding = "12px";

      const title = document.createElement("div");
      title.textContent = "ALIEN SVG STUDY D / TRUE 32PX / D=DEEP T=TERRAIN";
      title.style.color = "#ffd23f";
      title.style.fontSize = "11px";
      title.style.fontWeight = "700";
      container.appendChild(title);

      const colorLegend = document.createElement("div");
      colorLegend.style.display = "flex";
      colorLegend.style.gap = "12px";
      for (const playerColor of playerColors) {
        const legendItem = document.createElement("span");
        legendItem.textContent = playerColor.label;
        legendItem.style.color = playerColor.value;
        legendItem.style.fontSize = "9px";
        legendItem.style.fontWeight = "700";
        colorLegend.appendChild(legendItem);
      }
      container.appendChild(colorLegend);

      const groupHeaders = document.createElement("div");
      groupHeaders.style.display = "grid";
      groupHeaders.style.gridTemplateColumns = gridColumns;
      groupHeaders.style.columnGap = "4px";
      groupHeaders.style.height = "12px";
      groupHeaders.appendChild(document.createElement("span"));
      for (const playerColor of playerColors) {
        const header = document.createElement("span");
        header.textContent = playerColor.label;
        header.style.color = playerColor.value;
        header.style.fontSize = "8px";
        header.style.fontWeight = "700";
        header.style.gridColumn = "span 2";
        header.style.textAlign = "center";
        groupHeaders.appendChild(header);
      }
      container.appendChild(groupHeaders);

      const subHeaders = document.createElement("div");
      subHeaders.style.display = "grid";
      subHeaders.style.gridTemplateColumns = gridColumns;
      subHeaders.style.columnGap = "4px";
      subHeaders.style.height = "12px";
      subHeaders.appendChild(document.createElement("span"));
      for (const playerColor of playerColors) {
        for (const background of backgrounds) {
          const header = document.createElement("span");
          header.textContent = background.label;
          header.style.color = "#e6e6e6";
          header.style.fontSize = "9px";
          header.style.textAlign = "center";
          subHeaders.appendChild(header);
        }
      }
      container.appendChild(subHeaders);

      const sheet = document.createElement("div");
      sheet.style.display = "grid";
      sheet.style.gridTemplateColumns = gridColumns;
      sheet.style.columnGap = "4px";
      sheet.style.rowGap = "4px";
      const frameIds = [];
      for (const candidateSpecies of studySpecies) {
        for (const frame of [1, 2]) {
          const rowLabel = document.createElement("div");
          rowLabel.textContent = `${candidateSpecies.label} F${frame}`;
          rowLabel.style.alignItems = "center";
          rowLabel.style.color = "#e6e6e6";
          rowLabel.style.display = "flex";
          rowLabel.style.fontSize = "10px";
          rowLabel.style.fontWeight = "700";
          rowLabel.style.height = `${cellSize}px`;
          sheet.appendChild(rowLabel);
          for (const playerColor of playerColors) {
            for (const background of backgrounds) {
              const frameId = speciesModule.speciesSymbolId(candidateSpecies.name, frame);
              const cell = document.createElementNS("http://www.w3.org/2000/svg", "svg");
              cell.setAttribute("data-alien-study-cell", `${frameId}-${playerColor.label}-${background.label}`);
              cell.setAttribute("height", String(cellSize));
              cell.setAttribute("viewBox", "0 0 32 32");
              cell.setAttribute("width", String(cellSize));
              cell.innerHTML = `<rect width="32" height="32" fill="${background.value}" /><use href="#${frameId}" style="color: ${playerColor.value}" />`;
              sheet.appendChild(cell);
              frameIds.push(frameId);
            }
          }
        }
      }
      const defsHost = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      defsHost.setAttribute("aria-hidden", "true");
      defsHost.setAttribute("height", "0");
      defsHost.setAttribute("width", "0");
      defsHost.style.position = "absolute";
      defsHost.innerHTML = speciesModule.buildSpeciesSpriteDefsMarkup();
      container.appendChild(defsHost);
      container.appendChild(sheet);
      document.body.appendChild(container);
      return frameIds;
    },
    {
      backgrounds: BACKGROUNDS,
      globalName: MODULE_GLOBAL_NAME,
      playerColors: PLAYER_COLORS,
      studySpecies: STUDY_SPECIES,
    },
  );

  await expect(page.locator("[data-alien-study-cell]")).toHaveCount(48);
  await page.locator("#alien-study-d-contact-sheet").screenshot({ path: OUTPUT_PATH });
  expect(new Set(frameIds)).toEqual(
    new Set([
      "sprite-species-gollumer-frame1",
      "sprite-species-gollumer-frame2",
      "sprite-species-mechtron-frame1",
      "sprite-species-mechtron-frame2",
      "sprite-species-flapper-frame1",
      "sprite-species-flapper-frame2",
    ]),
  );
  expect(fs.existsSync(OUTPUT_PATH)).toBeTruthy();
  console.log(`CAPTURE OK: ${OUTPUT_PATH}`);
});
