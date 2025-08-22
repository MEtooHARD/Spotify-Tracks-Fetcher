import { Album, Artist, Playlist, Track } from "./spotify_types"

export type FailureBackup = {
    albums: Album[],
    artists: Artist[],
    tracks: Track[],
    playlists: Playlist[]
}

export type Cred = {
    clientID: string,
    secret: string
}