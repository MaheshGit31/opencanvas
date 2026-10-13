# Hosting on Railway

One service serves the app and the AI tools. Deploy this repo on Railway, it picks up the Dockerfile.

## Who can use your server

Set `PUBLIC_SERVER_ACCESS` in your service variables.

| Value | What happens |
| --- | --- |
| `NONE` | Only requests with your key work. This is the default when the variable is blank or wrong |
| `LIMITED` | Anyone can use the light tools within limits. Heavy tools like the background generator need your key |
| `FULL` | Anyone can use everything with no limits |

Your key always works and is never limited. Set it with `OPENCANVAS_KEY`, then paste it in Settings, AI, API key.

Without a key and with `NONE`, the AI endpoints stay closed for everyone. The app itself still loads, and the on device AI tools work in the browser without the server.

## Limits for LIMITED

All optional. Counts are kept in memory so they reset when the service restarts.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LIMITED_PER_MINUTE` | 6 | Runs per IP per minute |
| `LIMITED_PER_DAY` | 60 | Runs per IP per day |
| `LIMITED_GLOBAL_PER_DAY` | 1500 | Runs per day across everyone |
| `LIMITED_MAX_MB` | 4 | Largest upload |
| `FULL_MAX_MB` | 25 | Largest upload for FULL and for your key |

## Other variables

- `SERVE_APP=0` serves only the API and not the app
- `OPENCANVAS_T2I` picks the background generator model

## Check it

Open `/v1/health`. It shows `access` as NONE, LIMITED, FULL or OWNER depending on the key you send.
