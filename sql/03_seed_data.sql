-- =====================================================================
-- CivicSense - File 03 : Seed data (DML)
-- Minimum 8 rows in every table.
-- Complaints deliberately include near-duplicates worded DIFFERENTLY,
-- so that vector search finds what keyword search cannot.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DEPARTMENTS (8 rows)
-- ---------------------------------------------------------------------
INSERT INTO departments (dept_name, contact_email) VALUES
('Roads and Infrastructure', 'roads@citycorp.gov.in'),
('Water Supply',             'water@citycorp.gov.in'),
('Sanitation and Waste',     'sanitation@citycorp.gov.in'),
('Street Lighting',          'lighting@citycorp.gov.in'),
('Drainage and Sewerage',    'drainage@citycorp.gov.in'),
('Parks and Horticulture',   'parks@citycorp.gov.in'),
('Public Health',            'health@citycorp.gov.in'),
('Traffic and Transport',    'traffic@citycorp.gov.in');

-- ---------------------------------------------------------------------
-- WARDS (12 rows)
-- 12 wards, not 6 - otherwise every ward trips the density threshold
-- and the hotspot feature looks broken during the demo.
-- ---------------------------------------------------------------------
INSERT INTO wards (ward_number, ward_name, zone) VALUES
(11, 'Jayanagar',     'SOUTH'),
(12, 'Koramangala',   'SOUTH'),
(13, 'Indiranagar',   'EAST'),
(14, 'Malleshwaram',  'WEST'),
(15, 'Basavanagudi',  'SOUTH'),
(16, 'Rajajinagar',   'WEST'),
(17, 'Whitefield',    'EAST'),
(18, 'HSR Layout',    'SOUTH'),
(19, 'Banashankari',  'SOUTH'),
(20, 'Yelahanka',     'NORTH'),
(21, 'Hebbal',        'NORTH'),
(22, 'BTM Layout',    'CENTRAL');

-- ---------------------------------------------------------------------
-- USERS (24 rows : 15 citizens, 8 staff, 1 admin)
-- password_hash values are bcrypt digests - never plain text.
-- ---------------------------------------------------------------------
INSERT INTO users (name, email, phone, password_hash, role) VALUES
-- citizens
('Aadarsh Reddy',      'aadarsh.r@example.com',   '9845012301', '$2b$12$KmP9xQvL3nRtYwZa8cHdUeJfGh2iMnBvCxSdEr4TyUiOpAsDfGhJk', 'CITIZEN'),
('Priya Nair',         'priya.nair@example.com',  '9845012302', '$2b$12$LnQ0yRwM4oSuZxAb9dIeVfKgHi3jNoCwDySfFs5UzVjPqBtEgHiKl', 'CITIZEN'),
('Rahul Menon',        'rahul.m@example.com',     '9845012303', '$2b$12$MoR1zSxN5pTvAyBc0eJfWgLhIj4kOpDxEzTgGt6VaWkQrCuFhIjLm', 'CITIZEN'),
('Sneha Kulkarni',     'sneha.k@example.com',     '9845012304', '$2b$12$NpS2aTyO6qUwBzCd1fKgXhMiJk5lPqEyFaUhHu7WbXlRsDvGiJkMn', 'CITIZEN'),
('Imran Shaikh',       'imran.s@example.com',     '9845012305', '$2b$12$OqT3bUzP7rVxCaDe2gLhYiNjKl6mQrFzGbViIv8XcYmStEwHjKlNo', 'CITIZEN'),
('Deepa Rao',          'deepa.rao@example.com',   '9845012306', '$2b$12$PrU4cVaQ8sWyDbEf3hMiZjOkLm7nRsGaHcWjJw9YdZnTuFxIkLmOp', 'CITIZEN'),
('Karthik Iyer',       'karthik.i@example.com',   '9845012307', '$2b$12$QsV5dWbR9tXzEcFg4iNjAkPlMn8oStHbIdXkKx0ZeAoUvGyJlMnPq', 'CITIZEN'),
('Ananya Gupta',       'ananya.g@example.com',    '9845012308', '$2b$12$RtW6eXcS0uYaFdGh5jOkBlQmNo9pTuIcJeYlLy1AfBpVwHzKmNoQr', 'CITIZEN'),
('Vikram Singh',       'vikram.s@example.com',    '9845012309', '$2b$12$SuX7fYdT1vZbGeHi6kPlCmRnOp0qUvJdKfZmMz2BgCqWxIaLnOpRs', 'CITIZEN'),
('Meera Pillai',       'meera.p@example.com',     '9845012310', '$2b$12$TvY8gZeU2waChFij7lQmDnSoPq1rVwKeLgAnNa3ChDrXyJbMoPqSt', 'CITIZEN'),
('Arjun Desai',        'arjun.d@example.com',     '9845012311', '$2b$12$UwZ9haFV3xbDiGjk8mRnEoTpQr2sWxLfMhBoOb4DiEsYzKcNpQrTu', 'CITIZEN'),
('Lakshmi Prasad',     'lakshmi.p@example.com',   '9845012312', '$2b$12$VxA0ibGW4ycEjHkl9nSoFpUqRs3tXyMgNiCpPc5EjFtZaLdOqRsUv', 'CITIZEN'),
('Nitin Joshi',        'nitin.j@example.com',     '9845012313', '$2b$12$WyB1jcHX5zdFkIlm0oTpGqVrSt4uYzNhOjDqQd6FkGuAbMePrStVw', 'CITIZEN'),
('Fatima Begum',       'fatima.b@example.com',    '9845012314', '$2b$12$XzC2kdIY6aeGlJmn1pUqHrWsTu5vAaOiPkErRe7GlHvBcNfQsTuWx', 'CITIZEN'),
('Sanjay Kumar',       'sanjay.k@example.com',    '9845012315', '$2b$12$YaD3leJZ7bfHmKno2qVrIsXtUv6wBbPjQlFsSf8HmIwCdOgRtUvXy', 'CITIZEN'),
-- staff
('Ramesh Gowda',       'ramesh.g@citycorp.gov.in','9845090001', '$2b$12$ZbE4mfKa8cgInLop3rWsJtYuVw7xCcQkRmGtTg9InJxDePhSuVwYz', 'STAFF'),
('Sunitha Devi',       'sunitha.d@citycorp.gov.in','9845090002','$2b$12$AcF5ngLb9dhJoMpq4sXtKuZvWx8yDdRlSnHuUh0JoKyEfQiTvWxZa', 'STAFF'),
('Prakash Shetty',     'prakash.s@citycorp.gov.in','9845090003','$2b$12$BdG6ohMc0eiKpNqr5tYuLvAwXy9zEeSmToIvVi1KpLzFgRjUwXyAb', 'STAFF'),
('Nagaraj Hegde',      'nagaraj.h@citycorp.gov.in','9845090004','$2b$12$CeH7piNd1fjLqOrs6uZvMwBxYz0aFfTnUpJwWj2LqMaGhSkVxYzBc', 'STAFF'),
('Asha Krishnan',      'asha.k@citycorp.gov.in',  '9845090005','$2b$12$DfI8qjOe2gkMrPst7vAwNxCyZa1bGgUoVqKxXk3MrNbHiTlWyZaCd', 'STAFF'),
('Mahesh Patil',       'mahesh.p@citycorp.gov.in','9845090006','$2b$12$EgJ9rkPf3hlNsQtu8wBxOyDzAb2cHhVpWrLyYl4NsOcIjUmXzAbDe', 'STAFF'),
('Vani Shankar',       'vani.s@citycorp.gov.in',  '9845090007','$2b$12$FhK0slQg4imOtRuv9xCyPzEaBc3dIiWqXsMzZm5OtPdJkVnYaBcEf', 'STAFF'),
('Girish Bhat',        'girish.b@citycorp.gov.in','9845090008','$2b$12$GiL1tmRh5jnPuSvw0yDzQaFbCd4eJjXrYtNaAn6PuQeKlWoZbCdFg', 'STAFF'),
-- admin
('Corporation Admin',  'admin@citycorp.gov.in',   '9845099999','$2b$12$HjM2unSi6koQvTwx1zEaRbGcDe5fKkYsZuObBo7QvRfLmXpAcDeGh', 'ADMIN');

-- ---------------------------------------------------------------------
-- STAFF (8 rows) - one officer per department
-- ---------------------------------------------------------------------
INSERT INTO staff (user_id, dept_id, designation, joined_on) VALUES
(16, 1, 'Assistant Engineer',        DATE '2021-06-14'),
(17, 2, 'Junior Engineer',           DATE '2022-01-10'),
(18, 3, 'Sanitary Inspector',        DATE '2020-09-01'),
(19, 4, 'Electrical Supervisor',     DATE '2023-03-20'),
(20, 5, 'Drainage Engineer',         DATE '2019-11-05'),
(21, 6, 'Horticulture Officer',      DATE '2022-07-18'),
(22, 7, 'Health Officer',            DATE '2021-02-25'),
(23, 8, 'Traffic Warden Supervisor', DATE '2023-08-09');

-- ---------------------------------------------------------------------
-- COMPLAINT_CATEGORIES (8 rows)
-- ---------------------------------------------------------------------
INSERT INTO complaint_categories
      (category_name, sla_hours, default_dept_id, density_window_days, density_threshold) VALUES
('Pothole / Road Damage',  72, 1, 14, 4),
('Water Leakage',          24, 2, 14, 3),
('Garbage Collection',     48, 3, 7,  4),
('Street Light Outage',    96, 4, 21, 4),
('Blocked Drain',          36, 5, 14, 3),
('Park Maintenance',      168, 6, 30, 3),
('Stray Animal Menace',   120, 7, 30, 3),
('Illegal Parking',        48, 8, 14, 4);

-- ---------------------------------------------------------------------
-- COMPLAINTS (24 rows)
-- Inserted with status OPEN. Duplicates are linked afterwards by
-- CALL merge_duplicate_complaint(...) so the transaction is exercised.
--
-- NOTE the wording inside each cluster: the same real-world issue is
-- described with almost no shared vocabulary. That is the whole point.
-- ---------------------------------------------------------------------

-- ---- CLUSTER A : one pothole, Jayanagar, three different descriptions
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Big hole near the bus stop',
 'There is a large crater on the road right beside the bus stand. Autos are almost tipping over when they drive across it, especially in the evening rush.',
 1, 1, 1, 1, TIMESTAMP '2026-10-14 09:12:00'),
('Damaged road surface by bus stand',
 'The tarmac in front of the bus shelter has broken apart badly over the last month. Two wheelers keep skidding on the loose gravel there.',
 2, 1, 1, 1, TIMESTAMP '2026-10-16 18:40:00'),
('Carriageway caved in close to the shelter',
 'A section of the road has collapsed near the bus shelter. It fills with water and nobody can judge how deep it is after dark. Very dangerous.',
 3, 1, 1, 1, TIMESTAMP '2026-10-18 07:55:00');

-- ---- CLUSTER B : one dead street light, Indiranagar, three descriptions
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Street light not working',
 'The light pole standing right outside my gate has not switched on for over a week now. The rest of the road is fine, only this one is out.',
 4, 3, 4, 4, TIMESTAMP '2026-10-12 20:05:00'),
('Dark stretch near the park at night',
 'The entire road running beside the park is pitch black after sunset. Walking back from the bus stop feels genuinely unsafe for women and elderly.',
 5, 3, 4, 4, TIMESTAMP '2026-10-15 21:30:00'),
('Lamp post has stopped glowing',
 'The lamp on the corner junction has gone completely dead. That whole patch is unlit and shopkeepers are closing early because of it.',
 6, 3, 4, 4, TIMESTAMP '2026-10-17 19:15:00');

-- ---- CLUSTER C : one burst pipe, Koramangala, two descriptions
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Water gushing out of the pipeline',
 'There is continuous water flowing from a broken pipe near the junction. Enormous wastage, it has been running non stop since yesterday morning.',
 7, 2, 2, 2, TIMESTAMP '2026-10-20 06:20:00'),
('Pipe burst flooding the lane',
 'A main line has cracked open and the whole lane is submerged. Residents cannot step out without wading through ankle deep water.',
 8, 2, 2, 2, TIMESTAMP '2026-10-20 11:45:00');

-- ---- CLUSTER D : uncollected garbage, HSR Layout, two descriptions
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Garbage not collected for days',
 'The waste has not been picked up from our street for well over a week. The smell is unbearable and it is right next to a school gate.',
 9, 8, 3, 3, TIMESTAMP '2026-10-21 08:00:00'),
('Trash piling up at the street corner',
 'Rubbish keeps accumulating at the corner of our road. Stray dogs tear the bags open every night and scatter it across the footpath.',
10, 8, 3, 3, TIMESTAMP '2026-10-22 17:25:00');

-- ---- DENSITY SET : four DISTINCT potholes in Rajajinagar
-- Different locations, genuinely separate issues. Crosses the category
-- density threshold of 4 and trips the hotspot trigger.
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Pothole outside the post office',
 'Deep pothole has formed directly outside the post office entrance on the main road. Cars slow down abruptly and it is causing jams.',
11, 6, 1, 1, TIMESTAMP '2026-10-13 10:00:00'),
('Broken road near the market gate',
 'The stretch leading to the vegetable market gate is full of loose stones and craters after the last spell of rain.',
12, 6, 1, 1, TIMESTAMP '2026-10-16 12:30:00'),
('Sunken patch on the school road',
 'A patch of road in front of the primary school has sunk by almost six inches. Children crossing there are at real risk.',
13, 6, 1, 1, TIMESTAMP '2026-10-19 08:45:00'),
('Road surface broken near the temple',
 'The approach road to the temple has completely given way on one side. Two wheelers are swerving into oncoming traffic to avoid it.',
14, 6, 1, 1, TIMESTAMP '2026-10-23 16:10:00');

-- ---- SINGLETONS spread across wards and categories
INSERT INTO complaints (title, description, filed_by, ward_id, category_id, routed_dept_id, created_at) VALUES
('Drain overflowing onto the footpath',
 'The storm water drain at the end of our lane is completely choked. Dirty water is spilling onto the footpath and into the compound.',
15, 4, 5, 5, TIMESTAMP '2026-10-11 14:20:00'),
('Sewage smell near residential block',
 'There is a persistent sewage smell around the residential block. We suspect a blockage in the underground line somewhere nearby.',
 1, 5, 5, 5, TIMESTAMP '2026-10-13 09:30:00'),
('Park benches damaged and unusable',
 'Most of the benches in the neighbourhood park are broken. Senior citizens who walk there every morning have nowhere to sit.',
 2, 9, 6, 6, TIMESTAMP '2026-10-09 07:10:00'),
('Overgrown shrubs blocking the walking track',
 'The walking track in the park is heavily overgrown on both sides. Half the track width is unusable and snakes have been spotted.',
 3, 9, 6, 6, TIMESTAMP '2026-10-14 06:50:00'),
('Stray dog pack near the school gate',
 'A pack of stray dogs has settled near the school gate. They chase children in the morning and parents are genuinely worried.',
 4, 7, 7, 7, TIMESTAMP '2026-10-15 08:20:00'),
('Vehicles parked on the footpath daily',
 'Cars are parked across the entire footpath outside the commercial complex every single day, forcing pedestrians onto the road.',
 5,10, 8, 8, TIMESTAMP '2026-10-17 11:00:00'),
('Tanker water not supplied this week',
 'Our area has not received the scheduled tanker supply for the past five days. Borewell level has dropped and we are running dry.',
 6,11, 2, 2, TIMESTAMP '2026-10-18 13:40:00'),
('Garbage truck skipping our lane',
 'The collection vehicle enters the main road but never turns into our lane. This has been going on for almost three weeks.',
 7,12, 3, 3, TIMESTAMP '2026-10-19 09:05:00'),
('Street light flickering all night',
 'The pole near the water tank flickers continuously through the night. It is not fully dead but the flicker is extremely disturbing.',
 8,10, 4, 4, TIMESTAMP '2026-10-20 22:10:00'),
('Pothole at the ring road junction',
 'A wide pothole has opened up right at the ring road junction. During peak hours it is slowing down the entire signal cycle.',
 9, 7, 1, 1, TIMESTAMP '2026-10-21 07:35:00');

-- ---------------------------------------------------------------------
-- MERGE DUPLICATES (exercises the stored procedure + transaction)
-- Child, parent, similarity score, acting officer.
--
-- The similarity values below are ILLUSTRATIVE placeholders so the
-- schema is demonstrable before embeddings exist. `npm run embed`
-- (civicsense-web/scripts/embed.mjs, also run by `npm run reset`)
-- then replaces them with the real cosine similarity from pgvector.
-- ---------------------------------------------------------------------
CALL merge_duplicate_complaint(2,  1, 0.8412, 24);   -- bus stand pothole
CALL merge_duplicate_complaint(3,  2, 0.7968, 24);   -- merged into #2,
                                                     -- which is itself a
                                                     -- duplicate of #1, so the
                                                     -- cluster is a 2-deep chain
CALL merge_duplicate_complaint(5,  4, 0.7731, 24);   -- dead street light
CALL merge_duplicate_complaint(6,  4, 0.8205, 24);
CALL merge_duplicate_complaint(8,  7, 0.8677, 24);   -- burst pipe
CALL merge_duplicate_complaint(10, 9, 0.8043, 24);   -- uncollected garbage

-- ---------------------------------------------------------------------
-- ENDORSEMENTS (29 rows here, plus the ones the merges add) - fires trg_endorse_count on every row
-- ---------------------------------------------------------------------
INSERT INTO endorsements (user_id, complaint_id, comment) VALUES
( 4, 1, 'I nearly fell here last Tuesday.'),
( 5, 1, 'Same spot, my scooter bottomed out.'),
( 6, 1, 'Please fix before the rains worsen it.'),
( 7, 1, NULL),
( 8, 1, 'Autos refuse to go past this stretch now.'),
(11, 1, NULL),
(12, 1, 'Third time I am reporting this area.'),
( 1, 4, 'Whole lane is dark, confirming.'),
( 2, 4, NULL),
( 3, 4, 'Unsafe for anyone walking after 7pm.'),
(11, 4, NULL),
(12, 4, 'Shopkeepers have been complaining too.'),
( 1, 7, 'Water has been running for two days straight.'),
( 2, 7, NULL),
( 3, 7, 'Massive wastage, please send someone.'),
( 4, 7, NULL),
( 1, 9, 'Smell is terrible near the school.'),
( 2, 9, NULL),
( 3, 9, 'Dogs scatter it every night.'),
(13, 11, 'Confirming, jams every morning.'),
(14, 11, NULL),
(15, 13, 'My child crosses here daily, very risky.'),
( 1, 13, NULL),
( 2, 15, 'Same drain, overflowing again.'),
( 5, 19, 'The dogs chased my daughter last week.'),
( 6, 19, NULL),
( 9, 22, 'Our lane is skipped as well.'),
(10, 24, 'Signal backs up because of this pothole.'),
(11, 24, 'Same junction, and it is getting wider.');

-- ---------------------------------------------------------------------
-- WORK PROGRESS - status updates fire trg_log_status
-- ---------------------------------------------------------------------
UPDATE complaints SET status = 'IN_PROGRESS', handled_by = 1 WHERE complaint_id = 1;
UPDATE complaints SET status = 'IN_PROGRESS', handled_by = 4 WHERE complaint_id = 4;
UPDATE complaints SET status = 'IN_PROGRESS', handled_by = 2 WHERE complaint_id = 7;
UPDATE complaints SET status = 'IN_PROGRESS', handled_by = 3 WHERE complaint_id = 9;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 5 WHERE complaint_id = 15;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 5 WHERE complaint_id = 16;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 6 WHERE complaint_id = 17;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 6 WHERE complaint_id = 18;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 7 WHERE complaint_id = 19;
UPDATE complaints SET status = 'CLOSED',      handled_by = 8 WHERE complaint_id = 20;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 2 WHERE complaint_id = 21;
UPDATE complaints SET status = 'RESOLVED',    handled_by = 3 WHERE complaint_id = 22;

-- ---------------------------------------------------------------------
-- RESOLUTIONS (8 rows)
-- ---------------------------------------------------------------------
INSERT INTO resolutions (complaint_id, closed_by, resolution_text, resolved_at) VALUES
(15, 5, 'Drain desilted and the choked section cleared. Grating replaced with a wider mesh to stop recurrence.', TIMESTAMP '2026-10-12 15:00:00'),
(16, 5, 'Underground line inspected with a camera. A cracked joint was found and resealed; smell has subsided.', TIMESTAMP '2026-10-15 11:20:00'),
(17, 6, 'Four benches repaired and repainted, two beyond repair were replaced with new precast units.',          TIMESTAMP '2026-10-13 10:45:00'),
(18, 6, 'Walking track cleared on both sides and shrubs trimmed back. Pest control sweep carried out.',          TIMESTAMP '2026-10-18 09:00:00'),
(19, 7, 'Animal welfare team sterilised and relocated the pack. School gate area monitored for a week after.',   TIMESTAMP '2026-10-21 16:30:00'),
(20, 8, 'Bollards installed along the footpath edge and two warning boards erected. Enforcement drive conducted.', TIMESTAMP '2026-10-22 12:00:00'),
(21, 2, 'Tanker schedule restored and an additional trip added for the week until borewell levels recover.',     TIMESTAMP '2026-10-21 08:30:00'),
(22, 3, 'Route map corrected at the depot. The lane is now part of the daily collection circuit.',               TIMESTAMP '2026-10-22 07:15:00');
