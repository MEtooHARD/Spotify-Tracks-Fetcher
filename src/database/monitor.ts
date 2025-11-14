import chalk from "chalk";
import { db } from "./kysely_instance";

interface TableStats {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
}

interface QueueStats {
    track: number;
    album: number;
    artist: number;
    playlist: number;
}

interface QueueThroughput {
    track: number;
    album: number;
    artist: number;
    playlist: number;
    duration: number;  // 統計的時間長度（秒）
}

interface QueueHistory {
    stats: QueueStats;
    timestamp: number;
}

interface TableHistory {
    stats: TableStats;
    timestamp: number;
}

interface OtherStats {
    genres: number;
    categories: number;
    searchQueries: number;
    searchQueriesValid: number;      // search_queries 中可用的（會被搜尋的）
    searchQueriesGenre: number;      // search_queries 中的 genre 類型
    searchQueriesCategory: number;   // search_queries 中的 category 類型
    searchQueriesGenreValid: number;      // genre 類型中可用的
    searchQueriesCategoryValid: number;   // category 類型中可用的
}

// 記錄上次的數據
let lastTableStats: TableStats | null = null;
let lastQueueStats: QueueStats | null = null;
let lastOtherStats: OtherStats | null = null;

// 記錄啟動時的初始數據
let initialTableStats: TableStats | null = null;
let initialQueueStats: QueueStats | null = null;
let initialOtherStats: OtherStats | null = null;

// 記錄監控啟動時間
let monitorStartTime: number | null = null;

// 記錄 Queue 的歷史數據（用於計算固定時間窗口的變化）
const queueHistory: QueueHistory[] = [];
const tableHistory: TableHistory[] = [];
const THROUGHPUT_WINDOW_SECONDS = 300;  // 5 分鐘窗口

async function getTableStats(): Promise<TableStats> {
    const [tracks, albums, artists, playlists] = await Promise.all([
        db.selectFrom('tracks').select(db.fn.countAll().as('count')).executeTakeFirst(),
        db.selectFrom('albums').select(db.fn.countAll().as('count')).executeTakeFirst(),
        db.selectFrom('artists').select(db.fn.countAll().as('count')).executeTakeFirst(),
        db.selectFrom('playlists').select(db.fn.countAll().as('count')).executeTakeFirst()
    ]);

    return {
        tracks: Number(tracks?.count ?? 0),
        albums: Number(albums?.count ?? 0),
        artists: Number(artists?.count ?? 0),
        playlists: Number(playlists?.count ?? 0)
    };
}

async function getQueueStats(): Promise<QueueStats> {
    const result = await db
        .selectFrom('ids')
        .select(['type', db.fn.count('id').as('count')])
        .groupBy('type')
        .execute();

    const stats: QueueStats = {
        track: 0,
        album: 0,
        artist: 0,
        playlist: 0
    };

    for (const row of result) {
        // 只計算我們關心的類型
        if (row.type in stats) {
            stats[row.type as keyof QueueStats] = Number(row.count);
        }
    }

    return stats;
}

async function getOtherStats(): Promise<OtherStats> {
    const [genres, categories, searchQueries] = await Promise.all([
        db.selectFrom('genres').select(db.fn.countAll().as('count')).executeTakeFirst(),
        db.selectFrom('categories').select(db.fn.countAll().as('count')).executeTakeFirst(),
        db.selectFrom('search_queries').select(db.fn.countAll().as('count')).executeTakeFirst()
    ]);

    // 取得 search_queries 按類型分組的統計
    const searchQueriesByType = await db
        .selectFrom('search_queries')
        .select(['type', db.fn.count('query').as('count')])
        .groupBy('type')
        .execute();

    let searchQueriesGenre = 0;
    let searchQueriesCategory = 0;

    for (const row of searchQueriesByType) {
        if (row.type === 'genre') {
            searchQueriesGenre = Number(row.count);
        } else if (row.type === 'category') {
            searchQueriesCategory = Number(row.count);
        }
    }

    // 計算可用的查詢（超過 30 天或從未搜過）
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    const validQueries = await db
        .selectFrom('search_queries')
        .select(db.fn.count('query').as('count'))
        .where((eb) => eb.or([
            eb('last_searched_at', 'is', null),
            eb('last_searched_at', '<', threshold)
        ]))
        .executeTakeFirst();

    // 按類型統計可用的查詢
    const validQueriesByType = await db
        .selectFrom('search_queries')
        .select(['type', db.fn.count('query').as('count')])
        .where((eb) => eb.or([
            eb('last_searched_at', 'is', null),
            eb('last_searched_at', '<', threshold)
        ]))
        .groupBy('type')
        .execute();

    let searchQueriesGenreValid = 0;
    let searchQueriesCategoryValid = 0;

    for (const row of validQueriesByType) {
        if (row.type === 'genre') {
            searchQueriesGenreValid = Number(row.count);
        } else if (row.type === 'category') {
            searchQueriesCategoryValid = Number(row.count);
        }
    }

    return {
        genres: Number(genres?.count ?? 0),
        categories: Number(categories?.count ?? 0),
        searchQueries: Number(searchQueries?.count ?? 0),
        searchQueriesValid: Number(validQueries?.count ?? 0),
        searchQueriesGenre,
        searchQueriesCategory,
        searchQueriesGenreValid,
        searchQueriesCategoryValid
    };
}

function formatDiff(current: number, last: number | null): string {
    if (last === null) return '        ';  // 固定寬度佔位

    const diff = current - last;
    if (diff === 0) return '        ';
    if (diff > 0) return chalk.green(` (+${diff.toLocaleString()})`.padEnd(8));
    return chalk.red(` (${diff.toLocaleString()})`.padEnd(8));
}

function formatTotalDiff(current: number, initial: number | null): string {
    if (initial === null) return '';

    const diff = current - initial;
    if (diff === 0) return chalk.gray(' (±0)');
    if (diff > 0) return chalk.greenBright(` (↑${diff.toLocaleString()})`);
    return chalk.redBright(` (↓${Math.abs(diff).toLocaleString()})`);
} async function displayStats(): Promise<void> {
    const tableStats = await getTableStats();
    const queueStats = await getQueueStats();
    const otherStats = await getOtherStats();

    // 第一次執行時記錄初始值
    if (initialTableStats === null) {
        initialTableStats = { ...tableStats };
        initialQueueStats = { ...queueStats };
        initialOtherStats = { ...otherStats };
    }

    // 設定監控起始時間
    if (monitorStartTime === null) {
        monitorStartTime = Date.now();
    }

    // 清空螢幕（保留歷史）
    console.clear();

    const timestamp = new Date().toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    console.log(chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold(`  Database Monitor - ${timestamp}`));

    // Display monitor start time
    const monitorStartTimeStr = new Date(monitorStartTime).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    console.log(chalk.gray(`  Started at: ${monitorStartTimeStr}`));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();

    // Helper function to format time window display
    const formatTimeWindow = (windowSeconds: number): string => {
        if (windowSeconds === 0) return '';
        const minutes = Math.floor(windowSeconds / 60);
        const seconds = Math.floor(windowSeconds % 60);
        const timeStr = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
        return chalk.gray(` [${timeStr}]`);
    };

    const formatFromTime = (): string => {
        return chalk.gray(' [all time]');
    };

    // Entity Tables - 計算監控總時長
    if (monitorStartTime === null) {
        monitorStartTime = Date.now();
    }
    const totalMonitoringSeconds = (Date.now() - monitorStartTime) / 1000;

    // 計算 Entity Tables 的 5 分鐘窗口變化
    const tableNow = Date.now();
    let tableWindowProcessed = { tracks: 0, albums: 0, artists: 0, playlists: 0 };
    let tableWindowSeconds = 0;

    if (tableHistory.length >= 1) {
        const oldest = tableHistory[0]!;
        tableWindowSeconds = (tableNow - oldest.timestamp) / 1000;

        tableWindowProcessed = {
            tracks: tableStats.tracks - oldest.stats.tracks,
            albums: tableStats.albums - oldest.stats.albums,
            artists: tableStats.artists - oldest.stats.artists,
            playlists: tableStats.playlists - oldest.stats.playlists
        };
    }

    // 記錄當前數據
    tableHistory.push({
        stats: { ...tableStats },
        timestamp: tableNow
    });

    // 清理超過時間窗口的舊數據
    const tableCutoffTime = tableNow - THROUGHPUT_WINDOW_SECONDS * 1000;
    while (tableHistory.length > 0 && tableHistory[0]!.timestamp < tableCutoffTime) {
        tableHistory.shift();
    }

    const formatWindowDiff = (processed: number): string => {
        if (processed === 0) return '        ';  // 固定寬度佔位
        if (processed > 0) return chalk.cyan(` [+${processed.toLocaleString()}]`.padEnd(8));
        return chalk.magenta(` [${processed.toLocaleString()}]`.padEnd(8));
    };

    console.log(chalk.yellow.bold('📊 Entity Tables:'.padEnd(33)) + formatTimeWindow(tableWindowSeconds).padEnd(18) + formatFromTime());
    console.log(chalk.white('  Tracks    : '), chalk.green(tableStats.tracks.toLocaleString().padStart(10)) + formatDiff(tableStats.tracks, lastTableStats?.tracks ?? null) + formatWindowDiff(tableWindowProcessed.tracks) + formatTotalDiff(tableStats.tracks, initialTableStats?.tracks ?? null));
    console.log(chalk.white('  Albums    : '), chalk.green(tableStats.albums.toLocaleString().padStart(10)) + formatDiff(tableStats.albums, lastTableStats?.albums ?? null) + formatWindowDiff(tableWindowProcessed.albums) + formatTotalDiff(tableStats.albums, initialTableStats?.albums ?? null));
    console.log(chalk.white('  Artists   : '), chalk.green(tableStats.artists.toLocaleString().padStart(10)) + formatDiff(tableStats.artists, lastTableStats?.artists ?? null) + formatWindowDiff(tableWindowProcessed.artists) + formatTotalDiff(tableStats.artists, initialTableStats?.artists ?? null));
    console.log(chalk.white('  Playlists : '), chalk.green(tableStats.playlists.toLocaleString().padStart(10)) + formatDiff(tableStats.playlists, lastTableStats?.playlists ?? null) + formatWindowDiff(tableWindowProcessed.playlists) + formatTotalDiff(tableStats.playlists, initialTableStats?.playlists ?? null));
    console.log(chalk.white('  ─────────────────────'));
    const totalTable = tableStats.tracks + tableStats.albums + tableStats.artists + tableStats.playlists;
    const lastTotalTable = lastTableStats ? lastTableStats.tracks + lastTableStats.albums + lastTableStats.artists + lastTableStats.playlists : null;
    const initialTotalTable = initialTableStats ? initialTableStats.tracks + initialTableStats.albums + initialTableStats.artists + initialTableStats.playlists : null;
    const totalWindowProcessed = tableWindowProcessed.tracks + tableWindowProcessed.albums + tableWindowProcessed.artists + tableWindowProcessed.playlists;
    console.log(chalk.white('  Total     : '), chalk.greenBright(totalTable.toLocaleString().padStart(10)) + formatDiff(totalTable, lastTotalTable) + formatWindowDiff(totalWindowProcessed) + formatTotalDiff(totalTable, initialTotalTable));
    console.log();

    // Queue (IDs table) - 計算固定時間窗口的 throughput
    const queueNow = Date.now();

    // 計算時間窗口內的變化（在添加新數據之前）
    let windowProcessed = { track: 0, album: 0, artist: 0, playlist: 0 };
    let actualWindowSeconds = 0;

    if (queueHistory.length >= 1) {
        const oldest = queueHistory[0]!;
        actualWindowSeconds = (queueNow - oldest.timestamp) / 1000;

        windowProcessed = {
            track: oldest.stats.track - queueStats.track,
            album: oldest.stats.album - queueStats.album,
            artist: oldest.stats.artist - queueStats.artist,
            playlist: oldest.stats.playlist - queueStats.playlist
        };
    }

    // 記錄當前數據
    queueHistory.push({
        stats: { ...queueStats },
        timestamp: queueNow
    });

    // 清理超過時間窗口的舊數據
    const queueCutoffTime = queueNow - THROUGHPUT_WINDOW_SECONDS * 1000;
    while (queueHistory.length > 0 && queueHistory[0]!.timestamp < queueCutoffTime) {
        queueHistory.shift();
    }

    const formatWindowThroughput = (processed: number): string => {
        if (processed === 0) return '        ';  // 固定寬度佔位

        if (processed > 0) {
            // 減少（處理掉）- 綠色向下箭頭
            return chalk.green(` (↓${processed})`.padEnd(8));
        } else {
            // 增加（新加入）- 紅色向上箭頭
            return chalk.red(` (↑${Math.abs(processed)})`.padEnd(8));
        }
    };

    console.log(chalk.magenta.bold('🔄 Queue (Pending IDs):'.padEnd(33)) + formatTimeWindow(actualWindowSeconds));
    console.log(chalk.white('  Track     : '), chalk.cyan(queueStats.track.toLocaleString().padStart(10)) + formatDiff(queueStats.track, lastQueueStats?.track ?? null) + formatWindowThroughput(windowProcessed.track));
    console.log(chalk.white('  Album     : '), chalk.cyan(queueStats.album.toLocaleString().padStart(10)) + formatDiff(queueStats.album, lastQueueStats?.album ?? null) + formatWindowThroughput(windowProcessed.album));
    console.log(chalk.white('  Artist    : '), chalk.cyan(queueStats.artist.toLocaleString().padStart(10)) + formatDiff(queueStats.artist, lastQueueStats?.artist ?? null) + formatWindowThroughput(windowProcessed.artist));
    console.log(chalk.white('  Playlist  : '), chalk.cyan(queueStats.playlist.toLocaleString().padStart(10)) + formatDiff(queueStats.playlist, lastQueueStats?.playlist ?? null) + formatWindowThroughput(windowProcessed.playlist));
    console.log(chalk.white('  ─────────────────────'));
    const totalQueue = queueStats.track + queueStats.album + queueStats.artist + queueStats.playlist;
    const lastTotalQueue = lastQueueStats ? lastQueueStats.track + lastQueueStats.album + lastQueueStats.artist + lastQueueStats.playlist : null;
    const totalProcessed = windowProcessed.track + windowProcessed.album + windowProcessed.artist + windowProcessed.playlist;
    console.log(chalk.white('  Total     : '), chalk.cyanBright(totalQueue.toLocaleString().padStart(10)) + formatDiff(totalQueue, lastTotalQueue) + formatWindowThroughput(totalProcessed));
    console.log();

    // Other Tables
    console.log(chalk.blue.bold('📝 Other Tables:'));
    console.log(chalk.white('  Genres         : '), chalk.yellow(otherStats.genres.toLocaleString().padStart(9)) + formatDiff(otherStats.genres, lastOtherStats?.genres ?? null) + formatTotalDiff(otherStats.genres, initialOtherStats?.genres ?? null));
    console.log(chalk.white('  Categories     : '), chalk.yellow(otherStats.categories.toLocaleString().padStart(9)) + formatDiff(otherStats.categories, lastOtherStats?.categories ?? null) + formatTotalDiff(otherStats.categories, initialOtherStats?.categories ?? null));
    console.log(chalk.white('  Search Queries : ') +
        chalk.yellow(`<${otherStats.searchQueriesValid}/${otherStats.searchQueries}>`.padStart(10)) +
        formatDiff(otherStats.searchQueries, lastOtherStats?.searchQueries ?? null) +
        formatTotalDiff(otherStats.searchQueries, initialOtherStats?.searchQueries ?? null));
    console.log(chalk.gray('    ├─ Genre     : ') +
        chalk.gray(`<${otherStats.searchQueriesGenreValid}/${otherStats.searchQueriesGenre}>`.padStart(10)) +
        formatDiff(otherStats.searchQueriesGenre, lastOtherStats?.searchQueriesGenre ?? null) +
        formatTotalDiff(otherStats.searchQueriesGenre, initialOtherStats?.searchQueriesGenre ?? null));
    console.log(chalk.gray('    └─ Category  : ') +
        chalk.gray(`<${otherStats.searchQueriesCategoryValid}/${otherStats.searchQueriesCategory}>`.padStart(10)) +
        formatDiff(otherStats.searchQueriesCategory, lastOtherStats?.searchQueriesCategory ?? null) +
        formatTotalDiff(otherStats.searchQueriesCategory, initialOtherStats?.searchQueriesCategory ?? null));
    console.log();

    console.log(chalk.gray('Press Ctrl+C to exit'));
    console.log(chalk.cyan('═'.repeat(60)));

    // 更新上次的數據
    lastTableStats = { ...tableStats };
    lastQueueStats = { ...queueStats };
    lastOtherStats = { ...otherStats };
}

async function main() {
    const intervalSeconds = parseInt(process.argv[2] || '10', 10);

    console.log(chalk.blue('[DB Monitor]'), `Starting monitor, refresh every ${intervalSeconds} seconds...`);
    console.log();

    // 立即顯示一次
    await displayStats();

    // 定時更新
    setInterval(async () => {
        await displayStats();
    }, intervalSeconds * 1000);
}

// 處理 Ctrl+C 優雅退出
process.on('SIGINT', async () => {
    console.log('\n');
    console.log(chalk.yellow('[DB Monitor]'), 'Shutting down...');
    await db.destroy();
    process.exit(0);
});

main().catch(async (error) => {
    console.error(chalk.red('[DB Monitor Error]'), error);
    await db.destroy();
    process.exit(1);
});
