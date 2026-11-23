import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
import { fetchPoolCandles } from '../../../utils/SubgraphPoolFetcher';
import { chanceHistory } from '../../../utils/proposalFamily';

// One color per answer, shared with the outcome list's legend dots.
const ANSWER_COLORS = [
  'rgb(0, 144, 255)', 'rgb(245, 196, 0)', 'rgb(139, 92, 246)', 'rgb(16, 185, 129)',
  'rgb(239, 68, 68)', 'rgb(236, 72, 153)', 'rgb(20, 184, 166)', 'rgb(249, 115, 22)',
];
export const answerColor = (index) => ANSWER_COLORS[index % ANSWER_COLORS.length];

const PERIOD = 3600;

const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/**
 * Price history of every answer of a categorical market, from the candles
 * indexer: the company token's price in each answer's conditional pool, or
 * its chance, the product of the prediction pools down its path (one pool
 * for an answer of the first question). Each line ends at the current
 * on-chain value, so it is up to date between hourly candles.
 *
 * @param {object} p
 * @param {Array} p.pools useCategoricalMarket pools (proposalFamily.js attachFamilyPools leaves)
 * @param {'price'|'chance'} p.metric
 */
const CategoricalHistoryChart = ({ pools, chainId, metric, selectedKey, height = 260 }) => {
  const containerRef = useRef(null);
  const [candles, setCandles] = useState(null);
  const [width, setWidth] = useState(0);
  const [dark, setDark] = useState(isDark);

  // Pool addresses only change when a pool is created, not with every price.
  const addresses = (pools ?? [])
    .flatMap((row) => [row.conditional, ...row.chancePools].map((pool) => pool?.address))
    .filter(Boolean);
  const addressKey = [...new Set(addresses.map((address) => address.toLowerCase()))].join(',');

  useEffect(() => {
    if (!addressKey) {
      setCandles(new Map());
      return undefined;
    }
    let cancelled = false;
    const list = addressKey.split(',');
    Promise.all(list.map((poolAddress) => fetchPoolCandles({ poolAddress, chainId, periodSeconds: PERIOD })))
      .then((results) => {
        if (!cancelled) setCandles(new Map(list.map((address, i) => [address.toLowerCase(), results[i]])));
      });
    return () => { cancelled = true; };
  }, [addressKey, chainId]);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (containerRef.current) resize.observe(containerRef.current);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, []);

  const history = (pool) => (pool && candles?.get(pool.address.toLowerCase())) || [];
  const lines = (pools ?? []).map((row) => {
    const points = metric === 'chance'
      ? (row.chancePools.every(Boolean) ? chanceHistory(row.chancePools.map(history)) : [])
      : history(row.conditional);
    const current = metric === 'chance' ? row.chance : row.conditional?.price ?? null;
    return { row, current, data: points.map(({ timestamp, price }) => ({ time: timestamp, value: price })) };
  });
  // Every line ends at the current price, at this hour or at the latest
  // candle of any answer, whichever is later.
  const end = Math.max(
    Math.floor(Date.now() / 1000 / PERIOD) * PERIOD,
    ...lines.flatMap(({ data }) => data.map((point) => point.time)),
  );
  const series = lines.map(({ row, current, data }, index) => {
    if (data.length > 0 && current !== null) {
      const last = data[data.length - 1];
      if (end > last.time) data.push({ time: end, value: current });
      else last.value = current;
    }
    const scale = metric === 'chance' ? 100 : 1;
    return { row, index, data: data.map((point) => ({ time: point.time, value: point.value * scale })) };
  });
  const hasHistory = series.some(({ data }) => data.length > 0);

  useEffect(() => {
    if (!containerRef.current || !width || !hasHistory) return undefined;
    const text = dark ? 'rgb(220, 220, 220)' : '#333333';
    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: text, fontFamily: 'Arial, sans-serif', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(0, 0, 0, 0)' }, horzLines: { color: 'rgba(0, 0, 0, 0)' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
    });
    const max = Math.max(...series.flatMap(({ data }) => data.map((point) => point.value)));
    const precision = metric === 'chance' ? 1 : Math.max(2, 3 - Math.floor(Math.log10(max || 1)));
    for (const { row, index, data } of series) {
      if (data.length === 0) continue;
      const selected = row.key === selectedKey;
      chart.addSeries(LineSeries, {
        color: answerColor(index),
        lineWidth: selected ? 3 : 2,
        title: row.label,
        lastValueVisible: selected,
        priceLineVisible: selected,
        priceFormat: metric === 'chance'
          ? { type: 'custom', minMove: 0.1, formatter: (value) => `${value.toFixed(precision)}%` }
          : { type: 'price', precision, minMove: 10 ** -precision },
      }).setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
    // series is rebuilt every render; its inputs are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, pools, metric, selectedKey, width, height, dark, hasHistory]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />
      {!hasHistory && (
        <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-futarchyGray11 dark:text-white/70">
          {candles === null ? 'Loading price history…' : 'No price history yet: the indexer has no trades in these pools.'}
        </p>
      )}
    </div>
  );
};

export default CategoricalHistoryChart;
