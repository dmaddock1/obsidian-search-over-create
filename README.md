# Search Over Create

An [Obsidian](https://obsidian.md) plugin that intercepts clicks on **unresolved internal links** and runs a vault-wide search for the target name instead of silently creating an empty note.

## Why

Obsidian's default behavior is to create a new note the moment you click an unresolved `[[wikilink]]`. That's friction-free when you want it and infuriating when you don't — it's easy to end up with a vault full of accidental empty stubs, especially when navigating outgoing-links panes or skimming old notes.

This plugin flips the default: an unresolved link is treated as a question ("where else does this name appear?") rather than a command to create. If you actually want to create the note, use the explicit **"Create new note"** command or your usual new-note workflow.

## What it intercepts

Any click on an unresolved internal link, in any of these surfaces:

- Inline links in reading view
- Inline links in live preview / source mode
- The **Outgoing Links** side pane
- The **Backlinks** side pane
- The **Unresolved Links** core-plugin pane
- Left-click, ctrl/cmd-click (new pane), and middle-click (new tab)

Resolved links are passed through untouched — normal navigation still works.

## What it doesn't intercept

- **Quick switcher** typing a non-existent name and pressing Enter — that's an explicit create gesture, not a click.
- **Graph view** unresolved nodes — those are canvas-rendered, not DOM, and need a different hook.
- The command-palette **"Create new note"** command — explicit by design.

## How it decides

Rather than relying on the `is-unresolved` CSS class (whose name has drifted across Obsidian versions), the plugin asks `metadataCache.getFirstLinkpathDest()` whether the link target resolves to a real file. If yes, the click is passed through. If no, the click is cancelled and the global search pane is opened with the query `"Target Name"` so you immediately see every note that mentions that name — including existing `[[wikilinks]]` to it.

## Install

### Manually

1. Copy `manifest.json` and `main.js` into your vault at `.obsidian/plugins/search-over-create/`
2. Reload Obsidian
3. Settings → Community plugins → enable **Search Over Create**

## License

MIT
