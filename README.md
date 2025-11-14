- docker is not currently updated and cannot be used directly
- load the `schema_dump.sql` to your postgres database first
- insert your spotify credentials and the postgres host, database name, port and password to `/src/config.json`
format: 
    ```
    {
        "spotify": Array<{
            "clientID": string,
            "secret": string
        }>,
        "database": {
            "host": string,
            "port": number,
            "database": string,
            "user": string,
            "password": string
        }
    }
    ```
- after that, this project should be good to go
- run `npm start` to start fetching
- utility tools
  - run `npm run monitor` in another terminal to monitor database
  - run `npm run token-monitor` in another terminal to monitor token status