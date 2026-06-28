const http = require('node:http');
const http2 = require('node:http2');

const PORT = Number(process.env.EXPORTER_PORT || 9200);
const TARGET_HOST = process.env.ACADEMICO_TARGET_HOST || 'host.docker.internal';
const GATEWAY_PORT = Number(process.env.ACADEMICO_GATEWAY_PORT || process.env.ACADEMICO_LOGIN_PORT || 3000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 2500);
const LATENCY_THRESHOLD_SECONDS = Number(process.env.LATENCY_THRESHOLD_SECONDS || 0.75);

const services = [
  {
    id: 'academico-login',
    name: 'Academico Login',
    tier: 'auth',
    port: GATEWAY_PORT,
    gateway: 'academico-gateway',
    routePrefix: '/login',
    repository: 'academic-mgmt-org/academico-login',
  },
];

const gates = [
  {
    id: 'health',
    method: 'GET',
    path: '/login/api/health',
    expectedStatuses: null,
  },
  {
    id: 'readiness',
    method: 'GET',
    path: '/login/api/ready',
    expectedStatuses: null,
  },
  {
    id: 'liveness',
    method: 'GET',
    path: '/login/api/live',
    expectedStatuses: null,
  },
  {
    id: 'auth_guard',
    method: 'GET',
    path: '/login/api/v1/whitelist/all',
    expectedStatuses: null,
  },
  {
    id: 'metrics',
    method: 'GET',
    path: '/login/metrics',
    expectedStatuses: null,
  },
];

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',');
}

function expectedStatusLabel(gate) {
  return gate.expectedStatuses ? gate.expectedStatuses.join('|') : '2xx';
}

function isSuccess(statusCode, gate) {
  if (gate.expectedStatuses) {
    return gate.expectedStatuses.includes(statusCode);
  }

  return statusCode >= 200 && statusCode < 300;
}

function probeHttp1(target, gate) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: gate.method,
        timeout: TIMEOUT_MS,
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            protocol: 'http1',
          });
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

function probeHttp2(target, gate) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = http2.connect(`${target.protocol}//${target.host}`);

    function finish(error, result) {
      if (settled) {
        return;
      }
      settled = true;
      client.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    }

    client.setTimeout(TIMEOUT_MS, () => {
      finish(new Error('timeout'));
    });
    client.on('error', (error) => {
      finish(error);
    });

    const request = client.request({
      ':method': gate.method,
      ':path': `${target.pathname}${target.search}`,
    });
    let statusCode = 0;

    request.setEncoding('utf8');
    request.on('response', (headers) => {
      statusCode = Number(headers[':status'] || 0);
    });
    request.on('data', () => undefined);
    request.on('end', () => {
      finish(null, {
        statusCode,
        protocol: 'h2c',
      });
    });
    request.on('error', (error) => {
      finish(error);
    });
    request.end();
  });
}

async function probeEndpoint(service, gate) {
  const target = new URL(`http://${TARGET_HOST}:${service.port}${gate.path}`);
  const start = process.hrtime.bigint();
  let result = null;

  try {
    result = await probeHttp1(target, gate);
  } catch (_) {
    try {
      result = await probeHttp2(target, gate);
    } catch (error) {
      result = {
        statusCode: 0,
        protocol: 'none',
        error: error instanceof Error ? error.message : 'probe failed',
      };
    }
  }

  const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;

  return {
    service,
    gate,
    durationSeconds,
    statusCode: result.statusCode,
    protocol: result.protocol,
    success: isSuccess(result.statusCode, gate),
  };
}

async function collect() {
  const checks = [];

  for (const service of services) {
    for (const gate of gates) {
      checks.push(probeEndpoint(service, gate));
    }
  }

  return Promise.all(checks);
}

function renderMetrics(results) {
  const lines = [
    '# HELP academico_quality_exporter_scrape_timestamp_seconds Unix timestamp of the exporter scrape.',
    '# TYPE academico_quality_exporter_scrape_timestamp_seconds gauge',
    `academico_quality_exporter_scrape_timestamp_seconds ${Date.now() / 1000}`,
    '# HELP academico_quality_latency_threshold_seconds Configured health latency threshold.',
    '# TYPE academico_quality_latency_threshold_seconds gauge',
    `academico_quality_latency_threshold_seconds ${LATENCY_THRESHOLD_SECONDS}`,
    '# HELP academico_core_service_info Static metadata for core assets services.',
    '# TYPE academico_core_service_info gauge',
  ];

  for (const service of services) {
    lines.push(
      `academico_core_service_info{${labels({
        service: service.id,
        name: service.name,
        tier: service.tier,
        repository: service.repository,
        port: service.port,
        via: service.gateway,
        route_prefix: service.routePrefix,
      })}} 1`,
    );
  }

  lines.push(
    '# HELP academico_core_probe_success Whether a service endpoint probe met its expected HTTP status.',
    '# TYPE academico_core_probe_success gauge',
    '# HELP academico_core_probe_duration_seconds Service endpoint probe duration.',
    '# TYPE academico_core_probe_duration_seconds gauge',
    '# HELP academico_core_probe_http_status Last HTTP status returned by a service endpoint probe.',
    '# TYPE academico_core_probe_http_status gauge',
  );

  for (const result of results) {
    const baseLabels = labels({
      service: result.service.id,
      tier: result.service.tier,
      via: result.service.gateway,
      gate: result.gate.id,
      method: result.gate.method,
      path: result.gate.path,
      expected_status: expectedStatusLabel(result.gate),
      protocol: result.protocol,
    });
    lines.push(`academico_core_probe_success{${baseLabels}} ${result.success ? 1 : 0}`);
    lines.push(`academico_core_probe_duration_seconds{${baseLabels}} ${result.durationSeconds.toFixed(6)}`);
    lines.push(`academico_core_probe_http_status{${baseLabels}} ${result.statusCode}`);
  }

  return `${lines.join('\n')}\n`;
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (request.url !== '/metrics') {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found\n');
    return;
  }

  try {
    const results = await collect();
    response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
    response.end(renderMetrics(results));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end(error instanceof Error ? error.message : 'exporter failed');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`academico quality exporter listening on ${PORT}`);
});
