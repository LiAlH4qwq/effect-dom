# Interact

**语言：** [English](../en/interact.md) · [简体中文](./interact.md) · [目录](./README.md)

对元素与媒体的操作，全部以 `Effect` 表达。它们都是对原生 DOM 调用的薄封装，
因此能与查询、等待自然组合。

```ts
import { Effect } from "effect"
import * as Interact from "@lialh4/effect-dom/Interact"
```

## 点击

| 函数                             | 返回              | 行为                                                    |
| -------------------------------- | ----------------- | ------------------------------------------------------- |
| `click(elem)`                    | `Effect<void>`    | 优先原生 `HTMLElement.click()`，否则派发 `MouseEvent`。 |
| `clickIfActionable(elem, opts?)` | `Effect<boolean>` | 仅在可操作时点击；跳过返回 `false`。                    |
| `dispatch(target, event)`        | `Effect<boolean>` | `dispatchEvent`；被取消时返回 `false`。                 |

`clickIfActionable` 从不等待。元素可能出现或变化时，先配合
`Wait.waitActionable`：

```ts
import { waitActionable } from "@lialh4/effect-dom/Wait"

yield* waitActionable(document, ".vjs-big-play-button").pipe(
  Effect.flatMap(Interact.clickIfActionable),
)
```

## 表单

| 函数                                                    | 返回           |
| ------------------------------------------------------- | -------------- |
| `setValue(control, value)`                              | `Effect<void>` |
| `setInputValue`                                         | `setValue` 别名 |
| `setChecked(input, checked)`                            | `Effect<void>` |
| `check(input)` / `uncheck(input)`                       | `Effect<void>` |
| `submit(form)`                                          | `Effect<void>` |

`ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement`。

`setValue` 通过**原型**上的 `value` setter 写入（绕过 React/Vue 安装在实例上的
setter），再依次派发 `input` 与 `change`，受控组件因此会真正更新：

```ts
const email = yield* findElem(document, HTMLInputElement, "input[type=email]")
yield* Interact.setValue(email, "me@example.com")

const accept = yield* findElem(document, HTMLInputElement, "#tos")
yield* Interact.check(accept)
```

`setChecked`/`check`/`uncheck` 对 `checked` 使用同样的技巧，值已一致时不产生副作用。

## 焦点、指针与滚动

```ts
Interact.focus(elem): Effect<void>
Interact.blur(elem): Effect<void>
Interact.hover(elem): Effect<void>            // mouseover + mouseenter + mousemove
Interact.scrollIntoView(elem, opts?): Effect<void>
```

`ScrollIntoViewOpts` 为 `{ behavior?, block?, inline? }`，默认
`{ block: "center", inline: "nearest" }`。

## 键盘

```ts
interface PressOpts {
  readonly code?: string
  readonly location?: number
  readonly repeat?: boolean
  readonly altKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly bubbles?: boolean
  readonly cancelable?: boolean
}

Interact.press(target, key, opts?): Effect<void>
Interact.type(control, text): Effect<void>
```

`press` 派发 `keydown`、`keypress`（仅可打印键）与 `keyup`。
`type` 逐字符追加 `text` 到文本控件，并为每个字符派发按键事件。

```ts
yield* Interact.press(email, "Enter", { ctrlKey: true })
yield* Interact.type(email, " more")
```

## 媒体控制

| 函数                              | 返回                            |
| --------------------------------- | ------------------------------- |
| `play(media)`                     | `Effect<void, MediaPlayError>`  |
| `safePlay(media)`                 | `Effect<boolean>`               |
| `pause(media)`                    | `Effect<void>`                  |
| `seek(media, time)`               | `Effect<void>`                  |
| `setMuted(media, muted)`          | `Effect<void>`                  |
| `setVolume(media, volume)`        | `Effect<void>`                  |
| `setPlaybackRate(media, rate)`    | `Effect<void>`                  |

浏览器拒绝播放（自动播放策略）时 `play` 以 `MediaPlayError` 失败；`safePlay`
吞掉拒绝并返回 `true`/`false`。`setVolume` 会裁剪到 `0..1`。

长时间播放的监管 —— 就绪、卡顿检测、站点重置设置后的重新应用 —— 见
[Media](./media.md) 模块。

## 注意事项

- 对 `display:none` 元素调用 `click` 在浏览器中是静默 no-op；用
  `clickIfActionable` 或 `waitActionable` 检测。
- `type` 派发真实按键事件，但不模拟输入法或自动补全。
- 多数浏览器要求用户手势才能 `play`；content script 中 `safePlay` 是务实之选。
