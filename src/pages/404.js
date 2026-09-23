import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Match /market/<addr>, /markets/<addr>, /market/<addr>/, optional trailing slash
// and preserve any query string / hash.
const MARKET_PATH = /^\/markets?\/(0x[0-9a-fA-F]{40})\/?$/;

export default function Custom404() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(MARKET_PATH);
    if (!m) return;

    const address = m[1];
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const sep = search ? '&' : '?';
    setRedirecting(true);
    window.location.replace(`/market${search}${sep}proposalId=${address}${hash}`);
  }, []);

  return (
    <>
      <Head>
        <title>{redirecting ? 'Loading market…' : 'Page not found'} — Futarchy</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-gray-800 px-6">
        {redirecting ? (
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-futarchyLavender" />
        ) : (
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-bold mb-3">Page not found</h1>
            <p className="text-gray-600 mb-6">
              We couldn&apos;t find what you were looking for.
            </p>
            <Link href="/" className="text-futarchyBlue9 underline">Back to home</Link>
          </div>
        )}
      </div>
    </>
  );
}
