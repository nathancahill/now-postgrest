# now-postgrest

Now Builder for PostgREST

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
    ]
}
```
