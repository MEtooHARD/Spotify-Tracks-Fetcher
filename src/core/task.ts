import chalk from "chalk";
import { randomChalk } from "../utils/helpers";
import { LogCapture } from "../utils/log_capture";
import { Singleton } from "../utils/wrapper";

export interface Task {
    name: string;
    run: (log: Logger) => Promise<void>;
}

export abstract class TaskSource extends Singleton<TaskSource>() {
    abstract getTask(): Promise<Task | undefined>;
}

export type Logger = (...msg: any[]) => void;

export class TaskRunner {
    protected readonly sources: Array<TaskSource> = [];
    protected active: number = 0;
    protected task_id: number = 1;
    protected running: boolean = false;
    protected paused: boolean = false;  // 暫停狀態
    protected readonly concurrency: number = 5;
    protected lastTaskStartTime: number = 0;  // 記錄上次 task 開始的時間
    protected consecutiveFailures: number = 0;  // 連續失敗次數
    protected readonly maxConsecutiveFailures: number = 5;  // 最大連續失敗次數

    constructor(
        sources: Array<TaskSource>,
        limit: number = 5,
        protected minTaskIntervalMs: number = 0  // 兩個 task 之間的最小間隔（毫秒）
    ) {
        this.sources = sources;
        this.concurrency = limit;
    }

    public trigger(): void {
        if (!this.running) {
            this.running = true;
            this.loop();
        } else {
            console.log(chalk.yellow('[task runner] already running'));
        }
    }

    public isRunning(): boolean { return this.running; }

    public pause(): void {
        if (!this.paused) {
            this.paused = true;
            console.log(chalk.yellow('[runner] paused due to token unavailability'));
        }
    }

    public resume(): void {
        if (this.paused) {
            this.paused = false;
            console.log(chalk.green('[runner] resumed after token recovery'));
            this.consecutiveFailures = 0;  // 重置失敗計數
            this.loop();  // 重啟 task 循環
        }
    }

    private async getNextTask(): Promise<Task | undefined> {
        for (const source of this.sources) {
            const task = await source.getTask();
            if (task) return task;
        }
        return undefined;
    }

    private async loop(): Promise<void> {
        // 如果暫停中，直接返回
        if (this.paused) {
            return;
        }

        while (this.running && this.active < this.concurrency) {
            // 檢查連續失敗次數
            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                console.log(chalk.red(`[runner] stopped due to ${this.consecutiveFailures} consecutive failures`));
                this.running = false;
                break;
            }

            const task = await this.getNextTask();

            if (!task) {
                if (this.active === 0) {
                    this.running = false;
                    console.log(chalk.green('[runner] all tasks completed'));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                break;
            }

            const weighted_interval = this.minTaskIntervalMs + this.consecutiveFailures * 10 * 1000;
            // 計算需要等待的時間，確保與上次 task 開始時間至少間隔 minTaskIntervalMs
            if (weighted_interval > 0 && this.lastTaskStartTime > 0) {
                const elapsed = Date.now() - this.lastTaskStartTime;
                const waitTime = weighted_interval - elapsed;

                if (waitTime > 0) {
                    console.log(chalk.gray(`[runner] waiting ${waitTime}ms to maintain interval...`));
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }

            this.lastTaskStartTime = Date.now();  // 記錄這次 task 開始的時間
            this.executeTask(task);
        }
    }

    private executeTask(task: Task): void {
        this.active++;
        const id = this.task_id++;
        const color = randomChalk();
        const tag = color(`[task ${id}]`);
        const log: Logger = (...msg) => console.log(tag, ...msg);

        // 創建並啟動 log capture
        const logCapture = new LogCapture();
        logCapture.start();

        console.log(chalk.cyanBright('[runner]'), 'start', tag, task.name);

        task.run(log)
            .then(() => {
                console.log(tag, chalk.green('completed'));
                this.consecutiveFailures = 0;  // 成功則重置失敗計數
            })
            .catch(async (e) => {
                // 分類錯誤類型
                let errorType = 'UNKNOWN';
                let shouldCountAsFailure = true;

                if (e?.response?.status === 429) {
                    errorType = 'RATE_LIMIT';
                    shouldCountAsFailure = false;  // 429 不算失敗，系統會自動處理
                } else if (e?.response?.status === 401 || e?.response?.status === 403) {
                    errorType = 'AUTH_FAILED';
                } else if (e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT') {
                    errorType = 'NETWORK_ERROR';
                } else if (e?.message) {
                    // 檢測「所有 credentials 都被 ban」的情況
                    if (e.message.includes('All credentials banned')) {
                        errorType = 'TOKEN_EXHAUSTED';
                        shouldCountAsFailure = false;  // 不計為失敗，等待恢復

                        // 立即暫停 task runner
                        if (!this.paused) {
                            this.pause();
                        }
                    } else {
                        errorType = 'APPLICATION_ERROR';
                    }
                }

                console.error(tag, chalk.red(`error [${errorType}]:`), e?.message || String(e));

                if (shouldCountAsFailure) {
                    this.consecutiveFailures++;
                    console.log(chalk.yellow(`[runner] consecutive failures: ${this.consecutiveFailures}/${this.maxConsecutiveFailures}`));
                } else {
                    console.log(chalk.gray(`[runner] ${errorType} - not counted as failure`));
                }

                // 儲存失敗的 log
                try {
                    const now = new Date();
                    // 轉換為 UTC+8 時區
                    const taipeiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                    const timestamp = taipeiTime.toISOString().replace(/[:.]/g, '-').replace('Z', '');
                    const filename = `task-${id}_${timestamp}.log`;
                    await logCapture.saveToFile(filename, {
                        'Task ID': id,
                        'Task Name': task.name,
                        'Error Type': errorType,
                        'Timestamp': taipeiTime.toISOString().replace('Z', '+08:00'),
                        'Error': e?.message || String(e),
                        'Stack': e?.stack || 'No stack trace'
                    });
                    console.log(chalk.yellow(`[runner] saved failed task log to: ${filename}`));
                } catch (saveErr) {
                    console.error(chalk.red('[runner] failed to save task log:'), saveErr);
                }
            })
            .finally(() => {
                // 停止捕獲並恢復原始 stdout/stderr
                logCapture.stop();
                console.log(tag, chalk.gray('finished, active:', this.active - 1));
                this.active--;

                // 只有在未暫停時才繼續 loop
                if (!this.paused) {
                    this.loop();
                }
            });
    }
}