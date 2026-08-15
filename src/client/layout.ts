/**
 * DOM 布局控制器 — 在不改动 dsh 源码的前提下给 shell 的三列网格追加编辑器轨。
 *
 * 机制（参照 dsh-web-ui 的 aionui-panel 做法）：
 * - 找到 shell 网格容器（data-shell-overlay 的父节点，即 AppFrame），
 *   插入自己的编辑器列节点与拖拽把手（把手脱离网格流，absolute）
 * - MutationObserver 监听网格的 style 属性：shell 写 2/3 轨时同帧镜像并
 *   追加编辑器轨；自己写的轨跳过（值比对）
 * - 自绘拖拽把手（pointer capture）直接驱动编辑器宽度，实时钳制
 * - 宽度钳制自有数学：聊天区保证 >= CHAT_FLOOR，编辑器 [MIN_W, MAX_W]
 * - 显示层永远钳制（每次布网格都收敛）；持久化宽度只在拖拽结束、双击复位
 *   与帧尺寸变化时回写——侧栏/详情列开关只影响显示，不污染偏好，
 *   窗口重新变宽后编辑器自动恢复
 *
 * 与 dsh-web-ui（aionui-panel）共存协议：
 * - aionui 的控制器只认「2-3 轨 = shell 写入」和「5 轨 = 自己的写入」，
 *   其余轨数一律忽略。因此本控制器在检测到其面板列时改为写入
 *   6 轨 = shell 3 轨 + 编辑器轨 + 其预览轨 + 其文件树轨（轨序与 DOM 序一致），
 *   并把本编辑器列固定在对方列之前，保持其拖拽把手的宽度假设成立
 * - 对方写 5 轨（shell 3 + 其 2 轨）时，本控制器同帧读取其两轨数值并
 *   重写为 6 轨（其写入会瞬时覆盖编辑器轨，同帧恢复，用户不可见）
 * - 对方列已存在但数值未知（对方 HMR / 后挂载）时，先写一次纯 shell 3 轨
 *   「推一把」：对方的观察器会以 5 轨回应，本控制器再收敛到 6 轨
 *
 * 不依赖布局服务、不遮蔽 details 列（会话详情面板照常工作）、零 dsh 改动。
 */

/** 编辑器轨宽度契约。 */
export const MIN_W = 300
export const MAX_W = 1200
/** 聊天区保留的最小宽度。 */
export const CHAT_FLOOR = 400
/** 默认宽度。 */
export const DEFAULT_W = 480

/** aionui-panel 面板列的 DOM 标识（共存检测）。 */
const AIONUI_COL_ATTRS = ['data-aionui-preview-col', 'data-aionui-explorer-col']

/** 解析行内 grid-template-columns（容忍 minmax 括号内的空格）。 */
export function parseGridTracks(input: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ' ' && depth === 0) {
      if (current !== '') {
        tracks.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') tracks.push(current)
  return tracks
}

/** 提取轨道的 px 宽度（非 px 轨道返回 0）。 */
function trackPx(track: string): number {
  const match = /^(-?[\d.]+)px$/.exec(track.trim())
  return match === null ? 0 : Number(match[1])
}

/** 是否为 shell 自身的三列（CSS 模块类名以这些后缀结尾）。 */
function isShellCol(el: Element): boolean {
  const cls = String(el.className)
  return cls.includes('sidebarCol') || cls.includes('centerCol') || cls.includes('detailsCol')
}

/** 是否为网格流外的节点（浮层 / 绝对定位把手）。 */
function isOutOfFlow(el: Element): boolean {
  if (el.hasAttribute('data-shell-overlay')) return true
  return (el as HTMLElement).style?.position === 'absolute'
}

/** 编辑器布局状态（只读面，由 apply 从状态源投影）。 */
export interface EditorLayoutState {
  open: boolean
  maximized: boolean
  width: number
}

export interface EditorLayoutOptions {
  /** 当前布局状态（apply 闭包内从状态源读取）。 */
  getState(): EditorLayoutState
  /** 状态变化订阅（引用变化时触发）。 */
  subscribe(fn: () => void): () => void
  /** 拖拽结束后把最终宽度写回持久化状态。 */
  onWidthCommit(width: number): void
}

export interface EditorLayoutHandle {
  /** 编辑器列 DOM 节点（React portal 的挂载点；挂载前为 null）。 */
  getColumn(): HTMLElement | null
  /** 列节点就绪通知（帧挂载成功后触发；portal 挂载点出现）。 */
  subscribeColumn(fn: () => void): () => void
  /** 启动帧等待与挂载。 */
  mount(): void
  /** 拆除全部 DOM 与观察器。 */
  dispose(): void
}

export function createEditorLayout(options: EditorLayoutOptions): EditorLayoutHandle {
  let frame: HTMLElement | null = null
  let column: HTMLDivElement | null = null
  let handle: HTMLDivElement | null = null
  let waitObserver: MutationObserver | null = null
  let styleObserver: MutationObserver | null = null
  let sizeObserver: ResizeObserver | null = null
  let frameChildObserver: MutationObserver | null = null
  let unsubState: (() => void) | undefined
  const columnListeners = new Set<() => void>()

  /** shell 自身写入的 3 轨（镜像源；空白会话时第 3 轨补 0px）。 */
  let shellTracks: string[] = []
  /** 共存面板列（aionui preview/explorer，DOM 序，编辑器列之前插入）。 */
  let foreignCols: HTMLElement[] = []
  /** 共存面板轨的最近观测值（与 foreignCols 对齐；未知时为空）。 */
  let foreignValues: string[] = []
  /** 最近一次由本控制器写入的网格值（值比对识别自己的写入）。 */
  let lastOwn = ''
  /** 最近一次「推一把」写入的纯 shell 值（自己的观察器跳过）。 */
  let lastNudge = ''
  /** 已在等对方回应的推一把（避免反复推）。 */
  let nudgePending = false
  let frameWidth = 0
  /** 拖拽期间的本地宽度（实时布栅格；松手才写回 store）。 */
  let dragWidth: number | null = null
  /** 拖拽期间已把帧的行内 transition 改为 none（结束/重渲染后恢复）。 */
  let transitionKilled = false
  /** 同一轮观察器级联内的写入计数（防循环护栏，超限停写并留诊断）。 */
  let writeBurst = 0
  let burstResetTimer: ReturnType<typeof setTimeout> | undefined
  /** 护栏触发后的被动冷却截止（syncGrid 期间忽略外来写入）。 */
  let cooldownUntil = 0

  const guardWrite = (): boolean => {
    writeBurst += 1
    if (burstResetTimer !== undefined) clearTimeout(burstResetTimer)
    burstResetTimer = setTimeout(() => { writeBurst = 0 }, 0)
    if (writeBurst > 24) {
      // 观察器级联成环：进入 200ms 冷却，任外来写入都不再回应，环必然断开
      if (writeBurst === 25) {
        console.error('[mermaid2aichat-dsh] layout write-burst cap hit; cooling down 200ms')
        cooldownUntil = Date.now() + 200
        setTimeout(() => {
          if (Date.now() >= cooldownUntil) {
            rescanPanels()
            applyGrid()
          }
        }, 220)
      }
      return false
    }
    return true
  }

  const currentWidth = (): number => dragWidth ?? options.getState().width

  /** 重扫帧内的共存面板列，并保证编辑器列是第一个面板列。 */
  const rescanPanels = (): void => {
    if (frame === null || column === null) return
    const next: HTMLElement[] = []
    for (const child of Array.from(frame.children)) {
      if (child === column || isShellCol(child) || isOutOfFlow(child)) continue
      const el = child as HTMLElement
      const isForeign = AIONUI_COL_ATTRS.some((attr) => el.hasAttribute(attr))
      if (!isForeign) continue
      next.push(el)
    }
    const changed = next.length !== foreignCols.length
      || next.some((el, i) => el !== foreignCols[i])
    foreignCols = next
    if (changed) {
      foreignValues = []
      nudgePending = false
    }
    // 编辑器列必须位于共存列之前：保持对方「预览/文件树靠最右」的把手假设。
    const firstForeign = foreignCols[0]
    // FOLLOWING 位 = 编辑器列位于 firstForeign 之后（需要前移）；
    // PRECEDING 位含义相反，写反会导致列永远排不上第一个面板位。
    if (firstForeign !== undefined
      && (firstForeign.compareDocumentPosition(column) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      frame.insertBefore(column, firstForeign)
    }
  }

  const foreignSum = (): number => foreignValues.reduce((sum, t) => sum + trackPx(t), 0)

  /** 钳制：聊天区保留 CHAT_FLOOR，编辑器 [MIN_W, MAX_W]（共存列一并让位）。 */
  const clampWidth = (width: number): number => {
    const sidebar = shellTracks.length >= 1 ? trackPx(shellTracks[0]) : 0
    const details = shellTracks.length >= 3 ? trackPx(shellTracks[2]) : 0
    const available = Math.max(0, frameWidth - sidebar - details - foreignSum())
    const upper = Math.max(MIN_W, available - CHAT_FLOOR)
    return Math.round(Math.min(MAX_W, Math.max(MIN_W, Math.min(width, upper))))
  }

  /** 写入纯 shell 3 轨，触发对方控制器以 5 轨回应（共存值未知时的恢复路径）。 */
  const nudgeForeign = (): void => {
    if (frame === null || shellTracks.length !== 3 || nudgePending) return
    if (!guardWrite()) return
    nudgePending = true
    lastNudge = `${shellTracks[0]} ${shellTracks[1]} ${shellTracks[2]}`
    frame.style.gridTemplateColumns = lastNudge
  }

  const applyGrid = (): void => {
    if (frame === null || column === null || shellTracks.length !== 3) return
    const state = options.getState()
    const open = state.open && !state.maximized
    const myWidth = open ? clampWidth(currentWidth()) : 0

    if (foreignCols.length > 0) {
      // 共存：6 轨 = shell 3 轨 + 编辑器轨 + 对方各轨。
      // 对方数值未知时先推一把（写纯 shell 3 轨），由对方的 5 轨写入带回
      // 真实值后再收敛到 6 轨——直接写 6 轨会以 0px 覆盖对方的轨并掩盖推一把。
      if (foreignValues.length !== foreignCols.length) {
        nudgeForeign()
        return
      }
      const foreign = foreignCols.map((_, i) => foreignValues[i] ?? '0px')
      lastOwn = `${shellTracks[0]} ${shellTracks[1]} ${shellTracks[2]} ${myWidth}px ${foreign.join(' ')}`
    } else {
      lastOwn = `${shellTracks[0]} ${shellTracks[1]} ${shellTracks[2]} ${myWidth}px`
    }

    // 拖拽期间关掉 shell 网格自带的 grid-template-columns 过渡动画
    // （.frame 样式表规则会对每帧写入做缓动，导致列跟不上把手）；
    // 打开/关闭仍保留动画，只有拖拽是逐帧直写。
    if (dragWidth !== null && !transitionKilled) {
      frame.style.transition = 'none'
      transitionKilled = true
    } else if (dragWidth === null && transitionKilled) {
      frame.style.transition = ''
      transitionKilled = false
    }
    if (!guardWrite()) return
    frame.style.gridTemplateColumns = lastOwn
    column.style.visibility = myWidth > 0 ? 'visible' : 'hidden'
    if (handle !== null) {
      handle.style.display = myWidth > 0 ? 'block' : 'none'
      // 编辑器列是第一个面板列：左边缘 = 帧宽 - 自己 - 其后的共存列
      handle.style.left = `${Math.round(frameWidth - myWidth - foreignSum())}px`
    }
  }

  /** 兼容 2/3 轨的 shell 写法：2 轨时补一个 0px 的 details 轨。 */
  const normalizeShell = (tracks: string[]): string[] | null => {
    if (tracks.length === 3) return tracks
    if (tracks.length === 2) return [tracks[0], tracks[1], '0px']
    return null
  }

  /**
   * shell 写入自己的 2/3 轨 → 镜像并追加面板轨；自己/推一把的写入 → 保持；
   * 对方写「shell 3 + 其 2 轨」→ 读取其数值并重写为 6 轨。
   * 值比对而非布尔标记：相同值的赋值不产生 mutation，布尔标记会滞留并
   * 吞掉下一次 shell 写入。
   */
  const syncGrid = (): void => {
    if (frame === null) return
    if (Date.now() < cooldownUntil) return
    const inline = frame.style.gridTemplateColumns
    if (inline === '' || inline === lastOwn) return
    if (inline === lastNudge) {
      lastNudge = ''
      return
    }
    const tracks = parseGridTracks(inline)
    const normalized = normalizeShell(tracks)
    if (normalized !== null) {
      shellTracks = normalized
      nudgePending = false
      applyGrid()
      return
    }
    // 对方的 5 轨写入（shell 3 + preview + explorer）：记录其两轨并同帧恢复 6 轨
    if (tracks.length === 3 + foreignCols.length && foreignCols.length > 0) {
      shellTracks = tracks.slice(0, 3)
      foreignValues = tracks.slice(3)
      nudgePending = false
      applyGrid()
    }
  }

  const measure = (): void => {
    if (frame === null) return
    frameWidth = frame.getBoundingClientRect().width
    // 帧尚未布局（宽度 0）时只布网格，不回写钳制值：0 宽帧会把持久化宽度
    // 钳成 MIN_W 而污染存储。
    if (frameWidth > 0) {
      const width = currentWidth()
      const clamped = clampWidth(width)
      if (dragWidth === null && clamped !== width) {
        options.onWidthCommit(clamped)
      }
    }
    applyGrid()
  }

  const tryAttach = (): void => {
    if (frame !== null) return
    const overlayLayer = document.querySelector('[data-shell-overlay]')
    const candidate = overlayLayer?.parentElement ?? null
    if (candidate === null) return
    // 校验候选确实是 AppFrame（含 centerCol），避免挂到启动期瞬态容器。
    if (candidate.querySelector('[class*="centerCol"]') === null) return
    attach(candidate)
  }

  const attach = (el: HTMLElement): void => {
    frame = el
    column = document.createElement('div')
    column.dataset.mermaidEditorCol = ''
    column.style.minWidth = '0'
    column.style.overflow = 'hidden'
    column.style.display = 'flex'
    column.style.flexDirection = 'column'
    column.style.visibility = 'hidden'
    column.style.borderLeft = '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))'
    frame.appendChild(column)

    handle = document.createElement('div')
    handle.dataset.mermaidEditorHandle = ''
    handle.style.position = 'absolute'
    handle.style.top = '0'
    handle.style.bottom = '0'
    handle.style.width = '10px'
    handle.style.marginLeft = '-5px'
    handle.style.zIndex = '30'
    handle.style.cursor = 'col-resize'
    handle.style.touchAction = 'none'
    handle.style.display = 'none'
    handle.appendChild(handlePill())
    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault()
      handle?.setPointerCapture(event.pointerId)
      dragWidth = options.getState().width
      // 按下即关过渡：首次移动的写入也不做缓动，列严格跟随指针。
      applyGrid()
      const startX = event.clientX
      const startW = dragWidth
      const onMove = (ev: PointerEvent): void => {
        dragWidth = clampWidth(startW - (ev.clientX - startX))
        applyGrid()
      }
      const onUp = (): void => {
        handle?.removeEventListener('pointermove', onMove)
        handle?.removeEventListener('pointerup', onUp)
        handle?.removeEventListener('pointercancel', onUp)
        if (dragWidth !== null) {
          const committed = dragWidth
          dragWidth = null
          options.onWidthCommit(committed)
          applyGrid()
        }
      }
      handle?.addEventListener('pointermove', onMove)
      handle?.addEventListener('pointerup', onUp)
      handle?.addEventListener('pointercancel', onUp)
    })
    handle.addEventListener('dblclick', () => {
      dragWidth = null
      options.onWidthCommit(DEFAULT_W)
      applyGrid()
    })
    frame.appendChild(handle)

    styleObserver = new MutationObserver(syncGrid)
    styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] })
    sizeObserver = new ResizeObserver(measure)
    sizeObserver.observe(frame)
    frameChildObserver = new MutationObserver(() => {
      rescanPanels()
      applyGrid()
    })
    frameChildObserver.observe(frame, { childList: true })

    rescanPanels()
    const initial = frame.style.gridTemplateColumns
    if (initial !== '') {
      const tracks = parseGridTracks(initial)
      const normalized = normalizeShell(tracks)
      if (normalized !== null) {
        shellTracks = normalized
      } else if (tracks.length >= 3 + foreignCols.length && foreignCols.length > 0) {
        // 帧上已带着对方（或本插件热更前）的多轨写入：镜像前 3 轨与对方各轨
        shellTracks = tracks.slice(0, 3)
        foreignValues = tracks.slice(3, 3 + foreignCols.length)
      }
    }
    measure()
    applyGrid()
    for (const fn of [...columnListeners]) fn()
  }

  const handlePill = (): HTMLDivElement => {
    const pill = document.createElement('div')
    pill.style.position = 'absolute'
    pill.style.top = '50%'
    pill.style.left = '50%'
    pill.style.transform = 'translate(-50%, -50%)'
    pill.style.width = '12px'
    pill.style.height = '32px'
    pill.style.borderRadius = '10px'
    pill.style.boxSizing = 'border-box'
    pill.style.background = 'var(--dsw-alias-button-floating-fill, #ffffff)'
    pill.style.border = '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.14))'
    pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.14)'
    pill.style.pointerEvents = 'none'
    return pill
  }

  return {
    getColumn: () => column,
    subscribeColumn: (fn: () => void): (() => void) => {
      columnListeners.add(fn)
      return () => { columnListeners.delete(fn) }
    },
    mount: () => {
      waitObserver = new MutationObserver(tryAttach)
      waitObserver.observe(document.body, { childList: true, subtree: true })
      tryAttach()
      unsubState = options.subscribe(() => {
        rescanPanels()
        applyGrid()
      })
    },
    dispose: () => {
      unsubState?.()
      waitObserver?.disconnect()
      styleObserver?.disconnect()
      sizeObserver?.disconnect()
      frameChildObserver?.disconnect()
      if (frame !== null && transitionKilled) frame.style.transition = ''
      transitionKilled = false
      dragWidth = null
      column?.remove()
      handle?.remove()
      frame = null
      column = null
      handle = null
      shellTracks = []
      foreignCols = []
      foreignValues = []
      lastOwn = ''
      lastNudge = ''
      nudgePending = false
      columnListeners.clear()
    },
  }
}
