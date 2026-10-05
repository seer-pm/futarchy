import { useMemo } from 'react';
import { normalizeTokenAmount } from '../page/Formatter';
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from '../../../../constants/addresses';

const useLiquiditySummary = ({ config, poolData, newYesPrice, newNoPrice, latestPrices }) => {
  const liquiditySummary = useMemo(() => {
    const tokensConfig = config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
    const currencyAddress = tokensConfig?.currency?.address?.toLowerCase() || null;
    const companyAddress = tokensConfig?.company?.address?.toLowerCase() || null;

    const parsePrice = (value) => {
      if (value === null || value === undefined) return null;
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    };

    const computeBreakdown = (liquidity, poolPrice) => {
      if (!liquidity) return null;

      // Some APIs return a pre-summed amount - treat it entirely as currency liquidity
      if (typeof liquidity.amount !== 'undefined') {
        const total = normalizeTokenAmount(liquidity.amount);
        return {
          total,
          cashValue: total,
          companyValue: 0,
          otherValue: 0,
          priceUsed: parsePrice(poolPrice)
        };
      }

      const entries = [
        { token: liquidity.token0, amount: liquidity.amount0, kind: liquidity.kind0 },
        { token: liquidity.token1, amount: liquidity.amount1, kind: liquidity.kind1 }
      ];

      let cashValue = 0;
      let companyTokenAmount = 0;
      let otherValue = 0;

      for (const entry of entries) {
        if (!entry || entry.amount === null || entry.amount === undefined) continue;
        const normalizedAmount = normalizeTokenAmount(entry.amount);
        const tokenAddress = entry.token?.toLowerCase();

        if (entry.kind === 'currency' || (currencyAddress && tokenAddress === currencyAddress)) {
          cashValue += normalizedAmount;
        } else if (entry.kind === 'company' || (companyAddress && tokenAddress === companyAddress)) {
          companyTokenAmount += normalizedAmount;
        } else {
          otherValue += normalizedAmount;
        }
      }

      const price = parsePrice(poolPrice);
      const companyValue = price ? companyTokenAmount * price : companyTokenAmount;
      const total = cashValue + companyValue + otherValue;

      return {
        total,
        cashValue,
        companyValue,
        otherValue,
        priceUsed: price,
        rawCompanyAmount: companyTokenAmount
      };
    };

    const yesPrice = parsePrice(newYesPrice ?? poolData?.yesPool?.price ?? latestPrices.yes);
    const noPrice = parsePrice(newNoPrice ?? poolData?.noPool?.price ?? latestPrices.no);

    const yesData = computeBreakdown(poolData?.yesPool?.liquidity, yesPrice);
    const noData = computeBreakdown(poolData?.noPool?.liquidity, noPrice);

    const MINIMUM_DISPLAY = 1e-9;
    const tooltipBreakdown = [];

    if (yesData) {
      const hasYesCompany = yesData.companyValue > MINIMUM_DISPLAY;
      const hasYesOther = yesData.otherValue > MINIMUM_DISPLAY;
      const hasYesCash = yesData.cashValue > MINIMUM_DISPLAY;

      tooltipBreakdown.push({
        label: 'YES Total',
        value: yesData.total,
        className: 'text-futarchyBlue9 font-semibold'
      });
      if (hasYesCash && (hasYesCompany || hasYesOther)) {
        tooltipBreakdown.push({
          label: 'YES Cash',
          value: yesData.cashValue,
          className: 'text-futarchyBlue9'
        });
      }
      if (hasYesCompany) {
        tooltipBreakdown.push({
          label: yesData.priceUsed ? 'YES Company' : 'YES Company (raw)',
          value: yesData.companyValue,
          className: 'text-futarchyBlue9'
        });
      }
      if (hasYesOther) {
        tooltipBreakdown.push({
          label: 'YES Other',
          value: yesData.otherValue,
          className: 'text-white/80'
        });
      }
    }

    if (noData) {
      const hasNoCompany = noData.companyValue > MINIMUM_DISPLAY;
      const hasNoOther = noData.otherValue > MINIMUM_DISPLAY;
      const hasNoCash = noData.cashValue > MINIMUM_DISPLAY;

      tooltipBreakdown.push({
        label: 'NO Total',
        value: noData.total,
        className: 'text-futarchyGold8 font-semibold'
      });
      if (hasNoCash && (hasNoCompany || hasNoOther)) {
        tooltipBreakdown.push({
          label: 'NO Cash',
          value: noData.cashValue,
          className: 'text-futarchyGold8'
        });
      }
      if (hasNoCompany) {
        tooltipBreakdown.push({
          label: noData.priceUsed ? 'NO Company' : 'NO Company (raw)',
          value: noData.companyValue,
          className: 'text-futarchyGold8'
        });
      }
      if (hasNoOther) {
        tooltipBreakdown.push({
          label: 'NO Other',
          value: noData.otherValue,
          className: 'text-white/80'
        });
      }
    }

    return {
      yes: yesData,
      no: noData,
      breakdown: tooltipBreakdown
    };
  }, [
    config?.BASE_TOKENS_CONFIG,
    poolData?.yesPool?.liquidity,
    poolData?.noPool?.liquidity,
    poolData?.yesPool?.price,
    poolData?.noPool?.price,
    newYesPrice,
    newNoPrice,
    latestPrices.yes,
    latestPrices.no
  ]);

  return liquiditySummary;
};

export { useLiquiditySummary };
