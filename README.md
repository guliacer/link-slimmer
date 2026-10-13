# 链接精简 · Link Slimmer

一个 Tampermonkey / 油猴脚本:从任意文本里提取链接并精简为最简形式,顺带清理掉一大票追踪参数和跳转中转。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-brightgreen.svg)](#)

---

## 它解决什么问题

从微信、小红书、淘宝、B站分享出来的链接,往往裹着一长串来源标记、追踪参数和跳转中转:

```
https://www.bilibili.com/video/BV1GJ411x7h7?spm_id_from=333.999.0.0&vd_source=abc123&from_source=webtop_search&t=12
                                                     ↓
https://bilibili.com/video/BV1GJ411x7h7?t=12
```

```
https://www.xiaohongshu.com/discovery/item/6885e9af000000001c0345e3?source=webshare&xhsshare=pc_web&xsec_token=ABHOD…%3D&xsec_source=pc_share
                                                     ↓
https://xiaohongshu.com/explore/6885e9af000000001c0345e3?xsec_token=ABHOD…%3D
```

一段包含多平台链接的真实文本,实测 **460 → 235 字符(减少 49%)**。

---

## 功能

### 悬浮球

平时吸附在浏览器页面边缘,可任意拖动。松手自动吸附到最近的左/右边缘,位置会记住。移动小于 6px 判定为点击,不会误触发拖动。

### 提取并精简

点击悬浮球展开面板,粘贴任意包含链接的文本,点"提取并精简":

- 自动从文本中提取所有链接(中英文标点、Markdown `[标题](url)`、括号包裹都能识别)
- 逐条精简,并去掉精简后重复的结果
- 每条显示最终链接 + 划掉的原链接 + "已精简/已是最简"标记,附单条复制
- 顶部有"复制全部"
- `Ctrl/Cmd + Enter` 快捷执行

### 工具箱

面板里还有:文本框**复制**、从系统剪贴板**粘贴**(支持光标处插入)、**清空**、**复制本页地址**。

### 页面右上角按钮

页面右上角有个"复制本页地址"按钮,平时滑出视口只留一条细边,**鼠标移到页面顶部才滑出**,不遮挡网页内容。

滑出后**停留 3 秒自动收回** —— 这样你既可以点击它,也可以点击它原本挡住的网页内容,不用手动把鼠标移开。鼠标悬停在按钮上时不会收回(想点就点),鼠标离开顶部区域则立即收回。

- 点击 → 复制**精简后**的当前网页地址
- 按住 <kbd>Alt</kbd> 点击 → 复制**原样**地址

> **关于"地址栏按钮"**:浏览器地址栏属于浏览器自身的 UI,油猴脚本无法注入。真正能往地址栏放图标的只有浏览器扩展(MV3 的 `action` API)。所以这里做的是页面右上角的等效按钮。

### 油猴菜单

在油猴扩展菜单里可以:打开面板、复制本页地址(精简)、重置悬浮球位置。

---

## 精简规则

按顺序执行:

| 步骤 | 规则 |
|---|---|
| 1 | **解跳转中转** —— `t.cn/xxx?url=<真实地址>` 解包成真实地址,最多递归 3 层,支持 URL 编码与未编码两种形式 |
| 2 | **删追踪参数** —— 68 个精确项 + 13 组前缀规则,大小写不敏感,同名参数去重 |
| 3 | **站点专属规则** —— 见下表 |
| 4 | **丢锚点** —— 但保留 SPA 路由的 `#!` / `#/` |
| 5 | **去 `www.`** |
| 6 | **去末尾多余斜杠** —— 无协议自动补 `https://` |

全局删掉的追踪参数涵盖:Google / Meta / Microsoft / Twitter / TikTok 等广告平台的点击 ID(`gclid`、`fbclid`、`msclkid`、`ttclid`…)、邮件营销平台(`mc_eid`、`mkt_tok`、`_hsenc`…)、统计平台(`_ga`、`_gl`、`piwik_*`…)、以及各站通用的分享来源标记(`share_*`、`spm*`、`utm_*`…)。

### 内置平台规则

| 平台 | 清理的参数 | 特意保留 |
|---|---|---|
| **小红书** | `source` `xhsshare` `xsec_source`;`/discovery/item/<id>` → `/explore/<id>` | `xsec_token`(见下方说明) |
| **B站** | `spm_id_from` `vd_source` `from_source` `from_spmid` `share_*` `unique_k` … | `t` `p` `bvid` `ep_id` `autoplay` `danmaku` |
| **百度** | `rsv_spt` `rsv_iqid` `rsv_bp` `rsv_pq` `rsv_t` `tn` `f` `oq` `ie` … | `wd` `word` `pn` `rn` `lm` |
| **豆瓣** | `from` `dt_dapp` `_i` `source` `ref` | `start` `sort` `cat` `q` `tag` |
| **知乎** | `utm_*` `from` `ref` `search_source` `s_src` | `q` `type` `sort` `filter` |
| **微博** | `from` `mod` `refer_flag` `Refer` `entry` `topnav` `typeall` `suball` | `q` `page` `uid` `mid` `is_all` **`type`** |
| **淘宝 / 天猫** | `spm` `scm` `ali_trackid` `ali_refid` `utparam` `tracelog` `xxc` `pvid` … | `id` `skuId` `itemId` `num_iid` `q` |
| **京东** | `spm` `dist` `utm_*` `pvid` `cu` `cp` `ali_trackid` `resourceType` … | `keyword` `enc` `q` `psort` `sku` `page` |
| **抖音** | `previous_page` `enter_from` `modeFrom` `search_source` `region` `biz_tag` … | `vid` `modal_id` `type` `keyword` |
| **快手** | `source` `streamSource` `area` `authorId` `previousPage` `enterFrom` | `searchKey` `keyword` `photoId` `userId` |
| **YouTube** | `si` `feature` `pp` `ab_channel` `gclid` `utm_*` | `v` `list` `index` `t` `start` **`sp`** |

#### 为什么这些参数要特意保留

规则不是简单粗暴地"能删就删"。站点的 `<link rel="canonical">` 会丢弃**给人看的**参数,只按它精简会破坏用户意图,所以这些一律保留:

- B站 `t=12` —— 从第 12 秒开始播
- YouTube `sp=` —— 搜索筛选器
- 天猫 `skuId=` —— 商品规格,删了会跳到错的 SKU
- 百度 `pn=` / `lm=` —— 翻页与时间范围
- 微博 `type=comment` —— 直达评论区

#### 小红书 `xsec_token` 为什么保留

它是免登录查看笔记的凭证,**删掉后对方打开会落到 `/404` 反爬页**(实测 `error_code=300031`)。实测对照:

| 形式 | 结果 |
|---|---|
| 精简后(apex + token) | 要求登录 —— 与原始链接行为**完全一致** |
| 保留 `www` + token | 要求登录(与上面一模一样) |
| 删掉 token | `/404`「你访问的页面不见了」 |
| 原始分享链接 | 要求登录 |

它占 46 个字符,是这条链接剩余长度的大部分。**如果链接打不开,先检查 token 是否过期**,而不是以为精简坏了。

### 规则来源

不靠猜测。用真实浏览器访问各平台页面,读取**页面自己声明的 `<link rel="canonical">`** —— 这是最权威的信号,网站自己会说明什么是规范链接。然后再用真实浏览器对照验证:**分别打开"原始链接"和"精简后链接",对比标题与状态码是否一致**。

这也意味着精简后链接在个别站点可能多一次跳转(例如去掉 `www.` 后,`taobao.com` 会 302 跳到 `www.taobao.com`),但**不会失效**。

---

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)(或 Violentmonkey / 篡改猴)
2. 打开 [`link-slimmer.user.js`](./link-slimmer.user.js)
3. Tampermonkey 会弹出安装页,点"安装"
4. 打开任意网页,应该能看到右侧边缘的悬浮球

---

## 使用

| 操作 | 说明 |
|---|---|
| 点悬浮球 | 展开/收起面板 |
| 拖悬浮球 | 移动位置,松手自动吸附边缘 |
| 粘贴文本 → 提取并精简 | 提取所有链接并精简 |
| <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> | 在文本框里快捷执行 |
| 鼠标移到页面顶部 | 滑出"复制本页地址"按钮(3 秒后自动收回) |
| <kbd>Alt</kbd> + 点复制按钮 | 复制原样地址而非精简地址 |
| <kbd>Esc</kbd> | 收起面板 |

---

## 隐私

脚本**完全在本地运行**,不发送任何网络请求,不上传任何数据。剪贴板读写仅在你点击对应按钮时发生。悬浮球位置存在 `GM_setValue`(回退到 `localStorage`)。

---

## 兼容性

- Tampermonkey / Violentmonkey / 篡改猴
- Chrome / Edge / Firefox
- 面板挂在 Shadow DOM 里,不会污染宿主页面样式
- 面板内的键盘与滚动事件阻断了冒泡,不会干扰宿主页快捷键

---

## 已知限制

- **地址栏无法注入按钮** —— 见上方说明,这是浏览器安全边界,只能用页面右上角按钮替代
- **部分站点有登录墙** —— 淘宝、天猫、京东、微博对未登录访客会跳登录页,这与精简无关
- **`xsec_token` 有时效** —— 小红书分享凭证会过期,过期后链接失效属正常
- **追踪参数名单不会穷尽** —— 各站会新增参数,欢迎提 Issue 或 PR

---

## 参与贡献

新增平台规则时,请遵循以下原则:

1. **用站点专属规则,不要加进全局名单** —— `source` / `ref` / `type` / `t` / `sp` 在各站含义完全不同,加进全局会误伤其它网站
2. **保留"给人用的"参数** —— 翻页、筛选、排序、起播时间、商品规格这类参数要写进 `keepParams`
3. **先实测再提交** —— 至少用真实浏览器确认精简前后链接行为一致,并在 PR 里贴出对照结果

规则表在脚本里的 `SITE_RULES`,结构如下:

```js
{
  host: /(^|\.)example\.com$/i,       // 匹配的域名(含子域)
  dropParams: ['spm', 'from'],        // 确认无用的参数
  keepParams: ['id', 'page'],         // 务必保留的参数,优先级最高
  pathRewrite: [[/^\/old\/(.+)$/, '/new/$1']]  // 可选的路径规范化
}
```

---

## License

[MIT](LICENSE)