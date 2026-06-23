import { create } from 'zustand';
import type { Metrics, ReporteServicio, Usuario } from '../domain/types';
import { reports } from '../data/repository';
import { DEMO_PASSWORD, DEMO_USER } from '../data/seed';

interface AppState {
  user: Usuario | null; items: ReporteServicio[]; metrics: Metrics | null; loading: boolean; online: boolean;
  toast: string; login(usuario: string, password: string): boolean; logout(): void; load(): Promise<void>; notify(message: string): void;
}

export const useApp = create<AppState>((set, get) => ({
  user: sessionStorage.getItem('rs-session') ? DEMO_USER : null, items: [], metrics: null, loading: true, online: navigator.onLine, toast: '',
  login(usuario, password) { const ok = usuario.toLowerCase() === DEMO_USER.usuario && password === DEMO_PASSWORD; if (ok) { sessionStorage.setItem('rs-session', 'demo'); set({ user: DEMO_USER }); } return ok; },
  logout() { sessionStorage.removeItem('rs-session'); set({ user: null }); },
  async load() { set({ loading: true }); const [list, metrics] = await Promise.all([reports.list(), reports.metrics()]); set({ items: list.items, metrics, loading: false }); },
  notify(message) { set({ toast: message }); window.setTimeout(() => { if (get().toast === message) set({ toast: '' }); }, 2400); }
}));
