/**
 * Dynamically resolves WebSocket URL for voice gateway
 * Handles localhost, remote IP/domains, HTTPS (wss:), and port translations
 */
export function getWsUrl(): string {
  const envWs = (process.env.NEXT_PUBLIC_WS_URL || '').trim();
  if (envWs) {
    if (typeof window !== 'undefined') {
      const isClientLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isClientLocal && (envWs.includes('localhost') || envWs.includes('127.0.0.1'))) {
        try {
          const parsed = new URL(envWs);
          parsed.hostname = window.location.hostname;
          if (window.location.protocol === 'https:') {
            parsed.protocol = 'wss:';
          }
          return parsed.toString();
        } catch {}
      }
    }
    return envWs;
  }

  const envApi = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (envApi) {
    let wsFromApi = envApi.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/+$/, '');
    if (!wsFromApi.endsWith('/voice')) {
      wsFromApi = `${wsFromApi}/voice`;
    }
    if (typeof window !== 'undefined') {
      const isClientLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isClientLocal && (wsFromApi.includes('localhost') || wsFromApi.includes('127.0.0.1'))) {
        try {
          const parsed = new URL(wsFromApi);
          parsed.hostname = window.location.hostname;
          if (window.location.protocol === 'https:') {
            parsed.protocol = 'wss:';
          }
          return parsed.toString();
        } catch {}
      }
    }
    return wsFromApi;
  }

  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    let port = window.location.port;
    if (port === '3001' || port === '3002') {
      port = '3000';
    }
    const portPart = port ? `:${port}` : '';
    return `${proto}//${host}${portPart}/api/v1/voice`;
  }

  return 'ws://localhost:3000/api/v1/voice';
}
