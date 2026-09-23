import "@rainbow-me/rainbowkit/styles.css";
import "../styles/globals.css";

import { Oxanium, Barlow } from "next/font/google";
import Head from "next/head";
import metadata from "../../app/metadata";
import Providers from "../providers/providers";
import { useRouter } from "next/router";
import { CurrencyProvider } from "../contexts/CurrencyContext";
import { ThemeProvider } from "../contexts/ThemeContext";

const oxanium = Oxanium({
  subsets: ["latin"],
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function App({ Component, pageProps }) {
  const router = useRouter();

  // Check if this is a market page (including both dynamic and static market routes)
  const isMarketPage = router.pathname.startsWith('/markets') ||
    router.pathname.includes('/market') ||
    router.asPath.startsWith('/markets/');

  return (
    <Providers>
      <ThemeProvider>
        <CurrencyProvider>
          <Head>
            {/* Google Tag Manager */}
            <script
              dangerouslySetInnerHTML={{
                __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WGGQ4VXS');`,
              }}
            />
            {/* End Google Tag Manager */}

            {!isMarketPage && (
              <>
                <title>{metadata.title}</title>
                <meta name="description" content={metadata.description} />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content={metadata.openGraph.type} />
                <meta property="og:url" content={metadata.openGraph.url} />
                <meta property="og:title" content={metadata.openGraph.title} />
                <meta
                  property="og:description"
                  content={metadata.openGraph.description}
                />
                <meta property="og:site_name" content={metadata.openGraph.siteName} />
                <meta property="og:image" content={metadata.openGraph.image} />

                {/* Twitter */}
                <meta name="twitter:card" content={metadata.twitter.card} />
                <meta name="twitter:title" content={metadata.twitter.title} />
                <meta
                  name="twitter:description"
                  content={metadata.twitter.description}
                />
                <meta name="twitter:image" content={metadata.twitter.image} />

                {/* Icons */}
                <link rel="icon" href={metadata.icons.icon} />
              </>
            )}
            {isMarketPage && (
              <>
                {/* Basic fallback for icons only on market pages */}
                {/* SEO will be handled by individual market pages */}
                <link rel="icon" href={metadata.icons.icon} />
              </>
            )}
          </Head>

          {/* Google Tag Manager (noscript) */}
          <noscript>
            <iframe
              src="https://www.googletagmanager.com/ns.html?id=GTM-WGGQ4VXS"
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
          {/* End Google Tag Manager (noscript) */}

          <main>
            <Component {...pageProps} />
          </main>
        </CurrencyProvider>
      </ThemeProvider>
    </Providers>
  );
}
