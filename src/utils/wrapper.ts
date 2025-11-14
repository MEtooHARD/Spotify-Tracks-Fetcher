import { HttpError, Result } from "../types/common";

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