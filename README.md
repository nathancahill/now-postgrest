# now-postgrest

Deploy PostgREST to Now.

##### `now.json`
-------
```json
{
    "functions": {
        "api/postgrest.conf": {
            "runtime": "now-postgrest@0.2.30"
        }
    },
    "routes": [
        { "src": "api/rpc/.*", "dest": "api/postgrest.conf" },
        { "src": "api/(films|actors)", "dest": "api/postgrest.conf" }
    ],
    "env": {
        "DB_URI": "@secret-db-uri"
    }
}
```

##### `api/postgrest.conf`

--------

```ini
db-uri = "$(DB_URI)"
db-schema = "api"
db-anon-role = "web_anon"
```