-- Drop the sourcing columns from items: where a piece came from, when it was acquired, and the lot
-- id that tied a batch together. The UI, API and margin report that used them are already gone.
--
-- RUN THIS LAST, and only once the code above is deployed — the app stops reading these columns
-- first, so dropping them cannot break a running deployment. Irreversible: the values are not
-- recoverable afterwards except from a database backup.
--
-- Check what you are about to delete BEFORE running it:
--
--   SELECT count(*) FILTER (WHERE source_name IS NOT NULL AND source_name <> '') AS with_source,
--          count(*) FILTER (WHERE acquired_at IS NOT NULL)                       AS with_date,
--          count(*) FILTER (WHERE lot_id IS NOT NULL)                            AS with_lot,
--          count(*)                                                              AS items
--   FROM items;
--
-- And if you want to keep a copy of the sourcing history before it goes:
--
--   CREATE TABLE items_sourcing_backup_2026_09 AS
--     SELECT id, seller_id, source_name, acquired_at, lot_id FROM items
--     WHERE source_name IS NOT NULL OR acquired_at IS NOT NULL OR lot_id IS NOT NULL;

ALTER TABLE items DROP COLUMN IF EXISTS source_name;
ALTER TABLE items DROP COLUMN IF EXISTS acquired_at;
ALTER TABLE items DROP COLUMN IF EXISTS lot_id;
