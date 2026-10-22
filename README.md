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
6. 为了让图能透出来，把外层大面（`.BynINW_frame` 等）设成 `color-mix(...)` 半透明，并把内层几个实心面板（`.Dc7zOa_root` 等）设成 `background-color: transparent`——这两组类名在 `TINTED_SELECTORS` / `CLEARED_SELECTORS` 里。
7. 关掉开关时移除 `<style>` 和 `html` 上的类名，界面立刻回到原生样子。

### 已知限制

- 半透明化依赖 DSH 当前的 CSS 类名（`.BynINW_*`、`.Dc7zOa_*`、`._*_6nhg2_*` 等）。**DSH 大版本升级后类名若变化，需要更新 `TINTED_SELECTORS` / `CLEARED_SELECTORS`**，否则表现为"图不显示"或"某个区域仍是实心"。
- 设置弹窗本身是独立的模态层，保持不透明，所以壁纸在弹窗周围透出、弹窗内文字始终清楚。

---

## 兼容性

- 在 DSH Web 前端（`platform: "web"`）上运行，桌面端即用此前端。
- 需要浏览器支持 `createImageBitmap`、`color-mix()`、IndexedDB（Edge / Chrome 均可）。

---

## License

MIT © 识浅
