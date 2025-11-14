import { extractResponse } from "../utils/wrapper";
import { BearerToken } from "./auth";
import { TokenManager } from "./token_manager";

export async function BearerFetch<T>(url: string): Promise<T> {
    const tokenManager = TokenManager.getInstance();

    // 記錄 token 使用
    tokenManager.recordUsage();

    try {
        return await extractResponse<T>(
            fetch(url, {
                method: 'GET',
                headers: { Authorization: BearerToken() }
            })
        );
    } catch (e) {
        // console.log('Error occurred on:', url);
        throw e;
    }
}


export async function RLCRetryFetch<T>(url: string): Promise<T> {
    const tokenManager = TokenManager.getInstance();

    try {
        return await BearerFetch<T>(url);
    } catch (error: any) {
        // 處理 429 Rate Limit
        if (error?.status === 429) {
            const retryAfter = error.headers?.get?.('Retry-After');
            const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 0;

            console.warn(`[spotifyFetch] Rate limited (429), retry-after: ${delaySeconds}s`);

            // 記錄此 credential 被 ban 的時間
            tokenManager.recordRateLimit(delaySeconds);

            // 立即切換 credential
            const switched = await tokenManager.switchCredential();

            if (!switched) {
                // 無法切換（所有 credentials 都被 ban）
                console.error(`[spotifyFetch] All credentials are rate limited`);
                throw new Error(`All credentials banned (retry after ${delaySeconds}s)`);
            }

            console.log(`[spotifyFetch] Switched credential, retrying once...`);

            // 用新 token 重試一次
            try {
                return await BearerFetch<T>(url);
            } catch (retryError: any) {
                // 如果還是 429，代表新 token 也不能用了
                if (retryError?.status === 429) {
                    const newRetryAfter = retryError.headers?.get?.('Retry-After');
                    const newDelaySeconds = newRetryAfter ? parseInt(newRetryAfter, 10) : 0;

                    console.error(`[spotifyFetch] New credential also rate limited (429)`);
                    tokenManager.recordRateLimit(newDelaySeconds);

                    throw new Error(`Switched credential still banned (retry after ${newDelaySeconds}s)`);
                }
                // 其他錯誤直接拋出
                throw retryError;
            }
        }

        // 其他錯誤直接拋出
        throw error;
    }
}