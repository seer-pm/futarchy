import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

// There is no market index: every market lives at /markets/<address>.
// Send bare /markets visits to the company list (netlify.toml also 301s it).
export default function MarketsIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/companies');
  }, [router]);

  return (
    <>
      <Head>
        <title>Markets | Futarchy</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex justify-center items-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-futarchyLavender"></div>
      </div>
    </>
  );
}
