import { create } from 'zustand';
import type { Metrics, ReporteServicio, Usuario } from '../domain/types';
import { reports } from '../data/repository';
import { jsonHeaders } from '../data/api';

interface AppState {
  user: Usuario | null; items: ReporteServicio[]; metrics: Metrics | null; loading: boolean; online: boolean;
  toast: string; login(usuario: string, password: string): Promise<boolean>; changePassword(currentPassword: string, newPassword: string): Promise<boolean>; logout(): void; load(): Promise<void>; notify(message: string): void;
}

export const useApp = create<AppState>((set, get) => ({
  user: sessionStorage.getItem('rs-user') && sessionStorage.getItem('rs-token') ? JSON.parse(sessionStorage.getItem('rs-user') as string) : null, items: [], metrics: null, loading: true, online: navigator.onLine, toast: '',
  async login(usuario, password) {
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, password }) });
      if (!res.ok) throw new Error('invalid');
      const data = await res.json() as { user: Usuario; token: string };
      sessionStorage.setItem('rs-user', JSON.stringify(data.user)); sessionStorage.setItem('rs-token', data.token); set({ user: data.user }); return true;
    } catch {
      return false;
    }
  },
  async changePassword(currentPassword, newPassword) {
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ currentPassword, newPassword }) });
      if (!res.ok) throw new Error('invalid');
      const user = get().user;
      if (user) {
        const updated = { ...user, mustChangePassword: false };
        sessionStorage.setItem('rs-user', JSON.stringify(updated));
        set({ user: updated });
      }
      return true;
    } catch {
      return false;
    }
  },
  logout() { sessionStorage.removeItem('rs-user'); sessionStorage.removeItem('rs-token'); set({ user: null }); },
  async load() { set({ loading: true }); const [list, metrics] = await Promise.all([reports.list(), reports.metrics()]); set({ items: list.items, metrics, loading: false }); },
  notify(message) { set({ toast: message }); window.setTimeout(() => { if (get().toast === message) set({ toast: '' }); }, 2400); }
}));
