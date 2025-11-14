import chalk from "chalk";
import { IDExploreStack } from "../../database/id_stack";
import { Task, TaskSource } from "../task";
import { tryCatch } from "../../utils/wrapper";
import { GetPlaylist } from "../../api/endpoints";
import { Track } from "../../types/spotify_api";
import { HandlePaged } from "./utils";
import { SpotifyRepository } from "../../database/repository";

export class PlaylistTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        const playlist_id = (await IDExploreStack.get('playlist', 1))[0];
        if (!playlist_id) return undefined;

        return {
            name: `Process ${chalk.blue('Playlist')}: ${playlist_id}`,
            run: async (log) => {
                log('fetching playlist...');
                const [playlist, err] = await tryCatch(GetPlaylist(playlist_id));
                if (err) {
                    log(`${chalk.red('failed')} fetching playlist`);
                    throw err;
                }

                const tracks: Track[] = [];
                log(`fetching tracks from "${playlist.name}"...`);
                await HandlePaged(
                    playlist.tracks,
                    async (items) => {
                        // 過濾掉 Episode 和無效 Track
                        items.forEach(item => {
                            // ⭐ 確保 track 存在、是 Track 類型、且有 ID
                            if (item.track &&
                                item.track.type === 'track' &&
                                item.track.id) {
                                tracks.push(item.track as Track);
                            }
                        });
                    },
                    undefined,
                    (current, total) => log(chalk.gray(`  tracks in "${playlist.name}": ${current}/${total}`))
                );

                // 存入 tracks 到 DB
                const tracks_added = await SpotifyRepository.insertTracks(tracks);
                log(chalk.green('stored'), tracks_added, chalk.cyan('Tracks'));

                // 提取 album IDs 和 artist IDs
                const album_ids = tracks.map(t => t.album.id);
                const artist_ids: string[] = tracks.flatMap(t => t.artists.map(a => a.id));

                const album_ids_added = await IDExploreStack.addMany(album_ids, 'album');
                log(chalk.blue('queued'), album_ids_added, chalk.hex('#FFA500')('Album IDs'));
                const artist_ids_added = await IDExploreStack.addMany(artist_ids, 'artist');
                log(chalk.blue('queued'), artist_ids_added, chalk.magenta('Artist IDs'));

                // 存入 playlist 到 DB
                await SpotifyRepository.insertPlaylist({
                    id: playlist.id,
                    name: playlist.name,
                    tracks: tracks.map(t => t.id)
                });
                log(chalk.green('stored'), chalk.blue('Playlist'));

                // 刪除這個 playlist ID
                const removed = await IDExploreStack.rm([playlist_id]);
                log(chalk.gray('removed'), removed, chalk.blue('Playlist ID'), 'from queue');
            }
        };
    }
}