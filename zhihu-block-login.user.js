// ==UserScript==
// @name         知乎屏蔽登录弹窗
// @name:zh-CN   知乎屏蔽登录弹窗
// @name:en      Zhihu Block Login Modal
// @namespace    https://example.com/zhihu-block-login
// @version      1.0.0
// @description  屏蔽知乎网页端登录/注册弹窗及其遮罩层，并恢复被锁定的页面滚动
// @author       you
// @match        https://zhihu.com/*
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @match        https://*.zhihu.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // 登录弹窗的标志性节点选择器（命中即判定为登录弹窗）
    const LOGIN_NODE_SELECTORS = [
        '.LoginModal',
        '.SignFlowModal',
        '.signFlowModal',
        '.Modal--login'
    ];

    // 手机端需拦截的弹窗内容关键词（MobileModal 为手机端通用弹窗容器）
    const MOBILE_MODAL_KEYWORDS = ['登录', '注册', '阅读全文', 'App 内', '打开 App', '立即查看'];

    // 底部「打开知乎查看更多内容」按钮（类名为动态 hash）
    const FOOTER_OPEN_BTN_TEXT = ['打开知乎', '查看更多内容'];

    // 关键词：用于对通用 .Modal 容器做内容检测
    const LOGIN_KEYWORDS = ['登录', '注册', '手机号', '验证码', '扫码'];

    // 右下角「登录即可查看」登录引导卡片（类名为动态 hash，如 css-woosw9，无法用选择器命中，靠固定文案定位）
    const CORNER_LOGIN_TEXT = ['登录即可查看', '超5亿', '超 5 千万创作者', '立即登录/注册'];

    // 判断某个元素是否是登录弹窗
    function isLoginModal(node) {
        if (!node || !node.querySelector) return false;
        if (node.matches && node.matches(LOGIN_NODE_SELECTORS.join(','))) return true;
        const text = (node.innerText || node.textContent || '');
        if (!text || text.length > 3000) return false; // 正文节点跳过，避免误伤
        return LOGIN_KEYWORDS.some(k => text.includes(k));
    }

    // 删除登录弹窗：找到其最近的 .Modal 容器一并删除，同时清理遮罩层
    function removeLoginModal(node) {
        const modal = node.closest('.Modal') ||
            (node.classList && node.classList.contains('Modal') ? node : null);
        if (modal) modal.remove();
        else node.remove();
        // 遮罩层本身无内容，删除无副作用
        document.querySelectorAll('.Modal-backdrop').forEach(b => b.remove());
    }

    // 恢复被知乎锁定的滚动
    function releaseScrollLock() {
        const fix = (el) => {
            if (!el) return;
            const s = el.style;
            if (s.overflow === 'hidden') s.overflow = '';
            if (s.position === 'fixed') s.position = '';
            if (s.top || s.left || s.right || s.bottom) {
                s.top = s.left = s.right = s.bottom = '';
            }
        };
        fix(document.documentElement);
        fix(document.body);
        document.body.classList.remove('overflow-hidden');
    }

    // 定位并移除右下角「登录即可查看」登录引导卡片
    function removeCornerLoginCard() {
        const cards = document.querySelectorAll('body div');
        for (const el of cards) {
            const s = getComputedStyle(el);
            if (s.position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            // 视口右下角区域内的可见卡片
            if (r.width < 100 || r.height < 100) continue;
            if (r.right < window.innerWidth * 0.6 || r.bottom < window.innerHeight * 0.6) continue;
            const text = el.innerText || '';
            if (!text || text.length > 200) continue;
            if (CORNER_LOGIN_TEXT.some(k => text.includes(k))) {
                el.remove();
                return true;
            }
        }
        return false;
    }

    // 移除底部「打开知乎查看更多内容」引导按钮
    function removeFooterOpenButton() {
        let removed = false;
        document.querySelectorAll('button, a').forEach(el => {
            const text = (el.innerText || '').trim();
            if (text.includes(FOOTER_OPEN_BTN_TEXT[0]) && text.includes(FOOTER_OPEN_BTN_TEXT[1])) {
                el.remove();
                removed = true;
            }
        });
        return removed;
    }

    // 拦截文章/回答链接的点击：知乎在点击时用 React 根容器监听器劫持跳转到 /oia/ 下载引导页。
    // 在捕获阶段（先于 React 的冒泡监听器）阻止事件传播，让浏览器按链接原 href 正常导航。
    function installClickGuard() {
        document.addEventListener('click', (event) => {
            if (!event.target || !event.target.closest) return;
            const a = event.target.closest('a[href*="zhuanlan.zhihu.com/p/"], a[href*="/zhihu.com/answer/"], a[href*="/oia/"]');
            if (a) {
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        }, true);
    }

    // 兜底：若仍进入了「打开 App 引导页」（/oia/...），还原到对应的知乎网页版 URL
    function redirectOiaPage() {
        const m = location.pathname.match(/^\/oia\/(article|articles|answer|question|zhuanlan)\/(\d+)/);
        if (!m) return;
        const type = m[1], id = m[2];
        let target = null;
        if (type === 'article' || type === 'articles') target = 'https://zhuanlan.zhihu.com/p/' + id;
        else if (type === 'question') target = 'https://www.zhihu.com/question/' + id;
        else if (type === 'answer') target = 'https://www.zhihu.com/answer/' + id;
        else if (type === 'zhuanlan') target = 'https://zhuanlan.zhihu.com/p/' + id;
        if (target) location.replace(target);
    }

    function cleanup() {
        let removed = false;

        // 1. 精确命中登录相关节点
        document.querySelectorAll(LOGIN_NODE_SELECTORS.join(',')).forEach(node => {
            removeLoginModal(node);
            removed = true;
        });

        // 2. 对通用 .Modal 做内容检测
        document.querySelectorAll('.Modal').forEach(node => {
            if (isLoginModal(node)) {
                removeLoginModal(node);
                removed = true;
            }
        });

        // 3. 手机端弹窗（MobileModal）——含登录引导、App 阅读全文引导等，及其遮罩层
        document.querySelectorAll('.MobileModal').forEach(node => {
            const text = node.innerText || '';
            if (MOBILE_MODAL_KEYWORDS.some(k => text.includes(k))) {
                node.remove();
                removed = true;
            }
        });
        document.querySelectorAll('.MobileModal-backdrop').forEach(b => {
            b.remove();
            removed = true;
        });
        // 4. 右下角登录引导卡片
        if (removeCornerLoginCard()) removed = true;

        // 5. 底部「打开知乎查看更多内容」引导按钮
        if (removeFooterOpenButton()) removed = true;

        // 无论如何都尝试恢复滚动（幂等）
        releaseScrollLock();
    }

    // rAF 防抖，避免高频 Mutation 回调影响性能
    let scheduled = false;
    function scheduleCleanup() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            cleanup();
        });
    }

    // 监听 DOM 增删与属性变化（知乎是 React 应用，弹窗会反复重渲染）
    if (document.documentElement) {
        new MutationObserver(scheduleCleanup).observe(
            document.documentElement,
            { childList: true, subtree: true, attributes: true }
        );
    }

    cleanup();
    installClickGuard();
    redirectOiaPage();
})();
