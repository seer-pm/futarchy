import { useState } from 'react';

const useChartFilters = () => {
  // Chart line visibility filters
  const [chartFilters, setChartFilters] = useState({
    spot: true, // Spot price shown as semi-transparent dashed line
    yes: true,
    no: true,
    impact: false, // Impact line is hidden by default
    eventProbability: false // Event probability line hidden by default
  });

  const handleChartFilterClick = (filterType) => {
    setChartFilters(prev => {
      const newFilters = { ...prev };

      // Special handling for impact - when clicked, show only impact line
      if (filterType === 'impact') {
        if (!prev.impact) {
          // Clicking impact when it's off: show only impact
          newFilters.spot = false;
          newFilters.yes = false;
          newFilters.no = false;
          newFilters.eventProbability = false;
          newFilters.impact = true;
        } else {
          // Clicking impact when it's on: show all normal lines
          newFilters.spot = true;
          newFilters.yes = true;
          newFilters.no = true;
          newFilters.impact = false;
          newFilters.eventProbability = false;
        }
        return newFilters;
      }

      // Special handling for event probability - mirror impact behaviour
      if (filterType === 'eventProbability') {
        if (!prev.eventProbability) {
          newFilters.spot = false;
          newFilters.yes = false;
          newFilters.no = false;
          newFilters.impact = false;
          newFilters.eventProbability = true;
        } else {
          newFilters.spot = true;
          newFilters.yes = true;
          newFilters.no = true;
          newFilters.impact = false;
          newFilters.eventProbability = false;
        }
        return newFilters;
      }

      // If impact is currently shown, clicking any other filter switches back to normal mode
      if (prev.impact) {
        newFilters.impact = false;
        newFilters.spot = false;
        newFilters.yes = false;
        newFilters.no = false;
        newFilters.eventProbability = false;
        newFilters[filterType] = true;
        return newFilters;
      }

      // If event probability is currently shown, clicking any other filter switches back to normal mode
      if (prev.eventProbability) {
        newFilters.eventProbability = false;
        newFilters.spot = false;
        newFilters.yes = false;
        newFilters.no = false;
        newFilters.impact = false;
        newFilters[filterType] = true;
        return newFilters;
      }

      // Normal filter logic for spot/yes/no
      // If clicking on an enabled item with all enabled, disable the other two
      if (prev[filterType] && prev.spot && prev.yes && prev.no) {
        Object.keys(newFilters).forEach(key => {
          if (key !== 'impact' && key !== 'eventProbability') {
            newFilters[key] = key === filterType;
          }
        });
      }
      // If clicking on a disabled item, enable it
      else if (!prev[filterType]) {
        newFilters[filterType] = true;
      }
      // If clicking on the only enabled item, enable all (except impact)
      else if (prev[filterType] && Object.values({ spot: prev.spot, yes: prev.yes, no: prev.no }).filter(v => v).length === 1) {
        newFilters.spot = true;
        newFilters.yes = true;
        newFilters.no = true;
      }
      // Otherwise, just toggle the clicked item
      else {
        newFilters[filterType] = !prev[filterType];
      }

      return newFilters;
    });
  };

  return { chartFilters, handleChartFilterClick };
};

export { useChartFilters };
