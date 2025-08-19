DROP TABLE IF EXISTS tracks;

CREATE TABLE tracks (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    href TEXT,
    uri TEXT,
    popularity INTEGER,
    duration_ms INTEGER,
    explicit BOOLEAN,
    track_number INTEGER,
    disc_number INTEGER,
    album VARCHAR(22),
    artists VARCHAR(22)[]
    -- isrc VARCHAR(15),
    -- ean VARCHAR(15),
    -- upc VARCHAR(15)
);

CREATE INDEX idx_tracks_name ON tracks(name);
CREATE INDEX idx_tracks_popularity ON tracks(popularity);


-- DROP TYPE IF EXISTS album_type;
CREATE TYPE album_type AS ENUM ('album', 'single', 'compilation');

DROP TABLE IF EXISTS albums;
CREATE TABLE albums (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type album_type NOT NULL,
    total_tracks INTEGER,
    href TEXT,
    uri TEXT,
    -- release_date VARCHAR(10),
    -- release_date_precision VARCHAR(10),
    -- images JSONB,
    artists VARCHAR(22)[]
    -- popularity INTEGER
);

CREATE INDEX idx_albums_name ON albums(name);
CREATE INDEX idx_albums_type ON albums(type);
-- CREATE INDEX idx_albums_total_tracks ON albums(total_tracks);


DROP TABLE IF EXISTS artists;
CREATE TABLE artists (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    href TEXT,
    uri TEXT,
    genres VARCHAR(50)[]
    -- popularity INTEGER
);

CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_artists_genres ON artists(genres);


DROP TABLE IF EXISTS playlists;
CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    -- href TEXT,
    -- uri TEXT,
    -- description TEXT,
    -- public BOOLEAN,
    -- collaborative BOOLEAN,
    -- owner VARCHAR(22),
    tracks VARCHAR(22)[]
);

CREATE INDEX idx_playlists_name ON playlists(name);
-- CREATE INDEX idx_playlists_owner ON playlists(owner);