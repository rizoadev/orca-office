// ============================================================
// ToastService — global toast sederhana (port ToastContainer + addToast)
// ============================================================

import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<ToastItem[]>([]);
  toasts = this._toasts.asReadonly();

  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(text: string): void {
    const id = Date.now() + Math.random();
    this._toasts.update((prev) => [...prev.slice(-2), { id, text }]);
    const timer = setTimeout(() => {
      this._toasts.update((prev) => prev.filter((t) => t.id !== id));
      this.timers.delete(id);
    }, 3000);
    this.timers.set(id, timer);
  }
}