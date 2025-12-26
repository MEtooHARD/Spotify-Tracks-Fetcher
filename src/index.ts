import chalk from "chalk";
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { CredentialManager } from "./api/credential_manager.js";
import { TaskRunner } from "./core/task.js";
import { AlbumIdTaskSource } from "./core/tasks/album_id.js";
import { AlbumPagesTaskSource } from "./core/tasks/album_pages.js";
import { ArtistTaskSource } from "./core/tasks/artist.js";
import { PlaylistTaskSource } from "./core/tasks/playlist.js";
import { SearchTaskSource } from "./core/tasks/search.js";
import { TrackTaskSource } from "./core/tasks/track.js";
import { Config } from "./utils/config_loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
    // initialize CredentialManager
    const cred_manager = CredentialManager.getInstance();
    cred_manager.set_credential(Config.spotify.map(c => ({
        client_id: c.clientID,
        secret: c.secret,
        status: true,
        request_count: 0
    })));

    // Recover from saved state if exists
    let lastSaveTime: number;
    try {
        const STATUS_FILE = path.join(__dirname, '../logs/token-status.json');
        const credential_record = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
        await cred_manager.recover_from_rec(credential_record);
        lastSaveTime = credential_record.last_updated || Date.now();
        console.log(chalk.green('[main]'), 'Recovered credential state from token-status.json');
    } catch (error) {
        console.log(chalk.yellow('[main]'), 'No existing credential record, starting fresh');
        lastSaveTime = Date.now();
        await cred_manager.refresh_token();
    }

    const runner = new TaskRunner([
        TrackTaskSource.getInstance(),
        ArtistTaskSource.getInstance(),
        AlbumIdTaskSource.getInstance(),
        AlbumPagesTaskSource.getInstance(),
        // AlbumTaskSource.getInstance(),
        PlaylistTaskSource.getInstance(),
        SearchTaskSource.getInstance()
    ], 1, 0);

    cred_manager.set_check_loop();
    cred_manager.on_recovery(() => runner.resume());
    cred_manager.on_all_banned(() => runner.pause());

    // Periodic save credential status (every 1 minute)
    const STATUS_FILE = path.join(__dirname, '../logs/token-status.json');
    const MIN_SAVE_INTERVAL = 5000; // minimum 5 seconds between saves

    const saveStatus = () => {
        const now = Date.now();
        if (now - lastSaveTime < MIN_SAVE_INTERVAL) {
            return; // skip if saved too recently
        }

        try {
            const record = cred_manager.make_record();
            fs.writeFileSync(STATUS_FILE, record, 'utf-8');
            lastSaveTime = now;
            console.log(chalk.gray('[main]'), 'Saved credential status');
        } catch (error) {
            console.error(chalk.red('[main]'), 'Failed to save credential status:', error);
        }
    };

    // Save on state change (ban/switch)
    cred_manager.on_state_change(saveStatus);

    // Also save periodically (every 30 seconds) for usage count updates
    setInterval(saveStatus, 30 * 1000);

    // Save on graceful shutdown (Ctrl+C)
    process.on('SIGINT', () => {
        console.log('\n' + chalk.yellow('[main]'), 'Shutting down...');
        saveStatus();
        console.log(chalk.green('[main]'), 'Credential status saved');
        process.exit(0);
    });
    process.on('SIGTERM', () => { saveStatus(); })
    process.on('SIGBREAK', () => { saveStatus(); })

    runner.trigger();
})();
