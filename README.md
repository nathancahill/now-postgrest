# now-postgrest

Deploy PostgREST to Now.

##### `now.json`
```json
{
    "functions": {
        "api/postgrest.conf": {
            "runtime": "now-postgrest@0.3.0"
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
```ini
db-uri = "$(DB_URI)"
db-schema = "api"
db-anon-role = "web_anon"
base-url = "/api/"
```

#### Locally with `now dev`

A local `postgrest` binary is required to be in your `$PATH`. Follow the [installation instructions](http://postgrest.org/en/v6.0/tutorials/tut0.html#step-3-install-postgrest).

##### `.env`

```ini
DB_URI=postgres:///app
```
