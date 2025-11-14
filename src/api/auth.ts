import { Result } from "../types/common";
import { SpotifyToken } from "../types/spotify_api";
import { extractResponse, tryCatch } from "../utils/wrapper";

let token: string = '';

export function getToken(): string {
    return token;
}

export function setToken(newToken: string): void {
    token = newToken;
}

export const BearerToken = () => 'Bearer ' + getToken();

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