import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { EstadoRS } from '../domain/types';
import { ESTADO_META } from '../domain/types';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'ghost' }) { return <button className={`btn btn-${variant} ${className}`} {...props} />; }
export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) { return <label className="field"><span>{label}{required && ' *'}</span>{children}</label>; }
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="input textarea" {...props} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select className="input" {...props} />; }
export function StatusBadge({ estado }: { estado: EstadoRS }) { const m = ESTADO_META[estado]; return <span className="badge" style={{ background: m.bg, color: m.fg }}><i style={{ background: m.dot }} />{estado}</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
