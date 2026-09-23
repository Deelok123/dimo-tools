// ==UserScript==
// @name         网页净化与跳转防护
// @namespace    https://greasyfork.org/users/452911
// @version      2.7.0
// @license      MIT
// @description  轻量网页净化：主流站点默认完整旁路、可按站点解除；普通站点拦截广告脚本并防护异源跳转。智能检测与 UA 伪装均按站点开关，MIUI 风格设置界面可管理关键词、拦截日志与各类站点名单。
// @match        http*://*/*
// @exclude      *://greasyfork.org/*
// @exclude      *://*.greasyfork.org/*
// @exclude      *://scriptcat.org/*
// @exclude      *://*.scriptcat.org/*
// 下面这批是最主流的大站，直接排除掉：脚本在这些站完全不注入，零开销。
// 代价是这些站没有菜单入口、也不能加进「强制运行」。没列到的站点仍由
// 脚本内置的运行时旁路表兜底（名单在脚本里的 MAINSTREAM_BYPASS_KEYWORDS）。
// @exclude      *://*.google.com/*
// @exclude      *://*.youtube.com/*
// @exclude      *://*.bing.com/*
// @exclude      *://*.baidu.com/*
// @exclude      *://*.bilibili.com/*
// @exclude      *://*.douyin.com/*
// @exclude      *://*.kuaishou.com/*
// @exclude      *://*.qq.com/*
// @exclude      *://*.weibo.com/*
// @exclude      *://*.zhihu.com/*
// @exclude      *://*.xiaohongshu.com/*
// @exclude      *://*.x.com/*
// @exclude      *://*.twitter.com/*
// @exclude      *://*.facebook.com/*
// @exclude      *://*.instagram.com/*
// @exclude      *://*.reddit.com/*
// @exclude      *://*.linkedin.com/*
// @exclude      *://*.discord.com/*
// @exclude      *://*.telegram.org/*
// @exclude      *://*.taobao.com/*
// @exclude      *://*.tmall.com/*
// @exclude      *://*.jd.com/*
// @exclude      *://*.pinduoduo.com/*
// @exclude      *://*.amazon.com/*
// @exclude      *://*.github.com/*
// @exclude      *://*.stackoverflow.com/*
// @exclude      *://*.csdn.net/*
// @exclude      *://*.gitee.com/*
// @exclude      *://*.juejin.cn/*
// @exclude      *://*.wikipedia.org/*
// @exclude      *://*.163.com/*
// @exclude      *://*.sina.com.cn/*
// @exclude      *://*.sohu.com/*
// @exclude      *://*.microsoft.com/*
// @exclude      *://*.apple.com/*
// @exclude      *://*.notion.so/*
// @exclude      *://*.openai.com/*
// @exclude      *://*.anthropic.com/*
// @exclude      *://*.netflix.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const hostWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const doc = hostWindow.document;
    const HOST = hostWindow.location.hostname;

    // ============================================================
    // 共享存储键：沿用两个原脚本的键名，便于迁移原有配置
    // ============================================================
    const KEY = {
        keywords: 'removeAdScriptsKeywords',
        excludeSites: 'excludeSites',
        totalRemoved: 'totalRemovedCount',
        spoofUAList: 'spoofUASites',
        redirectEnabled: `enabled_${HOST}`,
        redirectBlack: 'global_so_black_list',
        redirectWhite: 'global_xo_white_list',
        mainstreamForceRun: 'forceRunMainstreamSites',
        forcedRedirectSites: 'forcedRedirectSites',
        smartDetectOffSites: 'smartDetectOffSites'
    };

    const getDefaultKeywords = () => [
        'htmlAds', '_ffc1();', '_ffc2();', '_ffc3();', '_ffc4();', '_ffp();',
        'kbbaidu1();', 'kbbaidu2();', 'kbbaidu3();', 'html5player.checkVideoAds',
        'ads_codes', '{return void 0!==b[a]?b[a]:a}).join("")}', '${scripts[randomIndex]}',
        '${scripts[Math.random()', '"https://"+Date.parse(new Date())+', '"https://"+(new Date().getDate())+',
        'https://hongosi.xn--', 'https://{randomstr}.', 'new Function(t)()', 'new Function(b)()',
        'new Function(c)()', 'new Function(t);', 'new Function(b);', 'new Function(c);',
        'new Function(\'d\',e)', 'new Function(document[', 'new Function(function(p,a,c,k,e,d)',
        'function a(a){', 'function b(b){', 'function c(c){', 'function updateCarousel()',
        'Math.floor(2147483648 * Math.random());', 'Math.floor(Math.random()*url.length)',
        'Math.floor(Math.random() * urls.length)', 'new Date()[\'getTime\']()', 'newDate=new window',
        'Math.floor(((new Date()).getTime()', '&&navigator[', '=navigator;', 'navigator.platform){setTimeout(function',
        'disableDebugger', 'blockDeveloperTools', '["Date"]())[\'getTime\']()', 'display:block;width:9.6vw;',
        '</\'+\'s\'+\'c\'+\'ri\'+\'pt\'>\');', 'class=\\"zdhf\\"', '(\'#htmlContenthtml\').html',
        'D.createElement(\'span\');', 'class=\\"app_tj\\"', 'window.$m(', 'jsjiami.com.v4',
        'histats.com', 'hm.baidu.com', 'adbyunion', '{win:false,mac:false,xll:false}',
        'mainCell:".bd",effect:"leftLoop"', '/invoke.js">', 'function|getDate',
        'parseInt(Math[\'random\']', 'pc.stgowan.com'
    ];

    const getTrackingKeySet = (() => {
        let cache = null;
        return () => {
            if (cache) return cache;
            const keys = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'gclid', 'fbclid', 'msclkid', 'dclid', 'mc_eid', 'ref', 'source', 'medium',
        'campaign', 'aff_id', 'click_id', 'sid', 'track_id', 'tid', 'spm', 'scm',
        'tracking', 'trk', 'mc_cid', 'oly_anon_id', 'oly_enc_id', '_ga', '_gl',
                'yclid', 'wickedid', 'igshid'
            ];
            cache = new Set(keys.map(k => k.toLowerCase()));
            return cache;
        };
    })();

    // ============================================================
    // 配置分层加载
    //
    // 第一阶段只读取“是否旁路主流站点”和“强制运行列表”。
    // 主流站点命中且没有强制运行时，后续所有广告拦截 / UA / 跳转 /
    // 智能检测配置都不读取，真正做到轻量旁路。
    // 进入设置界面时再按需加载完整配置。
    // ============================================================
    const readValue = (key, fallback) => {
        try { return GM_getValue(key, fallback); } catch (_) { return fallback; }
    };
    const readArray = (key) => {
        const value = readValue(key, []);
        return Array.isArray(value) ? value : [];
    };

    // 主流站点旁路固定开启；仅允许通过“强制运行列表”对单个站点解除旁路。
    let mainstreamForceRun = readArray(KEY.mainstreamForceRun);
    let runtimeConfigLoaded = false;

    let totalRemoved = 0;
    let keywords = [];
    let excludeList = [];
    // UA 伪装按站点开关：这里存放已开启伪装的站点（沿用旧键名，保留原有配置）。
    let spoofUAList = [];
    let redirectEnabled = false;
    let forcedRedirectSites = [];
    let redirectBlackList = [];
    let redirectWhiteList = [];
    // 智能检测按站点开关：这里存放“已关闭智能检测”的站点，当前站点在名单里就关闭。
    let smartDetectOffSites = [];
    let autoContentRedirect = true;

    function normalizeManagedHost(value) {
        let host = String(value || '').trim().toLowerCase();
        if (!host) return '';
        host = host.replace(/^https?:\/\//i, '');
        host = host.split('/')[0].split('?')[0].split('#')[0];
        host = host.replace(/^\.+|\.+$/g, '');
        // 管理列表只接受主机名，不保存端口。
        host = host.split(':')[0];
        return host;
    }

    function loadRuntimeConfig() {
        if (runtimeConfigLoaded) return;
        totalRemoved = Number(readValue(KEY.totalRemoved, 0)) || 0;
        keywords = readArray(KEY.keywords);
        excludeList = readArray(KEY.excludeSites);
        spoofUAList = Array.from(new Set(
            readArray(KEY.spoofUAList).map(normalizeManagedHost).filter(Boolean)
        ));

        // “本站强制拦截”改为统一站点列表管理。兼容旧版 enabled_<hostname> 数据并自动迁移。
        forcedRedirectSites = readArray(KEY.forcedRedirectSites)
            .map(normalizeManagedHost)
            .filter(Boolean);
        try {
            const keys = GM_listValues();
            for (const key of keys) {
                if (!key.startsWith('enabled_')) continue;
                const host = normalizeManagedHost(key.slice('enabled_'.length));
                if (!host || !readValue(key, false)) continue;
                if (!forcedRedirectSites.includes(host)) forcedRedirectSites.push(host);
            }
        } catch (_) {}
        forcedRedirectSites = Array.from(new Set(forcedRedirectSites));
        try { GM_setValue(KEY.forcedRedirectSites, forcedRedirectSites); } catch (_) {}
        redirectEnabled = forcedRedirectSites.includes(HOST);

        redirectBlackList = readArray(KEY.redirectBlack);
        redirectWhiteList = readArray(KEY.redirectWhite);
        // 智能检测默认对所有站点开启，只按站点豁免。
        smartDetectOffSites = Array.from(new Set(
            readArray(KEY.smartDetectOffSites).map(normalizeManagedHost).filter(Boolean)
        ));
        autoContentRedirect = !smartDetectOffSites.includes(HOST);
        runtimeConfigLoaded = true;
    }

    // ============================================================
    // 主流站点旁路：使用“明确域名片段”匹配
    //
    // 不再使用 startsWith / includes 这类宽松匹配。
    // 每个条目都代表一个明确的品牌域名标签或完整域名后缀，例如：
    //   google            -> google.com / accounts.google.com
    //   googleapis        -> googleapis.com / *.googleapis.com
    //   googleusercontent -> googleusercontent.com / *.googleusercontent.com
    //   googlevideo       -> googlevideo.com / *.googlevideo.com
    //   x.com             -> x.com / *.x.com
    //
    // 运行期只检查 hostname 的标签和后缀，绝不扫描 path/query/hash。
    // ============================================================
    const MAINSTREAM_BYPASS_KEYWORDS = new Set([
        // 搜索 / 门户
        'google','googleapis','googleusercontent','googlevideo','gstatic','googleadservices',
        'bing','bingapis','yahoo','baidu','sogou','haosou','yisou','360.cn','sm.cn','yandex','duckduckgo','brave','naver',
        // 视频 / 流媒体
        'youtube','ytimg','youtu.be','bilibili','douyin','tiktok','tiktokcdn','kuaishou','ixigua','iqiyi','youku','mgtv','pptv','v.qq','tencentvideo','acfun','nicovideo','netflix','nflxvideo.net','disneyplus','primevideo','hulu','twitch','dailymotion',
        // 社交 / 社区 / 内容平台
        'facebook','fbcdn','instagram','threads','twitter','x.com','twimg','reddit','redd.it','linkedin','pinterest','weibo','zhihu','xiaohongshu','douban','tieba.baidu','v2ex','juejin','segmentfault','quora','vk.ru','discord','discordapp','telegram','line.me','whatsapp','pixiv','pximg','note.com','ameblo','livedoor','hatenablog',
        // 技术 / 数码 / 内容社区
        'csdn','gitee','cnblogs','oschina','51cto','ithome','sspai','36kr','ifanr','geekpark','smzdm',
        // AI / 办公 / 开发
        'chatgpt','openai','claude','anthropic','gemini','perplexity','copilot','github','githubusercontent','githubassets','gitlab','gitlab-static','bitbucket','stackoverflow','stackprinter','npmjs','npmjs.org','pypi','huggingface','sourceforge','codeberg','docs.rs','crates.io','docker','docker.io','kaggle','notion','figma','canva','miro','slack','zoom','webex','office','microsoft','microsoftonline','live.com','outlook','onedrive','sharepoint','dropbox','box.com','icloud','apple','adobe','atlassian','trello','salesforce','hubspot',
        // 电商 / 支付 / 本地生活
        'amazon','amazonaws','ebay','aliexpress','temu','walmart','etsy','taobao','tmall','jd.com','pinduoduo','yangkeduo','suning','gome','1688','vip.com','dangdang','meituan','ele.me','dianping','ctrip','trip.com','booking','agoda','expedia','airbnb','rakuten','mercari','paypal',
        // 新闻 / 百科 / 知识
        'wikipedia','wikimedia','thepaper','163.com','netease','sina','sohu','ifeng','people.com.cn','xinhuanet','cctv','bbc','cnn','nytimes','reuters','bloomberg','wsj','theguardian','forbes',
        // 地图 / 出行
        'amap','gaode','openstreetmap','uber','didi','didiglobal','lyft',
        // 云服务 / 网盘 / 在线工具
        'aws','azure','aliyun','alibabacloud','huaweicloud','cloudflare','vercel','netlify','render.com','heroku','railway.app','supabase','mega','mediafire','pcloud','wetransfer','transfer.sh',
        // 游戏 / 娱乐 / 商店
        'steam','steampowered','steamcommunity','epicgames','epicgamescdn','roblox','minecraft','ea.com','blizzard','playstation','xbox','nintendo',
        // 教育 / 论文 / 资料
        'coursera','edx','khanacademy','udemy','arxiv','researchgate','jstor',
        // 日本常用主流站点
        'weathernews.jp','cookpad','goo.ne.jp'
    ]);

    // 启动阶段一次性拆分规则，避免每次判断都遍历完整关键词数组。
    // labelSet：精确匹配 hostname 的某个标签，例如 google / youtube / github。
    // suffixSet：精确匹配完整域名后缀，例如 x.com / tieba.baidu / google.co.jp。
    const MAINSTREAM_LABEL_SET = new Set();
    const MAINSTREAM_SUFFIX_SET = new Set();
    for (const rawKeyword of MAINSTREAM_BYPASS_KEYWORDS) {
        const k = String(rawKeyword || '').toLowerCase().replace(/^\.+|\.+$/g, '');
        if (!k) continue;
        if (k.includes('.')) MAINSTREAM_SUFFIX_SET.add(k);
        else MAINSTREAM_LABEL_SET.add(k);
    }

    function isBuiltInMainstreamSite(hostname = HOST) {
        const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
        if (!h) return false;

        const labels = h.split('.');

        // 先做最便宜的“单标签精确匹配”。通常主流站点在这里就能命中。
        for (const label of labels) {
            if (MAINSTREAM_LABEL_SET.has(label)) return true;
        }

        // 再检查明确的域名后缀，最多按 hostname 标签数执行几次 Set.has。
        for (let i = 0; i < labels.length; i++) {
            const suffix = labels.slice(i).join('.');
            if (MAINSTREAM_SUFFIX_SET.has(suffix)) return true;
        }

        return false;
    }

    // 用户手动强制运行仍使用精确域名 / 子域名匹配，避免误取消旁路。
    function hostMatchesDomain(hostname, domain) {
        const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
        const d = String(domain || '').toLowerCase().replace(/^\.+|\.+$/g, '');
        return !!d && (h === d || h.endsWith('.' + d));
    }

    function isForceRunMainstreamSite(hostname = HOST) {
        return mainstreamForceRun.some(domain => hostMatchesDomain(hostname, domain));
    }

    const MAINSTREAM_BYPASS_ACTIVE = isBuiltInMainstreamSite(HOST) && !isForceRunMainstreamSite(HOST);

    // 主流站点直接旁路：后面的 Observer / 跳转钩子 / 智能检测 / UA 修改均不启动。
    // 只保留菜单注册能力，让用户可以进入设置并将当前网站加入“强制运行”。

    // ============================================================
    // 性能缓存 / 运行态
    // ============================================================
    let keywordCache = null;
    let redirectRuleCache = null;
    const removedScriptsInfo = [];
    let uiHost = null;
    let uiShadow = null;
    let uiModalOpen = false;
    // 关闭设置后的输入宽限期。触摸设备在 pointerup 之后就执行了 handler，
    // 关闭型按钮会在这里把遮罩移除、拦截器卸载；浏览器随后才补发那一次 click，
    // 若此时不再拦截，它就会落到面板底下的网页元素上（点按钮漏到网站）。
    let modalCloseGuardUntil = 0;
    let modalCloseGuardTimer = 0;
    let pageScrollLock = null;
    let uiPageStack = [];
    let uaApplied = false;
    let redirectHooksInstalled = false;
    let autoRedirectActive = false;
    let autoRedirectReason = '';
    let contentDetectTimer = 0;
    let contentDetectDone = false;
    let contentDetectAttempts = 0;
    let pendingRemovedCount = 0;
    let removeCountFlushTimer = 0;
    let uiBlockerCleanups = [];
    let earlyContentChecked = false;
    let earlyContentMatched = false;

    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));

    const saveKeywords = () => GM_setValue(KEY.keywords, keywords);
    const saveExcludeList = () => GM_setValue(KEY.excludeSites, excludeList);
    const saveMainstreamForceRun = () => GM_setValue(KEY.mainstreamForceRun, mainstreamForceRun);
    const saveForcedRedirectSites = () => GM_setValue(KEY.forcedRedirectSites, forcedRedirectSites);
    const saveSmartDetectOffSites = () => GM_setValue(KEY.smartDetectOffSites, smartDetectOffSites);
    const saveSpoofUAList = () => GM_setValue(KEY.spoofUAList, spoofUAList);
    const saveRedirectLists = () => {
        GM_setValue(KEY.redirectBlack, redirectBlackList);
        GM_setValue(KEY.redirectWhite, redirectWhiteList);
        redirectRuleCache = null;
    };

    function getKeywordsForCurrentSite() {
        const siteKeywords = keywords
            .filter(k => typeof k === 'string' && k.startsWith(HOST + ':'))
            .map(k => k.slice(HOST.length + 1));
        return siteKeywords.length ? siteKeywords : getDefaultKeywords();
    }

    // 从一个已编译的关键词正则里抽出一段「必须原样出现」的字面量。
    // 正则里的灵活空白是 [\s\n\r]* 和 \s*，按它们切开之后，每一段都必须在
    // 被检测内容里原样出现，所以取最长的那段作为锚点是安全的必要条件 ——
    // 锚点没命中就一定不会匹配，可以先跳过这条正则。
    function extractLiteralAnchor(pattern) {
        const parts = String(pattern).split(/\[\\s\\n\\r\]\*|\\s\*/);
        let best = '';
        for (const part of parts) {
            const literal = part.replace(/\\(.)/g, '$1');
            if (literal.length > best.length) best = literal;
        }
        // 太短的锚点（比如 "a" 或 "("）没有筛选价值，返回空表示不做预筛。
        return best.length >= 3 ? best : '';
    }

    function compileKeywordCache() {
        if (keywordCache) return keywordCache;
        const rawKeywords = getKeywordsForCurrentSite();
        const regexes = [];
        const anchors = [];
        for (const keyword of rawKeywords) {
            try {
                let pattern = String(keyword)
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\ /g, '[\\s\\n\\r]*')
                    .replace(/ /g, '[\\s\\n\\r]*')
                    .replace(/\\\)\\\{/g, '\\s*\\)\\s*\\{')
                    .replace(/\\\)\\\;/g, '\\s*\\)\\s*\\;');
                const regex = new RegExp(pattern);
                const anchor = extractLiteralAnchor(pattern);
                regexes.push(regex);
                anchors.push(anchor);
            } catch (_) {
                // 非法关键词只跳过，不影响整个脚本。
            }
        }
        keywordCache = { rawKeywords, regexes, anchors };
        return keywordCache;
    }

    function flushRemovedCount() {
        if (!pendingRemovedCount) return;
        totalRemoved += pendingRemovedCount;
        pendingRemovedCount = 0;
        removeCountFlushTimer = 0;
        try { GM_setValue(KEY.totalRemoved, totalRemoved); } catch (_) {}
    }

    function updateCount(delta) {
        pendingRemovedCount += delta;
        if (removeCountFlushTimer) return;
        // 合并多个移除操作，避免每删除一个脚本就写一次 GM 存储。
        removeCountFlushTimer = setTimeout(flushRemovedCount, 1000);
    }

    function matchAdScript(content) {
        if (!content) return null;
        const cache = compileKeywordCache();
        const { regexes, anchors, rawKeywords } = cache;
        for (let i = 0; i < regexes.length; i++) {
            // 先用锚点做一次廉价的包含判断，锚点没命中就直接跳到下一条，
            // 省掉这一次正则扫描 —— 绝大多数正常脚本都会被这一步筛掉。
            const anchor = anchors[i];
            if (anchor && content.indexOf(anchor) === -1) continue;
            if (regexes[i].test(content)) return rawKeywords[i];
        }
        return null;
    }

    function removeScriptNode(script) {
        if (!script || script.nodeType !== 1 || script.tagName !== 'SCRIPT') return;
        if (excludeList.includes(HOST)) return;

        const content = script.textContent || script.innerHTML || '';
        if (!content) return;

        const matched = matchAdScript(content);
        if (!matched) return;

        // 日志只留摘要：长页面会不断累积，整段脚本长期驻留内存不值得。
        // 展示时另有 8000 字截断，这里留 20000 是为了够用。
        if (removedScriptsInfo.length < 200) {
            removedScriptsInfo.push({ keywords: [matched], content: content.slice(0, 20000) });
        }
        // 先阻止可能尚未执行的脚本，再移除节点。
        try { script.type = 'text/plain'; } catch (_) {}
        try { script.textContent = ''; } catch (_) {}
        try { script.remove(); } catch (_) {
            if (script.parentNode) script.parentNode.removeChild(script);
        }
        updateCount(1);
    }

    function scanExistingScripts() {
        if (excludeList.includes(HOST)) return;
        const scripts = doc.scripts || doc.querySelectorAll('script');
        for (let i = 0; i < scripts.length; i++) removeScriptNode(scripts[i]);
    }

    // ============================================================
    // 异源跳转规则：预编译规则，避免每次点击都创建 RegExp
    // ============================================================
    function escapeRegex(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function compileRedirectRules() {
        const cache = { full: [], path: [], contain: [], white: [] };
        for (const ruleRaw of redirectBlackList) {
            const rule = String(ruleRaw || '').trim();
            if (!rule) continue;
            try {
                const regex = new RegExp('^' + rule.split('*').map(escapeRegex).join('.*') + (rule.startsWith('http://') || rule.startsWith('https://') ? '$' : ''), 'i');
                if (/^https?:\/\//i.test(rule)) cache.full.push(regex);
                else if (rule.startsWith('/')) cache.path.push(regex);
                else cache.contain.push(regex);
            } catch (_) {}
        }
        cache.white = redirectWhiteList
            .map(d => String(d || '').trim().toLowerCase())
            .filter(Boolean);
        cache.whiteSet = new Set(cache.white);
        redirectRuleCache = cache;
        return cache;
    }


    // ============================================================
    // 智能内容页识别
    // 只在 URL/标题/少量正文出现明显“小说/视频/章节/集数”等特征时开启异源拦截。
    // 默认启用，但不会因为普通页面出现一个“视频”字样就立刻触发。
    // ============================================================
    const CONTENT_STRONG_RE = /(?:第\s*[0-9０-９一二三四五六七八九十百千万两零]+\s*(?:章|集|节|回|话)|下一章|上一章|下一集|上一集|在线(?:观看|阅读)|在线播放|播放页|正文|章节目录|小说目录|视频目录|视频播放|小说阅读|漫画阅读|连载中|集数|护眼模式|关灯模式|阅读模式|沉浸阅读|章节列表|目录列表)/i;
    const CONTENT_MEDIUM_RE = /(?:小说|网文|小说网|漫画|视频|影片|电影|电视剧|动漫|番剧|阅读|阅读器|播放|章节|章节目录|目录|集数|观看|连载|护眼|关灯|夜间模式|VOD|episode|chapter|novel|manga|anime|video|watch|play)/i;
    const CONTENT_URL_RE = /(?:小说|网文|novel|book|read|chapter|章节|目录|video|videos|play|player|watch|vod|episode|episodes|anime|manga|comic|电影|电视剧|动漫|番剧|视频|播放|阅读|护眼|关灯)/i;
    const CONTENT_UI_HINT_RE = /(?:护眼模式|关灯模式|阅读模式|沉浸阅读|章节目录|小说目录|视频目录|目录列表|上一章|下一章|上一集|下一集)/i;

    function isRedirectActive() {
        return redirectEnabled || autoRedirectActive;
    }

    // 按文档序采集文本，累计到 limit 就停。结果等价于 node.textContent.slice(0, limit)，
    // 但不用先把整棵子树序列化成一个完整字符串 —— 大页面上那一次序列化要几十毫秒，
    // 而且这段代码在「首次点击」时是同步跑的。
    function collectTextUpTo(node, limit) {
        let out = '';
        const walk = (n) => {
            // 文本节点和 CDATA 都是 textContent 会拼接的内容
            if (n.nodeType === 3 || n.nodeType === 4) {
                out += n.nodeValue || '';
                return;
            }
            if (n.nodeType !== 1 && n.nodeType !== 9 && n.nodeType !== 11) return;
            for (let child = n.firstChild; child && out.length < limit; child = child.nextSibling) walk(child);
        };
        walk(node);
        return out.length > limit ? out.slice(0, limit) : out;
    }

    function getContentScore() {
        let score = 0;
        let strong = false;
        const href = String(hostWindow.location.href || '');
        const pathAndQuery = String(hostWindow.location.pathname || '') + ' ' + String(hostWindow.location.search || '');
        const title = String(doc.title || '');

        if (CONTENT_URL_RE.test(pathAndQuery)) score += 2;
        if (CONTENT_STRONG_RE.test(href) || CONTENT_STRONG_RE.test(title)) {
            score += 3;
            strong = true;
        } else if (CONTENT_MEDIUM_RE.test(title)) {
            score += 2;
        }

        // 正文只取前 9000 个字符；优先读取 article/main，避免大型页面全量扫描。
        if (score < 3 && doc.body) {
            const root = doc.querySelector('main,article,[role="main"]') || doc.body;
            const text = collectTextUpTo(root, 9000);
            if (CONTENT_STRONG_RE.test(text)) {
                score += 3;
                strong = true;
            }
            const matches = text.match(/(?:小说|网文|漫画|视频|电影|电视剧|动漫|番剧|阅读|播放|章节|目录|集数|连载|观看|护眼|关灯|夜间模式)/gi);
            if (matches) {
                score += Math.min(2, new Set(matches.map(x => x.toLowerCase())).size);
            }
            if (CONTENT_UI_HINT_RE.test(text) && CONTENT_MEDIUM_RE.test(text)) {
                score += 2;
            }
        }

        return { score, strong };
    }

    function activateAutoRedirect(reason) {
        if (!autoContentRedirect || autoRedirectActive) return false;
        autoRedirectActive = true;
        autoRedirectReason = reason || '检测到内容页特征';
        initRedirectInterception();
        try { configureMutationObserver(); } catch (_) {}
        return true;
    }

    function detectContentPage(reason) {
        if (!autoContentRedirect || autoRedirectActive || contentDetectDone) return;
        if (doc.readyState === 'loading' || !doc.body) {
            scheduleContentDetection(600, '等待正文加载');
            return;
        }
        contentDetectAttempts++;
        const result = getContentScore();
        if (result.score >= 3 || result.strong) {
            contentDetectDone = true;
            activateAutoRedirect(reason || '内容页关键词');
            return;
        }
        // SPA/懒加载页面最多再检查 3 次，每次间隔递增，避免持续占用主线程。
        if (contentDetectAttempts < 4) {
            scheduleContentDetection(700 * contentDetectAttempts, '等待动态内容');
        } else {
            contentDetectDone = true;
        }
    }

    function scheduleContentDetection(delay = 900, reason = '延迟检测') {
        if (!autoContentRedirect || autoRedirectActive || contentDetectDone || contentDetectTimer) return;
        contentDetectTimer = setTimeout(() => {
            contentDetectTimer = 0;
            detectContentPage(reason);
        }, delay);
    }

    function isBlocked(url) {
        if (!isRedirectActive() || !url || typeof url !== 'string' || /^(javascript|data|about|blob|#):/i.test(url)) return false;
        try {
            const target = new URL(url, hostWindow.location.href);
            const cache = redirectRuleCache || compileRedirectRules();
            if (target.hostname === HOST) {
                const targetUrl = target.href;
                const targetPath = target.pathname + target.search;
                if (cache.full.some(re => re.test(targetUrl))) return true;
                if (cache.path.some(re => re.test(targetPath))) return true;
                if (cache.contain.some(re => re.test(targetUrl))) return true;
                return false;
            }
            const targetHost = target.hostname.toLowerCase();
            return !cache.white.some(domain => targetHost === domain || targetHost.endsWith('.' + domain));
        } catch (_) {
            return false;
        }
    }

    function cleanTrackingParams(url) {
        if (typeof url !== 'string' || url.charAt(0) === '#') return url;
        // 没有查询参数时，直接返回，减少 URL 构造开销。
        const q = url.indexOf('?');
        if (q === -1) return url;

        try {
            const u = new URL(url, hostWindow.location.origin);
            if (!u.search) return url;
            let changed = false;
            for (const key of Array.from(u.searchParams.keys())) {
                if (getTrackingKeySet().has(key.toLowerCase())) {
                    u.searchParams.delete(key);
                    changed = true;
                }
            }
            if (!changed) return url;
            // toString() 只算一次：它就是一次完整序列化，重复调用纯属浪费。
            const query = u.searchParams.toString();
            const suffix = (query ? '?' + query : '') + u.hash;
            if (url.charAt(0) === '/' && !url.startsWith('//')) {
                return u.pathname + suffix;
            }
            return u.origin + u.pathname + suffix;
        } catch (_) {
            return url;
        }
    }

    function blockMetaRefreshElement(meta) {
        if (!meta || meta.nodeType !== 1 || meta.tagName !== 'META') return;
        const equiv = (meta.getAttribute('http-equiv') || '').toLowerCase();
        if (equiv !== 'refresh') return;
        const content = meta.getAttribute('content') || '';
        const match = content.match(/url\s*=\s*['"]?([^'"\s]+)/i);
        if (match) {
            const cleaned = cleanTrackingParams(match[1]);
            if (isBlocked(cleaned)) meta.remove();
        }
    }

    function blockBaseElement(base) {
        if (!base || base.nodeType !== 1 || base.tagName !== 'BASE') return;
        const href = base.getAttribute('href');
        if (!href) return;
        const cleaned = cleanTrackingParams(href);
        if (isBlocked(cleaned)) base.removeAttribute('href');
    }

    // ============================================================
    // UA 平台伪装（保留原脚本功能，但移除全局 String.prototype.indexOf 修改）
    // ============================================================
    function spoofPlatform(platform = 'Mac') {
        if (uaApplied) return;
        uaApplied = true;
        try {
            Object.defineProperty(hostWindow.Navigator.prototype, 'platform', {
                configurable: true,
                get: () => platform
            });
        } catch (_) {}

        try {
            const nativeNavigator = hostWindow.navigator;
            const proxyNavigator = new Proxy(nativeNavigator, {
                get(target, prop) {
                    if (prop === 'platform') return platform;
                    // receiver 必须传原生 navigator：传 Proxy 的话，userAgent / language
                    // 这类原生访问器会因为 this 不对而抛 TypeError: Illegal invocation。
                    return Reflect.get(target, prop, target);
                }
            });
            Object.defineProperty(hostWindow, 'navigator', {
                configurable: true,
                get: () => proxyNavigator
            });
        } catch (_) {}

        // 保留原脚本在 UA 模式下针对 navigator.platform 检测的兼容处理，
        // 只在用户主动开启 UA 模拟时生效，不影响默认模式。
        try {
            const nativeIndexOf = String.prototype.indexOf;
            String.prototype.indexOf = function (value) {
                if (this === platform) {
                    if (value === 'Win' || value === 'Linux' || value === 'X11') return -1;
                    if (value === platform) return 0;
                }
                return nativeIndexOf.apply(this, arguments);
            };
        } catch (_) {}
    }

    function initUA() {
        if (spoofUAList.includes(HOST)) spoofPlatform('Mac');
    }

    // ============================================================
    // 合并后的高性能 MutationObserver：真正需要时才创建。
    // ============================================================
    let mutationObserver = null;
    function getMutationObserver() {
        if (mutationObserver) return mutationObserver;
        mutationObserver = new MutationObserver((mutations) => {
            const redirectActive = isRedirectActive();
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (redirectActive && mutation.target && mutation.target.tagName === 'BASE' && mutation.attributeName === 'href') {
                        blockBaseElement(mutation.target);
                    }
                    continue;
                }

                for (const node of mutation.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;
                    const tag = node.tagName;

                    if (tag === 'SCRIPT') {
                        removeScriptNode(node);
                        if (!node.textContent && !node.innerHTML) observePendingScript(node);
                    }

                    // firstElementChild 前置判断：没有子元素的节点不可能含 meta/base，
                    // 直接跳过这次子树查询。SPA 建树时插入的绝大多数是叶子节点，
                    // 这一步省掉的是每次 DOM 变动一次的 CSS 子树扫描。
                    if (redirectActive && (tag === 'META' || tag === 'BASE' ||
                        (node.firstElementChild && typeof node.querySelector === 'function' &&
                            node.querySelector('meta[http-equiv="refresh"],base[href]')))) {
                        processRedirectNode(node);
                    }
                }
            }
        });
        return mutationObserver;
    }

    let pendingScriptObserverCount = 0;
    function observePendingScript(script) {
        if (!script || pendingScriptObserverCount >= 32) return;
        pendingScriptObserverCount++;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            pendingScriptObserverCount = Math.max(0, pendingScriptObserverCount - 1);
            try { observer.disconnect(); } catch (_) {}
        };
        const observer = new MutationObserver(() => {
            const content = script.textContent || script.innerHTML || '';
            if (content) {
                removeScriptNode(script);
                finish();
            }
        });
        try {
            observer.observe(script, { childList: true, characterData: true, subtree: true });
            setTimeout(finish, 1500);
        } catch (_) {
            finish();
        }
    }

    function processRedirectNode(node) {
        if (!node || node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === 'META') blockMetaRefreshElement(node);
        else if (tag === 'BASE') blockBaseElement(node);

        if (typeof node.querySelectorAll !== 'function') return;
        const metas = node.querySelectorAll('meta[http-equiv="refresh"],meta[http-equiv="Refresh"]');
        for (const meta of metas) blockMetaRefreshElement(meta);
        const bases = node.querySelectorAll('base[href]');
        for (const base of bases) blockBaseElement(base);
    }

    function shouldRunDomObserver() {
        // 没有广告清理、也没有已经激活的异源拦截时，不建立全页 MutationObserver。
        return !excludeList.includes(HOST) || isRedirectActive();
    }

    function configureMutationObserver() {
        if (!shouldRunDomObserver()) return;
        const observer = getMutationObserver();
        try { observer.disconnect(); } catch (_) {}
        const target = doc.documentElement || doc;
        try {
            observer.observe(target, isRedirectActive()
                ? { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] }
                : { childList: true, subtree: true });
        } catch (_) {
            try { observer.observe(doc, { childList: true, subtree: true }); } catch (_) {}
        }
    }

    function startObserver() {
        configureMutationObserver();
    }

    // ============================================================
    // 跳转拦截器：只在本网站开关开启时安装原型钩子
    // ============================================================
    // ============================================================
    // 页面早期轻量防跳转：解决 document-start 到智能识别完成之间的点击窗口。
    // 只检查真实点击和 window.open，不扫描 DOM、不改原型；命中异源 URL 才阻止。
    // ============================================================
    let earlyNavigationGuardInstalled = false;
    function installEarlyNavigationGuard() {
        if (earlyNavigationGuardInstalled) return;
        earlyNavigationGuardInstalled = true;
        const earlyClickGuard = (e) => {
            if (!autoContentRedirect || redirectEnabled || autoRedirectActive) return;

            // 只在本页第一次真实点击时做一次同步内容检查。
            // 后续点击不再扫描正文，避免搜索/动态页面受到持续开销。
            if (!earlyContentChecked) {
                earlyContentChecked = true;
                try {
                    const quick = getContentScore();
                    earlyContentMatched = quick.score >= 3 || quick.strong;
                    if (earlyContentMatched) {
                        // 这里只负责提前安装完整拦截器，不能直接 return；
                        // 当前这一次点击仍需继续检查，否则第一下点击仍可能先发生跳转。
                        activateAutoRedirect('点击时命中内容页特征');
                    }
                } catch (_) {}
            }

            let a = e.target;
            if (!a) return;
            if (a.nodeType === 1 && a.tagName !== 'A' && typeof a.closest === 'function') a = a.closest('a');
            if (!a || a.tagName !== 'A') return;
            const raw = a.getAttribute('href') || a.href || '';
            if (!raw || /^(?:#|javascript:|data:|blob:|mailto:|tel:)/i.test(raw)) return;
            try {
                const target = new URL(raw, hostWindow.location.href);
                // 只有本页已经被一次性识别为内容页时，才提前阻断异源链接。
                // 普通网站的正常外链不再被首击防护误伤；内容页则会在本次点击前完成升级。
                if (earlyContentMatched && target.origin !== hostWindow.location.origin && !isAllowedExternal(target.hostname)) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    activateAutoRedirect('点击触发异源跳转');
                }
            } catch (_) {}
        };
        doc.addEventListener('click', earlyClickGuard, true);
    }

    function isAllowedExternal(hostname) {
        const h = String(hostname || '').toLowerCase();
        const cache = redirectRuleCache || compileRedirectRules();
        if (cache.whiteSet.has(h)) return true;
        for (const domain of cache.whiteSet) {
            if (h.endsWith('.' + domain)) return true;
        }
        return false;
    }

    function initRedirectInterception() {
        if (!isRedirectActive() || redirectHooksInstalled) return;
        redirectHooksInstalled = true;
        redirectRuleCache = null;

        try {
            const locProto = hostWindow.Location && hostWindow.Location.prototype;
            const desc = locProto && Object.getOwnPropertyDescriptor(locProto, 'href');
            if (desc && desc.set) {
                const origSet = desc.set;
                Object.defineProperty(locProto, 'href', {
                    get: desc.get,
                    set(v) {
                        const cleaned = cleanTrackingParams(v);
                        if (!isBlocked(cleaned)) origSet.call(this, cleaned);
                    },
                    enumerable: desc.enumerable,
                    configurable: true
                });
            }
        } catch (_) {}

        try {
            const proto = hostWindow.Location.prototype;
            const origAssign = proto.assign;
            proto.assign = function (url) {
                const cleaned = cleanTrackingParams(url);
                if (!isBlocked(cleaned)) return origAssign.call(this, cleaned);
            };
        } catch (_) {}

        try {
            const proto = hostWindow.Location.prototype;
            const origReplace = proto.replace;
            proto.replace = function (url) {
                const cleaned = cleanTrackingParams(url);
                if (!isBlocked(cleaned)) return origReplace.call(this, cleaned);
            };
        } catch (_) {}

        try {
            const origOpen = hostWindow.open;
            hostWindow.open = function (url, name, specs, replace) {
                const cleaned = cleanTrackingParams(url);
                if (isBlocked(cleaned)) return null;
                return origOpen.call(this, cleaned, name, specs, replace);
            };
        } catch (_) {}

        try {
            const historyProto = Object.getPrototypeOf(hostWindow.history);
            const origPushState = historyProto.pushState;
            const origReplaceState = historyProto.replaceState;
            historyProto.pushState = function (state, title, url) {
                if (url != null) {
                    const urlStr = String(url);
                    const cleaned = cleanTrackingParams(urlStr);
                    if (cleaned !== urlStr) return origPushState.call(this, state, title, cleaned);
                    if (isBlocked(urlStr)) return;
                }
                return origPushState.call(this, state, title, url);
            };
            historyProto.replaceState = function (state, title, url) {
                if (url != null) {
                    const urlStr = String(url);
                    const cleaned = cleanTrackingParams(urlStr);
                    if (cleaned !== urlStr) return origReplaceState.call(this, state, title, cleaned);
                    if (isBlocked(urlStr)) return;
                }
                return origReplaceState.call(this, state, title, url);
            };
        } catch (_) {}

        doc.addEventListener('click', (e) => {
            let target = e.target;
            if (!target) return;
            if (target.nodeType === 1 && target.tagName !== 'A' && typeof target.closest === 'function') {
                target = target.closest('a');
            }
            if (!target || target.tagName !== 'A' || !target.href) return;

            const href = target.getAttribute('href') || target.href;
            if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;

            if (e.isTrusted === false) {
                const cleaned = cleanTrackingParams(href);
                if (isBlocked(cleaned)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
                return;
            }

            // 中键/辅助键同样先拦截，避免浏览器先行打开新标签页。
            const cleaned = cleanTrackingParams(href);
            if (isBlocked(cleaned)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, true);

        // 表单广告跳转：只在拦截已激活时监听，避免普通网站增加额外开销。
        doc.addEventListener('submit', (e) => {
            const form = e.target;
            if (!form || form.nodeType !== 1) return;
            const action = form.getAttribute('action') || hostWindow.location.href;
            const cleaned = cleanTrackingParams(action);
            if (isBlocked(cleaned)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, true);

        try {
            const proto = hostWindow.HTMLAnchorElement && hostWindow.HTMLAnchorElement.prototype;
            const origClick = proto && proto.click;
            if (origClick) {
                Object.defineProperty(proto, 'click', {
                    configurable: true,
                    writable: true,
                    value: function () {
                        const href = this.getAttribute('href') || this.href;
                        const cleaned = cleanTrackingParams(href);
                        if (isBlocked(cleaned)) return;
                        return origClick.call(this);
                    }
                });
            }
        } catch (_) {}

        try {
            const proto = hostWindow.HTMLAreaElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'href');
            if (desc && desc.set && desc.configurable) {
                const origSet = desc.set;
                Object.defineProperty(proto, 'href', {
                    configurable: true,
                    enumerable: desc.enumerable,
                    get: desc.get,
                    set(v) {
                        const cleaned = cleanTrackingParams(v);
                        if (!isBlocked(cleaned)) origSet.call(this, cleaned);
                    }
                });
            }
        } catch (_) {}

        try {
            const proto = hostWindow.HTMLEmbedElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'src');
            if (desc && desc.set && desc.configurable) {
                const origSet = desc.set;
                Object.defineProperty(proto, 'src', {
                    configurable: true,
                    enumerable: desc.enumerable,
                    get: desc.get,
                    set(v) {
                        const cleaned = cleanTrackingParams(v);
                        if (!isBlocked(cleaned)) origSet.call(this, cleaned);
                    }
                });
            }
        } catch (_) {}

        try {
            const proto = hostWindow.HTMLObjectElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'data');
            if (desc && desc.set && desc.configurable) {
                const origSet = desc.set;
                Object.defineProperty(proto, 'data', {
                    configurable: true,
                    enumerable: desc.enumerable,
                    get: desc.get,
                    set(v) {
                        const cleaned = cleanTrackingParams(v);
                        if (!isBlocked(cleaned)) origSet.call(this, cleaned);
                    }
                });
            }
        } catch (_) {}

        // 与原脚本保持一致：开启异源拦截时禁止页面通过 document.domain 改写域隔离。
        try {
            const proto = hostWindow.Document.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'domain');
            if (desc && desc.set) {
                Object.defineProperty(proto, 'domain', {
                    get: desc.get,
                    set() {},
                    enumerable: desc.enumerable,
                    configurable: true
                });
            }
        } catch (_) {}

        try {
            const proto = hostWindow.Document.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'location');
            if (desc && desc.set && desc.configurable !== false) {
                const origSet = desc.set;
                Object.defineProperty(proto, 'location', {
                    get: desc.get,
                    set(v) {
                        const cleaned = cleanTrackingParams(v);
                        if (!(cleaned && typeof cleaned === 'string' && isBlocked(cleaned))) {
                            return origSet.call(this, v);
                        }
                    },
                    enumerable: desc.enumerable,
                    configurable: true
                });
            }
        } catch (_) {}

        try {
            if (hostWindow.navigation && typeof hostWindow.navigation.navigate === 'function') {
                const nav = hostWindow.navigation;
                const origNavigate = nav.navigate;
                nav.navigate = function (url, options) {
                    const cleaned = cleanTrackingParams(url);
                    if (isBlocked(cleaned)) {
                        return { committed: Promise.reject(new Error('Blocked by userscript')), finished: Promise.reject(new Error('Blocked by userscript')) };
                    }
                    return origNavigate.call(this, cleaned, options);
                };
            }
        } catch (_) {}

        try {
            if (hostWindow.navigation && typeof hostWindow.navigation.addEventListener === 'function') {
                hostWindow.navigation.addEventListener('navigate', (e) => {
                    if (e.destination && e.destination.url) {
                        const cleaned = cleanTrackingParams(e.destination.url);
                        if (isBlocked(cleaned)) e.preventDefault();
                    }
                });
            }
        } catch (_) {}
    }

    // ============================================================
    // 设置界面：Shadow DOM + 页面滚动锁，彻底隔离后网页交互
    // ============================================================
    // 视觉参照 Miuix / HyperOS：大圆角、无边框、靠底色分层，主色 MIUI 蓝。
    // 变量定义在 .mask 而不是 :host —— ensureUI 给宿主设了 all:initial !important，
    // 定义在 :host 上的自定义属性会被它一起清掉。
    const UI_CSS = `
        :host, * { box-sizing: border-box; }
        .mask {
            position: fixed; inset: 0; width: 100vw; height: 100vh;
            margin: 0; padding: 14px; border: 0; background: rgba(0,0,0,.42);
            backdrop-filter: blur(10px); z-index: 2147483647;
            display:flex; align-items:center; justify-content:center; overflow:hidden;
            pointer-events:auto; isolation:isolate; touch-action:none;

            --brand:#3482ff;
            --success:#21a94b;
            --warning:#ff8f1f;
            --danger:#ff3b30;
            --bg:#f2f3f5;
            --card:#ffffff;
            --fill:rgba(0,0,0,.05);
            --fill-strong:rgba(0,0,0,.08);
            --text:rgba(0,0,0,.9);
            --text-2:rgba(0,0,0,.6);
            --text-3:rgba(0,0,0,.35);
            --divider:rgba(0,0,0,.07);

            font-family:MiSans,"HarmonyOS Sans SC",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
        }
        .panel {
            width:min(92vw,500px); max-height:88vh; overflow:auto;
            background:var(--bg); color:var(--text); border-radius:28px;
            box-shadow:0 24px 60px rgba(0,0,0,.28); padding:10px 12px 14px;
            display:flex; flex-direction:column; gap:10px;
            overscroll-behavior:contain; -webkit-overflow-scrolling:touch; touch-action:pan-y;
        }
        .header {
            position:sticky; top:-10px; z-index:5;
            display:flex; align-items:center; gap:10px;
            margin:-10px -12px 0; padding:16px 14px 10px;
            background:rgba(242,243,245,.9); backdrop-filter:blur(16px);
        }
        .header-title { flex:1; min-width:0; margin:0; font-size:22px; font-weight:700; letter-spacing:.2px; }
        .header button { flex:0 0 auto; min-height:34px; padding:0 18px; font-size:14px; }
        .title { margin:0 0 2px; font-size:20px; font-weight:700; text-align:left; }
        .subtitle { font-size:13px; color:var(--text-2); line-height:1.5; }

        .status {
            display:flex; align-items:center; gap:9px; padding:12px 14px;
            border-radius:14px; background:var(--fill); font-size:12.5px; line-height:1.5;
        }
        .status-list { display:flex; flex-direction:column; gap:8px; }
        .status-dot { width:8px; height:8px; flex:0 0 8px; border-radius:50%; background:var(--text-3); }
        .status.ok .status-dot { background:var(--success); }
        .status.warn .status-dot { background:var(--warning); }
        .status.off .status-dot { background:var(--text-3); }

        .group {
            background:var(--card); border:0; border-radius:20px; padding:14px;
            display:flex; flex-direction:column; gap:10px;
        }
        .group-title { font-size:15px; font-weight:600; margin:0; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .row { display:flex; gap:10px; }
        .row > * { flex:1; }

        button {
            appearance:none; border:0; -webkit-tap-highlight-color:transparent;
            border-radius:999px; min-height:46px; padding:10px 16px;
            font-family:inherit; font-size:14px; font-weight:600; line-height:1.25;
            cursor:pointer; transition:transform .12s ease, background-color .12s ease;
        }
        button:active { transform:scale(.97); }
        button.primary { background:var(--brand); color:#fff; }
        button.success { background:var(--success); color:#fff; }
        button.warning { background:var(--warning); color:#fff; }
        button.danger  { background:var(--danger);  color:#fff; }
        button.neutral { background:var(--fill); color:var(--text); }

        textarea, input[type="text"] {
            width:100%; border:0; border-radius:16px; padding:14px;
            font-family:inherit; font-size:14px; outline:none;
            background:var(--fill); color:var(--text);
        }
        textarea { min-height:120px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; line-height:1.55; }
        .small { font-size:12px; color:var(--text-2); line-height:1.6; }

        .list { max-height:210px; overflow:auto; border:0; border-radius:16px; background:var(--fill); padding:4px 12px; overscroll-behavior:contain; }
        .item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 0; border-bottom:1px solid var(--divider); font-size:13px; }
        .item:last-child { border-bottom:0; }
        .item button { min-height:34px; padding:0 16px; font-size:13px; }

        .logbox { height:360px; overflow:auto; background:#111; color:#eee; border-radius:16px; padding:14px; overscroll-behavior:contain; }
        pre { margin:0; white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.55; }

        /* 不画滚动条：默认那根带轨道和箭头的条跟大圆角界面不搭。
           只是隐藏显示，滚动本身照常（触摸滑动 / 滚轮 / 键盘都能滚）。 */
        .panel, .list, .logbox {
            scrollbar-width: none;      /* Firefox */
            -ms-overflow-style: none;   /* 旧版 Edge */
        }
        .panel::-webkit-scrollbar,
        .list::-webkit-scrollbar,
        .logbox::-webkit-scrollbar { display: none; width: 0; height: 0; }

        /* 窄屏（手机）下按钮文字会折行，把字号和内边距收一点 */
        @media (max-width: 400px) {
            button { font-size:13px; padding:10px 12px; }
            .grid, .row { gap:8px; }
            .header-title { font-size:20px; }
        }

        @media (prefers-color-scheme: dark) {
            .mask {
                --brand:#4c8dff;
                --bg:#000000;
                --card:#1c1c1e;
                --fill:rgba(255,255,255,.08);
                --fill-strong:rgba(255,255,255,.14);
                --text:rgba(255,255,255,.9);
                --text-2:rgba(255,255,255,.6);
                --text-3:rgba(255,255,255,.35);
                --divider:rgba(255,255,255,.09);
            }
            .header { background:rgba(0,0,0,.85); }
            .logbox { background:#0a0a0a; }
        }
    `;

    function ensureUI() {
        if (uiHost && uiShadow) return;
        uiHost = doc.createElement('div');
        uiHost.id = 'merged-ad-redirect-ui';
        Object.assign(uiHost.style, {
            position: 'fixed', inset: '0', width: '100vw', height: '100vh',
            zIndex: '2147483647', pointerEvents: 'none',
            margin: '0', padding: '0', border: '0', background: 'transparent',
            display: 'block', visibility: 'visible', opacity: '1', transform: 'none'
        });
        uiHost.style.setProperty('all', 'initial', 'important');
        uiHost.style.setProperty('display', 'block', 'important');
        uiHost.style.setProperty('position', 'fixed', 'important');
        uiHost.style.setProperty('inset', '0', 'important');
        uiHost.style.setProperty('width', '100vw', 'important');
        uiHost.style.setProperty('height', '100vh', 'important');
        uiHost.style.setProperty('visibility', 'visible', 'important');
        uiHost.style.setProperty('opacity', '1', 'important');
        uiHost.style.setProperty('transform', 'none', 'important');
        uiHost.style.setProperty('pointer-events', 'none', 'important');
        uiHost.style.setProperty('z-index', '2147483647', 'important');
        uiHost.style.setProperty('position', 'fixed', 'important');
        (doc.documentElement || doc).appendChild(uiHost);
        uiShadow = uiHost.attachShadow({ mode: 'closed' });
        const style = doc.createElement('style');
        style.textContent = UI_CSS;
        uiShadow.appendChild(style);

    }

    function installModalEventBlocker() {
        if (uiBlockerCleanups.length) return;

        const blockEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
            'auxclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'wheel'];

        const isUIEvent = (event) => {
            if (!uiHost) return false;
            if (event.target === uiHost) return true;
            const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
            return path.includes(uiHost);
        };

        // 页面侧事件必须在捕获阶段截断；但来自设置层的事件绝不能截断。
        const pageEventBlocker = (event) => {
            if (!uiHost || isUIEvent(event)) return;
            // 设置关闭后的宽限期内继续吞掉输入，挡掉触摸设备补发的那一次 click，
            // 否则它会落到面板底下的网页元素上。
            if (!uiModalOpen && Date.now() >= modalCloseGuardUntil) return;
            if (event.cancelable) event.preventDefault();
            event.stopImmediatePropagation();
        };
        const captureOptions = { capture: true, passive: false };
        for (const type of blockEvents) {
            try {
                hostWindow.addEventListener(type, pageEventBlocker, captureOptions);
                uiBlockerCleanups.push(() => hostWindow.removeEventListener(type, pageEventBlocker, captureOptions));
            } catch (_) {}
        }

        // 设置层自己的事件也在宿主层截断，防止继续落入页面 document/body 的监听器。
        const uiEventBlocker = (event) => {
            if (!uiModalOpen || !isUIEvent(event)) return;
            // 只阻断事件向页面继续冒泡，不禁止 UI 自己的默认滚动行为。
            // 旧版在 touchmove / wheel 上 preventDefault() 会导致长列表无法滑动。
            event.stopPropagation();
        };
        for (const type of blockEvents) {
            try {
                uiHost.addEventListener(type, uiEventBlocker, false);
                uiBlockerCleanups.push(() => uiHost.removeEventListener(type, uiEventBlocker, false));
            } catch (_) {}
        }

        const keyBlocker = (event) => {
            if (!uiModalOpen || !uiHost || isUIEvent(event)) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                removeModal();
                return;
            }
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };
        try {
            hostWindow.addEventListener('keydown', keyBlocker, true);
            uiBlockerCleanups.push(() => hostWindow.removeEventListener('keydown', keyBlocker, true));
        } catch (_) {}
    }

    function uninstallModalEventBlocker() {
        for (const cleanup of uiBlockerCleanups.splice(0)) {
            try { cleanup(); } catch (_) {}
        }
    }

    function lockPageScroll() {
        if (pageScrollLock) return;
        const body = doc.body;
        const html = doc.documentElement;
        const currentY = hostWindow.scrollY || html.scrollTop || 0;
        pageScrollLock = {
            y: currentY,
            htmlOverflow: html.style.overflow,
            htmlOverscroll: html.style.overscrollBehavior,
            bodyOverflow: body ? body.style.overflow : '',
            bodyPosition: body ? body.style.position : '',
            bodyTop: body ? body.style.top : '',
            bodyWidth: body ? body.style.width : '',
            bodyPaddingRight: body ? body.style.paddingRight : ''
        };

        const scrollbarGap = Math.max(0, hostWindow.innerWidth - html.clientWidth);
        html.style.setProperty('overflow', 'hidden', 'important');
        html.style.setProperty('overscroll-behavior', 'none', 'important');
        if (body) {
            body.style.setProperty('overflow', 'hidden', 'important');
            body.style.setProperty('position', 'fixed', 'important');
            body.style.setProperty('top', `-${currentY}px`, 'important');
            body.style.setProperty('width', '100%', 'important');
            if (scrollbarGap > 0) body.style.setProperty('padding-right', `${scrollbarGap}px`, 'important');
        }
    }

    function unlockPageScroll() {
        if (!pageScrollLock) return;
        const state = pageScrollLock;
        const body = doc.body;
        const html = doc.documentElement;
        html.style.overflow = state.htmlOverflow;
        html.style.overscrollBehavior = state.htmlOverscroll;
        if (body) {
            body.style.overflow = state.bodyOverflow;
            body.style.position = state.bodyPosition;
            body.style.top = state.bodyTop;
            body.style.width = state.bodyWidth;
            body.style.paddingRight = state.bodyPaddingRight;
        }
        pageScrollLock = null;
        try { hostWindow.scrollTo(0, state.y); } catch (_) {}
    }

    function removeModal() {
        uiModalOpen = false;
        uiPageStack = [];
        // 拦截器不能在这里同步卸载：触摸设备是在 pointerup 阶段就把关闭动作执行掉的，
        // 浏览器随后补发的那一次 click 必须继续被挡掉，否则会落到面板底下的网页元素上。
        modalCloseGuardUntil = Date.now() + 350;
        if (modalCloseGuardTimer) clearTimeout(modalCloseGuardTimer);
        modalCloseGuardTimer = setTimeout(() => {
            modalCloseGuardTimer = 0;
            if (!uiModalOpen) uninstallModalEventBlocker();
        }, 400);
        try {
            const mask = uiShadow && uiShadow.querySelector('.mask');
            if (mask) mask.remove();
        } catch (_) {}
        if (uiHost) uiHost.style.setProperty('pointer-events', 'none', 'important');
        unlockPageScroll();
    }

    function showModal(contentBuilder) {
        ensureUI();
        const old = uiShadow.querySelector('.mask');
        if (old) { try { old.remove(); } catch (_) {} }

        lockPageScroll();
        uiModalOpen = true;
        uiHost.style.pointerEvents = 'auto';
        installModalEventBlocker();

        const mask = doc.createElement('div');
        mask.className = 'mask';
        mask.setAttribute('role', 'dialog');
        mask.setAttribute('aria-modal', 'true');

        const panel = doc.createElement('div');
        panel.className = 'panel';
        panel.setAttribute('role', 'document');
        mask.appendChild(panel);

        mask.addEventListener('click', e => {
            if (e.target !== mask || isClickSuppressed()) return;
            e.preventDefault();
            e.stopPropagation();
            removeModal();
        }, false);

        uiShadow.appendChild(mask);
        try {
            contentBuilder(panel, mask);
        } catch (error) {
            console.error('[网页净化与跳转防护] 设置界面构建失败:', error);
            panel.replaceChildren();
            const title = doc.createElement('div');
            title.className = 'title';
            title.textContent = '设置界面加载失败';
            const msg = doc.createElement('div');
            msg.className = 'small';
            msg.textContent = '脚本已自动解除页面锁定，请关闭后重新打开设置。';
            panel.append(title, msg, button('关闭', 'primary', removeModal));
        }

        try {
            const first = panel.querySelector('button,textarea,input,[tabindex]');
            if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
        } catch (_) {}
    }

    // 触摸设备在 pointerup 之后还会补发一次 click。点「返回」时设置层已经重建完毕，
    // 这次补发的 click 坐标不变、目标却可能落到新页面顶栏的按钮上（例如「关闭」），
    // 表现就是“点一下返回，直接一路退回网页”。重建后短暂吞掉紧随其后的 click。
    let suppressClickUntil = 0;
    const isClickSuppressed = () => Date.now() < suppressClickUntil;

    function button(text, cls, handler) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.className = cls || 'neutral';
        let handledPointerUp = false;
        b.addEventListener('pointerup', e => {
            e.stopPropagation();
            if (e.pointerType === 'touch' && !handledPointerUp) {
                handledPointerUp = true;
                setTimeout(() => { handledPointerUp = false; }, 350);
                e.preventDefault();
                suppressClickUntil = Date.now() + 350;
                try { handler(e); } catch (_) {}
            }
        }, false);
        b.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (handledPointerUp) return;
            if (isClickSuppressed()) return;
            try { handler(e); } catch (_) {}
        }, false);
        return b;
    }

    // 设置 UI 导航：所有子页进入栈，返回永远回到上一层；只有最顶层才显示“关闭”。
    function renderUiPage() {
        const page = uiPageStack[uiPageStack.length - 1];
        if (!page) return removeModal();
        showModal(panel => {
            addPanelHeader(panel, page.title, uiPageStack.length > 1 ? goBackUiPage : removeModal,
                uiPageStack.length > 1 ? '返回' : '关闭');
            page.build(panel);
        });
    }

    function showMainSettings() {
        uiPageStack = [{ title: '网页净化设置', build: buildMainSettings }];
        renderUiPage();
    }

    function openUiPage(title, build) {
        uiPageStack.push({ title, build });
        renderUiPage();
    }

    function goBackUiPage() {
        if (uiPageStack.length > 1) {
            uiPageStack.pop();
            renderUiPage();
        } else {
            removeModal();
        }
    }

    function addPanelHeader(panel, titleText, backHandler, backText = '返回') {
        const header = doc.createElement('div');
        header.className = 'header';
        const title = doc.createElement('div');
        title.className = 'header-title';
        title.textContent = titleText;
        header.appendChild(title);
        header.appendChild(button(backText, 'neutral', backHandler));
        panel.appendChild(header);
        return header;
    }

    function addGroup(panel, titleText, noteText = '') {
        const group = doc.createElement('div');
        group.className = 'group';
        if (titleText) {
            const title = doc.createElement('div');
            title.className = 'group-title';
            title.textContent = titleText;
            group.appendChild(title);
        }
        if (noteText) {
            const note = doc.createElement('div');
            note.className = 'small';
            note.textContent = noteText;
            group.appendChild(note);
        }
        panel.appendChild(group);
        return group;
    }

    function addGrid(group, items) {
        const grid = doc.createElement('div');
        grid.className = 'grid';
        for (const item of items) grid.appendChild(button(item[0], item[1] || 'neutral', item[2]));
        group.appendChild(grid);
        return grid;
    }

    function buildStatusRow(kind, text) {
        const box = doc.createElement('div');
        box.className = `status ${kind}`;
        const dot = doc.createElement('span');
        dot.className = 'status-dot';
        const msg = doc.createElement('span');
        msg.textContent = text;
        box.append(dot, msg);
        return box;
    }

    function buildMainSettings(panel) {
        const sub = doc.createElement('div');
        sub.className = 'subtitle';
        sub.textContent = HOST;
        panel.appendChild(sub);

        const adEnabled = !MAINSTREAM_BYPASS_ACTIVE && !excludeList.includes(HOST);
        // 跳转防护只有在“本站强制拦截开启”或“智能检测已命中”时才算真正在跑。
        // 智能检测开关本身默认是开着的，不能拿它当作“防护已开启”。
        const redirectRunning = !MAINSTREAM_BYPASS_ACTIVE && isRedirectActive();
        const status = addGroup(panel, '运行状态');
        const statusList = doc.createElement('div');
        statusList.className = 'status-list';
        statusList.append(
            buildStatusRow(MAINSTREAM_BYPASS_ACTIVE ? 'off' : (adEnabled ? 'ok' : 'off'),
                MAINSTREAM_BYPASS_ACTIVE ? '广告拦截：旁路' : (adEnabled ? '广告拦截：开启' : '广告拦截：关闭')),
            buildStatusRow(MAINSTREAM_BYPASS_ACTIVE ? 'off' : (redirectRunning ? 'ok' : 'off'),
                MAINSTREAM_BYPASS_ACTIVE ? '跳转防护：旁路' : (redirectRunning ? '跳转防护：开启' : '跳转防护：关闭'))
        );
        status.appendChild(statusList);

        const runtimeHint = MAINSTREAM_BYPASS_ACTIVE
            ? '本站属于主流站点，广告拦截与跳转防护均不会启动。'
            : redirectEnabled
                ? (autoRedirectActive ? `跳转防护：强制拦截已开启 · ${autoRedirectReason || '智能检测已命中'}`
                    : (autoContentRedirect ? '跳转防护：强制拦截已开启 · 本站智能检测已开启' : '跳转防护：强制拦截已开启'))
                : autoContentRedirect
                    ? (autoRedirectActive ? `智能检测已命中 · ${autoRedirectReason || '内容页特征'}` : '智能检测已开启，正在按需判断当前页面')
                    : '本站已关闭智能检测';
        const hint = doc.createElement('div');
        hint.className = 'small';
        hint.textContent = runtimeHint;
        status.appendChild(hint);

        if (isBuiltInMainstreamSite(HOST)) {
            const forced = isForceRunMainstreamSite(HOST);
            const group = addGroup(panel, '主流站点', forced
                ? '本站已从主流站点旁路中解除，将按普通网站逻辑运行。'
                : '本站默认完整旁路，不执行广告扫描、跳转拦截、智能检测或 UA 修改。');
            group.appendChild(button(forced ? '恢复主流站点旁路' : '当前站点强制运行', forced ? 'neutral' : 'warning', () => {
                if (forced) mainstreamForceRun = mainstreamForceRun.filter(x => !hostMatchesDomain(HOST, x));
                else if (!mainstreamForceRun.includes(HOST)) mainstreamForceRun.push(HOST);
                saveMainstreamForceRun();
                removeModal();
                hostWindow.location.reload();
            }));
        }

        const ad = addGroup(panel, '广告拦截');
        const excluded = excludeList.includes(HOST);
        addGrid(ad, [
            [MAINSTREAM_BYPASS_ACTIVE ? '本站旁路中' : (excluded ? '广告拦截：关闭' : '广告拦截：开启'),
                MAINSTREAM_BYPASS_ACTIVE ? 'neutral' : (excluded ? 'danger' : 'success'), toggleSiteAdBlock],
            ['脚本关键词', 'neutral', showAdKeywords],
            [`拦截日志（${removedScriptsInfo.length}）`, 'neutral', showRemovedScripts],
            ['内嵌脚本', 'neutral', showInlineScripts]
        ]);

        const redirect = addGroup(panel, '跳转防护');
        addGrid(redirect, [
            [redirectEnabled ? '本站强制拦截：开启' : '本站强制拦截：关闭', redirectEnabled ? 'success' : 'neutral', toggleForcedRedirect],
            [autoContentRedirect ? '智能检测：开启' : '智能检测：关闭', autoContentRedirect ? 'success' : 'danger', toggleSiteSmartDetect],
            ['规则', 'neutral', showRedirectManager],
            [`数据（${forcedRedirectSites.length}）`, 'neutral', showRedirectData]
        ]);

        const uaSpoofed = !MAINSTREAM_BYPASS_ACTIVE && spoofUAList.includes(HOST);
        const ua = addGroup(panel, 'UA 伪装',
            MAINSTREAM_BYPASS_ACTIVE ? '当前站点处于主流站点旁路，UA 伪装不会启动。' : '开启后本站的 navigator.platform 会伪装成 Mac。');
        addGrid(ua, [
            [MAINSTREAM_BYPASS_ACTIVE ? '本站旁路中' : (uaSpoofed ? '本站 UA 伪装：开启' : '本站 UA 伪装：关闭'),
                MAINSTREAM_BYPASS_ACTIVE ? 'neutral' : (uaSpoofed ? 'success' : 'neutral'), toggleSiteUASpoof],
            [`名单（${spoofUAList.length}）`, 'neutral', showUASpoofList]
        ]);

        const note = doc.createElement('div');
        note.className = 'small';
        note.textContent = '智能检测默认对所有站点开启，仅在页面出现明显内容页关键词时才启用异源跳转拦截。关闭某站后可到「数据」里删除该站以恢复。';
        panel.appendChild(note);
        panel.appendChild(button('完成', 'primary', removeModal));
    }

    // 三个开关都直接影响 document-start 阶段安装的清理器 / 拦截钩子，
    // 所以切换后必须刷新页面，光重绘设置界面不会真正生效。
    function toggleSiteAdBlock() {
        if (MAINSTREAM_BYPASS_ACTIVE) return;
        if (excludeList.includes(HOST)) excludeList = excludeList.filter(x => x !== HOST);
        else excludeList.push(HOST);
        saveExcludeList();
        removeModal();
        hostWindow.location.reload();
    }

    function toggleForcedRedirect() {
        if (MAINSTREAM_BYPASS_ACTIVE) return;
        redirectEnabled = !redirectEnabled;
        const idx = forcedRedirectSites.indexOf(HOST);
        if (redirectEnabled && idx === -1) forcedRedirectSites.push(HOST);
        if (!redirectEnabled && idx !== -1) forcedRedirectSites.splice(idx, 1);
        saveForcedRedirectSites();
        try { GM_setValue(KEY.redirectEnabled, redirectEnabled); } catch (_) {}
        removeModal();
        hostWindow.location.reload();
    }

    // 智能检测按站点开关：点一下只影响当前网站，其余站点不受影响。
    // 关闭的站点会记进名单，可在「跳转防护 → 数据」里删除以恢复。
    function toggleSiteSmartDetect() {
        if (MAINSTREAM_BYPASS_ACTIVE) return;
        if (smartDetectOffSites.includes(HOST)) smartDetectOffSites = smartDetectOffSites.filter(x => x !== HOST);
        else smartDetectOffSites = smartDetectOffSites.concat(HOST);
        saveSmartDetectOffSites();
        autoContentRedirect = !smartDetectOffSites.includes(HOST);
        removeModal();
        hostWindow.location.reload();
    }

    // UA 伪装按站点开关，只在当前网站生效，其他站点不受影响。
    function toggleSiteUASpoof() {
        if (MAINSTREAM_BYPASS_ACTIVE) return;
        if (spoofUAList.includes(HOST)) spoofUAList = spoofUAList.filter(x => x !== HOST);
        else spoofUAList = spoofUAList.concat(HOST);
        saveSpoofUAList();
        removeModal();
        hostWindow.location.reload();
    }

    function showUASpoofList() {
        openUiPage('UA 伪装名单', buildUASpoofList);
    }

    function buildUASpoofList(panel) {
        const group = addGroup(panel, `已开启 UA 伪装的站点（${spoofUAList.length}）`,
            '删除某个站点后，该站恢复真实的 navigator.platform。');
        const list = doc.createElement('div');
        list.className = 'list';
        buildHostList(list, spoofUAList, host => {
            spoofUAList = spoofUAList.filter(x => x !== host);
            saveSpoofUAList();
            if (host === HOST) {
                // 当前站点要还原成真实 platform，必须刷新才能生效。
                removeModal();
                hostWindow.location.reload();
                return;
            }
            renderUiPage();
        });
        group.appendChild(list);

        const actions = doc.createElement('div');
        actions.className = 'row';
        actions.appendChild(button('全部恢复', 'neutral', () => {
            const affectsCurrentSite = spoofUAList.includes(HOST);
            spoofUAList = [];
            saveSpoofUAList();
            if (affectsCurrentSite) {
                removeModal();
                hostWindow.location.reload();
                return;
            }
            renderUiPage();
        }));
        panel.appendChild(actions);
    }

    function showAdKeywords() {
        openUiPage('脚本关键词', buildAdKeywords);
    }

    function buildAdKeywords(panel) {
        const note = doc.createElement('div');
        note.className = 'small';
        note.textContent = '每行一个关键词；留空时使用内置默认关键词。';
        panel.appendChild(note);

        const editor = doc.createElement('textarea');
        editor.value = getKeywordsForCurrentSite().join('\n');
        panel.appendChild(editor);

        const row = doc.createElement('div');
        row.className = 'row';
        row.appendChild(button('保存', 'primary', () => {
            keywords = keywords.filter(k => !k.startsWith(HOST + ':')).concat(
                editor.value.split('\n').map(x => x.trim()).filter(Boolean).map(x => HOST + ':' + x)
            );
            saveKeywords();
            keywordCache = null;
            renderUiPage();
        }));
        panel.appendChild(row);
    }

    function showRedirectData() {
        openUiPage('跳转防护数据', buildRedirectData);
    }

    function buildHostList(list, hosts, onDelete) {
        if (!hosts.length) {
            list.textContent = '暂无站点';
            return;
        }
        for (const host of [...hosts].sort()) {
            const row = doc.createElement('div');
            row.className = 'item';
            row.style.gap = '8px';
            const name = doc.createElement('span');
            Object.assign(name.style, { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
            name.textContent = host;
            row.appendChild(name);
            row.appendChild(button('删除', 'danger', () => onDelete(host)));
            list.appendChild(row);
        }
    }

    function buildRedirectData(panel) {
        const note = doc.createElement('div');
        note.className = 'small';
        note.textContent = '这里管理两类你手动设置的站点：强制拦截站点、已关闭智能检测的站点。不记录实际拦截次数、URL、时间或原因。';
        panel.appendChild(note);

        const add = addGroup(panel, '添加站点');
        const input = doc.createElement('input');
        input.type = 'text';
        input.placeholder = '例如 example.com';
        add.appendChild(input);
        add.appendChild(button('添加并启用强制拦截', 'primary', () => {
            const host = normalizeManagedHost(input.value);
            if (!host) return;
            if (!forcedRedirectSites.includes(host)) forcedRedirectSites.push(host);
            forcedRedirectSites = Array.from(new Set(forcedRedirectSites));
            saveForcedRedirectSites();
            try { GM_setValue(`enabled_${host}`, true); } catch (_) {}
            if (host === HOST) redirectEnabled = true;
            renderUiPage();
        }));

        const listGroup = addGroup(panel, `强制拦截站点（${forcedRedirectSites.length}）`);
        const list = doc.createElement('div');
        list.className = 'list';
        buildHostList(list, forcedRedirectSites, host => {
            forcedRedirectSites = forcedRedirectSites.filter(x => x !== host);
            saveForcedRedirectSites();
            try { GM_setValue(`enabled_${host}`, false); } catch (_) {}
            if (host === HOST) redirectEnabled = false;
            renderUiPage();
        });
        listGroup.appendChild(list);

        const actions = doc.createElement('div');
        actions.className = 'row';
        actions.appendChild(button('清空全部', 'danger', () => {
            for (const host of forcedRedirectSites) {
                try { GM_setValue(`enabled_${host}`, false); } catch (_) {}
            }
            forcedRedirectSites = [];
            saveForcedRedirectSites();
            redirectEnabled = false;
            renderUiPage();
        }));
        panel.appendChild(actions);

        const detectGroup = addGroup(panel, `已关闭智能检测的站点（${smartDetectOffSites.length}）`,
            '删除某个站点后，该站恢复智能检测。');
        const detectList = doc.createElement('div');
        detectList.className = 'list';
        buildHostList(detectList, smartDetectOffSites, host => {
            smartDetectOffSites = smartDetectOffSites.filter(x => x !== host);
            saveSmartDetectOffSites();
            if (host === HOST) {
                // 当前站点的智能检测要重新开始，必须刷新才能重建检测流程。
                autoContentRedirect = true;
                removeModal();
                hostWindow.location.reload();
                return;
            }
            renderUiPage();
        });
        detectGroup.appendChild(detectList);

        const detectActions = doc.createElement('div');
        detectActions.className = 'row';
        detectActions.appendChild(button('全部恢复', 'neutral', () => {
            const affectsCurrentSite = smartDetectOffSites.includes(HOST);
            smartDetectOffSites = [];
            saveSmartDetectOffSites();
            if (affectsCurrentSite) {
                autoContentRedirect = true;
                removeModal();
                hostWindow.location.reload();
                return;
            }
            renderUiPage();
        }));
        panel.appendChild(detectActions);
    }

    function showRedirectManager() {
        openUiPage('异源跳转管理', buildRedirectManager);
    }

    function buildRedirectManager(panel) {
        const blackGroup = addGroup(panel, '同源黑名单', 'https:// 开头 = 完整 URL；/ 开头 = 路径前缀；其他 = URL 包含匹配；支持 * 通配。');
        const blackArea = doc.createElement('textarea');
        blackArea.value = redirectBlackList.join('\n');
        blackGroup.appendChild(blackArea);

        const whiteGroup = addGroup(panel, '异源白名单', '每行一个域名，例如 github.com；会同时匹配该域名及其子域名。');
        const whiteArea = doc.createElement('textarea');
        whiteArea.value = redirectWhiteList.join('\n');
        whiteGroup.appendChild(whiteArea);

        const row = doc.createElement('div');
        row.className = 'row';
        row.appendChild(button('保存并刷新', 'primary', () => {
            redirectBlackList = blackArea.value.split('\n').map(x => x.trim()).filter(Boolean);
            redirectWhiteList = whiteArea.value.split('\n').map(x => x.trim()).filter(Boolean);
            saveRedirectLists();
            removeModal();
            hostWindow.location.reload();
        }));
        panel.appendChild(row);
    }

    function formatAndHighlight(code) {
        const safe = escapeHtml(String(code || '').slice(0, 8000));
        return safe.replace(/\b(var|let|const|function|if|else|return|for|while|new|try|catch|async|await|case|switch|break|default)\b/g, '<span style="color:#d197d9">$1</span>');
    }

    function showRemovedScripts() {
        openUiPage(`拦截日志（${removedScriptsInfo.length}）`, buildRemovedScripts);
    }

    function buildRemovedScripts(panel) {
        const box = doc.createElement('div');
        box.className = 'logbox';
        if (!removedScriptsInfo.length) box.textContent = '暂无拦截记录';
        else box.innerHTML = removedScriptsInfo.map((item, i) =>
            `<div style="margin-bottom:16px;border-bottom:1px solid #444;padding-bottom:12px"><div style="font-weight:bold;color:#ff453a;margin-bottom:5px"># ${i + 1} · ${escapeHtml(item.keywords.join(', '))}</div><pre>${formatAndHighlight(item.content)}</pre></div>`
        ).join('');
        panel.appendChild(box);
    }

    function showInlineScripts() {
        openUiPage('网页内嵌脚本', buildInlineScripts);
    }

    function buildInlineScripts(panel) {
        const box = doc.createElement('div');
        box.className = 'logbox';
        const scripts = Array.from(doc.querySelectorAll('script')).filter(s => (s.textContent || '').trim());
        if (!scripts.length) box.textContent = '未发现内嵌脚本';
        else scripts.forEach((s, i) => {
            const wrap = doc.createElement('div');
            wrap.style.cssText = 'margin-bottom:16px;border-bottom:1px solid #444;padding-bottom:12px';
            const h = doc.createElement('div');
            h.style.cssText = 'font-size:11px;color:#aaa;margin-bottom:5px';
            h.textContent = `# 脚本块 ${i + 1}`;
            const pre = doc.createElement('pre');
            pre.textContent = (s.textContent || '').slice(0, 8000);
            wrap.append(h, pre);
            box.appendChild(wrap);
        });
        panel.appendChild(box);
    }

    // ============================================================
    // 菜单
    // ============================================================
    function registerMenu() {
        try {
            // 唯一设置入口。完整配置仅在用户真正打开设置时加载。
            GM_registerMenuCommand('网页净化设置', () => {
                loadRuntimeConfig();
                showMainSettings();
            });
        } catch (_) {}
    }

    // ============================================================
    // 启动顺序：先判断 URL → 必要时尽早安装异源拦截 → 广告扫描 → 低频智能检测
    // ============================================================
    registerMenu();

    // 主流站点旁路是启动阶段的第一优先级。这里直接退出运行时，
    // 不读取完整配置、不启动广告拦截、不安装 UA / 跳转钩子 / Observer / 智能检测。
    if (MAINSTREAM_BYPASS_ACTIVE) return;

    // 非旁路站点才进入完整运行时。
    loadRuntimeConfig();
    initUA();
    // 只有可能需要智能拦截时才安装早期点击观察器。
    if (autoContentRedirect || redirectEnabled) installEarlyNavigationGuard();
    if (autoContentRedirect && CONTENT_URL_RE.test(String(hostWindow.location.pathname || '') + ' ' + String(hostWindow.location.search || ''))) {
        activateAutoRedirect('URL 命中内容页特征');
    } else if (redirectEnabled) {
        initRedirectInterception();
    }

    const startAdCleaner = !excludeList.includes(HOST);
    if (startAdCleaner || isRedirectActive()) startObserver();
    if (startAdCleaner) scanExistingScripts();

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', () => {
            scheduleContentDetection(180, 'DOMContentLoaded');
            if (!excludeList.includes(HOST)) scanExistingScripts();
        }, { once: true });
    } else {
        scheduleContentDetection(180, '文档已就绪');
    }

    // UI Guard 只在设置 UI 被实际打开后才有意义；因此改为按需安装。
    try {
        hostWindow.addEventListener('pagehide', flushRemovedCount, { once: true });
        hostWindow.addEventListener('beforeunload', flushRemovedCount, { once: true });
    } catch (_) {}
    flushRemovedCount();
})();
