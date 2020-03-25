# now-postgrest

Now Builder for PostgREST

```json
{
    "version": 2,
    "builds": [
        {
            "src": "postgrest.conf",
            "use": "now-postgrest",
            "config": { "basePath": "/api/" }
        }
    ],
    "routes": [
        {
            "src": "/api/.*",
            "dest": "postgrest.conf"
        }
    ]
}
```