import { db } from "./kysely_instance";
import { DB, SpotifyEntityType } from "./schema";

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
        const ids = await this.get(type, count);
        // delete and return (pop completion)
        await this.rm(ids);
        return ids;
    }

    public async get(type: SpotifyEntityType, count: number = 1): Promise<ID[]> {
        // get items
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
        return Number(result.length);
    }

    public async amount_of(type: SpotifyEntityType): Promise<number> {
        const result = await db.selectFrom('ids')
            .select(db.fn.count<number>('id').as('count'))
            .where('type', '=', type)
            .executeTakeFirst();
        return Number(result?.count ?? 0);
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
     * 批量加入 IDs，自動過濾已存在的 ID
     * 會檢查：ids 表 + 對應的資源表（artists/albums/tracks/playlists）
     * @returns 實際加入的數量
     */
    public async addMany(ids: ID[], type: SpotifyEntityType): Promise<number> {
        if (ids.length === 0) return 0;

        // 1. 檢查 ids 表中已存在的
        const existingInQueue = await db
            .selectFrom('ids')
            .select('id')
            .where('id', 'in', ids)
            .execute();
        const queueIds = existingInQueue.map(r => r.id);

        // 2. 根據 type 映射到對應的資源表
        const tableName = this.table_name_of(type);

        // 3. 檢查資源表中已存在的
        let existingInTable: string[] = [];
        if (tableName) {
            const result = await db
                .selectFrom(tableName as any)
                .select('id')
                .where('id', 'in', ids)
                .execute();
            existingInTable = result.map((r: any) => r.id);
        }

        // 4. 合併已存在的 IDs
        const existingIds = [...queueIds, ...existingInTable];

        // 5. 過濾出需要加入的 IDs
        const toAdd = ids.filter(id => !existingIds.includes(id));

        // 6. 批量插入（使用 ON CONFLICT DO NOTHING 防止並發插入衝突）
        if (toAdd.length === 0) return 0;
        await db
            .insertInto('ids')
            .values(toAdd.map(id => ({ id, type })))
            .onConflict(oc => oc.doNothing())
            .execute();

        return toAdd.length;
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
