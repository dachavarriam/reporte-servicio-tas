"""Cierra con clave los 3 webhooks de n8n que usa la app RS (rs-pdf, nuevo-usuario-rs, revision-sac-rs).

Orden al publicar (para no cortar envíos):
  1. python3 scripts/cerrar_webhooks_n8n.py --clave      → crea .n8n_webhook_secret (600) si no existe
  2. wrangler secret put N8N_WEBHOOK_SECRET < .n8n_webhook_secret ; pnpm run deploy   (la app ya manda la clave)
  3. python3 scripts/cerrar_webhooks_n8n.py --cerrar     → n8n exige el encabezado x-rs-webhook-secret
Para volver atrás: python3 scripts/cerrar_webhooks_n8n.py --abrir   (los webhooks vuelven a no pedir clave)

Lee N8N_API_KEY de ../Seguimiento Importaciones/.env. Nunca imprime la clave. Respaldo de cada flujo en
scripts/respaldos/ antes de tocarlo.
"""
from __future__ import annotations

import json
import os
import pathlib
import secrets
import sys
import urllib.error
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent
CLAVE = RAIZ / ".n8n_webhook_secret"
ENV = RAIZ.parent / "Seguimiento Importaciones" / ".env"
N8N = "https://n8n.wembla.com/api/v1"
FLUJOS = {"RXeotk8zoWyx8oF3": "rs-pdf", "zioQvdn8UYvJpCAg": "nuevo-usuario-rs", "3oyqi6Obo2PcVDng": "revision-sac-rs"}
CRED = "RS webhooks (x-rs-webhook-secret)"


def api_key() -> str:
    for line in ENV.read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip() == "N8N_API_KEY":
            return v.strip().strip('"').strip("'")
    raise SystemExit("Falta N8N_API_KEY")


def n8n(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(N8N + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"X-N8N-API-KEY": api_key(), "User-Agent": "tas-rs", "Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=60).read() or b"{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read()[:300]!r}")


def clave() -> str:
    if not CLAVE.exists():
        fd = os.open(CLAVE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_urlsafe(32))
        print(f"clave creada en {CLAVE.name} (600)")
    return CLAVE.read_text().strip()


def credencial() -> dict:
    return n8n("POST", "/credentials", {"name": CRED, "type": "httpHeaderAuth", "data": {"name": "x-rs-webhook-secret", "value": clave()}})


def cambiar(cerrar: bool) -> None:
    cred = credencial() if cerrar else None
    (AQUI / "respaldos").mkdir(exist_ok=True)
    for wid, ruta in FLUJOS.items():
        w = n8n("GET", f"/workflows/{wid}")
        (AQUI / "respaldos" / f"{ruta}.json").write_text(json.dumps(w, indent=1, ensure_ascii=False))
        for n in w["nodes"]:
            if n["type"].endswith(".webhook") and n["parameters"].get("path") == ruta:
                if cerrar:
                    n["parameters"]["authentication"] = "headerAuth"
                    n["credentials"] = {"httpHeaderAuth": {"id": cred["id"], "name": cred["name"]}}
                else:
                    n["parameters"].pop("authentication", None)
                    n.pop("credentials", None)
        st = {k: v for k, v in w["settings"].items() if k in ("executionOrder", "errorWorkflow", "callerPolicy", "saveDataErrorExecution",
                                                               "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "timezone")}
        r = n8n("PUT", f"/workflows/{wid}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": st})
        print(ruta, "con clave" if cerrar else "sin clave", "activo" if r.get("active") else "INACTIVO")


if __name__ == "__main__":
    op = sys.argv[1] if len(sys.argv) > 1 else ""
    if op == "--clave":
        clave()
    elif op in ("--cerrar", "--abrir"):
        cambiar(op == "--cerrar")
    else:
        print(__doc__)
