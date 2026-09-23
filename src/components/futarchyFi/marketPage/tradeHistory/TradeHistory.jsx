import React, { useEffect, useRef, useState } from 'react';
import BaseTableCell from './BaseTableCell';
import { OutcomeCell, SideCell, AmountCell, PriceCell, DateCell } from './CustomCells';
import MobileTradeCard from './MobileTradeCard';

const tradeHistoryData = {
  rows: [
    {
      outcome: "YES",
      side: "sell",
      amountOut: {
        token: "YES_GNO",
        amount: "0.000012"
      },
      amountIn: {
        token: "sDAI",
        amount: "0.001"
      },
      price: "89.77",
      date: "2025-06-23T14:25:00Z"
    },
    {
      outcome: "NO",
      side: "buy",
      amountOut: {
        token: "NO_GNO",
        amount: "0.000025"
      },
      amountIn: {
        token: "sDAI",
        amount: "0.002"
      },
      price: "80.10",
      date: "2025-06-23T15:05:00Z"
    },
    {
      outcome: "YES",
      side: "buy",
      amountOut: { token: "sDAI", amount: "10.50" },
      amountIn: { token: "YES_GNO", amount: "0.12" },
      price: "87.50",
      date: "2025-06-24T10:15:00Z"
    },
    {
      outcome: "NO",
      side: "sell",
      amountOut: { token: "NO_GNO", amount: "0.05" },
      amountIn: { token: "sDAI", amount: "4.00" },
      price: "80.00",
      date: "2025-06-24T11:30:00Z"
    },
    {
        outcome: "YES",
        side: "sell",
        amountOut: { token: "YES_GNO", amount: "0.02" },
        amountIn: { token: "sDAI", amount: "1.78" },
        price: "89.00",
        date: "2025-06-24T12:00:00Z"
    },
    {
        outcome: "NO",
        side: "buy",
        amountOut: { token: "sDAI", amount: "20.00" },
        amountIn: { token: "NO_GNO", amount: "0.25" },
        price: "80.00",
        date: "2025-06-24T14:45:00Z"
    }
  ]
};

const ArrowButton = ({ direction, onClick, isVisible }) => (
  <button
    onClick={onClick}
    className={`absolute top-1/2 -translate-y-1/2 z-10 p-1 bg-black/20 dark:bg-black/40 hover:bg-black/30 dark:hover:bg-black/60 rounded-full transition-opacity duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
    } ${direction === 'left' ? 'left-2' : 'right-2'}`}
  >
    {direction === 'left' ? (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    )}
  </button>
);

export const TradeHistory = ({ data = tradeHistoryData }) => {
  const desktopScrollRef = useRef(null);
  const mobileScrollRef = useRef(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Desktop drag-to-scroll logic
  useEffect(() => {
    const element = desktopScrollRef.current;
    if (!element) return;

    let isDragging = false;
    let startY;
    let scrollTop;

    const onMouseDown = (e) => {
      isDragging = true;
      startY = e.clientY;
      scrollTop = element.scrollTop;
      element.style.cursor = 'grabbing';
      element.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const y = e.clientY;
      const walk = y - startY;
      element.scrollTop = scrollTop - walk;
    };
    const onMouseUp = () => {
      isDragging = false;
      element.style.cursor = 'grab';
      element.style.userSelect = 'auto';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    element.addEventListener('mousedown', onMouseDown);
    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
  
  // Mobile arrow visibility logic
  useEffect(() => {
    const container = mobileScrollRef.current;
    if (!container) return;
    const checkScrollability = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    };
    const checkTimeout = setTimeout(checkScrollability, 100);
    container.addEventListener('scroll', checkScrollability, { passive: true });
    const resizeObserver = new ResizeObserver(checkScrollability);
    resizeObserver.observe(container);
    return () => {
      clearTimeout(checkTimeout);
      container.removeEventListener('scroll', checkScrollability);
      resizeObserver.unobserve(container);
    };
  }, [data]);

  const handleMobileScroll = (direction) => {
    const container = mobileScrollRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className="h-full w-full">
      {/* Desktop View: Table with drag-to-scroll */}
      <div
        ref={desktopScrollRef}
        className="h-full overflow-y-auto cursor-grab bg-white dark:bg-futarchyDarkGray2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 hidden lg:block"
      >
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 bg-white dark:bg-futarchyDarkGray2 px-4 py-2 text-left text-xs text-futarchyGray11 dark:text-white/70 font-semibold border-b border-futarchyGray62 dark:border-futarchyGray11/70">Outcome</th>
              <th className="sticky top-0 bg-white dark:bg-futarchyDarkGray2 px-4 py-2 text-left text-xs text-futarchyGray11 dark:text-white/70 font-semibold border-b border-futarchyGray62 dark:border-futarchyGray11/70">Side</th>
              <th className="sticky top-0 bg-white dark:bg-futarchyDarkGray2 px-4 py-2 text-left text-xs text-futarchyGray11 dark:text-white/70 font-semibold border-b border-futarchyGray62 dark:border-futarchyGray11/70">Amount</th>
              <th className="sticky top-0 bg-white dark:bg-futarchyDarkGray2 px-4 py-2 text-right text-xs text-futarchyGray11 dark:text-white/70 font-semibold border-b border-futarchyGray62 dark:border-futarchyGray11/70">Price</th>
              <th className="sticky top-0 bg-white dark:bg-futarchyDarkGray2 px-4 py-2 text-left text-xs text-futarchyGray11 dark:text-white/70 font-semibold border-b border-futarchyGray62 dark:border-futarchyGray11/70">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={index} className="hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGrayBG">
                <OutcomeCell outcome={row.outcome} />
                <SideCell side={row.side} />
                <AmountCell amountOut={row.amountOut} amountIn={row.amountIn} />
                <PriceCell price={row.price} />
                <DateCell date={row.date} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View: Cards with native touch scroll */}
      <div className="relative h-full w-full block lg:hidden">
        <div
          ref={mobileScrollRef}
          className="h-full w-full overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory no-scrollbar"
        >
          <div className="flex h-full flex-row items-center space-x-4 px-4 py-1">
            {data.rows.map((row, index) => (
              <div key={index} className="w-full flex-shrink-0 snap-center h-full">
                <MobileTradeCard trade={row} />
              </div>
            ))}
          </div>
        </div>
        <ArrowButton direction="left" onClick={() => handleMobileScroll('left')} isVisible={canScrollLeft} />
        <ArrowButton direction="right" onClick={() => handleMobileScroll('right')} isVisible={canScrollRight} />
      </div>
    </div>
  );
};

export default TradeHistory;

// Helper to hide scrollbar
const style = document.createElement('style');
style.innerHTML = `
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
document.head.appendChild(style); 