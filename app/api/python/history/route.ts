import { proxyPython } from '../_proxy';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.has('all_history')) {
    searchParams.set('all_history', 'true');
  }
  return proxyPython('/signals', 'GET', searchParams);
}
