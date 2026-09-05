WITH seed_options(comment, category, type, value) AS (
  VALUES
    ('Enable Soul of Bat', 'relics', 'word', '0xa0627964'),
    ('Enable Fire of Bat', 'relics', 'word', '0xa0627965'),
    ('Enable Echo of Bat', 'relics', 'word', '0xa0627966'),
    ('Enable Force of Echo', 'relics', 'word', '0xa0627967'),
    ('Enable Soul of Wolf', 'relics', 'word', '0xa0627968'),
    ('Enable Power of Wolf', 'relics', 'word', '0xa0627969'),
    ('Enable Skill of Wolf', 'relics', 'word', '0xa062796a'),
    ('Enable Form of Mist', 'relics', 'word', '0xa062796b'),
    ('Enable Power of Mist', 'relics', 'word', '0xa062796c'),
    ('Enable Gas Cloud', 'relics', 'word', '0xa062796d'),
    ('Enable Cube of Zoe', 'relics', 'word', '0xa062796e'),
    ('Enable Spirit Orb', 'relics', 'word', '0xa062796f'),
    ('Enable Gravity Boots', 'relics', 'word', '0xa0627970'),
    ('Enable Leap Stone', 'relics', 'word', '0xa0627971'),
    ('Enable Holy Symbol', 'relics', 'word', '0xa0627972'),
    ('Enable Faerie Scroll', 'relics', 'word', '0xa0627973'),
    ('Enable Jewel of Open', 'relics', 'word', '0xa0627974'),
    ('Enable Merman Statue', 'relics', 'word', '0xa0627975'),
    ('Enable Bat Card', 'relics', 'word', '0xa0627976'),
    ('Enable Ghost Card', 'relics', 'word', '0xa0627977'),
    ('Enable Faerie Card', 'relics', 'word', '0xa0627978'),
    ('Enable Demon Card', 'relics', 'word', '0xa0627979'),
    ('Enable Sword Card', 'relics', 'word', '0xa062797a'),
    ('Enable Sprite Card', 'relics', 'word', '0xa062797b'),
    ('Enable Nosedevil Card', 'relics', 'word', '0xa062797c'),
    ('Enable Heart of Vlad', 'relics', 'word', '0xa062797d'),
    ('Enable Tooth of Vlad', 'relics', 'word', '0xa062797e'),
    ('Enable Rib of Vlad', 'relics', 'word', '0xa062797f'),
    ('Enable Ring of Vlad', 'relics', 'word', '0xa0627980'),
    ('Enable Eye of Vlad', 'relics', 'word', '0xa0627981')
)
INSERT INTO options (comment, category, type, value)
SELECT seed.comment, seed.category, seed.type, seed.value
FROM seed_options AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM options AS existing
  WHERE existing.comment = seed.comment
);
