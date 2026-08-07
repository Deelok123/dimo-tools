// ==UserScript==
// @name          GitHub Release 下载加速
// @name:zh-CN    GitHub Release 下载加速
// @namespace     github-release-accelerator
// @version       1.0.1
// @description   在 github.com 上点击 Release 资产或源码包下载时，自动把下载链接改写为 gh.jasonzeng.dev 加速镜像，实现无感加速下载。
// @description:zh-CN  在 github.com 上点击 Release 资产或源码包下载时，自动把下载链接改写为 gh.jasonzeng.dev 加速镜像，实现无感加速下载。
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

  // ===== 可配置 =====
  // 加速镜像域名。想换别的加速站（如 ghproxy.com / gh-proxy.com 等）只需改这一行。
  const HOST = 'gh.jasonzeng.dev';
  const PREFIX = `https://${HOST}/`;

  // ===== 命中即加速的链接形态（对应加速站首页 pattern，全部支持）=====
  // 下载型（mousedown 即改写，点击时替换，最无感）：
  //   github.com/<owner>/<repo>/releases/download/<tag>/<file>  —— Release 资产
  //   github.com/<owner>/<repo>/archive/...                     —— Source code (zip / tar.gz) 源码包
  //   github.com/<owner>/<repo>/raw/...                         —— 仓库 raw 文件
  //   raw.githubusercontent.com/<owner>/<repo>/...              —— raw 直链
  //   gist.githubusercontent.com/<user>/<id>/...                 —— gist 的 raw 文件
  //   gist.github.com/<user>/<id>/.../raw/...                   —— gist raw（显式 /raw/ 段）
  // 页面型（导航时兜底改写，避免整页下载）：
  //   github.com/<owner>/<repo>/suites/...                       —— Actions artifact suites
  //   github.com/<owner>/<repo>/blob/<ref>/<path>                —— 文件页（代理会 302 到 raw 再附件下载）
  //   gist.github.com/<user>/<id>                               —— gist 页面
  //
  // 注意：blob 的路径中不能出现 /raw/，否则会匹配到下方的 raw 规则，导致整页被当文件下载。
  const DOWNLOAD_RE = new RegExp(
    '^(?:https://)?' +
    '(?:' +
      'github\\.com/[^/]+/[^/]+/(?:releases/download/|archive/|raw/)' +
      '|raw\\.githubusercontent\\.com/[^/]+/[^/]+/' +
      '|gist\\.githubusercontent\\.com/[^/]+/[^/]+/' +
      '|gist\\.github\\.com/[^/]+/[^/]+/[^/]+/raw/' +
    ').+'
  );
  // 页面型：非下载页，仅"整页导航"时改写；若恰好是 .tar/.zip 等二进制，则视为下载，不做限制
  const PAGE_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:suites|blob(?!\/))\/|^https:\/\/gist\.github\.com\/[^/]+\/[^/]+$/;
  // 以这些扩展名结尾的 blob 仍按下载处理（代理对文件页会 302 到 raw，整页导航会下载，而非渲染）
  const BLOB_DL_EXT = /\.(tar\.gz|zip|tar|7z|gz|bz2|xz|exe|msi|deb|rpm|dmg|pkg|apk|aab|whl|jar|war|appimage|bin|iso|pdf|txt|md|json|yaml|yml|xml|html?|sh|py|js|ts|go|rs|java|c|h|cpp|hpp|rb|php|sql)$/i;

  // 该链接是否应改写为加速地址；同时返回改写的目标地址（避免二次正则匹配）
  function toAccel(href) {
    if (!isOn()) return null;
    if (!href) return null;
    if (href.startsWith(PREFIX)) return null; // 已在加速域，防止套娃
    const m = href.match(DOWNLOAD_RE);
    if (m) return PREFIX + href;
    // 页面型：仅当整页导航到该地址时才改写；若目标扩展名是二进制则视为下载，也改写
    if (PAGE_RE.test(href) && !BLOB_DL_EXT.test(href)) return PREFIX + href;
    return null;
  }

  // 判断这是不是"下载型"改写（下载型提前到 mousedown 处理；页面型留到导航时兜底）
  function isDownloadUrl(href) {
    return !!href && !href.startsWith(PREFIX) && !!href.match(DOWNLOAD_RE);
  }

  // ===== 全局开关（默认开启，油猴菜单里可随时切换）=====
  const isOn = () => GM_getValue('accel_enabled', true);

  // 捕获阶段改写链接。只针对"被点击的那一个 <a>"，不做全局扫描，无性能开销。
  // 页面型（blob/gist/suites）：仅当"整页导航"到该地址时改写——但浏览器在捕获阶段
  // 无法确定最终是否会发生导航，因此这里只改 href，若最终跳走则走加速，若页面原地
  // 渲染（无导航）则 href 已被改但页面没动，无害。二进制扩展名仍按下载处理。
  function rewrite(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    const a = t.closest('a[href]');
    if (!a) return;
    const acc = toAccel(a.href);
    if (acc) a.href = acc;
  }

  // 下载型：提前到 mousedown 改写，覆盖 左/中/右键 与触摸。
  // 下载型不走 click 兜底，避免 popup 里被 react 重新渲染、href 被重置的问题。
  function preDownload(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    const a = t.closest('a[href]');
    if (!a) return;
    // a.href 为绝对化完整地址；仅当命中下载型且改写成功时才标记处理过
    const href = a.href;
    if (!isDownloadUrl(href)) return;
    const acc = toAccel(href);
    if (acc) {
      a.href = acc;
      // 记录原始地址，供 click 阶段校验"是否确实发生了导航"（整页下载场景兜底）
      a.setAttribute('data-accel-orig', href);
    }
  }

  // 兜底：mousedown 已改写 href，但若该次点击最终没触发导航
  // （浏览器按原始地址处理、或外部工具捕获了事件），则手动补发一次下载。
  // 只针对"下载型"链接，不会误伤页面导航。
  function ensureDownload(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    const a = t.closest('a[href]');
    if (!a) return;
    const orig = a.getAttribute('data-accel-orig');
    if (!orig) return;
    const acc = toAccel(a.href);
    if (!acc) return;
    // 若此次点击没有触发导航，则直接下载加速地址
    if (e.detail > 0 || e.button === 0) {
      // 等待微任务后确认没有发生导航（导航会让当前文档被卸载）
      setTimeout(() => {
        if (document.visibilityState !== 'hidden' && !document.hidden) {
          const dl = document.createElement('a');
          dl.href = acc;
          dl.download = '';
          document.body.appendChild(dl);
          dl.click();
          dl.remove();
        }
      }, 0);
    }
  }

  // mousedown：处理所有"下载型"链接（releases/archive/raw/gist raw），提前替换
  document.addEventListener('mousedown', preDownload, true);
  // click：兜底处理未在 mousedown 拦截的（如键盘 Enter），以及"页面型"链接（仅整页导航时改写）
  document.addEventListener('click', rewrite, true);
  // 导航兜底：mousedown 改写后若未导航，补发下载（针对下载型，不影响页面型）。
  // 场景举例：点 raw 链接 → mousedown 改成加速地址 → 但浏览器可能已按原地址进入下载，
  // 导致当前页面文档没有卸载，此时代码补发一次下载，保证文件一定从加速域拿到。
  document.addEventListener('click', ensureDownload, true);

  // ===== 油猴菜单：一键开关 =====
  let menuId = null;
  function syncMenu() {
    if (menuId !== null) {
      try { GM_unregisterMenuCommand(menuId); } catch (e) { /* 旧版管理器不支持则忽略 */ }
    }
    const on = isOn();
    menuId = GM_registerMenuCommand(
      (on ? '✔ ' : '✘ ') + 'GitHub 下载加速已' + (on ? '启用' : '停用') + '（点击切换）',
      () => { GM_setValue('accel_enabled', !on); syncMenu(); }
    );
  }
  syncMenu();
})();
