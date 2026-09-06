import type { MetaExtension } from "./types";

/** Template-compatible extension data, reviewed 2026-09-06. See docs/relic-location-extensions.md.
 * These are check locations, not starting relics or accessibility/complexity rules.
 * Uses the confirmed Equipment check Broadsword; the guide-only Olrox Onyx is unresolved.
 */
export const RELIC_LOCATION_CHECK_SOURCES = Object.freeze([
  "https://www.symphonyrando.fun/locations",
  "https://www.symphonyrando.fun/presets"
]);

const classic = Object.freeze([
  "Soul of Bat",
  "Fire of Bat",
  "Echo of Bat",
  "Force of Echo",
  "Soul of Wolf",
  "Power of Wolf",
  "Skill of Wolf",
  "Form of Mist",
  "Power of Mist",
  "Gas Cloud",
  "Cube of Zoe",
  "Spirit Orb",
  "Gravity Boots",
  "Leap Stone",
  "Holy Symbol",
  "Faerie Scroll",
  "Jewel of Open",
  "Merman Statue",
  "Bat Card",
  "Ghost Card",
  "Faerie Card",
  "Demon Card",
  "Sword Card",
  "Heart of Vlad",
  "Tooth of Vlad",
  "Rib of Vlad",
  "Ring of Vlad",
  "Eye of Vlad",
  "Spike Breaker",
  "Gold ring",
  "Silver ring",
  "Holy glasses"
]);

const guardedAdditions = Object.freeze([
  "Crystal cloak",
  "Mormegil",
  "Dark Blade",
  "Ring of Arcana",
  "Trio"
]);

const guardedPlusAdditions = Object.freeze([
  "Badelaire",
  "Forbidden Library Opal"
]);

const equipmentAdditions = Object.freeze([
  "Holy mail",
  "Jewel sword",
  "Basilard",
  "Sunglasses",
  "Cloth cape",
  "Mystic pendant",
  "Ankh of Life",
  "Morningstar",
  "Goggles",
  "Silver plate",
  "Cutlass",
  "Platinum mail",
  "Falchion",
  "Gold plate",
  "Bekatowa",
  "Gladius",
  "Jewel knuckles",
  "Holy rod",
  "Library Onyx",
  "Bronze cuirass",
  "Alucart sword",
  "Broadsword",
  "Estoc",
  "Olrox Garnet",
  "Blood cloak",
  "Shield rod",
  "Knight shield",
  "Holy sword",
  "Bandanna",
  "Secret boots",
  "Nunchaku",
  "Knuckle duster",
  "Caverns Onyx",
  "Combat knife",
  "Ring of Ares",
  "Bloodstone",
  "Icebrand",
  "Walk armor",
  "Beryl circlet",
  "Talisman",
  "Katana",
  "Goddess shield",
  "Twilight cloak",
  "Talwar",
  "Sword of Dawn",
  "Bastard sword",
  "Royal cloak",
  "Lightning mail",
  "Moon rod",
  "Sunstone",
  "Luminus",
  "Dragon helm",
  "Shotel",
  "Staurolite",
  "Reverse Caverns Diamond",
  "Reverse Caverns Opal",
  "Reverse Caverns Garnet",
  "Osafune katana",
  "Alucard shield",
  "Alucard sword",
  "Necklace of J",
  "Floating Catacombs Diamond",
  "Sword of Hador",
  "Alucard mail",
  "Gram",
  "Fury plate"
]);

const scenicAdditions = Object.freeze([
  "Confessional",
  "Telescope",
  "Colosseum Green tea",
  "Clock Tower Cloaked knight",
  "Waterfall Cave",
  "Floating Catacombs Elixir",
  "Reverse Entrance Antivenom",
  "Reverse Forbidden Route",
  "Cave Life apple",
  "Reverse Colosseum Zircon",
  "Reverse Alucart Sword",
  "Black Marble Meal Ticket",
  "Reverse Keep High Potion"
]);

// Extended uses only these 19 Equipment additions, not the entire Equipment set.
// Silver plate follows the requested guide; upstream extension.js omits it.
const extendedEquipmentAdditions = Object.freeze([
  "Basilard",
  "Goggles",
  "Gold plate",
  "Bekatowa",
  "Mystic pendant",
  "Jewel knuckles",
  "Alucart sword",
  "Nunchaku",
  "Ring of Ares",
  "Beryl circlet",
  "Katana",
  "Twilight cloak",
  "Platinum mail",
  "Silver plate",
  "Moon rod",
  "Luminus",
  "Reverse Caverns Opal",
  "Osafune katana",
  "Gram"
]);

const guarded = Object.freeze([...classic, ...guardedAdditions]);
const guardedPlus = Object.freeze([...guarded, ...guardedPlusAdditions]);
const equipment = Object.freeze([...guardedPlus, ...equipmentAdditions]);

/** Complete lists, including inherited checks. No dependence on template lock order. */
export const RELIC_LOCATION_CHECKS: Readonly<Record<MetaExtension, readonly string[]>> = Object.freeze({
  Classic: classic,
  Guarded: guarded,
  GuardedPlus: guardedPlus,
  Equipment: equipment,
  Scenic: Object.freeze([...equipment, ...scenicAdditions]),
  Extended: Object.freeze([...guardedPlus, ...extendedEquipmentAdditions, ...scenicAdditions])
});
