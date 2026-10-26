import React from 'react';
import { ArrowTopRightOnSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';

// A market badge is one of three things: a state (plain label), a link out (Snapshot, Reality.eth,
// an explorer) or an action on this page (add liquidity, create a pool, edit). Each takes the kit
// control that says which it is.
const STATE_TONES = {
  blue: 'pass',
  gold: 'fail',
  emerald: 'accent',
  orange: 'warning',
  gray: 'neutral',
  default: 'neutral',
};

const MarketBadge = ({ text, colorScheme = 'default', link, onClick }) => {
  if (onClick) {
    return (
      <Button variant="secondary" size="sm" onClick={onClick}>
        {text === 'Add Liquidity' && <PlusIcon className="w-4 h-4" aria-hidden="true" />}
        {text}
      </Button>
    );
  }

  if (link) {
    return (
      <Button as="a" variant="outline" size="sm" href={link} target="_blank" rel="noopener noreferrer">
        {text}
        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-seer-muted" aria-hidden="true" />
      </Button>
    );
  }

  return <Badge tone={STATE_TONES[colorScheme] || 'neutral'}>{text}</Badge>;
};

export default MarketBadge;
