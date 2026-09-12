# Per-write address revision

The revised concept in `03-editor-with-addresses.png` supersedes the original editor layout. Every write has an always-visible optional Address input beside Value. The editing column is wider to fit hexadecimal values. Empty address fields remain omitted from the write data; existing addresses must be preserved. On narrower windows, each write can wrap into two lines while keeping its address visible. Only advanced JSON remains collapsed.

Generated with the built-in image generation tool using `02-editor.png` as the edit target. No application code changed.

## Exact edit prompt

Use case: ui-mockup
Edit target: supplied SOTN Preset Generator editor concept screenshot.
Update this high-fidelity desktop UI mockup to give EVERY individual write its own always-visible optional Address input. Preserve the charcoal-and-gold aesthetic, title, top metadata fields, five write values, note values, preview sidebar, placement control, sticky footer and all general visual style. This is a targeted layout revision.
Widen the left editing column slightly to approximately 72% of dialog width and narrow the preview to 28%, retaining legibility. In the Writes table, use these columns in order: reorder grip, #, Type, Value, Address (optional), Note, delete icon. Give BOTH Value and Address enough width for a complete 0x-prefixed eight-digit hexadecimal string in monospace without clipping. Use a compact Type dropdown. All five Address fields should be EMPTY with subtle placeholder "0x…" because this existing example uses unaddressed writes. Preserve exactly these values: 0x34020063, 0xa0627bc0, 0xa0627bb8, 0xa0627bbc, 0xa0627bc4. Notes remain Load 99 then Stat write on the next four rows.
The Address column header must clearly say "Address" with smaller "Optional" text underneath or beside it. All rows have the same controls with aligned columns and comfortable spacing. No address toggles or hidden address controls.
Change the bottom collapsed disclosure text from "Advanced: addresses and JSON" to "Advanced JSON". Keep the existing generated JSON disclosure in the right preview.
Preserve the five-write count, gold Create option button and checkbox "Also enable in this preset". Keep image flat, sharp, professional and text readable. No added decoration or editorial annotations. Output landscape image at least as readable as the original.
