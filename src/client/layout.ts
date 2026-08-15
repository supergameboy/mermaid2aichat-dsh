/**
 * DOM 布局控制器 — 在不改动 dsh 源码的前提下给 shell 的三列网格追加编辑器轨。
 *
 * 机制（参照 dsh-web-ui 的 aionui-panel 做法）：
 * - 找到 shell 网格容器（data-shell-overlay 的父节点，即 AppFrame），
 *   append 自己的编辑器列节点与拖拽把手（把手脱离网格流，absolute）
 * - MutationObserver 监听网格的 style 属性：shell 写 3 轨时同帧镜像并
 *   重写为 4 轨（原 3 轨逐字保留 + 编辑器轨）；自己写的 4 轨跳过
 * - 自绘拖拽把手（pointer capture）直接驱动编辑器宽度，实时钳制
 * - 宽度钳制自有数学：聊天区保证 >= CHAT_FLOOR，编辑器 [MIN_W, MAX_W]
 * - 显示层永远钳制（每次布网格都收敛）；持久化宽度只在拖拽结束、双击复位
 *   与帧尺寸变化时回写——侧栏/详情列开关只影响显示，不污染偏好，
 *   窗口重新变宽后编辑器自动恢复
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
  let unsubState: (() => void) | undefined
  const columnListeners = new Set<() => void>()
  /** shell 自身写入的 3 轨（镜像源；空白会话时第 3 轨补 0px）。 */
  let shellTracks: string[] = []
  /** 最近一次由本控制器写入的网格值（值比对识别自己的写入）。 */
  let lastOwn = ''
  let frameWidth = 0
  /** 拖拽期间的本地宽度（实时布栅格；松手才写回 store）。 */
  let dragWidth: number | null = null
  /** 拖拽期间已把帧的行内 transition 改为 none（结束/重渲染后恢复）。 */
  let transitionKilled = false

  const currentWidth = (): number => dragWidth ?? options.getState().width

  /** 钳制：聊天区保留 CHAT_FLOOR，编辑器 [MIN_W, MAX_W]。 */
  const clampWidth = (width: number): number => {
    const sidebar = shellTracks.length >= 1 ? trackPx(shellTracks[0]) : 0
    const details = shellTracks.length >= 3 ? trackPx(shellTracks[2]) : 0
    const available = Math.max(0, frameWidth - sidebar - details)
    const upper = Math.max(MIN_W, available - CHAT_FLOOR)
    return Math.round(Math.min(MAX_W, Math.max(MIN_W, Math.min(width, upper))))
  }

  const applyGrid = (): void => {
    if (frame === null || column === null || shellTracks.length !== 3) return
    const state = options.getState()
    const width = state.open && !state.maximized ? clampWidth(currentWidth()) : 0
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
    lastOwn = `${shellTracks[0]} ${shellTracks[1]} ${shellTracks[2]} ${width}px`
    frame.style.gridTemplateColumns = lastOwn
    column.style.visibility = width > 0 ? 'visible' : 'hidden'
    if (handle !== null) {
      handle.style.display = width > 0 ? 'block' : 'none'
      handle.style.left = `${Math.round(frameWidth - width)}px`
    }
  }

  /** 兼容 2/3 轨的 shell 写法：2 轨时补一个 0px 的 details 轨。 */
  const normalizeShell = (tracks: string[]): string[] | null => {
    if (tracks.length === 3) return tracks
    if (tracks.length === 2) return [tracks[0], tracks[1], '0px']
    return null
  }

  /**
   * shell 写入自己的 2/3 轨 → 镜像并追加编辑器轨；自己写的 3/4 轨 → 保持。
   * 值比对而非布尔标记：相同值的赋值不产生 mutation，布尔标记会滞留并
   * 吞掉下一次 shell 写入。
   */
  const syncGrid = (): void => {
    if (frame === null) return
    const inline = frame.style.gridTemplateColumns
    if (inline === '' || inline === lastOwn) return
    const normalized = normalizeShell(parseGridTracks(inline))
    if (normalized === null) return
    shellTracks = normalized
    applyGrid()
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

    const initial = frame.style.gridTemplateColumns
    if (initial !== '') {
      const normalized = normalizeShell(parseGridTracks(initial))
      if (normalized !== null) shellTracks = normalized
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
      unsubState = options.subscribe(applyGrid)
    },
    dispose: () => {
      unsubState?.()
      waitObserver?.disconnect()
      styleObserver?.disconnect()
      sizeObserver?.disconnect()
      if (frame !== null && transitionKilled) frame.style.transition = ''
      transitionKilled = false
      dragWidth = null
      column?.remove()
      handle?.remove()
      frame = null
      column = null
      handle = null
      shellTracks = []
      lastOwn = ''
      columnListeners.clear()
    },
  }
}
