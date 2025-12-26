import { Album, Artist, Track } from "../types/spotify_api.js";
import { db } from "./kysely_instance.js";

export type Logger = (...msg: any[]) => void;

/**
 * Repository：單純封裝資料庫 INSERT 操作
 * 只處理完整物件的批次插入，Simplified 物件只存 ID
 */
export class SpotifyRepository {
    /**
     * 批次插入 Artists（完整物件）
     */
    static async insertArtists(artists: Artist[], log?: Logger): Promise<number> {
        if (artists.length === 0) return 0;
        const logger = log || console.log;

        try {
            const result = await EACCES_retry(() => db
                .insertInto('artists')
                .values(artists.map(artist => ({
                    id: artist.id,
                    name: artist.name,
                    genres: artist.genres,
                    popularity: artist.popularity,
                    followers: artist.followers?.total ?? null
                })))
                .onConflict(oc => oc.doNothing())
                .execute());

            // sum inserted/updated rows from result (Kysely returns array of results for batch)
            return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
        } catch (error) {
            logger('[Repository] Failed to insert artists:', error);
            // 記錄所有失敗的 artist IDs 到 err_ids
            await this.logFailedIds(artists.map(a => a.id), 'artist', log);
            throw error;
        }
    }

    /**
     * 批次插入 Albums（完整物件）
     */
    static async insertAlbums(albums: Album[], log?: Logger): Promise<number> {
        if (albums.length === 0) return 0;
        const logger = log || console.log;

        try {
            const result = await EACCES_retry(() => db
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
                .execute());

            return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
        } catch (error) {
            logger('[Repository] Failed to insert albums:', error);
            // 記錄所有失敗的 album IDs 到 err_ids
            await this.logFailedIds(albums.map(a => a.id), 'album', log);
            throw error;
        }
    }

    /**
     * 批次插入 Tracks（完整物件）
     */
    static async insertTracks(tracks: Track[], log?: Logger): Promise<number> {
        if (tracks.length === 0) return 0;
        const logger = log || console.log;

        logger(`[Repository] Inserting ${tracks.length} tracks...`);

        // 驗證數據完整性
        const invalidTracks = tracks.filter(t =>
            !t.id || !t.name || !t.album?.id || !t.artists || t.artists.length === 0
        );

        if (invalidTracks.length > 0) {
            logger(`[Repository] Found ${invalidTracks.length} invalid tracks, skipping...`);
            logger(`[Repository] Invalid track IDs:`, invalidTracks.map(t => t.id));
            // logger('[Repository] First invalid track:', invalidTracks[0]);
            await this.logFailedIds(invalidTracks.map(t => t.id), 'track', log);
            logger('[Repository] Stored invalid track IDs to err_ids');
        }

        const validTracks = tracks.filter(t =>
            t.id && t.name && t.album?.id && t.artists && t.artists.length > 0
        );

        if (validTracks.length === 0) {
            logger('[Repository] No valid tracks to insert');
            return 0;
        }

        // 分批插入以避免超過 PostgreSQL 參數限制
        // 每批 1000 筆 (9 fields × 1000 = 9000 parameters, well under 65535 limit)
        const BATCH_SIZE = 1000;
        let totalInserted = 0;

        for (let i = 0; i < validTracks.length; i += BATCH_SIZE) {
            const batch = validTracks.slice(i, i + BATCH_SIZE);

            try {
                const result = await EACCES_retry(() => db
                    .insertInto('tracks')
                    .values(batch.map(track => ({
                        id: track.id,
                        name: track.name,
                        album_id: track.album.id,
                        artist_ids: track.artists.map(a => a.id),
                        duration_ms: track.duration_ms ?? null,
                        explicit: track.explicit ?? null,
                        popularity: track.popularity ?? null,
                        track_number: track.track_number ?? null,
                        disc_number: track.disc_number ?? null
                    })))
                    .onConflict(oc => oc.doNothing())
                    .execute());

                const inserted = result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
                totalInserted += inserted;
            } catch (error) {
                logger(`[Repository] Failed to insert track batch ${i}-${i + batch.length}:`, error);
                // 記錄這批失敗的 track IDs 到 err_ids
                await this.logFailedIds(batch.map(t => t.id), 'track', log);
                throw error;
            }
        }

        return totalInserted;
    }

    /**
     * 插入 Playlist
     */
    static async insertPlaylist(playlist: { id: string; name: string; tracks: string[] }, log?: Logger): Promise<number> {
        const logger = log || console.log;

        try {
            const result = await EACCES_retry(() => db
                .insertInto('playlists')
                .values({
                    id: playlist.id,
                    name: playlist.name,
                    tracks: playlist.tracks
                })
                .onConflict(oc => oc.doNothing())
                .execute());

            return result.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0n), 0);
        } catch (error) {
            logger('[Repository] Failed to insert playlist:', error);
            // 記錄失敗的 playlist ID 到 err_ids
            await this.logFailedIds([playlist.id], 'playlist', log);
            throw error;
        }
    }

    /**
     * 記錄失敗的 ID 到 err_ids 表
     */
    private static async logFailedIds(ids: string[], type: 'artist' | 'album' | 'track' | 'playlist', log?: Logger): Promise<void> {
        if (ids.length === 0) return;
        const logger = log || console.log;

        try {
            await EACCES_retry(() => db
                .insertInto('err_ids')
                .values(ids.map(id => ({ id, type })))
                .onConflict(oc => oc.doNothing())
                .execute());

            logger(`[Repository] Logged ${ids.length} failed ${type} IDs to err_ids`);
        } catch (error) {
            logger('[Repository] Failed to log error IDs:', error);
        }
    }
}

async function EACCES_retry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        if ('code' in e && e.code === 'EACCES') {
            // 這裡保持 console.warn，因為是底層錯誤處理
            console.warn('[EACCES_retry] Caught EACCES error, retrying after 1s...');
            await new Promise(res => setTimeout(res, 1000));
            return await fn();
        }
        throw e;
    }
}