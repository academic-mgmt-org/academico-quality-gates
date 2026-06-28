# academico-quality-gates

Web de monitoreo para los quality gates de los servicios core assets del Sistema de Gestion Academica.

El repositorio incluye una consola web, Prometheus, Blackbox Exporter y Grafana provisionado con datasource y dashboard inicial.

## Servicios monitoreados

| Servicio | Puerto local | Health |
| --- | ---: | --- |
| academico-gateway | 3000 | `/api/health` |
| academico-login | 3001 | `/api/health` |
| academico-calificaciones | 3002 | `/api/health` |
| academico-notificaciones | 3003 | `/api/health` |
| academico-matriculas | 3004 | `/api/health` |
| academico-solicitudes | 3005 | `/api/health` |
| academico-usuarios | 3006 | `/api/health` |

## Ejecucion local

Levantar primero los servicios core en sus puertos locales y despues iniciar el stack de observabilidad:

```bash
docker compose up --build
```

URLs:

- Web: http://localhost:8080
- Grafana: http://localhost:3007
- Prometheus: http://localhost:9090
- Blackbox Exporter: http://localhost:9115

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

## Quality gates

Los gates iniciales estan definidos en `monitoring/prometheus/rules/quality-gates.yml`:

- `health`: el endpoint `/api/health` responde HTTP 2xx.
- `readiness`: el endpoint `/api/ready` responde HTTP 2xx.
- `latency`: el probe de health responde en menos de 750 ms.
- `metrics`: el servicio expone `/metrics` y Prometheus lo puede scrapear.

Los servicios actuales ya exponen health/readiness/liveness. El gate `metrics` quedara fallando hasta instrumentar cada microservicio con un endpoint Prometheus `/metrics`.

## Configuracion de targets

Prometheus usa `host.docker.internal` para probar servicios ejecutados en la maquina host. Si los servicios core se ejecutan en otra red o en Kubernetes, ajustar los targets en:

- `monitoring/prometheus/prometheus.yml`
- `monitoring/prometheus/rules/quality-gates.yml`

La documentacion del contrato de gates esta en `docs/quality-gates.md`.

