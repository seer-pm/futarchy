/**
 * Example of how to add new markets to the MARKETS_CONFIG
 * Copy this structure to add new market addresses to src/config/markets.js
 */

// Example: Adding a new market to MARKETS_CONFIG
const EXAMPLE_NEW_MARKET = {
  "0x1234567890123456789012345678901234567890": {
    title: "Example Market Title",
    description: "Markets are currently forecasting the impact of this proposal. Trade your insights or follow the predictions!",
    image: "/assets/your-market-image.png", // Make sure this image exists in public/assets/
    path: "/markets/0x1234567890123456789012345678901234567890",
    openGraph: {
      title: "Example Market Title | Futarchy",
      description: "Markets are currently forecasting the impact of this proposal. Trade your insights or follow the predictions!",
      image: "/assets/your-market-image.png",
      type: "website",
      siteName: "Futarchy"
    },
    twitter: {
      card: "summary_large_image",
      title: "Example Market Title | Futarchy",
      description: "Markets are currently forecasting the impact of this proposal. Trade your insights or follow the predictions!",
      image: "/assets/your-market-image.png"
    },
    keywords: ["futarchy", "prediction market", "your", "custom", "keywords"],
    category: "governance", // or "trading", "defi", etc.
    isActive: true // Set to false to disable static generation for this market
  }
};

/**
 * Steps to add a new market:
 * 
 * 1. Add your market configuration to MARKETS_CONFIG in src/config/markets.js
 * 2. Make sure the image exists in public/assets/
 * 3. Run `npm run build` to generate the static page
 * 4. The market will be available at /markets/[your-address]
 * 
 * Optional customizations:
 * - Set isActive: false to disable static generation
 * - Add custom keywords for better SEO
 * - Use different categories for organization
 * - Customize social media descriptions separately from main description
 */

export default EXAMPLE_NEW_MARKET; 