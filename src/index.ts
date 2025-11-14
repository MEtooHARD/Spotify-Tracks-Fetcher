import chalk from "chalk";
import { getToken } from "./api/auth";
import { TokenManager } from "./api/token_manager";
import { TaskRunner } from "./core/task";
import { AlbumTaskSource } from "./core/tasks/album";
import { ArtistTaskSource } from "./core/tasks/artist";
import { PlaylistTaskSource } from "./core/tasks/playlist";
import { SearchTaskSource } from "./core/tasks/search";
import { TrackTaskSource } from "./core/tasks/track";
import { creds } from "./utils/config_loader";

async function main() {
    // 初始化 Token Manager
    const tokenManager = TokenManager.getInstance();
    const success = await tokenManager.initialize(creds);

    if (!success) {
        console.error(chalk.red('[main]'), 'Failed to initialize token manager');
        return;
    }

    const token = getToken();
    console.log(chalk.green('[token]'), chalk.yellow(token.substring(0, 20) + '...'));

    // Show initial database state
    console.log(chalk.blue('[database]'), 'Initial state:');
    // await logDatabaseStats();

    const runner = new TaskRunner([
        TrackTaskSource.getInstance(),
        AlbumTaskSource.getInstance(),
        ArtistTaskSource.getInstance(),
        PlaylistTaskSource.getInstance(),
        SearchTaskSource.getInstance()
    ], 1, 1000);

    // 整合 TokenManager 和 TaskRunner
    // 當所有 token 都被 ban 時，暫停 TaskRunner
    tokenManager.onAllBanned(() => {
        console.log(chalk.yellow('[main]'), 'All tokens banned, pausing task runner...');
        runner.pause();
    });

    // 當從全員 ban 恢復時，重啟 TaskRunner
    tokenManager.onRecovery(() => {
        console.log(chalk.green('[main]'), 'Token recovered, resuming task runner...');
        runner.resume();
    });

    runner.trigger();
}

main();