'use strict';

const { Plugin, Notice } = require('obsidian');

module.exports = class SearchInsteadOfCreate extends Plugin {
  async onload() {
    const opts = { capture: true };
    this.registerDomEvent(document, 'click', this.handleClick.bind(this), opts);
    this.registerDomEvent(document, 'auxclick', this.handleClick.bind(this), opts);
    // Middle-click in some flows fires on mousedown without a subsequent click;
    // suppress it pre-emptively so nothing downstream can act on it.
    this.registerDomEvent(document, 'mousedown', this.handleMousedown.bind(this), opts);
    console.log('[search-instead-of-create] loaded');
  }

  onunload() {
    console.log('[search-instead-of-create] unloaded');
  }

  handleMousedown(evt) {
    if (evt.button !== 1) return; // middle only
    const link = this.findUnresolvedLink(evt.target);
    if (!link) return;
    evt.preventDefault();
    evt.stopPropagation();
  }

  handleClick(evt) {
    const link = this.findUnresolvedLink(evt.target);
    if (!link) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (typeof evt.stopImmediatePropagation === 'function') {
      evt.stopImmediatePropagation();
    }
    const raw = link.getAttribute('data-href')
      || link.getAttribute('href')
      || link.textContent
      || '';
    const target = this.cleanLinkText(raw);
    if (!target) return;
    this.searchFor(target);
  }

  // Find the nearest ancestor that is an internal link to a non-existent note.
  // Returns null for external links, resolved links, or non-link clicks.
  findUnresolvedLink(target) {
    if (!(target instanceof Element)) return null;

    // 1) Inline links: reading view (.internal-link), live preview
    //    (.cm-hmd-internal-link), and anything exposing data-href.
    const link = target.closest(
      'a.internal-link, span.internal-link, [data-href], .cm-hmd-internal-link, .cm-link-alias, .cm-link'
    );
    if (link) {
      if (link.classList.contains('external-link')) return null;
      if (link.tagName === 'A') {
        const href = link.getAttribute('href') || '';
        if (/^[a-z]+:\/\//i.test(href) || href.startsWith('mailto:')) return null;
      }
      const raw = link.getAttribute('data-href') || link.textContent || '';
      const cleaned = this.cleanLinkText(raw);
      if (!cleaned) return null;
      if (/^[a-z]+:\/\//i.test(cleaned)) return null;
      const dest = this.app.metadataCache.getFirstLinkpathDest(cleaned, '');
      if (dest) return null;
      return link;
    }

    // 2) Side-pane tree items: Outgoing Links pane, Backlinks pane (its
    //    "Unlinked mentions" doesn't create, but its link section does),
    //    and the Unresolved-links core plugin pane.
    const treeItem = target.closest('.tree-item-self');
    if (treeItem) {
      const pane = treeItem.closest(
        '.outgoing-link-pane, .backlink-pane, .unresolved-link-pane, .workspace-leaf-content[data-type="outgoing-link"], .workspace-leaf-content[data-type="backlink"], .workspace-leaf-content[data-type="unresolved-link"]'
      );
      if (!pane) return null;
      const inner = treeItem.querySelector('.tree-item-inner');
      const raw = (inner && inner.textContent) || treeItem.textContent || '';
      const cleaned = this.cleanLinkText(raw);
      if (!cleaned) return null;
      const dest = this.app.metadataCache.getFirstLinkpathDest(cleaned, '');
      if (dest) return null;
      return treeItem;
    }

    return null;
  }

  // Strip alias (|), heading/block anchor (#, ^), and any folder path —
  // leaving just the bare note name to search for.
  cleanLinkText(s) {
    if (!s) return '';
    let t = String(s).trim();
    const pipe = t.indexOf('|');
    if (pipe !== -1) t = t.slice(0, pipe);
    const hash = t.indexOf('#');
    if (hash !== -1) t = t.slice(0, hash);
    const caret = t.indexOf('^');
    if (caret !== -1) t = t.slice(0, caret);
    const slash = t.lastIndexOf('/');
    if (slash !== -1) t = t.slice(slash + 1);
    return t.trim();
  }

  async searchFor(name) {
    const escaped = name.replace(/"/g, '\\"');
    const query = `"${escaped}"`;

    const searchPlugin = this.app.internalPlugins
      && this.app.internalPlugins.getPluginById('global-search');
    if (searchPlugin && searchPlugin.instance && searchPlugin.instance.openGlobalSearch) {
      searchPlugin.instance.openGlobalSearch(query);
    } else {
      // Fallback: open the search pane without prefilling.
      this.app.commands.executeCommandById('global-search:open');
    }
    new Notice(`Searched instead of creating: ${name}`);
  }
};
