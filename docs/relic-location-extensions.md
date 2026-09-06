# Relic location checks by extension

Reference checked on 2026-09-06 against the [Locations guide](https://www.symphonyrando.fun/locations). Inheritance follows the same site's [extension descriptions](https://www.symphonyrando.fun/presets).

These are full check lists, including inherited locations, not just each extension's additions. They describe locations to check, not which relic can be placed there or how to access them. Preset-specific fixed placements and exclusions may still apply.

The reusable export is `RELIC_LOCATION_CHECKS` in `src/renderer/relic-location-checks.ts`, keyed by the app's six `MetaExtension` values. Preview and export filter the template's checks by the selected extension, then apply starting-relic lock adjustments. Each rebuild starts from the original template. Raw JSON lock overrides are filtered too; they cannot change the selected extension. Complexity still uses the template locks through Trio.

## Composition

| Extension | Composition | Checks |
| --- | --- | ---: |
| Classic | 28 relic checks plus four progression-equipment checks | 32 |
| Guarded | Classic + five guarded checks | 37 |
| GuardedPlus | Guarded + Badelaire and Forbidden Library Opal | 39 |
| Equipment | GuardedPlus + 66 equipment checks | 105 |
| Extended | GuardedPlus + 19 selected equipment checks + 13 scenic-only checks | 71 |
| Scenic | Equipment + 13 scenic-only checks | 118 |

“All” in the guide is represented by the Classic/common set, including Gold ring, Silver ring, Spike Breaker, and Holy glasses. Inclusion does not imply random placement: for example, the guide describes O.G. as keeping those four items in their original locations.

## Naming and source differences

Names use the existing template's spelling/capitalization when there is a matching check. Generic guide labels such as Green Tea, High Potion, and Meal Ticket are qualified with their area to match the template.

- **Telescope:** included in Extended and Scenic. Added to the template from the local randomizer's `presets/battle-mage.json` entry with `locks: []` (no requirements). Battle Mage-specific `block` restrictions were not copied.
- **Broadsword / Olrox Onyx:** the executable lists use Broadsword, a confirmed Equipment check in the local randomizer's `src/extension.js` and the template. The guide instead lists Olrox Onyx, which has no preset lock entry. That unresolved guide name is excluded; equivalence between the two names is not assumed.
- **Crystal cloak:** included in every extension except Classic through inheritance. Its individual guide entry uses the older Spread name and omits Extended/Scenic; the site's extension descriptions establish the inherited membership.
- **Holy sword:** included in Equipment/Scenic as listed by the guide and present in the template, but absent from upstream `extension.js`.
- **Silver plate:** included in Extended per the guide. Upstream `extension.js` includes it only in Equipment, leaving 18 instead of the guide's 19 selected equipment additions.
- **Older terminology:** Spread corresponds to GuardedPlus; Tourist corresponds to Scenic in the site's Extended description.

The upstream cross-check was [the randomizer's extension definitions](https://github.com/sotnrando/sotnrando/blob/master/src/extension.js). The exported lists follow the requested guide's membership with the template-compatible Broadsword correction above. Source differences remain documented.

### Local repository template audit

On 2026-09-06, compared `locations/data.json` and all four `extensions/*.json` files in the local `sotnrando` checkout with the template. `extended.json` and `wanderer.json` each define 32 custom locations; `scenic.json` and `tourist.json` each define 13. Their union has 32 unique names, and Telescope was the only name absent from the template. All 32 are now covered.

The display-oriented `locations/data.json` also contains Olrox Onyx. No matching lock entry was found anywhere in `presets/*.json`, so it remains unresolved and was not added. Other differently named display entries refer to existing area-qualified checks or Vlad boss checks. The template's existing entries were preserved.

Regression coverage records the 32 extension location names locally, checks their presence in the template, and verifies that Telescope stays unrestricted for each starting-flight option. Tests do not require the neighboring repository.

## Complete lists

### Classic (32)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses

### Guarded (37)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses
- Crystal cloak
- Mormegil
- Dark Blade
- Ring of Arcana
- Trio

### GuardedPlus (39)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses
- Crystal cloak
- Mormegil
- Dark Blade
- Ring of Arcana
- Trio
- Badelaire
- Forbidden Library Opal

### Equipment (105)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses
- Crystal cloak
- Mormegil
- Dark Blade
- Ring of Arcana
- Trio
- Badelaire
- Forbidden Library Opal
- Holy mail
- Jewel sword
- Basilard
- Sunglasses
- Cloth cape
- Mystic pendant
- Ankh of Life
- Morningstar
- Goggles
- Silver plate
- Cutlass
- Platinum mail
- Falchion
- Gold plate
- Bekatowa
- Gladius
- Jewel knuckles
- Holy rod
- Library Onyx
- Bronze cuirass
- Alucart sword
- Broadsword
- Estoc
- Olrox Garnet
- Blood cloak
- Shield rod
- Knight shield
- Holy sword
- Bandanna
- Secret boots
- Nunchaku
- Knuckle duster
- Caverns Onyx
- Combat knife
- Ring of Ares
- Bloodstone
- Icebrand
- Walk armor
- Beryl circlet
- Talisman
- Katana
- Goddess shield
- Twilight cloak
- Talwar
- Sword of Dawn
- Bastard sword
- Royal cloak
- Lightning mail
- Moon rod
- Sunstone
- Luminus
- Dragon helm
- Shotel
- Staurolite
- Reverse Caverns Diamond
- Reverse Caverns Opal
- Reverse Caverns Garnet
- Osafune katana
- Alucard shield
- Alucard sword
- Necklace of J
- Floating Catacombs Diamond
- Sword of Hador
- Alucard mail
- Gram
- Fury plate

### Extended (71)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses
- Crystal cloak
- Mormegil
- Dark Blade
- Ring of Arcana
- Trio
- Badelaire
- Forbidden Library Opal
- Basilard
- Goggles
- Gold plate
- Bekatowa
- Mystic pendant
- Jewel knuckles
- Alucart sword
- Nunchaku
- Ring of Ares
- Beryl circlet
- Katana
- Twilight cloak
- Platinum mail
- Silver plate
- Moon rod
- Luminus
- Reverse Caverns Opal
- Osafune katana
- Gram
- Confessional
- Telescope
- Colosseum Green tea
- Clock Tower Cloaked knight
- Waterfall Cave
- Floating Catacombs Elixir
- Reverse Entrance Antivenom
- Reverse Forbidden Route
- Cave Life apple
- Reverse Colosseum Zircon
- Reverse Alucart Sword
- Black Marble Meal Ticket
- Reverse Keep High Potion

### Scenic (118)

- Soul of Bat
- Fire of Bat
- Echo of Bat
- Force of Echo
- Soul of Wolf
- Power of Wolf
- Skill of Wolf
- Form of Mist
- Power of Mist
- Gas Cloud
- Cube of Zoe
- Spirit Orb
- Gravity Boots
- Leap Stone
- Holy Symbol
- Faerie Scroll
- Jewel of Open
- Merman Statue
- Bat Card
- Ghost Card
- Faerie Card
- Demon Card
- Sword Card
- Heart of Vlad
- Tooth of Vlad
- Rib of Vlad
- Ring of Vlad
- Eye of Vlad
- Spike Breaker
- Gold ring
- Silver ring
- Holy glasses
- Crystal cloak
- Mormegil
- Dark Blade
- Ring of Arcana
- Trio
- Badelaire
- Forbidden Library Opal
- Holy mail
- Jewel sword
- Basilard
- Sunglasses
- Cloth cape
- Mystic pendant
- Ankh of Life
- Morningstar
- Goggles
- Silver plate
- Cutlass
- Platinum mail
- Falchion
- Gold plate
- Bekatowa
- Gladius
- Jewel knuckles
- Holy rod
- Library Onyx
- Bronze cuirass
- Alucart sword
- Broadsword
- Estoc
- Olrox Garnet
- Blood cloak
- Shield rod
- Knight shield
- Holy sword
- Bandanna
- Secret boots
- Nunchaku
- Knuckle duster
- Caverns Onyx
- Combat knife
- Ring of Ares
- Bloodstone
- Icebrand
- Walk armor
- Beryl circlet
- Talisman
- Katana
- Goddess shield
- Twilight cloak
- Talwar
- Sword of Dawn
- Bastard sword
- Royal cloak
- Lightning mail
- Moon rod
- Sunstone
- Luminus
- Dragon helm
- Shotel
- Staurolite
- Reverse Caverns Diamond
- Reverse Caverns Opal
- Reverse Caverns Garnet
- Osafune katana
- Alucard shield
- Alucard sword
- Necklace of J
- Floating Catacombs Diamond
- Sword of Hador
- Alucard mail
- Gram
- Fury plate
- Confessional
- Telescope
- Colosseum Green tea
- Clock Tower Cloaked knight
- Waterfall Cave
- Floating Catacombs Elixir
- Reverse Entrance Antivenom
- Reverse Forbidden Route
- Cave Life apple
- Reverse Colosseum Zircon
- Reverse Alucart Sword
- Black Marble Meal Ticket
- Reverse Keep High Potion
