import { Album, Artist, Track } from "../types/spotify_api";
import { db } from "./kysely_instance";

/**
 * Repository：單純封裝資料庫 INSERT 操作
 * 只處理完整物件的批次插入，Simplified 物件只存 ID
 */
export class SpotifyRepository {
    /**
     * 批次插入 Artists（完整物件）
     */
    static async insertArtists(artists: Artist[]): Promise<number> {
        if (artists.length === 0) return 0;

        const result = await db
            .insertInto('artists')
            .values(artists.map(artist => ({
                id: artist.id,
                name: artist.name,
                genres: artist.genres,
                popularity: artist.popularity,
                followers: artist.followers?.total ?? null
            })))
            .onConflict(oc => oc.doNothing())
            .execute();

        // sum inserted/updated rows from result (Kysely returns array of results for batch)
        return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
    }

    /**
     * 批次插入 Albums（完整物件）
     */
    static async insertAlbums(albums: Album[]): Promise<number> {
        if (albums.length === 0) return 0;

        const result = await db
            .insertInto('albums')
            .values(albums.map(album => ({
                id: album.id,
                name: album.name,
                type: album.album_type,
                total_tracks: album.total_tracks,
                release_date: album.release_date,
                artist_ids: album.artists.map(a => a.id),
                label: album.label,
                popularity: album.popularity
            })))
            .onConflict(oc => oc.doNothing())
            .execute();

        return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
    }

    /**
     * 批次插入 Tracks（完整物件）
     */
    static async insertTracks(tracks: Track[]): Promise<number> {
        if (tracks.length === 0) return 0;

        const result = await db
            .insertInto('tracks')
            .values(tracks.map(track => ({
                id: track.id,
                name: track.name,
                album_id: track.album.id,
                artist_ids: track.artists.map(a => a.id),
                duration_ms: track.duration_ms,
                explicit: track.explicit,
                popularity: track.popularity,
                track_number: track.track_number,
                disc_number: track.disc_number
            })))
            .onConflict(oc => oc.doNothing())
            .execute();

        return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
    }

    /**
     * 插入 Playlist
     */
    static async insertPlaylist(playlist: { id: string; name: string; tracks: string[] }): Promise<number> {
        const result = await db
            .insertInto('playlists')
            .values({
                id: playlist.id,
                name: playlist.name,
                tracks: playlist.tracks
            })
            .onConflict(oc => oc.doNothing())
            .execute();

        return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
    }
}

