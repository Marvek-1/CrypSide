const PYTHON_API_BASE = process.env.PYTHON_API_BASE_URL || 'http://127.0.0.1:8787';
const REQUEST_TIMEOUT_MS = 5000;

type ProxyMethod = 'GET' | 'POST';

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function proxyPython(
  upstreamPath: string,
  method: ProxyMethod,
  searchParams?: URLSearchParams,
): Promise<Response> {
  const url = new URL(upstreamPath, `${PYTHON_API_BASE}/`);
  if (searchParams) {
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });

    const text = await upstream.text();
    let payload: Record<string, unknown>;
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      payload = { raw: text };
    }

    return Response.json(
      {
        ...payload,
        data_source: upstream.ok ? 'live' : 'error',
        upstream_status: upstream.status,
      },
      { status: upstream.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        status: 'degraded',
        data_source: 'error',
        error: 'python_api_unreachable',
        detail: message,
      },
      { status: 503 },
    );
  }
}
