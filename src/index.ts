import chalk from 'chalk';
import { defaultFetch, GetAlbums, GetArtistAlbums, GetArtists, GetCategories, GetToken, GetTracks, Search } from './api_functions';
import config from './config.json';
import { batchInsert, getDatabaseStats } from './database';
import { countSuccess, ExploreStack, getAmount, ObjectExploreStack } from './helpers';
import { Album, Artist, Category, Paged, Playlist, SearchResult, SimplifiedAlbum, Track } from './spotify_types';
import { Task, TaskGenerator, TaskRunner } from './task';
import { RateLimitCircuit, tryCatch } from './wrappers';
import { FailureBackup } from './types';
import { creds } from './utility';

let token: string = '';
export function getToken(): string { return token; };

const backup: FailureBackup = {
    albums: [],
    artists: [],
    tracks: [],
    playlists: []
};

const AlbumIDs = new ExploreStack();
const ArtistIDs = new ExploreStack();
const TrackIDs = new ExploreStack();

const Artists = new ObjectExploreStack<Artist>();
const Albums = new ObjectExploreStack<Album>();
const Tracks = new ObjectExploreStack<Track>();
const Playlists = new ObjectExploreStack<Playlist>();

const Fetched = {
    album: 0,
    artist: 0,
    track: 0,
    playlist: 0
}

const Genres = new ExploreStack();
const Categories = new ExploreStack();
const SearchQueries = new ExploreStack();

const addedH = chalk.green('[added]');
const dbSuccessH = chalk.greenBright('[database]');
const dbErrorH = chalk.redBright('[database error]');

async function main() {
    await login();
    if (token.length === 0) return;
    console.log(chalk.green('[token]'), chalk.yellow(token));

    // Show initial database state
    console.log(chalk.blue('[database]'), 'Initial state:');
    await getDatabaseStats();

    const runner = new TaskRunner(
        [
            TrackTask.getInstance(),
            AlbumTask.getInstance(),
            ArtistTask.getInstance(),
            PlaylistTask.getInstance(),
            TrackIDTask.getInstance(),
            AlbumIDTask.getInstance(),
            ArtistIDTask.getInstance(),
            SearchTask.getInstance(),
        ], 1
    );

    const [res, err] = await tryCatch(GetCategories('zh_TW', 50));

    if (err) {
        console.error(err);
        return;
    }

    const [categories, err2] = await tryCatch(FetchAllPagedItem<Category>(res, 'categories', (...msg) => console.log('d', ...msg)));
    if (err2) {
        console.error(err2);
        return;
    }
    SearchQueries.addAll(categories.map((c: Category) => c.name));

    // Set up periodic database statistics reporting
    const statsInterval = setInterval(async () => {
        const memUsage = process.memoryUsage();
        const timestamp = new Date().toISOString();

        if (!runner.isRunning()) {
            console.log(chalk.blue('[database]'), 'Final state:');
            console.log(chalk.gray('[system]'), 'Time:', timestamp);
            console.log(chalk.gray('[system]'), 'Memory (MB):', {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024)
            });
            await getDatabaseStats();
            clearInterval(statsInterval);
        } else {
            console.log(chalk.blue('[database]'), 'Current state:');
            console.log(chalk.gray('[system]'), 'Time:', timestamp);
            console.log(chalk.gray('[system]'), 'Memory (MB):', {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024)
            });
            console.log(chalk.gray('[system]'), 'Active tasks:', runner.isRunning() ? 'Running' : 'Stopped');
            console.log(chalk.gray('[system]'), 'Stack status (unexplored/total):');
            console.log(chalk.gray('  IDs:'), {
                Albums: `${AlbumIDs.unexplored()}/${AlbumIDs.size()}`,
                Artists: `${ArtistIDs.unexplored()}/${ArtistIDs.size()}`,
                Tracks: `${TrackIDs.unexplored()}/${TrackIDs.size()}`
            });
            console.log(chalk.gray('  Objects:'), {
                Albums: `${Albums.unexplored()}/${Albums.size()}`,
                Artists: `${Artists.unexplored()}/${Artists.size()}`,
                Tracks: `${Tracks.unexplored()}/${Tracks.size()}`,
                Playlists: `${Playlists.unexplored()}/${Playlists.size()}`
            });
            console.log(chalk.gray('  Queries:'), `${SearchQueries.unexplored()}/${SearchQueries.size()}`);
            await getDatabaseStats();
        }
    }, 10_000); // Report every 10 seconds

    runner.trigger();
}

type PagedContainer<T = any> = SearchResult | Record<string, Paged<T>>;

async function FetchAllPagedItem<T>(
    paged: Paged<T>,
    name: undefined,
    log?: (...msg: any[]) => void
): Promise<Array<T>>;
async function FetchAllPagedItem<T>(
    paged: PagedContainer<T>,
    name: string,
    log?: (...msg: any[]) => void
): Promise<Array<T>>;
async function FetchAllPagedItem<T>(
    paged: Paged<T> | PagedContainer<T>,
    name?: string,
    log: (...msg: any[]) => void = console.log
): Promise<Array<T>> {
    // Extract the actual paged object
    const actualPaged: Paged<T> = name
        ? (paged as any)[name]!
        : paged as Paged<T>;

    const header = chalk.green('[fetch paged] ') + chalk.blueBright(name || 'items');
    log(header, 'total:', actualPaged.total);

    const validItems = actualPaged.items.filter(item => item !== null && item !== undefined);
    log(header, 'fetched', actualPaged.items.length,
        'items from', actualPaged.offset, ', valid:', validItems.length);
    const items: Array<T> = validItems;
    let next: string = actualPaged.next!;

    while (next) {
        const fetcher = () => defaultFetch<PagedContainer<T> | Paged<T>>(next);

        const [result, err] = await tryCatch(RateLimitCircuit(fetcher, 5, header, log));

        if (err) {
            log('Error occurred while fetching paged items:', err);
            break;
        }

        // Handle both response formats: if name provided, extract from object, otherwise use direct
        const page: Paged<T> = name ? (result as any)[name]! : result as Paged<T>;
        const validItems = page.items.filter(item => item !== null && item !== undefined);
        log(header, 'fetched', page.items.length,
            'items, from', page.offset, ', valid:', validItems.length);
        items.push(...validItems);
        next = page!.next!;
    }
    log(header, 'fetched total', items.length, 'items');

    return items;
}

class AlbumIDTask extends TaskGenerator {
    getTask(): Task | undefined {
        const albumID = AlbumIDs.pop();
        if (!albumID) return;
        return {
            name: 'fetch albums',
            task: (async (log) => {
                const albumIDs = getAmount(AlbumIDs, 20, [albumID]);

                const [res, err] = await tryCatch(RateLimitCircuit(
                    () => GetAlbums(albumIDs), 5, chalk.blue('fetch albums'), log));
                if (err) {
                    log('Error in fetch albums:', err);
                    return;
                }
                const valid = res.albums.filter(a => a !== null && a !== undefined);

                const [stCnt, stErr] = await tryCatch(batchInsert(valid, 'albums'));
                if (stErr) {
                    log(dbErrorH, 'error inserting albums:', stErr);
                    backup.albums.push(...valid);
                }
                if (stCnt) log(dbSuccessH, 'stored:', stCnt, '/', valid.length, 'albums');

                const added = Albums.addAll(valid);
                log(chalk.green('[albums]'), 'processed:', valid.length, 'added to queue:', added);
            })
        }
    }
}

class AlbumTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const album = Albums.pop();
        if (!album) return;
        return {
            name: 'album ' + album.name,
            task: (async (log) => {
                ArtistIDs.addAll(album.artists.map(a => a.id));
                const [simpTracks, err] = await tryCatch(FetchAllPagedItem<any>(album.tracks, undefined, log));
                if (err) {
                    log('Error in fetching album tracks:', err);
                    return;
                }
                log('added', TrackIDs.addAll(simpTracks.map((t: any) => t.id)), 'track IDs');
            })
        }
    }
}

class ArtistIDTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const artistID = ArtistIDs.pop();
        if (!artistID) return;
        return {
            name: 'fetch artists',
            task: (async (log) => {
                const artistIDs = getAmount(ArtistIDs, 20, [artistID]);

                const [res, err] = await tryCatch(RateLimitCircuit(() => GetArtists(artistIDs), 5, chalk.blue('fetch artists'), log));
                if (err) {
                    log('Error in fetch artists:', err);
                    return;
                }

                Genres.addAll(res.artists.flatMap(a => a.genres));
                const [stCnt, stErr] = await tryCatch(batchInsert(res.artists, 'artists'));
                if (stErr) {
                    log(dbErrorH, 'error inserting artists:', stErr);
                    backup.artists.push(...res.artists);
                }
                if (stCnt) log(dbSuccessH, 'stored:', stCnt, '/', res.artists.length, 'artists');

                log('added', Artists.addAll(res.artists), 'artist IDs');
            })
        }
    }
}

class ArtistTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const artist = Artists.pop();
        if (!artist) return;
        return {
            name: 'artist ' + artist.name,
            task: (async (log) => {
                // Store artist to database
                // await batchInsert([artist], 'artists');

                const [paged, err] = await tryCatch(RateLimitCircuit(() => GetArtistAlbums(
                    artist.id, undefined, undefined, 50)));

                if (err) {
                    log('Error on fetching artist albums page:', err);
                    return;
                }

                const [albums, err2] = await tryCatch(FetchAllPagedItem<SimplifiedAlbum>(paged, undefined, log));
                if (err2) {
                    log('Error on fetching artist albums:', err2);
                    return;
                }
                log('added', AlbumIDs.addAll(albums.map((a: any) => a.id)), 'album IDs');
            })
        }
    }
}

class TrackTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const track = Tracks.pop();
        if (!track) return;
        return {
            name: 'track ' + track.name,
            task: (async (log) => {
                /* store track to database */
                AlbumIDs.add(track.album.id);
                ArtistIDs.addAll(track.artists.map(a => a.id));
            })
        }
    }
}

class TrackIDTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const trackID = TrackIDs.pop();
        if (!trackID) return;
        return {
            name: 'fetch tracks',
            task: (async (log) => {
                const trackIDs = getAmount(TrackIDs, 20, [trackID]);

                const [res, err] = await tryCatch(RateLimitCircuit(() => GetTracks(trackIDs), 5, chalk.blue('fetch tracks'), log));
                if (err) {
                    log('Error in fetch tracks:', err);
                    return;
                }
                const [stCnt, err2] = await tryCatch(batchInsert(res.tracks, 'tracks'));
                if (err2) {
                    log(dbErrorH, 'error inserting tracks:', err2);
                    backup.tracks.push(...res.tracks);
                }
                if (stCnt) log(dbSuccessH, 'stored:', stCnt, '/', res.tracks.length, 'tracks');

                log('added', Tracks.addAll(res.tracks), 'track IDs');
            })
        }
    }
}

class PlaylistTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const playlist = Playlists.pop();
        if (!playlist) return;
        return {
            name: 'playlist ' + playlist.name,
            task: (async (log) => {
                const [tracks, err] = await tryCatch(FetchAllPagedItem(playlist.tracks, undefined, log));

                if (err) {
                    log('Error on fetching playlist tracks:', err);
                    return;
                }

                const c = TrackIDs.addAll(
                    tracks.filter(t => t.track.type === 'track').map(t => t.track.id)
                );

                log('added', c, 'track IDs');
            })
        }
    }
}

class SearchTask extends TaskGenerator {
    public getTask(): Task | undefined {
        const query = SearchQueries.pop();
        if (!query) return;

        return {
            name: 'search ' + chalk.cyan(query),
            task: (async (log) => {
                const [result1, err] = await tryCatch(RateLimitCircuit(() => Search(
                    query,
                    ['album', 'artist', 'playlist', 'track'],
                    undefined, 50
                ), 5, chalk.blue('initial search'), log));

                if (!result1) throw err;

                const [result, err1] = await tryCatch(Promise.all([
                    FetchAllPagedItem<SimplifiedAlbum>(result1, 'albums', log),
                    FetchAllPagedItem<Artist>(result1, 'artists', log),
                    FetchAllPagedItem<Track>(result1, 'tracks', log),
                    FetchAllPagedItem<Playlist>(result1, 'playlists', log),
                ]));

                if (err1) {
                    log('Error in fetch all search paged items:', err1);
                    return;
                }

                const [albums, artists, tracks, playlists] = result;

                const validAlbums = countSuccess(albums, (album: SimplifiedAlbum) => AlbumIDs.add(album.id));
                log(addedH, chalk.cyan('albums'), validAlbums, 'of', albums.length);
                const validArtists = countSuccess(artists, (artist: Artist) => Artists.add(artist));
                log(addedH, chalk.cyan('artists'), validArtists, 'of', artists.length);
                const validTracks = countSuccess(tracks, (track: Track) => Tracks.add(track));
                log(addedH, chalk.cyan('tracks'), validTracks, 'of', tracks.length);
                const validPlaylists = countSuccess(playlists, (playlist: Playlist) => Playlists.add(playlist));
                log(addedH, chalk.cyan('playlists'), validPlaylists, 'of', playlists.length);
            })
        }
    }
}

async function login() {
    const [tokenRes, err1] = await GetToken(creds[0]!.clientID, creds[0]!.secret);
    if (err1) {
        console.log('failed fetching token');
        return;
    }
    token = tokenRes.access_token;
}


main();