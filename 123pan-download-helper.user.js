// ==UserScript==
// @name         123云盘下载优化
// @namespace    https://github.com/yourname/userscripts
// @version      1.8.3
// @description  分享页点下载自动"保存到自己网盘→取直链→触发下载"（不跳转页面，MIUIX风格进度提示）；屏蔽客户端下载/二维码/横幅/广告/SVIP徽章、删免责声明；未登录弹登录窗；阻止剪切板写入和客户端跳转。接口/DOM 多候选回退，抗网站改版（桌面端+移动端）
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

    // 隐藏元素（已在隐藏状态就不重复写 style，避免触发多余的样式重算）
    function hide(el) {
        if (el && el.style && el.style.display !== 'none') el.style.display = 'none';
    }

    // 记录已处理过的弹窗元素，防止 MutationObserver + click() 造成死循环
    var handledModals = new WeakSet();

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
    // nodes：本次新增的节点（增量扫描）。首次不传 = 全页扫一遍。
    // 性能要点：
    //   1) 能用选择器命中的，绝不遍历文本；
    //   2) 必须按文本判断的，只扫"新增节点"或"小范围区域"，不再遍历全页 div/span/a。
    function clean(nodes) {
        var mobile = isMobile();

        // 1) 屏蔽"客户端下载"按钮（仅桌面端；与"浏览器下载"共用类，用文本区分）
        hide(findByText('button', '客户端下载'));

        // 2) 屏蔽二维码按钮（仅桌面端）
        hide(document.querySelector('button.qrcode_btn'));

        // 3) 屏蔽"立即下载 无需登录"横幅（桌面/移动端都是 .hot-badge）
        document.querySelectorAll('.hot-badge').forEach(function (el) {
            if (/立即下载|无需登录/.test(el.textContent || '')) hide(el);
        });

        // 4) 屏蔽顶部推广横幅（slogan_top.png）
        document.querySelectorAll('img[alt="slogan"], img[src*="slogan_top"]').forEach(hide);

        // 5) 隐藏底部免责声明（桌面端；移动端 .footer-area.mobile 是操作栏，必须保留）
        if (!mobile) {
            document.querySelectorAll('.footer-area').forEach(function (el) {
                if (/本页面由用户分享生成|严禁传播/.test(el.textContent || '')) hide(el);
            });
        }

        // 6) 隐藏付费确认弹窗
        document.querySelectorAll('.hmodal-overlay-container').forEach(function (m) {
            if (/确认下载|待支付|扫码支付/.test(m.textContent || '')) hide(m);
        });

        // 7) 自动关闭 VIP 开通弹窗（新旧两代类名）
        //    WeakSet 防重：click() 会触发 React 变化 → 再次触发 observer，避免死循环
        document.querySelectorAll('.scheme-e-vip-modal-wrap, .scheme-e-vip-modal, .mfy_h-popup-module__root, [class*="h5-either-vip-and-peruse"]').forEach(function (modal) {
            if (handledModals.has(modal)) return;
            handledModals.add(modal);
            var closeBtn = modal.querySelector('.adm-popup-close-button, .hmodal-close, [class*="closeButton"], [aria-label="Close"]');
            if (closeBtn) { closeBtn.click(); return; }
            hide(modal.closest('.hmodal-overlay-container, .adm-popup-wrap, .mfy_h-popup-module__wrap') || modal);
        });

        // 7b) 自动处理"保留策略 / APP下载"弹窗（点「暂不下载」继续下载）
        document.querySelectorAll('.retain-policy-modal, [class*="retain-policy"]').forEach(function (modal) {
            if (handledModals.has(modal)) return;
            handledModals.add(modal);
            var cancelBtn = modal.querySelector('[class*="buttons-cancel"], [class*="btn-cancel"]');
            if (cancelBtn) { cancelBtn.click(); return; }
            var closeBtn = modal.querySelector('[class*="close"]');
            if (closeBtn) { closeBtn.click(); return; }
            hide(modal);
        });

        // 8) 屏蔽广告（只隐藏，绝不 remove——移除 React 节点会导致页面崩溃）
        document.querySelectorAll('.web-code-card-adv, .bg_svip_block_ads, img[src*="share_background"], img[src*="bg_svip_block_ads"]').forEach(hide);
        document.querySelectorAll('.backgroundImage').forEach(function (el) {
            if (el.style && el.style.backgroundImage !== 'none') el.style.backgroundImage = 'none';
        });

        // 9) 屏蔽 SVIP / VIP 会员徽章
        document.querySelectorAll('img[alt="svip"], img[src*="SVIPLable"], img[alt="user-label"]').forEach(hide);

        // 10) 屏蔽移动端"APP查看/打开APP"入口和客户端引导层
        //     只在"小范围区域"内按文本判断，避免全页遍历
        document.querySelectorAll('.header-action-btn--app').forEach(hide);
        var scopes = (nodes && nodes.length) ? nodes : [document.body || document.documentElement];
        scopes.forEach(function (scope) {
            if (!scope || !scope.querySelectorAll) return;
            // 10a) "APP查看 / 打开App" 的叶子节点
            scope.querySelectorAll('.badge-wrapper *, .app-header *, header *').forEach(function (el) {
                if (el.children.length) return;
                var t = (el.textContent || '').trim();
                if (t === 'APP查看' || t === '打开App') hide(el);
            });
            // 10b) 客户端引导层：只挑固定定位的浮层
            scope.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]').forEach(function (el) {
                if (/如未正常唤起|下载APP|点击下载/.test(el.textContent || '')) hide(el);
            });
        });
    }

    // ---------- 拦截下载点击：未登录弹登录窗，已登录走保存下载流程 ----------

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
    function handleClick(e) {
        var el = e.target;

        // 下载按钮（桌面 button"浏览器下载" / 移动 div"下载文件"）
        // 注意：用 closest 定位实际按钮，避免点按钮内部文字时漏判
        var target = el && el.closest ? el.closest('button, .appBottomBtnNew') : null;
        if (target && isDownloadTarget(target)) {
            if (!hasToken()) {
                // 未登录：弹登录窗
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openLogin();
                return;
            }
            if (CFG.enabled) {
                // 已登录：走"保存到网盘 → 取直链 → 触发下载"流程（不跳转页面）
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                saveToDriveAndDownload();
                return;
            }
            // 未启用该功能时放行，交给网站默认行为
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
    }

    // 包一层 try/catch：拦截逻辑出错时不影响页面本身的点击
    document.addEventListener('click', function (e) {
        try { handleClick(e); } catch (err) { /* 忽略 */ }
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

    // ============================================================
    // 分享页：保存到自己网盘 → 取下载直链 → 触发下载（不跳转页面）
    // 站点新策略下，分享页不能直接下载，需先存到自己网盘。
    // 本流程全程用同源 API 完成，最后直接触发浏览器下载。
    // ============================================================

    // ---------- 配置（网站改版时优先改这里） ----------
    var CFG = {
        // 目标文件夹 ID（网盘里要保存到的文件夹，即 ?homeFilePath= 后面的数字）
        targetFolderId: 74889659,
        // 是否启用"保存到网盘再下载"
        enabled: true,

        // ---- 接口路径（多候选，逐个回退；网站改路径时在对应数组里补一条即可） ----
        paths: {
            shareList: ['/api/share/get', '/api/share/list'],
            save: ['/api/restful/goapi/v1/file/copy/save', '/api/file/copy/save'],
            saveGet: ['/api/restful/goapi/v1/file/copy/save/get'],
            driveList: ['/b/api/file/list/new', '/b/api/file/list'],
            downloadInfo: ['/b/api/file/download_info', '/b/api/file/download/info']
        },

        // ---- 鉴权（localStorage 键名候选 + app-version） ----
        tokenKeys: ['authorToken', 'token', 'accessToken'],
        uuidKeys: ['LoginUuid', 'loginUuid', 'loginUUID'],
        appVersion: { share: '148', drive: '3' },

        // ---- 响应里"文件数组"的字段名候选 ----
        listKeys: ['InfoList', 'FileList', 'fileList', 'List', 'list'],

        // ---- 页面 DOM 选择器候选（文件名；桌面表格 + 移动列表都覆盖） ----
        // 注意：不要加 [class*="FileName"]——它会命中移动端工具栏 .appFileName（"共1项/按文件名称"）
        nameSelectors: [
            '.table-list-file-name .overflow-detector-container-text',  // 桌面：单元格内文本
            '.table-list-file-name',                                    // 桌面：单元格
            '.file-name-display',                                       // 移动：文件名（带 aria-label，最准）
            '.appTableRowLeftText',                                     // 移动：文件名容器
            '[class*="file-name"]'                                      // 通用兜底
        ]
    };

    // localStorage 里的值可能是 JSON 带引号的，去掉引号
    function stripQ(v) {
        if (v && v.charAt(0) === '"') { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
        return v;
    }

    // 从候选 localStorage 键里取第一个有值的
    function pickStored(keys) {
        for (var i = 0; i < keys.length; i++) {
            var v = stripQ(localStorage.getItem(keys[i]));
            if (v) return v;
        }
        return '';
    }

    // 是否已登录：以是否存在 token 为准（比找"登录/注册"按钮更可靠）
    function hasToken() {
        return !!pickStored(CFG.tokenKeys);
    }

    // 构造 API 鉴权头
    function authHeaders(appVer, withJson) {
        var h = {
            'authorization': 'Bearer ' + pickStored(CFG.tokenKeys),
            'loginuuid': pickStored(CFG.uuidKeys),
            'app-version': String(appVer || CFG.appVersion.drive),
            'platform': 'web'
        };
        if (withJson) h['content-type'] = 'application/json';
        return h;
    }

    // 从 URL 取 shareKey：/123pan/<shareKey>（shareKey 可能含连字符，如 A6cA-HDHJh）
    function getShareKey() {
        var m = location.pathname.match(/\/123pan\/([^\/\?#]+)/);
        return m ? m[1] : null;
    }

    // 从响应 data 里按候选字段名取文件数组（都取不到则取第一个数组）
    function pickList(data) {
        if (!data) return [];
        for (var i = 0; i < CFG.listKeys.length; i++) {
            if (Array.isArray(data[CFG.listKeys[i]])) return data[CFG.listKeys[i]];
        }
        for (var k in data) { if (Array.isArray(data[k])) return data[k]; }
        return [];
    }

    // 判断响应是否属于"接口路径不对"（用于候选回退）
    function looksLikeBadRoute(status, j) {
        if (status < 200 || status >= 300) return true;
        if (!j) return true;
        if (j.code === 404 || j.code === 405) return true;
        return /not\s*found|404|接口不存在|请求地址|no\s*route/i.test(String(j.message || ''));
    }

    // 请求 JSON，返回 {status, json, url}
    function requestJson(url, init) {
        return fetch(url, init).then(function (r) {
            return r.json().then(function (j) { return { status: r.status, json: j, url: url }; })
                .catch(function () { return { status: r.status, json: null, url: url }; });
        });
    }

    // 依次尝试候选路径，返回第一个可用响应 {status, json, url}
    //   urlFor(path)  -> 完整 URL（可在此拼查询参数）
    //   initFor(path) -> fetch 配置
    function tryPaths(paths, urlFor, initFor) {
        var i = 0;
        return new Promise(function (resolve, reject) {
            (function next() {
                if (i >= paths.length) { reject(new Error('所有候选接口均不可用')); return; }
                var p = paths[i++];
                var url = urlFor ? urlFor(p) : p;
                var init = initFor ? initFor(p) : { credentials: 'include' };
                requestJson(url, init).then(function (res) {
                    if (looksLikeBadRoute(res.status, res.json)) next();
                    else resolve(res);
                }).catch(next);
            })();
        });
    }

    // ---------- MIUIX 风格提示 + 进度条 ----------
    var UI = (function () {
        var CSS = [
            '#__pan_helper_ui__{position:fixed;z-index:2147483647;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));',
            'transform:translate(-50%,10px);background:#fff;color:#191919;border-radius:18px;',
            'box-shadow:0 10px 34px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.06);padding:14px 18px 16px;',
            'min-width:240px;max-width:min(88vw,380px);box-sizing:border-box;opacity:0;pointer-events:none;',
            'transition:opacity .2s ease,transform .2s ease;',
            'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}',
            '#__pan_helper_ui__.ph-show{opacity:1;transform:translate(-50%,0)}',
            '#__pan_helper_ui__ .ph-row{display:flex;align-items:center;gap:10px}',
            '#__pan_helper_ui__ .ph-dot{width:8px;height:8px;border-radius:50%;background:#3482ff;flex:0 0 auto;transition:background .2s}',
            '#__pan_helper_ui__ .ph-msg{flex:1 1 auto;font-size:14px;color:#191919;word-break:break-all}',
            '#__pan_helper_ui__ .ph-pct{flex:0 0 auto;font-size:13px;font-weight:600;color:#3482ff;font-variant-numeric:tabular-nums}',
            '#__pan_helper_ui__ .ph-track{margin-top:10px;height:6px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden}',
            '#__pan_helper_ui__ .ph-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#6aa8ff,#3482ff);transition:width .25s ease}',
            '#__pan_helper_ui__.ph-ok .ph-dot{background:#3fc06b}',
            '#__pan_helper_ui__.ph-ok .ph-pct{color:#3fc06b}',
            '#__pan_helper_ui__.ph-ok .ph-fill{background:linear-gradient(90deg,#6fd98f,#3fc06b)}',
            '#__pan_helper_ui__.ph-err .ph-dot{background:#ff4d4f}',
            '#__pan_helper_ui__.ph-err .ph-pct{color:#ff4d4f}',
            '#__pan_helper_ui__.ph-err .ph-fill{background:linear-gradient(90deg,#ff7a7c,#ff4d4f)}',
            '@media (prefers-color-scheme:dark){#__pan_helper_ui__{background:#1f1f1f;color:#e8e8e8;box-shadow:0 10px 34px rgba(0,0,0,.6)}',
            '#__pan_helper_ui__ .ph-msg{color:#e8e8e8}#__pan_helper_ui__ .ph-track{background:rgba(255,255,255,.14)}}',
            '@media (max-width:520px){#__pan_helper_ui__{width:92vw;max-width:92vw;min-width:0;border-radius:16px;bottom:calc(14px + env(safe-area-inset-bottom,0px))}}'
        ].join('');

        var el, msgEl, pctEl, fillEl, hideT;

        function ensure() {
            if (el && el.isConnected) return;
            // 样式只注入一次（UI 若被 React 移除重建，不再重复叠加 style 标签）
            if (!document.getElementById('__pan_helper_style__')) {
                var st = document.createElement('style');
                st.id = '__pan_helper_style__';
                st.textContent = CSS;
                (document.head || document.documentElement).appendChild(st);
            }
            el = document.createElement('div');
            el.id = '__pan_helper_ui__';
            el.innerHTML = '<div class="ph-row"><span class="ph-dot"></span><span class="ph-msg"></span><span class="ph-pct"></span></div>' +
                '<div class="ph-track"><div class="ph-fill"></div></div>';
            (document.body || document.documentElement).appendChild(el);
            msgEl = el.querySelector('.ph-msg');
            pctEl = el.querySelector('.ph-pct');
            fillEl = el.querySelector('.ph-fill');
        }

        function render(msg, pct, state) {
            ensure();
            el.classList.remove('ph-ok', 'ph-err');
            if (state === 'ok') el.classList.add('ph-ok');
            if (state === 'err') el.classList.add('ph-err');
            if (msg != null) msgEl.textContent = msg;
            var p = Math.max(0, Math.min(100, Math.round(pct)));
            fillEl.style.width = p + '%';
            pctEl.textContent = state === 'ok' ? '完成' : (state === 'err' ? '失败' : p + '%');
            el.classList.add('ph-show');
            clearTimeout(hideT);
            try { console.log('[123云盘助手]', msg); } catch (e) {}
        }

        return {
            progress: function (msg, pct) { render(msg, pct, ''); },
            ok: function (msg) { render(msg, 100, 'ok'); hideT = setTimeout(function () { if (el) el.classList.remove('ph-show'); }, 2600); },
            err: function (msg) { render(msg, 100, 'err'); hideT = setTimeout(function () { if (el) el.classList.remove('ph-show'); }, 5000); }
        };
    })();

    // 在 root 下按候选选择器找第一个匹配
    function pickIn(root, sels) {
        for (var i = 0; i < sels.length; i++) {
            var el = root.querySelector(sels[i]);
            if (el) return el;
        }
        return null;
    }

    // 读文件名字符串：优先 aria-label（移动端 .file-name-display 把完整名存在这里），否则取文本
    function readName(el) {
        if (!el) return '';
        var aria = el.getAttribute ? el.getAttribute('aria-label') : '';
        if (aria && aria.trim()) return aria.trim();
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // 找 checkbox 所属的"行"容器：
    //   桌面端 = <tr>；移动端 = 最近的"含文件名、且 checkbox 只有一个"的容器。
    //   限制 checkbox 数量是为了在升到整个列表前停住，避免把工具栏/全选当成文件行。
    function findRow(inp) {
        var tr = inp.closest && inp.closest('tr');
        if (tr && pickIn(tr, CFG.nameSelectors)) return tr;
        var node = inp.parentElement, depth = 0;
        while (node && depth++ < 10) {
            if (node.querySelector) {
                var cbCount = node.querySelectorAll('input[type="checkbox"]').length;
                if (cbCount > 1) break;                                   // 已升到列表层，放弃
                if (pickIn(node, CFG.nameSelectors)) return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    // 读取已勾选的文件名（桌面表格 + 移动列表通用）
    function getSelectedFileNames() {
        var names = [];
        Array.prototype.forEach.call(document.querySelectorAll('input[type="checkbox"]'), function (inp) {
            if (!inp.checked) return;
            var row = findRow(inp);
            var nm = readName(row ? pickIn(row, CFG.nameSelectors) : null);
            if (nm && names.indexOf(nm) === -1) names.push(nm);
        });
        return names;
    }

    // 递归抓取分享目录树 -> 文件名映射（接口路径多候选）
    // wanted：需要的文件名数组。找齐后立即停止递归，避免大分享白跑一堆请求。
    function fetchShareFileMap(wanted) {
        var map = {};
        var remaining = wanted ? wanted.slice() : null;
        var shareKey = getShareKey();
        if (!shareKey) return Promise.resolve(map);

        function buildUrl(base, parentId) {
            return base + (base.indexOf('?') === -1 ? '?' : '&') +
                'limit=100&next=-1&orderBy=file_name&orderDirection=asc&shareKey=' + encodeURIComponent(shareKey) +
                '&ParentFileId=' + parentId + '&Page=1&event=homeListFile&operateType=4&OrderId=&superAdmin=null';
        }
        function allFound() { return remaining && remaining.length === 0; }

        function walk(parentId) {
            if (allFound()) return Promise.resolve();
            return tryPaths(CFG.paths.shareList, function (p) { return buildUrl(p, parentId); })
                .then(function (res) {
                    var list = pickList(res.json && res.json.data);
                    var subs = [];
                    list.forEach(function (f) {
                        var name = f.FileName || f.fileName || f.name;
                        if (!name) return;
                        var type = f.Type != null ? f.Type : f.type;
                        if (type === 0) {
                            map[name] = f;                    // 文件
                            if (remaining) {
                                var idx = remaining.indexOf(name);
                                if (idx !== -1) remaining.splice(idx, 1);
                            }
                        } else {
                            subs.push(f.FileId != null ? f.FileId : f.fileID);   // 文件夹
                        }
                    });
                    if (allFound()) return;                   // 找齐了，不再深入
                    return Promise.all(subs.map(walk));
                })
                .catch(function () {});
        }
        return walk(0).then(function () { return map; });
    }

    // 保存到目标文件夹（接口路径多候选）
    function apiSave(files, folderId) {
        var body = {
            fileList: files.map(function (f) {
                return {
                    fileID: f.FileId != null ? f.FileId : f.fileID,
                    size: f.Size != null ? f.Size : f.size,
                    etag: f.Etag || f.etag,
                    type: 0,
                    parentFileID: folderId,
                    fileName: f.FileName || f.fileName || f.name,
                    driveID: 0
                };
            }),
            shareKey: getShareKey(),
            sharePwd: null,
            currentLevel: 1,
            superAdmin: null
        };
        return tryPaths(CFG.paths.save, null, function () {
            return { method: 'POST', credentials: 'include', headers: authHeaders(CFG.appVersion.share, true), body: JSON.stringify(body) };
        }).then(function (res) { return res.json; });
    }

    // 轮询保存任务：status 2=完成，3/-1=失败；有 progress 就回报进度
    function apiWaitTask(taskID, onProgress) {
        return new Promise(function (resolve) {
            var tries = 0;
            (function poll() {
                if (tries++ > 120) { resolve(false); return; }
                tryPaths(CFG.paths.saveGet, function (p) {
                    return p + (p.indexOf('?') === -1 ? '?' : '&') + 'taskID=' + encodeURIComponent(taskID);
                }, function () {
                    return { credentials: 'include', headers: authHeaders(CFG.appVersion.share) };
                }).then(function (res) {
                    var d = res.json && res.json.data;
                    var st = d && d.status;
                    if (onProgress && d) {
                        var pr = parseFloat(d.progress);
                        if (!isNaN(pr)) onProgress(pr > 1 ? pr : pr * 100);
                        else if (d.currentCount && d.totalCount) onProgress((d.currentCount / d.totalCount) * 100);
                    }
                    if (st === 2) resolve(true);
                    else if (st === 3 || st === -1) resolve(false);
                    else setTimeout(poll, 700);
                }).catch(function () { setTimeout(poll, 1000); });
            })();
        });
    }

    // 列出网盘文件夹（接口路径多候选）
    function apiListFolder(folderId) {
        return tryPaths(CFG.paths.driveList, function (base) {
            return base + (base.indexOf('?') === -1 ? '?' : '&') +
                'driveId=0&limit=100&next=0&orderBy=update_time&orderDirection=desc&parentFileId=' + folderId +
                '&trashed=false&Page=1&OnlyLookAbnormalFile=0&event=homeListFile&operateType=1&inDirectSpace=false&fileCategory=0&isSearchOrder=false';
        }, function () {
            return { credentials: 'include', headers: authHeaders(CFG.appVersion.drive) };
        }).then(function (res) { return pickList(res.json && res.json.data); });
    }

    // 取网盘文件下载直链（接口路径多候选）
    function apiGetDownloadUrl(f) {
        var body = {
            fileId: f.FileId != null ? f.FileId : f.fileId,
            driveId: 0,
            size: f.Size != null ? f.Size : f.size,
            type: f.Type != null ? f.Type : (f.type || 0),
            etag: f.Etag || f.etag,
            fileName: f.FileName || f.fileName,
            s3keyFlag: f.S3KeyFlag || f.s3keyFlag,
            fileType: f.ContentType != null ? f.ContentType : f.contentType
        };
        return tryPaths(CFG.paths.downloadInfo, null, function () {
            return { method: 'POST', credentials: 'include', headers: authHeaders(CFG.appVersion.drive, true), body: JSON.stringify(body) };
        }).then(function (res) {
            var d = res.json && res.json.data;
            return d && (d.DownloadUrl || d.downloadUrl || d.Url);
        });
    }

    // 触发浏览器下载
    // 重要：123云盘返回的 DownloadUrl 是"下载中转页"（web-pro2.123952.com/download-v2/?params=...），
    // 它内部会 decodeURI(atob(params)) 解出真实直链、再 click 一个 <a> 触发下载，
    // 并用 window.parent.postMessage 上报状态——说明它天生就该跑在 iframe 里。
    // 若直接用 <a> 点击，浏览器会把"当前页"导航到中转页 → 用户看到空白页。
    // 所以这里用隐藏 iframe 加载，当前页完全不受影响。
    function triggerDownload(url) {
        var f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true');
        f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
        f.src = url;
        (document.body || document.documentElement).appendChild(f);
        // 真实下载由中转页在 iframe 内触发；稍后回收 iframe
        setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 180000);
    }

    // 主流程：准备 → 保存到网盘 → 取直链 → 逐个触发下载（带进度）
    function saveToDriveAndDownload() {
        if (!CFG.enabled) { UI.err('功能已关闭'); return; }
        var folderId = CFG.targetFolderId;
        if (!folderId) { UI.err('未配置目标文件夹 ID'); return; }

        var names = getSelectedFileNames();
        if (!names.length) { UI.err('请先勾选要下载的文件'); return; }

        UI.progress('准备中…（' + names.length + ' 个文件）', 4);

        fetchShareFileMap(names).then(function (map) {
            var files = names.map(function (n) { return map[n]; }).filter(Boolean);
            if (!files.length) { UI.err('未匹配到文件信息，请刷新页面重试'); return; }

            UI.progress('正在保存到网盘…', 12);
            return apiSave(files, folderId).then(function (j) {
                if (!j || j.code !== 0) { UI.err('保存失败：' + ((j && j.message) || '未知错误')); return; }
                var taskID = j.data && j.data.taskID;
                return apiWaitTask(taskID, function (pct) {
                    UI.progress('正在保存到网盘…', 12 + Math.max(0, Math.min(1, pct / 100)) * 48);
                }).then(function (ok) {
                    if (!ok) { UI.err('保存超时或失败，请稍后重试'); return; }
                    UI.progress('保存完成，正在获取下载直链…', 65);
                    return apiListFolder(folderId).then(function (list) {
                        var byName = {};
                        list.forEach(function (f) {
                            var nm = f.FileName || f.fileName || f.name;
                            if (nm) byName[nm] = f;
                        });
                        var i = 0;
                        (function next() {
                            if (i >= files.length) { UI.ok('已触发 ' + files.length + ' 个下载'); return; }
                            var src = files[i++];
                            var srcName = src.FileName || src.fileName || src.name;
                            var saved = byName[srcName];
                            UI.progress('获取直链并下载…（' + i + '/' + files.length + '）', 65 + (i / files.length) * 33);
                            if (!saved) { setTimeout(next, 300); return; }
                            apiGetDownloadUrl(saved).then(function (u) {
                                if (u) triggerDownload(u);
                                setTimeout(next, 1500);
                            }).catch(function () { setTimeout(next, 600); });
                        })();
                    });
                });
            });
        }).catch(function (e) { UI.err('出错：' + ((e && e.message) || e)); });
    }

    // ---------- 启动：首次全量清理 + 监听 DOM 变化做增量清理 ----------

    clean();   // 首次全量扫一遍

    // rAF 节流 + 增量扫描：
    //   - 同一帧内多次 DOM 变化只清理一次；
    //   - 只把"本次新增的节点"交给 clean()，避免每次都全页扫描（大页面下这是主要开销）；
    //   - try/catch 兜底，清理异常不会影响页面本身。
    var cleanScheduled = false;
    var pendingRoots = [];
    new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                if (added[j].nodeType === 1) pendingRoots.push(added[j]);
            }
        }
        if (cleanScheduled) return;
        cleanScheduled = true;
        requestAnimationFrame(function () {
            cleanScheduled = false;
            var roots = pendingRoots;
            pendingRoots = [];
            try { clean(roots); } catch (e) { /* 单次清理失败不影响页面 */ }
        });
    }).observe(document.body, { childList: true, subtree: true });
})();
