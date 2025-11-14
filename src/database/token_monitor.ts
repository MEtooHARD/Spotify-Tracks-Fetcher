import chalk from "chalk";
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from './kysely_instance';

interface TokenStatus {
    lastUpdate: string;
    allBanned: boolean;
    currentCredential: number;
    credentials: Array<{
        index: number;
        clientId: string;
        isBanned: boolean;
        bannedUntil: string | null;
        requestCount: number;
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

function formatTimeRemaining(bannedUntil: string): string {
    const now = new Date();
    const target = new Date(bannedUntil);
    const diff = target.getTime() - now.getTime();

    if (diff <= 0) return '0s';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
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

    const availableCount = status.credentials.filter(c => !c.isBanned).length;
    const totalCount = status.credentials.length;

    for (const cred of status.credentials) {
        // 顯示完整 clientId 或使用截斷格式
        const displayId = typeof cred.clientId === 'string' && cred.clientId.length > 8
            ? cred.clientId.substring(0, 8) + '...'
            : cred.clientId || '?';
        const prefix = `  #${cred.index + 1} (${displayId})`;

        if (cred.isBanned && cred.bannedUntil) {
            const timeLeft = formatTimeRemaining(cred.bannedUntil);
            const bannedDate = new Date(cred.bannedUntil);
            const taipeiRecoveryTime = new Date(bannedDate.getTime() + 8 * 60 * 60 * 1000);
            const recoveryTimeStr = taipeiRecoveryTime.toISOString().replace('T', ' ').substring(5, 16); // MM-DD HH:MM

            console.log(
                chalk.white(prefix.padEnd(20)) +
                chalk.red(` 🚫 BANNED `.padEnd(17)) +
                chalk.gray(`Used: ${cred.requestCount}`.padEnd(12)) +
                chalk.yellow(`→ ${recoveryTimeStr}`)
            );
        } else {
            console.log(
                chalk.white(prefix.padEnd(20)) +
                chalk.green(` ✅ Available`.padEnd(17)) +
                chalk.gray(`Used: ${cred.requestCount}`)
            );
        }
    }

    console.log(chalk.white('  ─────────────────────────────────────────────────────────────'));
    console.log(chalk.white('  Current Credential : '), chalk.cyan(`#${status.currentCredential + 1}`));
    console.log(chalk.white('  All Banned         : '), status.allBanned ? chalk.red('Yes') : chalk.green('No'));
    console.log(chalk.white('  Available          : '), chalk.cyan(`${availableCount} / ${totalCount}`));
    console.log(chalk.white('  Last Update        : '), chalk.gray(status.lastUpdate));
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
    console.log(chalk.gray('Press Ctrl+C to exit. Updates every 10 seconds.'));
}

async function main() {
    console.log(chalk.cyan('Starting Token Manager Monitor...'));
    console.log();

    // 顯示初始狀態
    await displayStatus();

    // 每 10 秒更新一次
    setInterval(async () => {
        await displayStatus();
    }, 10_000);
}

main().catch(err => {
    console.error(chalk.red('Error:'), err);
    process.exit(1);
});
