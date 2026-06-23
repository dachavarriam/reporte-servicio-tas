# Handoff: RS TAS — Reportes de Servicio (PWA)

> **Objetivo de esta entrega:** construir una **PWA funcional** (instalable, offline-first, mobile-first) que reproduzca fielmente el prototipo de diseño. En esta primera fase **no** se implementa backend real, firma electrónica, Odoo ni Slack: esos servicios quedan detrás de una **capa de datos intercambiable** (mock + persistencia local) para poder cablearlos después sin reescribir la UI.

---

## 1. Overview

**RS TAS** es la aplicación con la que ~20 supervisores y técnicos de **TAS Honduras** crean y administran **Reportes de Servicio (RS)** técnicos desde el teléfono durante visitas a clientes, y que también se consulta desde computadora para administración.

La app cubre:
- Pantalla principal con resumen, búsqueda y filtros.
- Creación de un RS mediante **formulario multipaso de 7 pasos** con progreso y guardado automático.
- Bandeja de **Pendientes** y **Perfil**.
- **Detalle** de un reporte (timeline, secciones plegables, galería, vista previa de PDF, acciones).
- **Consola de escritorio** (sidebar + tabla + métricas + panel lateral de vista rápida + formulario en dos columnas).

---

## 2. Sobre los archivos de diseño

Los archivos en `design/` son **referencias de diseño hechas en HTML** — un prototipo que muestra el aspecto e interacciones previstas, **no** código de producción para copiar tal cual.

- `design/RS TAS.dc.html` — el prototipo completo. Está escrito como un "Design Component": un `<x-dc>` con plantilla + una clase `Component` de lógica. **No copies su runtime** (`support.js`); úsalo solo para ver el comportamiento real abriéndolo en un navegador.
- La tarea es **recrear estas pantallas en un proyecto PWA nuevo** (recomendación abajo) usando patrones y librerías estándar del stack elegido.

**Cómo correr el prototipo de referencia:** abre `design/RS TAS.dc.html` en un navegador (sirve la carpeta con cualquier static server para que cargue `support.js` y los assets). Arriba hay un conmutador **Móvil / Escritorio**.

---

## 3. Fidelidad

**Alta fidelidad (hi-fi).** Colores, tipografía, espaciados, radios y estados son finales y deben respetarse pixel-perfect. Todos los tokens están en la sección [Design Tokens](#9-design-tokens). La marca (logo, rojo TAS) es definitiva.

---

## 4. Stack recomendado para la PWA

No existe codebase previo, así que se recomienda (ajustable por el equipo):

- **Vite + React + TypeScript**.
- **vite-plugin-pwa** (Workbox) para service worker, manifest e instalación.
- **React Router** para navegación.
- **Estado:** Zustand (ligero) o Context+reducer. Estado del formulario aislado por borrador.
- **Persistencia local:** **IndexedDB** (vía `idb` o Dexie) para reportes, borradores y cola de sincronización; `localStorage` solo para preferencias y la posición del borrador.
- **UI:** componentes propios siguiendo los tokens; opcionalmente **shadcn/ui** + Tailwind (el diseño ya sigue esa estética: tarjetas limpias, bordes sutiles, badges, radios medianos). Si usan Tailwind, mapear los tokens a `theme.extend`.
- **Iconos:** **lucide-react** (los íconos del prototipo son equivalentes a Lucide: home, clock, plus, user, search, mic, camera, chevron, check, x, download, share, calendar, edit, trash, alert-triangle, bell, map-pin, phone, mail, file-text, pen-tool/signature, eye, columns, bar-chart).

### Requisitos PWA (definición de "funcional" en esta fase)
1. **Instalable**: manifest con nombre "RS TAS", íconos (192/512 + maskable), `display: standalone`, `theme_color #C20E1A`, `background_color #F4F5F7`, orientación `portrait` en móvil.
2. **Offline-first**: la app abre y opera sin red. Crear/editar borradores funciona offline y se guarda en IndexedDB.
3. **Datos mock**: sembrar los 8 reportes de ejemplo (ver `DATA_MODEL.md`) en IndexedDB en el primer arranque.
4. **Capa de datos abstracta** (`ReportRepository`) con implementación local hoy y un hueco para API REST mañana (ver `API_CONTRACT.md`).
5. **Guardado automático** real del borrador (debounce ~800 ms a IndexedDB) reflejado en el badge "Guardado automático".
6. **Responsive**: < 768px → layout móvil con barra inferior; ≥ 1024px → consola de escritorio. (Ver [Responsive](#8-responsive)).
7. Firma, generación de PDF, envío al cliente, Odoo y Slack: **botones visibles** que disparan un estado/placeholder ("Próximamente" / toast), **sin** integración.

---

## 5. Pantallas / Vistas

Medidas del prototipo: **marco móvil 402×858** (área de contenido ~402 de ancho); **consola de escritorio 1200×760**, sidebar **236px**, panel rápido **340px**.

### 5.1 Móvil — Inicio (`/`)
- **Propósito:** punto de partida del supervisor; crear RS y ver estado general.
- **Layout:** columna. Header blanco fijo (logo TAS 26px alto a la izquierda; a la derecha campana con punto rojo + avatar circular "CH" 34px en rojo). Debajo: saludo "Buenos días," (14px, #8A929C) + "Carlos Hernández" (26px/700, #16181C).
- **Contenido (scroll):**
  - **Botón principal** "Crear nuevo reporte": ancho completo, `#C20E1A`, texto blanco 17px/700, radio 16px, padding 18px, ícono `+`, sombra `0 10px 22px -8px rgba(194,14,26,.6)`. Active `#A40A14`. → navega al formulario.
  - **4 tarjetas de resumen** en grid 2×2 (gap 11px): número grande (30px/700) + etiqueta (12.5px/700, #5B6470). Borde `#ECEDEF`, radio 14px, padding 14px. Valores y colores de número:
    - Borradores — `3` (#5B6470)
    - Pendientes de revisión — `2` (#A66400)
    - Pendientes de firma — `4` (#BE4708)
    - Completados — `12` (#117A3B)
    - **Comportamiento:** tocar una tarjeta aplica el filtro de estado correspondiente a la lista.
  - **Búsqueda**: input con ícono de lupa, placeholder "Buscar por RS, cliente o ubicación". Filtra por número, cliente o ubicación. Borde foco `#C20E1A`.
  - **Chips de filtro** (scroll horizontal): Todos, Borrador, En revisión, Pendiente de firma, Firmado, Rechazado. Activo = relleno `#C20E1A` texto blanco; inactivo = blanco, borde `#E1E3E7`, texto `#5B6470`. Pill (radio 999px).
  - **"Reportes recientes"** (16px/700) + contador "N resultados".
  - **Lista de tarjetas de reporte** (gap 10px). Cada tarjeta: fila superior con `RS-2026-00124` (13px/700, #C20E1A) y **badge de estado** (pill con punto + texto, colores según estado); cliente (15.5px/700); fila meta con ícono pin + ubicación e ícono calendario + fecha (12.5px, #8A929C); tipo de visita (12.5px/700, #5B6470). Tocar → Detalle.

### 5.2 Móvil — Formulario nuevo RS (`/nuevo`)
- **Propósito:** crear un RS en 7 pasos sin formularios largos en una sola pantalla.
- **Header fijo:** botón "‹ Salir" (vuelve a Inicio); badge verde "✓ Guardado automático" (`#E7F6EC`/`#117A3B`); fila con título del paso (18px/700) y "Paso N de 7" (13px, #8A929C); **barra de progreso** de 7 segmentos (alto 5px, radio 3px): segmentos `< pasoActual` en `#C20E1A`, resto `#E5E7EB`.
- **Footer fijo:** botón "Atrás" (outline, ancho 120px) + "Continuar ›" (relleno rojo, flex 1). "Continuar" avanza paso, dispara toast "Borrador guardado" y hace scroll al tope. En paso 7 "Continuar" no aplica (mostrar acciones finales).
- **Transición entre pasos:** fade suave de opacidad (`opacity .4 → 1`, .2s). ⚠️ No uses una animación que arranque en `opacity:0` sin `fill-mode` — el contenido debe quedar siempre en `opacity:1` en reposo.

Campos por paso (todos los textos exactos están en el prototipo; ver `DATA_MODEL.md` para tipos):

- **Paso 1 · Cliente y visita:** Fecha (date, 2026-06-22); Cliente (input con autocompletado, "Empresa ABC Honduras", nota "Autocompletado · 3 coincidencias"); Contacto ("María López"); Correo + Teléfono (grid 2col); Ubicación ("Tegucigalpa, Col. Palmira"); Orden de trabajo opcional ("OT-4587") + Solicitado por ("María López"); **Tipo de visita** como chips seleccionables (Instalación, Soporte, Mantenimiento, Reparación, Capacitación, Estudio técnico, Inspección, Otro — seleccionado "Mantenimiento" en tint rojo); Hora de llegada/salida (time, 09:00 / 12:30).
- **Paso 2 · Trabajo realizado:** textarea grande de descripción; **botón de dictado por voz** (círculo 46px; en reposo tint rojo, al grabar relleno rojo + pulso + 5 barras tipo ecualizador animadas + texto "Grabando… toca para detener") — **solo visual**, alterna un estado `recording`; Observaciones y hallazgos (textarea); Estado actual (select: Operativo / Operativo con observaciones / Fuera de servicio); Recomendaciones (textarea); Acciones pendientes (textarea); **¿Próxima visita requerida?** toggle Sí/No (botones); si "Sí" → Fecha sugerida de seguimiento (date).
- **Paso 3 · Equipos intervenidos:** **lista dinámica** de tarjetas. Cada tarjeta: encabezado "Equipo" + botón eliminar (ícono basura, fondo `#FCEBEC`); campos Nombre, Marca, Modelo, N° de serie, Ubicación, Estado inicial, Estado final, Trabajo realizado (textarea), Recomendación (textarea). Botón "＋ Agregar equipo" (dashed, `#C7CBD1`). Sembrado: Impresora Zebra ZT411.
- **Paso 4 · Materiales y repuestos:** lista dinámica. Por ítem: Producto/descripción, Cantidad, Unidad, N° serie/lote (opcional), y selector segmentado **Instalado / Utilizado / Entregado**. Botón "＋ Agregar material". Sembrado: Rodillo de impresión, Alcohol isopropílico.
- **Paso 5 · Personal participante:** lista dinámica. Por ítem: Nombre, Rol (select: Técnico/Ingeniero/Supervisor/Ayudante), Hora entrada, Hora salida, Horas (grid 3col). Botón "＋ Agregar participante". Sembrado: Carlos Hernández.
- **Paso 6 · Evidencias:** dos botones "📷 Capturar foto" (relleno rojo) y "⬇ Subir foto" (outline); contador "N evidencias · toca una miniatura para reordenar"; grid 2col de miniaturas: placeholder con patrón rayado, badge de categoría **Antes/Durante/Después** (colores #5B6470 / #A66400 / #117A3B), botón eliminar (×), e input de descripción. En la PWA: capturar = `<input type="file" accept="image/*" capture="environment">`; subir = file input normal; guardar blobs en IndexedDB; permitir reordenar (drag o flechas).
- **Paso 7 · Revisión:** banner de **advertencia** (ámbar `#FFF4E5`/borde `#F6D9A8`) listando información faltante; tarjetas-resumen por sección (Cliente y visita, Trabajo realizado) con botón "✎ Editar" que salta al paso correspondiente; fila de 3 contadores (Equipos / Materiales / Fotos); **checkbox** "Confirmo que la información es correcta"; acciones: "Finalizar y generar PDF" (rojo), "Enviar para revisión" y "Guardar borrador" (outline, fila). Cada acción dispara su toast.

### 5.3 Móvil — Pendientes (`/pendientes`)
- Header "Pendientes" + subtítulo. Tres grupos con encabezado en color: **Pendientes de firma** (incluye "Finalizado sin firma"), **En revisión / rechazados**, **Borradores**. Cada grupo lista tarjetas compactas (RS, cliente, tipo·fecha, badge de estado). Tocar → Detalle.

### 5.4 Móvil — Perfil (`/perfil`)
- Cabecera centrada: avatar 78px rojo "CH", nombre, cargo "Supervisor de Servicio Técnico", chip "TAS Honduras · Tegucigalpa".
- Fila de 3 métricas (Este mes 28 / Pendientes 4 / Total 214).
- Lista de datos (Correo, Teléfono, Zona asignada) con íconos.
- Lista de ajustes (Sincronización y datos offline, Notificaciones, Cerrar sesión en rojo).

### 5.5 Móvil — Detalle del reporte (`/rs/:id`)
- Header fijo: "‹" volver, "Reporte de servicio", ícono compartir.
- **Número grande** `RS-2026-00124` (26px/800) + **badge de estado** grande; cliente debajo.
- **Grid 2×2** de datos (Fecha, Tipo de visita, Supervisor, Ubicación) en tarjeta con separadores `#ECEDEF`.
- **Línea de tiempo**: pasos con punto verde (completados) y punto naranja **pulsante** (estado actual): Creado → Enviado para revisión → Aprobado por supervisor → Pendiente de firma del cliente.
- **Secciones plegables** (Cliente y visita, Trabajo realizado, Equipos, Materiales, Personal, Galería de fotografías) con caret que alterna. La galería muestra grid 3col de miniaturas con badge de categoría.
- **Vista previa del PDF**: "página" blanca con barra superior (logo + "REPORTE DE SERVICIO"), título RS·cliente, líneas grises simuladas y botón "Ver PDF completo".
- **Acciones:** Descargar (negro) + Compartir (outline) en fila; Enviar al cliente (outline, ancho completo); **Solicitar firma** (rojo, ancho completo); "Crear corrección" (texto rojo). Los botones de **firma** se muestran pero abren un modal placeholder "La firma electrónica estará disponible próximamente."

### 5.6 Móvil — Barra inferior (persistente)
- 4 destinos: **Reportes** (home), **Pendientes** (clock), **Nuevo RS** (botón central elevado: círculo rojo 56px con `+`, sombra), **Perfil** (user). Ícono+label 10.5px/700. Activo = `#C20E1A`, inactivo = `#9AA2AD`. Alto seguro con padding inferior (safe-area).

### 5.7 Escritorio — Consola (`≥1024px`)
- **Sidebar 236px** (`#FAFBFC`, borde derecho): logo arriba; botón "＋ Crear nuevo reporte" (rojo); nav vertical (Reportes, Pendientes, Métricas, Nuevo RS, Perfil) con ítem activo en tint rojo; al fondo avatar + nombre + "Supervisor".
- **Main:** topbar 64px (título de sección + búsqueda 280px + campana). Contenido según nav:
  - **Tabla (Reportes/Pendientes/Métricas):** fila de **4 métricas** (Total 214 / Pendientes de firma 4 / En revisión 2 / Tiempo promedio 1.8 d) con subtítulo; barra de **chips de filtro** + botones "Columnas" y "Exportar"; **tabla** con columnas N° RS, Cliente, Ubicación, Tipo, Fecha, Estado. Fila seleccionada en `#FDF2F2`. Clic en fila → abre panel rápido.
  - **Nuevo RS:** mismo formulario pero en **dos columnas** (sección 1 y 2 lado a lado; equipos como tabla a ancho completo) con acciones al pie alineadas a la derecha.
  - **Perfil:** tarjeta horizontal con avatar y datos.
- **Panel rápido (340px, derecha):** se abre al seleccionar una fila. Encabezado "VISTA RÁPIDA" + cerrar (×); número grande del RS; badge de estado; tarjeta con Cliente, Ubicación, Tipo/Fecha, Supervisor, Equipo; acciones: "Solicitar firma" (rojo), "PDF" + "Compartir" (outline).

---

## 6. Estados del reporte

Máquina de estados (un RS tiene exactamente uno):

`Borrador → En revisión → (Finalizado sin firma | Pendiente de firma) → Firmado`
y `En revisión → Rechazado` (vuelve a edición / corrección).

Transiciones disparadas desde la UI:
- **Guardar borrador** → `Borrador`.
- **Enviar para revisión** → `En revisión`.
- **Finalizar y generar PDF** → `Finalizado sin firma`.
- **Solicitar firma** → `Pendiente de firma` (placeholder, sin proveedor real).
- **(supervisor) aprobar/rechazar** → `Pendiente de firma` / `Rechazado`.
- **Crear corrección** → genera `RS-...-R1` en `Borrador`.

Colores de cada estado: ver [Design Tokens](#9-design-tokens).

---

## 7. Interacciones y comportamiento

- **Navegación móvil:** barra inferior + flujos Inicio→Detalle, Inicio/Pendientes→Detalle, botón central→Formulario.
- **Filtros/búsqueda:** combinables (estado AND texto). El texto matchea `id + cliente + ubicación` en minúsculas.
- **Formulario:** estado por paso; "Continuar"/"Atrás" con clamp 1–7; saltos directos desde Revisión; **autosave** con debounce; al avanzar, scroll al tope del contenedor.
- **Listas dinámicas:** agregar inserta un ítem en blanco; eliminar filtra por índice. Mantener foco/scroll razonable.
- **Dictado por voz:** alterna `recording`; animación de pulso + ecualizador (CSS keyframes infinitos, no afectan opacidad de contenido). Sin reconocimiento real en esta fase.
- **Toasts:** mensaje breve centrado abajo (sobre la barra), auto-oculta ~2.2s. Reemplaza al anterior.
- **Modal de firma:** overlay + hoja inferior (móvil) / diálogo centrado (escritorio); cierra al tocar fondo o "Entendido".
- **Secciones plegables (detalle):** estado por sección; caret arriba/abajo.
- **Animaciones:** entradas con fade de opacidad (.2s, reposo en opacidad 1); pulso del punto de timeline y del botón de grabación (loop infinito, solo `box-shadow`/escala, nunca opacidad de contenido). Respeta `prefers-reduced-motion`.
- **Accesibilidad / campo:** alto contraste para luz exterior, hit targets ≥44px, labels asociados a inputs, foco visible (`box-shadow 0 0 0 3px rgba(194,14,26,.12)`).

---

## 8. Responsive

- **< 768px:** layout móvil (una columna, barra inferior, formulario multipaso). Es la experiencia prioritaria.
- **768–1023px:** móvil ensanchado (opcional: formulario a 2 columnas).
- **≥ 1024px:** consola de escritorio (sidebar + tabla + panel rápido + formulario 2 columnas).
- El conmutador "Móvil/Escritorio" del prototipo es solo para demostración; en la PWA real es por breakpoint.

---

## 9. Design Tokens

### Color
| Token | Hex | Uso |
|---|---|---|
| `red/600` | `#C20E1A` | Primario (marca TAS), botones, activos |
| `red/700` | `#A40A14` | Hover/active del primario |
| `red/tint` | `#FDEDED` | Fondos de selección/tint |
| `red/row` | `#FDF2F2` | Fila seleccionada en tabla |
| `ink` | `#16181C` | Texto principal |
| `gray/600` | `#5B6470` | Texto secundario / labels |
| `gray/500` | `#8A929C` | Texto muted / meta |
| `gray/400` | `#9AA2AD` | Placeholder / íconos inactivos |
| `gray/300` | `#B4BAC2` | Íconos de placeholder de imagen |
| `border` | `#ECEDEF` | Borde de tarjetas |
| `border/input` | `#E1E3E7` | Borde de inputs |
| `border/strong` | `#D7D9DD` | Borde de botones outline |
| `divider` | `#F1F2F4` | Separadores internos |
| `dashed` | `#C7CBD1` | Borde punteado (agregar) |
| `surface` | `#FFFFFF` | Tarjetas / superficies |
| `bg/app` | `#F4F5F7` | Fondo de la app |
| `bg/page` | `#EBECEF` | Fondo de página (chrome del prototipo) |
| `bg/elev` | `#FAFBFC` | Sidebar / header / encabezados de tabla |

### Estados (badge: fondo / texto / punto)
| Estado | bg | fg | dot |
|---|---|---|---|
| Borrador | `#F1F2F4` | `#5B6470` | `#9AA2AD` |
| En revisión | `#FFF4E5` | `#A66400` | `#F59E0B` |
| Finalizado sin firma | `#EEF2F7` | `#475569` | `#64748B` |
| Pendiente de firma | `#FDEDE3` | `#BE4708` | `#EA580C` |
| Firmado | `#E7F6EC` | `#117A3B` | `#16A34A` |
| Rechazado | `#FCEBEC` | `#B4232C` | `#DC2626` |

### Tipografía
- **Familia:** `'Helvetica Neue', Helvetica, Arial, sans-serif`. (Si quieren un equivalente libre con métricas similares para web, **Helvetica Now**/**Arimo** o simplemente Arial como fallback ya cubierto.)
- **Escala usada:** 26px/800 (número RS), 26px/700 (nombre saludo), 30px/700 y 28px/700 (números de tarjetas/métricas), 18px/700 (títulos de paso/sección), 16px/700 (títulos), 15–15.5px (cuerpo/inputs), 14px (botones/cuerpo), 13–13.5px (meta/secundario), 12–12.5px/700 (labels), 11–11.5px (micro/encabezados de tabla en mayúsculas, `letter-spacing .04em`).
- Pesos: 500 (muted), 600 (secundario/meta), 700 (labels/títulos/botones), 800 (números grandes). `letter-spacing` negativo ligero (−.01 a −.03em) en titulares.

### Radios
- Botones 11–16px · Inputs 10–11px · Tarjetas 13–14px · Marco móvil 42px · Consola 16px · Pills 999px.

### Sombra
- Botón primario: `0 10px 22px -8px rgba(194,14,26,.6)`.
- Botón central nav: `0 8px 18px -6px rgba(194,14,26,.7)`.
- Tarjeta PDF: `0 8px 20px -12px rgba(20,22,28,.25)`.
- Toast: `0 10px 24px -8px rgba(0,0,0,.5)`.
- Consola/marco: `0 24px 60px -24px rgba(20,22,28,.3)`.

### Espaciado
- Padding de pantalla 18–22px. Gap entre tarjetas 10–14px. Padding de inputs 11–13px. Padding de botones 12–18px.

---

## 10. Assets

- `design/assets/tas-mark.png` — **logo TAS recortado** (marca "TAS" con esfera de circuito + letras metálicas), úsalo en headers/sidebar/topbar. Fondo blanco (colócalo sobre superficies claras).
- `design/assets/tas-logo.png` — logo completo original con lema "Tecnología, Acceso & Seguridad · Miembro del Grupo TAS Corp." (úsalo en el PDF / splash si se requiere el lockup completo).
- **Íconos:** recrear con **lucide-react** (lista de equivalencias en §4). En el prototipo son SVG de línea inline.
- **Fotos de evidencia / PDF:** en el prototipo son **placeholders rayados**; en la PWA serán imágenes reales del usuario (cámara/galería) guardadas en IndexedDB.

---

## 11. Documentos complementarios en este paquete

- **`DATA_MODEL.md`** — entidades, campos, tipos, catálogos y los 8 reportes de ejemplo para sembrar.
- **`API_CONTRACT.md`** — interfaz de la capa de datos (`ReportRepository`) y el contrato REST objetivo para cuando se conecte el backend (incluye notas de Odoo/Slack/firma/PDF, **fuera de alcance de esta fase**).
- **`PWA_NOTES.md`** — manifest, service worker, estrategia offline/sync y estructura de carpetas sugerida.

## 12. Archivos de diseño de referencia

- `design/RS TAS.dc.html` — prototipo completo (móvil + escritorio).
- `design/support.js` — runtime del prototipo (solo para correrlo; **no portar**).
- `design/assets/*` — logos.
