import React from 'react';
import MarketBadge from './MarketBadge';

const MarketBadgeList = ({ badges = [], className = '' }) => {
  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {badges.map((badge, index) => (
        <MarketBadge
          key={index}
          text={badge.text}
          colorScheme={badge.colorScheme}
          link={badge.link}
          onClick={badge.onClick}
        />
      ))}
    </div>
  );
};

export default MarketBadgeList;
