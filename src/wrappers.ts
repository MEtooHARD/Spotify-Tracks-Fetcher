import chalk from "chalk";
import { Result } from "./spotify_types";

export async function tryCatch<T, E = Error>(
    promise: Promise<T>
): Promise<Result<T, E>> {
    try { return [await promise, null]; }
    catch (e) { return [null, e as E]; }
}

export async function extractResponse<T = any>(
    fetchResponse: Promise<Response>
): Promise<T> {
    const response = await fetchResponse;

    const [json, jsonErr] = await tryCatch(response.json());

    if (!jsonErr && response.ok) return json;

    if (response.status !== 429)
        console.log(response);

    throw new HttpError('failed parse response', response.status, response.headers, response);
}

// in your types.ts or a new errors.ts file
export class HttpError extends Error {
    status: number;
    headers: Headers;
    body: any;

    constructor(message: string, status: number, headers: Headers, body: any) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.headers = headers;
        this.body = body;
    }
}

// A helper to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function RateLimitCircuit<T>(
    promiseFn: () => Promise<T>,
    maxRetries = 5,
    message: string = '',
    logger: (...msg: any[]) => void = console.log
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await promiseFn();
            if (attempt > 1) {
                logger(chalk.green(`[Success] ${message} succeeded on attempt ${attempt}`));
            }
            return result;
        } catch (error) {
            if (error instanceof HttpError && error.status === 429) {
                const retryAfterHeader = error.headers.get('Retry-After');
                const delaySeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 3;
                const delayMs = Math.round((isNaN(delaySeconds) ? 3_000 : delaySeconds * 1000) + 1_000);

                console.log(error.body)

                logger(chalk.yellow(`[Rate Limit] ${message} Attempt ${chalk.cyan(attempt)}. Waiting ${chalk.cyan(delayMs / 1000)} sec.`));

                if (attempt === maxRetries) {
                    logger(chalk.red(`[Rate Limit] ${message} Max retries reached, throwing error`));
                    throw error;
                }

                await wait(delayMs);
                continue;
            }

            logger(chalk.red(`[Error] ${message} Non-rate-limit error on attempt ${attempt}:`), (error as any)?.message);
            throw error;
        }
    }
    throw new Error("Retry logic failed unexpectedly.");
}

export function Singleton<T>() {
    return class {
        static instance: T | undefined;

        protected constructor() { }

        public static getInstance(): T {
            if (!this.instance) this.instance = new this() as T;

            return this.instance;
        }
    }
}