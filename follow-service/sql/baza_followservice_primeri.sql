USE follow_service;

-- 1. Scenario: Uspešno zapraćivanje (Javni profil ili prihvaćen zahtev)
INSERT INTO follows (follower_id, following_id, status) 
VALUES (1, 2, 'ACCEPTED');

-- 2. Scenario: Zahtev na čekanju (Privatni profil)
INSERT INTO follows (follower_id, following_id, status) 
VALUES (2, 3, 'PENDING');

-- 3. Scenario: Višestruki pratioci
INSERT INTO follows (follower_id, following_id, status) 
VALUES (4, 2, 'ACCEPTED');

-- 4. Scenario: Blokiranje
-- Korisnik 5 je blokirao korisnika 1.
INSERT INTO blocks (blocker_id, blocked_id) 
VALUES (5, 1);

-- 5. Scenario: Blokiranje onoga koga već pratiš
-- Korisnik 1 blokira korisnika 2 (iako ga prati). 
INSERT INTO blocks (blocker_id, blocked_id) 
VALUES (1, 2);
