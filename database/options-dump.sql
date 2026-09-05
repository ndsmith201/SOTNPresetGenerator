PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
  category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
  type TEXT NOT NULL CHECK (type IN ('char', 'short', 'word', 'long', 'string')),
  value TEXT NOT NULL CHECK (length(trim(value)) > 0),
  address TEXT CHECK (address IS NULL OR length(trim(address)) > 0),
  additional_writes_json TEXT CHECK (
    additional_writes_json IS NULL OR
    (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1)),
  raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1))
);

CREATE TABLE write_options (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge')),
  injected_writes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(injected_writes_json)),
  appended_writes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(appended_writes_json)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO options
  (id, comment, category, type, value, address, additional_writes_json, created_at, updated_at, game_init, raw_json)
VALUES
  (1, 'Enable Soul of Bat', 'relics', 'word', '0xa0627964', NULL, NULL, '2026-09-04 16:49:24', '2026-09-04 17:01:32', 0, 0),
  (2, 'Enable Fire of Bat', 'relics', 'word', '0xa0627965', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (3, 'Enable Echo of Bat', 'relics', 'word', '0xa0627966', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (4, 'Enable Force of Echo', 'relics', 'word', '0xa0627967', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (5, 'Enable Soul of Wolf', 'relics', 'word', '0xa0627968', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (6, 'Enable Power of Wolf', 'relics', 'word', '0xa0627969', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (7, 'Enable Skill of Wolf', 'relics', 'word', '0xa062796a', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (8, 'Enable Form of Mist', 'relics', 'word', '0xa062796b', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (9, 'Enable Power of Mist', 'relics', 'word', '0xa062796c', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (10, 'Enable Gas Cloud', 'relics', 'word', '0xa062796d', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (11, 'Enable Cube of Zoe', 'relics', 'word', '0xa062796e', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (12, 'Enable Spirit Orb', 'relics', 'word', '0xa062796f', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (13, 'Enable Gravity Boots', 'relics', 'word', '0xa0627970', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (14, 'Enable Leap Stone', 'relics', 'word', '0xa0627971', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (15, 'Enable Holy Symbol', 'relics', 'word', '0xa0627972', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (16, 'Enable Faerie Scroll', 'relics', 'word', '0xa0627973', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (17, 'Enable Jewel of Open', 'relics', 'word', '0xa0627974', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (18, 'Enable Merman Statue', 'relics', 'word', '0xa0627975', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (19, 'Enable Bat Card', 'relics', 'word', '0xa0627976', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (20, 'Enable Ghost Card', 'relics', 'word', '0xa0627977', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (21, 'Enable Faerie Card', 'relics', 'word', '0xa0627978', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (22, 'Enable Demon Card', 'relics', 'word', '0xa0627979', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (23, 'Enable Sword Card', 'relics', 'word', '0xa062797a', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (24, 'Enable Sprite Card', 'relics', 'word', '0xa062797b', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (25, 'Enable Nosedevil Card', 'relics', 'word', '0xa062797c', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (26, 'Enable Heart of Vlad', 'relics', 'word', '0xa062797d', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (27, 'Enable Tooth of Vlad', 'relics', 'word', '0xa062797e', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (28, 'Enable Rib of Vlad', 'relics', 'word', '0xa062797f', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (29, 'Enable Ring of Vlad', 'relics', 'word', '0xa0627980', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (30, 'Enable Eye of Vlad', 'relics', 'word', '0xa0627981', NULL, NULL, '2026-09-04 17:01:32', '2026-09-04 17:01:32', 0, 0),
  (31, 'Death goes home', 'world', 'word', '0x18000006', '0x4BAEA08', NULL, '2026-09-04 17:43:05', '2026-09-04 17:43:05', 0, 0),
  (32, 'One Hit Death', 'challenge', 'word', '0x080288B1', '0x10B17C', '[{"type":"word","value":"0x00000000"},{"type":"word","value":"0x0C04296F","address":"0xAE2AC"},{"type":"word","value":"0x00000000"},{"type":"word","value":"0x3C088009"},{"type":"word","value":"0xA5007BA0"},{"type":"word","value":"0x0803CC4F"},{"type":"word","value":"0x00000000"}]', '2026-09-04 18:28:59', '2026-09-04 18:28:59', 0, 0),
  (33, 'Permanent Poison', 'challenge', 'word', '0x34040000', '0x127604', '[{"type":"word","value":"0x0C03F6C6"},{"type":"word","value":"0x34050FFF"},{"type":"word","value":"0x3C050016"},{"type":"word","value":"0x34A5002C"},{"type":"word","value":"0x3C048007"},{"type":"word","value":"0x8C84C3B8"},{"type":"word","value":"0x00003021"},{"type":"word","value":"0x3C018007"},{"type":"word","value":"0xA4222F00"},{"type":"word","value":"0x34028164"},{"type":"word","value":"0x0C046ABF"},{"type":"word","value":"0x00000000"},{"type":"word","value":"0x08042EFE"},{"type":"word","value":"0x00000000"}]', '2026-09-04 18:39:17', '2026-09-04 18:39:17', 0, 0),
  (34, 'No (Human) Spells', 'challenge', 'char', '0xFF', '0x000b5260', '[{"type":"char","value":"0xFF","address":"0x000b5244"},{"type":"char","value":"0xFF","address":"0x000b527c"},{"type":"char","value":"0xFF","address":"0x000b5298"},{"type":"char","value":"0xFF","address":"0x000b52d0"}]', '2026-09-04 18:59:58', '2026-09-04 18:59:58', 0, 0),
  (35, 'No Wingsmash', 'challenge', 'char', '0xFF', '0x000b52ec', NULL, '2026-09-04 19:10:41', '2026-09-04 19:10:41', 0, 0),
  (36, 'Infinite Wingsmash', 'gameplay', 'char', '0x00', '0x0134074', NULL, '2026-09-04 19:11:18', '2026-09-04 19:11:18', 0, 0),
  (37, 'Full Screen Force of Echo', 'gameplay', 'char', '0xfe', '0x0014c8bc', '[{"type":"char","address":"0x0014c8c4","value":"0xf0"}]', '2026-09-04 19:13:22', '2026-09-04 19:13:22', 0, 0),
  (38, 'Lycan Wolf Mana Costs', 'gameplay', 'short', '0x0000', '0x00118cc8', '[{"type":"char","address":"0x000b53b0","value":"0x01"}]', '2026-09-04 19:16:28', '2026-09-04 19:16:28', 0, 0),
  (39, '0 Mana Wingsmash', 'gameplay', 'char', '0x00', '0x000b52ec', NULL, '2026-09-04 19:18:18', '2026-09-04 19:18:18', 0, 0),
  (40, '0 Mana Gravity Jump', 'gameplay', 'short', '0x0000', '0x118D3C', NULL, '2026-09-04 19:19:09', '2026-09-04 19:19:09', 0, 0),
  (41, 'Unlocked 1st Castle Teleporters', 'world', 'word', '0x3402001F', NULL, '[{"type":"word","value":"0xa062BEBC"}]', '2026-09-04 20:42:15', '2026-09-04 20:42:15', 1, 0),
  (42, 'Unlocked 2nd Castle Teleporters', 'world', 'word', '0xa062BEBD', NULL, NULL, '2026-09-04 20:52:31', '2026-09-04 20:52:31', 1, 0),
  (43, 'Naked Mode', 'challenge', 'word', '{"startingEquipment": [{
    "slot": "Right hand",
    "item": null
  }, {
    "slot": "Left hand",
    "item": null
  }, {
    "slot": "Head",
    "item": null
  }, {
    "slot": "Body",
    "item": null
  }, {
    "slot": "Cloak",
    "item": null
  }, {
    "slot": "Other",
    "item": null
  }]}', NULL, NULL, '2026-09-04 21:41:46', '2026-09-04 21:41:46', 0, 1);

DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence (name, seq) VALUES ('options', 43);

CREATE INDEX options_category_type_idx
  ON options (category, type, comment);

CREATE INDEX write_options_category_idx
  ON write_options (category, label);

COMMIT;
