// ==UserScript==
// @name         123云盘分享页 · 免付费确认
// @namespace    https://github.com/yourname/userscripts
// @version      1.4.0
// @description  屏蔽"客户端下载"按钮、二维码按钮、"立即下载 无需登录"横幅和顶部推广横幅；删除底部免责声明；未登录时点击下载弹登录窗，已登录时自动关闭VIP开通弹窗让下载自然进行（桌面端 + 移动端）
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

    // ---------- 设备检测 ----------

    // 移动端页面用 .app-wrap.mobile-wrap / .footer-area.mobile；
    // 桌面端用 .app-wrap.web-wrap（注意：桌面端 app-wrap 和 web-wrap 同时存在，不能只看 app-wrap）。
    // 判断依据：移动端特有的 .mobile-wrap 或 .footer-area.mobile 出现即视为移动端。
    function isMobile() {
        return !!document.querySelector('.mobile-wrap, .footer-area.mobile');
    }

    // ---------- 辅助函数 ----------

    function hide(el) {
        if (el && el.style) el.style.display = 'none';
    }

    // 按可见文本精确查找元素（兼容 button 和移动端的 div/span）。
    // 优先返回叶子节点（无元素子节点的才是真正可点击的按钮/文字），
    // 避免匹配到包裹按钮的容器 DIV（其 textContent 恰好也等于目标文本）。
    function findByText(selector, text) {
        var els = document.querySelectorAll(selector);
        var containerMatch = null;
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var t = (el.textContent || '').replace(/\s+/g, '').trim();
            if (t !== text) continue;
            if (el.querySelector('button, a, .btn-text-full, span, div') === null) {
                // 叶子节点：没有可点击子元素，优先返回
                return el;
            }
            // 容器节点：记录为兜底
            if (!containerMatch) containerMatch = el;
        }
        return containerMatch;
    }

    // ---------- 清理：隐藏按钮与横幅（在 React 重渲染后反复执行） ----------

    function clean() {
        var mobile = isMobile();

        // 1) 屏蔽"客户端下载"按钮（仅桌面端有；它和"浏览器下载"共用类，必须用文本区分）
        hide(findByText('button', '客户端下载'));

        // 2) 屏蔽二维码按钮（仅桌面端）
        hide(document.querySelector('button.qrcode_btn'));

        // 3) 屏蔽"立即下载 无需登录"横幅（桌面端 .badge-wrapper .hot-badge，移动端同 .hot-badge）
        document.querySelectorAll('.badge-wrapper .hot-badge').forEach(hide);
        document.querySelectorAll('.hot-badge').forEach(function (el) {
            if (/立即下载|无需登录/.test(el.textContent)) hide(el);
        });

        // 4) 屏蔽顶部"新用户注册送2T"推广横幅（仅桌面端有 slogan_top.png；class 是混淆哈希，用 src/alt 匹配）
        document.querySelectorAll('img[alt="slogan"], img[src*="slogan_top"]').forEach(hide);

        // 5) 删除底部免责声明（桌面端在 .footer-area 内含 CleanNet 文本）
        //    注意：移动端 .footer-area.mobile 是底部操作栏（下载/保存按钮），必须保留！
        if (!mobile) {
            document.querySelectorAll('.footer-area').forEach(function (el) {
                if (/本页面由用户分享生成|严禁传播/.test(el.textContent)) el.remove();
            });
        }

        // 6) 移除付费确认弹窗（未登录点下载出现；桌面/移动端同用 .hmodal-overlay-container）
        document.querySelectorAll('.hmodal-overlay-container').forEach(function (m) {
            if (/确认下载|待支付|扫码支付/.test(m.textContent)) m.remove();
        });

        // 7) 自动关闭 VIP 开通弹窗（登录后点下载出现；关闭/移除后底层下载自动进行）
        //    桌面端 .scheme-e-vip-modal-wrap，移动端 .scheme-e-vip-modal（adm-popup 组件）
        var vipModals = document.querySelectorAll('.scheme-e-vip-modal-wrap, .scheme-e-vip-modal');
        vipModals.forEach(function (modal) {
            // 优先点击弹窗自带关闭按钮（触发网站原生关闭逻辑，最稳妥）
            //    桌面端 .hmodal-close，移动端 .adm-popup-close-button
            var closeBtn = modal.querySelector('.adm-popup-close-button, .hmodal-close, [aria-label="Close"]');
            if (closeBtn) {
                closeBtn.click();
                return;
            }
            // 没有关闭按钮时，直接移除整个弹窗覆盖层
            var overlay = modal.closest('.hmodal-overlay-container, .adm-popup-wrap') || modal;
            overlay.remove();
        });
    }

    // ---------- 登录状态检测 ----------

    // 页面上有"登录/注册"按钮说明未登录（桌面端 button / 移动端 span.btn-text-full），反之已登录。
    function isLoggedIn() {
        return !findByText('button, span, div', '登录/注册');
    }
    // ---------- 拦截下载点击：未登录弹登录窗，已登录放行 ----------

    // 下载按钮：桌面端 button"浏览器下载"，移动端 div"下载文件"
    // 注意：移动端按钮文本是"下载文件立即下载无需登录"（横幅在同一元素内），需用开头匹配
    function isDownloadTarget(el) {
        if (!el) return false;
        var t = (el.textContent || '').replace(/\s+/g, '').trim();
        if (t === '浏览器下载') return true;
        if (t.indexOf('下载文件') === 0) return true;
        return false;
    }

    function openLogin() {
        // 点击"登录/注册"按钮（桌面/移动端通用）
        var loginBtn = findByText('button, span, div', '登录/注册');
        if (loginBtn) loginBtn.click();
    }

    // 捕获阶段委托监听，比 React 的合成事件更早执行。
    // 只拦截未登录时对下载按钮的点击：
    //   - 桌面端：拦截后可阻止付费确认弹窗（stopImmediatePropagation）
    //   - 移动端：改为弹登录窗，同样避免付费弹窗
    // 已登录用户不拦截，走网站真实流程（VIP 弹窗由上面第 7 条自动关闭）。
    document.addEventListener('click', function (e) {
        var el = e.target;
        var target = el && el.closest ? el.closest('button, .appBottomBtnNew') : null;
        if (target && isDownloadTarget(target) && !isLoggedIn()) {
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
