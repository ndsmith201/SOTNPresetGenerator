# SOTN preset JSON format

This reference was inferred from all 73 JSON files in `sotnrando/presets` and checked against `PresetBuilder.fromJSON` in `sotnrando/src/util.js`.

## Core shape

Every preset has a `metadata` object. All other top-level properties are optional overrides. A preset may inherit an existing preset and change only the settings it needs.

```json
{
  "metadata": {},
  "inherits": "casual",
  "complexityGoal": {},
  "optionalSetting": true,
  "optionalStructuredSection": []
}
```

Use `templates/preset-template.json` as the minimal editable starting point.

## Metadata

All 73 presets contain these fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, filename-style identifier such as `grand-tour`. |
| `name` | string | Display name. |
| `description` | string | User-facing explanation. |
| `author` | string[] | One or more author names. |
| `weight` | number | Ordering/selection weight; existing presets mostly use negative values. |
| `knowledgeCheck` | string | Commonly `None`; otherwise describes required knowledge. |
| `metaExtension` | string | Common values: `Guarded`, `Scenic`, `Extended`, `GuardedPlus`, `Equipment`, `Classic`. |
| `metaComplexity` | string | Usually a numeric string. Two existing presets use a number, but a string is the consistent form. |
| `itemStats` | string | Usually `Normal` or `Randomized`. |
| `timeFrame` | string | Commonly `Very Fast`, `Fast`, `Normal`, `Slow`, or `Super Slow`. |
| `moddedLevel` | string | Commonly `None`, `Slightly`, `Moderately`, or `Heavily`. |
| `castleType` | string | Usually `Normal` or `Modded`. |
| `transformEarly` | string | `Yes` or `No`. |
| `transformFocus` | string | Commonly `None`, `Bat`, `Mist`, `Wolf`, or `All`. |
| `winCondition` | string | Human-readable win-condition category. |
| `defaultGoal` | string | Goal code; normally `default`. |
| `compatibleGoals` | string[] | Supported goal codes. |
| `listSortFlag` | string[] | Commonly `Normal`, `Evergreen`, `Tournament`, `New`, or `Deprecated`. |

## Inheritance and complexity

`inherits` is optional. Existing bases include `casual`, `safe`, `open`, `nimble`, and `nimble-lite`.

```json
{
  "inherits": "casual",
  "complexityGoal": {
    "min": 1,
    "max": 9,
    "goals": [
      "Soul of Bat + Form of Mist",
      "Gravity Boots + Leap Stone"
    ]
  }
}
```

`complexityGoal.max` is optional. Within a lock string, `+` means all named abilities/items are required. Multiple strings in the `goals` array are alternatives.

## Simple settings

These observed top-level settings are booleans unless noted:

```json
{
  "relicLocations": true,
  "preventLeaks": false,
  "stats": false,
  "thrustSwordAbility": true,
  "music": false,
  "antiFreezeMode": true,
  "fastwarpMode": true,
  "magicmaxMode": true,
  "mypurseMode": true,
  "unlockedMode": true,
  "noprologueMode": true,
  "surpriseMode": true,
  "iwsMode": true,
  "enemyStatRandoMode": true,
  "shopPriceRandoMode": true,
  "startRoomRandoMode": true,
  "startRoomRando2ndMode": true,
  "rlbcMode": true,
  "immunityPotionMode": true,
  "godspeedMode": true,
  "libraryShortcut": true,
  "singleHitGearMode": true,
  "revCastleTeleportRando": true,
  "zeroDollarRelicMode": true,
  "openClockStatueMode": true,
  "spikeRoomRando": true,
  "cornucopiaMode": true,
  "elemChaosMode": true,
  "itemNameRandoMode": true,
  "colorrandoMode": true,
  "turkeyMode": true,
  "newGoalsSet": "a",
  "startStatRandoMode": 1
}
```

Only emit a setting when the preset should override its inherited value. Explicit `false` is meaningful.

`relicLocationsExtension` is either `false` or a lowercase extension name such as `guarded`, `guardedplus`, `equipment`, `scenic`, or `extended`.

## Structured sections

### Aliases

Each alias has an `alias` and one source selector. The parser recognizes `zone`, `enemy`, `relic`, `location`, and `item` selectors.

```json
{
  "alias": [
    { "zone": "NO3", "alias": "Entrance" },
    { "relic": "Leap Stone", "alias": "Double Jump" }
  ]
}
```

### Relics and goals

```json
{
  "placeRelic": [
    { "location": "Leap Stone", "relic": "Soul of Wolf" },
    { "location": "Form of Mist", "relic": ["Soul of Bat", "Form of Mist", null] }
  ],
  "replaceRelic": [
    { "relic": "Sprite Card", "item": "Duplicator" }
  ],
  "goalItem": [
    { "item": "Gold ring", "alias": "Gold Key" }
  ]
}
```

### Location logic

```json
{
  "lockLocation": [
    {
      "location": "Soul of Bat",
      "locks": [
        "Form of Mist + Gravity Boots",
        "Soul of Bat"
      ],
      "escapeRequires": [
        "Soul of Wolf",
        "Form of Mist + Power of Mist"
      ],
      "block": [
        "Jewel of Open"
      ]
    }
  ]
}
```

`comment` is documentation only. Some source presets contain `comments`, but the parser does not consume that spelling.

### Item placement and blocking

```json
{
  "itemLocations": [
    {
      "zone": "NO0",
      "item": "Big heart",
      "index": 16,
      "replacement": "Stopwatch"
    }
  ],
  "blockItems": [
    {
      "zone": "*",
      "item": "*",
      "replacement": ["Crissaegrim"]
    }
  ]
}
```

`itemLocations` may instead be a boolean. `replacement` may be a string or string array. `index` is optional.

### Equipment

```json
{
  "startingEquipment": [
    { "slot": "Right hand", "item": "Crissaegrim" },
    { "slot": "Head", "item": "Beryl circlet" }
  ],
  "blockEquipment": [
    { "slot": "Other", "item": ["Duplicator"] }
  ]
}
```

`startingEquipment` may instead be `false`. Observed slots are `Right hand`, `Left hand`, `Head`, `Body`, `Cloak`, `Other`, `AxeArmor`, and `Luck Mode`. Item values may be a string, string array, or `null` where supported by the builder.

### Drops and rewards

```json
{
  "enemyDrops": [
    { "enemy": "Warg", "items": ["$400", "Combat knife"] },
    { "enemy": "Merman", "level": 3, "items": ["Duplicator"] }
  ],
  "blockDrops": [
    { "enemy": "Bat", "items": ["Crissaegrim"] }
  ],
  "prologueRewards": [
    { "item": "Heart Refresh", "replacement": "Banana" }
  ],
  "blockRewards": [
    { "item": "Potion", "replacement": ["Library card"] }
  ]
}
```

`enemyDrops` and `prologueRewards` may instead be booleans. The `level` selector is optional.

### Raw writes

```json
{
  "writes": [
    {
      "address": "0x00158c30",
      "type": "word",
      "value": "0x3c028004",
      "comment": "Description of the patch"
    },
    {
      "type": "word",
      "value": "0x9045925d"
    }
  ]
}
```

Supported parser types are `char`, `short`, `word`, `long`, and `string`. After an entry supplies `address`, later entries may omit it and continue from the previous write. Raw writes should be treated as an advanced feature.

## Important normalization rules

- Do not emit duplicate object keys. `sample.json` contains duplicate `writes` and `comment` keys; standard JSON parsing silently keeps only the final value.
- Preserve the exact spelling and capitalization of game zones, relics, items, enemies, and equipment slots unless an alias is declared.
- Omit unused optional sections instead of filling them with placeholder values.
- Do not emit `null` for general settings. `null` is only observed in specific item/relic placement values.
- Keep `metadata.id` filename-safe and aligned with the preset filename.

## Observed compatibility exceptions

Five top-level keys occur in the 73 source files but are not read by the current `PresetBuilder.fromJSON` implementation:

- `comment` (documentation only)
- `colorRando` (distinct from the consumed `colorrandoMode` spelling)
- `lockLocationAllowed`
- `relicName`
- `tournamentMode`

The generator should preserve these keys when importing an existing preset, but should not present them as active generated settings unless the loading path is extended or another consumer is confirmed.

Conversely, the parser recognizes several settings that none of the 73 current presets use: `betterCrossMode`, `bossMusicSeparation`, `brawnySwordMode`, `darkEIFMode`, `easyMode`, `forbRouteShortMode`, `fourBeastMode`, `instantDeathMode`, `levelOneMode`, `lycanMode`, `maxMasaMode`, `nimbleLiteMode`, `seasonalPhrasesMode`, `trapDoorMode`, and `warlockMode`.
