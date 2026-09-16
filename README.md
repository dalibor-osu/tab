# tab

This project contains a simple, highly customizable website aimed to be used as default new tab page in your browser.

You can try it [here](https://dalibor.codes/tab/). You can use it in two ways:

- **Website** – point your browser at it with a simple new tab redirect extension like [this one](https://github.com/jimschubert/newtab-redirect). (Some features are only available for extension)
- **Chromium extension** – the same page packaged as a New Tab override that loads from disk (see below).

Example:
<img width="1919" height="909" alt="image" src="https://github.com/user-attachments/assets/a7fb2375-9581-4d6c-907e-e7654f01ce92" />

## Features

- Search box that supports any search engine you like
- Slash commands: search templates, link bundles and sandboxed scripts
- Shortcuts for your favourite and often accessed websites
- Search history
- Background image support
- Customization of colors, fonts, font sizes, background and data
- Widgets
- Presets
- Export/Import of configs
- Config reset
- Custom CSS (missing reference for now)

## Privacy focused

- Everything you setup, configure or search stays locally saved inside your browser. This includes:
    - Customization
    - Search history
    - Shortcuts
    - Background image
    - and everything else
- No cookies, ads or trackers
- Totally self-hostable, just serve the website (or use an extension)

## Building

The website and the extension are built from the same TypeScript sources with Bun.

```
bun install
bun run check       # type check (strict)
bun run lint
bun run build       # website -> dist/
bun run build:ext   # extension -> dist-ext/
```

To install the extension, open `chrome://extensions`, enable _Developer mode_, choose _Load unpacked_ and pick the `dist-ext/` folder. The extension keeps its own settings, separate from the website – use Export/Import in the Data tab to move them over.

## TODO

Improve README... I suck at READMEs
