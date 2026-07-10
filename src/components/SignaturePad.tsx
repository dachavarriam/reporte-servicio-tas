import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Field, Input } from './ui';
import type { Firma } from '../domain/types';

export function SignaturePad({ onSave, onCancel, title = 'Firma del cliente', description = 'Entregue el dispositivo al cliente para que revise el RS completo. Al marcar la confirmación y firmar, el cliente declara que la información presentada es correcta y acepta el reporte de servicio.', confirmText = 'He revisado el reporte de servicio presentado en este dispositivo, confirmo que la información es correcta y acepto firmarlo electrónicamente.', defaultName = '', defaultCargo = '' }: { onSave: (firma: Firma) => void | Promise<void>; onCancel: () => void; title?: string; description?: string; confirmText?: string; defaultName?: string; defaultCargo?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [nombre, setNombre] = useState(defaultName); const [cargo, setCargo] = useState(defaultCargo); const [accepted, setAccepted] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { const c = canvas.current!; const rect = c.getBoundingClientRect(); c.width = rect.width * devicePixelRatio; c.height = 180 * devicePixelRatio; const ctx = c.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16181C'; }, []);
  const point = (e: PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const start = (e: PointerEvent<HTMLCanvasElement>) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = point(e); const ctx = e.currentTarget.getContext('2d')!; ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const [x, y] = point(e); const ctx = e.currentTarget.getContext('2d')!; ctx.lineTo(x, y); ctx.stroke(); };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };
  const save = async () => {
    if (saving || !canvas.current) return;
    setSaving(true);
    try {
      await onSave({ nombre, cargo, aceptada: accepted, trazo: canvas.current.toDataURL('image/png'), firmadaEn: new Date().toISOString() });
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-layer"><div className="modal"><h2>{title}</h2><p>{description}</p><Field label="Nombre completo" required><Input value={nombre} onChange={e => setNombre(e.target.value)} /></Field><Field label="Cargo"><Input value={cargo} onChange={e => setCargo(e.target.value)} /></Field><canvas ref={canvas} className="signature" onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} /><button className="clear-sign" disabled={saving} onClick={clear}>Limpiar firma</button><label className="check"><input type="checkbox" disabled={saving} checked={accepted} onChange={e => setAccepted(e.target.checked)} /> {confirmText}</label><div className="modal-actions"><Button variant="outline" disabled={saving} onClick={onCancel}>Cancelar</Button><Button disabled={!nombre || !accepted || saving} onClick={() => { void save(); }}>{saving ? 'Guardando...' : 'Guardar firma'}</Button></div></div></div>;
}
export async function getSignatureLocation() {
  if (!navigator.geolocation) return undefined;
  return new Promise<Firma['ubicacion']>(resolve => {
    let done = false;
    const finish = (value?: Firma['ubicacion']) => { if (done) return; done = true; resolve(value); };
    const timer = window.setTimeout(() => finish(undefined), 2500);
    navigator.geolocation.getCurrentPosition(
      pos => { window.clearTimeout(timer); finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
      () => { window.clearTimeout(timer); finish(undefined); },
      { enableHighAccuracy: true, timeout: 2500, maximumAge: 60000 }
    );
  });
}
