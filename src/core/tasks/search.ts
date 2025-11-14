import chalk from "chalk";
import { SearchQueries } from "../../database/search_query";
import { Task, TaskSource } from "../task";
import { GetCategories, Search } from "../../api/endpoints";
import { Artist, Category, Track } from "../../types/spotify_api";
import { HandlePaged } from "./utils";
import { SpotifyRepository } from "../../database/repository";
import { IDExploreStack } from "../../database/id_stack";

export class SearchTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        // 1. 嘗試從資料庫取得關鍵字
        let query = await SearchQueries.take(30);

        // 2. 沒有關鍵字，嘗試補充
        if (!query) {
            const refilled = await this.refillQueries();
            if (refilled === 0) {
                // 補充失敗，沒有任何可用資源
                return undefined;
            }

            // 補充成功，再次嘗試取得
            query = await SearchQueries.take(30);
            if (!query) return undefined;
        }

        return {
            name: `Search:${chalk.cyan(query)}`,
            run: async (log) => {
                const result = await Search(
                    query,
                    ['artist', 'album', 'playlist', 'track'],
                    undefined,
                    50
                );
                log('result arrived, start fetching.');

                let totalFound = 0;

                // 處理 Artists（完整物件 → 存入 DB）
                if (result.artists) {
                    const artists: Artist[] = [];
                    await HandlePaged(
                        result.artists,
                        async (items) => {
                            artists.push(...items);
                            // await IDExploreStack.addMany(items.map(i => i.id), 'artist');
                            // totalFound += items.length;
                        },
                        undefined,
                        (current, total) => log(chalk.gray(`artists: ${current}/${total}`))
                    );

                    // 批次插入資料庫
                    await SpotifyRepository.insertArtists(artists);

                    log(chalk.blue('added'), artists.length, chalk.magenta('Artists'));
                    // 提取 genres 作為新的搜尋關鍵字
                    const addedGenres = await SearchQueries.addGenresFromArtists(artists);
                    if (addedGenres > 0) {
                        log(chalk.green('discovered'), addedGenres, 'new', chalk.green('Genres'));
                    }
                }

                // 處理 Tracks（完整物件 → 存入 DB）
                if (result.tracks) {
                    const tracks: Track[] = [];
                    await HandlePaged(
                        result.tracks,
                        async (items) => {
                            tracks.push(...items);
                            // await IDExploreStack.addMany(items.map(i => i.id), 'track');
                            // totalFound += items.length;
                        },
                        undefined,
                        (current, total) => log(chalk.gray(`tracks: ${current}/${total}`))
                    );

                    // 批次插入資料庫
                    await SpotifyRepository.insertTracks(tracks);

                    log(chalk.blue('added'), tracks.length, chalk.cyan('Tracks'));
                }

                // 處理 Albums（SimplifiedAlbum → 只存 ID）
                if (result.albums) {
                    let count = 0;
                    await HandlePaged(
                        result.albums,
                        async (albums) => {
                            await IDExploreStack.addMany(albums.map(i => i.id), 'album');
                            count += albums.length;
                            totalFound += albums.length;
                        },
                        undefined,
                        (current, total) => log(chalk.gray(`albums: ${current}/${total}`))
                    );
                    log(chalk.blue('added'), count, chalk.hex('#FFA500')('Album IDs'));
                }

                // 處理 Playlists（SimplifiedPlaylist → 只存 ID）
                if (result.playlists) {
                    let count = 0;
                    await HandlePaged(
                        result.playlists,
                        async (playlists) => {
                            await IDExploreStack.addMany(playlists.map(i => i.id), 'playlist');
                            count += playlists.length;
                            totalFound += playlists.length;
                        },
                        undefined,
                        (current, total) => log(chalk.gray(`playlists: ${current}/${total}`))
                    );
                    log(chalk.blue('added'), count, chalk.blue('Playlist IDs'));
                }

                // log(chalk.green('done'), 'total found:', totalFound);
            }
        };
    }

    /**
     * 補充搜尋關鍵字
     * 優先順序：categories > 資料庫中的 artists/albums
     */
    private async refillQueries(): Promise<number> {
        console.log(chalk.yellow('[SearchTask]'), 'No queries found, attempting to refill...');

        // 方案 A: 從 Spotify categories 取得
        try {
            const categoriesResult = await GetCategories('zh_TW', 50);

            let added = 0;
            await HandlePaged(
                categoriesResult.categories!,
                async (categories: Category[]) => {
                    const queries = categories.map(c => c.name);
                    const count = await SearchQueries.addAll(queries, 'category');
                    added += count;
                },
                undefined,
                (current, total) => console.log(chalk.gray(`[SearchTask] categories: ${current}/${total}`))
            );

            if (added > 0) {
                console.log(chalk.green('[SearchTask]'), `Refilled ${added} queries from categories`);
                return added;
            }
        } catch (err) {
            console.error(chalk.red('[SearchTask]'), 'Failed to fetch categories:', err);
        }

        // 方案 B: 從資料庫中已知的 artists/albums 提取
        try {
            const added = await SearchQueries.populateFromDatabase();
            if (added > 0) {
                console.log(chalk.green('[SearchTask]'), `Refilled ${added} queries from database`);
                return added;
            }
        } catch (err) {
            console.error(chalk.red('[SearchTask]'), 'Failed to populate from database:', err);
        }

        console.log(chalk.yellow('[SearchTask]'), 'Unable to refill queries from any source');
        return 0;
    }
}