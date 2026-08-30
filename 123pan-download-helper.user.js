// ==UserScript==
// @name         123云盘下载优化
// @namespace    https://github.com/yourname/userscripts
// @version      1.6.0
// @description  屏蔽客户端下载/二维码/横幅/广告/SVIP徽章，删除免责声明；未登录点下载弹登录窗，已登录自动关VIP弹窗；阻止网页自动复制到剪切板、阻止跳转下载客户端或强行打开客户端（桌面端+移动端）
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

    // 移动端页面用 .app-wrap.mobile-wrap / .footer-area.mobile / .app-header；
    // 桌面端用 .app-wrap.web-wrap（注意：桌面端 app-wrap 和 web-wrap 同时存在，不能只看 app-wrap）。
    // 判断依据（多条件兜底，适配网站更新）：
    //   - 移动端特有的 .mobile-wrap / .footer-area.mobile
    //   - 域名含 mshare（123云盘移动端专用子域名）
    //   - 移动端底部操作栏 .appBottomBtnNew（下载/保存按钮）
    function isMobile() {
        if (document.querySelector('.mobile-wrap, .footer-area.mobile, .appBottomBtnNew')) return true;
        if (/\.mshare\.123/.test(location.hostname)) return true;
        return false;
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

        // 5) 隐藏底部免责声明（桌面端在 .footer-area 内含 CleanNet 文本）
        //    注意：移动端 .footer-area.mobile 是底部操作栏（下载/保存按钮），必须保留！
        //    用 display:none 而非 remove()，避免触碰 React 管理的节点引发崩溃
        if (!mobile) {
            document.querySelectorAll('.footer-area').forEach(function (el) {
                if (/本页面由用户分享生成|严禁传播/.test(el.textContent)) hide(el);
            });
        }

        // 6) 隐藏付费确认弹窗（未登录点下载出现；桌面/移动端同用 .hmodal-overlay-container）
        document.querySelectorAll('.hmodal-overlay-container').forEach(function (m) {
            if (/确认下载|待支付|扫码支付/.test(m.textContent)) hide(m);
        });

        // 7) 自动关闭 VIP 开通弹窗（登录后点下载出现；关闭/隐藏后底层下载自动进行）
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
            // 没有关闭按钮时，隐藏整个弹窗覆盖层（用隐藏而非移除，避免 React 崩溃）
            var overlay = modal.closest('.hmodal-overlay-container, .adm-popup-wrap') || modal;
            hide(overlay);
        });

        // 8) 屏蔽广告
        //    注意：只能隐藏（display:none），绝不能 remove()！
        //    之前用 img[src*="share_background"] 的 parentElement.remove() 误删了整个
        //    .content-center-body（页面内容主容器），导致 React 崩溃、页面报错。
        //    广告图片/卡片一律隐藏，不触碰任何父容器。
        //    a) 右侧广告卡片 .web-code-card-adv（内含 share_background/*.png 广告图）
        //    b) 固定广告横幅 .bg_svip_block_ads（position:fixed 浮层，可能轮换显示）
        //    c) 页面背景图：123云盘会把 .web-body 等背景设置成广告图（backgroundImage 类），
        //       清除内联 background-image 防止背景变成广告（点击极易误触发）
        //    d) 兜底：任何指向广告图片域的元素（share_background / bg_svip_block_ads）隐藏
        document.querySelectorAll('.web-code-card-adv').forEach(hide);
        document.querySelectorAll('.bg_svip_block_ads').forEach(hide);
        document.querySelectorAll('.backgroundImage, .web-body.backgroundImage').forEach(function (el) {
            if (el.getAttribute && el.getAttribute('style')) {
                el.style.backgroundImage = 'none';
            }
        });
        document.querySelectorAll('img[src*="share_background"], img[src*="bg_svip_block_ads"]').forEach(hide);

        // 9) 屏蔽 SVIP / VIP 会员徽章图片（分享者头像旁的会员标签）
        //    桌面端 alt="svip"（SVIPLable.png），移动端 alt="user-label"
        document.querySelectorAll('img[alt="svip"], img[src*="SVIPLable"], img[alt="user-label"]').forEach(function (el) {
            hide(el);
        });

        // 10) 屏蔽移动端"APP查看 / 打开APP"入口和客户端引导层
        //     a) "APP查看"按钮（类名 .header-action-btn--app 可能随网站更新变化，
        //        同时用文本匹配兜底）→ 隐藏，阻止跳客户端
        //     b) 客户端引导层：无 class、position:fixed 全屏遮罩，
        //        文案含"如未正常唤起 / 点击下载 / 下载APP"，用隐藏处理（不 remove，避免 React 崩溃）
        document.querySelectorAll('.header-action-btn--app').forEach(hide);
        document.querySelectorAll('div, span, a').forEach(function (el) {
            var t = (el.textContent || '').replace(/\s+/g, '').trim();
            // 只处理叶子节点（真正可点击的入口），避免误伤容器
            if (el.children.length === 0 && (t === 'APP查看' || t === '打开App')) {
                hide(el);
            }
        });
        document.querySelectorAll('div').forEach(function (el) {
            var t = (el.textContent || '').replace(/\s+/g, '').trim();
            if (el.children.length > 0 && /如未正常唤起|下载APP|点击下载/.test(t)) {
                var cs = el.getAttribute('style') || '';
                // 只隐藏固定全屏的引导遮罩，避免误伤正常页面内容
                if (cs.indexOf('position: fixed') !== -1 && cs.indexOf('z-index') !== -1) {
                    hide(el);
                }
            }
        });
    }

    // ---------- 登录状态检测 ----------

    // 页面上有"登录/注册"按钮说明未登录（桌面端 button / 移动端 span.btn-text-full），反之已登录。
    function isLoggedIn() {
        return !findByText('button, span, div', '登录/注册');
    }
    // ---------- 拦截下载点击：未登录弹登录窗，已登录放行 ----------

    // 下载按钮：桌面端 button"浏览器下载"，移动端 div"下载文件"
    // 注意：移动端按钮文本可能含"立即下载无需登录"等横幅文字，需用开头匹配
    function isDownloadTarget(el) {
        if (!el) return false;
        var t = (el.textContent || '').replace(/\s+/g, '').trim();
        if (t === '浏览器下载') return true;
        if (t.indexOf('下载文件') === 0) return true;
        return false;
    }

    // 判断元素是否是"客户端/APP"入口（阻止跳客户端）。
    // 用文本匹配优先 + 精确类名兜底，绝不使用 [class*="app"] 这类通配符，
    // 否则会匹配到 .app-wrap / .badge-wrapper 等容器，把页面所有点击都拦掉。
    function isClientEntry(el) {
        if (!el) return false;
        var text = (el.textContent || '').replace(/\s+/g, '').trim();
        // 文本匹配：点击元素自身文本是客户端/APP入口
        if (text === 'APP查看' || text === '打开App' || text === '客户端下载' || text === '下载APP' || text === '下载客户端') return true;
        // 类名精确匹配（不包含随机 hash 的稳定前缀）
        var cls = typeof el.className === 'string' ? el.className : String(el.className || '');
        if (/header-action-btn--app/.test(cls)) return true;
        return false;
    }

    function openLogin() {
        // 点击"登录/注册"按钮（桌面 button / 移动端 span.btn-text-full，类名可能变）
        var loginBtn = findByText('button, span, div', '登录/注册');
        if (loginBtn) loginBtn.click();
    }

    // 捕获阶段委托监听，比 React 的合成事件更早执行。
    // 只拦截"下载按钮"和"客户端入口"的点击，其余一律放行（避免页面无法点击）。
    document.addEventListener('click', function (e) {
        var el = e.target;

        // 拦截下载按钮（未登录时弹登录窗）
        // 注意：用 closest 定位实际按钮，避免点按钮内部文字时漏判
        var target = el && el.closest ? el.closest('button, .appBottomBtnNew') : null;
        if (target && isDownloadTarget(target) && !isLoggedIn()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openLogin();
            return;
        }

        // 拦截"APP查看 / 打开App / 客户端下载"入口，阻止跳转下载客户端网页或唤起客户端
        // 只匹配点击目标自身或其最近的稳定入口，绝不向上匹配任意含 app/client 的容器
        var entry = el && el.closest ? el.closest('.header-action-btn--app, [class$="--app"], [class$="--client"]') : null;
        if (entry && isClientEntry(entry)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

        // 拦截指向客户端下载页或 App 协议跳转的链接
        if (el && el.closest) {
            var link = el.closest('a[href]');
            if (link && /Downloadclient|downloadclient|\.apk$|intent:|(pan123|123pan):\/\/|itunes:|play\.google/.test(link.href)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }
    }, true);

    // ---------- 阻止网页自动复制到剪切板 ----------

    // 拦截 navigator.clipboard.writeText（异步 API）：调用变成空操作
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText = function () {
                // 不执行任何复制，返回已解决的 Promise 以保持 API 契约
                return Promise.resolve();
            };
        }
    } catch (err) { /* 忽略权限异常 */ }

    // 拦截 document.execCommand('copy')（旧式复制）：返回 false 阻止复制
    // 注意：先保存原始函数再覆盖，避免在覆盖后引用自身造成递归
    try {
        var origExecCommand = document.execCommand;
        if (typeof origExecCommand === 'function') {
            document.execCommand = function (cmd) {
                if (cmd === 'copy') return false;
                // 非复制命令放行（如 'paste' 等）
                return origExecCommand.apply(this, arguments);
            };
        }
    } catch (err) { /* 忽略 */ }

    // 拦截 window.open：阻止打开客户端下载页/App 引导页等新窗口
    var origOpen = window.open;
    window.open = function (url, target, features) {
        try {
            if (url && /Downloadclient|downloadclient|\.apk$|intent:|(pan123|123pan):\/\/|itunes:|play\.google/.test(String(url))) {
                return null;
            }
        } catch (err) { /* 忽略 */ }
        return origOpen ? origOpen.apply(this, arguments) : null;
    };

    // 拦截 location.href / location.assign / location.replace 跳转到客户端相关地址
    ['assign', 'replace'].forEach(function (method) {
        try {
            var orig = location[method];
            location[method] = function (url) {
                try {
                    if (url && /Downloadclient|downloadclient|\.apk$|intent:|(pan123|123pan):\/\/|itunes:|play\.google/.test(String(url))) {
                        return;
                    }
                } catch (err) { /* 忽略 */ }
                return orig.apply(location, arguments);
            };
        } catch (err) { /* 忽略 */ }
    });

    // 监听 DOM 变化，处理 React 异步渲染 / 重渲染 ----------

    clean();
    new MutationObserver(clean).observe(document.body, { childList: true, subtree: true });
})();
