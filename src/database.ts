import { Insertable, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Album, Artist, Playlist, Track } from './spotify_types';
import { DB } from './types/db';

export const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) })
});

type TablesName = keyof DB;

export async function filterExistingIds(
    tableName: TablesName,
    ids: string[]
): Promise<string[]> {
    if (ids.length === 0) return [];


    const existingIds = await db.selectFrom(tableName).select('id').where('id', 'in', ids).execute();
    const existingIdSet = new Set(existingIds.map(row => row.id));
    return ids.filter(id => !existingIdSet.has(id));
}

type Tables = DB[keyof DB];
type SpotifyUnits = Track | Album | Artist | Playlist;
type TransFN<S, T> = (item: S) => T;
type TransFNArr<S, T> = (items: S[]) => T[];

type SourceTypeMap = {
    tracks: Track;
    albums: Album;
    artists: Artist;
    playlists: Playlist;
};

type InsertableTypeMap = {
    tracks: Insertable<DB['tracks']>;
    albums: Insertable<DB['albums']>;
    artists: Insertable<DB['artists']>;
    playlists: Insertable<DB['playlists']>;
};

type MapToMap<
    SourceMap extends object,
    TargetMap extends { [K in keyof SourceMap]: any }
> = { [K in keyof SourceMap]: TransFNArr<SourceMap[K], TargetMap[K]> };

const transformers: MapToMap<SourceTypeMap, InsertableTypeMap> = {
    tracks: (track: Array<Track>): Array<Insertable<DB['tracks']>> => track.map(track => ({
        id: track.id,
        name: track.name,
        album: track.album.id,
        artists: track.artists.map(artist => artist.id),
        disc_number: track.disc_number,
        duration_ms: track.duration_ms,
        explicit: track.explicit,
        href: track.href,
        popularity: track.popularity,
        track_number: track.track_number,
        uri: track.uri,
    })),

    albums: (album: Array<Album>): Array<Insertable<DB['albums']>> => album.map(album => ({
        id: album.id,
        name: album.name,
        artists: album.artists.map(artist => artist.id),
        href: album.href,
        total_tracks: album.total_tracks,
        type: album.album_type,
        uri: album.uri,
    })),

    artists: (artist: Array<Artist>): Array<Insertable<DB['artists']>> => artist.map(artist => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres,
        href: artist.href,
        uri: artist.uri,
    })),

    playlists: (playlist: Array<Playlist>): Array<Insertable<DB['playlists']>> => playlist.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        tracks: playlist.tracks.items.map((item) => item.track.id).filter(Boolean),
    })),
};

export async function batchInsert(items: Track[], table: 'tracks'): Promise<number>;
export async function batchInsert(items: Album[], table: 'albums'): Promise<number>;
export async function batchInsert(items: Artist[], table: 'artists'): Promise<number>;
export async function batchInsert(items: Playlist[], table: 'playlists'): Promise<number>;
export async function batchInsert<Table extends TablesName, I extends Array<SourceTypeMap[Table]>>(
    items: I, table: Table
): Promise<number> {
    if (items.length === 0) return 0;

    const ids = items.map((item) => item.id);
    const newIds = await filterExistingIds(table, ids);
    const toInsert = items.filter((item) => newIds.includes(item.id));

    if (toInsert.length === 0) return 0;

    const values = transformers[table](toInsert);

    const res = await db.insertInto(table).values(values).execute();

    return res.length;
}

export async function getDatabaseStats(): Promise<void> {
    const [tracks, albums, artists, playlists] = await Promise.all([
        db.selectFrom('tracks').select(db.fn.count('id').as('count')).executeTakeFirst(),
        db.selectFrom('albums').select(db.fn.count('id').as('count')).executeTakeFirst(),
        db.selectFrom('artists').select(db.fn.count('id').as('count')).executeTakeFirst(),
        db.selectFrom('playlists').select(db.fn.count('id').as('count')).executeTakeFirst(),
    ]);

    console.log('Database Statistics:');
    console.log(`  Tracks: ${tracks?.count || 0}`);
    console.log(`  Albums: ${albums?.count || 0}`);
    console.log(`  Artists: ${artists?.count || 0}`);
    console.log(`  Playlists: ${playlists?.count || 0}`);
}