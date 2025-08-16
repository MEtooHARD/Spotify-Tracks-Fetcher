import chalk from 'chalk';
import config from './config.json';
import { defaultFetch, GetToken, Search } from './functions';
import { ExploreStack } from './helpers';
import { Album, Artist, Paged, Track } from './types';
import { extractResponse, tryCatch } from './wrappers';

let token: string = '';
export function getToken(): string { return token; };

const Artists = new ExploreStack<Artist>();
const Albums = new ExploreStack<Album>();
const Tracks = new ExploreStack<Track>();

async function main() {
    await login();
    if (token.length === 0) return;
    console.log(chalk.green('[token]'), chalk.yellow(token));

    const [result1, err1] = await Search(
        '時代',
        ['album'],
        undefined,
        50);

    if (result1) {
        console.log(result1);
        const albums = await FetchAllSearchPagedItems(
            result1.albums!,
            'albums');
        console.log(albums.length);
        // console.log(albums)
    }
    else
        console.log(err1);
}


async function doSearch(query: string) {
    const [result, err] = await Search(
        query, ['album', 'artist', 'playlist', 'track'], undefined, 50
    );

    if (err) {
        console.log('Error occurred while searching:', err);
        return;
    }

    const albums = result.albums;
    const artists = result.artists;
    const tracks = result.tracks;

    // return [albums, artists, tracks];
}

async function FetchAllSearchPagedItems<T>(paged: Paged<T>, name: string): Promise<Array<T>> {
    const header = chalk.yellowBright('[fetch paged] ') + chalk.blueBright(name);
    console.log(header, 'total:', paged.total);

    const items: Array<T> = paged.items;
    let next: string = paged.next!;

    while (next) {
        console.log(next)
        const [result, err] = await defaultFetch<{ [name]: Paged<T> }>(next);

        if (err) {
            console.log('Error occurred while fetching paged items:', err);
            break;
        }
        const page = result[name]!;
        console.log(header, 'fetched', page.items.length,
            'items, from', page.offset);
        items.push(...page.items);
        next = page!.next!;
    }

    return items;
}

async function login() {
    const [tokenRes, err1] = await GetToken(config.spotify.clientID, config.spotify.secret);
    if (err1) {
        console.log('failed fetching token');
        return;
    }
    token = tokenRes.access_token;
}


main();