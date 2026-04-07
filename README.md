# Chat Question Navigator

一个面向长对话场景的 Chrome Extension（Manifest V3），用于在 ChatGPT 页面中提取用户提问，并提供右侧悬浮导航，帮助快速回到历史问题位置。

当前项目是一个可运行的 MVP，重点解决两个问题：

- 对话很长时，用户很难快速定位自己之前问过的问题
- 页面内容持续流式更新时，导航列表需要稳定同步，而不是一次性静态扫描

## 当前能力

- 仅在 `chatgpt.com` 和 `chat.openai.com` 页面注入
- 自动识别用户消息并生成问题列表
- 在页面右侧渲染悬浮导航条与可展开面板
- 支持按关键词过滤问题
- 点击问题后平滑滚动到对应消息
- 根据当前滚动位置自动高亮正在浏览的问题
- 通过 `MutationObserver` 监听对话区变化，并以增量刷新为主、全量刷新为兜底
- 当问题数量小于等于 1 条时自动隐藏导航

## 交互说明

插件注入后，页面右侧会出现一个窄触发条：

- 鼠标移入触发条或面板，导航面板展开
- 鼠标移出后，面板延迟收起
- 面板顶部提供搜索框
- 问题较多时，列表区域自动启用滚动

当前实现并不包含 `Prev / Next` 按钮，因此如果后续补这部分功能，README 也需要同步更新。

## 技术实现

### 整体结构

- `manifest.json`
  Chrome 插件入口，声明内容脚本注入范围与样式文件
- `src/content/index.ts`
  初始化入口，负责扫描问题、挂载面板、监听滚动和 DOM 变更
- `src/content/dom-parser.ts`
  站点适配与问题提取逻辑，目前只实现了 ChatGPT 适配器
- `src/content/navigation.ts`
  问题导航与当前激活项判定
- `src/content/panel.ts`
  右侧悬浮面板的 DOM 创建、状态切换、搜索与列表渲染
- `src/content/styles.css`
  面板样式
- `src/utils/types.ts`
  公共类型定义

### 刷新策略

为了兼顾性能和稳定性，项目没有在每次 DOM 变化时都全量重建列表，而是采用两层策略：

- 文本变化或新增节点时，尝试只更新受影响的问题项
- 出现删除节点等结构性变化时，再执行全量刷新

此外，考虑到 ChatGPT 站内跳转时可能替换对话根节点，入口文件会周期性重新确认观察目标。

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 类型检查

```bash
npm run check
```

### 3. 构建

```bash
npm run build
```

构建产物输出到 `dist/content/index.js`。

## 加载到 Chrome

1. 打开 `chrome://extensions`
2. 开启右上角 `Developer mode`
3. 点击 `Load unpacked`
4. 选择当前项目根目录
5. 打开 ChatGPT 对话页验证导航是否正常注入

说明：

- `manifest.json` 直接引用仓库中的 `src/content/styles.css` 和构建后的 `dist/content/index.js`
- 修改 TypeScript 后需要重新执行 `npm run build`
- 修改 CSS 后通常刷新扩展和页面即可生效

## 项目现状与限制

- 当前只适配 ChatGPT，未覆盖 Claude、Gemini、豆包等站点
- 用户消息识别依赖页面 DOM 结构与属性选择器，目标站点改版后可能需要同步调整
- 目前没有背景脚本、配置页、持久化存储和快捷键支持
- README 中的能力说明应以 `src/content/` 下实际实现为准，而不是以规划功能为准

## 后续扩展方向

- 抽象更多站点适配器，扩展到其他 AI 对话产品
- 增加 `Prev / Next` 快捷跳转和键盘导航
- 支持问题分组、时间分段和会话内锚点预览
- 增加用户可配置项，例如面板宽度、位置、最小显示数量
- 为 DOM 适配和导航逻辑补充自动化测试
