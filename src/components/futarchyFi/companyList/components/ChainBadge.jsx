import React from "react";

// Chain configuration mapping
const CHAIN_CONFIG = {
  1: {
    name: "Ethereum",
    shortName: "ETH",
    color: "bg-blue-100 dark:bg-blue-900/30",
    borderColor: "border-blue-300 dark:border-blue-700",
    textColor: "text-blue-700 dark:text-blue-400",
  },
  100: {
    name: "Gnosis Chain",
    shortName: "Gnosis",
    color: "bg-emerald-100 dark:bg-emerald-900/30",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    textColor: "text-emerald-700 dark:text-emerald-400",
  },
  137: {
    name: "Polygon",
    shortName: "Polygon",
    color: "bg-purple-100 dark:bg-purple-900/30",
    borderColor: "border-purple-300 dark:border-purple-700",
    textColor: "text-purple-700 dark:text-purple-400",
  },
  42161: {
    name: "Arbitrum",
    shortName: "Arbitrum",
    color: "bg-cyan-100 dark:bg-cyan-900/30",
    borderColor: "border-cyan-300 dark:border-cyan-700",
    textColor: "text-cyan-700 dark:text-cyan-400",
  },
  10: {
    name: "Optimism",
    shortName: "Optimism",
    color: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-300 dark:border-red-700",
    textColor: "text-red-700 dark:text-red-400",
  },
};

const ChainBadge = ({ chainId, className = "", size = "sm" }) => {
  const chainConfig = CHAIN_CONFIG[chainId] || {
    name: `Chain ${chainId}`,
    shortName: `Chain ${chainId}`,
    color: "bg-gray-100 dark:bg-gray-900/30",
    borderColor: "border-gray-300 dark:border-gray-700",
    textColor: "text-gray-700 dark:text-gray-400",
  };

  const sizeClasses = {
    xs: "h-5 px-1.5 text-[10px]",
    sm: "h-6 px-2 text-xs",
    md: "h-7 px-2.5 text-sm",
    lg: "h-8 px-3 text-base",
  };

  // Chains are identity, not status, so every chain gets the same neutral label.
  return (
    <span
      className={`inline-flex items-center w-fit rounded-control font-semibold bg-seer-surface-raised text-seer-muted ${sizeClasses[size]} ${className}`}
      title={chainConfig.name}
    >
      {chainConfig.shortName}
    </span>
  );
};

export default ChainBadge;
