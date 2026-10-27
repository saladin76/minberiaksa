import { NextResponse } from 'next/server';
import { resolveFacebookVideoUrl } from '@/lib/content/resolve-facebook-video';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 });

  const resolved = await resolveFacebookVideoUrl(url);
  if (!resolved) return NextResponse.json({ error: 'Unsupported video URL' }, { status: 400 });
  return NextResponse.json({ resolved }, { headers: { 'Cache-Control': 'public, max-age=600' } });
}
