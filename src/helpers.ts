import chalk, { ChalkInstance } from "chalk";
import { SpotifySimplified } from "./spotify_types";

export function fitRangeInt(
    n: number,
    bl: number = 0,
    ul: number = Infinity
): number {
    return Math.round(Math.min(Math.max(n, bl), ul));
}

export function getAmount(stack: ExploreStack, amount: number, initArr: Array<string>): Array<string>;
export function getAmount<T extends { id: string }>(stack: ObjectExploreStack<T>, amount: number, initArr: Array<T>): Array<T>;
export function getAmount<T extends { id: string }>(
    stack: ExploreStack | ObjectExploreStack<T>,
    amount: number,
    initArr: Array<string | T> = []
): Array<string | T> {
    if (amount < 1) return initArr;

    let count = initArr.length;
    while (count < amount) {
        const item = stack.pop();
        if (!item) break;
        initArr.push(item);
        count++;
    }
    return initArr;
}

export function countSuccess<T>(arr: Array<T>, fn: (item: T) => boolean) {
    let count = 0;
    for (const item of arr)
        if (fn(item)) count++;
    return count;
}

export const randomChalk = (): ChalkInstance => {
    const randomColor = Math.floor(Math.random() * 0xFFFFFF).toString(16);

    return chalk.hex('#' + randomColor.padStart(6, '0'));
};

export class ExploreStack {
    private readonly UnexploredItems: Array<string>;
    private readonly AllItem: Set<string>;

    constructor() {
        this.UnexploredItems = [];
        this.AllItem = new Set<string>();
    }

    public add(item: string): boolean {
        if (this.has(item)) return false;
        this.UnexploredItems.push(item);
        this.AllItem.add(item);
        return true;
    }

    public addAll(items: Array<string>): number {
        let count = 0;
        for (const item of items)
            if (this.add(item)) count++;

        return count;
    }

    public pop(): string | null {
        if (this.UnexploredItems.length === 0) return null;
        const item = this.UnexploredItems.pop()!;
        return item;
    }

    public has(id: string): boolean {
        return this.AllItem.has(id);
    }
}

export class ObjectExploreStack<T extends { id: string }> {
    private readonly UnexploredObjects: Array<T>;
    private readonly AllItem: Set<string>;

    constructor() {
        this.UnexploredObjects = [];
        this.AllItem = new Set<string>();
    }

    public add(item: T): boolean {
        if (this.has(item.id)) return false;
        this.UnexploredObjects.push(item);
        this.AllItem.add(item.id);
        return true;
    }
    public addAll(items: Array<T>): number {
        let count = 0;
        for (const item of items)
            if (this.add(item)) count++;

        return count;
    }
    public pop(): T | null {
        if (this.UnexploredObjects.length === 0) return null;
        const item = this.UnexploredObjects.pop()!;
        this.AllItem.delete(item.id);
        return item;
    }
    public has(id: string): boolean {
        return this.AllItem.has(id);
    }

}