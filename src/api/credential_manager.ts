import chalk from "chalk";
import { extract_res, Singleton } from "../utils/wrapper.js";
import { GetToken } from "./auth.js";
import { db } from "../database/kysely_instance.js";
import { wrap_number } from "../utils/helpers.js";

export class CredentialExhaustedError extends Error {
    constructor() {
        super('All credentials are exhausted');
        this.name = "CredentialExhaustedError";
    }
}
export class TokenRefreshFailure extends Error {
    constructor() {
        super('Failed to refresh token');
        this.name = "TokenRefreshFailure";
    }
}

type RecoveryTime = number;
/**
 * `true`: ok  
 * `false`: not usable (some error else than ban)  
 * `number`: timestamp of recovery (UTC+0)
 */
type CredStatus = boolean | RecoveryTime;

type Credential = {
    client_id: string;
    secret: string;
    request_count: number;
    status: CredStatus;
}

type CredentialRecord = {
    last_updated: number; // UTC+0
    index: number;
    credentials: Array<{
        client_id: string;
        request_count: number;
        status: CredStatus;
    }>
}

/**
 * manages multiple set of credentials
 * and automatically select and maintain tokens
 */
export class CredentialManager extends Singleton<CredentialManager>() {
    private static readonly PATIENCE = 3;

    private credentials: Credential[] = [];
    private current_index: number = 0;
    private token: string | null = null;

    private check_loop: { ref: NodeJS.Timeout, interval: number } | null = null;

    private onrecovery_callback: (() => void) | null = null;
    private onallbanned_callback: (() => void) | null = null;
    private onsave_callback: (() => void) | null = null;

    protected Bearer_String(): string | null {
        if (this.token) return 'Bearer ' + this.token;
        return null;
    }

    /**
     * set a function to be executed whenever credential manager detects recovery from all banned state
     */
    public on_recovery(callback: () => void): void { this.onrecovery_callback = callback; }
    /**
     * set a function to be executed whenever credential manager detects all credentials are unusable
     */
    public on_all_banned(callback: () => void): void { this.onallbanned_callback = callback; }
    /**
     * set a function to be executed whenever credential state changes (for saving)
     */
    public on_state_change(callback: () => void): void { this.onsave_callback = callback; }

    /**
     * checks for any recovery from ban and unusable credentails  
     */
    protected async check_status(): Promise<void> {
        try {
            // capture initial state BEFORE any recovery checks
            const initial_status: boolean = this.any_available();
            
            // perform recovery checks
            const ban_recovered = this.check_ban_recovery();
            const unusable_recovered = await this.check_unusables();
            
            // save once if any recovery happened
            if ((ban_recovered || unusable_recovered) && this.onsave_callback) {
                this.onsave_callback();
            }
            
            // trigger recovery callback if we went from no available to having available
            if (initial_status === false && this.any_available()) {
                console.log(`${chalk.green('[cred manager]')} recovery detected`);
                if (this.onrecovery_callback) this.onrecovery_callback();
            }
        } catch (error) {
            console.error(`${chalk.red('[cred manager]')} error during status check:`, error);
        }
    }

    /**
     * start/change the check loop to periodically check credential status  
     * @param interval interval in ms (default: 60s)
     */
    public set_check_loop(interval: number = 60_000): void {
        if (this.check_loop === null || this.check_loop.interval !== interval) {
            if (this.check_loop) clearInterval(this.check_loop.ref);
            console.log(`[cred manager] started check loop, interval: ${interval}ms`);
            this.check_loop = {
                ref: setInterval(() => this.check_status(), interval),
                interval: interval
            };
        }
    }

    /**
     * working as a gateway for Spotify API requests  
     * has built-in retry logic for handling short-term bans and automatic token refresh or internet issues
     * @param url 
     * @returns 
     */
    public async api_get<T>(url: string): Promise<T> {
        for (let attempt = 0; attempt < CredentialManager.PATIENCE; attempt++) {
            try { // try fetch
                const bearer_str = this.Bearer_String();
                if (!bearer_str) throw new Error('No Bearer Token Available');

                const result = await extract_res<T>(fetch(
                    url, {
                    method: 'GET',
                    headers: { Authorization: bearer_str }
                }
                ));
                // record usage on success
                this.record_usage();

                return result
            } catch (e: any) {
                let handled = false;
                if (e?.status === 429) { // rate limit
                    const retry_after = e.headers?.get?.('Retry-After');
                    let seconds = parseInt(retry_after, 10);
                    if (seconds < 30) { // short-term ban or NaN or invalid range
                        if (seconds < 0 || Number.isNaN(seconds)) {// invalid value
                            seconds = 60; // 1min
                            console.log(`${chalk.red('[cred manager]')} invalid Retry-After value, default to 60s`);
                        }
                        console.warn(`${chalk.yellow('[cred manager]')} 429, short-term ban for ${seconds}s`);
                        await new Promise(resolve => setTimeout(resolve, (seconds + 5) * 1000)); // wait + buffer
                    } else { // long-term ban
                        this.record_rate_limit(seconds);
                        if (!this.switch_cred()) throw new CredentialExhaustedError();
                        await this.refresh_token();
                    }
                    handled = true;
                } else if (e?.status === 401) { // token issue
                    console.warn(`${chalk.yellow('[cred manager]')} 401, refresh token`);
                    const refreshed = await this.refresh_token();
                    if (!refreshed) {
                        this.credentials[this.current_index]!.status = false;
                        throw new TokenRefreshFailure();
                    }
                    handled = true;
                } else if (e?.status > 500 && e?.status < 600) { // server error
                    console.warn(`${chalk.yellow('[cred manager]')} ${e.status}, wait and retry`);
                    handled = true;
                }

                if (!handled) throw e;

                console.log(`${chalk.blue('[cred manager]')} wait 5s before retry`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        throw new Error('Failed to fetch after multiple attempts');
    }

    /**
     * checks if any credential is available
     */
    public any_available(): boolean {
        for (const cred of this.credentials)
            if (cred.status === true) return true;
        return false;
    }

    /**
     * simply go through all credentials and check recovery
     * @returns true if any credential recovered
     */
    public check_ban_recovery(): boolean {
        let recovered_any = false;
        for (const [index, cred] of this.credentials.entries())
            if (typeof cred.status === 'number') {
                if (cred.status < Date.now()) {
                    cred.status = true;
                    cred.request_count = 0;
                    recovered_any = true;
                    console.log(`${chalk.green('[cred manager]')} cred #${index} recovered`);
                }
            }
        return recovered_any;
    }

    /**
     * switch to next available credential and checks recovery if any
     * @returns success?
     */
    protected switch_cred(): boolean {
        console.log(`${chalk.blue('[cred manager]')} switching cred, current #${this.current_index}`);
        
        // check recovery once before searching
        this.check_ban_recovery();
        
        const current_idx = this.current_index;
        let temp_idx = this.current_index;

        while (true) {
            temp_idx = wrap_number(temp_idx, this.credentials.length);

            if (current_idx === temp_idx) {// looped all
                console.log(`${chalk.red('[cred manager]')} no other credential to switch to!`);
                if (this.onallbanned_callback) this.onallbanned_callback();
                return false;
            }

            if (this.credentials[temp_idx]!.status === true) {
                this.current_index = temp_idx;
                console.log(`${chalk.green('[cred manager]')} switched to #${this.current_index}`);
                this.log_event('SWITCHED', `switched to #${this.current_index}`);
                if (this.onsave_callback) this.onsave_callback(); // 觸發保存
                // this.refresh_token(); // moved to api_fetch
                return true;
            }
        }
    }

    /**
     * refresh token of current credential
     * @returns success?
     */
    public async refresh_token(): Promise<boolean> {
        const cred = this.credentials[this.current_index]!;
        console.log(`${chalk.blue('[cred manager]')} refreshing token for #${this.current_index}`);
        const [tokenRes, tokenErr] = await GetToken(cred.client_id, cred.secret);
        if (tokenErr) {
            console.log(`${chalk.red('[cred manager]')} refresh failed`);
            return false;
        }
        console.log(`${chalk.green('[cred manager]')} refresh success`);
        this.token = tokenRes.access_token;
        return true;
    }

    /**
     * set current cred as rate limited of given `seconds` and log to database
     */
    protected record_rate_limit(seconds: number): void {
        const cred = this.credentials[this.current_index]!;
        cred.status = Date.now() + seconds * 1000;
        console.log(`${chalk.yellow('[cred manager]')} #${this.current_index} limited, ${seconds}s`);
        this.log_event('BANNED', 'limited for ' + seconds + 's', cred.request_count);
        if (this.onsave_callback) this.onsave_callback(); // 觸發保存
    }

    /**
     * logs an event to database
     */
    protected log_event(eventType: 'BANNED' | 'SWITCHED', details?: string, used?: number): void {
        const cred = this.credentials[this.current_index];
        if (!cred) return;

        db.insertInto('token_events')
            .values({
                timestamp: new Date(),
                event_type: eventType,
                client_id: cred.client_id,
                details: details || null,
                used: used ?? null
            })
            .execute()
            .catch(() => { });
    }

    /**
     * sets the credentials to use
     * default status is ok(true)
     * @param creds 
     */
    public set_credential(creds: Credential[]): void { this.credentials = creds; }

    /**
     * simply add `1` to `request_count` of current credential
     */
    protected record_usage(): void { this.credentials[this.current_index]!.request_count++; }

    /**
     * recover records from a credential record, should be used after set_credential
     * @param record 
     */
    public async recover_from_rec(record: CredentialRecord): Promise<void> {
        console.log(`[cred manager] recovering from record...`);
        for (const cred of record.credentials) {
            // matching credential
            const ts_cred_idx = this.credentials.findIndex(cr => cr.client_id === cred.client_id);
            if (ts_cred_idx === -1) continue;
            const this_cred = this.credentials[ts_cred_idx]!;
            // reset if recovered, otherwise set as it is
            if (typeof cred.status === 'number' && cred.status < Date.now()) {
                this_cred.status = true;
                this_cred.request_count = 0;
            } else {
                this_cred.status = cred.status;
                this_cred.request_count = cred.request_count;
            }
            console.log(`[cred manager] recovered cred #${ts_cred_idx} ${this_cred.client_id.slice(0, 10)}... status: ${this_cred.status}`);
        }

        // recover last used index
        const record_last_client_id = record.credentials[record.index]?.client_id;
        if (record_last_client_id && this.credentials.some(c => c.client_id === record_last_client_id))
            this.current_index = this.credentials.findIndex(c => c.client_id === record_last_client_id);
        console.log(`[cred manager] recovered current index to #${this.current_index}`);
        await this.refresh_token();
    }
    /**
     * check unusable credentials by checking if it can get a token
     * @returns true if any credential recovered
     */
    protected async check_unusables(): Promise<boolean> {
        let recovered_any = false;
        for (const [i, cred] of this.credentials.entries()) {
            if (cred.status !== false) continue;
            const [token, err] = await GetToken(cred.client_id, cred.secret);
            if (!err) {
                cred.status = true;
                cred.request_count = 0;
                recovered_any = true;
                console.log(`[cred manager] recovered cred #${i} ...`);
            }
        }
        return recovered_any;
    }

    /**
     * string of record of now
     */
    public make_record(): string {
        return JSON.stringify({
            last_updated: Date.now(),
            index: this.current_index,
            credentials: this.credentials.map(c => ({
                client_id: c.client_id,
                request_count: c.request_count,
                status: c.status
            }))
        }, null, 2);
    }

    // public static status_str(status: CredStatus): string {
    //     if (status === true) return chalk.green('OK');
    //     if (status === false) return chalk.red('Unusable');
    //     return chalk.yellow(`Banned`);
    // }
}