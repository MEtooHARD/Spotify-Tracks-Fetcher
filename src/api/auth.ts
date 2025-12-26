import { Result } from "../types/common.js";
import { SpotifyToken } from "../types/spotify_api.js";
import { extract_res, try_catch } from "../utils/wrapper.js";

// let token: string = '';

// export function getToken(): string {
//     return token;
// }

// export function setToken(newToken: string): void {
//     token = newToken;
// }

// export const BearerToken = () => 'Bearer ' + getToken();

export async function GetToken(
    ID: string,
    secret: string
): Promise<Result<SpotifyToken>> {
    return await try_catch<SpotifyToken>(extract_res<SpotifyToken>(fetch(
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