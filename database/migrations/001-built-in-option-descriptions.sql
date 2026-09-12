-- Reviewed built-in descriptions. Only update matching registered entries.
-- The startup migration runner supplies the transaction and records completion.

UPDATE options SET description = 'Death won''t take Alucard''s gear'
WHERE id = 31 AND comment = 'Death goes home' AND read_only = 1;

UPDATE options SET description = 'Health set to 0 so taking any damage will cause a game over'
WHERE id = 32 AND comment = 'One Hit Death' AND read_only = 1;

UPDATE options SET description = 'Alucard will have the poisoned status permanently'
WHERE id = 33 AND comment = 'Permanent Poison' AND read_only = 1;

UPDATE options SET description = 'All spells available to Alucard in human form are disabled'
WHERE id = 34 AND comment = 'No (Alucard) Spells' AND read_only = 1;

UPDATE options SET description = 'Fully disable bat wingsmash spell'
WHERE id = 35 AND comment = 'Disable Wingsmash' AND read_only = 1;

UPDATE options SET description = 'Bat wingsmash spell doesnt need to be re-entered to keep going'
WHERE id = 36 AND comment = 'Infinite Wingsmash' AND read_only = 1;

UPDATE options SET description = 'Force of Echo hits every enemy on screen'
WHERE id = 37 AND comment = 'Full Screen Force of Echo' AND read_only = 1;

UPDATE options SET description = 'Reduced wolf transform/charge/collision mana cost'
WHERE id = 38 AND comment = 'Lycan Wolf Mana Costs' AND read_only = 1;

UPDATE options SET description = 'Wingsmash no longer consumes MP'
WHERE id = 39 AND comment = '0 Mana Wingsmash' AND read_only = 1;

UPDATE options SET description = 'Gravity jump no longer consumes MP'
WHERE id = 40 AND comment = '0 Mana Gravity Jump' AND read_only = 1;

UPDATE options SET description = 'Opens all of the 1st castle teleporters'
WHERE id = 41 AND comment = 'Unlocked 1st Castle Teleporters' AND read_only = 1;

UPDATE options SET description = 'Opens 2nd castle teleporters'
WHERE id = 42 AND comment = 'Unlocked 2nd Castle Teleporters' AND read_only = 1;

UPDATE options SET description = 'Alucard starts with no equipment'
WHERE id = 43 AND comment = 'Naked Mode' AND read_only = 1;

UPDATE options SET description = 'Sets all of Alucard''s stats to 99'
WHERE id = 44 AND comment = 'ITS OVER 9000 Mode' AND read_only = 1;

UPDATE options SET description = 'Reduced mana costs for Alucard spells'
WHERE id = 46 AND comment = 'Warlock Spell Costs' AND read_only = 1;

UPDATE options SET description = 'Opens Alchemy Lab Cannon, Attic Stairs, Colosseum to Royal Chapel, Outer Wall Elevator, Forbidden Route'
WHERE id = 48 AND comment = 'Open Non-Complexity Altering Shortcuts' AND read_only = 1;
