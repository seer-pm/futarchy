import { Dialog } from '@seer-pm/ui-kit/react';

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

  return (
    <Dialog open={isOpen} onClose={onClose} title="Prediction Market">
        <div className="text-sm text-seer-muted mb-6">
          Choose a pool to trade YES or NO tokens against {baseSymbol}. Links open the appropriate swap interface in a new tab.
        </div>

        <div className="space-y-2">
          {poolLinks.map((pool, index) => (
            <a
              key={index}
              href={pool.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-surface border border-seer-border hover:border-seer-accent-text transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-seer-text font-medium">{pool.title}</span>
                  <p className="text-xs text-seer-muted mt-1">{pool.description}</p>
                </div>
                <svg className="w-4 h-4 text-seer-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>

        {poolLinks.length === 0 && (
          <div className="text-center text-seer-muted py-8">
            Prediction market pools are not configured for this market.
          </div>
        )}
    </Dialog>
  );
};

export { PredictionMarketModal };
