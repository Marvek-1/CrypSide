import { proxyPython } from '../_proxy';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxyPython('/api/v1/paper-orders', 'GET', searchParams);
}
