import { motion } from 'framer-motion';

const PredictionMarketModal = ({ isOpen, onClose, config }) => {
  if (!isOpen || !config) return null;

  const baseToken = config?.BASE_TOKENS_CONFIG?.currency;
  const yesTokenAddress = config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress;
  const noTokenAddress = config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

  const baseAddress = baseToken?.address;
  const baseSymbol = baseToken?.symbol || 'Base';

  const createSwapUrl = (inputToken, outputToken) => {
    if (!inputToken || !outputToken) return null;

    if (config?.chainId === 1) {
      return `https://app.uniswap.org/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
    }

    return `https://v3.swapr.eth.limo/#/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
  };

  const poolLinks = [
    yesTokenAddress && baseAddress ? {
      title: `YES ${baseSymbol} Pool`,
      description: `Trade ${baseSymbol} ↔ YES ${baseSymbol}`,
      href: createSwapUrl(baseAddress, yesTokenAddress)
    } : null,
    noTokenAddress && baseAddress ? {
      title: `NO ${baseSymbol} Pool`,
      description: `Trade ${baseSymbol} ↔ NO ${baseSymbol}`,
      href: createSwapUrl(baseAddress, noTokenAddress)
    } : null
  ].filter(Boolean);

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <motion.div
        className="bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80dvh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-futarchyGray12 dark:text-futarchyGray3">Prediction Market</h2>
          <button
            onClick={onClose}
            className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-6">
          Choose a pool to trade YES or NO tokens against {baseSymbol}. Links open the appropriate swap interface in a new tab.
        </div>

        <div className="space-y-2">
          {poolLinks.map((pool, index) => (
            <a
              key={index}
              href={pool.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray5 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">{pool.title}</span>
                  <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-1">{pool.description}</p>
                </div>
                <svg className="w-4 h-4 text-futarchyGray11 dark:text-futarchyGray112" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>

        {poolLinks.length === 0 && (
          <div className="text-center text-futarchyGray11 dark:text-futarchyGray112 py-8">
            Prediction market pools are not configured for this market.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export { PredictionMarketModal };
