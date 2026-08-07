// ==UserScript==
// @name         123云盘下载优化
// @namespace    https://github.com/yourname/userscripts
// @version      1.3.1
// @description  屏蔽"客户端下载"按钮、二维码按钮、"立即下载 无需登录"横幅和顶部推广横幅；删除底部免责声明；未登录时点击"浏览器下载"弹登录窗，已登录时自动关闭VIP开通弹窗让下载自然进行
// @author       you
// @match        *://*.123pan.cn/*
// @match        *://*.123pan.com/*
// @match        *://*.123684.com/*
// @match        *://*.123912.com/*
// @match        *://*.123865.com/*
// @match        *://*.123952.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // ---------- 辅助函数 ----------

    function hide(el) {
        if (el && el.style) el.style.display = 'none';
    }

    // 按按钮文本精确查找（避免误伤同类的"浏览器下载"按钮）
    function findButtonByText(text) {
        return Array.from(document.querySelectorAll('button')).find(function (b) {
            var t = (b.textContent || '').replace(/\s+/g, '').trim();
            return t === text;
        });
    }

    // ---------- 清理：隐藏按钮与横幅（在 React 重渲染后反复执行） ----------

    function clean() {
        // 1) 屏蔽"客户端下载"按钮
        //    注意：它和"浏览器下载"共用 .client-download-btn 类，必须用文本区分
        hide(findButtonByText('客户端下载'));

        // 2) 屏蔽二维码按钮
        hide(document.querySelector('button.qrcode_btn'));

        // 3) 屏蔽"立即下载 无需登录"横幅
        document.querySelectorAll('.badge-wrapper .hot-badge').forEach(hide);
        // 兜底：任何文本含"立即下载 / 无需登录"的 hot-badge 一并隐藏
        document.querySelectorAll('.hot-badge').forEach(function (el) {
            if (/立即下载|无需登录/.test(el.textContent)) hide(el);
        });

        // 4) 屏蔽顶部"新用户注册送2T"推广横幅（slogan_top.png 图片横幅）
        //    其 class 是混淆的哈希名，改用 src / alt 匹配，更稳定
        document.querySelectorAll('img[alt="slogan"], img[src*="slogan_top"]').forEach(hide);

        // 5) 删除底部免责声明（"本页面由用户分享生成，123云盘严禁传播…"）
        //    直接删除整个 .footer-area 容器（它自带固定高度，仅隐藏文字会留下大片空白）
        document.querySelectorAll('.footer-area').forEach(function (el) {
            if (/本页面由用户分享生成|严禁传播/.test(el.textContent)) el.remove();
        });

        // 6) 兜底：若付费确认弹窗仍出现，直接移除（内容含"确认下载/待支付/扫码支付"）
        document.querySelectorAll('.hmodal-overlay-container').forEach(function (m) {
            if (/确认下载|待支付|扫码支付/.test(m.textContent)) m.remove();
        });

        // 7) 自动关闭 VIP 开通弹窗（登录后点击"浏览器下载"出现）
        //    该弹窗只是纯推广覆盖层，关闭/移除后底层下载会自动进行，
        //    无需点击"继续普通下载"。
        document.querySelectorAll('.scheme-e-vip-modal-wrap').forEach(function (modal) {
            // 优先点击弹窗自带关闭按钮（触发网站原生的关闭逻辑，最稳妥）
            var closeBtn = modal.querySelector('.hmodal-close, [class*="close"], [aria-label="Close"]');
            if (closeBtn) {
                closeBtn.click();
                return;
            }
            // 没有关闭按钮时，直接移除整个弹窗覆盖层
            var overlay = modal.closest('.hmodal-overlay-container') || modal;
            overlay.remove();
        });
    }

    // ---------- 登录状态检测 ----------

    // 页面上有"登录/注册"按钮，说明当前未登录；反之（显示头像/用户名）已登录。
    function isLoggedIn() {
        return !findButtonByText('登录/注册');
    }

    // ---------- 拦截"浏览器下载"点击：未登录弹登录窗，已登录放行 ----------

    function isDownloadButton(el) {
        return el && el.tagName === 'BUTTON' && /浏览器下载/.test(el.textContent || '');
    }

    function openLogin() {
        var loginBtn = findButtonByText('登录/注册');
        // 找不到登录按钮时不跳转、不做事（保持页面状态，避免误伤已登录用户）
        if (loginBtn) loginBtn.click();
    }

    // 捕获阶段委托监听，比 React 的合成事件（挂在 root 上）更早执行，
    // stopImmediatePropagation 可阻止其打开付费确认弹窗。
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button') : null;
        // 只拦截未登录时的点击，已登录用户走网站真实下载流程
        if (btn && isDownloadButton(btn) && !isLoggedIn()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openLogin();
        }
    }, true);

    // ---------- 监听 DOM 变化，处理 React 异步渲染 / 重渲染 ----------

    clean();
    new MutationObserver(clean).observe(document.body, { childList: true, subtree: true });
})();
