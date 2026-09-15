// ==UserScript==
// @name              手机视频脚本
// @description       全屏横屏、快进快退、长按倍速，对各种视频网站的兼容性很强。适用于谷歌内核的浏览器。使用前请先关闭同类横屏或手势脚本，以避免冲突。
// @version      1.9.10
// @author       shopkeeperV
// @match        *://*/*
// @run-at       document-idle
// @namespace https://greasyfork.org/users/452911
// ==/UserScript==
/*jshint esversion: 8*/
(function () {
    'use strict';

    // 样式按需注入：页面没有视频时一行 CSS 都不会加
    let meStyleElement = null;
    const ME_STYLES = `
        :not(:root):fullscreen{user-select:none !important;}

        /* ===== Miuix（MIUI/HyperOS）设计变量 ===== */
        .me-ui-base {
            --me-accent: #3482ff;
            --me-accent-press: #2b6fd8;
            --me-surface: rgba(255, 255, 255, 0.80);
            --me-surface-solid: rgba(255, 255, 255, 0.96);
            --me-fg: #0b0c0e;
            --me-fg-2: rgba(11, 12, 14, 0.58);
            --me-fg-3: rgba(11, 12, 14, 0.28);
            --me-fill: rgba(11, 12, 14, 0.06);
            --me-line: rgba(11, 12, 14, 0.08);
            --me-scrim: rgba(0, 0, 0, 0.28);
            --me-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
            --me-r-xl: 28px;
            --me-r-pill: 999px;
            --me-ease: cubic-bezier(0.2, 0.9, 0.25, 1);
            --me-font: "MiSans", "MiSans VF", "HarmonyOS Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", Roboto, sans-serif;

            font-family: var(--me-font);
            box-sizing: border-box;
            user-select: none !important;
            -webkit-user-select: none !important;
            -webkit-tap-highlight-color: transparent;
        }
        @media (prefers-color-scheme: dark) {
            .me-ui-base {
                --me-surface: rgba(28, 29, 32, 0.78);
                --me-surface-solid: rgba(26, 27, 30, 0.94);
                --me-fg: #f6f7f9;
                --me-fg-2: rgba(246, 247, 249, 0.60);
                --me-fg-3: rgba(246, 247, 249, 0.30);
                --me-fill: rgba(255, 255, 255, 0.10);
                --me-line: rgba(255, 255, 255, 0.10);
                --me-scrim: rgba(0, 0, 0, 0.46);
                --me-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
            }
        }

        /* 毛玻璃卡片 */
        .me-glass {
            background: var(--me-surface) !important;
            -webkit-backdrop-filter: saturate(180%) blur(20px) !important;
            backdrop-filter: saturate(180%) blur(20px) !important;
            border: 0.5px solid var(--me-line) !important;
            box-shadow: var(--me-shadow) !important;
            color: var(--me-fg) !important;
        }

        /* 容器是 BODY/HTML 时用 fixed，免得元素跟着文档滚走。
           注意必须用 class：这里的 position 带 !important，内联样式压不过它 */
        .me-fixed { position: fixed !important; }

        .me-icon { display: block; width: 18px; height: 18px; flex: none; }
        .me-icon path { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

        /* ===== 快进/快退提示（放在顶部按钮下面一条，避免和右侧按钮挤在一起） ===== */
        .me-notice {
            position: absolute !important;
            top: calc(env(safe-area-inset-top, 0px) + 62px) !important;
            left: 50% !important;
            display: flex !important;
            align-items: center;
            gap: 9px;
            visibility: hidden;
            opacity: 0;
            transform: translateX(-50%) scale(0.9);
            padding: 9px 17px !important;
            border-radius: var(--me-r-pill) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            letter-spacing: 0.2px !important;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            max-width: 86vw;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            transition: opacity 0.16s var(--me-ease), transform 0.24s var(--me-ease), visibility 0.24s !important;
        }
        .me-notice.me-show {
            visibility: visible !important;
            opacity: 1;
            transform: translateX(-50%) scale(1) !important;
        }
        .me-notice .me-notice-icon { color: var(--me-accent); }
        .me-notice.me-backward .me-notice-icon { transform: scaleX(-1); }
        .me-notice .me-notice-value { font-size: 16px !important; font-weight: 700 !important; }
        .me-notice .me-notice-sub { font-size: 12.5px !important; font-weight: 500 !important; color: var(--me-fg-2) !important; }

        /* ===== 倍速浮标 ===== */
        .me-speed-btn {
            position: absolute !important;
            top: calc(env(safe-area-inset-top, 0px) + 14px) !important;
            right: 16px !important;
            display: none;
            align-items: center;
            gap: 6px;
            height: 38px !important;
            padding: 0 14px !important;
            border-radius: var(--me-r-pill) !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            font-variant-numeric: tabular-nums;
            cursor: pointer;
            z-index: 2147483647 !important;
            transition: transform 0.12s var(--me-ease) !important;
        }
        .me-speed-btn:active { transform: scale(0.94) !important; }
        .me-speed-btn .me-speed-dot {
            width: 7px; height: 7px; border-radius: 50%;
            background: var(--me-accent); flex: none;
        }

        /* ===== 全屏按钮 ===== */
        .me-fullscreen-btn {
            position: absolute !important;
            top: calc(env(safe-area-inset-top, 0px) + 14px) !important;
            right: 16px !important;
            display: none;
            align-items: center;
            gap: 7px;
            height: 38px !important;
            padding: 0 15px !important;
            border-radius: var(--me-r-pill) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer;
            z-index: 2147483647 !important;
            transition: transform 0.12s var(--me-ease) !important;
        }
        .me-fullscreen-btn:active { transform: scale(0.95) !important; }

        /* ===== 倍速面板：竖屏底部抽屉 / 横屏右侧面板 ===== */
        .me-sheet-scrim {
            position: absolute !important;
            inset: 0 !important;
            background: var(--me-scrim) !important;
            visibility: hidden;
            opacity: 0;
            z-index: 2147483645 !important;
            transition: opacity 0.2s var(--me-ease), visibility 0.2s !important;
        }
        .me-sheet-scrim.me-open { visibility: visible !important; opacity: 1 !important; }

        .me-speed-sheet {
            position: absolute !important;
            display: block !important;
            visibility: hidden;
            opacity: 0;
            z-index: 2147483647 !important;
            border-radius: var(--me-r-xl) !important;
            overflow-y: auto !important;
            overscroll-behavior: contain;
            transition: transform 0.3s var(--me-ease), opacity 0.2s var(--me-ease), visibility 0.3s !important;
        }
        .me-speed-sheet.me-bottom {
            left: 0 !important; right: 0 !important; bottom: 0 !important;
            border-radius: var(--me-r-xl) var(--me-r-xl) 0 0 !important;
            padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 18px) !important;
            max-height: 62vh !important;
            transform: translateY(28px);
        }
        .me-speed-sheet.me-bottom.me-open { visibility: visible !important; opacity: 1 !important; transform: translateY(0) !important; }
        /* 横屏：居中面板 + 网格排布，18 个选项一屏放得下，不用滚动 */
        .me-speed-sheet.me-side {
            left: 50% !important; right: auto !important;
            top: 50% !important; bottom: auto !important;
            width: auto !important;
            max-width: 94vw !important;
            max-height: 88vh !important;
            padding: 2px 16px 16px !important;
            transform: translate(-50%, -50%) scale(0.92);
        }
        .me-speed-sheet.me-side.me-open { visibility: visible !important; opacity: 1 !important; transform: translate(-50%, -50%) scale(1) !important; }

        .me-sheet-grabber { width: 34px; height: 4px; border-radius: 2px; background: var(--me-fg-3); margin: 8px auto 2px; }
        .me-sheet-head {
            display: flex !important; align-items: center; justify-content: space-between;
            padding: 12px 2px 10px;
        }
        .me-sheet-title { font-size: 15px !important; font-weight: 700 !important; color: var(--me-fg) !important; }
        .me-sheet-now { font-size: 13px !important; font-weight: 600 !important; color: var(--me-accent) !important; font-variant-numeric: tabular-nums; }
        .me-speed-sheet.me-side .me-sheet-head { padding: 14px 2px 12px; }
        .me-speed-sheet.me-side .me-sheet-grabber { display: none !important; }

        .me-sheet-options { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; justify-content: center !important; }
        .me-speed-sheet.me-side .me-sheet-options {
            display: grid !important;
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            gap: 8px !important;
        }

        .me-speed-item {
            min-width: 60px !important;
            height: 38px !important;
            padding: 0 12px !important;
            border-radius: var(--me-r-pill) !important;
            background: var(--me-fill) !important;
            color: var(--me-fg) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            font-variant-numeric: tabular-nums;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center !important;
            cursor: pointer;
            transition: background 0.15s var(--me-ease), transform 0.1s var(--me-ease) !important;
        }
        .me-speed-sheet.me-side .me-speed-item { min-width: 0 !important; width: auto !important; padding: 0 6px !important; }
        .me-speed-item:active { transform: scale(0.94) !important; }
        .me-speed-item.me-active {
            background: var(--me-accent) !important;
            color: #ffffff !important;
            box-shadow: 0 4px 14px rgba(52, 130, 255, 0.36) !important;
        }

        @media (prefers-reduced-motion: reduce) {
            .me-notice, .me-speed-btn, .me-fullscreen-btn, .me-speed-sheet, .me-sheet-scrim, .me-speed-item { transition: none !important; }
        }
    `;

    let ensureStyles = function () {
        if (meStyleElement) return meStyleElement;
        meStyleElement = document.createElement("style");
        meStyleElement.textContent = ME_STYLES;
        (document.head || document.documentElement).appendChild(meStyleElement);
        return meStyleElement;
    };

    let longPressTimer = null;
    let longPressBackTimer = null;
    let activeLongPressVideo = null;
    // 活集合，.length 是 O(1)：用来做“这一页到底有没有视频”的最便宜判断
    const videos = document.getElementsByTagName("video");
    const iframes = document.getElementsByTagName("iframe");
    let pagePrepared = false;
    let iframeCountSeen = -1;

    let hasVideoResolution = function (video) {
        return video && video.videoWidth > 0 && video.videoHeight > 0;
    };

    let clearLongPressTimers = function () {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        if (longPressBackTimer) { clearTimeout(longPressBackTimer); longPressBackTimer = null; }
    };

    // 结束长按：恢复长按前的倍速和控制条。幂等，所有收尾路径都可以反复调用
    let endLongPress = function (video) {
        if (!video || !video.getAttribute("is_long_pressing")) return false;
        if (activeLongPressVideo === video) activeLongPressVideo = null;
        video.removeAttribute("is_long_pressing");
        if (video.__meControlsBeforeLongPress !== undefined) {
            video.controls = video.__meControlsBeforeLongPress;
            delete video.__meControlsBeforeLongPress;
        }
        video.playbackRate = video.__meRateBeforeLongPress !== undefined ? video.__meRateBeforeLongPress : 1;
        delete video.__meRateBeforeLongPress;
        return true;
    };

    // 兜底：touchend 和 touchcancel 都没收到时（页面被切走、系统手势打断、网页把元素换掉等），
    // 也不能让视频永远停在加速且没有控制条的状态
    let restoreStuckLongPress = function () {
        clearLongPressTimers();
        if (activeLongPressVideo) endLongPress(activeLongPressVideo);
    };

    // iframe 放行全屏：数量没变就直接返回（O(1)），不再用 MutationObserver 盯着整页
    let syncIframes = function () {
        if (iframes.length === iframeCountSeen) return;
        iframeCountSeen = iframes.length;
        for (let iframe of iframes) {
            iframe.allowFullscreen = true;
        }
    };

    // 页面真的有视频/iframe 时才做的初始化，而且只做一次
    let preparePage = function () {
        if (pagePrepared) return;
        if (!videos.length && !iframes.length) return;
        pagePrepared = true;
        ensureStyles();
        syncIframes();
    };

    let listenTarget = document;
    listen();

    // 收到收尾事件之外的任何“中断”，都把可能残留的长按状态清掉
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) restoreStuckLongPress();
    });
    window.addEventListener("blur", restoreStuckLongPress);

    // 固定参数：设置项和菜单已经删掉，行为全部按这里的默认值来
    const settings = {
        speed: true,         // 显示倍速浮标
        rate: 3,             // 长按倍速
        sensitivity1: 0.5,   // 长视频滑动灵敏度
        threshold: 300,      // 短视频阈值（秒）
        sensitivity2: 0.2    // 短视频滑动灵敏度
    };

    // 真正的初始化推迟到浏览器空闲时做；页面没有视频的话 preparePage 会立刻返回
    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(preparePage, {timeout: 2000});
    } else {
        setTimeout(preparePage, 1000);
    }

    function formatTime(seconds) {
        // 直播的 duration 是 Infinity，旧写法会显示出 “Infinity:NaN:NaN”
        if (!isFinite(seconds) || seconds < 0) return "--:--";
        let h = Math.floor(seconds / 3600);
        let m = Math.floor((seconds % 3600) / 60);
        let s = Math.floor(seconds % 60);
        let res = "";
        if (h > 0) res += (h < 10 ? "0" + h : h) + ":";
        res += (m < 10 ? "0" + m : m) + ":";
        res += (s < 10 ? "0" + s : s);
        return res;
    }

    const SPEED_VALUES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16];

    function formatRate(value) {
        return (Math.round(value * 100) / 100) + "×";
    }

    // 容器是 BODY/HTML 时改用 fixed 定位，避免元素跟着文档滚走
    function anchorMode(container, element) {
        if (container.tagName === "BODY" || container.tagName === "HTML") {
            element.classList.add("me-fixed");
        }
        return element;
    }

    // ---- 全屏按钮：Miuix 胶囊 + 线性图标 ----
    function showFullscreenButton(componentContainer, videoElement) {
        if (!componentContainer || !videoElement) return;
        if (!videoElement.controls || document.fullscreenElement) return;

        ensureStyles();
        let btn = componentContainer.querySelector(":scope>.me-fullscreen-btn");
        if (!btn) {
            btn = document.createElement("div");
            btn.className = "me-fullscreen-btn me-ui-base me-glass";
            anchorMode(componentContainer, btn);
            btn.innerHTML = `<svg class="me-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9"></path><path d="M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9"></path><path d="M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15"></path><path d="M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15"></path></svg><span>全屏</span>`;
            componentContainer.append(btn);
            const goFullscreen = async (e) => {
                e.stopPropagation();
                btn.style.display = "none";
                try {
                    await componentContainer.requestFullscreen();
                } catch (err) {
                    console.log("全屏请求失败:", err);
                }
            };
            btn.addEventListener("touchstart", goFullscreen);
            btn.addEventListener("click", goFullscreen);
        }
        btn.style.display = "flex";

        if (btn._hideTimer) clearTimeout(btn._hideTimer);
        btn._hideTimer = setTimeout(() => {
            btn.style.display = "none";
            btn._hideTimer = null;
        }, 3000);
    }

    // ---- 倍速浮标：3 秒后自动收起 ----
    function autoHideSpeedBtn(speedBtn) {
        if (!speedBtn) return;
        if (speedBtn._hideTimer) clearTimeout(speedBtn._hideTimer);
        speedBtn._hideTimer = setTimeout(() => {
            speedBtn.style.display = "none";
            speedBtn._hideTimer = null;
        }, 3000);
    }

    // ---- 倍速面板：竖屏底部抽屉 / 横屏右侧面板，配一层 scrim ----
    function createSpeedSheet(container, video) {
        const scrim = document.createElement("div");
        scrim.className = "me-sheet-scrim me-ui-base";
        // 只有“轻点”才关闭。原来 touchstart 就关，而横屏面板窄、手指滑动时
        // 常常压在面板外面，结果一滑面板就没了
        let scrimStartX = 0, scrimStartY = 0;
        scrim.addEventListener("touchstart", (e) => {
            const t = e.touches[0];
            if (t) { scrimStartX = t.clientX; scrimStartY = t.clientY; }
        }, {passive: true});
        scrim.addEventListener("touchend", (e) => {
            const t = e.changedTouches[0];
            if (!t) return;
            if (Math.abs(t.clientX - scrimStartX) < 12 && Math.abs(t.clientY - scrimStartY) < 12) {
                e.stopPropagation();
                closeSpeedSheet(container);
            }
        }, {passive: true});
        // 注意：这里不能监听 click。手机上点浮标打开面板后，浏览器还会补一个合成 click，
        // 落点正好是刚显示的遮罩 → 面板会“刚打开就消失”
        anchorMode(container, scrim);
        container.appendChild(scrim);

        const sheet = document.createElement("div");
        sheet.className = "me-speed-sheet me-ui-base me-glass";
        sheet.innerHTML = `<div class="me-sheet-grabber"></div>
            <div class="me-sheet-head"><span class="me-sheet-title">播放速度</span><span class="me-sheet-now"></span></div>
            <div class="me-sheet-options"></div>`;
        const options = sheet.querySelector(".me-sheet-options");
        SPEED_VALUES.forEach(value => {
            const item = document.createElement("div");
            item.className = "me-speed-item";
            item.dataset.rate = value;
            item.textContent = formatRate(value);
            let pressX = 0, pressY = 0;
            item.addEventListener("touchstart", (e) => {
                e.stopPropagation();
                const t = e.touches[0];
                if (t) { pressX = t.clientX; pressY = t.clientY; }
            }, {passive: true});
            item.addEventListener("touchend", (e) => {
                const t = e.changedTouches[0];
                // 只有轻点才生效。改成 touchstart 就生效的话，手指按在选项上滑动会立刻误选并关闭面板
                if (t && (Math.abs(t.clientX - pressX) > 12 || Math.abs(t.clientY - pressY) > 12)) return;
                e.stopPropagation();
                let target = sheet.__video;
                if (!target) return;
                target.playbackRate = value;
                closeSpeedSheet(container);
                // 有些播放器会在几毫秒后把倍速改回去，这里补一次
                setTimeout(() => {
                    if (target.playbackRate !== value) target.playbackRate = value;
                }, 500);
            }, {passive: true});
            options.appendChild(item);
        });
        anchorMode(container, sheet);
        container.appendChild(sheet);
        return sheet;
    }

    function openSpeedSheet(container, video, speedBtn) {
        ensureStyles();
        let sheet = container.querySelector(":scope>.me-speed-sheet");
        if (!sheet) sheet = createSpeedSheet(container, video);
        const scrim = container.querySelector(":scope>.me-sheet-scrim");
        sheet.__video = video;

        // 横屏放右侧面板，竖屏放底部抽屉
        const landscape = window.innerWidth >= window.innerHeight;
        sheet.classList.toggle("me-side", landscape);
        sheet.classList.toggle("me-bottom", !landscape);

        // 当前倍速就是视频现在的倍速（不再有“记忆倍速”这一说）
        const currentRate = video.playbackRate;
        sheet.querySelector(".me-sheet-now").textContent = formatRate(video.playbackRate);
        sheet.querySelectorAll(".me-speed-item").forEach(item => {
            item.classList.toggle("me-active", parseFloat(item.dataset.rate) === currentRate);
        });

        if (speedBtn) speedBtn.style.display = "none";
        void sheet.offsetWidth;   // 强制一次重排，保证第一次打开也有动画
        scrim.classList.add("me-open");
        sheet.classList.add("me-open");
    }

    function closeSpeedSheet(container) {
        const sheet = container.querySelector(":scope>.me-speed-sheet");
        const scrim = container.querySelector(":scope>.me-sheet-scrim");
        if (sheet) sheet.classList.remove("me-open");
        if (scrim) scrim.classList.remove("me-open");
    }

    function listen() {
        let touchState = {
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0,
            isMoving: false,
            isLongPress: false,
            videoElement: null,
            componentContainer: null,
            notice: null,
            direction: 0,
            timeChange: 0,
            playing: false,
            gestureActive: false,
            gestureId: 0,
            touchIdentifier: null,
            target: null,
            maybeTiktok: false,
            allParents: []
        };

        listenTarget.addEventListener("touchstart", (e) => {
            // 每次触摸只做两件 O(1) 的事：补 iframe 的 allowfullscreen、判断这页到底有没有视频
            if (iframes.length) syncIframes();
            if (!videos.length) return;

            // 落在自己 UI（倍速面板/遮罩/浮标/全屏按钮）上的触摸不算视频手势，
            // 否则在面板里滑动会误触长按、快进，还会把提示条塞进面板里
            if (e.target && e.target.closest && e.target.closest(".me-speed-sheet, .me-sheet-scrim, .me-speed-btn, .me-fullscreen-btn, .me-notice")) return;

            preparePage();
            // 上一次触摸如果没收到 touchend/touchcancel，先把它留下的加速状态清干净
            restoreStuckLongPress();

            touchState.isMoving = false;
            touchState.isLongPress = false;
            touchState.direction = 0;
            touchState.timeChange = 0;

            if (e.touches.length !== 1) return;

            // 收尾事件靠这个编号判断自己是不是迟到的、属于上一个手势的那一个
            const gestureId = ++touchState.gestureId;
            touchState.gestureActive = true;
            
            // 全屏时避开屏幕最外圈 5%（系统手势区）。这里必须用视口坐标：
            // screenX/screenY 是相对物理屏幕的，会带上窗口/视觉视口的偏移，
            // 横屏旋转后也容易错位，导致正常触摸被误判成"落在边缘"而失效
            let startX = Math.ceil(e.touches[0].clientX);
            let startY = Math.ceil(e.touches[0].clientY);
            if (document.fullscreenElement) {
                if (startX < window.innerWidth * 0.05 || startX > window.innerWidth * 0.95 ||
                    startY < window.innerHeight * 0.05 || startY > window.innerHeight * 0.95) return;
            }

            touchState.startX = startX;
            touchState.startY = startY;
            touchState.endX = touchState.startX;
            touchState.endY = touchState.startY;
            touchState.touchIdentifier = e.touches[0].identifier;
            touchState.target = e.target;
            
            let target = touchState.target;
            let biggestContainer;
            let targetWidth = target.clientWidth;
            let targetHeight = target.clientHeight;
            let suitParents = [];
            touchState.allParents = [];
            let temp = target;
            touchState.maybeTiktok = false;

            while (true) {
                temp = temp.parentElement;
                if (!temp) return;
                touchState.allParents.push(temp);
                if (temp.clientWidth > 0 && temp.clientWidth < targetWidth * 1.2 &&
                    temp.clientHeight > 0 && temp.clientHeight < targetHeight * 1.2) {
                    suitParents.push(temp);
                }
                if (temp.tagName === "BODY" || temp.tagName === "HTML" || !temp.parentElement) {
                    if (suitParents.length > 0) biggestContainer = suitParents[suitParents.length - 1];
                    else if (target.tagName !== "VIDEO") return;
                    suitParents = null;
                    break;
                }
            }

            touchState.videoElement = (target.tagName === "VIDEO") ? target : (biggestContainer.getElementsByTagName("video")[0]);
            if (!touchState.videoElement) return;

            if (!document.fullscreenElement && top === window && !touchState.videoElement.controls &&
                target.clientHeight > window.innerHeight * 0.8 && target.clientWidth > window.innerWidth * 0.8) {
                touchState.maybeTiktok = true;
            }
            if (!touchState.maybeTiktok && targetHeight > touchState.videoElement.clientHeight * 1.5) return;

            touchState.playing = !touchState.videoElement.paused;

            touchState.componentContainer = findComponentContainer(target, touchState.videoElement);
            makeTagAQuiet(touchState.allParents);

            if (!touchState.videoElement.getAttribute("disable_contextmenu")) {
                touchState.videoElement.addEventListener("contextmenu", (e) => e.preventDefault());
                touchState.videoElement.setAttribute("disable_contextmenu", true);
            }

            if (touchState.componentContainer.tagName !== "BODY" && touchState.componentContainer.tagName !== "HTML" && window.getComputedStyle(touchState.componentContainer).position === 'static') {
                touchState.componentContainer.style.position = 'relative';
            }

            touchState.notice = touchState.componentContainer.querySelector(`:scope>.me-notice`);
            if (!touchState.notice) {
                touchState.notice = document.createElement("div");
                touchState.notice.className = "me-notice me-ui-base me-glass";
                anchorMode(touchState.componentContainer, touchState.notice);
                touchState.notice.innerHTML = `<svg class="me-icon me-notice-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6l6 6-6 6"></path><path d="M13.5 6l6 6-6 6"></path></svg><span class="me-notice-value"></span><span class="me-notice-sub"></span>`;
                touchState.noticeValue = touchState.notice.querySelector(".me-notice-value");
                touchState.noticeSub = touchState.notice.querySelector(".me-notice-sub");
                touchState.componentContainer.appendChild(touchState.notice);
            }

            longPressTimer = setTimeout(() => {
                longPressTimer = null;

                // 手指已经抬起、手势被取消、或者已经是另一个手势了：这次长按作废，
                // 绝不能“幽灵加速”（这是原来收不到 touchend 就永久卡在加速的根因）
                if (!touchState.gestureActive || touchState.gestureId !== gestureId) return;

                let videoElement = touchState.videoElement;
                if (!videoElement || !videoElement.isConnected) return;
                if (!hasVideoResolution(videoElement)) return;

                if (touchState.playing && videoElement.paused) {
                    videoElement.play().catch(() => {});
                }

                longPressBackTimer = setTimeout(() => {
                    // 有的播放器会把倍速改回去，这里再补一次
                    if (videoElement.playbackRate !== settings.rate) {
                        videoElement.playbackRate = settings.rate;
                    }
                }, 500);

                videoElement.__meControlsBeforeLongPress = videoElement.controls;
                videoElement.__meRateBeforeLongPress = videoElement.playbackRate;
                videoElement.setAttribute("is_long_pressing", "true");
                videoElement.playbackRate = settings.rate;
                videoElement.controls = false;
                touchState.isLongPress = true;
                activeLongPressVideo = videoElement;

                if (!document.fullscreenElement || videoElement.readyState === 0 || !settings.speed) return;
                
                let speedBtn = touchState.componentContainer.querySelector(`:scope>.me-speed-btn`);
                if (!speedBtn) {
                    speedBtn = document.createElement("div");
                    speedBtn.className = "me-speed-btn me-ui-base me-glass";
                    speedBtn.innerHTML = `<span class="me-speed-dot"></span><span class="me-speed-label"></span>`;
                    anchorMode(touchState.componentContainer, speedBtn);
                    touchState.componentContainer.appendChild(speedBtn);
                    // 点浮标打开倍速面板
                    speedBtn.addEventListener("touchstart", (event) => {
                        event.stopPropagation();
                        if (speedBtn._hideTimer) {
                            clearTimeout(speedBtn._hideTimer);
                            speedBtn._hideTimer = null;
                        }
                        openSpeedSheet(touchState.componentContainer, touchState.videoElement, speedBtn);
                    }, {passive: true});
                }
                speedBtn.querySelector(".me-speed-label").textContent = formatRate(videoElement.playbackRate);
                speedBtn.style.display = "flex";
                autoHideSpeedBtn(speedBtn);
            }, 800);

            // 收尾监听到 document 上，而不是挂在触摸目标元素上：
            // 目标元素被网页换掉或移除时，挂在它身上的 touchend 就再也不会触发。
            // 另外补上 touchcancel —— 系统手势、下拉刷新、切页面都会取消触摸，原来完全没处理
            listenTarget.addEventListener("touchmove", touchmoveHandler, {passive: false});
            listenTarget.addEventListener("touchend", touchendHandler, {once: true});
            listenTarget.addEventListener("touchcancel", touchendHandler, {once: true});

            function makeTagAQuiet(allParents) {
                for (let element of allParents) {
                    if (element.tagName === "A" && !element.getAttribute("disable_menu_and_drag")) {
                        element.addEventListener("contextmenu", (e) => e.preventDefault());
                        element.draggable = false;
                        element.setAttribute("disable_menu_and_drag", true);
                        element.target = "_blank";
                        break;
                    }
                }
            }

            function findComponentContainer(target, videoElement) {
                if (target.tagName === "VIDEO") {
                    let temp = videoElement;
                    while (temp.parentElement && temp.parentElement.tagName !== "BODY" && (temp.parentElement.clientWidth === 0 || temp.parentElement.clientHeight === 0)) {
                        temp = temp.parentElement;
                    }
                    return temp.parentElement;
                }
                return target;
            }

            function touchmoveHandler(moveEvent) {
                if (touchState.gestureId !== gestureId || !touchState.gestureActive) return;

                // 只有手指明显移动了才撤销长按：按住不动时轻微抖动也会产生 touchmove，
                // 原来一律撤销，长按就很容易“不灵”
                let movingTouch = (moveEvent.touches.length === 1) ? moveEvent.touches[0] : null;
                if (!movingTouch || movingTouch.identifier !== touchState.touchIdentifier) {
                    clearLongPressTimers();
                } else if (Math.abs(Math.ceil(movingTouch.clientX) - touchState.startX) > 10 ||
                           Math.abs(Math.ceil(movingTouch.clientY) - touchState.startY) > 10) {
                    clearLongPressTimers();
                }

                if (moveEvent.touches.length === 1 && moveEvent.touches[0].identifier === touchState.touchIdentifier) {
                    let tempX = Math.ceil(moveEvent.touches[0].clientX);
                    let tempY = Math.ceil(moveEvent.touches[0].clientY);
                    
                    let diffX = Math.abs(tempX - touchState.startX);
                    let diffY = Math.abs(tempY - touchState.startY);
                    
                    if (!touchState.direction) {
                        if (diffY > diffX && diffY > 10) {
                            return; 
                        }
                    }
                    
                    if (tempX === touchState.endX) return;
                    touchState.endX = tempX;
                    touchState.endY = tempY;
                }
                
                if (touchState.endX > touchState.startX + 10) {
                    if (!touchState.direction) touchState.direction = 1;
                    touchState.timeChange = (touchState.direction === 1) ? Math.round((touchState.endX - touchState.startX - 10) * (touchState.videoElement.duration <= settings.threshold ? settings.sensitivity2 : settings.sensitivity1)) : 0;
                    moveEvent.preventDefault();
                    touchState.isMoving = true;
                } else if (touchState.endX < touchState.startX - 10) {
                    if (!touchState.direction) touchState.direction = 2;
                    touchState.timeChange = (touchState.direction === 2) ? Math.round((touchState.endX - touchState.startX + 10) * (touchState.videoElement.duration <= settings.threshold ? settings.sensitivity2 : settings.sensitivity1)) : 0;
                    moveEvent.preventDefault();
                    touchState.isMoving = true;
                } else { 
                    touchState.timeChange = 0; 
                    return; 
                }

                if (touchState.direction) {
                    if (!touchState.noticeValue && touchState.notice) {
                        touchState.noticeValue = touchState.notice.querySelector(".me-notice-value");
                        touchState.noticeSub = touchState.notice.querySelector(".me-notice-sub");
                    }
                    touchState.notice.classList.add("me-show");
                    touchState.notice.classList.toggle("me-backward", touchState.direction === 2);
                    let targetTime = Math.max(0, Math.min(touchState.videoElement.duration, touchState.videoElement.currentTime + touchState.timeChange));
                    touchState.noticeValue.textContent = Math.abs(touchState.timeChange) + "s";
                    touchState.noticeSub.textContent = formatTime(targetTime) + " / " + formatTime(touchState.videoElement.duration);
                }
            }

            function touchendHandler() {
                listenTarget.removeEventListener("touchmove", touchmoveHandler);
                listenTarget.removeEventListener("touchend", touchendHandler);
                listenTarget.removeEventListener("touchcancel", touchendHandler);

                // 迟到的、属于上一个手势的收尾事件直接丢弃
                if (touchState.gestureId !== gestureId || !touchState.gestureActive) return;
                touchState.gestureActive = false;
                clearLongPressTimers();

                if (touchState.notice) {
                    touchState.notice.classList.remove("me-show");
                }
                
                if (!touchState.isLongPress && touchState.videoElement && touchState.videoElement.controls && !document.fullscreenElement) {
                    showFullscreenButton(touchState.componentContainer, touchState.videoElement);
                }

                if (touchState.isMoving && touchState.playing && touchState.videoElement.paused && !touchState.maybeTiktok) {
                    setTimeout(() => {
                        touchState.videoElement.play().catch(() => {});
                    }, 500);
                }
                
                if (touchState.isLongPress) {
                    endLongPress(touchState.videoElement);
                    touchState.isLongPress = false;
                }
                
                if (touchState.isMoving && touchState.timeChange !== 0) {
                    touchState.videoElement.currentTime += touchState.timeChange;
                }

                // 手势收尾，清掉本次手势的数据，避免被后面不相关的触摸事件复用
                touchState.isMoving = false;
                touchState.timeChange = 0;
                touchState.direction = 0;
            }
        }, {capture: true, passive: true});
    }

    // 有的浏览器没有 screen.orientation.lock（iOS Safari、部分桌面浏览器），
    // 原来的写法会在这里直接抛异常，把脚本后面的初始化全打断
    let nativeOrientationLock = (screen.orientation && typeof screen.orientation.lock === "function")
        ? screen.orientation.lock.bind(screen.orientation)
        : function () { return Promise.resolve(); };
    if (screen.orientation) {
        screen.orientation.lock = async function () { console.log("网页自带js试图执行lock()。"); };
    }

    if (top === window) {
        window.addEventListener("message", async (e) => {
            if (typeof e.data === 'string' && e.data.includes("MeVideoJS") && document.fullscreenElement) {
                try { await nativeOrientationLock("landscape"); } catch (err) {}
            }
        });
    }

    let inTimes = 0, isThisWindow = false;
    // 用 fullscreenchange 判断全屏进出，不再监听 resize：手机上地址栏收起/滚动都会触发
    // resize，原写法每次都要等 500ms 再跑一遍，白耗性能
    document.addEventListener("fullscreenchange", fullscreenHandler);
    document.addEventListener("webkitfullscreenchange", fullscreenHandler);

    async function fullscreenHandler() {
        let _fullscreenElement = document.fullscreenElement;
        if (_fullscreenElement) {
            if (_fullscreenElement.tagName === "IFRAME") return;
            isThisWindow = true; inTimes++;
        } else if (inTimes > 0) { inTimes = 0; } else return;
        
        if (inTimes !== 1) return;
        let videoElement = (_fullscreenElement.tagName === "VIDEO") ? _fullscreenElement : _fullscreenElement.getElementsByTagName("video")[0];
        if (videoElement) {
            let changeHandler = async function () {
                if (videoElement.videoHeight < videoElement.videoWidth) {
                    if (top === window) {
                        try { await nativeOrientationLock("landscape"); } catch (err) {}
                    } else top.postMessage("MeVideoJS", "*");
                }
            };
            if (videoElement.readyState < 1) videoElement.addEventListener("loadedmetadata", changeHandler, {once: true});
            else await changeHandler();
        }
    }
})();
