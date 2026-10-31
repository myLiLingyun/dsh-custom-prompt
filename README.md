# dsh-custom-prompt

在新建会话的输入框下方添加一个“系统提示词追加”文本框。应用后，输入内容会作为独立的系统提示词 section 追加到该会话标准系统提示词的最后；模型实际收到的是：

```text
<原有系统提示词>

<你输入的文本>
```

还可以配置一段**默认追加文本**：新建对话时，这段文字会预先填入输入框，用户可以直接点击“应用”；不点击则不会追加任何内容。

## 使用

- 新建会话，在输入框下方的文本框输入内容，按 **Enter** 或点击 **应用**。
- 只支持单行文本；多行命令输入会被拒绝，避免后续用户消息被误并入系统提示词。
- 每个会话只允许在**第一轮对话开始前**设置；第一轮对话开始后输入框隐藏，`system-prompt` 命令也从该会话的命令目录中移除，从而保持请求前缀和 KV 缓存稳定。
- 每个会话独立；文本通过会话日志中的 log-only `command/run` 事件持久化，刷新、恢复和 fork 后仍然生效。
- 单条文本上限为 20,000 个字符。
- 该命令是用户专用命令，没有对应的 agent 工具；模型不能修改自己的系统提示词。

## 配置默认追加文本

在 **设置 → 插件 → 已安装 → dsh-custom-prompt** 的插件页里填写“默认追加文本”并保存（该字段是 volatile 配置，保存后立即生效，无需重启）。也可以直接写进 profile 的 `cordis.patch.yml`：

```yaml
- id: custom-system-prompt
  name: dsh-custom-prompt
  config:
    defaultText: 你需要读取 ~/AI-note/general.md
```

行为约定：

- 默认文本只是**预填**：新会话的输入框会带着它出现，但只有点击“应用”才会写入会话日志并追加到系统提示词；不点击就完全不追加。
- 已经应用过追加文本的会话（包括 fork/恢复的会话）显示已应用的内容，默认文本只在没有已应用文本时预填。
- 用户手动清空输入框后不会被默认文本重新填回。
- 文本按单行处理（换行会被折叠为空格）并裁剪首尾空白；超过 20,000 字符时截断。

## 实现

- Host：`index.js` 注册 `customSystemPrompt` session projection、`custom:system-prompt-append` prompt section，并在 `agent/created` 时通过 `agent.ctx.commands` 注册 **agent 作用域**的 `system-prompt` 人类命令；`turn/start` 后立即移除该命令。projection 同时冻结文本并忽略后续命令。Host 还导出带 `defaultText` 字段的 `Config`（`volatile()`），默认值为空字符串；Host 本身从不自动追加该值。
- Client：`client.js` 注册 `conversation.input.dock` 槽位，仅在 `SessionSnapshot.blank === true` 时渲染输入框；根节点用 flex `order: 2` 排到 composer 卡片下方，因为 blank Hero 不渲染 `conversation.composer.dock`。它通过 `ctx.configForms` 读取 Settings 服务提供的 volatile 配置作为预填值，并在 `plugins.bundle.config` 槽位（key 为包名 `dsh-custom-prompt`）渲染默认文本的配置表单。
- 无构建步骤、不新增 Host HTTP 路由、不新增会话事件类型；配置读写复用 DSH 的 Settings 表单服务。

## 许可证

本项目采用**代码与文档分离**的双重许可：

| 范围 | 内容 | 许可 |
| --- | --- | --- |
| 代码 | `index.js`、`client.js`、`cordis.patch.yml`、`package.json`、`locale/*.json`、`icon.svg` | [GNU General Public License v3.0 only](LICENSE)（GPL-3.0-only） |
| 文档 | `README.md` 及仓库中的其他说明文字 | [CC BY-NC-SA 4.0](LICENSE.CC-BY-NC-SA-4.0) |
