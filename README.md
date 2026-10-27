# 自定义背景（dsh-custom-wallpaper）

给 DeepSeek Harness 的窗口换一张**你自己的图片**当背景，同时保证面板、侧栏、输入框和文字依然清晰可读。

图片只保存在这台机器的浏览器里（IndexedDB），**不会上传，也不会写进项目目录**。

---

## 功能

- **导入自己的图片**：任意 PNG / JPEG / WebP / GIF / AVIF，单张上限 30 MB，建议 1920×1080 以上。
- **图片遮罩**：在图片上盖一层与主题同色的半透明遮罩，遮罩越浓、图片越淡、字越清楚。
- **面板不透明度**：控制侧栏、主面板、底部输入区这些"大面"的透明度——调低更能看见图片，调高更接近原生界面。
- **自动保证文字清晰度**：读取图片亮度，按 WCAG 4.5:1 对比度要求自动把遮罩抬到需要的浓度（最多 92%），避免亮图把字压掉。
- **一键开关**：关掉后立刻恢复原生纯色界面，图片和参数都保留。
- **跟随主题**：深色/浅色主题都用当前主题的背景色做遮罩，不会出现突兀的白块。
- **Windows 标题栏也透图**：右上角最小化/最大化/关闭那一块不再是一块死色，图片一直铺到窗口顶边。
- **自动保存**：所有参数即时保存，下次打开 DSH 自动恢复。

---

## 安装

### 方式一：从 npm 安装（推荐）

1. 打开 DSH，点左下角**账号头像 → 设置**。
2. 左侧选 **插件**（插件管理页），点 **添加插件**。
3. 在"包名或地址"里填：

   ```
   dsh-custom-wallpaper
   ```

4. 点安装，然后**重启 DSH**（关闭窗口再打开）。
5. 重新打开 **设置**，左侧列表里就会出现 **背景** 这一项。

### 方式二：从本地目录安装（自己改代码时用）

把 `<插件目录>` 换成你实际放它的位置，其余步骤同方式一：

```
<插件目录>\dsh-custom-wallpaper
```

### 方式三：从 GitHub 安装

在"包名或地址"里填仓库地址：

```
https://github.com/sqyr7/dsh-custom-background
```

> 这种方式要求本机已安装 git，并且能访问 GitHub；连不上会在安装前检查阶段就报错。

### 卸载

1. **设置 → 背景 → 移除背景**（清掉已存的图片）。
2. **设置 → 插件**，找到 `dsh-custom-wallpaper`，移除插件。
3. 重启 DSH。

---

## 使用

**设置 → 背景**

| 控件 | 作用 |
| --- | --- |
| 背景图片 / 更换图片 / 移除背景 | 选图、换图、删图。选完立即生效。 |
| 图片遮罩（0–92%） | 图片上那层雾的浓度。越浓字越清楚、图越淡。 |
| 面板不透明度（0–100%） | 侧栏/主面板/输入区的透明度。越低越透、越能看见图。 |
| 自动保证文字清晰度 | 开（默认）：按图片亮度自动加浓遮罩，最多到 92%。关：完全按你拖的值来。 |
| 启用背景 | 总开关。关掉恢复原生界面，图片和参数仍保留。 |
| 恢复默认参数 | 遮罩 55%、面板 30%、自动开、启用开。 |

**推荐起点**：先用默认值（遮罩 55% / 面板 30%），如果觉得图太淡就调低遮罩，觉得字不够清楚就调高遮罩或面板不透明度。

---

## 数据存在哪

- **图片**：浏览器 IndexedDB，库名 `dsh-custom-wallpaper`，表 `assets`，键 `background`。
- **参数**：浏览器 localStorage，键 `dsh-custom-wallpaper:prefs`。
- 两者都只在本机、只在这个 DSH 窗口的浏览器存储里；换机器或清了浏览器数据就没了，需要重新选图。
- 插件本身**没有任何网络请求**，不会把图片发到任何地方。

---

## 文件结构

```
dsh-custom-wallpaper/
├─ package.json          # 插件清单（dsh.bundle / dsh.client）
├─ cordis.patch.yml      # 挂载声明
├─ index.js              # Host 半边（空实现，渲染全在 client）
├─ client.js             # 全部逻辑：样式、存储、设置页 UI
├─ locale/
│  ├─ zh.json            # 插件市场里显示的中文名/描述
│  └─ en.json
├─ icon.svg              # 插件图标
└─ README.md             # 本文件
```

---

## 工作原理（给想改的人）

1. `client.js` 通过 `window.__ModuleLoader__.load({ id, factory })` 注册，导出 `{ inject: ['slots'], apply(ctx) }`。
2. `apply()` 里 `ctx.slots.inject('settings.section', ...)` 把设置面板注册进 DSH 的设置页（id `dsh-custom-wallpaper`，order 45，标题"背景"）。
3. 选图后用 `createImageBitmap` + 64×64 canvas 算图片的平均亮度和 75 分位亮度，得到 `tone`。
4. `requiredScrim()` 用二分法求"满足 4.5:1 对比度所需的最小遮罩"，与用户设置取较大值（受"自动"开关控制）。
5. 真正的背景画在 `html.dcb-background-on body::before` 上：`position:fixed; inset:0; z-index:-1`，背景是 `linear-gradient(遮罩色, 遮罩色), url(blob:...)`，`cover` 居中。
6. 为了让图能透出来，把外层大面（layout 的 `centerCol` / `sidebarCol` / `bottomRow` / `rightbarCol`）设成 `color-mix(...)` 半透明，并把内层几个实心面板（窗口 frame、会话根、侧栏根、dock 标签页等）设成 `background-color: transparent`。
7. 类名怎么找：DSH 每次构建都会重算 CSS Module 的哈希前缀（今天是 `mP3x-q_centerCol`，昨天是 `BynINW_centerCol`），写死哈希就是 1.0.1 在 rc.3 上失效的原因。所以：
   - **运行时发现**（首选）：`centerCol` / `sidebarCol` / `bottomRow` / `rightbarCol` / `composerSeat` / `panelBody` / `fade` 这几个语义后缀在整个类名空间里唯一，直接在 DOM 里按 `[class*="_后缀"]` 找出来，唯一才用，撞名就放弃；窗口 frame 找不到后缀，就按"中心列的父元素"结构定位。
   - **静态表**（兜底）：其余写不出唯一后缀的（`frame` 有十几个同后缀类名、`root`/`panel` 更多）用显式列表，同时列 rc.3 名和旧名——匹配不到的规则不生效，所以一张表能跨宿主版本。
   - 外壳是懒挂载的，面板还会随导航替换，所以 `MutationObserver` 在类名变化后重算一次样式（样式文本没变就不重写）。
8. 关掉开关时移除 `<style>` 和 `html` 上的类名，界面立刻回到原生样子。
9. **Windows 标题栏**：原生最小化/最大化/关闭由 DWM 绘制，颜色来自桌面端 preload 往 `<body>` 里塞的一个隐藏 span 的计算背景色（`background-color:var(--dsw-specific-sidebar-fill)`），再通过 IPC 交给 `setTitleBarOverlay()`。那个 span 是独立元素，给面板上色影响不到它，所以按钮区永远是一块不透明死色。插件只把**这个 span 的填充**清成透明（`html.dcb-background-on body > span[style*="--dsw-specific-sidebar-fill"]`），宿主随即上报 `rgba(0,0,0,0)`，DWM 就把按钮直接画在已经透出图片的标题栏带上；span 的 `color` 不动，图标颜色照旧。只影响 Windows，其他平台宿主不会创建这个 span，规则匹配不到就不生效。

### 已知限制

- 半透明化依赖 DSH 的类名结构。语义后缀（`_centerCol` 等）跟着组件语义走、不随构建变，正常情况下跨版本可用；但如果 DSH 改了组件结构或语义名，仍需要更新 `STATIC_*` 表和 `DISCOVERABLE` 后缀列表。表现是"图不显示"或"某块区域仍是实心"。
- Windows 标题栏透图依赖桌面端 preload 的探针 span 仍然带 `--dsw-specific-sidebar-fill` 内联样式。如果将来宿主换了取色方式（比如改用 `--dsw-alias-bg-base` 或换成真正的原生取色 API），这条规则会匹配不到、按钮区退回纯色——不会更糟，也不会影响其他功能。
- 标题栏透图后，三个按钮的图标颜色仍由主题的 `--dsw-alias-label-primary` 决定（深色主题下是浅色图标）。如果壁纸在顶部特别亮、且面板不透明度调得很低，图标对比度会下降；此时把"面板不透明度"调高一点即可。
- 设置弹窗本身是独立的模态层，保持不透明，所以壁纸在弹窗周围透出、弹窗内文字始终清楚。

---

## 兼容性

- 在 DSH Web 前端（`platform: "web"`）上运行，桌面端即用此前端。
- 需要浏览器支持 `createImageBitmap`、`color-mix()`、IndexedDB（Edge / Chrome 均可）。

---

## License

MIT © 识浅
