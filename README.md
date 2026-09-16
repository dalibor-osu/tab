# tab

This project contains a simple, highly customizable website aimed to be used as default new tab page in your browser.

You can try it [here](https://dalibor.codes/tab/). You can use it in two ways:

- **Website** – point your browser at it with a simple new tab redirect extension like [this one](https://github.com/jimschubert/newtab-redirect).
- **Chromium extension** – the same page packaged as a New Tab override that loads from disk (see below).

Example:
<img width="1918" height="907" alt="image" src="https://github.com/user-attachments/assets/91becddf-7d0c-40f2-a1c4-482178c132f7" />

## Features

- Search box that supports any search engine you like
- Shortcuts for your favourite and often accessed websites
- Search history
- Background image support
- Customization of colors, fonts, font sizes, background and data
- Widgets on a full-screen grid you size yourself: clock (digital or analog), date, sticky notes, to-do lists, and external widgets written by anyone – those run in a sandbox with no access to the page, your data or the network unless you allow specific hosts
- Presets – save your whole setup and switch between them, loading only the parts you want (styling, content, shortcuts, commands)
- Export only the parts you choose (share your styling without your shortcuts or commands) and import shared files either directly or as a new preset
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
- Totally self-hostable, just serve the website

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
