import { Album, Artist, Category, ISO3166_1_Alpha_2, Locale, Markets, Paged, Playlist, ResourceType, SearchResult, Track } from "../types/spotify_api.js";
import { fitRangeInt } from "../utils/helpers.js";
import { CredentialManager } from "./credential_manager.js";


const cred_mgr = CredentialManager.getInstance();

export async function GetAlbums(
    ids: Array<string>,
    market?: ISO3166_1_Alpha_2
): Promise<{ albums: Array<Album> }> {
    const url = 'https://api.spotify.com/v1/albums?'
        .concat(`ids=${ids.join(',')}`)
        .concat(market ? `&market=${market}` : '');
    return await cred_mgr.api_get<{ albums: Array<Album> }>(url);
}

export async function GetArtists(
    ids: Array<string>,
): Promise<{ artists: Array<Artist> }> {
    const url = 'https://api.spotify.com/v1/artists?'
        .concat(`ids=${ids.join(',')}`);

    return await cred_mgr.api_get<{ artists: Array<Artist> }>(url);
}

export async function GetArtistAlbums(
    id: string,
    include_groups?: 'album' | 'single' | 'appears_on' | 'compilation',
    market?: Markets,
    limit?: number,
    offset?: number
): Promise<Paged<Album>> {
    const url = 'https://api.spotify.com/v1/artists/' + id + '/albums?'
        .concat(include_groups ? `&include_groups=${include_groups}` : '')
        .concat(market ? `&market=${market}` : '')
        .concat(limit ? `&limit=${fitRangeInt(limit, 1, 50)}` : '')
        .concat(offset ? `&offset=${fitRangeInt(offset)}` : '');

    return await cred_mgr.api_get<Paged<Album>>(url);
}

export async function Search(
    q: string,
    type: Array<ResourceType>,
    market?: ISO3166_1_Alpha_2,
    limit?: number,
    offset?: number,
    include_external?: 'audio'
): Promise<SearchResult> {
    const url = 'https://api.spotify.com/v1/search?'
        .concat(`q=${encodeURIComponent(q)}`)
        .concat(`&type=${type}`)
        .concat(market ? `&market=${market}` : '')
        .concat(limit ? `&limit=${fitRangeInt(limit, 1, 50)}` : '')
        .concat(offset ? `&offset=${fitRangeInt(offset)}` : '')
        .concat(include_external ? `&include_external=${include_external}` : '');

    return await cred_mgr.api_get<SearchResult>(url);
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

    return await cred_mgr.api_get<{ categories: Paged<Category> }>(url);
}

export async function GetTracks(
    ids: Array<string>,
    market?: ISO3166_1_Alpha_2,
): Promise<{ tracks: Array<Track> }> {
    const url = 'https://api.spotify.com/v1/tracks?'
        .concat(`ids=${ids.join(',')}`)
        .concat(market ? `&market=${market}` : '');

    return await cred_mgr.api_get<{ tracks: Array<Track> }>(url);
}

export async function GetPlaylist(
    id: string,
    market?: ISO3166_1_Alpha_2
): Promise<Playlist> {
    const url = `https://api.spotify.com/v1/playlists/${id}`
        .concat(market ? `?market=${market}` : '');

    return await cred_mgr.api_get<Playlist>(url);
}