// ==UserScript==
// @name         蓝奏云优化
// @version      6.3
// @description  桌面/移动端均可下载：移动版 APK 分享页被服务端按 UA 拦截时，自动伪造电脑版 UA 获取签名；在原页面内显示密码框和下载按钮，不自动下载；密码按分享记忆
// @author       DeepSeek（原作）/ 改进
// @namespace    https://greasyfork.org/users/452911
// @include      *.lanosso.com/*
// @include      *.lanzn.com/*
// @include      *.lanzog.com/*
// @include      *.lanpw.com/*
// @include      *.lanpv.com/*
// @include      *.lanzv.com/*
// @include      *.lanzouu.com/*
// @include      *://*.lanz*.com/*
// @include      *://lanz*.com/*
// @include      *://*.lanz*.net/*
// @include      *://lanz*.net/*
// @include      *://*.lanz*.cn/*
// @include      *://lanz*.cn/*
// @include      *://*.lanzou.*/*
// @include      *://lanzou.*/*
// @include      *://*.ilanzou.com/*
// @run-at       document-end
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    /* ============================================================
     * 蓝奏云分享页会按请求头 User-Agent 返回两套 HTML：
     *   - 桌面 UA：完整页面，内含下载签名（当前版本是 var isngis = '...'）
     *   - 移动 UA + APK：只有“非会员不在支持分享apk文件”的拦截页
     * 下载接口对 UA 不敏感，只要拿到签名和密码就能返回下载地址。
     * 浏览器页面里的 fetch/XHR 改不了 User-Agent（禁止头），
     * 所以用 GM_xmlhttpRequest 带桌面 UA 去取桌面版 HTML。
     * ============================================================ */

    const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

    // 密码按“分享路径”记忆，不绑定域名，换镜像也能复用
    const PWD_KEY = location.pathname + ':pwd';
    const PWD_KEY_LEGACY = location.hostname + location.pathname + ':pwd';

    // Tampermonkey / Violentmonkey 沙箱里 window 不是页面本身
    const PAGE = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    let cachedInfo = null;   // { html, sign, fileId, apiUrl, needPwd, ts }
    let mobileBusy = false;
    let downloading = false;

    function log() {
        try {
            console.log.apply(console, ['[蓝奏云优化]'].concat(Array.prototype.slice.call(arguments)));
        } catch (e) {}
    }

    /* ================= 存储 ================= */
    let cachedStorage = null;
    function storageArea() {
        if (cachedStorage) return cachedStorage;
        try {
            if (PAGE && PAGE.localStorage) {
                void PAGE.localStorage.length;
                cachedStorage = PAGE.localStorage;
                return cachedStorage;
            }
        } catch (e) {}
        try {
            cachedStorage = localStorage;
            return cachedStorage;
        } catch (e) {}
        return null;
    }

    function storageGet(key) {
        try {
            const area = storageArea();
            return area ? area.getItem(key) : null;
        } catch (e) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            const area = storageArea();
            if (area) area.setItem(key, value);
        } catch (e) {}
    }

    function getStoredPwd() {
        return storageGet(PWD_KEY) || storageGet(PWD_KEY_LEGACY) || '';
    }

    function savePwd(value) {
        storageSet(PWD_KEY, value);
        storageSet(PWD_KEY_LEGACY, value);
    }

    function clearPwd() {
        storageSet(PWD_KEY, '');
        storageSet(PWD_KEY_LEGACY, '');
    }

    function fireInput(el) {
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }

    /* ================= GM 请求 ================= */
    // Via 的 GM_xmlhttpRequest 内部会读 navigator.userAgent 当请求 UA，
    // Tampermonkey 则认 headers 里的 User-Agent。
    // 策略：先用 header；如果拿到的是拦截页，再临时改写 navigator.userAgent 重试。
    let uaOverrideRestore = null;
    let uaOverrideCount = 0;

    function applyUAOverride() {
        const restores = [];
        const patchedProtos = [];

        function patchNavigator(nav) {
            if (!nav) return;
            let proto = null;
            try { proto = Object.getPrototypeOf(nav); } catch (e) {}

            if (proto && patchedProtos.indexOf(proto) === -1) {
                patchedProtos.push(proto);
                try {
                    const desc = Object.getOwnPropertyDescriptor(proto, 'userAgent');
                    if (desc && desc.configurable) {
                        Object.defineProperty(proto, 'userAgent', {
                            get: function () { return DESKTOP_UA; },
                            configurable: true
                        });
                        restores.push(function () {
                            try { Object.defineProperty(proto, 'userAgent', desc); } catch (e) {}
                        });
                    }
                } catch (e) {}
            }

            // 原型改不了，就在 navigator 实例上改
            try {
                if (nav.userAgent !== DESKTOP_UA) {
                    const own = Object.getOwnPropertyDescriptor(nav, 'userAgent');
                    if (!own || own.configurable) {
                        Object.defineProperty(nav, 'userAgent', {
                            value: DESKTOP_UA,
                            configurable: true
                        });
                        restores.push(function () {
                            try {
                                if (own) Object.defineProperty(nav, 'userAgent', own);
                                else delete nav.userAgent;
                            } catch (e) {}
                        });
                    }
                }
            } catch (e) {}
        }

        try { patchNavigator(navigator); } catch (e) {}
        try {
            if (PAGE && PAGE.navigator && PAGE.navigator !== navigator) patchNavigator(PAGE.navigator);
        } catch (e) {}

        return function () {
            for (let i = 0; i < restores.length; i++) {
                try { restores[i](); } catch (e) {}
            }
        };
    }

    function acquireUAOverride() {
        if (uaOverrideCount === 0) uaOverrideRestore = applyUAOverride();
        uaOverrideCount++;
    }

    function releaseUAOverride() {
        if (uaOverrideCount <= 0) return;
        uaOverrideCount--;
        if (uaOverrideCount === 0 && uaOverrideRestore) {
            try { uaOverrideRestore(); } catch (e) {}
            uaOverrideRestore = null;
        }
    }

    function gmRequest(opts, spoofUA) {
        return new Promise(function (resolve, reject) {
            const cfg = {};
            for (const k in opts) {
                if (Object.prototype.hasOwnProperty.call(opts, k)) cfg[k] = opts[k];
            }
            cfg.timeout = opts.timeout || 12000;

            let released = false;
            let safety = null;

            function release() {
                if (released) return;
                released = true;
                if (safety) clearTimeout(safety);
                if (spoofUA) releaseUAOverride();
            }

            cfg.onload = function (res) { release(); resolve(res); };
            cfg.onerror = function () { release(); reject(new Error('GM_ERROR')); };
            cfg.ontimeout = function () { release(); reject(new Error('GM_TIMEOUT')); };
            cfg.onabort = function () { release(); reject(new Error('GM_ABORT')); };

            if (spoofUA) acquireUAOverride();
            // 安全兜底：管理器不回调时也能恢复
            safety = setTimeout(release, 5000);

            try {
                if (typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest(cfg);
                } else if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
                    GM.xmlHttpRequest(cfg).then(
                        function (res) { release(); resolve(res); },
                        function (err) { release(); reject(err); }
                    );
                } else {
                    throw new Error('GM_UNAVAILABLE');
                }
            } catch (e) {
                release();
                reject(e);
            }
        });
    }

    /* ================= 解析 ================= */
    function parseSign(html) {
        if (!html) return null;
        const SIGN = '([A-Za-z0-9_\\-+/=]{20,})';
        const patterns = [
            'var\\s+isngis\\s*=\\s*[\'"]' + SIGN + '[\'"]',
            'var\\s+(?:sign|vkjxld)\\s*=\\s*[\'"]' + SIGN + '[\'"]',
            '[\'"]sign[\'"]\\s*:\\s*[\'"]' + SIGN + '[\'"]'
        ];
        for (let i = 0; i < patterns.length; i++) {
            const m = html.match(new RegExp(patterns[i]));
            if (m) return m[1];
        }
        // 兜底：页面里最长的 base64url 字符串赋值
        const all = html.match(/=\s*['"][A-Za-z0-9_\-+/=]{60,}['"]/g) || [];
        let best = '';
        for (let i = 0; i < all.length; i++) {
            const v = all[i].replace(/^=\s*['"]/, '').replace(/['"]$/, '');
            if (v.length > best.length) best = v;
        }
        return best || null;
    }

    function parseFileId(html) {
        if (!html) return null;
        const m = html.match(/ajax(?:file|m)\.php\?file=(\d+)/) || html.match(/[?&]file=(\d+)/);
        return m ? m[1] : null;
    }

    function parseApiUrl(html, fileId) {
        if (html) {
            const m = html.match(/url\s*:\s*['"](https?:\/\/[^'"]*?ajax(?:file|m)\.php\?file=\d+[^'"]*)['"]/);
            if (m) return m[1].replace(/&amp;/g, '&');
            const m2 = html.match(/(https?:\/\/[^'"\s<>]*?ajax(?:file|m)\.php\?file=\d+)/);
            if (m2) return m2[1].replace(/&amp;/g, '&');
        }
        if (fileId) return 'https://apifile.woozooo.com/ajaxfile.php?file=' + encodeURIComponent(fileId);
        return '';
    }

    function parseSize(html) {
        if (!html) return '';
        const m = html.match(/n_filesize[^>]*>\s*大小\s*[：:]\s*([^<]+)/) ||
                  html.match(/大小\s*[：:]\s*([0-9.]+\s*[KMGT]B?)/i);
        return m ? m[1].trim() : '';
    }

    function htmlNeedsPassword(html) {
        return /id=["']pwd["']/.test(html) ||
               /name=["']pwd["']/.test(html) ||
               /passwdinput/.test(html);
    }

    function htmlIsBlockPage(html) {
        return !parseSign(html) && /非会员|开通会员/.test(html || '');
    }

    function buildFinalUrl(data) {
        if (!data) return null;
        let url = '';
        if (typeof data.url === 'string' && data.url) {
            if (/^https?:\/\//i.test(data.url)) {
                url = data.url;
            } else if (typeof data.dom === 'string' && data.dom) {
                url = data.dom.replace(/\/+$/, '') + '/file/' + data.url;
            }
        }
        return /^https?:\/\//i.test(url) ? url : null;
    }

    function findDirectLink(html) {
        if (!html) return '';
        const m = html.match(/https?:\/\/[^"'\s<>]+\/file\/[^"'\s<>]+/);
        return m ? m[0].replace(/&amp;/g, '&') : '';
    }

    function parseFileIdFromPage() {
        const link = document.querySelector('#save_novip a[href], a[href*="ilanzou.com/unproved/pd/url"]');
        if (link) {
            const m = (link.href || '').match(/[?&]id=(\d+)/);
            if (m) return m[1];
        }
        try {
            const m = document.documentElement.innerHTML.match(/[?&]id=(\d{5,})/);
            if (m) return m[1];
        } catch (e) {}
        return null;
    }

    /* ================= 网络 ================= */
    async function fetchDesktopHtml() {
        // 只请求当前页面自己的域名：Via 等 WebView 脚本环境通常只允许同源 GM 请求
        let url = location.origin + location.pathname + location.search;
        // 绕过 WebView / 代理缓存，避免拿到旧的拦截页
        url += (url.indexOf('?') === -1 ? '?' : '&') + '_lzy=' + Date.now();

        const baseHeaders = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': location.origin + '/',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        // 1) 直接带 UA 头（Tampermonkey 走这条）
        // 2) 改写 navigator.userAgent 再试（Via 走这条）
        // 3) 小写 header 再试（个别管理器区分大小写）
        const attempts = [
            { name: 'User-Agent', spoof: false },
            { name: 'User-Agent', spoof: true },
            { name: 'user-agent', spoof: true }
        ];

        let lastError = null;
        for (let i = 0; i < attempts.length; i++) {
            try {
                const headers = {};
                for (const k in baseHeaders) headers[k] = baseHeaders[k];
                headers[attempts[i].name] = DESKTOP_UA;

                const res = await gmRequest({
                    method: 'GET',
                    url: url,
                    headers: headers,
                    timeout: 12000
                }, attempts[i].spoof);

                const text = (res && res.responseText) || '';
                if (parseSign(text)) return text;
                lastError = new Error('UA_SPOOF_FAILED');
            } catch (e) {
                lastError = e;
                // 管理器没有 GM API，或网络本身失败：换写法也没用
                if (e && (e.message === 'GM_UNAVAILABLE' ||
                          e.message === 'GM_ERROR' ||
                          e.message === 'GM_TIMEOUT')) {
                    throw e;
                }
            }
        }
        throw lastError || new Error('FETCH_FAILED');
    }

    function postForm(url, body) {
        return new Promise(function (resolve, reject) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', url, true);
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
                xhr.timeout = 15000;
                xhr.onload = function () { resolve(xhr.responseText); };
                xhr.onerror = function () { reject(new Error('XHR_ERROR')); };
                xhr.ontimeout = function () { reject(new Error('XHR_TIMEOUT')); };
                xhr.send(body);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function requestDownload(info, pwd) {
        const apiUrl = info.apiUrl ||
            ('https://apifile.woozooo.com/ajaxfile.php?file=' + encodeURIComponent(info.fileId));

        const body = 'action=downprocess' +
            '&sign=' + encodeURIComponent(info.sign) +
            '&kd=1' +
            '&p=' + encodeURIComponent(pwd || '');

        // 接口返回 Access-Control-Allow-Origin: *。
        // 优先用站点自己的 XHR 方式，其次 GM，最后 fetch，尽量不依赖 GM 跨域。
        try {
            return JSON.parse(await postForm(apiUrl, body));
        } catch (xhrError) {
            try {
                const res = await gmRequest({
                    method: 'POST',
                    url: apiUrl,
                    data: body,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Referer': location.href
                    },
                    timeout: 15000
                });
                return JSON.parse((res && res.responseText) || '');
            } catch (gmError) {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    },
                    body: body
                });
                return JSON.parse(await res.text());
            }
        }
    }

    /* ================= 移动版界面 ================= */
    const UI_STYLE = `
#divnone.lzy-page, #lzy-page-overlay {
    margin: 0 !important;
    padding: 28px 18px 96px !important;
    box-sizing: border-box !important;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex !important;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #f5f6f8 !important;
    text-align: center !important;
    font-size: 14px;
    color: #03081A;
}
#lzy-page-overlay { position: fixed; inset: 0; z-index: 2147483647; overflow-y: auto; }
.lzy-card {
    width: 100%;
    max-width: 360px;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 30px 24px 26px;
    background: #fff;
    border: 1px solid #eef0f4;
    border-radius: 18px;
    box-shadow: 0 10px 36px rgba(3, 8, 26, .07);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    text-align: center;
}
.lzy-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    border-radius: 50%;
    background: #eaf4ff;
    display: flex;
    align-items: center;
    justify-content: center;
}
.lzy-icon.error { background: #fff0f0; }
.lzy-title {
    font-size: 19px;
    line-height: 1.4;
    font-weight: 600;
    color: #03081A;
    word-break: break-all;
}
.lzy-sub {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: #878B99;
    word-break: break-all;
}
.lzy-body { margin-top: 22px; }
.lzy-input {
    display: block;
    width: 100%;
    height: 48px;
    box-sizing: border-box;
    padding: 0 14px;
    border: 1px solid #e3e6eb;
    border-radius: 10px;
    background: #f7f8fa;
    color: #03081A;
    font-size: 16px;
    outline: none;
    text-align: left;
    -webkit-appearance: none;
}
.lzy-input:focus {
    border-color: #08f;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(0, 136, 255, .12);
}
.lzy-btn, a.lzy-btn {
    display: block;
    width: 100%;
    height: 48px;
    line-height: 48px;
    box-sizing: border-box;
    margin-top: 12px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: #08f;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}
.lzy-btn:active { opacity: .88; }
.lzy-btn[disabled] { opacity: .6; cursor: default; }
.lzy-status {
    margin-top: 14px;
    min-height: 18px;
    font-size: 12px;
    line-height: 1.6;
    color: #9aa0aa;
    word-break: break-all;
}
.lzy-status.error { color: #e5484d; }
.lzy-spinner {
    width: 28px;
    height: 28px;
    box-sizing: border-box;
    border: 3px solid #dbe9ff;
    border-top-color: #08f;
    border-radius: 50%;
    animation: lzy-spin .8s linear infinite;
}
@keyframes lzy-spin { to { transform: rotate(360deg); } }
#save_novip #save a {
    display: inline-block;
    padding: 8px 18px;
    border-radius: 999px;
    background: #fff;
    border: 1px solid #e3e6eb;
    color: #08f;
    font-size: 14px;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(3, 8, 26, .05);
}
`;

    function injectUiStyle() {
        if (document.getElementById('lzy-ui-style')) return;
        const style = document.createElement('style');
        style.id = 'lzy-ui-style';
        style.textContent = UI_STYLE;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureHost() {
        let host = document.getElementById('divnone');
        if (host) {
            host.classList.add('lzy-page');
            const children = Array.prototype.slice.call(host.children);
            for (let i = 0; i < children.length; i++) {
                if (!children[i].classList.contains('lzy-card')) children[i].style.display = 'none';
            }
            return host;
        }
        let overlay = document.getElementById('lzy-page-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lzy-page-overlay';
            overlay.className = 'lzy-page-overlay';
            (document.body || document.documentElement).appendChild(overlay);
        }
        return overlay;
    }

    function clearNode(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    function makeIcon(kind) {
        const icon = document.createElement('div');
        icon.className = 'lzy-icon' + (kind === 'error' ? ' error' : '');
        if (kind === 'loading') {
            const spinner = document.createElement('div');
            spinner.className = 'lzy-spinner';
            icon.appendChild(spinner);
            return icon;
        }
        const color = kind === 'error' ? '#e5484d' : '#08f';
        if (kind === 'error') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
        } else {
            icon.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
        }
        return icon;
    }

    function setCard(opts) {
        injectUiStyle();
        const host = ensureHost();
        clearNode(host);

        const card = document.createElement('div');
        card.className = 'lzy-card';

        if (opts.icon) card.appendChild(makeIcon(opts.icon));

        const title = document.createElement('div');
        title.className = 'lzy-title';
        title.textContent = opts.title || '';
        card.appendChild(title);

        if (opts.sub) {
            const sub = document.createElement('div');
            sub.className = 'lzy-sub';
            sub.textContent = opts.sub;
            card.appendChild(sub);
        }

        if (opts.body) card.appendChild(opts.body);

        if (opts.status) {
            const status = document.createElement('div');
            status.className = 'lzy-status' + (opts.statusError ? ' error' : '');
            status.textContent = opts.status;
            card.appendChild(status);
        }

        host.appendChild(card);
        return card;
    }

    function showLoading(text) {
        setCard({
            icon: 'loading',
            title: '文件下载',
            sub: text || '正在获取文件信息…'
        });
    }

    function showPasswordPrompt(message) {
        const body = document.createElement('div');
        body.className = 'lzy-body';

        const input = document.createElement('input');
        input.className = 'lzy-input';
        input.type = 'text';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('inputmode', 'text');
        input.placeholder = '请输入分享密码';
        body.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lzy-btn';
        btn.textContent = '获取下载地址';
        body.appendChild(btn);

        const status = document.createElement('div');
        status.className = 'lzy-status';
        body.appendChild(status);

        function submit() {
            const value = (input.value || '').trim();
            if (!value) {
                status.className = 'lzy-status error';
                status.textContent = '请先输入密码。';
                try { input.focus(); } catch (e) {}
                return;
            }
            savePwd(value);
            status.className = 'lzy-status';
            status.textContent = '正在获取下载地址…';
            btn.disabled = true;
            if (cachedInfo && cachedInfo.sign) {
                doDownload(cachedInfo, value);
            } else {
                startMobile();
            }
        }

        btn.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                submit();
            }
        });

        setCard({
            icon: 'download',
            title: '文件下载',
            sub: message || '该分享需要密码，输入后获取下载地址',
            body: body
        });

        setTimeout(function () {
            try { input.focus(); } catch (e) {}
        }, 80);
    }

    function showDownload(url, fileName, sizeText) {
        const body = document.createElement('div');
        body.className = 'lzy-body';

        const link = document.createElement('a');
        link.className = 'lzy-btn';
        link.href = url;
        link.target = '_self';
        link.rel = 'noopener';
        link.textContent = '点击下载';
        body.appendChild(link);

        setCard({
            icon: 'download',
            title: fileName || '文件下载',
            sub: sizeText ? '文件大小：' + sizeText : '',
            body: body,
            status: '已获取下载地址，点击按钮后由浏览器开始下载'
        });

        if (fileName) {
            try { document.title = fileName; } catch (e) {}
        }
    }

    function showError(message, canRetry) {
        const body = document.createElement('div');
        body.className = 'lzy-body';

        if (canRetry) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lzy-btn';
            btn.textContent = '重试';
            btn.addEventListener('click', function () {
                cachedInfo = null;
                startMobile();
            });
            body.appendChild(btn);
        }

        setCard({
            icon: 'error',
            title: '获取失败',
            sub: message || '请稍后重试。',
            body: body
        });
    }

    /* ================= 移动版流程 ================= */
    async function startMobile() {
        if (mobileBusy) return;
        mobileBusy = true;
        try {
            await mobileFlow();
        } catch (e) {
            log('移动版流程异常', e);
            showError('发生错误：' + ((e && e.message) || e), true);
        } finally {
            mobileBusy = false;
        }
    }

    async function mobileFlow() {
        let info = cachedInfo;
        if (!info || Date.now() - info.ts > 120000) {
            showLoading('正在获取文件信息…');

            let html;
            try {
                html = await fetchDesktopHtml();
            } catch (e) {
                const code = (e && e.message) || '';
                if (code === 'GM_UNAVAILABLE') {
                    showError('当前脚本管理器不支持 GM_xmlhttpRequest，无法伪造电脑版 UA。请换用 Tampermonkey / Violentmonkey；或在浏览器菜单里勾选“电脑版网站”后刷新。', false);
                } else if (code === 'UA_SPOOF_FAILED') {
                    showError('伪造电脑版 UA 没有生效（服务端仍返回移动版限制页）。请确认脚本管理器允许修改 User-Agent；或在浏览器菜单里勾选“电脑版网站”后刷新。', false);
                } else {
                    showError('获取文件信息失败，请检查网络后重试。', true);
                }
                return;
            }

            const sign = parseSign(html);
            const fileId = parseFileId(html) || parseFileIdFromPage();

            if (!sign) {
                if (htmlIsBlockPage(html)) {
                    showError('服务端仍返回移动版限制页（UA 伪造未生效）。请确认脚本管理器允许修改 User-Agent。', false);
                } else {
                    showError('没有找到下载签名，页面结构可能已更新。', true);
                }
                return;
            }
            if (!fileId) {
                showError('没有找到文件编号，页面结构可能已更新。', true);
                return;
            }

            info = {
                html: html,
                sign: sign,
                fileId: fileId,
                apiUrl: parseApiUrl(html, fileId),
                needPwd: htmlNeedsPassword(html),
                ts: Date.now()
            };
            cachedInfo = info;
        }

        if (info.needPwd) {
            const saved = getStoredPwd();
            if (saved) {
                showLoading('正在获取下载地址…');
                await doDownload(info, saved);
            } else {
                showPasswordPrompt('该分享需要密码，输入后获取下载地址');
            }
            return;
        }

        showLoading('正在获取下载地址…');
        await doDownload(info, '');
    }

    async function doDownload(info, pwd) {
        if (downloading) return;
        downloading = true;
        try {
            let data;
            try {
                data = await requestDownload(info, pwd);
            } catch (e) {
                log('下载接口请求失败', e);
                showError('请求下载地址失败，请检查网络后重试。', true);
                return;
            }

            const finalUrl = buildFinalUrl(data);
            if (data && String(data.zt) === '1' && finalUrl) {
                showDownload(finalUrl, data.inf || '', parseSize(info.html));
                return;
            }

            // 无密码分享的兜底：桌面版 HTML 里可能已经带了直链
            if (!info.needPwd) {
                const direct = findDirectLink(info.html);
                if (direct) {
                    showDownload(direct, '', parseSize(info.html));
                    return;
                }
            }

            const inf = (data && data.inf) ? String(data.inf) : '获取下载地址失败';
            if (/密码/.test(inf)) {
                clearPwd();
                showPasswordPrompt(inf + '，请重新输入');
            } else {
                showError(inf, true);
            }
        } finally {
            downloading = false;
        }
    }

    /* ================= 电脑版流程 ================= */
    function findPasswordInput() {
        return document.querySelector('#pwd, input[name="pwd"], .passwdinput');
    }

    function submitDesktopPassword() {
        try {
            if (typeof PAGE.down_p === 'function') {
                PAGE.down_p();
                log('已调用 down_p()');
                return true;
            }
        } catch (e) {}
        try {
            if (typeof PAGE.pwd === 'function') {
                PAGE.pwd();
                log('已调用 pwd()');
                return true;
            }
        } catch (e) {}
        const btn = document.querySelector('.passwddiv-btn') || document.getElementById('sub');
        if (btn) {
            try {
                btn.click();
                log('已点击密码提交按钮');
                return true;
            } catch (e) {}
        }
        return false;
    }

    function startDesktop() {
        const pwd = findPasswordInput();
        if (pwd) {
            pwd.addEventListener('input', function () { savePwd(pwd.value); });
            pwd.addEventListener('change', function () { savePwd(pwd.value); });

            const saved = getStoredPwd();
            if (saved && !pwd.value) {
                pwd.value = saved;
                fireInput(pwd);
                log('已自动填入保存的密码');
                setTimeout(function () { submitDesktopPassword(); }, 500);
            }
        }

        // 旧版页面：#f_pwd 默认隐藏，需要 filego() 展开
        const oldBox = document.getElementById('f_pwd');
        if (oldBox) {
            let hidden = false;
            try {
                hidden = oldBox.style.display === 'none' || getComputedStyle(oldBox).display === 'none';
            } catch (e) {}
            if (hidden) {
                setTimeout(function () {
                    try {
                        if (typeof PAGE.filego === 'function') PAGE.filego();
                    } catch (e) {}
                    const oldInput = oldBox.querySelector('input');
                    if (oldInput) {
                        oldInput.addEventListener('input', function () { savePwd(oldInput.value); });
                        const saved = getStoredPwd();
                        if (saved && !oldInput.value) {
                            oldInput.value = saved;
                            fireInput(oldInput);
                            setTimeout(submitDesktopPassword, 500);
                        }
                    }
                }, 400);
            }
        }
    }

    /* ================= 启动 ================= */
    function isMobileBlockedPage() {
        const box = document.getElementById('divnone');
        const text = box ? (box.textContent || '') : (document.body ? (document.body.innerText || '') : '');
        if (!text) return false;
        return /非会员/.test(text) && /apk|安卓|安装包/i.test(text);
    }

    function looksLikeSharePage() {
        return !!(document.getElementById('divnone') ||
                  document.getElementById('pwd') ||
                  document.getElementById('f_pwd') ||
                  document.querySelector('.passwdinput') ||
                  document.querySelector('.passwddiv-btn'));
    }

    function onKeydown(e) {
        if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
            e.preventDefault();
            log('手动触发');
            cachedInfo = null;
            if (isMobileBlockedPage()) {
                startMobile();
            } else {
                submitDesktopPassword();
            }
        }
    }

    function boot() {
        // 非分享页（首页、登录页等）直接退出，少做无谓的 DOM 查询和监听
        if (!looksLikeSharePage()) return;

        document.addEventListener('keydown', onKeydown);

        if (isMobileBlockedPage()) {
            log('检测到移动版 APK 拦截页');
            startMobile();
            return;
        }
        log('启动桌面版密码填充');
        startDesktop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    log('脚本已加载 v6.3（域名覆盖、缓存绕过、按需 UA 改写、明文密码框）');
})();
