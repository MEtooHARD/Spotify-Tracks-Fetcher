type Success<T> = [T, null];
type Failure<E> = [null, E];
export type Result<T, E = Error> = Success<T> | Failure<E>;

export enum StatusCode {
    OK = 200, // The request has succeeded. The client can read the result of the request in the body and the headers of the response.
    Created = 201, // The request has been fulfilled and resulted in a new resource being created.
    Accepted = 202, // The request has been accepted for processing, but the processing has not been completed.
    NoContent = 204, // The request has succeeded but returns no message body.
    NotModified = 304, // Not Modified. See Conditional requests.
    BadRequest = 400, // The request could not be understood by the server due to malformed syntax. The message body will contain more information; see Response Schema.
    Unauthorized = 401, // The request requires user authentication or, if the request included authorization credentials, authorization has been refused for those credentials.
    Forbidden = 403, // The server understood the request, but is refusing to fulfill it.
    NotFound = 404, // The requested resource could not be found. This error can be due to a temporary or permanent condition.
    TooManyRequests = 429, // Rate limiting has been applied.
    InternalServerError = 500, // You should never receive this error because our clever coders catch them all ... but if you are unlucky enough to get one, please report it to us through a comment at the bottom of this page.
    BadGateway = 502, // The server was acting as a gateway or proxy and received an invalid response from the upstream server.
    ServiceUnavailable = 503, // The server is currently unable to handle the request due to a temporary condition which will be alleviated after some delay. You can choose to resend the request again.
}

export interface SpotifyError {
    status: number;
    message: string;
}

export interface SpotifyToken {
    access_token: string;
    token_type: string;
    expires_in: number;
}

export type ISO639_1 =
    | 'af' | 'am' | 'ar' | 'az' | 'bg' | 'bn' | 'ca' | 'cs' | 'da' | 'de'
    | 'el' | 'en' | 'es' | 'et' | 'fa' | 'fi' | 'fil' | 'fr' | 'gu' | 'he'
    | 'hi' | 'hr' | 'hu' | 'id' | 'is' | 'it' | 'ja' | 'kn' | 'ko' | 'lt'
    | 'lv' | 'ml' | 'mr' | 'ms' | 'nl' | 'no' | 'pl' | 'pt' | 'ro' | 'ru'
    | 'sk' | 'sl' | 'sr' | 'sv' | 'sw' | 'ta' | 'te' | 'th' | 'tr' | 'uk'
    | 'ur' | 'vi' | 'zh';

export type ISO3166_1_Alpha_2 =
    | 'AF' | 'AX' | 'AL' | 'DZ' | 'AS' | 'AD' | 'AO' | 'AI' | 'AQ' | 'AG'
    | 'AR' | 'AM' | 'AW' | 'AU' | 'AT' | 'AZ' | 'BS' | 'BH' | 'BD' | 'BB'
    | 'BY' | 'BE' | 'BZ' | 'BJ' | 'BM' | 'BT' | 'BO' | 'BQ' | 'BA' | 'BW'
    | 'BV' | 'BR' | 'IO' | 'BN' | 'BG' | 'BF' | 'BI' | 'KH' | 'CM' | 'CA'
    | 'CV' | 'KY' | 'CF' | 'TD' | 'CL' | 'CN' | 'CX' | 'CC' | 'CO' | 'KM'
    | 'CG' | 'CD' | 'CK' | 'CR' | 'CI' | 'HR' | 'CU' | 'CW' | 'CY' | 'CZ'
    | 'DK' | 'DJ' | 'DM' | 'DO' | 'EC' | 'EG' | 'SV' | 'GQ' | 'ER' | 'EE'
    | 'SZ' | 'ET' | 'FK' | 'FO' | 'FJ' | 'FI' | 'FR' | 'GF' | 'PF' | 'TF'
    | 'GA' | 'GM' | 'GE' | 'DE' | 'GH' | 'GI' | 'GR' | 'GL' | 'GD' | 'GP'
    | 'GU' | 'GT' | 'GG' | 'GN' | 'GW' | 'GY' | 'HT' | 'HM' | 'VA' | 'HN'
    | 'HK' | 'HU' | 'IS' | 'IN' | 'ID' | 'IR' | 'IQ' | 'IE' | 'IM' | 'IL'
    | 'IT' | 'JM' | 'JP' | 'JE' | 'JO' | 'KZ' | 'KE' | 'KI' | 'KP' | 'KR'
    | 'KW' | 'KG' | 'LA' | 'LV' | 'LB' | 'LS' | 'LR' | 'LY' | 'LI' | 'LT'
    | 'LU' | 'MO' | 'MG' | 'MW' | 'MY' | 'MV' | 'ML' | 'MT' | 'MH' | 'MQ'
    | 'MR' | 'MU' | 'YT' | 'MX' | 'FM' | 'MD' | 'MC' | 'MN' | 'ME' | 'MS'
    | 'MA' | 'MZ' | 'MM' | 'NA' | 'NR' | 'NP' | 'NL' | 'NC' | 'NZ' | 'NI'
    | 'NE' | 'NG' | 'NU' | 'NF' | 'MK' | 'MP' | 'NO' | 'OM' | 'PK' | 'PW'
    | 'PS' | 'PA' | 'PG' | 'PY' | 'PE' | 'PH' | 'PN' | 'PL' | 'PT' | 'PR'
    | 'QA' | 'RE' | 'RO' | 'RU' | 'RW' | 'BL' | 'SH' | 'KN' | 'LC' | 'MF'
    | 'PM' | 'VC' | 'WS' | 'SM' | 'ST' | 'SA' | 'SN' | 'RS' | 'SC' | 'SL'
    | 'SG' | 'SX' | 'SK' | 'SI' | 'SB' | 'SO' | 'ZA' | 'GS' | 'SS' | 'ES'
    | 'LK' | 'SD' | 'SR' | 'SJ' | 'SE' | 'CH' | 'SY' | 'TW' | 'TJ' | 'TZ'
    | 'TH' | 'TL' | 'TG' | 'TK' | 'TO' | 'TT' | 'TN' | 'TR' | 'TM' | 'TC'
    | 'TV' | 'UG' | 'UA' | 'AE' | 'GB' | 'US' | 'UM' | 'UY' | 'UZ' | 'VU'
    | 'VE' | 'VN' | 'VG' | 'VI' | 'WF' | 'EH' | 'YE' | 'ZM' | 'ZW';

export type Locale = `${ISO639_1}_${ISO3166_1_Alpha_2}`;

export type ExternalUrls = {
    spotify: string;
}

export type AlbumType = 'album' | 'single' | 'compilation';

export type DatePrecision = 'day' | 'month' | 'year';

export type RestrictionReason = 'market' | 'product' | 'explicit';

export type SearchType = "album" | "artist" | "playlist" | "track" | "show" | "episode" | "audiobook";

export type Restrictions = {
    reason: RestrictionReason;
};

export type Image = {
    url: string;
    height: number;
    weight: number;
}

export type CopyrightObject = {
    text: string;
    type: 'C' | 'P';
}

type ExternalIds = {
    isrc: string;
    ean: string;
    upc: string;
}

export interface Paged<T> {
    href: string;
    limit: number;
    next?: string;
    offset: number;
    previous?: string;
    total: number;
    items: Array<T>;
}

export interface Album {
    album_type: AlbumType;
    total_tracks: number;
    available_markets: Array<ISO3166_1_Alpha_2>;
    external_urls: ExternalUrls;
    href: string;
    id: string;
    images: Array<Image>;
    name: string;
    release_date: string;
    release_date_precision: DatePrecision;
    restrictions: Restrictions;
    type: 'album';
    uri: string;
    artists: Array<SimplifiedArtist>;
    tracks: Paged<SimplifiedTrack>;
    copyrights: Array<CopyrightObject>;
    external_ids: ExternalIds;
    label: string;
    popularity: number;
}

export interface SimplifiedAlbum extends Omit<Album, 'tracks' | 'copyrights' | 'external_ids' | 'label' | 'popularity'> { }

export interface SimplifiedArtist {
    external_urls: ExternalUrls;
    href: string;
    id: string;
    name: string;
    type: 'artist';
    uri: string;
}

export interface Artist {
    external_urls: {
        spotify: string;
    },
    followers: {
        href: string,
        total: number
    },
    genres: Array<string>,
    href: string,
    id: string,
    images: Array<{
        height: number,
        url: string,
        width: number
    }>,
    name: string,
    popularity: number,
    type: string,
    uri: string
}

export interface Category {
    href: string;
    icons: Array<Image>;
    id: string;
    name: string;
}

export interface Genres {
    genres: Array<string>;
}

export interface Markets {
    markets: Array<ISO3166_1_Alpha_2>;
}

export interface Playlist {
    collaborative: boolean;
    description?: string;
    external_urls: ExternalUrls;
    href: string;
    id: string;
    images: Array<Image>;
    name: string;
    owner: {
        external_urls: ExternalUrls;
        href: string;
        id: string;
        type: 'user';
        uri: string;
        display_name?: string;
    };
    public: boolean;
    snapshot_id: string;
    tracks: Paged<PlaylistTrack>;
    type: 'playlist';
    uri: string;
}

// export interface SimplifiedPlaylist extends Omit<Playlist, ''> {}

export interface PlaylistTrack {
    added_at?: string;
    added_by?: {
        external_urls: ExternalUrls;
        href: string;
        id: string;
        type: 'user';
        uri: string;
    };
    is_local: boolean;
    track: Track;
}

export interface SimplifiedTrack {
    artists: Array<SimplifiedArtist>;
    available_markets: Array<ISO3166_1_Alpha_2>;
    disc_number: number;
    duration_ms: number;
    explicit: boolean;
    external_urls: ExternalUrls;
    href: string;
    id: string;
    is_playable: boolean;
    linked_from: {
        external_urls: ExternalUrls;
        href: string;
        id: string;
        type: 'track';
        uri: string;
    };
    restrictions: Restrictions;
    name: string;
    track_number: number;
    type: 'track';
    uri: string;
    is_local: boolean;
}

export interface SimplifiedTrack extends Omit<Track, 'album' | 'external_ids'> { }

export interface Track {
    album: SimplifiedAlbum;
    artists: Array<SimplifiedArtist>;
    available_markets: Array<ISO3166_1_Alpha_2>;
    disc_number: number;
    duration_ms: number;
    explicit: boolean;
    external_ids: ExternalIds;
    external_urls: ExternalUrls;
    href: string;
    id: string;
    is_playable: boolean;
    linked_from?: {};
    restrictions: Restrictions;
    name: string;
    popularity: number;
    track_number: number;
    type: 'track';
    uri: string;
    is_local: boolean;
}

export interface SearchResult {
    tracks?: Paged<Track>;
    artists?: Paged<Artist>;
    albums?: Paged<SimplifiedAlbum>;
    playlists?: Paged<Playlist>;
    shows: null;
    episodes: null;
    audiobooks: null;
}