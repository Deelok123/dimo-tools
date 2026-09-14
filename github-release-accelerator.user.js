// ==UserScript==
// @name          GitHub Release 下载加速
// @name:zh-CN    GitHub Release 下载加速
// @namespace     github-release-accelerator
// @version       1.5.1
// @description   加速 GitHub 的 Release 文件、源码包、raw 文件与 gist 文件下载，点击即可下载，支持多条加速线路。
// @description:zh-CN  加速 GitHub 的 Release 文件、源码包、raw 文件与 gist 文件下载，点击即可下载，支持多条加速线路。
// @author        you
// @match         https://github.com/*
// @match         https://www.github.com/*
// @run-at        document-start
// @grant         GM_registerMenuCommand
// @grant         GM_unregisterMenuCommand
// @grant         GM_getValue
// @grant         GM_setValue
// @license       MIT
// ==/UserScript==

(function () {
  'use strict';

  // ===== 线路 =====
  const DEFAULT_PROXY = 'cdn.gh-proxy.org';                 // 点击时立刻走的默认线路
  const ALT_PROXIES = ['gh-proxy.org', 'v6.gh-proxy.org'];  // 卡片里提供的备用线路（顺序即展示顺序）
  const ALL_PROXIES = [DEFAULT_PROXY].concat(ALT_PROXIES);

  // 用一条正则判断"是否已是加速地址"，比数组 some+startsWith 更快
  const PROXY_RE = new RegExp(
    '^https://(?:' + ALL_PROXIES.map((h) => h.replace(/\./g, '\\.')).join('|') + ')/'
  );
  const isProxyUrl = (href) => PROXY_RE.test(href);
  const accelUrl = (href, host) => `https://${host}/${href}`;

  // ===== 链接形态（正则只编译一次）=====
  // 下载型：
  //   github.com/<owner>/<repo>/releases/download/...  |  /archive/...  |  /raw/...
  //   raw.githubusercontent.com/...  |  gist.githubusercontent.com/...  |  gist.github.com/.../raw/...
  // 注意：blob 路径中不能出现 /raw/，否则会被当成整页下载。
  const DOWNLOAD_RE = new RegExp(
    '^(?:https://)?' +
    '(?:' +
      'github\\.com/[^/]+/[^/]+/(?:releases/download/|archive/|raw/)' +
      '|raw\\.githubusercontent\\.com/[^/]+/[^/]+/' +
      '|gist\\.githubusercontent\\.com/[^/]+/[^/]+/' +
      '|gist\\.github\\.com/[^/]+/[^/]+/[^/]+/raw/' +
    ').+'
  );
  // 页面型：正常打开是"浏览页面"，只有"直接打开新页"时才改走默认线路
  const PAGE_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:suites|blob(?!\/))\/|^https:\/\/gist\.github\.com\/[^/]+\/[^/]+$/;
  const BLOB_DL_EXT = /\.(tar\.gz|zip|tar|7z|gz|bz2|xz|exe|msi|deb|rpm|dmg|pkg|apk|aab|whl|jar|war|appimage|bin|iso|pdf|txt|md|json|yaml|yml|xml|html?|sh|py|js|ts|go|rs|java|c|h|cpp|hpp|rb|php|sql)$/i;

  // ===== 开关：读一次缓存在内存，避免每次点击都同步调用 GM_getValue =====
  let enabled = GM_getValue('accel_enabled', true);

  function closestAnchor(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return null;
    return t.closest('a[href]');
  }

  // 用指定线路触发下载（代理返回 Content-Disposition: attachment，不会跳转页面）
  function startDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ===== 备用线路卡片（miuix 风格，Shadow DOM 隔离；不遮挡页面、不打断下载）=====
  let cardHost = null;
  let cardShadow = null;
  let cardUrl = null;

  function buildCard() {
    cardHost = document.createElement('div');
    cardHost.style.cssText = 'all: initial;';
    cardShadow = cardHost.attachShadow({ mode: 'open' });
    cardShadow.innerHTML = `
      <style>
        .card {
          position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
          width: 296px; max-width: calc(100vw - 24px); box-sizing: border-box;
          padding: 16px 16px 12px; border-radius: 24px;
          background: rgba(255, 255, 255, .88);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          backdrop-filter: blur(24px) saturate(1.8);
          box-shadow: 0 8px 32px rgba(0, 0, 0, .16), 0 0 0 .5px rgba(0, 0, 0, .05);
          color: rgba(0, 0, 0, .9);
          font-family: MiSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                       "PingFang SC", "Microsoft YaHei", sans-serif;
          display: none; animation: accel-in .28s cubic-bezier(.2, .9, .3, 1.15);
        }
        @keyframes accel-in { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }
        .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .title { font-size: 15px; font-weight: 600; letter-spacing: .2px; }
        .close {
          flex: none; width: 24px; height: 24px; line-height: 22px; text-align: center;
          border-radius: 50%; cursor: pointer; color: rgba(0, 0, 0, .4);
          font-size: 15px; user-select: none; transition: background .15s ease;
        }
        .close:hover { background: rgba(0, 0, 0, .07); color: rgba(0, 0, 0, .7); }
        .file {
          margin: 3px 0 12px; font-size: 12px; color: rgba(0, 0, 0, .45);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .list { display: flex; flex-direction: column; gap: 8px; }
        .option {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 14px; border-radius: 16px; background: rgba(0, 0, 0, .045);
          cursor: pointer; font-size: 14px; line-height: 1.2; user-select: none;
          transition: background .15s ease, transform .08s ease;
        }
        .option:hover { background: rgba(0, 0, 0, .075); }
        .option:active { transform: scale(.985); }
        .option .status { flex: none; font-size: 12px; color: #3482ff; font-weight: 600; opacity: 0; transition: opacity .15s ease; }
        .option.done { background: rgba(52, 130, 255, .1); }
        .option.done .status { opacity: 1; }
        @media (max-width: 600px) {
          .card { left: 12px; right: 12px; width: auto; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); border-radius: 20px; }
          .option { padding: 14px 16px; font-size: 15px; }
          .close { width: 30px; height: 30px; line-height: 28px; font-size: 17px; }
        }
        @media (prefers-color-scheme: dark) {
          .card { background: rgba(32, 32, 35, .88); color: rgba(255, 255, 255, .92);
                  box-shadow: 0 8px 32px rgba(0, 0, 0, .5), 0 0 0 .5px rgba(255, 255, 255, .06); }
          .file { color: rgba(255, 255, 255, .45); }
          .close { color: rgba(255, 255, 255, .4); }
          .close:hover { background: rgba(255, 255, 255, .1); color: rgba(255, 255, 255, .8); }
          .option { background: rgba(255, 255, 255, .07); }
          .option:hover { background: rgba(255, 255, 255, .12); }
          .option.done { background: rgba(90, 150, 255, .18); }
          .option .status { color: #7aa9ff; }
        }
      </style>
      <div class="card">
        <div class="head">
          <div class="title">换个线路下载</div>
          <div class="close" title="关闭">✕</div>
        </div>
        <div class="file"></div>
        <div class="list"></div>
      </div>`;

    const list = cardShadow.querySelector('.list');
    ALT_PROXIES.forEach((host) => {
      const row = document.createElement('div');
      row.className = 'option';
      const name = document.createElement('span');
      name.textContent = host;
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = '已发起 ✓';
      row.appendChild(name);
      row.appendChild(status);
      // 点选后「不关闭」卡片，只标记该线路，方便一条不行再点另一条
      row.addEventListener('click', () => {
        if (!cardUrl) return;
        startDownload(accelUrl(cardUrl, host));
        Array.from(list.children).forEach((c) => c.classList.remove('done'));
        row.classList.add('done');
      });
      list.appendChild(row);
    });

    cardShadow.querySelector('.close').addEventListener('click', hideCard);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideCard(); }, true);
    document.documentElement.appendChild(cardHost);
  }

  function showCard(url) {
    if (!cardHost) buildCard();
    cardUrl = url;
    cardShadow.querySelector('.file').textContent = url.split('/').pop() || url;
    // 每次打开时清掉上一次的"已发起"标记
    Array.from(cardShadow.querySelectorAll('.option')).forEach((c) => c.classList.remove('done'));
    cardShadow.querySelector('.card').style.display = 'block';
  }

  function hideCard() {
    cardUrl = null;
    if (cardShadow) cardShadow.querySelector('.card').style.display = 'none';
  }

  // ===== 点击处理 =====
  // mousedown：下载型链接立刻改走默认线路（旧逻辑，浏览器随即开始下载）。
  // 只处理左键/中键，避免右键菜单里的"复制链接"也被改写。
  function onMouseDown(e) {
    if (!enabled || (e.button !== 0 && e.button !== 1)) return;
    const a = closestAnchor(e);
    if (!a || isProxyUrl(a.href) || !DOWNLOAD_RE.test(a.href)) return;
    const orig = a.href;
    a.setAttribute('data-accel-orig', orig);
    a.href = accelUrl(orig, DEFAULT_PROXY);
  }

  function onClick(e) {
    if (!enabled) return;
    const a = closestAnchor(e);
    if (!a) return;
    const plainLeft = e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

    // 已在 mousedown 阶段改写过 → 这里只负责弹卡片（不改写、不拦截下载）
    const marked = a.getAttribute('data-accel-orig');
    if (marked) {
      if (plainLeft) showCard(marked);
      return;
    }
    if (isProxyUrl(a.href)) return;

    // 未经过 mousedown（键盘 Enter 等）：先改走默认线路，再弹卡片
    if (DOWNLOAD_RE.test(a.href)) {
      const orig = a.href;
      a.setAttribute('data-accel-orig', orig);
      a.href = accelUrl(orig, DEFAULT_PROXY);
      if (plainLeft) showCard(orig);
      return;
    }

    // 页面型（blob/gist/suites）：普通左键正常浏览；只有"直接打开新页"时才改走默认线路
    if (!plainLeft && PAGE_RE.test(a.href) && !BLOB_DL_EXT.test(a.href)) {
      a.href = accelUrl(a.href, DEFAULT_PROXY);
    }
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('click', onClick, true);

  // ===== 油猴菜单：一键开关 =====
  let menuId = null;
  function syncMenu() {
    if (menuId !== null) {
      try { GM_unregisterMenuCommand(menuId); } catch (e) { /* 旧版管理器不支持则忽略 */ }
    }
    menuId = GM_registerMenuCommand(
      (enabled ? '✔ ' : '✘ ') + 'GitHub 下载加速已' + (enabled ? '启用' : '停用') + '（点击切换）',
      () => { enabled = !enabled; GM_setValue('accel_enabled', enabled); syncMenu(); }
    );
  }
  syncMenu();
})();
