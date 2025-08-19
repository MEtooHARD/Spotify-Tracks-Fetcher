import chalk from "chalk";
import { Singleton } from "./wrappers";
import { randomChalk } from "./helpers";

export class TaskRunner {
    private activeTasks: number = 0;
    private running: boolean = false;
    private SID: number = 1;

    private SIDcap: number;

    constructor(
        private readonly generators: Array<TaskGenerator>,
        private readonly limit: number
    ) {
        this.SIDcap = Math.max(999, limit);
    }

    public isRunning(): boolean { return this.running; }

    public trigger() {
        if (!this.running) {
            this.running = true;
            this.runTask();
        }
        else console.log('[task runner] already running, trigger suppressed');
    }

    private getSID(): number {
        if (this.SID > this.SIDcap) this.SID = 1;
        return this.SID++;
    }

    private runTask() {
        while (this.running && this.activeTasks < this.limit) {
            let task: Task | undefined = undefined;

            for (let i = 0; i < this.generators.length && !task; i++)
                task = this.generators[i]!.getTask();

            if (task) {
                this.activeTasks++;
                const SID = this.getSID();
                const color = randomChalk();
                const tag = color(`[task ${SID}]`);
                console.log(chalk.cyanBright('[task runner]'), 'start', tag, task.name);
                task.task((...msg) => console.log(tag, ...msg))
                    .catch(e => console.error(tag, 'error:', e))
                    .finally(() => {
                        this.activeTasks--;
                        this.runTask();
                    });
            } else {
                if (this.activeTasks === 0) this.running = false;
                break;
            }
        }
    }
}

export abstract class TaskGenerator extends Singleton<TaskGenerator>() {
    public abstract getTask(): Task | undefined;
}

export interface Task {
    name: string;
    task: (logger: (...msg: any[]) => void) => Promise<void>;
}