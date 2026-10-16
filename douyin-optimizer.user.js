// ==UserScript==
// @name         抖音网页版优化
// @namespace    https://github.com/Deelok123/dimo-tools
// @version      1.3.2
// @description  伪装成桌面客户端，让抖音整套"下载/登录客户端"推广界面直接不生成；另外屏蔽充钻石/壁纸/投稿等入口、备案号等无用信息；后台标签页自动暂停播放；可选释放视频 MSE 缓冲
// @author       you
// @match        https://www.douyin.com/*
// @match        https://live.douyin.com/*
// @match        https://douyin.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    // 精确匹配元素文本后，向上找到"按钮容器"再隐藏。
    // 已知副作用：抖音把搜索词高亮拆成独立元素，整块文本恰好就是搜索词本身，
    // 所以搜"壁纸"这类被屏蔽的词时，建议词里的高亮部分会被一并藏掉（显示不全）。
    hideTexts: [
      '下载抖音', '下载抖音电脑版', '下载电脑版', '下载客户端', '客户端',
      '充钻石', '充值', '钻石',
      '壁纸', '动态壁纸',
      '投稿',
    ],

    // href 子串匹配，直接由 CSS 干掉（下载电脑版落地页 / 客户端安装包直链）
    hideHrefs: ['downloadpage', '/download/pc/'],

    // 左下角整块无用信息：备案号/许可证/举报/广告投放/用户服务协议/隐私政策等
    hideFooter: true,

    // 伪装成客户端之后，抖音会在头像右边渲染出"只有客户端才有"的窗口按钮
    // （置顶/最小化/最大化/关闭）——这是伪装的副作用，浏览器里本不该有，藏掉。
    hideClientWindowControls: true,

    // 横幅类推广（不能复用 hideTexts：这些文案所在的 div 远超按钮尺寸上限）。
    // 定位方式：从"文案所在最小元素"向上爬，只要 高度 ≤ maxH 且整块文本 ≤ maxText 就继续往上。
    //
    // maxClimb 是这里最关键的一条，必须写死：只靠高度和文字长度判断是不可靠的——
    // 面板开合动画中、或列表还没渲染出来时，容器会短暂变矮、文字变短，
    // 爬升就会越界一层，把装内容的容器一起藏掉（藏掉后内联样式一直在，再打开就是空白）。
    // 写死层数后，越界在结构上就不可能发生。层数是按实际 DOM 数的，不是猜的。
    promoBanners: [
      // 通知面板：div.W6qKIZ6x > (文案 div.FvfcGgNr | 下载 a | 关闭 div) —— 爬 2 层正好停在 .W6qKIZ6x
      // 消息面板：同上结构
      // spoofCovers: 这条本身就是"客户端推广"。UA 伪装一生效，抖音根本不生成它，
      // 所以标注后伪装开着时直接跳过，不做无用功；哪天伪装关了会自动恢复。
      { match: '实时接收', maxH: 90, maxText: 40, maxClimb: 2, spoofCovers: true },
      // 左下角"下载抖音精选"：文案 → 图标行 → 内层 → 内层 → .koGT6lm7（fixed 容器），共 4 层
      { match: '下载抖音精选', maxH: 90, maxText: 14, maxClimb: 4 },
      // 播放器左下角那个粉色药丸"及时接收作品更新提醒"，上面还顶着个"下载电脑客户端"小条。
      // 结构：文案(H_crvIqw) → 内层(IXMCDg0e) → 整块容器(bd7fBLfk)，共 3 层；
      // 再往上就是播放器容器（高 913），被 maxH 挡住，不会继续爬。
      // 注意文案是"及时"不是"即时"。
      { match: '及时接收作品更新提醒', maxH: 90, maxText: 40, maxClimb: 3 },
      // 鼠标移到头像上，下拉菜单最上面那条"客户端登录访问更便捷"（下面才是真正的用户菜单）。
      // 结构同前面几条：文案(FvfcGgNr) → 整条(W6qKIZ6x)，2 层；
      // 再往上是整个下拉 UL（高 707），被 maxH 挡住。
      // 这里用 display:none（不是保留占位）——藏掉后下面的菜单自然往上顶，不会留一条空白。
      // 同样是客户端推广，伪装开着时跳过。
      { match: '客户端登录访问更便捷', maxH: 90, maxText: 40, maxClimb: 2, spoofCovers: true },
    ],

    // 切到后台标签页时暂停播放。实测（2026-09-20）抖音自己不暂停，hidden 时仍在解码
    pauseWhenHidden: true,

    // "下载客户端引导"类弹窗（左下角那个"及时接收作品更新提醒"）的展示次数上限记在
    // localStorage 的 PostGuideDownloadClient = {lastTimestamp, showTimes} 里，showTimes 已经跑到 9。
    // 把次数顶掉能让它**一开始就不渲染**，比"渲染出来再藏掉"更干净（没有闪现、也不会有残留的空位）。
    // 说明：这个键名和数据结构是从值本身推断的，我没法百分百确认抖音的判断条件，
    // 所以它只是"更好的一层"，底下那条藏元素的规则继续留着兜底——万一这招失效，照样藏得住。
    suppressClientGuides: true,
    clientGuideKeys: ['PostGuideDownloadClient'],

    // 释放远离当前视频的 MSE 缓冲。省内存但往回滚会重新加载，默认关
    unloadFarVideos: false,
    unloadKeepSlots: 1,

    // 伪装成桌面客户端 —— 这是对付"到处提示下载客户端"的通用解法。
    //
    // 实测（2026-10-15）：只要 UA 里出现 Electron 这个词，抖音就把**整套**客户端推广界面
    // 直接不渲染了——顶栏的「客户端」按钮从 DOM 里消失，全页提到"客户端"的元素从 2 个变 0 个。
    // 不是我们藏掉的，是它自己判断"我在客户端里"就不生成。这比逐条加规则干净得多。
    //
    // 逐个试出来的触发条件（都是重载后实测）：
    //   追加 " Electron/29.4.6"   → 客户端界面全消失 ✅
    //   追加 " douyin/1.0.0"      → 没用
    //   追加 " DouyinApp/1.0"     → 没用
    // 所以真正管用的是 Electron 这个标记本身。
    //
    // 关键：**追加**而不是整个替换。浏览器版本等其它信息原样保留，副作用最小。
    // 实测副作用：视频照常播放、feed 正常、没有新增脚本报错。
    //
    // ⚠️ 必须在页面初始化之前改，晚了就完全没用：
    // 实测在页面加载完之后再改 navigator.userAgent（哪怕再换路由强制重渲染），
    // 「客户端」按钮照样在——说明这个判断只在初始化时做一次，结果会被缓存。
    // 所以这段必须靠 @run-at document-start 抢在抖音脚本前面跑，别挪它的位置。
    // 另外实测确认：生效的确实是"页面里读到的 UA"这一层（没有动请求头），不是服务端判断。
    //
    // 天花板要说清楚：这仍然是"骗它"。抖音哪天把判断条件从 UA 换掉（比如改成查某个全局变量），
    // 这招就失效了——所以下面那些逐条藏元素的规则继续留着兜底，两条腿走路。
    uaSpoof: true,
    uaMarker: ' Electron/29.4.6',
  };

  const HIDDEN_CLASS = 'dyopt-hidden';
  // 用 visibility 隐藏：占位仍在，不会把下方元素顶上去
  const INVISIBLE_CLASS = 'dyopt-invisible';
  // 按钮尺寸上限：抖音顶栏按钮实测 40x44，放宽一点但不至于误伤布局容器
  const MAX_BOX_W = 80;
  const MAX_BOX_H = 60;
  const MAX_CLIMB = 8;

  const TEXT_SET = new Set(CFG.hideTexts);

  // ---------- 样式 ----------

  function buildCss() {
    const parts = ['.' + HIDDEN_CLASS + '{display:none !important}', '.' + INVISIBLE_CLASS + '{visibility:hidden !important}'];
    if (CFG.hideHrefs.length) {
      const sel = CFG.hideHrefs.map((h) => 'a[href*="' + h.replace(/"/g, '') + '"]').join(',');
      parts.push(sel + '{display:none !important}');
    }
    if (CFG.hideFooter) {
      // 用语义化 <footer> 定位，不依赖哈希类名；限定在左侧导航内，避免误伤别的 footer
      parts.push('[data-e2e="douyin-navigation"] footer{display:none !important}');
    }
    return parts.join('\n');
  }

  // 用可构造样式表，绕开页面 CSP 对 <style> 的限制；失败再回退
  let styleSheet = null;   // 记着注入进去的样式，好用来自检它还在不在
  let styleEl = null;
  function injectStyle(css) {
    try {
      if (typeof CSSStyleSheet === 'function') {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
        styleSheet = sheet;
        return;
      }
    } catch (e) { /* 回退 */ }
    try {
      const el = document.createElement('style');
      el.textContent = css;
      (document.head || document.documentElement).appendChild(el);
      styleEl = el;
    } catch (e) { /* 放弃 */ }
  }

  // 自检：注入的样式还在不在。页面要是把我们的样式表摘了，
  // 「安装包直链」「左下角 footer」这几条靠 CSS 的规则会**静默失效**——
  // 不报错、也不影响别的，最难发现。所以在每次扫描时顺手确认一下，掉了就补。
  function ensureStyle() {
    if (styleSheet && document.adoptedStyleSheets.includes(styleSheet)) return;
    if (styleEl && styleEl.isConnected) return;
    injectStyle(buildCss());
  }

  // ---------- 屏蔽元素 ----------

  function hide(el) {
    if (el.classList.contains(HIDDEN_CLASS)) return false;
    el.classList.add(HIDDEN_CLASS);
    // 内联样式兜底：React 重渲染可能覆盖 className，但通常不动 style
    el.style.setProperty('display', 'none', 'important');
    return true;
  }

  // 只让元素看不见，但保留它占的坑位，避免下方元素被顶上来
  function hideKeepSpace(el) {
    if (el.classList.contains(INVISIBLE_CLASS)) return false;
    el.classList.add(INVISIBLE_CLASS);
    el.style.setProperty('visibility', 'hidden', 'important');
    return true;
  }

  // 从叶子节点向上，取最外层"仍然只包含这个文案、且尺寸还是按钮级别"的祖先。
  // 要求路径上出现过 cursor:pointer，否则可能是评论/正文里恰好同名的文字。
  function resolveTarget(leaf, label) {
    let el = leaf;
    let target = null;
    let sawPointer = false;
    for (let i = 0; i < MAX_CLIMB && el && el !== document.body; i++) {
      if ((el.textContent || '').trim() !== label) break;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.width > MAX_BOX_W || r.height > MAX_BOX_H) break;
      if (getComputedStyle(el).cursor === 'pointer') sawPointer = true;
      target = el;
      el = el.parentElement;
    }
    return sawPointer ? target : null;
  }

  function collectLeaves(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (el.children.length) return NodeFilter.FILTER_SKIP;
        if (el.classList.contains(HIDDEN_CLASS)) return NodeFilter.FILTER_REJECT;
        return TEXT_SET.has((el.textContent || '').trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function scan() {
    if (!document.body) return 0;
    let count = 0;
    for (const leaf of collectLeaves(document.body)) {
      const label = (leaf.textContent || '').trim();
      const target = resolveTarget(leaf, label);
      if (target && hide(target)) count++;
    }
    return count;
  }

  // 左下角"© 抖音 + ICP 备案号"文字块。
  // 注意：它和下面一排图标按钮（设置等）装在同一个 position:fixed 容器里，
  // 只能隐藏这个文字块本身，绝不能连父容器一起藏——否则设置按钮会跟着消失。
  // 这里用 hideKeepSpace 而不是 hide：display:none 会让下方那排图标上移 42px。
  function hideComplianceBar() {
    if (!CFG.hideFooter) return;
    const summary = document.querySelector('[data-e2e="nav-compliance-summary"]');
    if (summary) hideKeepSpace(summary);
  }

  // 各处横幅：通知/消息面板的"下载客户端"，左下角的"下载抖音精选"，播放器那条，头像下拉那条。
  //
  // 注意这里只做**一次**全 DOM 查询，拿每个元素去比对所有规则。
  // 之前是每条规则各查一遍（4 条规则 = 4 次全量遍历），白跑三遍。
  function hidePromoBanners() {
    if (!ACTIVE_BANNERS.length) return;
    for (const el of document.querySelectorAll('div,span,p')) {
      // 只关心"直接挂着文字"的元素，纯容器直接跳过（绝大多数都是容器）
      let own = '';
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) own += n.textContent;
      }
      own = own.trim();
      if (!own) continue;

      for (const rule of ACTIVE_BANNERS) {
        if (!own.includes(rule.match)) continue;
        let target = null;
        let cur = el;
        for (let i = 0; i < rule.maxClimb && cur && cur !== document.body; i++) {
          const r = cur.getBoundingClientRect();
          const text = (cur.textContent || '').trim();
          // r.height <= 0 这一条是必须的：
          // 面板关着的时候整棵子树高度都是 0，只判「高度 ≤ 上限」的话条件永远成立，
          // 会一路爬过横幅、爬到面板容器上把它隐藏掉，消息面板就再也打不开了。
          if (r.height <= 0 || r.height > rule.maxH || text.length > rule.maxText) break;
          // 安全闸：里面还装着别的功能块（面板、列表、播放器都带 data-e2e）就绝不能连它一起藏。
          // 宁可横幅留着不藏，也不能把功能块藏坏。
          if (cur.querySelector('[data-e2e]')) break;
          target = cur;
          cur = cur.parentElement;
        }
        if (target) hide(target);
      }
    }
  }

  // 修复历史遗留：上面那个 bug 曾经给消息面板的祖先设过内联 display:none!important，
  // 而 React 重渲染会把 dyopt-hidden 类名冲掉、内联样式却留着 —— 面板就永久卡死了。
  // 这里顺着 im-dialog 往上，把没有我们类名却带着我们样式指纹的元素恢复回来。
  function repairStuckHidden() {
    const dlg = document.querySelector('[data-e2e="im-dialog"]');
    if (!dlg) return;
    let p = dlg.parentElement;
    while (p && p !== document.body) {
      const style = p.getAttribute('style') || '';
      if (/display\s*:\s*none\s*!important/i.test(style) && !p.classList.contains(HIDDEN_CLASS)) {
        p.style.removeProperty('display');
      }
      p = p.parentElement;
    }
  }

  // 把"下载客户端引导"的展示次数顶掉，让它一开始就不渲染。
  // 必须在抖音自己的初始化之前跑（脚本是 document-start），否则它已经读过这个值了。
  function suppressClientGuides() {
    if (!CFG.suppressClientGuides) return;
    for (const key of CFG.clientGuideKeys) {
      try {
        const raw = localStorage.getItem(key);
        let obj = null;
        if (raw) { try { obj = JSON.parse(raw); } catch (e) { obj = null; } }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
        obj.showTimes = 9999;
        obj.lastTimestamp = Date.now();
        localStorage.setItem(key, JSON.stringify(obj));
      } catch (e) { /* 隐私模式/被禁用时忽略 */ }
    }
  }

  // 往 UA 尾巴上加一个 Electron 标记，让抖音以为自己在桌面客户端里，
  // 于是整套"下载/登录客户端"的推广界面都不生成了。
  // 只动 userAgent 这一个属性，别的一概不碰——改得越少，出岔子的面越小。
  function spoofUa() {
    if (!CFG.uaSpoof) return;
    try {
      const real = navigator.userAgent;
      // 真在客户端里就别重复加了
      if (real.includes('Electron')) return;
      const spoofed = real + CFG.uaMarker;
      Object.defineProperty(Navigator.prototype, 'userAgent', {
        get: () => spoofed,
        configurable: true,
      });
    } catch (e) { /* 忽略 */ }
  }

  // 伪装成客户端之后的副作用：抖音会把"只有客户端才有的窗口按钮"（置顶/最小化/最大化/关闭）
  // 也渲染出来，挂在头像右边。普通浏览器里根本不会有这几个。
  // 它们都带 header-* 的 data-e2e，取**公共祖先**整块藏掉即可——不依赖哈希类名，也不怕它增减按钮。
  // 安全闸：只在该祖先里几乎没有文字时才动手，避免哪天结构变了把有内容的东西藏了。
  function hideClientWindowControls() {
    if (!CFG.hideClientWindowControls) return;
    const els = [...document.querySelectorAll('[data-e2e^="header-"]')];
    if (!els.length) return;
    let common = els[0];
    for (const e of els) {
      while (common && !common.contains(e)) common = common.parentElement;
    }
    if (!common || common === document.body || common === document.documentElement) return;
    if ((common.textContent || '').trim().length > 4) return;
    const r = common.getBoundingClientRect();
    if (r.height <= 0 || r.height > 120) return;
    hide(common);
  }

  // ---------- 资源占用 ----------

  let pauseOrigin = null;

  function pauseAll() {
    pauseOrigin = null;
    for (const v of document.querySelectorAll('video')) {
      if (v.paused) continue;
      pauseOrigin = v;
      try { v.pause(); } catch (e) { /* 忽略 */ }
    }
  }

  function resumePaused() {
    if (!pauseOrigin) return;
    const v = pauseOrigin.isConnected
      ? pauseOrigin
      : (document.querySelector('[data-e2e="feed-active-video"] video') || null);
    pauseOrigin = null;
    if (!v) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* 忽略 */ }
  }

  function onVisibility() {
    if (CFG.pauseWhenHidden) {
      if (document.hidden) pauseAll();
      else resumePaused();
    }
    // 切回前台补一轮：后台期间 schedule() 是直接返回的，不补的话
    // 那段时间冒出来的横幅要等下次 DOM 变化才会被处理。
    if (!document.hidden) schedule();
  }

  // 只保留当前视频附近的缓冲，其余 <video> 直接卸载，释放 MSE 占用
  function unloadFarVideos() {
    if (!CFG.unloadFarVideos) return;
    const activeBox = document.querySelector('[data-e2e="feed-active-video"]');
    if (!activeBox) return;
    const activeItem = activeBox.closest('[data-e2e="feed-item"]');
    if (!activeItem) return;
    const items = [...document.querySelectorAll('[data-e2e="feed-item"]')];
    const idx = items.indexOf(activeItem);
    if (idx < 0) return;
    items.forEach((item, i) => {
      if (Math.abs(i - idx) <= CFG.unloadKeepSlots) return;
      for (const v of item.querySelectorAll('video')) {
        if (!v.paused || v.readyState === 0) continue;
        try { v.removeAttribute('src'); v.load(); } catch (e) { /* 忽略 */ }
      }
    });
  }

  // ---------- 启动 ----------

  // 把短时间内的成批 DOM 变更合并掉，最多 250ms 扫一次（尾触发，扫的是最新状态）。
  // 原来是每帧变化就跑一次，问题在于：面板开合动画、异步列表渲染的"中间态"会被当成稳定态来判断，
  // 而横幅的尺寸判断恰恰依赖"已经排好版"这个前提。抖音一直在刷弹幕/进度，变更很密集，
  // 合并之后既避免误判，也省掉大量无谓的全 DOM 遍历。
  // 一次完整的处理。拆成函数是为了能单独计时（见 __dyOpt.bench），
  // 出问题时也好定位是哪一块慢。
  // sweepCount 记的是"全量扫描真正跑了几次"——正常情况下应该只有启动那几轮，
  // 加上横幅冒出来的那几次；如果它一直涨，说明筛子没拦住。
  let sweepCount = 0;
  function runAll() {
    sweepCount++;
    ensureStyle();
    try { scan(); } catch (e) { /* 忽略 */ }
    try { hideComplianceBar(); } catch (e) { /* 忽略 */ }
    try { hidePromoBanners(); } catch (e) { /* 忽略 */ }
    try { hideClientWindowControls(); } catch (e) { /* 忽略 */ }
    try { repairStuckHidden(); } catch (e) { /* 忽略 */ }
    try { unloadFarVideos(); } catch (e) { /* 忽略 */ }
  }

  // 前置筛子：把所有关注的关键词拼成一条正则。
  // 抖音页面一直在动（弹幕、进度、无限流），要是每次变化都跑全量扫描，
  // 就成了"每 400ms 烧 4ms"的常驻开销——而其中绝大多数变化都在视频区和评论里，跟我们无关。
  // 所以先对**新增的节点**做一次极便宜的文字筛：不含这些词就直接返回，全量扫描根本不启动。
  // 常驻成本从毫秒级降到微秒级，只有真冒出横幅时才会触发。
  //
  // 这个筛子不会漏：能被藏的元素，其文字必然含有这些关键词之一（hideTexts 是整块相等，
  // 也是子串；promoBanners 本来就是子串匹配）。所以"筛掉"的必然是我们本来也不会处理的东西。
  // 伪装生效时，"本来就是客户端推广"的那几条规则直接不参与——抖音根本不会生成那些界面，
  // 留着也只是白跑。伪装关掉时它们会自动回来，所以是"按条件跳过"，不是删掉。
  const ACTIVE_BANNERS = CFG.promoBanners.filter((r) => !(r.spoofCovers && CFG.uaSpoof));

  const WATCH_RE = new RegExp(
    CFG.hideTexts.concat(ACTIVE_BANNERS.map((r) => r.match)).join('|')
  );

  function onMutations(records) {
    for (const rec of records) {
      const added = rec.addedNodes;
      if (!added || !added.length) continue;
      for (const n of added) {
        if (n.nodeType !== 1) continue;                 // 只看元素，文字节点不用管
        const t = n.textContent;
        if (t && WATCH_RE.test(t)) { schedule(); return; }
      }
    }
  }

  let scanTimer = null;
  let lastScanAt = 0;
  function schedule() {
    if (scanTimer) return;
    // 标签页在后台就不扫了——用户看不见，扫了纯属白烧 CPU。
    // 切回前台时 onVisibility 会补一轮，所以不会漏掉后台期间冒出来的东西。
    if (typeof document.hidden === 'boolean' && document.hidden) return;
    // 400ms 合并一次。原来是 250ms，实测一轮 3ms，放宽到 400ms 又省掉三分之一，
    // 而横幅晚 0.4 秒出现肉眼根本看不出来。
    const wait = Math.max(0, 400 - (Date.now() - lastScanAt));
    scanTimer = setTimeout(() => {
      scanTimer = null;
      lastScanAt = Date.now();
      runAll();
    }, wait);
  }

  function boot() {
    runAll();
    // 只看 childList：自己改 class/style 不会触发，避免自激循环。
    // 回调走 onMutations 的便宜筛子，不是每次都跑全量扫描。
    new MutationObserver(onMutations).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('visibilitychange', onVisibility);
    if (CFG.pauseWhenHidden && document.hidden) pauseAll();
    // 首屏与 SPA 路由切换各补一轮
    for (const t of [300, 1000, 2500, 5000]) setTimeout(schedule, t);
  }

  function init() {
    // 这两个都必须抢在抖音自己的脚本前面：
    // 一个要在它读 localStorage 之前改掉展示次数，一个要在它读 UA 之前把标记加上
    suppressClientGuides();
    spoofUa();
    injectStyle(buildCss());
    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  // 控制台里跑 __dyOpt.bench() 就能看到每一块各花多少毫秒，用来确认没有哪块拖慢页面。
  function bench(n) {
    n = n || 20;
    const items = [
      ['ensureStyle 样式自检', ensureStyle],
      ['scan 藏按钮类', scan],
      ['hideComplianceBar 备案文字', hideComplianceBar],
      ['hidePromoBanners 各条横幅', hidePromoBanners],
      ['hideClientWindowControls 窗口按钮', hideClientWindowControls],
      ['repairStuckHidden 修复卡死', repairStuckHidden],
      ['unloadFarVideos 卸缓冲', unloadFarVideos],
    ];
    const out = [];
    for (const it of items) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { try { it[1](); } catch (e) { /* 忽略 */ } }
      out.push({ 项目: it[0], 单次毫秒: +((performance.now() - t0) / n).toFixed(3) });
    }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { try { runAll(); } catch (e) { /* 忽略 */ } }
    out.push({ 项目: '合计（一轮全跑）', 单次毫秒: +((performance.now() - t0) / n).toFixed(3) });
    return out.sort((a, b) => b.单次毫秒 - a.单次毫秒);
  }

  // 方便在控制台手动补扫 / 查当前隐藏数量
  window.__dyOpt = {
    scan,
    runAll,
    bench,
    stats: () => ({
      全量扫描次数: sweepCount,
      启用的横幅规则: ACTIVE_BANNERS.map((r) => r.match),
      被伪装顶掉的规则: CFG.promoBanners.filter((r) => r.spoofCovers && CFG.uaSpoof).map((r) => r.match),
      hidden: document.querySelectorAll('.' + HIDDEN_CLASS).length,
      videos: document.querySelectorAll('video').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    }),
  };

  init();
})();
