# Quality gates core assets

Este repositorio centraliza los checks operativos minimos de los servicios core assets.

## Contrato inicial

| Gate | PromQL | Criterio |
| --- | --- | --- |
| Health | `academico_core_probe_success{gate="health", service="<service>"}` | Debe ser `1` durante la ventana evaluada. |
| Readiness | `academico_core_probe_success{gate="readiness", service="<service>"}` | Debe ser `1` durante la ventana evaluada. |
| Latency | `academico_core_probe_duration_seconds{gate="health", service="<service>"}` | Debe ser menor o igual a `0.75` y health debe pasar. |
| Metrics | `academico_core_probe_success{gate="metrics", service="<service>"}` | Debe ser `1` cuando el servicio exponga `/metrics`. |

## Reglas de Prometheus

Las reglas versionadas crean series agregadas por servicio:

- `academico_quality_gate_health_pass`
- `academico_quality_gate_readiness_pass`
- `academico_quality_gate_latency_pass`
- `academico_quality_gate_metrics_pass`
- `academico_quality_gate_score`

`academico_quality_gate_score` calcula un promedio simple de los cuatro gates. Un servicio queda aprobado cuando el score es `1`.

## Instrumentacion pendiente en servicios

Los servicios core actuales exponen `/api/health`, `/api/ready` y `/api/live` sobre HTTP/2 cleartext. El exporter incluido prueba HTTP/1.1 y hace fallback a HTTP/2 h2c para cubrir esa configuracion. Para cerrar el gate de metricas, cada servicio deberia exponer `/metrics` en formato Prometheus con al menos:

- latencia HTTP por ruta y status.
- total de requests por ruta y status.
- errores de dependencias externas.
- uso de pool de base de datos cuando aplique.
- version y commit desplegado como labels de build.

## Ajuste de thresholds

El threshold inicial de latencia es `750 ms` para permitir ambientes de desarrollo y despliegues pequenos. En produccion se recomienda definir SLOs por servicio y separar:

- `p95` para rutas criticas.
- disponibilidad por ventanas de 5 minutos y 30 minutos.
- errores 5xx por servicio.
- saturacion de base de datos, Redis y colas.
