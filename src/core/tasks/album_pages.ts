import chalk from "chalk";
import { Task, TaskSource } from "../task.js";
import { HandlePaged } from "./utils.js";
import { IDExploreStack } from "../../database/id_stack.js";
import { SpotifyRepository } from "../../database/repository.js";
import { db } from "../../database/kysely_instance.js";
import { Paged, Track } from "../../types/spotify_api.js";

export class AlbumPagesTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        // 從 paged_albums 取一筆
        const result = await db
            .selectFrom('paged_albums')
            .select(['id', 'paged'])
            .limit(1)
            .execute();

        if (result.length === 0) return undefined;

        const record = result[0]!;
        const album_id = record.id;
        const paged = record.paged as unknown as Paged<Track>; // Kysely 已經自動解析 JSON

        return {
            name: `Process ${chalk.hex('#FFA500')('Album Pages')}: ${album_id}`,
            run: async (log) => {
                const track_ids: string[] = [];

                log(`processing tracks from album ${album_id}...`);
                await HandlePaged(
                    paged,
                    async (items) => { track_ids.push(...items.map(t => t.id)) },
                    undefined,
                    (current, total) => log(chalk.gray(`  tracks: ${current}/${total}`))
                );

                // 加入 track IDs 到 queue
                const track_ids_added = await IDExploreStack.addMany(track_ids, 'track');
                log(chalk.blue('queued'), track_ids_added, chalk.cyan('Track IDs'));

                // 刪除這筆 paged_albums 記錄
                await db
                    .deleteFrom('paged_albums')
                    .where('id', '=', album_id)
                    .execute();
                log(chalk.gray('removed'), 1, chalk.hex('#FFA500')('Paged Album'));
            }
        };
    }
}
