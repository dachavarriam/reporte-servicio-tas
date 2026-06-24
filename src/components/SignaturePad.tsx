import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Field, Input } from './ui';
import type { Firma } from '../domain/types';

export function SignaturePad({ onSave, onCancel, title = 'Firma del cliente', description = 'Entregue el dispositivo al cliente para que revise el RS completo. Al marcar la confirmación y firmar, el cliente declara que la información presentada es correcta y acepta el reporte de servicio.', confirmText = 'He revisado el reporte de servicio presentado en este dispositivo, confirmo que la información es correcta y acepto firmarlo electrónicamente.', defaultName = '', defaultCargo = '' }: { onSave: (firma: Firma) => void; onCancel: () => void; title?: string; description?: string; confirmText?: string; defaultName?: string; defaultCargo?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [nombre, setNombre] = useState(defaultName); const [cargo, setCargo] = useState(defaultCargo); const [accepted, setAccepted] = useState(false);
  useEffect(() => { const c = canvas.current!; const rect = c.getBoundingClientRect(); c.width = rect.width * devicePixelRatio; c.height = 180 * devicePixelRatio; const ctx = c.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16181C'; }, []);
  const point = (e: PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const start = (e: PointerEvent<HTMLCanvasElement>) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = point(e); const ctx = e.currentTarget.getContext('2d')!; ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const [x, y] = point(e); const ctx = e.currentTarget.getContext('2d')!; ctx.lineTo(x, y); ctx.stroke(); };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };
  const save = async () => onSave({ nombre, cargo, aceptada: accepted, trazo: canvas.current!.toDataURL('image/png'), firmadaEn: new Date().toISOString(), ubicacion: await getLocation() });
  return <div className="modal-layer"><div className="modal"><h2>{title}</h2><p>{description}</p><Field label="Nombre completo" required><Input value={nombre} onChange={e => setNombre(e.target.value)} /></Field><Field label="Cargo"><Input value={cargo} onChange={e => setCargo(e.target.value)} /></Field><canvas ref={canvas} className="signature" onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} /><button className="clear-sign" onClick={clear}>Limpiar firma</button><label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> {confirmText}</label><div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button disabled={!nombre || !accepted} onClick={() => { void save(); }}>Guardar firma</Button></div></div></div>;
}
async function getLocation() {
  if (!navigator.geolocation) return undefined;
  return new Promise<Firma['ubicacion']>(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
}
