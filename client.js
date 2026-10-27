/**
 * Client half of the custom-background bundle.
 *
 * What it does: the user picks a picture in Settings → Background. The picture
 * is stored as a Blob in this browser's IndexedDB — nothing is uploaded and the
 * host never touches it. A stylesheet then paints the picture on a fixed layer
 * underneath the shell and turns the shell's big opaque surfaces (frame, centre
 * column, sidebar column, bottom row, right bar) into translucent panels tinted
 * from the theme's own base colour, so the picture shows through without
 * competing with the interface.
 *
 * Readability is guaranteed rather than left to taste: on import the picture's
 * luminance is measured, and the veil over it is raised automatically until the
 * secondary label colour keeps a WCAG AA contrast ratio against the worst part
 * of the picture. The user can still ask for a stronger veil; they cannot
 * accidentally ask for a weaker one than legibility allows while
 * "auto contrast" stays on.
 *
 * Deliberate limits: dialogs, menus, code blocks, input pills, badges and the
 * terminal keep their opaque `--dsw-alias-bg-layer-*` surfaces. That is what
 * keeps a modal readable over any photo.
 *
 * The host half of this bundle is empty on purpose; all state is renderer-side.
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-wallpaper',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PLUGIN_ID = 'dsh-custom-wallpaper';
    const UI_STYLE_ID = PLUGIN_ID + '-ui-style';
    const BG_STYLE_ID = PLUGIN_ID + '-bg-style';
    const ROOT_CLASS = 'dcb-background-on';
    const PREFS_KEY = PLUGIN_ID + ':prefs';
    const DB_NAME = PLUGIN_ID;
    const DB_STORE = 'assets';
    const IMAGE_KEY = 'background';
    const MAX_FILE_BYTES = 30 * 1024 * 1024;
    const TARGET_CONTRAST = 4.5;
    const MAX_SCRIM = 92;

    // scrim  = strength of the theme-coloured veil over the picture, in %
    // panel  = opacity of the repainted shell surfaces, in %
    // auto   = raise scrim as needed to keep label text legible
    const DEFAULT_PREFS = { enabled: true, scrim: 55, panel: 30, auto: true };

    // ---------------------------------------------------------------- copy

    const COPY = {
      zh: {
        nav: '背景',
        title: '自定义背景',
        intro:
          '挑一张图片当界面背景。图片只保存在这台机器的浏览器里，不会上传，也不会写入磁盘。',
        imageLabel: '背景图片',
        pick: '选择图片',
        replace: '更换图片',
        clear: '移除背景',
        empty: '还没有选择背景图片',
        dropHint: '也可以把图片拖到这里',
        fileMeta: (name, size) => `${name} · ${size}`,
        scrimLabel: '图片遮罩',
        scrimHint: '遮罩越浓，图片越淡，界面上的字越清楚。',
        autoLabel: '自动保证文字清晰度',
        autoHint: '按图片亮度自动加浓遮罩，最多到 92%，避免亮图压掉文字。',
        autoRaised: (auto, user) => `已自动加浓到 ${auto}%（你设置的是 ${user}%）`,
        autoOk: '当前图片亮度下，你设的遮罩已经够清楚。',
        panelLabel: '面板不透明度',
        panelHint: '调低面板越透明、越能看见图片；调高更接近原本的界面。',
        enableLabel: '启用背景',
        enableHint: '关掉后恢复成原来的纯色界面，图片仍然保留。',
        reset: '恢复默认参数',
        resetDone: '参数已恢复默认。',
        notImage: '请选择图片文件（PNG / JPEG / WebP / GIF / AVIF）。',
        tooBig: '图片太大了（上限 30 MB），换一张小一点的吧。',
        readFail: '读取图片失败：',
        storageFail: '保存失败，浏览器存储可能已满：',
        saved: '设置会自动保存。',
        unsupported: '当前环境不支持 IndexedDB，无法保存图片。',
      },
      en: {
        nav: 'Background',
        title: 'Custom background',
        intro:
          'Use a picture as the shell background. The picture stays in this browser on this machine — it is never uploaded and never written to disk.',
        imageLabel: 'Background picture',
        pick: 'Choose a picture',
        replace: 'Replace picture',
        clear: 'Remove background',
        empty: 'No background picture yet',
        dropHint: '…or drop a picture here',
        fileMeta: (name, size) => `${name} · ${size}`,
        scrimLabel: 'Picture veil',
        scrimHint: 'A stronger veil fades the picture and keeps the text sharp.',
        autoLabel: 'Keep text legible automatically',
        autoHint:
          'Raises the veil as far as 92% when the picture is too bright for the label colour.',
        autoRaised: (auto, user) => `Raised to ${auto}% automatically (you set ${user}%)`,
        autoOk: 'At this picture’s brightness your veil is already enough.',
        panelLabel: 'Panel opacity',
        panelHint:
          'Lower means more picture shows through; higher is closer to the stock look.',
        enableLabel: 'Enable background',
        enableHint: 'Turn off to get the plain solid shell back. The picture is kept.',
        reset: 'Reset to defaults',
        resetDone: 'Defaults restored.',
        notImage: 'Please pick an image file (PNG / JPEG / WebP / GIF / AVIF).',
        tooBig: 'That picture is too large (30 MB limit). Try a smaller one.',
        readFail: 'Could not read the picture: ',
        storageFail: 'Could not save — browser storage may be full: ',
        saved: 'Settings are saved automatically.',
        unsupported: 'IndexedDB is unavailable here, so the picture cannot be stored.',
      },
    };

    function currentLang() {
      try {
        const raw = document.documentElement.lang || navigator.language || 'en';
        return String(raw).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
      } catch {
        return 'en';
      }
    }

    function t() {
      return COPY[currentLang()];
    }

    // ------------------------------------------------------------- numbers

    function clamp(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, Math.round(n)));
    }

    function clampFloat(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, n));
    }

    function formatBytes(bytes) {
      const n = Number(bytes);
      if (!Number.isFinite(n) || n <= 0) return '0 KB';
      if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    function srgbToLinear(c) {
      const v = clampFloat(c, 0, 1);
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    function contrastRatio(a, b) {
      const la = srgbToLinear(a);
      const lb = srgbToLinear(b);
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    }

    /** One shared 1×1 canvas, used to normalise any CSS colour to bytes. */
    let sharedCanvas = null;
    function canvas2d() {
      if (sharedCanvas) return sharedCanvas;
      const el = document.createElement('canvas');
      el.width = 1;
      el.height = 1;
      sharedCanvas = el.getContext('2d', { willReadFrequently: true });
      return sharedCanvas;
    }

    function colorToGray(cssColor) {
      if (!cssColor) return null;
      try {
        const ctx2d = canvas2d();
        if (!ctx2d) return null;
        ctx2d.clearRect(0, 0, 1, 1);
        ctx2d.fillStyle = '#000000';
        ctx2d.fillStyle = cssColor;
        ctx2d.fillRect(0, 0, 1, 1);
        const data = ctx2d.getImageData(0, 0, 1, 1).data;
        if (data[3] === 0) return null;
        return (0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2]) / 255;
      } catch {
        return null;
      }
    }

    /**
     * The current theme's base fill and secondary label colour, expressed as
     * 0..1 grey levels. Falls back to the dark palette if the tokens cannot be
     * read (e.g. very early in boot).
     */
    function readTheme() {
      let bg = null;
      let fg = null;
      try {
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText =
          'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;' +
          'background-color:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);';
        document.body.append(probe);
        const style = getComputedStyle(probe);
        bg = colorToGray(style.backgroundColor);
        fg = colorToGray(style.color);
        probe.remove();
      } catch {
        bg = null;
        fg = null;
      }
      const dark = (() => {
        try {
          return document.body.hasAttribute('data-ds-dark-theme');
        } catch {
          return true;
        }
      })();
      if (bg === null) bg = dark ? 0.082 : 1;
      if (fg === null) fg = dark ? 0.63 : 0.42;
      return { bg: bg, fg: fg, dark: dark };
    }

    /**
     * Smallest veil (0..1) that keeps the label colour at TARGET_CONTRAST
     * against the worst part of the picture, after the panel tint is applied.
     * `imageGray` is the bright end of the picture's luminance histogram.
     */
    function requiredScrim(imageGray, panelPct, theme) {
      if (!Number.isFinite(imageGray)) return 0;
      const p = clampFloat(panelPct, 0, 100) / 100;
      const b = theme.bg;
      const f = theme.fg;
      const backdrop = (s) => {
        const afterVeil = s * b + (1 - s) * imageGray;
        return p * b + (1 - p) * afterVeil;
      };
      if (contrastRatio(f, backdrop(0)) >= TARGET_CONTRAST) return 0;
      if (contrastRatio(f, backdrop(1)) < TARGET_CONTRAST) return MAX_SCRIM / 100;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 26; i += 1) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(f, backdrop(mid)) >= TARGET_CONTRAST) hi = mid;
        else lo = mid;
      }
      return clampFloat(hi, 0, MAX_SCRIM / 100);
    }

    /**
     * Mean and bright-end (75th percentile) luminance of an image blob.
     * Returns null when the browser refuses to decode it.
     */
    async function measureTone(blob) {
      try {
        const bitmap = await createImageBitmap(blob);
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx2d) return null;
        ctx2d.drawImage(bitmap, 0, 0, size, size);
        if (typeof bitmap.close === 'function') bitmap.close();
        const data = ctx2d.getImageData(0, 0, size, size).data;
        const gray = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 8) continue;
          gray.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
        }
        if (!gray.length) return null;
        gray.sort((a, b) => a - b);
        const mean = gray.reduce((sum, v) => sum + v, 0) / gray.length;
        const high = gray[Math.min(gray.length - 1, Math.floor(gray.length * 0.75))];
        return { mean: mean, high: high };
      } catch {
        return null;
      }
    }

    // -------------------------------------------------------------- prefs

    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULT_PREFS };
        const parsed = JSON.parse(raw);
        const out = { ...DEFAULT_PREFS };
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.enabled === 'boolean') out.enabled = parsed.enabled;
          if (typeof parsed.auto === 'boolean') out.auto = parsed.auto;
          if (Number.isFinite(parsed.scrim)) out.scrim = clamp(parsed.scrim, 0, MAX_SCRIM);
          if (Number.isFinite(parsed.panel)) out.panel = clamp(parsed.panel, 0, 100);
        }
        return out;
      } catch {
        return { ...DEFAULT_PREFS };
      }
    }

    function writePrefs(prefs) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        return true;
      } catch {
        return false;
      }
    }

    // ---------------------------------------------------------- IndexedDB

    function openDb() {
      return new Promise((resolve, reject) => {
        let factory;
        try {
          factory = window.indexedDB;
        } catch {
          factory = undefined;
        }
        if (!factory) {
          reject(new Error('indexeddb-unavailable'));
          return;
        }
        const request = factory.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexeddb-open-failed'));
        request.onblocked = () => reject(new Error('indexeddb-blocked'));
      });
    }

    async function dbGet(key) {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, 'readonly');
          const request = tx.objectStore(DB_STORE).get(key);
          request.onsuccess = () => resolve(request.result === undefined ? null : request.result);
          request.onerror = () => reject(request.error || new Error('indexeddb-read-failed'));
        });
      } finally {
        try {
          db.close();
        } catch {
          /* ignore */
        }
      }
    }

    async function dbPut(key, value) {
      const db = await openDb();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('indexeddb-write-failed'));
          tx.onabort = () => reject(tx.error || new Error('indexeddb-write-aborted'));
        });
      } finally {
        try {
          db.close();
        } catch {
          /* ignore */
        }
      }
    }

    async function dbDelete(key) {
      const db = await openDb();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('indexeddb-delete-failed'));
        });
      } finally {
        try {
          db.close();
        } catch {
          /* ignore */
        }
      }
    }

    // ------------------------------------------------------ style plumbing

    function ensureStyleElement(id) {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        el.setAttribute('data-plugin', PLUGIN_ID);
        document.head.append(el);
      }
      return el;
    }

    function removeStyleElement(id) {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /**
     * On Windows the native caption (minimise / maximise / close) is painted by
     * DWM from a solid colour the desktop shell hands to `setTitleBarOverlay`,
     * never from the document. The shell derives that colour from a hidden
     * probe span the desktop preload appends to `<body>`:
     *
     *   position:fixed;visibility:hidden;pointer-events:none;
     *   background-color:var(--dsw-specific-sidebar-fill);
     *   color:var(--dsw-alias-label-primary)
     *
     * It reads the probe's *computed* background, so tinting the visible panels
     * does not reach it — the caption keeps the opaque sidebar token and shows
     * up as a solid block that the picture cannot shine through. Matching the
     * probe by its inline style and clearing its fill makes the shell report a
     * transparent caption instead, so DWM draws the buttons straight over the
     * title-bar band the wallpaper already shows through. Only the fill is
     * touched; the probe's `color` still supplies the symbol colour.
     */
    const CAPTION_PROBE_SELECTOR =
      'body > span[style*="--dsw-specific-sidebar-fill"]';

    /**
     * Every DSH rebuild re-hashes the CSS-module class names the shell is made
     * of (`mP3x-q_frame` today, `BynINW_frame` yesterday). Pinning those hashes
     * is exactly why 1.0.1 painted nothing once the host moved to rc.3: the
     * picture layer was still fine, but every opaque shell panel stayed opaque
     * and covered it.
     *
     * The surfaces are therefore resolved in two layers:
     *
     *  - discovery (preferred): a few semantic suffixes are unique across the
     *    whole class namespace (`_centerCol`, `_sidebarCol`, `_bottomRow`,
     *    `_rightbarCol`, `_composerSeat`, `_panelBody`, `_fade`), so the live DOM
     *    can name the real classes without knowing today's hash. The frame is
     *    not discoverable that way — `_frame` is shared by a dozen unrelated
     *    modules — but it is the parent of the centre column, so it is found
     *    structurally.
     *  - static table (fallback): explicit names for everything else, listing
     *    both the rc.3 names and the pre-rc.3 ones. Selectors that match nothing
     *    are inert, so one table keeps the plugin working across host versions.
     */

    /** Outer panels: one veil of the theme's base fill. */
    const STATIC_TINTED = [
      // The window frame paints the sidebar fill on Windows (the title-bar band
      // is cut out of it), so it is tinted rather than cleared — that keeps the
      // title bar the same weight as the panels under it.
      '.mP3x-q_frame',
      '.BynINW_frame',
      '.mP3x-q_centerCol',
      '.mP3x-q_bottomRow',
      '.mP3x-q_rightbarCol',
      '.BynINW_centerCol',
      '.BynINW_bottomRow',
      '.BynINW_rightbarCol',
      // Content chrome that carries a base fill of its own: the picture viewer
      // frame, markdown images and the code-block banner.
      '._frame_1hfzl_1',
      '._image_1ypvv_287',
      '._bannerWrap_7gxqk_24',
    ];

    /** The sidebar column carries the sidebar's own fill, not the base one. */
    const STATIC_TINTED_SIDEBAR = ['.mP3x-q_sidebarCol', '.BynINW_sidebarCol'];

    /**
     * Inner surfaces that paint their own opaque fill on top of the tinted
     * parent; they are cleared so the parent's veil (and the picture) shows
     * through. Dialogs, menus, cards, input pills, code bodies and the terminal
     * are deliberately absent — they must stay opaque to stay readable.
     */
    const STATIC_CLEARED = [
      // The window frame's title-bar band. The frame element itself is tinted
      // (STATIC_TINTED) so the band and the panels share one weight.
      '.mP3x-q_frame::before',
      '.BynINW_frame::before',
      // Conversation and sidebar roots.
      '.an3WzG_root',
      '.wtg9ga_root',
      '._2H3hWW_root',
      '.Dc7zOa_root',
      // Dock tab hosts.
      '._tabHost_6nhg2_162',
      '._emptyTabHost_6nhg2_143',
      '._surface_6nhg2_125',
      '._tabLayout_6nhg2_134',
      // Side panels.
      '.acoR2W_panelBody',
      '.bZwPEG_root',
      '.bZwPEG_frame',
      '.CsSxCG_frame',
      '.OUqwTW_panel',
      '._panelBody_6nhg2_318',
      '.qWvkEq_root',
      '.qWvkEq_frame',
    ];

    /** Text-entry surfaces keep a readable floor of the panel tint. */
    const EDITOR_SELECTORS = ['._editor_61ozo_1'];

    /** The docked composer sits on an opaque sticky gradient band. */
    const COMPOSER_SEAT_SELECTORS = ['.an3WzG_composerSeat', '.Dc7zOa_composerSeat'];

    /** The session list fades into the sidebar fill at its foot. */
    const SIDEBAR_FADE_SELECTORS = ['.GAkraW_fade', '._9lTDKa_fade'];

    /** Semantic suffixes that are unique across the whole class namespace. */
    const DISCOVERABLE = [
      'centerCol',
      'sidebarCol',
      'bottomRow',
      'rightbarCol',
      'composerSeat',
      'panelBody',
      'fade',
    ];

    function classTokensOf(el) {
      if (!el || !el.classList) return [];
      return Array.from(el.classList);
    }

    /**
     * The one class token in the live DOM that ends in `_<suffix>`, or null when
     * the suffix is absent or shared by more than one token — guessing there
     * would paint the wrong element.
     */
    function uniqueSuffixClass(suffix) {
      let found = null;
      let nodes;
      try {
        nodes = document.querySelectorAll(`[class*="_${suffix}"]`);
      } catch {
        return null;
      }
      for (const node of nodes) {
        for (const token of classTokensOf(node)) {
          if (!token.endsWith(`_${suffix}`)) continue;
          if (found === null) found = token;
          else if (found !== token) return null;
        }
      }
      return found;
    }

    /**
     * Reads the live shell and returns the selectors that exist right now. Any
     * failure just yields fewer selectors; the static table still applies.
     */
    function discoverSurfaces() {
      const out = {
        tinted: [],
        tintedSidebar: [],
        cleared: [],
        composerSeat: [],
        fade: [],
      };
      const found = {};
      DISCOVERABLE.forEach((suffix) => {
        const token = uniqueSuffixClass(suffix);
        if (token) found[suffix] = token;
      });

      ['centerCol', 'bottomRow', 'rightbarCol'].forEach((key) => {
        if (found[key]) out.tinted.push(`.${CSS.escape(found[key])}`);
      });
      if (found.sidebarCol) out.tintedSidebar.push(`.${CSS.escape(found.sidebarCol)}`);
      if (found.panelBody) out.cleared.push(`.${CSS.escape(found.panelBody)}`);
      if (found.composerSeat) out.composerSeat.push(`.${CSS.escape(found.composerSeat)}`);
      if (found.fade) out.fade.push(`.${CSS.escape(found.fade)}`);

      // The frame is the grid item that holds the centre column. Its class
      // tokens are taken from the live element rather than from a table, but
      // only the ones that are hashed module names carried by exactly one node —
      // a shared utility class would otherwise be cleared app-wide.
      //
      // Only the frame's `::before` is cleared: that pseudo-element is the
      // window's title-bar drag band, which the host paints with the sidebar
      // fill. The frame element itself stays tinted (see STATIC_TINTED) so the
      // title bar keeps the same weight as the panels below it.
      if (found.centerCol) {
        let centre = null;
        try {
          centre = document.querySelector(`.${CSS.escape(found.centerCol)}`);
        } catch {
          centre = null;
        }
        const frame = centre && centre.parentElement;
        if (frame && frame !== document.body && frame !== document.documentElement) {
          classTokensOf(frame).forEach((token) => {
            if (token.indexOf('_') < 0) return;
            let nodes = null;
            try {
              nodes = document.querySelectorAll(`.${CSS.escape(token)}`);
            } catch {
              nodes = null;
            }
            if (!nodes || nodes.length !== 1) return;
            const sel = `.${CSS.escape(token)}`;
            out.cleared.push(`${sel}::before`);
          });
        }
      }
      return out;
    }

    function mergeSelectors(...lists) {
      const seen = new Set();
      const out = [];
      lists.forEach((list) => {
        (list || []).forEach((sel) => {
          if (!sel || seen.has(sel)) return;
          seen.add(sel);
          out.push(sel);
        });
      });
      return out;
    }

    function selectorList(list) {
      return list.map((sel) => `html.${ROOT_CLASS} ${sel}`).join(',\n');
    }

    /**
     * Builds the stylesheet. Returns both the CSS and the numbers that produced
     * it so the settings page can explain what the auto-contrast did.
     */
    function buildBackgroundCss(prefs, imageUrl, tone) {
      const theme = readTheme();
      const requested = clamp(prefs.scrim, 0, MAX_SCRIM);
      const imageGray = tone && Number.isFinite(tone.high) ? tone.high : null;
      const needed =
        prefs.auto && imageGray !== null
          ? requiredScrim(imageGray, prefs.panel, theme) * 100
          : 0;
      const effective = clamp(Math.max(requested, needed), 0, MAX_SCRIM);
      const panel = clamp(prefs.panel, 0, 100);
      // Surfaces the user types into or reads code from keep a floor.
      const editor = Math.max(panel, 68);

      const live = discoverSurfaces();

      const tinted = mergeSelectors(live.tinted, STATIC_TINTED);
      const tintedSidebar = mergeSelectors(live.tintedSidebar, STATIC_TINTED_SIDEBAR);
      const cleared = mergeSelectors(live.cleared, STATIC_CLEARED);
      const composerSeat = mergeSelectors(live.composerSeat, COMPOSER_SEAT_SELECTORS);
      const fade = mergeSelectors(live.fade, SIDEBAR_FADE_SELECTORS);

      const tint = (pct) =>
        `color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) ${pct}%, transparent)`;
      const tintSidebar = (pct) =>
        `color-mix(in srgb, var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #ffffff)) ${pct}%, transparent)`;

      const css = `
html.${ROOT_CLASS} body {
  background-color: transparent !important;
  background-image: none !important;
}

/* The picture itself: a fixed layer behind everything the shell renders.
   z-index -1 keeps it out of the way of every stacking context in the app. */
html.${ROOT_CLASS} body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-base, #ffffff);
  background-image: linear-gradient(${tint(effective)}, ${tint(effective)}), url("${imageUrl}");
  background-size: cover, cover;
  background-position: center center, center center;
  background-repeat: no-repeat, no-repeat;
}

/* Windows paints the native caption from a solid colour the shell measures off
   a hidden probe span; leave it alone and the buttons sit on an opaque slab the
   picture cannot reach. Clearing only the probe's fill makes the shell report a
   transparent caption, so DWM draws the buttons straight over the title-bar
   band. Its inline \`color\` is untouched, so the symbol colour still works. */
html.${ROOT_CLASS} ${CAPTION_PROBE_SELECTOR} {
  background-color: transparent !important;
}

${selectorList(cleared)} {
  background-color: transparent !important;
  background-image: none !important;
}

${selectorList(tinted)} {
  background-color: ${tint(panel)} !important;
  background-image: none !important;
}

/* The sidebar is filled from the sidebar token, not the base one; tinting it
   with the base colour would turn it into a differently-shaded slab. */
${selectorList(tintedSidebar)} {
  background-color: ${tintSidebar(panel)} !important;
  background-image: none !important;
}

${selectorList(EDITOR_SELECTORS)} {
  background-color: ${tint(editor)} !important;
}

/* While a conversation is active the shell docks the composer behind an opaque
   sticky fade. Repaint that band with the panel tint so the picture reaches the
   bottom edge instead of ending in a solid stripe behind the input box. */
${selectorList(composerSeat)} {
  background: linear-gradient(180deg, transparent 0px, ${tint(panel)} 36px) !important;
}

/* The sidebar list fades into the sidebar colour at its foot; match the
   translucent panel so no solid stripe appears. */
${selectorList(fade)} {
  background: linear-gradient(to bottom, transparent, ${tintSidebar(panel)}) !important;
}
`;

      return {
        css: css,
        scrim: effective,
        requested: requested,
        raised: effective > requested,
        panel: panel,
        discovered: {
          tinted: live.tinted,
          tintedSidebar: live.tintedSidebar,
          cleared: live.cleared,
          composerSeat: live.composerSeat,
          fade: live.fade,
        },
      };
    }

    const UI_CSS = `
.dcb-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 0 8px;
  max-width: 640px;
}
.dcb-head-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 4px;
}
.dcb-head-intro {
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
}
.dcb-hero {
  display: flex;
  gap: 14px;
  align-items: stretch;
}
.dcb-thumb {
  flex: 1 1 auto;
  min-height: 142px;
  border-radius: 10px;
  border: 1px dashed var(--dsw-alias-border-l1);
  background-color: var(--dsw-alias-bg-layer-1);
  background-size: cover;
  background-position: center center;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  cursor: pointer;
}
.dcb-thumb[data-dragging="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dcb-thumb[data-has-image="true"] {
  border-style: solid;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
.dcb-thumb-meta {
  align-self: flex-end;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcb-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  flex: 0 0 auto;
}
.dcb-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
}
.dcb-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}
.dcb-btn[data-kind="primary"] {
  background: var(--dsw-alias-button-primary-fill, #f9fafb);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-foreground, #0f1115);
  font-weight: 500;
}
.dcb-btn[data-kind="primary"]:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #ebeef2);
  filter: none;
}
.dcb-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.dcb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dcb-field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.dcb-field-value {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dcb-field-hint {
  font-size: 12px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
}
.dcb-field-state {
  font-size: 12px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
}
.dcb-range {
  width: 100%;
  accent-color: var(--dsw-alias-brand-primary);
  margin: 0;
}
.dcb-range:disabled {
  opacity: 0.45;
}
.dcb-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dcb-toggle-label {
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 3px;
}
.dcb-checkbox {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.dcb-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dcb-note {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dcb-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  line-height: 1.55;
}
`;

    // ----------------------------------------------------------- the store

    function createStore() {
      let prefs = readPrefs();
      let image = null; // { url, name, size, type, tone }
      let objectUrl = null;
      let applied = null; // { scrim, requested, raised, panel }
      let error = null;
      let disposed = false;
      const listeners = new Set();

      function snapshot() {
        return {
          prefs: { ...prefs },
          image: image ? { ...image } : null,
          applied: applied ? { ...applied } : null,
          error: error,
          hasImage: Boolean(image),
        };
      }

      function emit() {
        if (disposed) return;
        const state = snapshot();
        listeners.forEach((listener) => {
          try {
            listener(state);
          } catch {
            /* a broken listener must not break the store */
          }
        });
      }

      function repaint() {
        if (disposed) return;
        const root = document.documentElement;
        const active = Boolean(image && prefs.enabled);
        if (!active) {
          removeStyleElement(BG_STYLE_ID);
          if (root) root.classList.remove(ROOT_CLASS);
          applied = null;
          return;
        }
        const built = buildBackgroundCss(prefs, image.url, image.tone);
        // Mark the root before touching the sheet: the desktop preload re-reads
        // its caption probe whenever <head> mutates, and the probe rule only
        // applies under this class. Adding it first means the very first send
        // already sees the cleared fill instead of the opaque token.
        if (root) root.classList.add(ROOT_CLASS);
        const el = ensureStyleElement(BG_STYLE_ID);
        if (el.textContent !== built.css) el.textContent = built.css;
        applied = {
          scrim: built.scrim,
          requested: built.requested,
          raised: built.raised,
          panel: built.panel,
        };
        watchShell();
      }

      /**
       * The shell mounts lazily and swaps whole panels in and out as the user
       * navigates, so the surfaces discovered at first paint are not the final
       * set. Re-derive the sheet shortly after the shell's class names change.
       *
       * The observer is deliberately lazy: it never resets a pending run, so a
       * chat that streams new nodes for minutes still repaints on a steady
       * cadence instead of being starved by a debounce that keeps restarting.
       * Repainting is cheap — discovery is a handful of attribute-substring
       * lookups, and the stylesheet text is only replaced when it differs.
       */
      let observer = null;
      let settleTimer = 0;

      function scheduleSettle() {
        if (disposed || settleTimer) return;
        settleTimer = setTimeout(() => {
          settleTimer = 0;
          if (!disposed) repaint();
        }, 400);
      }

      function watchShell() {
        if (observer || disposed) return;
        try {
          observer = new MutationObserver(scheduleSettle);
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class'],
          });
        } catch {
          observer = null;
        }
      }

      function releaseUrl() {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            /* ignore */
          }
          objectUrl = null;
        }
      }

      function adopt(record) {
        releaseUrl();
        const blob = record.blob;
        objectUrl = URL.createObjectURL(blob);
        image = {
          url: objectUrl,
          name: record.name || 'background',
          size: record.size || blob.size || 0,
          type: record.type || blob.type || '',
          tone: record.tone && Number.isFinite(record.tone.high) ? record.tone : null,
        };
      }

      async function load() {
        try {
          const record = await dbGet(IMAGE_KEY);
          if (disposed || !record || !record.blob) return;
          adopt(record);
          repaint();
          emit();
          if (!image.tone) {
            // Records written by an older build have no tone yet: measure once
            // and store it so the veil can be tuned to this picture.
            const tone = await measureTone(record.blob);
            if (disposed || !tone || !image) return;
            image = { ...image, tone: tone };
            repaint();
            emit();
            try {
              await dbPut(IMAGE_KEY, { ...record, tone: tone });
            } catch {
              /* the visual result is already correct */
            }
          }
        } catch (cause) {
          if (cause && String(cause.message) === 'indexeddb-unavailable') {
            error = t().unsupported;
            emit();
          }
          /* a failed restore simply means no background */
        }
      }

      async function setImage(file) {
        if (!file) return;
        const copy = t();
        if (!/^image\//i.test(String(file.type || ''))) {
          error = copy.notImage;
          emit();
          return;
        }
        if (Number(file.size) > MAX_FILE_BYTES) {
          error = copy.tooBig;
          emit();
          return;
        }
        try {
          const blob = file instanceof Blob ? file : new Blob([file], { type: file.type });
          const tone = await measureTone(blob);
          if (disposed) return;
          await dbPut(IMAGE_KEY, {
            blob: blob,
            name: file.name || 'background',
            size: blob.size,
            type: blob.type,
            tone: tone,
            savedAt: Date.now(),
          });
          if (disposed) return;
          releaseUrl();
          objectUrl = URL.createObjectURL(blob);
          image = {
            url: objectUrl,
            name: file.name || 'background',
            size: blob.size,
            type: blob.type,
            tone: tone,
          };
          error = null;
          if (!prefs.enabled) prefs = { ...prefs, enabled: true };
          writePrefs(prefs);
          repaint();
          emit();
        } catch (cause) {
          error = copy.storageFail + (cause && cause.message ? cause.message : String(cause));
          emit();
        }
      }

      async function clearImage() {
        releaseUrl();
        image = null;
        error = null;
        repaint();
        emit();
        try {
          await dbDelete(IMAGE_KEY);
        } catch {
          /* the visible state is already cleared */
        }
      }

      function setPref(key, value) {
        if (key === 'scrim' || key === 'panel') {
          const max = key === 'scrim' ? MAX_SCRIM : 100;
          prefs = { ...prefs, [key]: clamp(value, 0, max) };
        } else if (key === 'enabled' || key === 'auto') {
          prefs = { ...prefs, [key]: Boolean(value) };
        } else {
          return;
        }
        writePrefs(prefs);
        repaint();
        emit();
      }

      function resetPrefs() {
        prefs = { ...DEFAULT_PREFS };
        error = null;
        writePrefs(prefs);
        repaint();
        emit();
      }

      function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }

      function dispose() {
        disposed = true;
        listeners.clear();
        if (observer) {
          try {
            observer.disconnect();
          } catch {
            /* ignore */
          }
          observer = null;
        }
        clearTimeout(settleTimer);
        releaseUrl();
        removeStyleElement(BG_STYLE_ID);
        removeStyleElement(UI_STYLE_ID);
        const root = document.documentElement;
        if (root) root.classList.remove(ROOT_CLASS);
      }

      return {
        getState: snapshot,
        subscribe: subscribe,
        load: load,
        setImage: setImage,
        clearImage: clearImage,
        setPref: setPref,
        resetPrefs: resetPrefs,
        repaint: repaint,
        dispose: dispose,
      };
    }

    // ------------------------------------------------------------ the view

    function BackgroundSettings(props) {
      const api = props && props.api;
      const copy = t();
      const [state, setState] = React.useState(() => (api ? api.getState() : null));
      const [dragging, setDragging] = React.useState(false);
      const [notice, setNotice] = React.useState('');
      const inputRef = React.useRef(null);

      React.useEffect(() => {
        if (!api) return undefined;
        setState(api.getState());
        return api.subscribe(setState);
      }, [api]);

      if (!api || !state) {
        return h('div', { className: 'dcb-root' }, h('p', { className: 'dcb-error' }, copy.unsupported));
      }

      const prefs = state.prefs;
      const image = state.image;
      const applied = state.applied;
      const error = state.error;
      const hasImage = state.hasImage;

      function onFiles(fileList) {
        const file = fileList && fileList[0];
        if (file) void api.setImage(file);
      }

      function onPick() {
        const input = inputRef.current;
        if (input) input.click();
      }

      function onReset() {
        api.resetPrefs();
        setNotice(copy.resetDone);
      }

      const scrimValue = applied && hasImage ? applied.scrim : prefs.scrim;
      const autoState =
        applied && hasImage
          ? applied.raised
            ? copy.autoRaised(applied.scrim, applied.requested)
            : copy.autoOk
          : '';

      return h(
        'div',
        { className: 'dcb-root' },
        h(
          'div',
          null,
          h('p', { className: 'dcb-head-title' }, copy.title),
          h('p', { className: 'dcb-head-intro' }, copy.intro)
        ),
        h(
          'div',
          { className: 'dcb-field' },
          h('div', { className: 'dcb-field-head' }, h('span', null, copy.imageLabel)),
          h(
            'div',
            { className: 'dcb-hero' },
            h(
              'div',
              {
                className: 'dcb-thumb',
                'data-dragging': dragging ? 'true' : 'false',
                'data-has-image': hasImage ? 'true' : 'false',
                style: hasImage
                  ? { backgroundImage: `url("${image.url}")` }
                  : undefined,
                onDragOver: (event) => {
                  event.preventDefault();
                  setDragging(true);
                },
                onDragLeave: () => setDragging(false),
                onDrop: (event) => {
                  event.preventDefault();
                  setDragging(false);
                  onFiles(event.dataTransfer && event.dataTransfer.files);
                },
                onClick: onPick,
              },
              hasImage
                ? h(
                    'span',
                    { className: 'dcb-thumb-meta' },
                    copy.fileMeta(image.name, formatBytes(image.size))
                  )
                : h('span', null, copy.empty, h('br'), copy.dropHint)
            ),
            h(
              'div',
              { className: 'dcb-actions' },
              h('input', {
                ref: inputRef,
                type: 'file',
                accept: 'image/*',
                style: { display: 'none' },
                onChange: (event) => {
                  onFiles(event.target.files);
                  event.target.value = '';
                },
              }),
              h(
                'button',
                { type: 'button', className: 'dcb-btn', 'data-kind': 'primary', onClick: onPick },
                hasImage ? copy.replace : copy.pick
              ),
              hasImage
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dcb-btn',
                      onClick: () => {
                        setNotice('');
                        void api.clearImage();
                      },
                    },
                    copy.clear
                  )
                : null
            )
          )
        ),
        h(
          'div',
          { className: 'dcb-field' },
          h(
            'div',
            { className: 'dcb-field-head' },
            h('span', null, copy.scrimLabel),
            h('span', { className: 'dcb-field-value' }, `${scrimValue}%`)
          ),
          h('input', {
            className: 'dcb-range',
            type: 'range',
            min: 0,
            max: 92,
            step: 1,
            value: prefs.scrim,
            disabled: !hasImage,
            onChange: (event) => api.setPref('scrim', Number(event.target.value)),
          }),
          h('div', { className: 'dcb-field-hint' }, copy.scrimHint),
          autoState ? h('div', { className: 'dcb-field-state' }, autoState) : null
        ),
        h(
          'div',
          { className: 'dcb-field' },
          h(
            'div',
            { className: 'dcb-field-head' },
            h('span', null, copy.panelLabel),
            h('span', { className: 'dcb-field-value' }, `${prefs.panel}%`)
          ),
          h('input', {
            className: 'dcb-range',
            type: 'range',
            min: 0,
            max: 100,
            step: 1,
            value: prefs.panel,
            disabled: !hasImage,
            onChange: (event) => api.setPref('panel', Number(event.target.value)),
          }),
          h('div', { className: 'dcb-field-hint' }, copy.panelHint)
        ),
        h(
          'div',
          { className: 'dcb-toggle-row' },
          h(
            'div',
            null,
            h('div', { className: 'dcb-toggle-label' }, copy.autoLabel),
            h('div', { className: 'dcb-field-hint' }, copy.autoHint)
          ),
          h('input', {
            className: 'dcb-checkbox',
            type: 'checkbox',
            checked: Boolean(prefs.auto),
            onChange: (event) => api.setPref('auto', event.target.checked),
          })
        ),
        h(
          'div',
          { className: 'dcb-toggle-row' },
          h(
            'div',
            null,
            h('div', { className: 'dcb-toggle-label' }, copy.enableLabel),
            h('div', { className: 'dcb-field-hint' }, copy.enableHint)
          ),
          h('input', {
            className: 'dcb-checkbox',
            type: 'checkbox',
            checked: Boolean(prefs.enabled),
            onChange: (event) => api.setPref('enabled', event.target.checked),
          })
        ),
        error ? h('div', { className: 'dcb-error' }, error) : null,
        h(
          'div',
          { className: 'dcb-footer' },
          h('div', { className: 'dcb-note' }, notice || copy.saved),
          h('button', { type: 'button', className: 'dcb-btn', onClick: onReset }, copy.reset)
        )
      );
    }

    // ------------------------------------------------------------- the entry

    function apply(ctx) {
      const store = createStore();

      ctx.effect(() => {
        const uiStyle = ensureStyleElement(UI_STYLE_ID);
        if (uiStyle.textContent !== UI_CSS) uiStyle.textContent = UI_CSS;

        const disposeSection = ctx.slots.inject('settings.section', () => {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: PLUGIN_ID,
              order: 45,
              label: () => t().nav,
              inject: () => ({ api: store }),
            },
            BackgroundSettings
          );
        });

        // Restore the saved picture, then paint. Both steps tolerate failure:
        // a missing or unreadable record just means "no background".
        store.repaint();
        void store.load();

        return () => {
          if (typeof disposeSection === 'function') disposeSection();
          store.dispose();
        };
      });
    }

    return { name: PLUGIN_ID, inject: ['slots'], apply: apply };
  },
});
