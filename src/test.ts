import chalk from "chalk";
import { GetToken, setToken } from "./api/auth";
import { GetPlaylist } from "./api/endpoints";
import { Config } from "./utils/config_loader";
import { tryCatch } from "./utils/wrapper";

(async () => {
    const [token, err] = await GetToken(Config.spotify[0]!.clientID, Config.spotify[0]!.secret);
    if (!token) return;
    console.log('Token:', chalk.yellow(token.access_token));
    setToken(token.access_token);

    // const [search_res, search_err] = await tryCatch(Search('華語精選', ['playlist']));
    // if (search_err) {
    //     console.error('Search error:', search_err);
    //     return;
    // }

    // console.log('Search result:', search_res);

    // const first_playlist = search_res.playlists!.items[0];

    // console.log('pl:', first_playlist?.name);
    // console.log('pl tracks:', first_playlist?.tracks.total);
    // console.log(first_playlist);

    // const [page_res, page_err] = await tryCatch(defaultFetch(first_playlist!.tracks!.next!));
    // if (page_err) {
    //     console.error('Page fetch error:', page_err);
    //     return;
    // }
    // console.log('Next page result:', page_res);

    const [res, err1] = await tryCatch(GetPlaylist('2AKSKQ0Rnd3I9zH60q70oA'))
    console.log(res);
})();

//https://open.spotify.com/playlist/2AKSKQ0Rnd3I9zH60q70oA