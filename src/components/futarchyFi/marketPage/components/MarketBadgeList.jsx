import React from 'react';
import MarketBadge from './MarketBadge';

const MarketBadgeList = ({ badges = [] }) => {
  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
      {badges.map((badge, index) => (
        <MarketBadge
          key={index}
          text={badge.text}
          colorScheme={badge.colorScheme}
          link={badge.link}
          onClick={badge.onClick}
          menu={badge.menu}
        />
      ))}
    </div>
  );
};

export default MarketBadgeList; 