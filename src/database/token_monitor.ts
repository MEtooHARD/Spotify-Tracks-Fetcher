import chalk from "chalk";
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from './kysely_instance.js';

interface TokenStatus {
    last_updated: number; // UTC+0 timestamp
    index: number;
    credentials: Array<{
        client_id: string;
        request_count: number;
        status: boolean | number; // true: ok, false: unusable, number: ban recovery timestamp
    }>;
}

interface TokenEvent {
    id: number;
    timestamp: Date;
    event_type: string;
    client_id: string;
    details: string | null;
}

async function loadTokenStatus(): Promise<TokenStatus | null> {
    try {
        const statusPath = path.join(process.cwd(), 'logs', 'token-status.json');
        const content = await fs.readFile(statusPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        return null;
    }
}

async function getRecentEvents(limit: number = 5): Promise<TokenEvent[]> {
    try {
        const events = await db
            .selectFrom('token_events')
            .selectAll()
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .execute();

        return events as TokenEvent[];
    } catch (error) {
        return [];
    }
}

function formatTimeRemaining(bannedUntil: number): string {
    const now = Date.now();
    const diff = bannedUntil - now;

    if (diff <= 0) return '0s';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatEventTime(timestamp: Date): string {
    const date = new Date(timestamp);
    const taipeiTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return taipeiTime.toISOString().substring(11, 19); // HH:MM:SS
}

async function displayStatus() {
    console.clear();

    const status = await loadTokenStatus();
    const events = await getRecentEvents(10);

    const now = new Date();
    const taipeiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const timestamp = taipeiTime.toISOString().replace('T', ' ').substring(0, 19);

    // Header
    console.log(chalk.cyan('═'.repeat(65)));
    console.log(chalk.cyan.bold(`  Token Manager Monitor - ${timestamp}`));
    console.log(chalk.cyan('═'.repeat(65)));
    console.log();

    if (!status) {
        console.log(chalk.yellow('⚠️  No token status file found'));
        console.log(chalk.gray('   Make sure the main application is running.'));
        console.log();
        return;
    }

    // Credentials Status
    console.log(chalk.magenta.bold('🔐 Credentials Status:'));

    const availableCount = status.credentials.filter(c => c.status === true).length;
    const totalCount = status.credentials.length;
    const availableIds = status.credentials
        .map((c, i) => ({ index: i, status: c.status }))
        .filter(item => item.status === true)
        .map(item => `#${item.index}`)
        .join('  ');

    console.log(chalk.white('  Total          : '), chalk.cyan(totalCount));
    console.log(chalk.white('  Available      : '), chalk.cyan(availableCount));
    console.log(chalk.white('  Available IDs  : '), chalk.green(availableIds || chalk.gray('(none)')));
    console.log(chalk.white('  Current        : '), chalk.cyan(`#${status.index}`) + chalk.gray(` (Used: ${status.credentials[status.index]?.request_count || 0})`));
    console.log();

    // Recovery Queue
    console.log(chalk.yellow.bold('⏰ Recovery Queue (Next 5):'));

    const bannedCreds = status.credentials
        .map((c, i) => ({ index: i, cred: c, recoveryTime: typeof c.status === 'number' ? c.status : null }))
        .filter(item => item.recoveryTime !== null)
        .sort((a, b) => a.recoveryTime! - b.recoveryTime!)
        .slice(0, 5);

    if (bannedCreds.length === 0) {
        console.log(chalk.gray('  No banned credentials'));
    } else {
        for (const item of bannedCreds) {
            const displayId = item.cred.client_id.length > 8
                ? item.cred.client_id.substring(0, 8) + '...'
                : item.cred.client_id;
            const timeLeft = formatTimeRemaining(item.recoveryTime!);
            const recoveryDate = new Date(item.recoveryTime! + 8 * 60 * 60 * 1000); // UTC+8
            const recoveryTimeStr = recoveryDate.toISOString().replace('T', ' ').substring(5, 16); // MM-DD HH:MM

            console.log(
                chalk.white(`  #${item.index}`.padEnd(6)) +
                chalk.gray(`(${displayId})`.padEnd(16)) +
                chalk.yellow(`→ ${recoveryTimeStr}`.padEnd(15)) +
                chalk.cyan(`(${timeLeft})`.padEnd(12)) +
                chalk.gray(`Used: ${item.cred.request_count}`)
            );
        }
    }

    const lastUpdateDate = new Date(status.last_updated + 8 * 60 * 60 * 1000); // UTC+8
    const lastUpdateStr = lastUpdateDate.toISOString().replace('T', ' ').substring(0, 19);
    console.log();
    console.log(chalk.gray('  Last Update: ' + lastUpdateStr));
    console.log();

    // Recent Events
    console.log(chalk.yellow.bold('📊 Recent Events:'));

    if (events.length === 0) {
        console.log(chalk.gray('  No events recorded yet.'));
    } else {
        for (const event of events) {
            const time = formatEventTime(event.timestamp);
            const eventType = event.event_type.padEnd(15);
            // 顯示完整 clientId 或截斷版本
            const displayClientId = event.client_id.length > 8
                ? event.client_id.substring(0, 8) + '...'
                : event.client_id;
            const clientId = displayClientId;

            let typeColor: (str: string) => string;
            switch (event.event_type) {
                case 'ALL_BANNED':
                    typeColor = chalk.red;
                    break;
                case 'ALL_RECOVERED':
                    typeColor = chalk.green;
                    break;
                case 'BANNED':
                    typeColor = chalk.yellow;
                    break;
                case 'SWITCHED':
                    typeColor = chalk.cyan;
                    break;
                default:
                    typeColor = chalk.white;
            }

            const details = event.details ? ` - ${event.details}` : '';
            console.log(
                chalk.gray(`  ${time}  `) +
                typeColor(eventType) +
                chalk.gray(clientId) +
                chalk.gray(details)
            );
        }
    }

    console.log();
    console.log(chalk.gray('Press Ctrl+C to exit. Refreshes every 30 seconds.'));
}

async function main() {
    console.log(chalk.cyan('Starting Token Manager Monitor...'));
    console.log();

    // 顯示初始狀態
    await displayStatus();

    // 每 30 秒更新一次
    setInterval(async () => {
        await displayStatus();
    }, 30_000);
}

main().catch(err => {
    console.error(chalk.red('Error:'), err);
    process.exit(1);
});
