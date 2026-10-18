# opencode config generator

A small static page that builds an OpenCode V2 config for any OpenAI-style endpoint. No server, no build step. Open it, point it at your endpoint, and take the config.

## Run

```
python3 -m http.server 8000 -d .
```

Open http://127.0.0.1:8000/ . Use 127.0.0.1 or localhost. 0.0.0.0 is not a browser address.

## Steps

1. Type the provider ID, the display name, and the base URL.
2. Add the API key if your endpoint asks for one. Skip it otherwise.
3. Press "Load models". The page calls GET {baseURL}/models from your browser.
4. Pick the models you want, then set the limits, tools, vision, and reasoning.
5. Copy the opencode.jsonc file or download it.

The page also prints a shell export line for the API key.

## CORS

The request goes straight to your endpoint. If the endpoint sends no CORS headers, the browser blocks the response.

In that case, open the blocked-request box, paste the models JSON, and press "Parse pasted JSON". Get the JSON with:

```
curl -H "Authorization: Bearer KEY" https://your-host/v1/models
```

## Security

Your key never leaves the browser tab and is only used for the /models request. The page never stores it and never sends it anywhere else.

The generated config references the key as an environment variable. The value stays in your shell.

## Profiles

The Profiles panel saves everything to a `.opencode-profile.json` file, inputs and model list included. Loading the file fills the form back in.

A password encrypts the API key inside the file with AES-GCM. The password never leaves the browser. Use at least 8 characters. A wrong password fails to decrypt, so the key stays safe.

## Config format

The output follows the OpenCode V2 custom provider config:
https://opencode.ai/v2/docs/providers#custom

## Development

Prettier formats the files. It is a development tool only.

```
npm run format
npm test
git config core.hooksPath .githooks   # format on every commit
```

The site uses one absolute URL: https://trenbankai.dev/opencode-config/ . Replace it in index.html, robots.txt, sitemap.xml, and site.webmanifest to move the site.

Files: index.html, styles.css, and app.js hold the page. The other files are icons, SEO files, and tool settings.

## License

MIT. Copyright (c) 2026 Gabriel Lima (@gabriel-aplok). See LICENSE.
