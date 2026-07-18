# Alien cast round 4 dispatch

Round 4 of the alien art bake-off. Six artists receive this identical brief and work
independently; the human maintainer judges the finished casts side by side. Recognizably
different casts are the goal of the round -- a convergent round carries no decision
information.

## Your task

1. Read `docs/ALIEN_ART_CONTRACT.md` (version 2) end to end. It is the source of truth: it
   states WHO the nine creatures are, the two written artifacts you commit to before drawing
   (the cast-level design hypothesis and the nine creature-level interpretations), and the few
   technical rules the pipeline needs. Everything it leaves open is yours to decide.
2. Write both artifacts before drawing, then draw to your own words. Output locations for
   this round: the nine creature interpretations go in `interpretations.md` in your artist
   directory; the design hypothesis opens every SVG file as its XML comment, per the contract.
3. Draw all nine creatures to the contract's file schema: the eight species on
   `viewBox="0 0 200 320"` and the mule on `viewBox="0 0 320 200"`. Write each to your artist
   directory (named in your dispatch message) as `<species>.svg` and `mule.svg`.
4. Verify your work:
   - `xmllint --noout <file>` on all nine files.
   - `source source_me.sh && python3 devel/lint_alien_svg.py -i <file>` on the eight species
     files (the lint has no mule mode yet; the mule is covered by xmllint plus the render).
   - `node devel/render_alien_sheet.mjs <file>` for each creature, then judge the renders at
     the SMALL sizes, in all four player colors, on all three backgrounds.
   - The silhouette lineup: each creature reads as a different being from the other eight in
     the black shape alone.
5. Finish with a short report: your persona, your hypothesis, and anything you would flag for
   the judge.

## Creative latitude (maintainer's words)

Treat the specification as a source of inspiration, not a script. Provide a unique
interpretation while remaining faithful to the core requirements. Exercise creative judgment
where the specification leaves room for interpretation. Favor distinctive, non-obvious
solutions over conventional ones when they satisfy the requirements. Where multiple valid
solutions exist, choose one that is interesting, cohesive, and well-justified.
