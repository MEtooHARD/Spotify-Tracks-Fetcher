import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { Config } from "../utils/config_loader";
import { DB } from "./schema";

export const db = new Kysely<DB>({
    dialect: new PostgresDialect({
        pool: new Pool({
            host: Config.database.host,
            port: Config.database.port,
            database: Config.database.database,
            user: Config.database.user,
            password: Config.database.password,
        })
    })
});