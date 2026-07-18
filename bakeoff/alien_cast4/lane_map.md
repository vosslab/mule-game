# Round 4 lane map

JUDGE: for a blind read, look at the casts before this table.

Model-per-lane is the round-4 diversity variable. All six lanes received the identical
dispatch prompt ([dispatch_prompt.md](dispatch_prompt.md)) and the identical contract
([../../docs/ALIEN_ART_CONTRACT.md](../../docs/ALIEN_ART_CONTRACT.md)). The model is the
only INTENTIONALLY varied dispatch condition; sampling variation and each lane's
self-chosen persona also shape the result.

| Artist dir | Model |
| --- | --- |
| artist_1 | claude-opus-4-6 |
| artist_2 | claude-opus-4-7 |
| artist_3 | claude-opus-4-8 |
| artist_4 | claude-sonnet-4-6 |
| artist_5 | claude-sonnet-5 |
| artist_6 | claude-fable-5 (7 of 9: flapper + mule not drawn) |

artist_6 note: the fable-5 lane hit repeated tool-less headless sessions on retry and was the
round's cost sink, so it was capped at the 7 species its one good run produced. flapper.svg and
mule.svg are intentionally left undrawn rather than finished in another model's hand, keeping
the lane a pure fable-5 read.
