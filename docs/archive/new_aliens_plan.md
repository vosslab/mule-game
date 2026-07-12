 # Plan: Rich outlined alien species SVGs

  ## Context

  Redesign the eight playable species as bold, colorful, outlined SVG creatures inspired by the repo-root Shape Aliens
  JPEGs. NES M.U.L.E. and Planet M.U.L.E. inform compact game-scale readability; the visual finish stays clean vector
  art rather than pixel art.

  ## Objectives

  - Deliver eight instantly distinct 32x32 alien silhouettes with expressive, colorful internal details.
  - Preserve species names, save values, symbol IDs, animation-frame APIs, player tinting, and every existing render
    surface.

  - Produce reproducible visual evidence for selection, gallery, overworld, town, and auction use.

  ## Design philosophy

  Use one large silhouette, a continuous bold outline, and 2-4 generously sized internal features per species.
  currentColor carries player identity across all supplied colors; shared palette accents create personality without
  weakening ownership recognition. This plan follows the repo principle Polish over expansion by making the existing
  eight species feel complete.

  ## Scope

  - Create a concise visual contract that maps each current species name to a new project-defined shape family:
      - Humanoid: helmeted antenna biped.
      - Gollumer: lumpy one-eyed blob.
      - Mechtron: wide robot with twin antennae.
      - Packer: pentagonal pack-beast with a large triangular eye.
      - Leggite: tall oval multi-leg walker.
      - Bonzoid: broad diamond-bodied alien with side arms.
      - Spheroid: round cyclops with short tentacles.
      - Flapper: triangular creature with wide wing fins.

  - Use the current species names as continuity authority, the attached JPEGs for shape-and-expression treatment, NES
    screens for compact archetypes, and Planet M.U.L.E. for in-world color/readability cues. Record this as a project
    visual decision rather than a claim of canonical species anatomy.

  - Add shared palette tokens for internal features and render all body-scale ownership regions through currentColor.
  - Expand the existing sprite gallery into the reproducible species visual matrix: 8 species, 4 shipped player
    colors, 2 backgrounds, plus a 16-frame motion strip.

  - Capture live title, overworld, town, and auction evidence at the supported 1200x750 and 1280x800 viewports.

  ## Non-goals

  - Keep species mechanics, player records, save data, selection flow, and player-color hex values on their current
    stable contracts.

  - Focus delivery on SVG art, visual fixtures, tests, and documentation.

  ## Current state summary

  The shared species module already provides 8 names, 16 symbol IDs, 32x32 viewBoxes, two-frame animation,
  currentColor tinting, a white halo, and a dark contour. The current gallery validates 8 species across 4 player
  colors; title, overworld, town, and auction all consume the shared symbols.

  ## Architecture boundaries and ownership

  sprites_species.ts owns creature anatomy and the stable symbol contract. palette.ts owns fixed internal-detail
  colors. sprite_gallery.ts owns exhaustive color/frame proof. A dedicated species-contract test owns structural
  assertions; visual-render and surface specs own live evidence.

  ### Mapping (milestones / workstreams -> components / patches)


 Proposed Plan


  # Plan: Rich outlined alien species SVGs

  ## Context

  Redesign the eight playable species as bold, colorful, outlined SVG creatures inspired by the repo-root Shape Aliens
  JPEGs. NES M.U.L.E. and Planet M.U.L.E. inform compact game-scale readability; the visual finish stays clean vector
  art rather than pixel art.

  ## Objectives

  - Deliver eight instantly distinct 32x32 alien silhouettes with expressive, colorful internal details.
  - Preserve species names, save values, symbol IDs, animation-frame APIs, player tinting, and every existing render
    surface.

  - Produce reproducible visual evidence for selection, gallery, overworld, town, and auction use.

  ## Design philosophy

  Use one large silhouette, a continuous bold outline, and 2-4 generously sized internal features per species.
  currentColor carries player identity across all supplied colors; shared palette accents create personality without
  weakening ownership recognition. This plan follows the repo principle Polish over expansion by making the existing
  eight species feel complete.

  ## Scope

  - Create a concise visual contract that maps each current species name to a new project-defined shape family:
      - Humanoid: helmeted antenna biped.
      - Gollumer: lumpy one-eyed blob.
      - Mechtron: wide robot with twin antennae.
      - Packer: pentagonal pack-beast with a large triangular eye.
      - Leggite: tall oval multi-leg walker.
      - Bonzoid: broad diamond-bodied alien with side arms.
      - Spheroid: round cyclops with short tentacles.
      - Flapper: triangular creature with wide wing fins.

  - Use the current species names as continuity authority, the attached JPEGs for shape-and-expression treatment, NES
    screens for compact archetypes, and Planet M.U.L.E. for in-world color/readability cues. Record this as a project
    visual decision rather than a claim of canonical species anatomy.

  - Add shared palette tokens for internal features and render all body-scale ownership regions through currentColor.
  - Expand the existing sprite gallery into the reproducible species visual matrix: 8 species, 4 shipped player
    colors, 2 backgrounds, plus a 16-frame motion strip.

  - Capture live title, overworld, town, and auction evidence at the supported 1200x750 and 1280x800 viewports.

  ## Non-goals

  - Keep species mechanics, player records, save data, selection flow, and player-color hex values on their current
    stable contracts.

  - Focus delivery on SVG art, visual fixtures, tests, and documentation.

  ## Current state summary

  The shared species module already provides 8 names, 16 symbol IDs, 32x32 viewBoxes, two-frame animation,
  currentColor tinting, a white halo, and a dark contour. The current gallery validates 8 species across 4 player
  colors; title, overworld, town, and auction all consume the shared symbols.

  ## Architecture boundaries and ownership

  sprites_species.ts owns creature anatomy and the stable symbol contract. palette.ts owns fixed internal-detail
  colors. sprite_gallery.ts owns exhaustive color/frame proof. A dedicated species-contract test owns structural
  assertions; visual-render and surface specs own live evidence.

  ### Mapping (milestones / workstreams -> components / patches)

   Milestone / Workstream    Component                            Expected patches
      
   M1 / WS-A                 Species visual contract and trial    1 right-sized patch
      
   M1 / WS-B                 Palette and visual matrix            1 right-sized patch
      
   M2 / WS-C                 Species SVG definitions              1-2 right-sized patches
      
   M2 / WS-D                 Species contract test                1 right-sized patch
      
   M3 / WS-E                 Surface capture and evaluation       1 right-sized patch
      
   M3 / WS-F                 Documentation close-out              1 right-sized patch

  ## Milestone plan

   M      Title                     Summary                                   Goal
        
   M1     Prove the art recipe      Compare representative creatures at       Lock outline, detail, and color rules
                                    real gameplay scale.                      with evidence.
        
   M2     Redraw the species set    Apply the proven recipe to all eight      Ship complete, recognizable alien SVGs.
                                    species.
        
   M3     Prove live readability    Capture every required consumer           Give the human reviewer a clear final
                                    surface.                                  approval package.

  ### Milestone M1: Prove the art recipe

  - Depends on: none.
  - Workstreams: WS-A, WS-B.
  - Entry criteria: current sprite and gallery contracts inspected.
  - Exit criteria:
      - The trial renders Gollumer, Mechtron, and Flapper: rounded, boxy, and winged/asymmetric representatives.
      - The trial compares the current 3px halo/1px contour recipe with a compact 2.5px halo/1px contour recipe at
        32x32.

      - The image evaluator records a rubric result; its selected recipe becomes the written implementation contract.
      - M2 begins from this evidence without awaiting final human release approval.

  - Parallel-plan ready: yes -- max parallel doers: 2.

  ### Milestone M2: Redraw the species set

  - Depends on: WP-A1 and WP-B1 -- the visual recipe and palette matrix define the shared contract.
  - Workstreams: WS-C, WS-D.
  - Entry criteria: M1 trial evidence meets its rubric.
  - Exit criteria:
      - All 16 existing symbol IDs render their redesigned species.
      - Every symbol preserves currentColor for its dominant ownership region and uses shared palette tokens for fixed
        internal details.

      - Type, palette, gallery, and selection checks pass.

  - Parallel-plan ready: yes -- max parallel doers: 2.

  ### Milestone M3: Prove live readability

  - Depends on: WP-C1 and WP-D1 -- completed art and structural coverage.
  - Workstreams: WS-E, WS-F.
  - Entry criteria: M2 gates pass.
  - Exit criteria:
      - The final visual package contains required screenshots and evaluator rubric results.
      - The human reviewer gives final approval from the recorded evidence.
      - Changelog and closure documentation record the selected recipe and evidence.

  - Parallel-plan ready: yes -- max parallel doers: 2.

  ## Workstream breakdown

  ### Workstream WS-A: Trial and visual contract

  - Owner: expert_coder.
  - Provides: source-of-truth mapping, outline/detail recipe, trial SVGs, and evaluator rubric inputs.
  - Expected patches: 1.

  ### Workstream WS-B: Palette and matrix fixture

  - Owner: coder.
  - Provides: internal-detail palette tokens and gallery matrix only.
  - Expected patches: 1.

  ### Workstream WS-C: Species SVG implementation

  - Owner: expert_coder.
  - Provides: redesigned sprites_species.ts symbols only.
  - Expected patches: 1-2.

  ### Workstream WS-D: Structural coverage

  - Owner: tester.
  - Provides: new species contract test only.
  - Expected patches: 1.

  ### Workstream WS-E: Surface evidence

  - Owner: playwright_operator with image_evaluator review.
  - Provides: deterministic captures and completed rubric.
  - Expected patches: 1.

  ### Workstream WS-F: Closure records

  - Owner: planner.
  - Provides: active-plan status, changelog entry, and archive note.
  - Expected patches: 1.

  ## Work packages

  ### Work package WP-A1: Run the representative art trial

  - Owner: expert_coder.
  - Touch points: species art plan and temporary trial section in the existing gallery.
  - Depends on: none.
  - Acceptance criteria:
      - Defines source mapping and the three reference roles: current-name continuity, JPEG shape language, M.U.L.E.
        compactness.

      - Evaluates both outline recipes on deep and terrain backgrounds at 32x32.
      - Uses this rubric: continuous silhouette boundary, face visible, 2-4 internal regions readable, ownership color
        dominant, and all three species distinguishable side-by-side.

  - Verification commands:
      - bash run_playwright_tests.sh tests/playwright/sprite_gallery.spec.mjs

  - Obvious follow-ons:
      - Record the selected recipe and apply it consistently to the full-set implementation brief.

  ### Work package WP-B1: Build the exhaustive species matrix

  - Owner: coder.
  - Touch points: src/ui/sprites/palette.ts, src/ui/sprites/sprite_gallery.ts.
  - Depends on: none.
  - Acceptance criteria:
      - Renders 64 static swatches: 8 species x 4 player colors x 2 backgrounds.
      - Renders all 16 animation frames in a separate labeled strip.
      - Uses shared palette tokens for fixed details and the existing player colors for ownership tint.

  - Verification commands:
      - node --test tests/test_sprite_palette.mjs
      - bash run_playwright_tests.sh tests/playwright/sprite_gallery.spec.mjs

  - Obvious follow-ons:
      - Keep gallery selectors stable and document new trial/matrix labels.

  ### Work package WP-C1: Redraw the complete species set

  - Owner: expert_coder.
  - Touch points: src/ui/sprites/sprites_species.ts.
  - Depends on: WP-A1, WP-B1.
  - Acceptance criteria:
      - Preserves the 8 current species values and 16 frame-specific symbol IDs.
      - Applies the M1 recipe to every new shape family.
      - Gives each frame pair one obvious motion cue: gait, bob, tentacle shift, arm shift, or wing shift.

  - Verification commands:
      - npx tsc --noEmit
      - node --test tests/test_sprite_palette.mjs

  - Obvious follow-ons:
      - Rerun the matrix and repair any clipped or indistinct feature before handoff.

  ### Work package WP-D1: Add a resilient species contract test

  - Owner: tester.
  - Touch points: new tests/test_species_sprite_contract.mjs.
  - Depends on: WP-A1.
  - Acceptance criteria:
      - Confirms every existing symbol ID resolves.
      - Confirms each symbol has a dominant currentColor ownership region.
      - Confirms fixed internal colors resolve from approved palette tokens.
      - Confirms all four shipped player colors remain represented in the gallery matrix.

  - Verification commands:
      - node --import tsx --test tests/test_species_sprite_contract.mjs
      - node --test tests/test_sprite_palette.mjs

  - Obvious follow-ons:
      - Keep assertions focused on the public visual contract rather than SVG path anatomy.

  ### Work package WP-E1: Capture and score every live surface

  - Owner: playwright_operator with image_evaluator review.
  - Touch points: tests/playwright/visual_render.spec.mjs and visual acceptance report.
  - Depends on: WP-C1, WP-D1.
  - Acceptance criteria:
      - Title: all 8 species appear in the picker and title gallery.
      - Gallery: all 8 species x 4 colors x 2 backgrounds plus 16 frames appear in one deterministic layout.
      - Overworld: player-0 avatar renders at actual 32x32 size.
      - Town: player-0 avatar renders at actual 32x32 size.
      - Auction: all four player colors and their species avatars render together.
      - Captures use 1200x750 and 1280x800, with the evaluator applying the M1 rubric to each required surface.

  - Verification commands:
      - bash run_playwright_tests.sh tests/playwright/sprite_gallery.spec.mjs tests/playwright/
        species_mode_select.spec.mjs

      - bash run_playwright_tests.sh tests/playwright/overworld_scene.spec.mjs tests/playwright/town_street.spec.mjs
        tests/playwright/auction_scene.spec.mjs

      - bash run_playwright_tests.sh tests/playwright/visual_render.spec.mjs

  - Obvious follow-ons:
      - File the image set and evaluator scorecard for human final approval.

  ### Work package WP-F1: Record closure evidence

  - Owner: planner.
  - Touch points: active plan, visual acceptance report, docs/CHANGELOG.md.
  - Depends on: WP-E1.
  - Acceptance criteria:
      - Records source mapping, selected outline recipe, test results, visual rubric, and human approval.

  - Verification commands:
      - source source_me.sh && pytest tests/test_markdown_links.py

  - Obvious follow-ons:
      - Move the completed plan to the archive and refresh relevant trackers.

  ## Acceptance criteria and gates

  - Per-patch gate: TypeScript compiles; palette checks pass; existing symbol IDs remain stable.
  - Trial gate: all three representative species pass the defined 32x32 rubric.
  - Integration gate: title, gallery, overworld, town, and auction Playwright checks pass.
  - Visual evidence gate: each required surface has a named capture at both supported viewports.
  - Release gate: the human reviewer approves the complete evidence package.

  ## Test and verification strategy

  - Structural tests verify the stable sprite contract, palette use, dominant ownership tint, and gallery matrix.
  - Browser tests verify symbol wiring through title, gallery, overworld, town, and auction.
  - Visual-render fixtures create repeatable screenshots without relying on a particular free-play state.
  - ./check_codebase.sh provides the final fast TypeScript gate; the Python Markdown command validates closure
    documentation.

  ## Migration and compatibility policy

  - The rollout replaces SVG markup behind existing symbol IDs.
  - Existing species values, player colors, saved games, and renderer imports remain stable.
  - The prior markup remains available in version history for rapid restoration.

  ## Risk register

   Risk                        Impact    Trigger                     Owner                  Mitigation
          
   Internal details compete    High      Player color loses          expert_coder           Use small shared-palette
   with ownership tint                   visual dominance                                   accents around a large
                                                                                            currentColor ownership
                                                                                            region
          
   Features lose clarity at    High      Trial or surface rubric     image_evaluator        Use the proven M1 contour
   32x32                                 identifies an unclear                              and feature budget
                                         species
          
   Parallel edits overlap      Medium    Gallery/test conflict       orchestrator           Maintain WS-B gallery
                                         during integration                                 ownership and WS-D new-
                                                                                            test-only ownership
          
   Surface proof misses a      High      Required capture or         playwright_operator    Use the WP-E1 surface
   consumer                              named command is absent                            checklist as release
                                                                                            evidence

  ## Rollout and release checklist

  - [ ] Complete the representative trial and record the selected recipe.
  - [ ] Land the palette/matrix, species, and structural-test patches.
  - [ ] Capture gallery, title, overworld, town, and auction evidence.
  - [ ] Pass TypeScript, Node, Playwright, and Python documentation gates.
  - [ ] Obtain human final visual approval from the rubric and screenshot package.

  ## Documentation close-out requirements

  - Active plan: record M1-M3 status and evaluator findings.
  - docs/CHANGELOG.md: record the new outlined species set and validation evidence.
  - Archive: preserve the selected visual contract and final approval record.

  ## Patch plan and reporting format

  - Patch 1: species visual trial and selected art contract.
  - Patch 2: palette accents and exhaustive gallery matrix.
  - Patch 3: redesigned species SVG definitions.
  - Patch 4: resilient sprite-contract coverage.
  - Patch 5: visual evidence and documentation closure.

  ## Open questions and decisions needed

  - None. The image evaluator supplies reproducible evidence; the human reviewer supplies final approval.
