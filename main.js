'use strict';

const { Plugin, Notice, MarkdownView } = require('obsidian');

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
    const target = this.cleanLinkText(link.dataset.sicTarget || link.textContent || '');
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
      const info = this.getInlineLinkTarget(link);
      if (!info) return null; // Couldn't determine the real target — don't interfere.
      const linkpath = this.stripLinkSuffixes(info.linkpath);
      if (!linkpath) return null;
      if (/^[a-z]+:/i.test(linkpath)) return null;
      const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, info.sourcePath);
      if (dest) return null;
      link.dataset.sicTarget = linkpath;
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

  // Work out the actual link target (not the displayed alias) for an inline
  // link element. Returns { linkpath, sourcePath }, or null if unknown.
  getInlineLinkTarget(link) {
    const view = this.findMarkdownView(link);
    const sourcePath = (view && view.file && view.file.path) || '';

    // Reading view links carry the real target in data-href.
    const dataHref = link.getAttribute('data-href');
    if (dataHref) return { linkpath: dataHref, sourcePath };

    // Live preview: the rendered span may contain only the alias text
    // (e.g. [[file.pdf|Floor Map]] shows "Floor Map"), so recover the
    // target from the underlying source text via CodeMirror.
    const fromEditor = this.linkpathFromEditor(view, link);
    if (fromEditor) return { linkpath: fromEditor, sourcePath };

    // Without editor access, the text is only trustworthy when it isn't
    // an alias or the display text of a markdown link.
    if (link.classList.contains('cm-link-alias') || link.classList.contains('cm-link')) {
      return null;
    }
    const text = link.textContent || '';
    return text ? { linkpath: text, sourcePath } : null;
  }

  findMarkdownView(el) {
    let found = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!found && leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(el)) {
        found = leaf.view;
      }
    });
    return found;
  }

  // Map the clicked element back to its source line and return the target
  // of the wikilink or markdown link that contains it.
  linkpathFromEditor(view, el) {
    const cm = view && view.editor && view.editor.cm;
    if (!cm || typeof cm.posAtDOM !== 'function') return null;
    let pos;
    try {
      pos = cm.posAtDOM(el);
    } catch (e) {
      return null;
    }
    const line = cm.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const re = /\[\[([^\]]+?)\]\]|\[[^\]]*\]\(([^)\s]+)\)/g;
    let m;
    while ((m = re.exec(line.text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (offset < start || offset > end) continue;
      if (m[1] !== undefined) return m[1];
      try {
        return decodeURI(m[2]);
      } catch (e) {
        return m[2];
      }
    }
    return null;
  }

  // Strip alias (|) and heading/block anchor (#, ^), keeping any folder path
  // so path-qualified links resolve correctly.
  stripLinkSuffixes(s) {
    if (!s) return '';
    let t = String(s).trim();
    const pipe = t.indexOf('|');
    if (pipe !== -1) t = t.slice(0, pipe);
    const hash = t.indexOf('#');
    if (hash !== -1) t = t.slice(0, hash);
    const caret = t.indexOf('^');
    if (caret !== -1) t = t.slice(0, caret);
    return t.trim();
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
