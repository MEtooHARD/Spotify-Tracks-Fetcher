import * as fs from 'fs/promises';
import * as path from 'path';

export class LogCapture {
    private buffer: string[] = [];
    private stdoutWrite: typeof process.stdout.write;
    private stderrWrite: typeof process.stderr.write;
    private capturing: boolean = false;

    constructor() {
        // 保存原始的 write 方法引用
        this.stdoutWrite = process.stdout.write.bind(process.stdout);
        this.stderrWrite = process.stderr.write.bind(process.stderr);
    }

    /**
     * 開始捕獲 stdout 和 stderr
     */
    public start(): void {
        if (this.capturing) return;

        this.capturing = true;
        this.buffer = [];

        const self = this;

        // Hook stdout.write（不替換，而是包裝）
        const originalStdoutWrite = this.stdoutWrite;
        process.stdout.write = function (chunk: any, encoding?: any, callback?: any): boolean {
            if (self.capturing) {
                self.buffer.push(chunk.toString());
            }
            return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
        } as any;

        // Hook stderr.write
        const originalStderrWrite = this.stderrWrite;
        process.stderr.write = function (chunk: any, encoding?: any, callback?: any): boolean {
            if (self.capturing) {
                self.buffer.push(`[STDERR] ${chunk.toString()}`);
            }
            return originalStderrWrite.call(process.stderr, chunk, encoding, callback);
        } as any;
    }

    /**
     * 停止捕獲並恢復原始方法
     */
    public stop(): void {
        if (!this.capturing) return;

        this.capturing = false;

        // 恢復原始的 write 方法
        process.stdout.write = this.stdoutWrite as any;
        process.stderr.write = this.stderrWrite as any;
    }

    /**
     * 取得捕獲的內容
     */
    public getContent(): string {
        return this.buffer.join('');
    }

    /**
     * 清空 buffer
     */
    public clear(): void {
        this.buffer = [];
    }

    /**
     * 儲存到檔案
     */
    public async saveToFile(filename: string, additionalInfo?: Record<string, any>): Promise<string> {
        const logsDir = path.join(process.cwd(), 'logs', 'failed-tasks');
        await fs.mkdir(logsDir, { recursive: true });

        const filepath = path.join(logsDir, filename);

        let content = '';
        if (additionalInfo) {
            content += '=== Task Information ===\n';
            for (const [key, value] of Object.entries(additionalInfo)) {
                content += `${key}: ${value}\n`;
            }
            content += '\n';
        }

        content += '=== Captured Output ===\n';
        content += this.getContent();

        await fs.writeFile(filepath, content, 'utf-8');
        return filepath;
    }
}
