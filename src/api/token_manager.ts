import chalk from "chalk";
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../database/kysely_instance';
import { Singleton } from "../utils/wrapper";
import { GetToken, setToken } from "./auth";

export interface Cred {
    clientID: string;
    secret: string;
}

interface CredentialStatus {
    bannedUntil: number;  // timestamp (ms)，0 表示未被 ban
    requestCount: number;  // 使用次數統計
}

interface TokenInfo {
    token: string;
    expiresAt: number;  // timestamp (ms)
    credentialIndex: number;
    requestCount: number;  // 使用次數統計
}

/**
 * Token Manager
 * - 自動輪換 credentials
 * - 定時更新 token（提前 5 分鐘更新）
 * - 記錄使用統計
 * - 追蹤每個 credential 的 ban 狀態
 */
export class TokenManager extends Singleton<TokenManager>() {
    private credentials: Cred[] = [];
    private credentialStatus: CredentialStatus[] = [];  // 每個 credential 的狀態
    private currentIndex: number = 0;
    private tokenInfo: TokenInfo | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;
    private running: boolean = false;
    private allBannedState: boolean = false;  // 追蹤全員 ban 狀態
    private recoveryCheckTimer: NodeJS.Timeout | null = null;
    private onRecoveryCallback: (() => void) | null = null;
    private onAllBannedCallback: (() => void) | null = null;
    private statusUpdateTimer: NodeJS.Timeout | null = null;  // 定期更新狀態檔

    /**
     * 初始化 Token Manager
     * @param credentials 多組 credentials
     */
    public async initialize(credentials: Cred[]): Promise<boolean> {
        if (credentials.length === 0) {
            console.error(chalk.red('[TokenManager]'), 'No credentials provided');
            return false;
        }

        this.credentials = credentials;
        this.credentialStatus = credentials.map(() => ({
            bannedUntil: 0,
            requestCount: 0
        }));
        this.currentIndex = 0;

        console.log(chalk.blue('[TokenManager]'), `Loaded ${credentials.length} credential(s)`);

        // 嘗試從 token-status.json 恢復之前的 ban 狀態
        await this.loadStatusFromFile();

        // 重置 allBannedState - 如果現在有任何 credential 可用，就不應該認為全員 ban 了
        // 因為可能加入了新的未曾被 ban 過的 credentials
        const currentlyAllBanned = this.isAllBanned();
        if (!currentlyAllBanned) {
            this.allBannedState = false;
        }

        // 嘗試獲取 token
        let success = await this.refreshToken();

        // 如果初始化失敗（所有 credentials 都被 ban），允許系統繼續初始化
        // Recovery Monitor 會在有 credential 恢復時自動嘗試更新 token
        if (!success) {
            const isAllBanned = this.isAllBanned();
            if (isAllBanned) {
                console.warn(chalk.yellow('[TokenManager]'),
                    'All credentials are banned, will retry when recovery detected');
                // 不返回 false，繼續初始化
            } else {
                console.error(chalk.red('[TokenManager]'), 'Failed to get initial token');
                return false;
            }
        }

        // 啟動自動更新
        this.startAutoRefresh();
        this.running = true;

        // 啟動恢復監控
        this.startRecoveryMonitor();

        // 啟動定期狀態更新（每 30 秒）
        this.startStatusUpdater();

        // 儲存初始狀態
        await this.saveStatusToFile();

        return true;
    }

    /**
     * 找到下一個可用的 credential（未被 ban 的）
     */
    private findNextAvailableCredential(): number | null {
        const now = Date.now();
        const startIndex = this.currentIndex;

        // 從當前 index 開始找
        for (let i = 0; i < this.credentials.length; i++) {
            const index = (startIndex + i) % this.credentials.length;
            const status = this.credentialStatus[index];

            if (status && status.bannedUntil <= now) {
                return index;
            }
        }

        // 全部都被 ban 了，返回 null
        console.warn(chalk.yellow('[TokenManager]'), 'All credentials are banned, no available credential');
        return null;
    }

    /**
     * 刷新 token（使用當前 credential）
     * 若 GetToken API 呼叫失敗，會自動切換到下一組 credential 重試
     */
    public async refreshToken(): Promise<boolean> {
        // 找到可用的 credential
        const availableIndex = this.findNextAvailableCredential();
        if (availableIndex === null) {
            console.error(chalk.red('[TokenManager]'), 'No available credential');
            return false;
        }

        this.currentIndex = availableIndex;
        const cred = this.credentials[this.currentIndex];
        if (!cred) {
            console.error(chalk.red('[TokenManager]'), 'No credential available');
            return false;
        }

        console.log(chalk.cyan('[TokenManager]'), `Fetching token with credential #${this.currentIndex + 1}...`);

        try {
            const [tokenRes, err] = await GetToken(cred.clientID, cred.secret);

            if (err || !tokenRes) {
                throw new Error(err?.message || 'Failed to get token');
            }

            // 計算過期時間（提前 5 分鐘）
            const expiresAt = Date.now() + (tokenRes.expires_in - 300) * 1000;

            this.tokenInfo = {
                token: tokenRes.access_token,
                expiresAt,
                credentialIndex: this.currentIndex,
                requestCount: 0
            };

            // 更新全域 token
            setToken(tokenRes.access_token);

            const expiresInMin = Math.floor((expiresAt - Date.now()) / 60000);
            console.log(chalk.green('[TokenManager]'), `Token updated, expires in ${expiresInMin} minutes`);

            return true;
        } catch (error) {
            console.error(chalk.red('[TokenManager]'), `Failed to fetch token:`, error);

            // 自動切換到下一組 credential
            if (this.credentials.length > 1) {
                this.currentIndex = (this.currentIndex + 1) % this.credentials.length;
                console.log(chalk.yellow('[TokenManager]'), `Switching to credential #${this.currentIndex + 1}`);
                return await this.refreshToken();  // 遞迴重試
            }

            return false;
        }
    }

    /**
     * 啟動自動更新（定時檢查）
     */
    private startAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        // 每分鐘檢查一次是否需要更新
        this.refreshTimer = setInterval(() => {
            if (!this.tokenInfo) return;

            const timeLeft = this.tokenInfo.expiresAt - Date.now();
            const minutesLeft = Math.floor(timeLeft / 60000);

            // 剩餘時間 <= 65s，立即更新
            if (timeLeft <= 65000) {
                console.log(chalk.yellow('[TokenManager]'), 'Token expired, refreshing...');
                this.refreshToken();
            }
            // 每 5 分鐘 log 一次狀態
            else if (minutesLeft % 5 === 0) {
                console.log(chalk.gray('[TokenManager]'), `Token valid for ${minutesLeft} more minutes (used ${this.tokenInfo.requestCount} times)`);
            }
        }, 60_000);  // 每分鐘檢查
    }

    /**
     * 記錄 token 使用（在 API 呼叫時呼叫）
     */
    public recordUsage(): void {
        if (this.tokenInfo) {
            this.tokenInfo.requestCount++;
            const status = this.credentialStatus[this.currentIndex];
            if (status) {
                status.requestCount++;
            }
        }
    }

    /**
     * 記錄 credential 被 ban（收到 429 時呼叫）
     * @param retryAfterSeconds retry-after header 的秒數
     */
    public recordRateLimit(retryAfterSeconds: number): void {
        const bannedUntil = Date.now() + retryAfterSeconds * 1000;
        const status = this.credentialStatus[this.currentIndex];
        if (status) {
            status.bannedUntil = bannedUntil;
        }

        const bannedUntilTime = new Date(bannedUntil).toLocaleString('zh-TW');
        console.warn(chalk.red('[TokenManager]'),
            `Credential #${this.currentIndex + 1} is rate limited until ${bannedUntilTime} (${retryAfterSeconds}s)`);

        // 記錄事件並更新狀態
        this.logEventToDatabase('BANNED', `Rate limited for ${retryAfterSeconds}s`).catch(err => {
            console.error(chalk.red('[TokenManager]'), 'Failed to log ban event:', err);
        });
        this.saveStatusToFile().catch(err => {
            console.error(chalk.red('[TokenManager]'), 'Failed to save status:', err);
        });
    }

    /**
     * 取得目前 token 資訊
     */
    public getTokenInfo(): TokenInfo | null {
        return this.tokenInfo;
    }

    /**
     * 手動輪換到下一組 credential
     */
    public async switchCredential(): Promise<boolean> {
        if (this.credentials.length <= 1) {
            console.log(chalk.yellow('[TokenManager]'), 'Only one credential available, cannot switch');
            return false;
        }

        // 找到下一個可用的 credential
        const nextIndex = this.findNextAvailableCredential();
        if (nextIndex === null) {
            console.error(chalk.red('[TokenManager]'), 'No available credential to switch to');
            return false;
        }

        // 如果找到的就是當前的，嘗試下一個
        if (nextIndex === this.currentIndex) {
            const tempIndex = (this.currentIndex + 1) % this.credentials.length;
            const status = this.credentialStatus[tempIndex];

            if (status && status.bannedUntil > Date.now()) {
                const waitSeconds = Math.ceil((status.bannedUntil - Date.now()) / 1000);
                console.warn(chalk.yellow('[TokenManager]'),
                    `Next credential #${tempIndex + 1} is banned for ${waitSeconds} more seconds`);
            }

            this.currentIndex = tempIndex;
        } else {
            this.currentIndex = nextIndex;
        }

        console.log(chalk.cyan('[TokenManager]'), `Switching to credential #${this.currentIndex + 1}`);

        // 記錄切換事件
        await this.logEventToDatabase('SWITCHED', `Switched to credential #${this.currentIndex + 1}`);
        await this.saveStatusToFile();

        return await this.refreshToken();
    }

    /**
     * 停止自動更新
     */
    public stop(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.recoveryCheckTimer) {
            clearInterval(this.recoveryCheckTimer);
            this.recoveryCheckTimer = null;
        }
        if (this.statusUpdateTimer) {
            clearInterval(this.statusUpdateTimer);
            this.statusUpdateTimer = null;
        }
        this.running = false;
        console.log(chalk.gray('[TokenManager]'), 'Stopped');
    }

    /**
     * 取得統計資訊
     */
    public getStats(): {
        currentCredential: number;
        totalCredentials: number;
        tokenExpiresIn: number;  // 秒
        requestCount: number;
        isRunning: boolean;
    } | null {
        if (!this.tokenInfo) return null;

        return {
            currentCredential: this.currentIndex + 1,
            totalCredentials: this.credentials.length,
            tokenExpiresIn: Math.max(0, Math.floor((this.tokenInfo.expiresAt - Date.now()) / 1000)),
            requestCount: this.tokenInfo.requestCount,
            isRunning: this.running
        };
    }

    /**
     * 註冊恢復回調（當從全員 ban 狀態恢復時調用）
     */
    public onRecovery(callback: () => void): void {
        this.onRecoveryCallback = callback;
    }

    /**
     * 註冊全員 ban 回調（當進入全員 ban 狀態時調用）
     */
    public onAllBanned(callback: () => void): void {
        this.onAllBannedCallback = callback;
    }

    /**
     * 檢查是否全員被 ban
     */
    public isAllBanned(): boolean {
        const now = Date.now();
        return this.credentialStatus.every(s => s.bannedUntil > now);
    }

    /**
     * 啟動恢復監控（每 5 分鐘檢查一次）
     */
    private startRecoveryMonitor(): void {
        this.recoveryCheckTimer = setInterval(() => {
            const isAllBanned = this.isAllBanned();

            if (this.allBannedState && !isAllBanned) {
                // 從全員 ban 恢復
                console.log(chalk.green('[TokenManager]'), 'Recovered from all-banned state');
                this.allBannedState = false;

                // 嘗試更新 token
                this.refreshToken().catch(err => {
                    console.error(chalk.red('[TokenManager]'), 'Failed to refresh token after recovery:', err);
                });

                this.logEventToDatabase('ALL_RECOVERED', 'At least one credential is now available').catch(err => {
                    console.error(chalk.red('[TokenManager]'), 'Failed to log recovery event:', err);
                });
                this.saveStatusToFile().catch(err => {
                    console.error(chalk.red('[TokenManager]'), 'Failed to save status:', err);
                });

                if (this.onRecoveryCallback) {
                    this.onRecoveryCallback();
                }
            } else if (!this.allBannedState && isAllBanned) {
                // 進入全員 ban 狀態
                console.warn(chalk.red('[TokenManager]'), 'All credentials are now banned');
                this.allBannedState = true;

                this.logEventToDatabase('ALL_BANNED', 'All credentials are rate limited').catch(err => {
                    console.error(chalk.red('[TokenManager]'), 'Failed to log all-banned event:', err);
                });
                this.saveStatusToFile().catch(err => {
                    console.error(chalk.red('[TokenManager]'), 'Failed to save status:', err);
                });

                if (this.onAllBannedCallback) {
                    this.onAllBannedCallback();
                }
            }
            // 沒有狀態變化時不輸出任何 log
        }, 300_000);  // 每 5 分鐘檢查
    }

    /**
     * 啟動定期狀態更新（每 30 秒）
     */
    private startStatusUpdater(): void {
        this.statusUpdateTimer = setInterval(() => {
            this.saveStatusToFile().catch(err => {
                console.error(chalk.red('[TokenManager]'), 'Failed to update status file:', err);
            });
        }, 30_000);  // 每 30 秒更新
    }

    /**
     * 儲存當前狀態到 JSON 文件
     */
    private async saveStatusToFile(): Promise<void> {
        try {
            const logsDir = path.join(process.cwd(), 'logs');
            await fs.mkdir(logsDir, { recursive: true });

            const now = new Date();
            const taipeiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);

            const status = {
                lastUpdate: taipeiTime.toISOString().replace('Z', '+08:00'),
                allBanned: this.allBannedState,
                currentCredential: this.currentIndex,
                credentials: this.credentials.map((cred, index) => {
                    const credStatus = this.credentialStatus[index];
                    const isBanned = credStatus ? credStatus.bannedUntil > Date.now() : false;
                    const bannedUntil = credStatus && isBanned
                        ? new Date(credStatus.bannedUntil + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
                        : null;

                    return {
                        index,
                        clientId: cred.clientID,  // 儲存完整 clientID
                        isBanned,
                        bannedUntil,
                        requestCount: credStatus?.requestCount || 0
                    };
                })
            };

            const filepath = path.join(logsDir, 'token-status.json');
            await fs.writeFile(filepath, JSON.stringify(status, null, 2), 'utf-8');
        } catch (error) {
            console.error(chalk.red('[TokenManager]'), 'Failed to save status to file:', error);
        }
    }

    /**
     * 從 JSON 文件恢復之前的 ban 狀態
     * 並同步 config.json 中的 credentials（以 config 為主）
     */
    private async loadStatusFromFile(): Promise<void> {
        try {
            const filepath = path.join(process.cwd(), 'logs', 'token-status.json');
            const content = await fs.readFile(filepath, 'utf-8');
            const status = JSON.parse(content);

            if (!status.credentials || !Array.isArray(status.credentials)) {
                return;
            }

            // 按照 config.json 的 credentials 順序恢復狀態
            // 只恢復那些在當前 config 中存在的 credentials
            const credentialClientIds = this.credentials.map(c => c.clientID);

            for (const savedCred of status.credentials) {
                // 根據完整 clientId 查找對應的 index（而不是依賴 index，因為 index 可能會變）
                const currentIndex = credentialClientIds.indexOf(savedCred.clientId);

                if (currentIndex >= 0) {
                    const credStatus = this.credentialStatus[currentIndex];
                    if (!credStatus) continue;

                    if (savedCred.isBanned && savedCred.bannedUntil) {
                        // 將時間字符串轉換回 timestamp
                        const bannedUntilTime = new Date(savedCred.bannedUntil).getTime();
                        credStatus.bannedUntil = bannedUntilTime;

                        const remainingSeconds = Math.ceil((bannedUntilTime - Date.now()) / 1000);
                        if (remainingSeconds > 0) {
                            console.log(chalk.yellow('[TokenManager]'),
                                `Restored credential #${currentIndex + 1} ban status: ${remainingSeconds}s remaining`);
                        }
                    }
                    // 恢復使用次數統計
                    if (typeof savedCred.requestCount === 'number') {
                        credStatus.requestCount = savedCred.requestCount;
                    }
                } else if (savedCred.clientId) {
                    // token-status 中有但 config 沒有的 credential，直接跳過
                    console.log(chalk.gray('[TokenManager]'),
                        `Skipping credential from status file (not in current config): ${savedCred.clientId.substring(0, 8)}...`);
                }
            }

            // 恢復 currentCredential（需要驗證該 index 在當前 config 中是否有效）
            if (typeof status.currentCredential === 'number' && status.currentCredential >= 0 && status.currentCredential < this.credentials.length) {
                this.currentIndex = status.currentCredential;
            } else {
                // 如果保存的 index 無效，重置為 0
                this.currentIndex = 0;
            }

            // 恢復全員 ban 狀態
            if (typeof status.allBanned === 'boolean') {
                this.allBannedState = status.allBanned;
                // 不在這裡打印警告，因為可能新增了可用的 credentials
                // 會在 initialize() 中根據實際情況決定是否打印
            }
        } catch (error) {
            // 文件不存在或格式錯誤是正常的（首次運行）
            if ((error as any).code !== 'ENOENT') {
                console.warn(chalk.yellow('[TokenManager]'), 'Could not load status from file, starting fresh');
            }
        }
    }

    /**
     * 記錄事件到 database
     */
    private async logEventToDatabase(eventType: string, details?: string): Promise<void> {
        try {
            const cred = this.credentials[this.currentIndex];
            if (!cred) return;

            await db
                .insertInto('token_events')
                .values({
                    timestamp: new Date(),
                    event_type: eventType,
                    client_id: cred.clientID,
                    details: details || null
                })
                .execute();
        } catch (error) {
            console.error(chalk.red('[TokenManager]'), 'Failed to log event to database:', error);
        }
    }
}