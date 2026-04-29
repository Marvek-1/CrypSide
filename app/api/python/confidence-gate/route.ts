import { proxyPython } from '../_proxy';

export async function GET() {
  return proxyPython('/api/v1/confidence-gate', 'GET');
}
