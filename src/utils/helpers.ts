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
    const randomColor = Math.floor(Math.random() * 0xFFFFFF).toString(16);

    return chalk.hex('#' + randomColor.padStart(6, '0'));
};