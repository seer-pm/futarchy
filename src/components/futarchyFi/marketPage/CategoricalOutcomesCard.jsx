// Four significant digits: a company token can be worth 0.02 of the currency.
const formatPrice = (value) => String(Number(value.toPrecision(4)));
const percent = (value) => `${(value * 100).toFixed(1)}%`;

/**
 * The answers of a categorical futarchy proposal with their current prices:
 * the chance the prediction pools give each answer, and the company token's
 * price in its conditional pool, that is, if that answer wins. The answer
 * with the highest conditional price is the one the market expects to be
 * best for the company token. Takes the place of the YES/NO chart, whose
 * price history comes from the candles indexer, which only knows binary
 * proposals.
 */
const CategoricalOutcomesCard = ({ categorical, config, selectedKey, onSelect }) => {
  const { proposal, pools, resolution } = categorical;
  const company = config?.BASE_TOKENS_CONFIG?.company?.symbol || proposal.invalid.company.name?.replace(/^INVALID_/, '');
  const currency = config?.BASE_TOKENS_CONFIG?.currency?.symbol || proposal.invalid.currency.name?.replace(/^INVALID_/, '');

  const prices = (pools ?? []).map((row) => row.conditional?.price ?? null);
  const best = prices.reduce((top, price, i) => (price !== null && (top === null || price > prices[top]) ? i : top), null);
  const maxPrice = Math.max(0, ...prices.filter((price) => price !== null));

  return (
    <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      <div className="flex h-16 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center justify-between">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">Outcomes</h3>
        <span className="text-xs text-futarchyGray11 dark:text-white/70">{company} price if each answer wins, in {currency}</span>
      </div>

      <div className="flex flex-col gap-1 p-4">
        {!pools ? (
          <p className="py-6 text-center text-sm text-futarchyGray11 dark:text-white/70">Loading prices…</p>
        ) : pools.map((row, i) => {
          const price = row.conditional?.price ?? null;
          const chance = row.prediction?.price ?? null;
          const selected = row.key === selectedKey;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelect?.(row.key)}
              aria-pressed={selected}
              className={`flex flex-col gap-2 rounded-xl px-3 py-3 text-left border-2 transition-colors ${selected
                ? 'border-futarchyViolet9 bg-futarchyViolet3 dark:bg-futarchyViolet11/20'
                : 'border-transparent hover:bg-futarchyGray4 dark:hover:bg-futarchyGray8/40'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-futarchyGray12 dark:text-white">
                  {row.label}
                  {best === i && !resolution?.resolved && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-futarchyViolet9 text-white">Highest {company} price</span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-futarchyGray12 dark:text-white">
                  {price === null ? 'No pool' : `${formatPrice(price)} ${currency}`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-futarchyGray5 dark:bg-futarchyGray8 overflow-hidden">
                <div
                  className={`h-full rounded-full ${best === i ? 'bg-futarchyViolet9' : 'bg-futarchyGray11/60'}`}
                  style={{ width: price === null || maxPrice === 0 ? '0%' : `${(price / maxPrice) * 100}%` }}
                />
              </div>
              <span className="text-xs text-futarchyGray11 dark:text-white/70">
                {chance === null ? 'No prediction pool' : `Chance ${percent(chance)}`}
              </span>
            </button>
          );
        })}

        <div className="flex items-center justify-between rounded-xl px-3 py-3 text-xs text-futarchyGray11 dark:text-white/60">
          <span className="italic">Invalid</span>
          <span>No market: an Invalid answer undoes every trade</span>
        </div>
      </div>
    </div>
  );
};

export default CategoricalOutcomesCard;
