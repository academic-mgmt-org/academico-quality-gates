# academico-quality-gates

Dashboard de quality gates para `academico-login` medido a traves de `academico-gateway`.

El repositorio incluye una consola web, un exporter de probes HTTP/1.1 + HTTP/2 h2c, Prometheus y Grafana provisionado con un tablero de login via gateway.

## Servicio monitoreado

| Servicio | Entrada medida | Rol |
| --- | ---: | --- |
| academico-login | academico-gateway `:3000/login/*` | Autenticacion, JWT, refresh, logout y validacion de tokens |

## Gates

| Gate | Criterio | Tipo |
| --- | --- | --- |
| Health | `GET /login/api/health` responde HTTP 2xx a traves del gateway | Requerido |
| Readiness | `GET /login/api/ready` responde HTTP 2xx a traves del gateway | Requerido |
| Liveness | `GET /login/api/live` responde HTTP 2xx a traves del gateway | Requerido |
| Latency | El probe de health via gateway dura `<= 750 ms` | Requerido |
| Gateway API key | `GET /login/api/v1/whitelist/all` responde HTTP 2xx porque el gateway inyecta `x-api-key` interna | Requerido |
| Metrics | `GET /login/metrics` responde HTTP 2xx a traves del gateway | No bloqueante |

El gate `metrics` queda como no bloqueante porque la implementacion actual de `academico-login` no expone `/login/metrics` como endpoint Prometheus accesible via gateway.

## Ejecucion local

Levantar primero `academico-gateway` en el puerto `3000` con acceso funcional a `academico-login` y despues iniciar el stack de observabilidad:

```bash
docker compose up --build
```

Para medir un gateway remoto:

```bash
ACADEMICO_TARGET_HOST=20.115.132.131 docker compose up --build
```

URLs del stack:

- Web: `http://localhost:8080`
- Grafana: `http://localhost:3007`
- Prometheus: `http://localhost:9090`
- Quality Exporter: `http://localhost:9200/metrics`

Credenciales locales de Grafana:

- Usuario: `admin`
- Password: `admin`

## Desarrollo de la web

```bash
cp .env.example .env
npm install
npm run dev
```

Con Prometheus levantado en `localhost:9090`, Vite redirige `/api/prometheus` hacia `http://localhost:9090/api/v1`.

## Configuracion

El exporter usa `host.docker.internal` para probar `academico-gateway` ejecutado en la maquina host. El gateway se encarga de reenviar las rutas `/login/*` hacia `academico-login`.

Variables principales:

- `ACADEMICO_TARGET_HOST`: host donde escucha gateway desde el contenedor del exporter.
- `ACADEMICO_GATEWAY_PORT`: puerto del gateway, por defecto `3000`.
- `LATENCY_THRESHOLD_SECONDS`: umbral de latencia del health probe, por defecto `0.75`.
- `PROBE_TIMEOUT_MS`: timeout por probe, por defecto `2500`.

Archivos relevantes:

- `src/quality-gates.ts`: contrato usado por la consola web.
- `exporter/server.js`: probes HTTP/1.1 y HTTP/2 h2c.
- `monitoring/prometheus/rules/quality-gates.yml`: reglas grabadas y alertas.
- `monitoring/grafana/dashboards/quality-gates.json`: dashboard Grafana provisionado.
