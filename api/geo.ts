interface GeoRequest {
  readonly headers: Record<string, string | string[] | undefined>;
}

interface GeoResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: { country: string | null }): void };
}

export default function handler(request: GeoRequest, response: GeoResponse): void {
  const raw = request.headers['x-vercel-ip-country'];
  const country = typeof raw === 'string' && /^[A-Z]{2}$/.test(raw) ? raw : null;
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({ country });
}
