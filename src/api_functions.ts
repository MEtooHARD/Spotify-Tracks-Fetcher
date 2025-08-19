import { getToken } from ".";
import { fitRangeInt } from "./helpers";
import { Album, Artist, Category, ISO3166_1_Alpha_2, Locale, Paged, Result, SearchResult, SearchType, SpotifyToken, Track } from "./spotify_types";
import { extractResponse, tryCatch } from "./wrappers";

export const BearerToken = () => 'Bearer ' + getToken();

export async function defaultFetch<T>(url: string): Promise<T> {
    try {
        return await extractResponse<T>(
            fetch(url, {
                method: 'GET',
                headers: { Authorization: BearerToken() }
            })
        );
    } catch (e) {
        // console.log('Error occurred on:', url);
        throw e;
    }
}

export async function GetToken(
    ID: string,
    secret: string
): Promise<Result<SpotifyToken>> {
    return await tryCatch<SpotifyToken>(extractResponse<SpotifyToken>(fetch(
        'https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            "Content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: ID,
            client_secret: secret
        })
    })));
}

export async function GetAlbums(
    ids: Array<string>,
    market?: ISO3166_1_Alpha_2
): Promise<{ albums: Array<Album> }> {
    const url = 'https://api.spotify.com/v1/albums?'
        .concat(`ids=${ids.join(',')}`)
        .concat(market ? `&market=${market}` : '');
    return await defaultFetch<{ albums: Array<Album> }>(url);
}

export async function GetArtists(
    ids: Array<string>,
): Promise<{ artists: Array<Artist> }> {
    const url = 'https://api.spotify.com/v1/artists?'
        .concat(`ids=${ids.join(',')}`);

    return await defaultFetch<{ artists: Array<Artist> }>(url);
}

export async function Search(
    p: string,
    type: Array<SearchType>,
    market?: ISO3166_1_Alpha_2,
    limit?: number,
    offset?: number,
    include_external?: 'audio'
): Promise<SearchResult> {
    const url = 'https://api.spotify.com/v1/search?'
        .concat(`q=${encodeURIComponent(p)}`)
        .concat(`&type=${type}`)
        .concat(market ? `&market=${market}` : '')
        .concat(limit ? `&limit=${fitRangeInt(limit, 1, 50)}` : '')
        .concat(offset ? `&offset=${fitRangeInt(offset)}` : '')
        .concat(include_external ? `&include_external=${include_external}` : '');

    return await defaultFetch<SearchResult>(url);
}

/**
 * 
 * @param locale 
 * @param limit 0-50
 * @param offset 
 * @returns 
 */
export async function GetCategories(
    locale: Locale,
    limit?: number,
    offset?: number
): Promise<{ categories: Paged<Category> }> {
    const url = 'https://api.spotify.com/v1/browse/categories?'
        .concat(`locale=${locale}`)
        .concat(limit ? `&limit=${fitRangeInt(limit, 1, 50)}` : '')
        .concat(offset ? `&offset=${fitRangeInt(offset)}` : '');

    return await defaultFetch<{ categories: Paged<Category> }>(url);
}

export async function GetTracks(
    ids: Array<string>,
    market?: ISO3166_1_Alpha_2,
): Promise<{ tracks: Array<Track> }> {
    const url = 'https://api.spotify.com/v1/tracks?'
        .concat(`ids=${ids.join(',')}`)
        .concat(market ? `&market=${market}` : '');

    return await defaultFetch<{ tracks: Array<Track> }>(url);
}
