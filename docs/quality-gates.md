# Quality gates de academico-login via academico-gateway

Este repositorio centraliza los checks operativos minimos del core asset `academico-login` medidos por la entrada publica de `academico-gateway`.

## Contrato inicial

| Gate | Probe | PromQL base | Criterio |
| --- | --- | --- | --- |
| Health | `GET /login/api/health` | `academico_core_probe_success{gate="health", service="academico-login"}` | Debe ser `1`. |
| Readiness | `GET /login/api/ready` | `academico_core_probe_success{gate="readiness", service="academico-login"}` | Debe ser `1`. |
| Liveness | `GET /login/api/live` | `academico_core_probe_success{gate="liveness", service="academico-login"}` | Debe ser `1`. |
| Latency | `GET /login/api/health` | `academico_core_probe_duration_seconds{gate="health", service="academico-login"}` | Debe ser menor o igual a `0.75`. |
| Gateway API key | `GET /login/api/v1/whitelist/all` | `academico_core_probe_success{gate="auth_guard", service="academico-login"}` | Debe ser `1`; valida que gateway reenvia hacia login con `x-api-key` interna. |
| Metrics | `GET /login/metrics` | `academico_core_probe_success{gate="metrics", service="academico-login"}` | No bloqueante hasta instrumentar el servicio. |

## Reglas de Prometheus

Las reglas versionadas crean series agregadas por servicio:

- `academico_quality_gate_health_pass`
- `academico_quality_gate_readiness_pass`
- `academico_quality_gate_liveness_pass`
- `academico_quality_gate_latency_pass`
- `academico_quality_gate_auth_guard_pass`
- `academico_quality_gate_metrics_pass`
- `academico_quality_gate_required_score`
- `academico_quality_gate_required_pass`
- `academico_quality_gate_score`

`academico_quality_gate_required_score` promedia los gates requeridos: health, readiness, liveness, latency y Gateway API key.

`academico_quality_gate_required_pass` vale `1` solo cuando todos los gates requeridos pasan.

`academico_quality_gate_score` promedia los seis gates, incluyendo `metrics`. Por eso puede ser menor que `1` aunque `academico_quality_gate_required_pass` este en `1`.

## Implementacion observada en login

La implementacion revisada en `/home/azureuser/academico-login` expone internamente:

- `GET /api/health`
- `GET /api/ready`
- `GET /api/live`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/validate-token`
- `POST /api/v1/auth/validate-token-2`
- `GET /api/v1/whitelist/all`

`academico-gateway` publica estas rutas bajo el prefijo `/login` y reescribe la URL antes de reenviar al login. Por ejemplo, `/login/api/v1/auth/login` termina en `academico-login /api/v1/auth/login`.

El middleware de API key de login excluye solo health, readiness y liveness. Como los gates ahora se miden via gateway, el gate `auth_guard` valida que `/login/api/v1/whitelist/all` responda 2xx usando la API key interna que inyecta `academico-gateway`.

Gateway y login estan levantados con Fastify HTTP/2 cleartext. El exporter prueba primero HTTP/1.1 y despues HTTP/2 h2c para cubrir ese modo de ejecucion.

## Instrumentacion pendiente

El endpoint `/login/metrics` aun no esta disponible como endpoint Prometheus scrapeable via gateway. Para cerrar el gate no bloqueante se recomienda exponer metricas Prometheus con al menos:

- latencia HTTP por ruta y status.
- total de requests por ruta y status.
- errores de base de datos.
- errores de validacion JWT y sesiones revocadas.
- version y commit desplegado como labels de build.
