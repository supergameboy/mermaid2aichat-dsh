/**
 * 标签栏 — 面板内多视图管理（新建 / 切换 / 关闭 / 双击重命名 / 拖拽排序）。
 * 扁平标签条，位于面板头部下方。关闭有确认弹窗，避免误删。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { MermaidView } from './state.js'
import css from './PluginTabBar.module.css'

export interface PluginTabBarProps {
  views: readonly MermaidView[]
  activeViewId: string
  onSwitchView: (id: string) => void
  onCreateView: () => void
  onCloseView: (id: string) => void
  onRenameView: (id: string, title: string) => void
  onReorderViews: (orderedIds: string[]) => void
}

export function PluginTabBar({
  views,
  activeViewId,
  onSwitchView,
  onCreateView,
  onCloseView,
  onRenameView,
  onReorderViews,
}: PluginTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [closeConfirm, setCloseConfirm] = useState<MermaidView | null>(null)
  const dragSourceId = useRef<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // 进入编辑态时聚焦并全选
  useEffect(() => {
    if (editingId !== null && editInputRef.current !== null) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const startRename = useCallback((view: MermaidView) => {
    setEditingId(view.id)
    setEditingTitle(view.title)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId !== null) {
      onRenameView(editingId, editingTitle)
    }
    setEditingId(null)
    setEditingTitle('')
  }, [editingId, editingTitle, onRenameView])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingTitle('')
  }, [])

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    dragSourceId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault()
    const sourceId = dragSourceId.current
    dragSourceId.current = null
    if (sourceId === null || sourceId === targetId) return
    const ids = views.map((v) => v.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    ids.splice(to, 0, sourceId)
    onReorderViews(ids)
  }, [views, onReorderViews])

  return (
    <div className={css.bar}>
      <div className={css.tabs}>
        {views.map((view) => {
          const active = view.id === activeViewId
          const editing = view.id === editingId
          return (
            <div
              key={view.id}
              className={active ? `${css.tab} ${css.active}` : css.tab}
              draggable={!editing}
              onDragStart={(e) => handleDragStart(e, view.id)}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => handleDrop(e, view.id)}
              onClick={() => { if (!editing && !active) onSwitchView(view.id) }}
              onDoubleClick={() => { startRename(view) }}
              title="双击重命名"
            >
              {editing ? (
                <input
                  ref={editInputRef}
                  className={css.editInput}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => { setEditingTitle(e.target.value) }}
                  onBlur={(e) => { if (e.relatedTarget !== null) commitRename() }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onClick={(e) => { e.stopPropagation() }}
                />
              ) : (
                <>
                  <span className={css.title}>{view.title}</span>
                  <button
                    type="button"
                    className={css.close}
                    title="关闭"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCloseConfirm(view)
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" className={css.new} title="新建空白视图" onClick={onCreateView}>
        +
      </button>

      {closeConfirm !== null && (
        <div className={css.overlay} onClick={() => { setCloseConfirm(null) }}>
          <div className={css.modal} onClick={(e) => { e.stopPropagation() }}>
            <div className={css.message}>确定关闭标签页「{closeConfirm.title}」？关闭后无法恢复。</div>
            <div className={css.actions}>
              <button type="button" className={css.cancel} onClick={() => { setCloseConfirm(null) }}>
                取消
              </button>
              <button
                type="button"
                className={css.confirm}
                onClick={() => {
                  onCloseView(closeConfirm.id)
                  setCloseConfirm(null)
                }}
              >
                确认关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
