import chalk from "chalk";
import { GetTracks } from "../../api/endpoints.js";
import { IDExploreStack } from "../../database/id_stack.js";
import { SpotifyRepository } from "../../database/repository.js";
import { try_catch } from "../../utils/wrapper.js";
import { Task, TaskSource } from "../task.js";

const TRACK_COUNT_LIMIT = 50;

export class TrackTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        const track_ids = await IDExploreStack.get('track', TRACK_COUNT_LIMIT);
        if (track_ids.length === 0) return undefined;

        // 只有當 album 和 artist ID 都沒有了，才在 track ID 不足 20 時執行
        // 避免在 album/artist task 和 track task 之間頻繁切換，浪費 API 呼叫
        if (track_ids.length < TRACK_COUNT_LIMIT) {
            // 用一次查詢檢查是否還有其他 ID，而不是分開查詢
            const hasOtherIds = await IDExploreStack.hasAnyId(['album', 'artist']);

            // 如果還有其他 ID，就不執行 track task
            if (hasOtherIds) return undefined;
        }

        return {
            name: `Process (${track_ids.length}) ${chalk.cyan('Track IDs')}`,
            run: async (log) => {
                log('fetching tracks...');
                const [res, err] = await try_catch(GetTracks(track_ids));
                if (err) {
                    log(`${chalk.red('failed')} fetching tracks`);
                    throw err;
                }

                const valid_tracks = res.tracks.filter(t => t !== null && t !== undefined && t.id);

                // 存入 tracks 到 DB
                const track_added = await SpotifyRepository.insertTracks(valid_tracks, log);
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