// ==UserScript==
// @name         链接精简 · Link Slimmer
// @namespace    link-slimmer.local
// @version      1.2.0
// @description  悬浮球自动吸附浏览器边缘,一键提取文本中所有链接并精简为最简形式;内置 B站/百度/豆瓣/知乎/微博/淘宝/天猫/京东/抖音/快手/YouTube/小红书 平台规则,页面右上角可复制当前网页地址
// @author       guliacer
// @match        *://*/*
// @match        file:///*
// @run-at       document-idle
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  /* ============================================================
   * 一、URL 精简引擎
   * ============================================================ */

  // 纯统计 / 追踪 / 分享来源参数，直接删除
  const TRACK_EXACT = new Set([
    // 广告平台
    'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gadid', 's_kwcid',
    'fbclid', 'twclid', 'ttclid', 'msclkid', 'yclid', 'igshid', 'igsh', 'ig_rid',
    // 邮件 / 营销平台
    'mc_eid', 'mc_cid', 'mkt_tok', '_hsenc', '_hsmi', '_hsq',
    // 统计
    '_ga', '_gl', '_gac', '_gid', '__twitter_impression', '_openstat',
    'vero_id', 'vero_conv', 'oly_anon_id', 'oly_enc_id', 'wickedid',
    // B 站
    'from_source', 'from_spmid', 'from_view', 'vd_source', 'buvid_source',
    'spm_id_from', 'spmid', 'unique_k', 'msource',
    // YouTube
    'si', 'feature', 'pp', 'ab_channel',
    // 各站分享
    'share_source', 'share_medium', 'share_plat', 'share_tag', 'share_token',
    'share_origin', 'share_session_id', 'sns_share', 'weibo_id',
    'jumpfrom', 'jump_from', 'jump_wxa',
    // 通用
    'ref', 'ref_src', 'ref_url', 'referrer', 'referer', 'from', 'fr', 'fr_src',
    'spm', 'scm'
  ]);

  // 前缀匹配的追踪参数
  const TRACK_PREFIXES = [
    /^utm/, /^ga_/, /^_ga/, /^mc_/, /^_hs/, /^hsa_/,
    /^spm/, /^rsv_/, /^pk_/, /^piwik_/, /^oly_/, /^vero_/, /^nsukey/
  ];

  // 跳转中转参数：如果值是完整链接，则解包成真实地址
  const JUMP_PARAMS = new Set([
    'url', 'u', 'link', 'target', 'goto', 'redirect', 'redirect_uri',
    'redirect_url', 'redirect_to', 'jump', 'jumpurl', 'tourl', 'out',
    'outlink', 'surl', 'realurl', 'real_url', 'trueurl', 'target_url',
    'dest', 'destination', 'desturl', 'dest_url', 'forward'
  ]);

// 站点专属规则。不放进全局名单,是因为其中的参数在别站可能是正常功能参数
  //   (例如 source / ref / type / t / sp 在各站含义完全不同)
  // - dropParams  该站确认无用的参数,直接删
  // - keepParams  该站务必保留的参数,优先级最高,压过 dropParams 与全局追踪名单
  // - pathRewrite 规范化为更短的等价路径,[1] 捕获到的是内容 id
  //
  // 规则来源:真实浏览器访问各站,读取页面自己声明的 <link rel="canonical">。
  // canonical 会丢掉「给人用的」参数(如 B站的 t= 起播秒数、YouTube 的 sp= 筛选器),
  // 所以这类参数一律写进 keepParams —— 只按 canonical 精简会破坏用户意图。
  const SITE_RULES = [
    /* ---------------- 小红书 ---------------- */
    {
      // source / xhsshare / xsec_source 是无用的分享来源标记,直接删掉;
      // xsec_token 必须保留 —— 实测它是免登录查看笔记的凭证,删掉后对方打开会落到
      // /404/sec_... 反爬页(error_code=300031),链接即失效
      host: /(^|\.)xiaohongshu\.com$/i,
      dropParams: ['source', 'xhsshare', 'xsec_source'],
      keepParams: ['xsec_token'],
      pathRewrite: [[/^\/discovery\/item\/([^/]+)$/, '/explore/$1']]
    },

    /* ---------------- 哔哩哔哩 ---------------- */
    {
      // canonical 为 https://www.bilibili.com/video/BVxxx/ —— 所有分享参数都多余。
      // 但 t(起播秒数)、p(第几分P)、autoplay/danmaku 是给人用的,必须保留
      host: /(^|\.)bilibili\.com$/i,
      dropParams: [
        'spm_id_from', 'spmid', 'vd_source', 'from_source', 'from_spmid',
        'from_outer_spmid', 'buvid', 'seid', 'share_source', 'share_medium',
        'share_plat', 'share_tag', 'share_token', 'share_origin', 'share_session_id',
        'timestamp', 'unique_k', 'bbid', 'msource', 'broadcast_type',
        'search_source'
      ],
      keepParams: ['t', 'p', 'bvid', 'aid', 'cid', 'ep_id', 'season_id', 'autoplay', 'danmaku', 'muted']
    },

    /* ---------------- 百度 ---------------- */
    {
      // 百度搜索是 rsv_* / tn / f / oq 一串来源标记的重灾区。
      // keepParams:wd/word 是关键词,pn/rn 是翻页,lm 是时间筛选 —— 丢了会改变搜索结果
      host: /(^|\.)baidu\.com$/i,
      dropParams: [
        'rsv_spt', 'rsv_iqid', 'rsv_bp', 'rsv_pq', 'rsv_t', 'rsv_dl',
        'rsv_sug1', 'rsv_sug2', 'rsv_sug3', 'rsv_sug4', 'rsv_sug5', 'rsv_sug6', 'rsv_sug7', 'rsv_sug8',
        'tn', 'f', 'oq', 'ie', 'ct', 'sugid', 'sug', 'inputT', 'bs',
        'from', 'fr', 'isbd', 'isid', 'isjb', 'issp', 'fenlei', 'cl', 'forcelogin'
      ],
      keepParams: ['wd', 'word', 'q', 'pn', 'rn', 'lm', 'kw', 'query', 'type', 't', 's', 'sort', 'gpc']
    },

    /* ---------------- 豆瓣 ---------------- */
    {
      // canonical 完全不带 query;from / dt_dapp / _i 都是来源标记
      host: /(^|\.)douban\.com$/i,
      dropParams: ['from', 'dt_dapp', '_i', 'source', 'ref', 'referer'],
      keepParams: ['start', 'sort', 'cat', 'q', 'type', 'tag', 'p', 'status', 'limit', 'subject']
    },

    /* ---------------- 知乎 ---------------- */
    {
      // 不要删 type —— 它是搜索分类;q 是关键词,两者都是功能参数
      host: /(^|\.)zhihu\.com$/i,
      dropParams: ['utm_source', 'utm_medium', 'utm_campaign', 'from', 'ref', 'search_source', 's_src', 's_r'],
      keepParams: ['q', 'type', 'sort', 'filter', 'offset', 'limit', 'order']
    },

    /* ---------------- 微博 ---------------- */
    {
      // from / mod / refer_flag / Refer 都是分享来源标记。
      // 注意 type=comment 是「直达评论区」,属于用户意图,必须保留,不能删
      host: /(^|\.)weibo\.(com|cn)$/i,
      dropParams: ['from', 'mod', 'refer_flag', 'Refer', 'referrer', 'entry', 'source', 'topnav', 'wvr', 'typeall', 'suball'],
      keepParams: ['q', 'page', 'uid', 'id', 'mid', 'status_id', 'aid', 'band_rank', 'type', 'is_all']
    },

    /* ---------------- 淘宝 / 天猫 ---------------- */
    {
      // 商品 id 是核心,必须保留;spm / scm / ali_trackid / utparam 是联盟追踪
      host: /(^|\.)(taobao|tmall|1688)\.com$/i,
      dropParams: [
        'spm', 'scm', 'ali_trackid', 'ali_refid', 'ali_ab', 'utparam', 'from',
        'source', 'ref', 'refer', 'tracelog', 'relationId', 'xxc', 'pvid', 'clickTrackInfo'
      ],
      keepParams: ['id', 'itemId', 'item_id', 'skuId', 'sku_id', 'num_iid', 'sellerId', 'cat_id', 'q', 'keyword', 's']
    },

    /* ---------------- 京东 ---------------- */
    {
      // 京东详情/搜索都极易触发登录墙,规则按 canonical 与已知联盟参数整理
      host: /(^|\.)jd\.com$/i,
      dropParams: [
        'spm', 'dist', 'utm_source', 'utm_medium', 'utm_campaign',
        'from', 'source', 'pvid', 'cu', 'cp', 'ali_trackid', 'extension_id', 'resourceType'
      ],
      keepParams: ['keyword', 'enc', 'q', 'psort', 'ev', 'wq', 'sku', 'page', 'sort', 'cat', 'cid']
    },

    /* ---------------- 抖音 ---------------- */
    {
      // 实测:输入一串 search / enter 来源参数,抖音自己把它收敛为
      // https://www.douyin.com/video/<id>?modeFrom=search,canonical 不带任何参数
      host: /(^|\.)(douyin|iesdouyin)\.com$/i,
      dropParams: [
        'previous_page', 'enter_from', 'region', 'search_source', 'modeFrom',
        'source', 'from', 'ref', 'previous_page_position', 'is_from_note', 'biz_tag'
      ],
      keepParams: ['vid', 'modal_id', 'type', 'keyword', 'search_channel', 'aweme_id', 'item_id']
    },

    /* ---------------- 快手 ---------------- */
    {
      // canonical 把 /search/video?searchKey=咖啡机&source=search 归一为 /search/咖啡机
      host: /(^|\.)kuaishou\.com$/i,
      dropParams: ['source', 'streamSource', 'area', 'authorId', 'previousPage', 'enterFrom', 'from', 'ref'],
      keepParams: ['searchKey', 'keyword', 'q', 'photoId', 'videoId', 'userId', 'pcursor', 'page']
    },

    /* ---------------- YouTube ---------------- */
    {
      // canonical 为 https://www.youtube.com/watch?v=dQw4w9WgXcQ —— 只剩 v。
      // sp 是搜索筛选器、list 是播放列表、t/start 是起播时间,都是给人用的,必须留
      host: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
      dropParams: ['si', 'feature', 'pp', 'ab_channel', 'gclid', 'skip_registration', 'utm_source', 'utm_medium', 'utm_campaign'],
      keepParams: ['v', 'list', 'index', 't', 'start', 'end', 'sp', 'search_query', 'playlist']
    }
  ];

  function siteRuleFor(hostname) {
    for (let i = 0; i < SITE_RULES.length; i++) {
      if (SITE_RULES[i].host.test(hostname)) return SITE_RULES[i];
    }
    return null;
  }

  function isTracking(key) {
    const k = key.toLowerCase();
    if (TRACK_EXACT.has(k)) return true;
    return TRACK_PREFIXES.some((re) => re.test(k));
  }

  function tryDecode(s) {
    try {
      const d = decodeURIComponent(s);
      return d === s ? s : d;
    } catch (e) {
      return s;
    }
  }

  // 把 query 拆成原始分片，避免 URLSearchParams 在未编码嵌套链接上错误切分
  function rawChunks(u) {
    const q = u.search.startsWith('?') ? u.search.slice(1) : u.search;
    if (!q) return [];
    return q.split('&').filter(Boolean).map((chunk) => {
      const i = chunk.indexOf('=');
      const rawKey = i === -1 ? chunk : chunk.slice(0, i);
      let key = rawKey;
      try { key = decodeURIComponent(rawKey); } catch (e) { /* ignore */ }
      return { key: key.toLowerCase(), rawVal: i === -1 ? '' : chunk.slice(i + 1), chunk };
    });
  }

  // 校验候选链接，不合法的（主机名带 & % = 等噪声）一律拒绝
  function normalizeCandidate(s) {
    let c = String(s).trim();
    if (c.startsWith('//')) c = 'https:' + c;
    if (!/^https?:\/\//i.test(c)) return null;
    let u;
    try {
      u = new URL(c);
    } catch (e) {
      return null;
    }
    if (!/^[a-z0-9._-]+$/i.test(u.hostname)) return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  }

  // 尝试从跳转参数里解出真实 URL，解不出返回 null
  function unwrapOnce(u) {
    const chunks = rawChunks(u);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!JUMP_PARAMS.has(c.key) || !c.rawVal) continue;

      const value = tryDecode(c.rawVal).trim();

      // 未编码的嵌套链接（值里直接是 http://…），其后的 query 属于内层链接，
      // 需要把剩余分片一起拼进去，否则内层参数会被外层解析吃掉
      const encodedScheme = /%3a%2f%2f/i.test(c.rawVal);
      if (!encodedScheme && /^(https?:)?\/\//i.test(value)) {
        const rest = chunks.slice(i).map((x) => x.chunk).join('&');
        const eq = rest.indexOf('=');
        const greedy = normalizeCandidate(tryDecode(eq === -1 ? '' : rest.slice(eq + 1)));
        if (greedy) return greedy;
      }

      const direct = normalizeCandidate(value);
      if (direct) return direct;

      // 站内相对路径
      if (/^\/[^/]/.test(value)) {
        try {
          return new URL(value, u.origin);
        } catch (e) { /* ignore */ }
      }
    }
    return null;
  }

  // 去掉首尾包裹的标点符号
  function trimPunct(s) {
    return s
      .replace(/^[<([{'"«“【]+/, '')
      .replace(/[>\])}'"»”】]+$/, '')
      .replace(/[.,;:!?、。，；：！？]+$/, '');
  }

  /**
   * 核心：把任意链接串精简为最简形式
   * @returns {{url:string, original:string, changed:boolean}|null}
   */
  function simplify(rawInput) {
    let s = trimPunct(String(rawInput).trim());
    if (!s) return null;

    if (/^\/\//.test(s)) s = 'https:' + s;

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(s)) {
        s = 'https://' + s;
      } else {
        return null;
      }
    }

    let u;
    try {
      u = new URL(s);
    } catch (e) {
      return null;
    }
    if (!/^https?:$/i.test(u.protocol)) return null;
    if (!u.hostname.includes('.')) return null;

    const original = s;

    // 1) 递归解包跳转中转链接（最多 3 层）
    for (let i = 0; i < 3; i++) {
      const next = unwrapOnce(u);
      if (!next) break;
      u = next;
    }

    // 2) 删除追踪参数 + 同名参数去重(站点 keepParams 优先级最高,命中即原样保留)
    const rule = siteRuleFor(u.hostname);
    const siteDrop = rule && rule.dropParams
      ? new Set(rule.dropParams.map((k) => k.toLowerCase()))
      : null;
    const siteKeep = rule && rule.keepParams
      ? new Set(rule.keepParams.map((k) => k.toLowerCase()))
      : null;
    const kept = [];
    const seen = new Set();
    for (const [k, v] of [...u.searchParams]) {
      const kl = k.toLowerCase();
      if (!(siteKeep && siteKeep.has(kl))) {
        if (isTracking(k)) continue;
        if (siteDrop && siteDrop.has(kl)) continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      kept.push([k, v]);
    }
    u.search = '';
    for (const [k, v] of kept) u.searchParams.append(k, v);

    // 3) 锚点：只有 SPA 路由（#! 或 #/）才保留
    if (u.hash && !/^#!/.test(u.hash) && !/^#\//.test(u.hash)) u.hash = '';

    // 4) 站点专属路径规范化(如小红书 /discovery/item/<id> → /explore/<id>)
    if (rule && rule.pathRewrite) {
      for (let i = 0; i < rule.pathRewrite.length; i++) {
        const re = rule.pathRewrite[i][0];
        const to = rule.pathRewrite[i][1];
        if (re.test(u.pathname)) {
          u.pathname = u.pathname.replace(re, to);
          break;
        }
      }
    }

    // 5) 去 www.
    if (/^www\./i.test(u.hostname) && u.hostname.split('.').length > 2) {
      u.hostname = u.hostname.slice(4);
    }

    // 6) 去掉末尾多余的斜杠
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');

    const path = u.pathname === '/' ? '' : u.pathname;
    const out = u.origin + path + u.search + u.hash;

    return { url: out, original, changed: out !== original };
  }

  /* ============================================================
   * 二、从文本中提取链接
   * ============================================================ */

  const URL_RE = /(?:(?:https?:)?\/\/|www\.)[^\s<>"'`()\[\]{}，。、；：！？【】（）《》“”‘’\u3000-\u303f\uff00-\uffef\u4e00-\u9fa5]+/gi;

  function extractLinks(text) {
    const out = [];
    const seen = new Set();
    const re = new RegExp(URL_RE.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = trimPunct(m[0]);
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      out.push(raw);
    }
    return out;
  }

  /* ============================================================
   * 三、存储 / 剪贴板
   * ============================================================ */

  const store = {
    get(key, def) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key, undefined);
          return v === undefined ? def : v;
        }
      } catch (e) { /* ignore */ }
      try {
        const v = localStorage.getItem('ls_' + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { /* ignore */ }
      return def;
    },
    set(key, val) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, val);
          return;
        }
      } catch (e) { /* ignore */ }
      try {
        localStorage.setItem('ls_' + key, JSON.stringify(val));
      } catch (e) { /* ignore */ }
    }
  };

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    return new Promise((resolve) => {
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(text, 'text');
          resolve(true);
          return;
        }
      } catch (e) { /* ignore */ }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          () => resolve(true),
          () => resolve(fallbackCopy(text))
        );
      } else {
        resolve(fallbackCopy(text));
      }
    });
  }

  // 读取系统剪贴板；不可用（非安全上下文 / 未授权 / 用户拒绝）时返回 null
  function readClipboard() {
    return new Promise((resolve) => {
      if (navigator.clipboard && window.isSecureContext && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(
          (text) => resolve(typeof text === 'string' ? text : null),
          () => resolve(null)
        );
      } else {
        resolve(null);
      }
    });
  }

  /* ============================================================
   * 四、UI
   * ============================================================ */

  const BALL_SIZE = 46;
  const EDGE_GAP = 8;
  const PANEL_GAP = 12;

  const state = (function () {
    const saved = store.get('pos', null);
    if (saved && typeof saved === 'object') {
      return { side: saved.side === 'left' ? 'left' : 'right', ratio: Number(saved.ratio) || 0.5 };
    }
    return { side: 'right', ratio: 0.5 };
  })();

  const host = document.createElement('div');
  host.id = 'link-slimmer-host';
  host.style.cssText =
    'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  (document.documentElement || document.body).appendChild(host);

  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .ball {
      position: fixed;
      width: ${BALL_SIZE}px; height: ${BALL_SIZE}px;
      border-radius: 50%;
      /* 高光 + 三段渐变，做出玻璃球质感 */
      background:
        radial-gradient(circle at 30% 24%, rgba(255,255,255,.46), rgba(255,255,255,0) 58%),
        linear-gradient(145deg, #6f8dff 0%, #7b5cff 46%, #a052f5 100%);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      cursor: grab;
      box-shadow:
        0 6px 18px rgba(104,92,255,.42),
        0 2px 6px rgba(0,0,0,.28),
        inset 0 0 0 1px rgba(255,255,255,.18),
        inset 0 -7px 14px rgba(40,20,90,.22);
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      opacity: .92;
      transition: transform .18s ease, opacity .18s ease, box-shadow .18s ease;
      z-index: 2;
    }
    .ball svg {
      width: 24px; height: 24px;
      filter: drop-shadow(0 1px 1.6px rgba(24,16,64,.5));
      pointer-events: none;
    }
    .ball:hover {
      opacity: 1;
      transform: scale(1.08);
      box-shadow:
        0 8px 24px rgba(104,92,255,.55),
        0 3px 8px rgba(0,0,0,.3),
        inset 0 0 0 1px rgba(255,255,255,.26),
        inset 0 -7px 14px rgba(40,20,90,.22);
    }
    .ball:active { transform: scale(.95); }
    .ball.dragging {
      transition: none; opacity: 1; transform: scale(1.06); cursor: grabbing;
      box-shadow:
        0 10px 28px rgba(104,92,255,.6),
        0 4px 10px rgba(0,0,0,.32),
        inset 0 0 0 1px rgba(255,255,255,.3),
        inset 0 -7px 14px rgba(40,20,90,.22);
    }

    .panel {
      position: fixed;
      width: 380px;
      max-width: calc(100vw - 84px);
      background: #1e2130;
      color: #e6e9f2;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 12px 40px rgba(0,0,0,.45);
      padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.5;
      z-index: 1;
      animation: ls-pop .16s ease;
    }
    .panel[hidden] { display: none !important; }
    @keyframes ls-pop {
      from { opacity: 0; transform: translateY(6px) scale(.98); }
      to   { opacity: 1; transform: none; }
    }

    .header { display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: 13px; font-weight: 600; letter-spacing: .3px; }
    .close {
      width: 24px; height: 24px; padding: 0;
      background: transparent; color: #8b93a8; font-size: 13px; line-height: 1;
      border: none; border-radius: 6px; cursor: pointer;
    }
    .close:hover { background: rgba(255,255,255,.1); color: #fff; }

    textarea {
      width: 100%; height: 118px; min-height: 72px; max-height: 40vh;
      resize: vertical;
      background: #171a26;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 10px;
      color: #e6e9f2;
      padding: 9px 10px;
      font-family: inherit; font-size: 12.5px; line-height: 1.55;
      outline: none;
      transition: border-color .15s ease;
    }
    textarea::placeholder { color: #666e85; }
    textarea:focus { border-color: #4f7cff; }

    .row { display: flex; gap: 8px; align-items: center; }
    button { font-family: inherit; cursor: pointer; border: none; border-radius: 9px; }
    .primary {
      flex: 1; padding: 9px 12px;
      font-size: 13px; font-weight: 600;
      background: linear-gradient(135deg, #4f7cff, #7a5cff);
      color: #fff;
      transition: filter .15s ease;
    }
    .primary:hover { filter: brightness(1.1); }
    .primary:active { transform: translateY(1px); }
    .ghost {
      padding: 9px 12px; font-size: 13px;
      background: rgba(255,255,255,.08); color: #c9cede;
      transition: background .15s ease;
    }
    .ghost:hover { background: rgba(255,255,255,.15); }
    .ghost:disabled { opacity: .55; cursor: default; }
    .row .ghost { flex: 1; }
    .row .ghost.active { background: rgba(110,231,168,.18); color: #6ee7a8; }
    .row .ghost.error { background: rgba(255,139,139,.16); color: #ff8b8b; }
    .row .ghost.wide { flex: 2; }

    /* ---- 页面右上角快捷按钮：复制当前网页地址 ---- */
    .pagebtn {
      position: fixed;
      top: 14px; right: 0;
      /* 平时整块滑出视口右侧只留一条细线，鼠标移到页面顶部才滑出，避免遮挡网页内容 */
      transform: translateX(100%);
      display: flex; align-items: center; gap: 7px;
      padding: 10px 18px 10px 14px;
      border-radius: 14px 0 0 14px;
      background: linear-gradient(145deg, #6f8dff, #7b5cff);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 12.5px; font-weight: 600; white-space: nowrap;
      cursor: pointer;
      border: none;
      box-shadow: 0 4px 16px rgba(104,92,255,.4), inset 0 0 0 1px rgba(255,255,255,.18);
      user-select: none;
      -webkit-user-select: none;
      z-index: 3;
      transition: transform .24s cubic-bezier(.34,1.4,.64,1), background .15s ease;
    }
    .pagebtn svg { width: 15px; height: 15px; flex: none; }
    .pagebtn:hover { background: linear-gradient(145deg, #7f9aff, #8a6bff); }
    .pagebtn.show { transform: translateX(0); }
    .pagebtn:disabled { cursor: default; }
    .pagebtn.error { background: linear-gradient(145deg, #ff8f8f, #f26b6b); }

    .results { display: flex; flex-direction: column; gap: 8px; max-height: 38vh; overflow-y: auto; }
    .results::-webkit-scrollbar { width: 8px; }
    .results::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 4px; }
    .results::-webkit-scrollbar-track { background: transparent; }

    .item {
      display: flex; gap: 8px; align-items: flex-start;
      background: #171a26;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px;
      padding: 8px 10px;
    }
    .item .text { flex: 1; min-width: 0; }
    .item .url { font-size: 12.5px; word-break: break-all; color: #9fc0ff; user-select: text; }
    .item .old { font-size: 11px; color: #71788d; word-break: break-all; margin-top: 3px; text-decoration: line-through; user-select: text; }
    .item .tag { display: inline-block; margin-top: 4px; font-size: 10.5px; color: #6ee7a8; }
    .item .tag.plain { color: #71788d; }
    .item button {
      flex: none; padding: 5px 9px; font-size: 12px;
      background: rgba(255,255,255,.08); color: #c9cede;
    }
    .item button:hover { background: rgba(255,255,255,.17); color: #fff; }

    .empty { font-size: 12.5px; color: #71788d; text-align: center; padding: 4px 0 2px; }
    .empty.err { color: #ff8b8b; }
  `;
  root.appendChild(style);

  // ---- 悬浮球 ----
  const ball = document.createElement('div');
  ball.className = 'ball';
  ball.title = '链接精简（点击展开 / 可拖动吸附到边缘）';
  ball.innerHTML =
    '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    // 左下：两个相扣的链环，读作“链接”
    '<ellipse cx="8.0" cy="24.0" rx="3.0" ry="4.7" transform="rotate(38 8.0 24.0)" stroke="currentColor" stroke-width="2.15"/>' +
    '<ellipse cx="13.6" cy="26.2" rx="3.0" ry="4.7" transform="rotate(38 13.6 26.2)" stroke="currentColor" stroke-width="2.15" opacity=".6"/>' +
    // 魔法棒斜杆：从链环上方伸向棒尖星芒
    '<path d="M13.0 22.2 L20.4 14.8" stroke="currentColor" stroke-width="3.05" stroke-linecap="round"/>' +
    // 棒尖四角星芒：用内凹贝塞尔做出平滑的八角星，比折线尖角更精致
    '<path d="M23.6 5.4 Q24.46 10.54 29.6 11.4 Q24.46 12.26 23.6 17.4 Q22.74 12.26 17.6 11.4 Q22.74 10.54 23.6 5.4 Z" fill="currentColor"/>' +
    // 一颗点缀星光，平衡左上角留白
    '<path d="M6.9 6.8 Q7.4 9.7 10.3 10.2 Q7.4 10.7 6.9 13.6 Q6.4 10.7 3.5 10.2 Q6.4 9.7 6.9 6.8 Z" fill="currentColor" opacity=".72"/>' +
    '</svg>';
  root.appendChild(ball);

  // ---- 页面右上角快捷按钮 ----
  const pageBtn = document.createElement('div');
  pageBtn.className = 'pagebtn';
  pageBtn.title = '复制当前网页地址（已精简）· 按住 Alt 点击复制原样地址';
  pageBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="12" height="12" rx="2.5"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
    '</svg>' +
    '<span class="label">复制本页地址</span>';
  root.appendChild(pageBtn);

  // ---- 面板 ----
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="header">
      <span class="title">链接精简</span>
      <button class="close" type="button" title="关闭">✕</button>
    </div>
    <textarea spellcheck="false" placeholder="在此粘贴任意包含链接的文本…&#10;例如从消息、评论或 Markdown 里复制的内容"></textarea>
    <div class="row">
      <button class="primary" type="button">提取并精简</button>
    </div>
    <div class="row">
      <button class="ghost js-copy-text" type="button" title="复制文本框里的内容">复制</button>
      <button class="ghost js-paste" type="button" title="读取系统剪贴板并写入文本框（原内容之后续接）">粘贴</button>
      <button class="ghost js-clear" type="button" title="清空文本框与结果">清空</button>
    </div>
    <div class="row">
      <button class="ghost wide js-copy-page" type="button" title="复制当前网页地址(已精简)· 按住 Alt 点击复制原样地址">复制本页地址</button>
    </div>
    <div class="results"></div>
  `;
  root.appendChild(panel);

  const ta = panel.querySelector('textarea');
  const btnRun = panel.querySelector('.primary');
  const btnCopyText = panel.querySelector('.js-copy-text');
  const btnPaste = panel.querySelector('.js-paste');
  const btnClear = panel.querySelector('.js-clear');
  const btnCopyPage = panel.querySelector('.js-copy-page');
  const btnClose = panel.querySelector('.close');
  const resultsEl = panel.querySelector('.results');

  // 面板内事件不冒泡到页面，避免干扰宿主页的快捷键 / 滚动
  ['keydown', 'keypress', 'keyup', 'paste', 'copy', 'cut', 'input',
    'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu'].forEach((type) => {
    panel.addEventListener(type, (e) => e.stopPropagation(), false);
  });

  /* ============================================================
   * 五、定位与吸附
   * ============================================================ */

  function layoutBall() {
    const vh = window.innerHeight;
    const half = BALL_SIZE / 2;
    let cy = state.ratio * vh;
    cy = Math.max(EDGE_GAP + half, Math.min(cy, vh - EDGE_GAP - half));
    state.ratio = cy / vh;

    const left = state.side === 'left'
      ? EDGE_GAP
      : window.innerWidth - EDGE_GAP - BALL_SIZE;

    ball.style.left = left + 'px';
    ball.style.top = (cy - half) + 'px';
  }

  function layoutPanel() {
    if (panel.hidden) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;

    // 面板放在球的“页面内侧”，不与球重叠
    const offset = EDGE_GAP + BALL_SIZE + PANEL_GAP;
    let left = state.side === 'left' ? offset : vw - offset - w;
    left = Math.max(PANEL_GAP, Math.min(left, vw - PANEL_GAP - w));

    let top = state.ratio * vh - h / 2;
    top = Math.max(PANEL_GAP, Math.min(top, vh - PANEL_GAP - h));

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function snapBall() {
    const rect = ball.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    state.side = centerX < window.innerWidth / 2 ? 'left' : 'right';
    store.set('pos', { side: state.side, ratio: state.ratio });
    layoutBall();
    if (!panel.hidden) layoutPanel();
  }

  /* ============================================================
   * 六、展开 / 收起
   * ============================================================ */

  function openPanel() {
    panel.hidden = false;
    panel.style.visibility = 'hidden';
    layoutPanel();
    panel.style.visibility = '';
    try {
      ta.focus({ preventScroll: true });
    } catch (e) {
      ta.focus();
    }
  }

  function closePanel() {
    panel.hidden = true;
  }

  function togglePanel() {
    if (panel.hidden) openPanel();
    else closePanel();
  }

  /* ============================================================
   * 七、拖动（区分点击与拖动）
   * ============================================================ */

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  ball.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = ball.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    ball.classList.add('dragging');
    try { ball.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
    e.stopPropagation();
  });

  ball.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 6) moved = true;
    if (!moved) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(0, Math.min(originLeft + dx, vw - BALL_SIZE));
    const top = Math.max(0, Math.min(originTop + dy, vh - BALL_SIZE));

    ball.style.left = left + 'px';
    ball.style.top = top + 'px';
    state.ratio = (top + BALL_SIZE / 2) / vh;
    e.preventDefault();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove('dragging');
    try { ball.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (moved) {
      snapBall();
    } else {
      togglePanel();
    }
  }

  ball.addEventListener('pointerup', endDrag);
  ball.addEventListener('pointercancel', endDrag);

  /* ============================================================
   * 八、核心交互
   * ============================================================ */

  function renderMessage(text, isError) {
    resultsEl.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty' + (isError ? ' err' : '');
    div.textContent = text;
    resultsEl.appendChild(div);
  }

  function flashButton(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = old;
      btn.disabled = false;
    }, 1100);
  }

  // 短暂改变按钮文字与配色，用于复制/粘贴的成功、失败反馈。
// 支持连续触发：新状态会顶掉上一次并重置计时，避免快速操作时提示被吞掉
  // 取得按钮里承载文字的节点:右上角按钮内含 SVG 图标,
// 不能整体改写 textContent,否则会把图标抹掉,所以优先找 .label 子节点
  function textNodeOf(btn) {
    return btn.querySelector('.label') || btn;
  }

  function flashState(btn, label, cls) {
    if (btn._flashTimer) {
      clearTimeout(btn._flashTimer);
      btn._flashTimer = null;
    }
    if (btn._flashCls) {
      btn.classList.remove(btn._flashCls);
      btn._flashCls = null;
    }
    const node = textNodeOf(btn);
    if (!btn._flashBase) btn._flashBase = node.textContent;
    node.textContent = label;
    if (cls) {
      btn.classList.add(cls);
      btn._flashCls = cls;
    }
    btn._flashTimer = setTimeout(() => {
      node.textContent = btn._flashBase;
      if (btn._flashCls) {
        btn.classList.remove(btn._flashCls);
        btn._flashCls = null;
      }
      btn._flashTimer = null;
    }, 1100);
  }

  // 记住文本框的光标/选区位置。用户点面板按钮时文本框会失焦，
// 必须在失焦前（blur / mousedown 捕获阶段）把位置存下来，否则插入只能追加到末尾
  let taFocused = false;
  let lastCaret = null;

  function rememberCaret() {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    if (typeof s === 'number' && typeof e === 'number') lastCaret = [s, e];
  }

  // 在光标处插入文本；从未聚焦过文本框时追加到末尾
  function insertAtCursor(text) {
    const len = ta.value.length;
    if (taFocused && lastCaret) {
      const start = Math.min(lastCaret[0], len);
      const end = Math.min(lastCaret[1], len);
      ta.setRangeText(text, start, end, 'end');
    } else {
      ta.value += text;
    }
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    lastCaret = [ta.value.length, ta.value.length];
    // 触发 input 事件，便于依赖它的外部逻辑感知变更
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function addResultItem(raw, simplified) {
    const item = document.createElement('div');
    item.className = 'item';

    const textWrap = document.createElement('div');
    textWrap.className = 'text';

    const urlEl = document.createElement('div');
    urlEl.className = 'url';
    urlEl.textContent = simplified ? simplified.url : raw;
    textWrap.appendChild(urlEl);

    if (simplified && simplified.changed) {
      const oldEl = document.createElement('div');
      oldEl.className = 'old';
      oldEl.textContent = simplified.original;
      textWrap.appendChild(oldEl);

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '已精简';
      textWrap.appendChild(tag);
    } else {
      const tag = document.createElement('span');
      tag.className = 'tag plain';
      tag.textContent = simplified ? '已是最简' : '无法识别为有效链接';
      textWrap.appendChild(tag);
    }

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      copyText(urlEl.textContent).then((ok) => {
        copyBtn.textContent = ok ? '已复制' : '复制失败';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1100);
      });
    });

    item.appendChild(textWrap);
    item.appendChild(copyBtn);
    resultsEl.appendChild(item);
  }

  function run() {
    const text = ta.value;
    if (!text.trim()) {
      renderMessage('文本框是空的，先粘贴一些内容吧');
      return;
    }

    const raws = extractLinks(text);
    if (!raws.length) {
      renderMessage('没有在这段文本里找到链接', true);
      return;
    }

    resultsEl.innerHTML = '';

    const seenOut = new Set();
    let count = 0;

    raws.forEach((raw) => {
      const simplified = simplify(raw);
      const finalUrl = simplified ? simplified.url : raw;
      if (seenOut.has(finalUrl)) return; // 精简后重复的只保留一条
      seenOut.add(finalUrl);
      count++;
      addResultItem(raw, simplified);
    });

    // 结果区顶部加一行操作条
    const bar = document.createElement('div');
    bar.className = 'row';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'primary';
    allBtn.textContent = `复制全部（${count} 条）`;
    allBtn.addEventListener('click', () => {
      const all = [...resultsEl.querySelectorAll('.item .url')]
        .map((el) => el.textContent)
        .join('\n');
      copyText(all).then((ok) => {
        if (ok) flashButton(allBtn, '已复制');
      });
    });
    bar.appendChild(allBtn);
    resultsEl.insertBefore(bar, resultsEl.firstChild);
  }

  btnRun.addEventListener('click', run);

  // 复制当前网页地址。默认复制精简后的地址，按住 Alt 复制原样地址
  function copyCurrentPageUrl(useRaw) {
    const raw = location.href;
    let out = raw;
    if (!useRaw) {
      const s = simplify(raw);
      if (s) out = s.url;
    }
    return { out, raw, changed: out !== raw };
  }

  const tipBase = new WeakMap();

  // 两个入口(右上角按钮 / 面板按钮)共用:复制地址 + 文字与悬停提示反馈
  function copyPageAddress(btn, useShortLabel, useRaw) {
    const raw = location.href;
    let out = raw;
    if (!useRaw) {
      const s = simplify(raw);
      if (s) out = s.url;
    }
    copyText(out).then((ok) => {
      let label;
      if (!ok) label = '复制失败';
      else if (useRaw) label = useShortLabel ? '已复制原样' : '已复制原样地址';
      else if (out === raw) label = useShortLabel ? '已复制地址' : '已复制本页地址';
      else label = useShortLabel ? '已复制精简' : '已复制精简地址';
      flashState(btn, label, ok ? (out === raw ? null : 'active') : 'error');
      if (!tipBase.has(btn)) tipBase.set(btn, btn.title);
      btn.title = ok ? '已复制:' + out : '复制失败,请重试';
      setTimeout(() => { btn.title = tipBase.get(btn); }, 1150);
    });
  }

  pageBtn.addEventListener('click', (e) => copyPageAddress(pageBtn, true, e.altKey));
  btnCopyPage.addEventListener('click', (e) => copyPageAddress(btnCopyPage, false, e.altKey));

  // 复制：把文本框里的内容写入系统剪贴板
  btnCopyText.addEventListener('click', () => {
    if (!ta.value) {
      flashState(btnCopyText, '文本框为空', 'error');
      return;
    }
    copyText(ta.value).then((ok) => {
      flashState(btnCopyText, ok ? '已复制' : '复制失败', ok ? 'active' : 'error');
    });
  });

  // 粘贴：读取系统剪贴板并写入文本框
  btnPaste.addEventListener('click', () => {
    readClipboard().then((text) => {
      if (text === null || text === '') {
        // 读取失败（浏览器限制/未授权）或剪贴板为空：给出提示并聚焦，让用户用 Ctrl+V 手动粘贴
        flashState(btnPaste, text === '' ? '剪贴板为空' : '请按 Ctrl+V', 'error');
        try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
        return;
      }
      // 仅在末尾续接且原内容非空时补一个换行，避免多次粘贴粘连
      const atEnd = !taFocused || !lastCaret || lastCaret[0] >= ta.value.length;
      const pad = atEnd && ta.value && !ta.value.endsWith('\n') ? '\n' : '';
      insertAtCursor(pad + text);
      flashState(btnPaste, '已粘贴', 'active');
    });
  });

  btnClear.addEventListener('click', () => {
    ta.value = '';
    resultsEl.innerHTML = '';
    ta.focus();
  });
  btnClose.addEventListener('click', closePanel);

  ta.addEventListener('keydown', (e) => {
    // Ctrl / Cmd + Enter 快捷执行
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });

  // 光标/选区跟踪：焦点、键入、点选、选择变化时记录位置
  ta.addEventListener('focus', () => { taFocused = true; rememberCaret(); });
  ta.addEventListener('blur', rememberCaret);
  ta.addEventListener('input', rememberCaret);
  ta.addEventListener('select', rememberCaret);
  ta.addEventListener('click', rememberCaret);
  ta.addEventListener('keyup', rememberCaret);
  // 点在文本中间时，mousedown 尚未更新 selectionStart，需等选区落定后再记录
  ta.addEventListener('mousedown', () => setTimeout(rememberCaret, 0));
  panel.addEventListener('mousedown', () => setTimeout(rememberCaret, 0), true);

  /* ---- 右上角按钮的滑出行为 ---- */

  // 鼠标靠近页面顶部（或已聚焦到按钮上）时滑出，否则收回，避免遮挡网页内容
  const SHOW_ZONE = 110;
  let pageBtnAutoHide = false;

  function setPageBtnVisible(show) {
    pageBtn.classList.toggle('show', !!show);
  }

  // 鼠标进入顶部热区即滑出，之后不再自动跟踪，
  // 由离开顶部区域 / 移出按钮来收回，避免在热区边缘反复抖动
  document.addEventListener('mousemove', (e) => {
    if (e.clientY <= SHOW_ZONE) {
      if (!pageBtnAutoHide) setPageBtnVisible(true);
      pageBtnAutoHide = true;
    } else if (pageBtnAutoHide && !pageBtn.matches(':hover')) {
      setPageBtnVisible(false);
      pageBtnAutoHide = false;
    }
  }, true);

  pageBtn.addEventListener('mouseenter', () => setPageBtnVisible(true));
  pageBtn.addEventListener('mouseleave', () => {
    if (!pageBtnAutoHide) setPageBtnVisible(false);
  });
  // 键盘可达性：Tab 聚焦时也显示
  pageBtn.addEventListener('focus', () => setPageBtnVisible(true));
  pageBtn.addEventListener('blur', () => { if (!pageBtnAutoHide) setPageBtnVisible(false); });

  /* ============================================================
   * 九、全局事件
   * ============================================================ */

  // 点击面板外部收起
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(host) || path.includes(panel)) return;
    if (e.target === host || host.contains(e.target)) return;
    closePanel();
  }, true);

  // ESC 收起
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  }, true);

  // 视口变化重新布局
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutBall();
      if (!panel.hidden) layoutPanel();
    }, 80);
  });

  /* ============================================================
   * 十、初始化
   * ============================================================ */

  layoutBall();

  // SPA 站点在客户端路由切换时地址栏会变，重新读取 location.href 即可，
  // 这里不需要额外处理；这里只确保按钮始终存在于最上层
  setPageBtnVisible(false);

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('打开链接精简面板', openPanel);
      GM_registerMenuCommand('复制本页地址(精简)', () => {
        const s = simplify(location.href);
        copyText(s ? s.url : location.href);
      });
      GM_registerMenuCommand('重置悬浮球位置', () => {
        state.side = 'right';
        state.ratio = 0.5;
        store.set('pos', { side: state.side, ratio: state.ratio });
        layoutBall();
        if (!panel.hidden) layoutPanel();
      });
    }
  } catch (e) { /* ignore */ }
})();