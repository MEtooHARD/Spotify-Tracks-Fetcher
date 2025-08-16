export function fitRangeInt(
    n: number,
    bl: number = 0,
    ul: number = Infinity
): number {
    return Math.round(Math.min(Math.max(n, bl), ul));
}

export class ExploreStack<T extends { id: string }> {
    private UnexploredIDs: Set<string>;
    private UnexploredItems: Array<T>;
    private ExploredIDs: Set<string>;

    constructor() {
        this.UnexploredIDs = new Set<string>();
        this.UnexploredItems = new Array<T>();
        this.ExploredIDs = new Set<string>();
    }

    public add(item: T): boolean {
        if (this.has(item.id))
            return false;
        this.UnexploredItems.push(item);
        this.UnexploredIDs.add(item.id);
        return true;
    }

    public pop(): T | null {
        if (this.UnexploredItems.length === 0) return null;
        const item = this.UnexploredItems.pop()!;
        this.UnexploredIDs.delete(item.id);
        this.ExploredIDs.add(item.id);
        return item;
    }

    public has(id: string): boolean {
        return this.UnexploredIDs.has(id)
            || this.ExploredIDs.has(id);
    }
}