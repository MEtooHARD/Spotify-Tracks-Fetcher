import chalk from "chalk";
import { IDExploreStack } from "../../database/id_stack.js";
import { Task, TaskSource } from "../task.js";
import { try_catch } from "../../utils/wrapper.js";
import { GetAlbums } from "../../api/endpoints.js";
import { HandlePaged } from "./utils.js";
import { SpotifyRepository } from "../../database/repository.js";

export class AlbumTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        const album_id = (await IDExploreStack.get('album', 1))[0];
        if (!album_id) return undefined;

        return {
            name: `Process ${chalk.hex('#FFA500')('Album')}: ${album_id}`,
            run: async (log) => {
                log('fetching album...');
                const [res, err] = await try_catch(GetAlbums([album_id]));

                if (err) {
                    log(`${chalk.red('failed')} fetching album`);
                    throw err;  // 拋出錯誤讓 TaskRunner 捕捉
                }

                const album = res.albums[0];
                if (!album) {
                    log(chalk.yellow('album not found'));
                    await IDExploreStack.rm([album_id]);
                    return;
                }

                // 提取 artist IDs
                const artist_ids: string[] = album.artists.map(a => a.id);
                const track_ids: string[] = [];

                // 使用 HandlePaged 處理 album.tracks 的所有分頁
                log(`fetching tracks from "${album.name}"...`);
                await HandlePaged(
                    album.tracks,
                    async (items) => { track_ids.push(...items.map(t => t.id)) },
                    undefined,
                    (current, total) => log(chalk.gray(`  tracks: ${current}/${total}`))
                );

                // 批次加入 ID queue
                const artist_ids_added = await IDExploreStack.addMany(artist_ids, 'artist');
                log(chalk.blue('queued'), artist_ids_added, chalk.magenta('Artist IDs'));
                const track_ids_added = await IDExploreStack.addMany(track_ids, 'track');
                log(chalk.blue('queued'), track_ids_added, chalk.cyan('Track IDs'));
                // 存入 album 到 DB
                const albums_added = await SpotifyRepository.insertAlbums([album], log);
                log(chalk.green('stored'), albums_added, chalk.hex('#FFA500')('Album'));
                // 刪除這個 album ID
                const removed = await IDExploreStack.rm([album_id]);
                log(chalk.gray('removed'), removed, chalk.hex('#FFA500')('Album ID'), 'from queue');
            }
        };
    }
}