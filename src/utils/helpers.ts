import chalk, { ChalkInstance } from "chalk";

export function fitRangeInt(
    n: number,
    bl: number = 0,
    ul: number = Infinity
): number {
    return Math.round(Math.min(Math.max(n, bl), ul));
}

export function countSuccess<T>(arr: Array<T>, fn: (item: T) => boolean) {
    let count = 0;
    for (const item of arr)
        if (fn(item)) count++;
    return count;
}

export const randomChalk = (): ChalkInstance => {
    // 限制每個 RGB 通道在 80-179 之間，避免過亮、過暗或純色
    const r = Math.floor(Math.random() * 100) + 80;
    const g = Math.floor(Math.random() * 100) + 80;
    const b = Math.floor(Math.random() * 100) + 80;
    const randomColor = ((r << 16) | (g << 8) | b).toString(16);

    return chalk.hex('#' + randomColor.padStart(6, '0'));
};

/**
 * @param n base number
 * @param l loop size
 * @param s step, default 1
 * @returns `(n + s) % l`
 */
export function wrap_number(n: number, l: number, s: number = 1): number { return (n + s) % l; }

/**
 * partitions given array into two arrays by predicate
 * @param arr source array
 * @param predicate the predicate function
 * @returns [yes, no]: an array containing two arrays
 */
export function partition_arr<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
    const yes: T[] = [];
    const no: T[] = [];
    for (const item of arr)
        if (predicate(item)) yes.push(item);
        else no.push(item);

    return [yes, no];
}