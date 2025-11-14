import chalk from "chalk";
import { GetTracks } from "../../api/endpoints";
import { IDExploreStack } from "../../database/id_stack";
import { SpotifyRepository } from "../../database/repository";
import { tryCatch } from "../../utils/wrapper";
import { Task, TaskSource } from "../task";

export class TrackTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        const track_ids = await IDExploreStack.get('track', 20);
        if (track_ids.length === 0) return undefined;

        return {
            name: `Process (${track_ids.length}) ${chalk.cyan('Track IDs')}`,
            run: async (log) => {
                log('fetching tracks...');
                const [res, err] = await tryCatch(GetTracks(track_ids));
                if (err) {
                    log(`${chalk.red('failed')} fetching tracks`);
                    throw err;
                }

                const valid_tracks = res.tracks.filter(t => t !== null && t !== undefined);

                // 存入 tracks 到 DB
                const track_added = await SpotifyRepository.insertTracks(valid_tracks);
                log(chalk.green('stored'), track_added, chalk.cyan('Tracks'));

                // 存入 album IDs 和 artist IDs 到 queue
                const album_ids = valid_tracks.map(t => t.album.id);
                const artist_ids: string[] = valid_tracks.flatMap(t => t.artists.map(a => a.id));

                const album_ids_added = await IDExploreStack.addMany(album_ids, 'album');
                log(chalk.blue('queued'), album_ids_added, chalk.hex('#FFA500')('Album IDs'));
                const artist_ids_added = await IDExploreStack.addMany(artist_ids, 'artist');
                log(chalk.blue('queued'), artist_ids_added, chalk.magenta('Artist IDs'));
                // 刪除這批 track IDs
                const removed = await IDExploreStack.rm(track_ids);
                log(chalk.gray('removed'), removed, chalk.cyan('Track IDs'), 'from queue');
            }
        }
    }
}