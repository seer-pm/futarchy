import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { buttonClassName } from '../components/ui/Button';

// Match /market/<addr>, /markets/<addr>, /market/<addr>/, optional trailing slash
// and preserve any query string / hash.
const MARKET_PATH = /^\/markets?\/(0x[0-9a-fA-F]{40})\/?$/;

// Retired routes that should land on the company list. netlify.toml 301s
// these on the deployed site; this covers any other static host.
const LEGACY_COMPANY_LIST_PATH = /^\/gnosis\/milestones(\/.*)?$/;

export default function Custom404() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (LEGACY_COMPANY_LIST_PATH.test(window.location.pathname)) {
      setRedirecting(true);
      window.location.replace('/companies');
      return;
    }
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
      <Header />
      <main className="flex flex-col items-center justify-center min-h-screen pt-20 px-5 bg-seer-page text-seer-text">
        {redirecting ? (
          <div
            className="animate-spin rounded-full h-10 w-10 border-2 border-seer-border border-t-seer-purple"
            role="status"
            aria-label="Loading market"
          />
        ) : (
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-semibold tracking-tight mb-3">Page not found</h1>
            <p className="text-seer-muted mb-6">
              We couldn&apos;t find what you were looking for.
            </p>
            <Link href="/" className={buttonClassName({ variant: 'secondary' })}>Back to home</Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
