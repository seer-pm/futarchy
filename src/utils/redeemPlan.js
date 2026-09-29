/**
 * Pure decision helpers for the Redeem tab (RedeemTokens / RedemptionModal).
 * Kept import-free so auto-qa can load the module directly.
 */

/**
 * Which side's tokens pay out for a resolved outcome.
 * Only an explicit Yes/No picks a side; anything else (e.g. "Invalid") has no
 * single winning side and must not be redeemed as either.
 * @param {string|null|undefined} finalOutcome
 * @returns {'yes'|'no'|null}
 */
export function getRedeemSide(finalOutcome) {
  const outcome = String(finalOutcome ?? '').trim().toLowerCase();
  if (outcome === 'yes') return 'yes';
  if (outcome === 'no') return 'no';
  return null;
}

/**
 * Outcome label from ConditionalTokens payout numerators of a resolved
 * condition (slot 0 = Yes, slot 1 = No for futarchy proposals). Both slots
 * paying out means the question resolved invalid.
 * @param {bigint|number|string|{toString(): string}} yesNumerator
 * @param {bigint|number|string|{toString(): string}} noNumerator
 * @returns {'Yes'|'No'|'Invalid'|null}
 */
export function outcomeFromPayouts(yesNumerator, noNumerator) {
  const yesPays = BigInt(yesNumerator.toString()) > 0n;
  const noPays = BigInt(noNumerator.toString()) > 0n;
  if (yesPays && noPays) return 'Invalid';
  if (yesPays) return 'Yes';
  if (noPays) return 'No';
  return null;
}

const toAmount = (value) =>
  typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? value.trim() : '0';

export const isPositiveAmount = (amount) => parseFloat(amount) > 0;

/**
 * Amounts to redeem for a side. The router's redeemProposal only pulls the
 * wrapped ERC20 outcome tokens, so only wrapped balances are redeemable;
 * unwrapped ERC1155 balances are reported separately.
 * @param {object} positions - { currencyYes: { wrapped, unwrapped }, ... }
 * @param {'yes'|'no'} side
 */
export function getRedeemAmounts(positions, side) {
  const suffix = side === 'yes' ? 'Yes' : 'No';
  const currency = positions?.[`currency${suffix}`];
  const company = positions?.[`company${suffix}`];
  return {
    currencyAmount: toAmount(currency?.wrapped),
    companyAmount: toAmount(company?.wrapped),
    unwrappedCurrencyAmount: toAmount(currency?.unwrapped),
    unwrappedCompanyAmount: toAmount(company?.unwrapped),
  };
}

/**
 * Readable reason for a failed redemption.
 * @param {Error|string|null|undefined} error
 * @returns {string}
 */
export function describeRedeemError(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  if (
    error?.code === 4001 ||
    error?.code === 'ACTION_REJECTED' ||
    /user rejected|user denied|rejected the request|action_rejected/i.test(message)
  ) {
    return 'Transaction cancelled';
  }
  if (message.includes('SAFE_TRANSACTION_SENT')) {
    return 'Transaction sent to your Safe. Confirm and execute it there, then refresh.';
  }
  // viem puts the short reason on the first line, details below it
  return message.split('\n')[0].trim() || 'Unknown error occurred.';
}
