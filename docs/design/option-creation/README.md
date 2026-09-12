# Option creation concepts

Brainstorming mockups generated with the built-in image generation tool. These are proposed screens, not implemented UI.

## 01: Choose a starting point

Offer copying an existing option, creating a memory patch, or adding JSON settings. Copying creates a new editable definition even when the source is registered and read-only. Search results use existing catalog examples. The footer should say “Will be saved to your local option library” until creation succeeds; the generated image abbreviates that intent.

## 02: Edit and preview

Rename Comment to Option name. Replace the additional-writes JSON textarea with a sequence of editable rows. Provide keyboard-accessible move controls in addition to drag handles. Show one placement dropdown for default placement, game initialization, or after relic writes, preserving current assembly semantics. Reveal per-write addresses and advanced JSON without discarding unrecognized properties. In JSON mode, replace the write editor with an object editor and explain that matching top-level values are replaced, not recursively merged.

Preview the option card and its write count/order, with expandable generated JSON. Validation describes format only, not verified gameplay behavior. A separate checkbox controls whether the newly created library option is also selected in this preset. Keep the footer visible while editor content scrolls.

The five values in the second mockup come from the existing ITS OVER 9000 Mode catalog entry. Row notes are illustrative author annotations. Creating an option does not infer gameplay effects from arbitrary write values.

These improvements still assume patch knowledge for new memory writes. A later layer of curated recipes could expose familiar inputs such as starting-stat values, using verified encoders for each supported recipe.

## Generation prompts

Generated using the built-in tool, without reference-image inputs; palette and layout were informed by the current source and repository screenshot.

### Image 1

Use case: ui-mockup
Asset type: high-fidelity desktop app UX concept, first screen of option creation in SOTN Preset Generator.
Create a polished, realistic flat UI screenshot, landscape 1536x1024, exceptionally clear legible text, no perspective or device frame. Existing aesthetic: background #090b0e, surfaces #101318 and #161a20, borders #252b34, white #f2f4f7, muted #8d96a5, warm gold #efb34f. Inter-like sans serif. Restrained thin line icons. No fantasy illustration.
Full application title bar reads "SOTN Preset Generator". Main content is a spacious centered wide dialog with gold small eyebrow "NEW OPTION", title "How would you like to start?", subtitle "Create a reusable option for your local presets." Close X in upper right.
Three horizontally arranged choice cards: selected gold border card with copy icon, "Copy an existing option", small gold "Recommended" pill and helper "Use a working option as your starting point."; second card chip icon, "Memory patch", helper "Create one or more custom writes."; third card braces icon, "JSON settings", helper "Merge settings into the preset.".
Under cards section heading "Choose an option to copy", search input containing "stats". Show two tasteful list results with radio circles: selected "ITS OVER 9000 Mode", helper "All stats to 99", badges "Gameplay" and "5 writes"; unselected "Humble Beginnings", helper "Stats at 1, health and mana at 20", badges "Challenge Modifiers" and "9 writes".
Below results muted sentence "Your copy is editable. The original stays unchanged."
Sticky bottom footer inside dialog: left "Saved to your local option library"; right secondary "Cancel" and gold primary "Continue →".
Outside dialog at bottom of image small editorial caption "CONCEPT 01 / START WITH SOMETHING FAMILIAR".
Composition generous margins, clear hierarchy, usable desktop sizes, clean visual alignment, sufficient readable text contrast. This is a proposed interface, not the current product. Do not add technical JSON fields or extra content on this starting screen.

### Image 2

Use case: ui-mockup
Asset type: high-fidelity desktop app UX concept, second screen of option creation in SOTN Preset Generator.
Create polished realistic flat UI screenshot, landscape 1536x1024, sharp legible text, no perspective or device frame. Existing aesthetic background #090b0e, surfaces #101318 and #161a20, border #252b34, white #f2f4f7, muted #8d96a5, warm gold #efb34f, subtle green #65d397 for syntax status only. Inter-like sans serif with monospace hex. No fantasy art.
Top application title "SOTN Preset Generator". Wide centered dialog using most of screen, heading gold eyebrow "NEW OPTION", title "Make it your own", muted subtitle "Copied from ITS OVER 9000 Mode". Back arrow at left and close X at right.
Two columns with 65% width editor and 35% preview, thin divider.
LEFT editor: name field label "Option name", value "My stat boost". Next row category dropdown "Gameplay" and compact selected mode pill "Memory patch". Description field with value "Start with all stats at 99."
Section heading "Writes" with small "5 writes" badge, helper "Writes run in the order shown." Then a compact table with headers "#", "Type", "Value", "Note". Exactly 5 rows, each with reorder grip, number, dropdown word, hex value, note, and delete icon:
1 word 0x34020063 "Load 99"
2 word 0xa0627bc0 "Stat write"
3 word 0xa0627bb8 "Stat write"
4 word 0xa0627bbc "Stat write"
5 word 0xa0627bc4 "Stat write"
Under table text button "+ Add write". Then placement control label "Write placement", dropdown selected "After relic writes", helper "Use this order for starting-stat changes." Collapsed disclosure "Advanced: addresses and JSON".
RIGHT: section heading "Option preview", card containing small "Gameplay" label, bold "My stat boost", helper "Start with all stats at 99.", unchecked checkbox at right. Below card section "What this adds", three simple lines "5 memory writes", "After relic writes", "Available to all local presets". Then collapsed disclosure "View generated JSON". Small green status with check icon "Write format looks valid", muted subtext "Game behavior still needs testing."
Sticky footer full dialog width separated by border. Left checkbox unselected with label "Also enable in this preset". Right secondary "Back" and gold primary "Create option".
Outside dialog bottom small editorial caption "CONCEPT 02 / EDIT WRITES WITHOUT HAND-WRITING JSON".
Ensure labels are legible, cohesive restrained charcoal-and-gold production-quality interface, no wizard stepper, no address required message, no invented game effect. This is a proposed interface.
