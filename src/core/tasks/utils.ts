// import { RLCRetryFetch } from "../../api/client";
import { CredentialManager } from "../../api/credential_manager.js";
import { Paged } from "../../types/spotify_api.js";

const cred_mgr = CredentialManager.getInstance();

function isPaged<T>(obj: any): obj is Paged<T> {
    return obj &&
        typeof obj.href === 'string' &&
        Array.isArray(obj.items) &&
        typeof obj.total === 'number';
}

function extractPaged<T>(res: any): Paged<T> | undefined {
    if (isPaged<T>(res)) return res;
    for (const key of ['albums', 'artists', 'tracks', 'playlists'])
        if (res[key] && isPaged<T>(res[key])) return res[key];
    return undefined;
}

export async function HandlePaged<T>(
    paged: Paged<T>,
    handle_page_items: (items: Array<T>) => Promise<void>,
    filter?: (item: T) => boolean,  // 可選的過濾函數
    onProgress?: (current: number, total: number) => void  // 可選的進度回調
) {
    let cur_paged: Paged<T> | undefined = paged;
    let processedCount = 0;

    while (cur_paged) {
        // 先過濾掉 null，然後再套用 filter（如果有）
        const nonNullItems = cur_paged.items.filter((item): item is T => item !== null);
        const items = filter ? nonNullItems.filter(filter) : nonNullItems;

        await handle_page_items(items);

        processedCount += items.length;

        // 回調進度
        if (onProgress) onProgress(processedCount, cur_paged.total);

        if (!cur_paged.next) break;
        const res: any = await cred_mgr.api_get<any>(cur_paged.next);
        cur_paged = extractPaged<T>(res);
    }
}