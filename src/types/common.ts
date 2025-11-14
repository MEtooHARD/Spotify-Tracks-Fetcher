
type Success<T> = [T, null];
type Failure<E> = [null, E];
export type Result<T, E = Error> = Success<T> | Failure<E>;

export class HttpError extends Error {
    status: number;
    headers: Headers;
    body: any;

    constructor(message: string, status: number, headers: Headers, body: any) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.headers = headers;
        this.body = body;
    }
}