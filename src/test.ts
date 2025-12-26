import chalk from "chalk";
import { GetToken } from "./api/auth.js";
import config from './config.json' with { type: 'json' };
import { try_catch } from "./utils/wrapper.js";


(async () => {
    const track_id = "53iuhJlwXhSER5J2IYYv1W";

    // Direct API call with #15 credential
    const n_cred = 4 - 1;
    const clientID = config.spotify[n_cred]!.clientID;
    const secret = config.spotify[n_cred]!.secret;

    // Get token directly
    const [token_res, token_err] = await GetToken(clientID, secret);
    if (token_err) {
        console.log('get yoken fialed');
        return;
    }
    const token = token_res.access_token;
    console.log(chalk.yellow('token'), token);

    // Make API request with token
    // const [res, err] = await tryCatch(
    //     fetch(`https://api.spotify.com/v1/audio-features/${track_id}`, {
    //         headers: { 'Authorization': `Bearer ${token}` }
    //     })
    // );

    const [res, err] = await try_catch(
        fetch(`https://api.spotify.com/v1/audio-features/${track_id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
    );

    if (err) {
        console.log(chalk.red('Error:'), err);
        return;
    }

    const data = await res!.json();
    console.log(chalk.cyan('Audio Features:'), data);

});


(async () => {
    const track_id = "53iuhJlwXhSER5J2IYYv1W";

    const credentials = config.spotify;

    for (let index = 0; index < credentials.length; index++) {
        const cred = credentials[index];
        console.log(`cred #${index + 1}`);

        const [token_rex, token_err] = await GetToken(cred!.clientID, cred!.secret);

        if (token_err) {
            console.log(`\tfailed to get token`);
            return;
        }

        const token = token_rex.access_token;
        console.log('\ttoken:', token.slice(0, 20) + '...');

        const [test_res, test_err] = await try_catch(
            fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        );

        if (test_err) {
            console.log(`\tAPI request failed:`, test_err);
            return;
        }

        if (test_res.status === 200) {
            console.log(`\t${chalk.green('OK')}`);
        } else if (test_res.status === 429) {
            const retryAfter = test_res.headers.get('retry-after');
            console.log(`\t${chalk.red('429')} - Retry after ${chalk.yellow(retryAfter) || 'unknown'}s`);
        } else {
            console.log(`\tStatus: ${test_res.status}`);
        }
    }
})(); 