/**
 * Toast 通知组件 — 轻量级操作反馈
 *
 * 单一职责：显示短暂的操作反馈消息，自动消失
 *
 * 使用方式：
 *   在 App 根组件中渲染 <ToastContainer />，
 *   然后调用 showToast(message, type) 显示通知
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;
const listeners: Set<(toast: ToastItem) => void> = new Set();

/** 显示 Toast 通知（命令式调用） */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast: ToastItem = { id: ++toastId, message, type };
  listeners.forEach((fn) => fn(toast));
}

/** Toast 容器组件 — 放置在 App 根节点 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      timersRef.current.delete(toast.id);
    }, 2000);
    timersRef.current.set(toast.id, timer);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [addToast]);

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
