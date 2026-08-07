// ==UserScript==
// @name         中国移动云盘纯净版
// @name:en      Yun139 Cloud Clean
// @namespace    yun139.booster
// @version      1.4.0
// @description  直达云盘主界面，拦截埋点与广告，隐藏横幅和弹窗，阻止剪贴板写入与客户端强制跳转
// @description:en Clean & speed up China Mobile Cloud Disk: skip landing page, block tracking, hide ads & popups
// @author       you
// @match        https://yun.139.com/*
// @match        https://*.yun.139.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

/*
 * 诊断结论（2026-08 实测 yun.139.com/m/）：
 *   1. 落地页 https://yun.139.com/m/#/ 与主界面 #/main 是同一个 Vue 应用的两个路由，
 *      点「进入中国移动云盘」只是改 hash。直接重定向到 #/main 可省掉整页落地页渲染。
 *   2. 首次打开会先加载 PC 桌面版 /w/ 整套前端，随后再跳到移动版 /m/ 重新加载（双重加载）。
 *   3. da.mmarket.com 广告埋点用 document.write 同步注入，阻塞渲染。
 *   4. 听云 APM (cmicapm.com) 打开首页就上报 50+ 次；广告接口 getAdInfos/advertReported 狂刷 30+ 次。
 *   5. 集团 WebTrends (sdc2.10086.cn)、邮箱埋点 (datacenter.mail.10086.cn)、火山日志 (volccdn) 等无关请求。
 *
 * 本脚本保留所有业务必需接口（用户信息、文件列表、配额、加密公钥等），只砍可抛弃的埋点/广告/监控。
 * 如需更彻底拦截（如同域 autotrack.js 这类 <script> 静态埋点），可搭配 uBlock Origin 规则：
 *   ||yun.139.com/m/static/js/autoTrack/
 *   ||yun.139.com/m/static/js/tingyunApm.js
 */

(function () {
  'use strict';

  /* ================= 配置区（按需增删） ================= */

  // 是否跳过落地页，直达主界面 #/main（可改成 '#/index' 等其他路由）
  const LANDING_HASH = '#/main';

  // 是否跳过 PC 桌面版：访问 yun.139.com 或 /w/ 时直接跳到移动版 /m/#/main，避免双重加载
  const SKIP_DESKTOP = true;

  // 需要隐藏的横幅/悬浮广告/弹窗（选择器）。元素可能由 Vue 动态重建，配合 MutationObserver 反复隐藏
  const HIDE_SELECTORS = [
    '.swiper-banner-container', // 文件列表上方的轮播横幅（下载APP 等广告）
    '.app-guide',               // 右下角悬浮"下载APP"引导浮层
    '.newcomer-guide',          // 新手引导弹窗（上传文件教程，全屏遮罩）
  ];

  // 是否拦截剪贴板写入（navigator.clipboard.writeText / execCommand('copy')）
  // 注：扫描确认本页剪贴板操作均为"复制链接"按钮的用户主动点击，无自动写入；
  //     开启后"复制链接"按钮将失效（静默不复制）。介意的话改回 false。
  const BLOCK_CLIPBOARD_WRITE = true;

  // 是否拦截强制跳转移动客户端 / 应用市场 / 客户端下载页（scheme 或 URL）
  // 注：扫描确认均为点击"下载APP"按钮触发，无自动跳转；
  //     开启后"下载APP/打开APP"类按钮将失效。介意的话改回 false。
  const BLOCK_FORCED_REDIRECT = true;

  // 命中即拦截的 URL 子串（只拦截 http(s) 请求，业务接口不受影响）
  const BLOCK_PATTERNS = [
    'cmicapm.com',            // 听云 APM 性能监控上报（data.cmicapm.com:8080 / dc.cmicapm.com:7080）
    'da.mmarket.com',         // 广告联盟（document.write 同步注入，阻塞渲染）
    'sdc2.10086.cn',          // 集团 WebTrends 埋点
    'datacenter.mail.10086.cn', // 邮箱数据中心埋点
    'lf3-data.volccdn.com',   // 火山引擎日志上报
    '/advertapi/',            // 云盘广告接口（getAdInfos 拉广告 / advertReported 上报曝光）
    '/caiyun/aas/tellin/',    // 云盘自研埋点上报接口
    '/caiyun/openapi/manager/tracking.icon', // 页面加载跟踪点
  ];

  // document.write 注入的黑名单域名（正则，命中则丢弃这段写入）
  const WRITE_BLOCK_RE = /https?:\/\/[^'"<>]*?(?:mmarket\.com|cmicapm\.com|volccdn\.com|sdc2\.10086\.cn|datacenter\.mail\.10086\.cn)/;

  /* ===================================================== */

  function shouldBlock(url) {
    if (!url || typeof url !== 'string') return false;
    if (!/^https?:/i.test(url)) return false; // 只拦 http(s)
    for (let i = 0; i < BLOCK_PATTERNS.length; i++) {
      if (url.indexOf(BLOCK_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  /* ---------- 1. 跳转：跳过落地页 / 桌面版 ---------- */
  (function redirect() {
    const host = location.hostname;
    if (host !== 'yun.139.com') return; // 子域名（如 user-njs.）交给请求拦截即可

    const path = location.pathname;
    const hash = location.hash;

    // 场景 A：移动版落地页（/m/、/m/#/ 等）→ 直达主界面
    if (path === '/m/' || path === '/m') {
      if (hash !== LANDING_HASH) {
        location.replace('https://yun.139.com/m/' + LANDING_HASH);
        return;
      }
    }

    // 场景 B：PC 桌面版 / 根路径 → 直接去移动版主界面（避免先加载 /w/ 再跳 /m/ 的双重加载）
    if (SKIP_DESKTOP) {
      const isDesktop = path === '/' || (path.startsWith('/w/') && hash !== LANDING_HASH);
      if (isDesktop) {
        location.replace('https://yun.139.com/m/' + LANDING_HASH);
        return;
      }
    }
  })();

  /* ---------- 2. 拦截 document.write 注入的第三方脚本 ---------- */
  const _write = Document.prototype.write;
  if (typeof _write === 'function') {
    Document.prototype.write = function (...args) {
      const text = args.join('');
      if (WRITE_BLOCK_RE.test(text)) return this; // 丢弃阻塞性埋点脚本
      return _write.apply(this, args);
    };
  }

  /* ---------- 3. 拦截 window.fetch ---------- */
  try {
    const realFetch = window.fetch && window.fetch.bind(window);
    if (realFetch) {
      window.fetch = function (input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (shouldBlock(String(url))) {
          return Promise.reject(new TypeError('blocked by yun139-booster'));
        }
        return realFetch(input, init);
      };
    }
  } catch (e) { /* noop */ }

  /* ---------- 4. 拦截 XMLHttpRequest ---------- */
  try {
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__yun139Blocked = shouldBlock(String(url));
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__yun139Blocked) {
        // 异步 abort + 触发 error，让页面按"失败"降级（广告/埋点失败本来就是常态）
        setTimeout(() => {
          try { this.abort(); } catch (e) {}
        }, 0);
        return;
      }
      return _send.apply(this, arguments);
    };
  } catch (e) { /* noop */ }

  /* ---------- 5. 隐藏横幅与悬浮广告 ---------- */
  // 注入全局 CSS（!important 确保覆盖页面样式）。
  // document-start 阶段 head/documentElement 可能尚未生成，injectHideStyle 带重试，随 DOM 变化补注入。
  function injectHideStyle() {
    if (document.getElementById('yun139-booster-hide')) return true;
    const target = document.head || document.documentElement;
    if (!target) return false;
    const style = document.createElement('style');
    style.textContent = HIDE_SELECTORS.map((s) => `${s}{display:none!important;visibility:hidden!important;}`).join('\n');
    style.id = 'yun139-booster-hide';
    target.appendChild(style);
    return true;
  }

  function applyHide() {
    injectHideStyle();
    for (let i = 0; i < HIDE_SELECTORS.length; i++) {
      const els = document.querySelectorAll(HIDE_SELECTORS[i]);
      for (let j = 0; j < els.length; j++) {
        els[j].setAttribute('style', (els[j].getAttribute('style') || '') + ';display:none!important;visibility:hidden!important;');
      }
    }
  }

  // 初次立即执行 + 监听 DOM 变化（Vue 可能重建元素）
  if (document.body) applyHide();
  let hideTimer = null;
  const hideObserver = new MutationObserver(() => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(applyHide, 100); // 防抖，避免频繁触发
  });
  if (document.body) {
    hideObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      applyHide();
      hideObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  /* ---------- 6. 防御：拦截剪贴板写入 & scheme 强制跳转 ---------- */
  // 扫描结论（2026-08）：本页所有剪贴板操作都是"复制链接"按钮的用户主动点击，无自动写入；
  // 打开客户端/下载页也都是点击触发。此处为运行时兜底，防代码隐藏在懒加载 chunk 中自动触发。
  if (BLOCK_CLIPBOARD_WRITE || BLOCK_FORCED_REDIRECT) {
    try {
      // 6a. 剪贴板写入：navigator.clipboard.writeText / execCommand('copy') → 静默丢弃
      if (BLOCK_CLIPBOARD_WRITE) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText = function () {
            return Promise.resolve(); // 假装成功，实际不写
          };
        }
        const _exec = document.execCommand;
        if (typeof _exec === 'function') {
          document.execCommand = function (cmd) {
            if (typeof cmd === 'string' && cmd.toLowerCase() === 'copy') {
              return false; // 拒绝复制
            }
            return _exec.apply(this, arguments);
          };
        }
      }

      // 6b. scheme 强制跳转：拦截跳转到 移动客户端协议 / 应用市场 / 客户端下载页
      // 注意：Chromium 中 location.href / location.replace / location.assign 均无法通过 JS 覆盖（实测）。
      // 可靠通道是：① iframe src setter ② 捕获阶段 click 拦截 <a> 标签。
      if (BLOCK_FORCED_REDIRECT) {
        const FORCED_SCHEME_RE = /^(?:mcloud|hecaiyun|caiyun|cmcc|itms-apps|itms-services|market|app-market|intent):/i;
        const DOWNLOAD_PAGE_RE = /clientDL\/index\.html|portal\/client|yingyongbao|a\.app\.qq\.com\/o\/simple\.jsp/i;

        function isForcedUrl(url) {
          if (!url) return false;
          return FORCED_SCHEME_RE.test(url) || (DOWNLOAD_PAGE_RE.test(url) && url.indexOf('yun.139.com') === -1);
        }

        // ① iframe src 拦截（覆盖原型 setter，可靠）
        const _iframeSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
        if (_iframeSrc && _iframeSrc.set) {
          Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
            configurable: true,
            get: function () { return _iframeSrc.get.call(this); },
            set: function (v) {
              if (isForcedUrl(String(v))) { console.warn('[yun139-booster] 已拦截 iframe scheme:', String(v).slice(0, 80)); return; }
              return _iframeSrc.set.call(this, v);
            },
          });
        }

        // ② 捕获阶段 click 拦截 <a> 标签跳转（动态创建的也会捕获到）
        document.addEventListener('click', function (e) {
          const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
          if (!a) return;
          const href = a.getAttribute('href') || a.href;
          if (isForcedUrl(String(href))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            a.removeAttribute('href');
            console.warn('[yun139-booster] 已拦截跳转链接:', String(href).slice(0, 80));
          }
        }, true);
      }
    } catch (e) { /* noop */ }
  }

  console.info('[yun139-booster] 已启用：直达主界面 + 埋点拦截 + 横幅/弹窗隐藏 + 剪贴板/强制跳转防御已生效');
})();
