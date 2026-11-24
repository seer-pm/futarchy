import React, { useEffect, useRef, useState } from 'react';

// Centralized color configurations for different badge types
const colorConfigs = {
  emerald: 'bg-transparent text-futarchyEmerald11 border-futarchyEmerald11 hover:bg-futarchyEmerald11 hover:text-futarchyDarkGray2',
  teal: 'bg-transparent text-futarchyTeal5 border-futarchyTeal5 hover:bg-futarchyTeal5 hover:text-black',
  gold: 'bg-transparent text-futarchyGold8 border-futarchyGold8 hover:bg-futarchyGold8 hover:text-black',
  blue: 'bg-transparent text-futarchyBlue9 border-futarchyBlue9 hover:bg-futarchyBlue9 hover:text-white',
  violet: 'bg-transparent text-futarchyViolet7 border-futarchyViolet7 hover:bg-futarchyViolet7 hover:text-black',
  gray: 'bg-transparent text-futarchyGray11 border-futarchyGray11 hover:bg-futarchyGray11 hover:text-futarchyDarkGray2',
  orange: 'bg-transparent text-orange-500 border-orange-500 hover:bg-orange-500 hover:text-black',
  default: 'bg-transparent text-white border-white hover:bg-white hover:text-black',
};

const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block mr-1">
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ArrowIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block ml-1 opacity-70">
        <path d="M7 17L17 7M17 7H8M17 7V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChevronIcon = ({ open }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`inline-block ml-1 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}>
        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// A badge that opens a list of links, such as the Reality question of every
// question a chained market is made of. Closes on a click outside or Escape.
const MenuBadge = ({ text, menu, classes }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} className={`w-full ${classes}`}>
        <span className="whitespace-nowrap">{text}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-50 min-w-[16rem] rounded-lg border-2 border-futarchyViolet7 bg-futarchyDarkGray2 py-1 shadow-lg">
          {menu.map((item) => (
            <a
              key={item.link}
              role="menuitem"
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-white hover:bg-futarchyViolet7 hover:text-black"
            >
              <span>{item.label}</span>
              <ArrowIcon />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const MarketBadge = ({ text, colorScheme = 'default', link, onClick, menu }) => {
  const badgeClasses = colorConfigs[colorScheme] || colorConfigs.default;
  const commonClasses = `h-7 py-1 px-3 text-sm font-semibold rounded-lg border-2 flex items-center justify-center gap-1 transition-colors duration-200 whitespace-nowrap`;

  // Apply a more subtle glow effect only to interactive badges
  const interactiveBadges = ['Market Summary', 'Track Progress', 'Prediction Market', 'Resolve Question', 'Resolution Question', 'Add Liquidity', 'Arbitrage Contract'];
  const isInteractive = interactiveBadges.includes(text) || link || onClick;

  const glowClass = isInteractive ? 'animate-subtle-pulse drop-shadow-[0_0_2px_rgba(255,255,255,0.4)]' : '';

  if (menu?.length > 0) {
    return <MenuBadge text={text} menu={menu} classes={`${commonClasses} ${badgeClasses} cursor-pointer ${glowClass}`} />;
  }

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${commonClasses} ${badgeClasses} cursor-pointer ${glowClass}`}
      >
        {text === 'Add Liquidity' && <PlusIcon />}
        <span className="whitespace-nowrap">{text}</span>
      </button>
    );
  }

  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${commonClasses} ${badgeClasses} cursor-pointer ${glowClass}`}
      >
        {text === 'Add Liquidity' && <PlusIcon />}
        <span className="whitespace-nowrap">{text}</span>
        {text !== 'Add Liquidity' && <ArrowIcon />}
      </a>
    );
  }

  return (
    <span className={`${commonClasses} ${badgeClasses} ${glowClass}`}>
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
};

export default MarketBadge;