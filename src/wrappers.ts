import { Result } from "./types";

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
    let result;
    try {
        result = await response.json();
    } catch {
        console.log(response);
    } finally {
        if (response.ok) return result;
        if (!result) result = await response.text();
        throw new Error(
            typeof result === 'string'
                ? result
                : result.error?.message || JSON.stringify(result)
        );
    }
}
