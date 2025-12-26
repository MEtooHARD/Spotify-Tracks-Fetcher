import chalk from "chalk";
import { IDExploreStack } from "../../database/id_stack.js";
import { Task, TaskSource } from "../task.js";
import { try_catch } from "../../utils/wrapper.js";
import { GetArtists } from "../../api/endpoints.js";
import { SpotifyRepository } from "../../database/repository.js";
import { SearchQueries } from "../../database/search_query.js";

const ARTIST_COUNT_LIMIT = 50;

export class ArtistTaskSource extends TaskSource {
    async getTask(): Promise<Task | undefined> {
        const artist_ids = await IDExploreStack.get('artist', ARTIST_COUNT_LIMIT);
        if (artist_ids.length === 0) return undefined;

        if (artist_ids.length < ARTIST_COUNT_LIMIT) {
            const hasOtherIds = await IDExploreStack.hasAnyId(['playlist']);
            if (hasOtherIds) return undefined;
        }

        return {
            name: `Process (${artist_ids.length}) ${chalk.magenta('Artist IDs')}`,
            run: async (log) => {
                log('fetching artists...');
                const [res, err] = await try_catch(GetArtists(artist_ids));
                if (err) {
                    log(`${chalk.red('failed')} fetching artists`);
                    throw err;
                }

                const valid_artists = res.artists.filter(a => a !== null && a !== undefined);

                // 存入 artists 到 DB
                const artists_added = await SpotifyRepository.insertArtists(valid_artists, log);
                log(chalk.green('stored'), artists_added, chalk.magenta('Artists'));
                // 提取 genres 作為新的搜尋關鍵字
                const addedGenres = await SearchQueries.addGenresFromArtists(valid_artists);
                log(chalk.green('discovered'), addedGenres, 'new', chalk.green('Genres'));
                // 刪除這批 artist IDs
                const removed = await IDExploreStack.rm(artist_ids);
                log(chalk.gray('removed'), removed, chalk.magenta('Artist IDs'), 'from queue');
            }
        }
    }
}