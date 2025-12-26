import chalk from "chalk";
import { IDExploreStack } from "../../database/id_stack.js";
import { Task, TaskSource } from "../task.js";
import { try_catch } from "../../utils/wrapper.js";
import { GetAlbums } from "../../api/endpoints.js";
import { SpotifyRepository } from "../../database/repository.js";
import { db } from "../../database/kysely_instance.js";
import { partition_arr } from "../../utils/helpers.js";

export class AlbumIdTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        // 一次取最多 20 個 album IDs
        const album_ids = await IDExploreStack.get('album', 20);
        if (album_ids.length === 0) return undefined;

        if (album_ids.length < 20) { // if not enough 20, see if any playlists first
            const hasOtherIds = await IDExploreStack.hasAnyId(['playlist']);
            if (hasOtherIds) return undefined;
        }

        return {
            name: `Process (${album_ids.length}) ${chalk.hex('#FFA500')('Album IDs')}`,
            run: async (log) => {
                log(`fetching ${album_ids.length} albums...`);
                const [res, err] = await try_catch(GetAlbums(album_ids));

                if (err) {
                    log(`${chalk.red('failed')} fetching albums`);
                    throw err;
                }

                const albums = res.albums.filter(a => a !== null);

                if (albums.length === 0) {
                    log(chalk.yellow('no valid albums found'));
                    await IDExploreStack.rm(album_ids);
                    return;
                }

                log(`processing ${albums.length} albums...`);

                // 儲存 albums
                const albums_added = await SpotifyRepository.insertAlbums(albums, log);
                log(chalk.green('stored'), albums_added, chalk.hex('#FFA500')('Albums'));

                // 提取所有 artist IDs
                const all_artist_ids = new Set<string>();
                for (const album of albums) {
                    album.artists.forEach(a => all_artist_ids.add(a.id));
                }
                const artist_ids_added = await IDExploreStack.addMany(Array.from(all_artist_ids), 'artist');
                log(chalk.blue('queued'), artist_ids_added, chalk.magenta('Artist IDs'));

                // 儲存 paged albums (包含 tracks paged object)
                // Spotify API: next 為 undefined 或 null 時代表沒有下一頁（單頁）
                const [singles, multi_page] = partition_arr(albums, album => album.tracks.next == null);

                // single pages: 直接提取所有 track IDs
                const track_ids_of_singles = singles.flatMap(album =>
                    album.tracks.items.filter((t): t is NonNullable<typeof t> => t !== null).map(t => t.id)
                );

                if (track_ids_of_singles.length > 0) {
                    const queued_amount = await IDExploreStack.addMany(track_ids_of_singles, 'track');
                    log(chalk.blue('queued'), `(${queued_amount}/${track_ids_of_singles.length})`, chalk.cyan('Track IDs'), 'from single-page albums');
                } else {
                    log('no track IDs found from single-page albums');
                }

                // multi pages: 儲存 paged object 供後續分頁處理
                if (multi_page.length > 0) {
                    const stored = await db.insertInto('paged_albums')
                        .values(multi_page.map(album => ({
                            id: album.id,
                            paged: JSON.stringify(album.tracks)
                        })))
                        .onConflict(oc => oc.column('id').doNothing())
                        .execute();

                    log(chalk.blue('stored'), `${stored[0]?.numInsertedOrUpdatedRows ?? 0}/${multi_page.length}`, chalk.hex('#FFA500')('Paged Albums'));
                } else {
                    log('no multi-page albums to store');
                }

                // for (const album of albums) {
                //     if (album.tracks && album.tracks.items) {
                //         if (album.tracks.next === null) {// one-page, queue directly
                //             const queued_amount = await IDExploreStack.addMany(album.tracks.items.map(t => t!.id), 'track');
                //             log(chalk.blue('queued'), `(${queued_amount}/${album.tracks.items.length})`, chalk.cyan('Track IDs'), `from album ${chalk.hex('#FFA500')(album.name)}`);
                //         } else {
                //             await db.insertInto('paged_albums')
                //                 .values({
                //                     id: album.id,
                //                     paged: JSON.stringify(album.tracks)
                //                 })
                //                 .onConflict(oc => oc.column('id').doNothing())
                //                 .execute();
                //             paged_count++;
                //         }
                //     }
                // }

                // 刪除處理過的 album IDs
                const removed = await IDExploreStack.rm(album_ids);
                log(chalk.gray('removed'), removed, chalk.hex('#FFA500')('Album IDs'), 'from queue');
            }
        };
    }
}
