# 滑动变祖器 · DSH 思考程度滑块

把 DeepSeek 的**推理档位**做成一根滑杆：拖动即真实切换 `reasoningEffort`，并用 241 帧连续进化影像反馈强度。

> A [DSH](https://github.com/deepseek-ai) (DeepSeek Harness) bundle that turns the composer's model picker into a slider for DeepSeek's reasoning effort, with a 241-frame evolution clip as live feedback.

![滑动变祖器](docs/demo.png)

灵感与素材来自 [HunLuanZhiZhu/liang-intensity-calibrator](https://github.com/HunLuanZhiZhu/liang-intensity-calibrator)（滑动变祖器）。

---

## 特性

- **一根连续滑杆，四个档位锚点**：小难梁 / 梁子 / 梁圣 / 梁祖，对应 `off` / `low` / `high` / `max`。
- **拖动时人像逐帧演变**：0–30 连续位置映射素材第 1–241 帧，步长 1/8 级 = 一帧，零跳帧。
- **真实切换，不是装饰**：走 `modelDirectories` → `session.selectModel({ provider, model, reasoningEffort })`，与官方选择器同一条路径；提交的档位会出现在后续请求的 `request/header` 里。
- **数据驱动**：档位数量与 id 全部来自当前模型适配器声明的 `reasoning.efforts`。插件里没有写死任何档位、模型名或路由名——换模型、换机器、换路由，行为自动跟着变。
- **未声明档位的模型不装作能用**：卡片显示「当前模型未提供推理等级」，不渲染滑杆。
- **按模型记忆档位，且跨重启保留**。
- 不常驻：点开模型控件才展开；浅色主题纯白、深色主题跟随 `--dsw-alias-*`。

## 环境要求

- DSH，且界面能访问本机 HTTP 服务（Web GUI 与桌面版均可，桌面版亦从本机 HTTP 加载界面）。
- 会话模型**必须声明推理档位**，否则卡片无滑杆。DeepSeek 官方路由的 `deepseek-flash` / `deepseek-v4-pro` 提供 `off / low / high / max`。

## 安装

1. 取得插件目录，两种方式任选：

   - **下载打包好的 zip**：**[⬇ Releases · 最新版](https://github.com/xuanke66/dsh-thinking-slider/releases/latest)** —— 下载 `dsh-thinking-slider.zip` 后解压，得到 `dsh-thinking-slider/` 目录。
   - **或直接克隆仓库**：

     ```
     git clone https://github.com/xuanke66/dsh-thinking-slider.git
     ```

2. 让 DSH 里的 Agent 执行：

   ```
   plugin_manager  action: install_bundle   target: <该目录的绝对路径>
   ```

   > `target` 必须是**含 `package.json` 的那一层目录**，不要指向它的子目录。
   >
   > 用 zip 的话，就是解压出来的 `dsh-thinking-slider/`；用 `git clone` 的话，就是克隆下来的仓库根目录。

3. **重启 DSH**。Host 半（`index.js`）需要新的模块代际才会生效。

## 使用

点输入框工具行里的模型控件展开：

```
点击  DeepSeek-V41-Flash 梁圣 ⌄
        ↓
┌──────────────────────────────────┐
│  ┌──────────┐   梁圣      20 / 30 │
│  │ 正方形   │   DeepSeek-V41-Flash · High
│  │ 人像帧   │                     │
│  └──────────┘                     │
│  小难梁    梁子    梁圣    梁祖    │
│  ────────────────────●──────      │
├──────────────────────────────────┤
│ 模型        DeepSeek-V41-Flash › │
└──────────────────────────────────┘
```

- 拖动滑杆：人像逐帧演变，档位只在跨过相邻锚点中点时切换一次。
- 点档位名称、按方向键、切模型：影像缓动扫过中间所有真实帧。
- 弹层最后一行「模型」可钻进去换模型（按 provider 分组）。
- Escape 或点击外部关闭。

## 工作原理

### 两层语义

滑杆是**连续**的，档位是**离散**的，两者分开：

| 层 | 范围 | 作用 |
|---|---|---|
| 滑杆 / 影像 | 0–30 连续，步长 1/8 | 每 0.125 级 = 素材一帧，映射第 1–241 帧 |
| 档位锚点 | 4 个：0 / 10 / **19.25** / 30 | 越过相邻锚点中点（5 / 14.625 / 24.625）才提交一次 `selectModel` |

于是拖动过程中画面连续演变，而推理档位只在跨档时切换一次，不会每拖一格打一次 RPC。

| 锚点 | 位置 | 停靠帧 | 档位 | 名称 |
|---|---|---|---|---|
| 小难梁 | 0 | 1 | `off` | Off |
| 梁子 | 10 | 81 | `low` | Low |
| **梁圣** | **19.25** | **155** | `high`（默认） | High |
| 梁祖 | 30 | 241 | `max` | Max |

> **为什么梁圣是 19.25 而不是 20**：锚点位置同时也是人像**停靠的那一帧**。均分的 0/10/20/30 会让梁圣停在第 161 帧，而那一帧素材里人物正好眯着眼。改成分档位可单独微调的表后，梁圣落在第 155 帧（同一阶段、睁眼）。
>
> 只有恰好 4 档时才用这张表；其他档位数仍走均分。想再挪：改 `ANCHOR_POSITIONS`，`位置 = (目标帧 − 1) / 8`。

### 影像是怎么动的

- **拖动滑杆 → 直接跟随，不缓动。** 快速拖动时缓动永远追不上一个持续远离的目标，看起来就是卡住。拖动这条路直接把目标帧、已显示帧、seek 目标一并设成当前帧并立即追帧，由串行 seek 把中间帧合并到最新目标。
- **点锚点 / 方向键 / 换模型 → 缓动扫过。** 一个常驻 `requestAnimationFrame` 循环按每帧 22% 指数缓动，接近后吸附，所以是扫过中间所有真实帧，不是硬切。
- **素材是一次性下载的，不是流式播放的。** Client 半先 `fetch` 整个 mp4，转成 `blob:` URL 再交给 `<video>`。流式 `<video>` 靠字节区间请求（Range）来 seek，而媒体元素一旦加载失败就永不重试——冷启动时它可能比 Host 半注册路由更早发出请求，然后永远停在第一帧。改成一次性 fetch 后：fetch 可重试（60 次 × 500ms），之后所有 seek 都在内存里，也不依赖 Host 半支持 206。
- **seek 串行化**：进行中的 seek 不被打断，完成后立刻追最新目标。
- **到位容差是半个源帧**（`1/(24×2)`）：比这更严会让解码器落在略偏位置时反复重 seek，形成 seek 风暴。
- **两道看门狗**兜住病态 seek：锁存后若元素已不在 seek（>1s），说明 `seeked` 丢了，释放；若元素仍在 seek但 5 秒无进展，说明 seek 真卡住了，释放后由循环重发目标。第二条只在慢到 5 秒时才动手，所以不会把「慢但在推进」的正常 seek 打断成永不完成的取消循环。
- `<video>` 常驻但 1px 离屏，卡片里是 `<canvas>` 逐帧 `drawImage`（**cover 裁切，不拉伸**，任何素材比例都不变形）。

### 按模型记忆档位

切到另一个模型时，**优先恢复该模型上次选择的档位**（前提是适配器仍提供它），没有记忆或该档位已不存在时才用模型默认档。

这是与官方选择器的一处刻意差异——官方每次切模型都套用该模型默认档。于是「在 DeepSeek 上设为梁祖 → 切到一条没有档位的路由 → 再切回 DeepSeek」：本插件回到**梁祖**，官方会回到梁圣。

记忆**跨 DSH 重启持久化**：Host 半存成插件目录下的 `preferences.json`，Client 半启动时 `GET /thinking-slider/preferences` 读回、每次记录后 `POST` 回去。不用 `localStorage`，因为 Web 端口不保证每次启动相同（来自 `dsh web --port`），而 `localStorage` 按 origin 隔离，端口一变记忆就丢。

存储格式 `{"efforts": {"provider/model": "effortId"}}`，读写有两道保护：

- 只接受字符串键值对，畸形条目丢弃；上限 200 条
- 请求体上限 64 KiB，超限回 413 且**不写盘**
- **缺 `efforts` 或类型不对回 400**，而不是当作空记忆写入——否则一个畸形请求就会清空记忆
- 写入先 `.tmp` 再 `rename`，中途崩溃不会留下半截文件
- 读取容忍 UTF-8 BOM（记事本手改后会带），避免无声变成空记忆
- 读写失败一律静默降级，绝不影响控件本身

清空记忆：删掉 `preferences.json`。改回官方那种「切模型就回默认」的行为：删掉 `selectModel` 里的 `remembered` / `advertised` 分支。

### 关于自添加的网关路由

档位完全由适配器声明决定。自添加的网关路由（在 profile 的 `cordis.patch.yml` 里用 `llm-pi-ai` 手写的 `providers`）若没声明 `reasoningEfforts`，适配器会报告 `reasoning: null`，卡片就不会渲染滑杆。

可以给这类模型补 `reasoningEfforts` 让它也声明四档，**但建议先验证网关是否真的按它改变思考量**——网关「接受」这个参数，不等于它「按它改变参数」。验证方法：

1. 用极简问题分别以 `reasoning_effort: "off"` 和 `"max"` 各发几次 `chat/completions`。
2. 比较响应里的 `usage.completion_tokens_details.reasoning_tokens`。
3. `off` 接近 0 且各档位单调可分 → 值得补；若各档位数值完全持平（连 `off` 都关不掉思考），补了只会得到一个能拖、能发参数、但没有效果的滑杆。

## 卸载与故障恢复

```
plugin_manager  action: remove_bundle    target: @local/dsh-thinking-slider
```

本插件是**影子覆盖**（`priority: -1`）输入框的模型座位 `conversation.input.model`，不是用 CSS 藏官方 DOM。槽框架有自动让位（abdicate）机制：本插件的 entry 一旦渲染崩溃，框架会把它退休，**官方模型选择器自动回来**。卡片另有自己的错误边界（`CardBoundary`），卡片崩了只在卡片位置显示一行错误。

若界面异常，两条恢复路径：

1. 命令面板输入 `/model`——官方的 `/model` 弹窗是另一条注册，不受本插件影响。
2. 设置 → 插件里禁用本插件。

## 已知限制

- 素材通过 Host 半的 HTTP 路由提供，需要 `index.js` 被加载；桌面版同样从本机 HTTP 加载界面，所以可用。
- 冷启动时客户端要一次性拉完约 4.9 MB。本机 HTTP 下是毫秒级；若路由尚未就绪，客户端每 500ms 重试、最多 60 次。
- 档位切换是「下一个请求生效」：正在跑的那一步仍用它开始时选定的档位（Harness 本身的语义）。
- 弹层宽度固定 320px，按触发器位置做视口边缘夹取。

## 目录结构

```
├── client.js              Client 半：影子覆盖模型座位 + 弹层 + 滑杆 + 追帧
├── index.js               Host 半：素材路由（RFC 7233 单段 Range）+ 记忆持久化
├── cordis.patch.yml       插入 thinking-slider 行
├── package.json
├── video/
│   └── liang-evolution.mp4   素材（1024×1024，24fps，10.1s，4.9 MB）
├── locale/
│   ├── zh.json            插件管理页文案
│   └── en.json
├── icon.svg
├── docs/
│   └── demo.png
├── README.md
└── LICENSE
```

运行时会生成 `preferences.json`（档位记忆），已在 `.gitignore` 中忽略。

## 开发提示

- 改 `client.js`：已打开的页面会通过 HMR 自动换新 bundle，无需刷新。
- 改 `index.js`（Host 半）：**不会**热更——Loader 按包名缓存模块代际，替换已装包的 Host 代码需要重启 DSH。
- `node --check` 只检查语法。若要防「引用了未声明的标识符」这类只在渲染期才炸的错误，建议在隔离上下文里真实调用一次组件函数体（本插件开发中即用此法验证）。

## 致谢

- 灵感与素材：[HunLuanZhiZhu/liang-intensity-calibrator](https://github.com/HunLuanZhiZhu/liang-intensity-calibrator)
- 槽位影子覆盖、`modelDirectories` 用法参考 DSH 自带的模型选择器实现。

## 许可

代码以 [MIT](LICENSE) 授权。

`video/liang-evolution.mp4` 来自上述原项目，版权归原作者；本项目仅为演示用途引用，若原作者有异议请提 issue，会立即移除。
