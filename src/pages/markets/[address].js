import dynamic from 'next/dynamic';
import Head from 'next/head';
import {
  getStaticMarketAddresses, 
  getMarketConfig, 
  generateMarketSEO 
} from '../../config/markets';

// Import MarketPageShowcase with no SSR
const MarketPageShowcase = dynamic(
  () => import("../../components/futarchyFi/marketPage/MarketPageShowcase"),
  { ssr: false }
);

export default function DynamicMarketPage({ address, seoData, marketConfig }) {
  // If no config exists, show 404 or redirect
  if (!marketConfig) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Market Not Found</h1>
          <p className="text-gray-600">The market address {address} is not configured.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        {/* Basic meta tags */}
        <title>{seoData.title}</title>
        <meta name="description" content={seoData.description} />
        <meta name="keywords" content={marketConfig.keywords?.join(', ')} />
        
        {/* Open Graph tags for social sharing */}
        <meta property="og:title" content={seoData.openGraph.title} />
        <meta property="og:description" content={seoData.openGraph.description} />
        <meta property="og:image" content={seoData.openGraph.image} />
        <meta property="og:url" content={seoData.openGraph.url} />
        <meta property="og:type" content={seoData.openGraph.type} />
        <meta property="og:site_name" content={seoData.openGraph.siteName} />
        
        {/* Twitter Card tags */}
        <meta name="twitter:card" content={seoData.twitter.card} />
        <meta name="twitter:title" content={seoData.twitter.title} />
        <meta name="twitter:description" content={seoData.twitter.description} />
        <meta name="twitter:image" content={seoData.twitter.image} />
        
        {/* Additional meta tags */}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={seoData.url} />
        
        {/* Structured data for better SEO */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": seoData.title,
            "description": seoData.description,
            "url": seoData.url,
            "image": seoData.image,
            "publisher": {
              "@type": "Organization",
              "name": "Futarchy",
              "url": "https://futarchy.seer.pm"
            },
            "category": marketConfig.category,
            "keywords": marketConfig.keywords?.join(', ')
          })}
        </script>
        
        {/* Favicon */}
        <link rel="icon" href="/assets/favicon.svg" />
      </Head>
      
      <MarketPageShowcase proposal={address} />
    </>
  );
}

// Generate static paths for all configured markets at build time
export async function getStaticPaths() {
  const addresses = getStaticMarketAddresses();
  
  const paths = addresses.map((address) => ({
    params: { address }
  }));

  return {
    paths,
    fallback: false // Static export requires all paths to be pre-generated
  };
}

// Generate static props for each market page
export async function getStaticProps({ params }) {
  const { address } = params;
  
  // Get market configuration
  const marketConfig = getMarketConfig(address);
  
  // If no config exists, return 404
  if (!marketConfig) {
    return {
      notFound: true
    };
  }

  // Generate SEO data from the static market config (the Supabase market_event
  // backend that used to enrich this at build time is permanently gone)
  const seoData = generateMarketSEO(address);

  // Note: revalidate is not supported with output: export
  return {
    props: {
      address,
      seoData,
      marketConfig
    }
  };
}