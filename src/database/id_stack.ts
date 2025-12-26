import { db } from "./kysely_instance.js";
import { DB, SpotifyEntityType } from "./schema.js";

type ID = string;

export class IDExploreStackWrapper {
    private constructor() { }

    private static instance: IDExploreStackWrapper | null = null;

    public static getInstance(): IDExploreStackWrapper {
        if (!IDExploreStackWrapper.instance)
            IDExploreStackWrapper.instance = new IDExploreStackWrapper();
        return IDExploreStackWrapper.instance;
    }

    public async pop(type: SpotifyEntityType, count: number = 1): Promise<ID[]> {
        // 使用 transaction + FOR UPDATE SKIP LOCKED 確保並發安全
        // SKIP LOCKED: 多個 worker 並發時，跳過已被鎖定的 rows，提升效率
        return await db.transaction().execute(async (trx) => {
            // 鎖定要取出的 rows，並跳過已被其他 transaction 鎖定的
            const result = await trx
                .selectFrom('ids')
                .selectAll()
                .where('type', '=', type)
                .limit(count)
                .forUpdate()    // 🔒 排他鎖：防止其他 transaction 讀取或修改
                .skipLocked()   // 🚀 跳過被鎖定的 rows，不等待
                .execute();

            const ids = result.map(i => i.id);

            // 刪除已取出的 IDs
            if (ids.length > 0) {
                await trx
                    .deleteFrom('ids')
                    .where('id', 'in', ids)
                    .execute();
            }

            return ids;
        });
    }

    public async get(type: SpotifyEntityType, count: number = 1): Promise<ID[]> {
        // get items (read-only, no lock needed)
        const result = await db.selectFrom('ids')
            .selectAll()
            .where('type', '=', type)
            .limit(count)
            .execute();
        const ids = result.map(i => i.id);
        return ids;
    }

    public async rm(id: ID[]): Promise<number> {
        if (id.length === 0) return 0;
        const result = await db.deleteFrom('ids')
            .where('id', 'in', id)
            .execute();
        // result 是數組，每個元素有 numDeletedRows 屬性
        return result.length > 0 && result[0] ? Number(result[0].numDeletedRows) : 0;
    }

    public async amount_of(type: SpotifyEntityType): Promise<number> {
        const result = await db.selectFrom('ids')
            .select(db.fn.count<number>('id').as('count'))
            .where('type', '=', type)
            .executeTakeFirst();
        return Number(result?.count ?? 0);
    }

    /**
     * 檢查多個類型中是否有任何 ID（用於檢查隊列是否為空）
     * 比分別查詢每個類型更高效
     * @returns 返回含有 ID 的類型列表
     */
    public async hasAnyId(types: SpotifyEntityType[]): Promise<boolean> {
        const result = await db.selectFrom('ids')
            .select('type')
            .where('type', 'in', types)
            .limit(1)
            .executeTakeFirst();
        return result !== undefined;
    }

    public async add(id: ID, type: SpotifyEntityType): Promise<boolean> {
        // see if already exists
        const exists = await db.selectFrom('ids')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        // exists, do not add
        if (exists) return false;
        // does not exist, add it
        await db.insertInto('ids').values({ id, type }).execute();
        return true;
    }

    /**
     * 批量加入 IDs，過濾已在資源表中存在的 ID
     * 使用 LEFT JOIN 一次查詢完成過濾（避免重複抓取）
     * 依賴 ON CONFLICT DO NOTHING 處理 ids 表的重複插入
     * @returns 實際加入的數量
     */
    public async addMany(ids: ID[], type: SpotifyEntityType): Promise<number> {
        if (ids.length === 0) return 0;

        const tableName = this.table_name_of(type);

        if (!tableName) {
            // 沒有對應的資源表，直接插入
            const result = await db
                .insertInto('ids')
                .values(ids.map(id => ({ id, type })))
                .onConflict(oc => oc.doNothing())
                .execute();
            return Number(result[0]!.numInsertedOrUpdatedRows) || 0;
        }

        // 使用 NOT IN 子查詢過濾已存在的 ID
        const existingIds = await db
            .selectFrom(tableName as any)
            .select('id')
            .where('id', 'in', ids)
            .execute();

        const existingIdSet = new Set(existingIds.map((r: any) => r.id));
        const toAdd = ids.filter(id => !existingIdSet.has(id));

        if (toAdd.length === 0) return 0;

        const result = await db
            .insertInto('ids')
            .values(toAdd.map(id => ({ id, type })))
            .onConflict(oc => oc.doNothing())
            .execute();

        return Number(result[0]!.numInsertedOrUpdatedRows) || 0;
    }

    /**
     * 將 SpotifyEntityType 映射到對應的資料表名稱
     */
    private table_name_of(type: SpotifyEntityType): keyof DB | null {
        switch (type) {
            case 'artist': return 'artists';
            case 'album': return 'albums';
            case 'track': return 'tracks';
            case 'playlist': return 'playlists';
            default: return null;
        }
    }
}

export const IDExploreStack = IDExploreStackWrapper.getInstance();
