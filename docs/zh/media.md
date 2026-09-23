# Media

**语言：** [English](../en/media.md) · [简体中文](./media.md) · [目录](./README.md)

面向 `<audio>`/`<video>` 的播放监管：处理那些属于 DOM/媒体语义、而非通用
`Effect` 能力的问题。

```ts
import { Effect } from "effect"
import * as Media from "@lialh4/effect-dom/Media"
```

## 为什么单独成模块

媒体元素存在不等于可播放，而流在接近结束时停止时 `ended` 并不可靠。本模块存在的
意义就是消除这些 bug：

- `preload="none"` 时 `readyState` 一直为 `0`，直到你请求播放。
- 卡住的视频报告 `paused = false`，但 `currentTime` 冻结。
- 流可能在 `duration` 前约 2 秒停止，`ended` 永远不触发。
- 站点会在你播放后立刻重置 `muted`/`playbackRate` 并暂停播放器。

## 就绪

```ts
Media.waitReadyState(media, state, opts?): Effect<void>
Media.waitCanPlay(media, opts?): Effect<void>
```

`waitReadyState` 在 `readyState >= state` 时返回，优先使用对应的媒体事件
（`loadedmetadata`、`loadeddata`、`canplay`、`canplaythrough`），否则轮询。
`waitCanPlay` 即 `waitReadyState(media, 3)`（`HAVE_FUTURE_DATA`）。它**不会**
替你调用 `play()` —— `preload="none"` 时先开始播放（`Interact.safePlay`）再等待。

```ts
import { safePlay } from "@lialh4/effect-dom/Interact"

yield* safePlay(video)
yield* Media.waitCanPlay(video, { interval: "100 millis" })
```

`readyState` 常量：`0` `HAVE_NOTHING`、`1` `HAVE_METADATA`、`2`
`HAVE_CURRENT_DATA`、`3` `HAVE_FUTURE_DATA`、`4` `HAVE_ENOUGH_DATA`。

## 卡顿检测

```ts
interface StallOpts extends WaitOpts {
  readonly epsilon?: number // 默认 0.01 秒
}

Media.watchStall(media, opts?): Effect<void, StallError>
```

`watchStall` 每隔 `interval` 采样 `currentTime` 与 `paused`。一旦媒体暂停，或在
`paused = false` 时 `currentTime` 变化不超过 `epsilon`，立即以 `StallError` 失败。
播放健康时它会一直运行，因此请与真正等待的条件竞速：

```ts
import { waitEvent } from "@lialh4/effect-dom/Wait"

// 播放冻结则以 StallError 失败；用户暂停则正常结束
yield* Media.watchStall(video).pipe(
  Effect.raceFirst(waitEvent(video, "pause")),
)
```

`StallError` 携带 `{ media, reason: "paused" | "frozen", currentTime, duration }`。

## 容差结束

```ts
Media.isEndedWithin(media, tolerance): boolean
Media.endedWithin(media, tolerance, opts?): Effect<void>
```

`isEndedWithin` 是纯检查（`ended`，或 `currentTime >= duration - tolerance`）；
`endedWithin` 等待其成立。适用于在精确 duration 之前停止的流：

```ts
yield* Media.endedWithin(video, 2) // 距结束 2 秒以内
```

## 强制收尾

```ts
Media.finishMedia(media): Effect<void>
```

跳到有限的 `duration`，促使平台触发 `ended`/`complete`。直播流（duration 非有限）
为 no-op。

## 监管

```ts
interface KeepPlayingOpts extends WaitOpts {
  readonly muted?: boolean
  readonly playbackRate?: number
  readonly volume?: number
  readonly resume?: boolean // 默认 true
}

Media.keepPlaying(media, opts?): Effect<void>
```

`keepPlaying` 永远运行，每个 tick 重新应用 `muted`/`volume`/`playbackRate`，并在
媒体暂停（且未结束）时重新调用 `play()`。可以 fork 后在导航时中断，也可与
`watchStall` 组合，让整组在播放卡住时失败：

```ts
import { keepPlaying, watchStall } from "@lialh4/effect-dom/Media"

yield* Effect.all(
  [
    keepPlaying(video, { muted: true, playbackRate: 1.5 }),
    watchStall(video),
  ],
  { concurrency: "unbounded" },
)
```

## 重新导出

`Media` 重新导出 [Wait](./wait.md) 的 `isMediaEnded` 与 `waitMediaEnded`，
媒体用户只需一个导入。

## 注意事项

- `watchStall` 把 `paused` 视为卡顿。请在开始播放**之后**启动它。
- 所有媒体等待默认无超时；用 `Effect.timeout` / `Effect.timeoutFail` 设限。
- 对直播流（`duration === Infinity`）`finishMedia` 不做任何事。
