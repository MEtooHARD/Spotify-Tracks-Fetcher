-- This script creates a table named 'tracks' to store data corresponding to
-- the Spotify Track object. It uses the Spotify ID as the primary key.
--
-- Data Types Chosen:
-- - TEXT for string-based IDs and URLs because their length can vary.
-- - VARCHAR(255) for names and titles for efficient indexing.
-- - INTEGER for numerical values like disc/track numbers and durations.
-- - BOOLEAN for true/false flags.
-- - TEXT[] for arrays of strings (e.g., available_markets).
-- - JSONB for complex nested objects (e.g., album, artists). JSONB is
--   chosen over JSON for its efficiency in storage and querying.
-- - TIMESTAMPTZ for date/time values to ensure time zone consistency.

-- Drop the table if it already exists to allow for a clean re-creation.
DROP TABLE IF EXISTS tracks;

CREATE TABLE tracks (
    -- Core Track Information
    id TEXT PRIMARY KEY,                      -- The unique Spotify ID for the track.
    name VARCHAR(255) NOT NULL,               -- The name of the track.
    href TEXT,                                -- A link to the Web API endpoint providing full details of the track.
    uri TEXT,                                 -- The Spotify URI for the track.
    -- type VARCHAR(50) DEFAULT 'track',         -- The object type, always 'track'.

    -- Popularity and Duration
    popularity INTEGER /* CHECK (popularity >= 0 AND popularity <= 100) */, -- The popularity of the track from 0 to 100.
    duration_ms INTEGER,                      -- The track length in milliseconds.

    -- Track Details
    explicit BOOLEAN,                         -- Whether or not the track has explicit lyrics.
    -- is_local BOOLEAN,                         -- Whether or not the track is from a local file.
    -- is_playable BOOLEAN,                      -- Part of the response when Track Relinking is applied.
    track_number INTEGER,                     -- The number of the track.
    disc_number INTEGER,                      -- The disc number (usually 1).

    -- Relational Data (stored as JSONB for flexibility)
    -- Storing these as JSONB simplifies the schema. For advanced querying,
    -- you could normalize these into their own tables (e.g., 'artists', 'albums')
    -- and use foreign keys.
    album VARCHAR(22),                               -- The album on which the track appears. (Simplified Album Object)
    artists JSONB,                            -- The artists who performed the track. (Array of SimplifiedArtist Objects)

    -- External IDs and URLs
    -- external_ids JSONB,                       -- Known external IDs (isrc, ean, upc).
    isrc VARCHAR(15),
    ean VARCHAR(15),
    upc VARCHAR(15) --,
    -- external_urls TEXT,                      -- Known external URLs for this track.

    -- Market and Restriction Information
    -- available_markets TEXT[],                 -- An array of ISO 3166-1 alpha-2 country codes.
    -- restrictions VARCHAR,                       -- Included when content restriction is applied.

    -- Relinking Information
    -- The 'linked_from' object contains information about the originally requested track.
    -- linked_from VARCHAR(22),                        -- Present if the track is a relinked track.

    -- Timestamps for Data Management
    -- created_at TIMESTAMPTZ DEFAULT NOW(),      -- Timestamp when the record was created.
    -- updated_at TIMESTAMPTZ DEFAULT NOW()       -- Timestamp when the record was last updated.
);

-- Create an index on the 'name' column to speed up search queries by track name.
CREATE INDEX idx_tracks_name ON tracks(name);

-- Create an index on the 'popularity' column for efficient sorting and filtering.
CREATE INDEX idx_tracks_popularity ON tracks(popularity);

-- A trigger to automatically update the 'updated_at' timestamp whenever a row is modified.
-- CREATE OR REPLACE FUNCTION update_modified_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = NOW();
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- CREATE TRIGGER update_tracks_modtime
--     BEFORE UPDATE ON tracks
--     FOR EACH ROW
--     EXECUTE FUNCTION update_modified_column();

-- A comment on the table to describe its purpose.
COMMENT ON TABLE tracks IS 'Stores detailed information about individual tracks from the Spotify API.';
