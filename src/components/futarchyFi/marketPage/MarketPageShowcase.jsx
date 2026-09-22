import React, { useEffect, useRef, memo, useState, useCallback, useMemo } from "react";
import { useSearchParams } from 'next/navigation';
import Image from "next/image";
import RootLayout from "../../../components/layout/RootLayout";
import { ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS, SHOW_DATA_DEBUG } from '../../../config/featureFlags';
import { StatDisplay, AggregatedStatDisplay, formatVolume, formatLiquidity, normalizeTokenAmount } from './page/Formatter';
import ImpactIcon from './page/icons/ImpactIcon';
import LiquidityIcon from './page/icons/LiquidityIcon';
import StatusIcon from './page/icons/StatusIcon';
import TimeIcon from './page/icons/TimeIcon';
import VolumeIcon from './page/icons/VolumeIcon';
import MarketBadgeList from './components/MarketBadgeList';
import ArrowDownIcon from '../../common/icons/ArrowDownIcon';
import PageLayout from '../../layout/PageLayout';
import ShowcaseSwapComponent from "./ShowcaseSwapComponent";
import CollateralModal from "./collateralModal/CollateralModal";
import { useAccount } from 'wagmi';
import { ethers } from "ethers";
import { motion, AnimatePresence } from 'framer-motion';

import RedeemTokens from "./redeemTokens/RedeemTokens";
import EditProposalModal from '../../debug/EditProposalModal';

import ConfirmSwapModal from './ConfirmSwapModal';
import MarketStatsDebugToast from './MarketStatsDebugToast';
import SwapNativeToCurrencyModal from "./SwapNativeToCurrencyModal";
import PositionsTable from "./PositionsTable";
import { useSnapshotData } from '../../../hooks/useSnapshotData';
import MarketBalancePanel from "./MarketBalancePanel";
import PoolDataDisplay from "./PoolDataDisplay";
import SubgraphTradesDataLayer from "./SubgraphTradesDataLayer";
import { useYesNoPoolData } from '../../../hooks/usePoolData';
import dayjs from 'dayjs'; // Added dayjs import
// Import default configs as fallbacks
import {
  SWAP_CONFIG,
  MERGE_CONFIG as DEFAULT_MERGE_CONFIG,
  SPLIT_CONFIG,
  PRECISION_CONFIG,
  FUTARCHY_ROUTER_ADDRESS as DEFAULT_FUTARCHY_ROUTER_ADDRESS,
  MARKET_ADDRESS as DEFAULT_MARKET_ADDRESS,
  FUTARCHY_ROUTER_ABI,
  SDAI_CONTRACT_RATE,
  VAULT_RELAYER_ADDRESS,
  WRAPPER_SERVICE_ADDRESS,
  ERC20_ABI
} from "./constants/contracts";
import { BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG } from "../../../constants/addresses";
// Import the new useContractConfig hook
import { useContractConfig } from "../../../hooks/useContractConfig";
import { useChainValidation } from "../../../hooks/useChainValidation";
import { getRealityQuestionUrl } from '../../debug/constants/chainConfig';
import WrongNetworkModal from "../../common/WrongNetworkModal";
import { retryRpcCall } from '../../../utils/retryWithBackoff';
import CreatePoolModal from './CreatePoolModal';
// Subgraph-backed pool fetcher for latest prices (replaces SupabasePoolFetcher)
import { createSubgraphPoolFetcher } from "../../../utils/SubgraphPoolFetcher";
// POOL_CONFIG_THIRD is now available in useContractConfig

//lets import from contract.js 
import { UNISWAP_V3_POOL_ABI } from "./constants/contracts";
// Swap Configuration

// Subgraph pool fetcher instance for latest prices
const subgraphPoolFetcher = createSubgraphPoolFetcher();

const GNOSIS_DEFAULT_RPC = process.env.NEXT_PUBLIC_GNOSIS_RPC || 'https://rpc.gnosischain.com';
const ALGEBRA_TWAP_ABI = [
  "function getTimepoints(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulatives, uint112[] volatilityCumulatives, uint256[] volumePerAvgLiquiditys)",
  "function token0() external view returns (address)"
];
const DEFAULT_TWAP_DESCRIPTION = "The Futarchy Test is considered passed if the time-weighted average price (TWAP) of the \u201cpass\u201d (yes) outcome over the final 24 hours of the Issuance KIP\u2019s voting period is greater than or equal to that of the \u201cfail\u201d (no) outcome. If not, the proposal fails the futarchy test, regardless of the Kleros DAO vote result.";
const TWAP_REFRESH_INTERVAL_MS = 30000; // refresh every 30 seconds while active

const formatTwapValue = (value) => {
  if (value === null || typeof value === 'undefined' || Number.isNaN(value)) {
    return '—';
  }
  if (value === 0) return '0.0000';
  if (value >= 1) {
    return value.toFixed(4);
  }
  return value.toPrecision(4);
};

// Token ABI (unchanged, used by multiple features)
const WXDAI_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

// WXDAI Token Contract on Gnosis Chain
const DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS = DEFAULT_BASE_TOKENS_CONFIG.currency.address;
const DEFAULT_BASE_COMPANY_TOKEN_ADDRESS = DEFAULT_BASE_TOKENS_CONFIG.company.address;

// CoW Swap Settlement Contract
const COW_SETTLEMENT_ADDRESS = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

// SDAI Rate Provider ABI
const SDAI_RATE_PROVIDER_ABI = [
  {
    "inputs": [],
    "name": "getRate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// ConditionalTokens Contract
const CONDITIONAL_TOKENS_ADDRESS = "0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce";
const CONDITIONAL_TOKENS_ABI = [
  "function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] partition, uint amount) external",
  "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] partition, uint amount) external",
  "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint indexSet) external view returns (bytes32)",
  "function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function setApprovalForAll(address operator, bool approved) external"
];

// Add ERC1155 ABI
const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) external view returns (uint256[])"
];

// Function to get ERC1155 balance for a position
const getERC1155Balance = async (
  positionId,
  userAddress,
  provider
) => {
  try {
    const conditionalTokens = new ethers.Contract(
      CONDITIONAL_TOKENS_ADDRESS,
      ERC1155_ABI,
      provider
    );

    // Get balance for the position
    const balance = await conditionalTokens.balanceOf(userAddress, positionId);

    // Format the balance - ERC1155 tokens typically use 18 decimals like most ERC20s
    const formattedBalance = ethers.utils.formatEther(balance);

    return formattedBalance;
  } catch (error) {
    console.error('Error getting ERC1155 balance:', error);
    throw error;
  }
};

// Function to get multiple ERC1155 balances in batch
const getERC1155BatchBalances = async (
  positionIds,
  userAddress,
  provider
) => {
  try {
    const conditionalTokens = new ethers.Contract(
      CONDITIONAL_TOKENS_ADDRESS,
      ERC1155_ABI,
      provider
    );

    // Create arrays for batch query
    const accounts = Array(positionIds.length).fill(userAddress);

    // Get balances for all positions in one call
    const balances = await conditionalTokens.balanceOfBatch(accounts, positionIds);

    // Format all balances
    const formattedBalances = balances.map(balance => ethers.utils.formatEther(balance));

    return formattedBalances;
  } catch (error) {
    console.error('Error getting ERC1155 batch balances:', error);
    throw error;
  }
};



// Add these constants near the top with other constants



// Add FutarchyProposal ABI for checking market state
const FUTARCHY_PROPOSAL_ABI = [
  "function conditionId() external view returns (bytes32)",
  "function futarchyProposalParams() external view returns (tuple(uint256 startDate, uint256 tradingPeriod, uint256 challengePeriod, uint256 proposalBond, uint256 challengeBond, uint256 initialPriceForYes, uint256 initialPriceForNo))",
];

// Update the collateral token address to match the successful transaction
const COLLATERAL_TOKEN_ADDRESS = "0x2d373781cf8a9af9c05426261c6890872aaddd80";

// Add Sushiswap V2 constants after other constants
const SUSHISWAP_V2_FACTORY = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
const SUSHISWAP_V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];
const SUSHISWAP_V2_PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

const SUSHISWAP_V2_ROUTER = "0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55"; // V2 Legacy router


// Add at the top with other imports
import { useMarketPageViewModel } from './MarketPageShowcaseViewModel';

// Add this at the top with other imports
import { formatBalance } from '../../../utils/formatters';
import TripleChart from "@components/chart/TripleChart";
import SubgraphChart from "@components/chart/SubgraphChart";
import ChartParameters from './tripleChart/chartParameters/ChartParameters';
import useLatestPrices from '../../../hooks/useLatestPrices'; // Add this import at the top with other imports
import { getFormattedTrades, openTransactionInExplorer } from './MarketHistoryViewModel';
import { useTradeHistory } from './MarketHistoryViewModel';
import { useCurrency, useUpdateCurrencyFromConfig } from '../../../contexts/CurrencyContext'; // Import currency context hook
import { useSdaiRate } from '../../../hooks/useSdaiRate'; // Import sDAI rate hook
import { useBalanceManager } from '../../../hooks/useBalanceManager'; // Import centralized balance manager
import { useExternalSpotPrice } from '../../../hooks/useExternalSpotPrice'; // External spot price from CoinGecko
import { approvalAmountFor } from '../../../utils/approvalAmount';

// ---> Add CowSdk import <---
import { CowSdk } from '@gnosis.pm/cow-sdk';

// Add PendingOrderToast component
const PendingOrderToast = ({ count, userAddress }) => {
  // ---> Accept count and userAddress, return null if count is 0 <---
  if (!count || count === 0 || !userAddress) return null;

  // ---> Link to user's address page on CoW Explorer <---
  const explorerUrl = `https://explorer.cow.fi/gc/address/${userAddress}`;

  return (
    <div
      className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg border border-futarchyGray4 p-4 z-50 animate-slide-in-bottom"
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-futarchyOrange9 border-t-transparent rounded-full animate-spin" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            {/* ---> Show count in message <--- */}
            {count} Pending CoW Swap Order{count > 1 ? 's' : ''}
          </span>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-futarchyBlue11 hover:text-futarchyBlue9 underline"
            title="View your orders on CoW Explorer"
          >
            View Orders
          </a>
        </div>
      </div>
    </div>
  );
};

// Add new function for detailed balance checking


// Modify handleCowSwapTrade to use swapConfig


// Modify WxdaiSwapButton to include both implementations




// Modify SplitWrapButton to handle both YES and NO positions


// Add new SplitWrapWxdai component after WrapButton component




// Add ProcessingToast component
const ProcessingToast = ({ step, onToastClick }) => {
  const steps = {
    'split': 'Splitting Position...',
    'wrapYes': 'Wrapping YES Position...',
    'wrapNo': 'Wrapping NO Position...',
    'done': 'Operation Complete!'
  };

  return (
    <div
      onClick={onToastClick}
      className="fixed top-24 right-6 bg-white rounded-lg shadow-lg border border-futarchyGray4 p-4 z-50 cursor-pointer transform transition-transform hover:scale-102 animate-slide-in"
    >
      <div className="flex items-center gap-3">
        {step === 'done' ? (
          <div className="w-6 h-6 bg-futarchyEmerald3 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-futarchyEmerald11" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-futarchyGray12 border-t-transparent rounded-full animate-spin" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            {steps[step]}
          </span>
          <span className="text-xs text-futarchyGray11">
            Click to view details
          </span>
        </div>
      </div>
    </div>
  );
};

// Add SafeTransactionToast component
const SafeTransactionToast = ({ onClose }) => {
  return (
    <div
      className="fixed top-24 right-6 bg-white rounded-lg shadow-lg border border-futarchyGreen9 p-4 z-50 animate-slide-in cursor-pointer"
      onClick={onClose}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-futarchyGreen3 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-futarchyGreen11" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-futarchyGray12">
            Transaction Sent to Safe App
          </span>
          <span className="text-xs text-futarchyGray11 mt-1">
            Please check your Gnosis Safe app to sign and execute the transaction.
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-2 text-futarchyGray11 hover:text-futarchyGray12"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};





// Move BuyPassButton outside of MarketPageShowcase


// Add BuyFailButton component

// Add SellPassButton component


// Add SellFailButton component


// Add a Banner Timestamp component
const BannerTimestamp = ({ endTime, resolutionStatus }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const updateRemainingTime = () => {
      if (!endTime) {
        setRemainingTime("");
        return;
      }

      // Convert endTime to Unix timestamp (seconds)
      let endTimeSeconds;
      if (typeof endTime === 'string') {
        endTimeSeconds = new Date(endTime).getTime() / 1000;
      } else if (typeof endTime === 'number') {
        endTimeSeconds = endTime < 10000000000 ? endTime : endTime / 1000;
      } else {
        setRemainingTime("");
        return;
      }

      if (isNaN(endTimeSeconds)) {
        setRemainingTime("");
        return;
      }

      const now = Date.now() / 1000;
      const timeLeft = endTimeSeconds - now;
      const endDate = new Date(endTimeSeconds * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (timeLeft <= 0) {
        if (resolutionStatus !== 'open') {
          setRemainingTime(`Ended on: ${endDate}`);
        } else {
          setRemainingTime(`Open: ${endDate}`);
        }
      } else {
        const days = Math.floor(timeLeft / 86400);
        const hours = Math.floor((timeLeft % 86400) / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);

        let timeString = '';
        if (days > 0) timeString += `${days}d `;
        if (hours > 0 || days > 0) timeString += `${hours}h `;
        timeString += `${minutes}m`;

        setRemainingTime(`Remaining Time: ${timeString}`);
      }
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000);
    return () => clearInterval(interval);
  }, [endTime, resolutionStatus]);

  return remainingTime ? (
    <div className="py-1 px-2 bg-yellow-400/15 rounded-full text-yellow-400 text-sm leading-4 whitespace-nowrap text-center self-center items-center">
      {remainingTime}
    </div>
  ) : null;
};

const FormattedEndDate = ({ endTime2 }) => {
  const endTime = endTime2; // Use the actual parameter

  if (!endTime) {
    return null; // Or some fallback UI
  }

  let date;

  // Handle different date formats
  if (typeof endTime === 'string') {
    // ISO 8601 format (e.g., "2025-12-31T23:59:59Z")
    date = new Date(endTime);
  } else if (typeof endTime === 'number') {
    // Unix timestamp - could be seconds or milliseconds
    // If the number is small, it's likely seconds, otherwise milliseconds
    const timestamp = endTime < 10000000000 ? endTime * 1000 : endTime;
    date = new Date(timestamp);
  } else {
    return null;
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return null;
  }

  const formattedDate = date.toLocaleString('en-US', {
    month: 'long', // e.g., "June"
    day: 'numeric', // e.g., "14"
    year: 'numeric', // e.g., "2024"
    hour: 'numeric', // e.g., "5"
    minute: '2-digit', // e.g., "30"
    hour12: true // e.g., "PM"
  });

  return (
    <div className="flex flex-row mb-6">
      <div className="font-semibold text-lg mr-1">
        <span className="text-white">End Time: </span>
        <span className="text-yellow-400">{formattedDate}</span>
      </div>
    </div>
  );
};

// Add this spinner component before the TradeHistoryTable component
const Spinner = () => (
  <div className="flex justify-center items-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyBlue9"></div>
  </div>
);

// TWAP Countdown Component
const TwapCountdown = ({
  twapStartTimestamp,
  twapDurationHours = 24,
  twapDescription = DEFAULT_TWAP_DESCRIPTION,
  isScrolled,
  yesPoolConfig,
  noPoolConfig,
  invertTwapPoolYes = false,
  invertTwapPoolNo = false,
  yesCompanyTokenAddress = null,
  noCompanyTokenAddress = null
}) => {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timeUntilStart, setTimeUntilStart] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isWaitingToStart, setIsWaitingToStart] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [twapResults, setTwapResults] = useState({ yes: null, no: null, spread: null });
  const [twapLoading, setTwapLoading] = useState(false);
  const [twapError, setTwapError] = useState(null);
  const [lastTwapUpdate, setLastTwapUpdate] = useState(null);
  const providerRef = useRef(null);
  const poolToken0CacheRef = useRef({});

  const twapDurationSeconds = useMemo(() => Math.max(1, Math.floor(twapDurationHours * 60 * 60)), [twapDurationHours]);

  const ensureProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new ethers.providers.JsonRpcProvider(GNOSIS_DEFAULT_RPC);
    }
    return providerRef.current;
  }, []);

  const fetchPoolTwap = useCallback(async (poolConfig, secondsAgoStart, shouldInvert = null, secondsAgoEnd = 0, companyTokenAddress = null) => {
    if (!poolConfig?.address) {
      throw new Error('Missing pool address');
    }
    const aStart = Math.max(0, Math.floor(secondsAgoStart));
    const aEnd = Math.max(0, Math.floor(secondsAgoEnd));
    const secondsWindow = Math.max(1, aStart - aEnd);
    const provider = ensureProvider();
    const poolContract = new ethers.Contract(poolConfig.address, ALGEBRA_TWAP_ABI, provider);
    const { tickCumulatives } = await poolContract.getTimepoints([aStart, aEnd]);
    const oldest = BigInt(tickCumulatives[0].toString());
    const latest = BigInt(tickCumulatives[1].toString());
    const tickDelta = latest - oldest;
    const averageTick = Number(tickDelta) / secondsWindow;
    const rawPrice = Math.pow(1.0001, averageTick);

    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      throw new Error('Invalid price data');
    }

    // Authoritative inversion check: read token0 from the pool and compare it to the
    // conditional company token. Raw pool price = 1.0001^tick = token1/token0, so when
    // the company token is token0 the raw price is already currency-per-company and
    // must NOT be inverted. Metadata flags have been wrong before (Kleros KIP markets
    // shipped invertTwapPoolYes/No=true while PNK was token0), so on-chain token order
    // wins whenever we can determine it.
    let onChainInvert = null;
    if (companyTokenAddress) {
      try {
        const poolKey = poolConfig.address.toLowerCase();
        let token0 = poolToken0CacheRef.current[poolKey];
        if (!token0) {
          token0 = (await poolContract.token0()).toLowerCase();
          poolToken0CacheRef.current[poolKey] = token0;
        }
        onChainInvert = token0 !== companyTokenAddress.toLowerCase();
      } catch (err) {
        console.warn('[TWAP] token0() read failed, falling back to configured inversion:', err?.message);
      }
    }

    // Priority: on-chain token order > explicit inversion flag from metadata > tokenCompanySlot from pool config
    // shouldInvert is null when not set, so we can distinguish between "not set" and "set to false"
    const useInversion = onChainInvert !== null
      ? onChainInvert
      : (shouldInvert !== null
        ? shouldInvert
        : (typeof poolConfig.tokenCompanySlot === 'number' && poolConfig.tokenCompanySlot === 1));

    if (onChainInvert !== null && shouldInvert !== null && onChainInvert !== shouldInvert) {
      console.warn('[TWAP] Metadata inversion flag contradicts on-chain token order; using on-chain value', {
        pool: poolConfig.address,
        metadataInvert: shouldInvert,
        onChainInvert
      });
    }

    console.log('[TWAP] fetchPoolTwap:', {
      pool: poolConfig.address?.slice(0, 10),
      rawPrice: rawPrice.toFixed(4),
      shouldInvert,
      onChainInvert,
      tokenCompanySlot: poolConfig.tokenCompanySlot,
      useInversion
    });

    const normalizedPrice = useInversion ? 1 / rawPrice : rawPrice;
    return normalizedPrice;
  }, [ensureProvider]);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const endTime = twapStartTimestamp + twapDurationSeconds;
      const diffToEnd = endTime - now;
      const diffToStart = twapStartTimestamp - now;

      if (now < twapStartTimestamp) {
        setIsActive(false);
        setHasEnded(false);
        setIsWaitingToStart(true);
        const days = Math.floor(diffToStart / 86400);
        const hours = Math.floor((diffToStart % 86400) / 3600);
        const minutes = Math.floor((diffToStart % 3600) / 60);
        const seconds = diffToStart % 60;
        setTimeUntilStart({ days, hours, minutes, seconds });
        setTimeRemaining(null);
      } else if (diffToEnd > 0) {
        setIsActive(true);
        setHasEnded(false);
        setIsWaitingToStart(false);
        const hours = Math.floor(diffToEnd / 3600);
        const minutes = Math.floor((diffToEnd % 3600) / 60);
        const seconds = diffToEnd % 60;
        setTimeRemaining({ hours, minutes, seconds });
        setTimeUntilStart(null);
      } else {
        setIsActive(false);
        setHasEnded(true);
        setIsWaitingToStart(false);
        setTimeRemaining(null);
        setTimeUntilStart(null);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [twapStartTimestamp, twapDurationSeconds]);

  useEffect(() => {
    const shouldCalculateTwap = (isActive || hasEnded) && yesPoolConfig?.address && noPoolConfig?.address;

    if (!shouldCalculateTwap) {
      setTwapResults({ yes: null, no: null, spread: null });
      setTwapError(null);
      return;
    }

    let cancelled = false;

    const runCalculation = async () => {
      try {
        setTwapLoading(true);
        setTwapError(null);
        const now = Math.floor(Date.now() / 1000);
        const twapEndTimestamp = twapStartTimestamp + twapDurationSeconds;
        // Active: [twapStart..now]. Ended: historical [twapStart..twapEnd], not the trailing 24h.
        const secondsAgoStart = Math.max(1, now - twapStartTimestamp);
        const secondsAgoEnd = hasEnded ? Math.max(0, now - twapEndTimestamp) : 0;

        const [yesPrice, noPrice] = await Promise.all([
          fetchPoolTwap(yesPoolConfig, secondsAgoStart, invertTwapPoolYes, secondsAgoEnd, yesCompanyTokenAddress),
          fetchPoolTwap(noPoolConfig, secondsAgoStart, invertTwapPoolNo, secondsAgoEnd, noCompanyTokenAddress)
        ]);

        if (cancelled) return;

        setTwapResults({
          yes: yesPrice,
          no: noPrice,
          spread: Number.isFinite(yesPrice) && Number.isFinite(noPrice)
            ? yesPrice - noPrice
            : null
        });
        setLastTwapUpdate(new Date());
      } catch (err) {
        if (!cancelled) {
          console.error('[TWAP] Calculation failed:', err);
          setTwapError(err?.message || 'Unable to calculate TWAP');
        }
      } finally {
        if (!cancelled) {
          setTwapLoading(false);
        }
      }
    };

    runCalculation();
    const intervalId = hasEnded ? null : setInterval(runCalculation, TWAP_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive, hasEnded, twapStartTimestamp, twapDurationSeconds, yesPoolConfig, noPoolConfig, invertTwapPoolYes, invertTwapPoolNo, yesCompanyTokenAddress, noCompanyTokenAddress, fetchPoolTwap]);

  const { leaderboardText, percentDiff, leaderTheme } = useMemo(() => {
    if (twapResults.yes === null || twapResults.no === null) return { leaderboardText: null, percentDiff: null, leaderTheme: 'neutral' };

    const yes = parseFloat(twapResults.yes);
    const no = parseFloat(twapResults.no);
    const diff = Math.abs(yes - no);

    // If effectively tied
    if (diff < 1e-8) {
      return {
        leaderboardText: 'YES and NO are currently tied on TWAP.',
        percentDiff: '0.00',
        leaderTheme: 'neutral'
      };
    }

    if (yes > no) {
      const pct = no > 0 ? (diff / no) * 100 : 100;
      return {
        leaderboardText: 'YES outcome is ahead on TWAP.',
        percentDiff: `+${pct.toFixed(2)}`,
        leaderTheme: 'blue'
      };
    } else {
      const pct = yes > 0 ? (diff / yes) * 100 : 100;
      return {
        leaderboardText: 'NO outcome is ahead on TWAP.',
        percentDiff: `-${pct.toFixed(2)}`,
        leaderTheme: 'yellow'
      };
    }
  }, [twapResults]);

  // Determine colors based on state and leader
  const getThemeClasses = () => {
    if (isActive || hasEnded) {
      if (leaderTheme === 'blue') {
        return {
          container: 'bg-blue-500/10 border-blue-500/30 dark:bg-blue-400/10 dark:border-blue-400/30',
          pulse: 'bg-blue-500 animate-pulse',
          text: 'text-blue-600 dark:text-blue-400',
          subText: 'text-blue-700 dark:text-blue-300',
          desc: 'text-blue-600/70 dark:text-blue-400/70'
        };
      } else if (leaderTheme === 'yellow') {
        return {
          container: 'bg-yellow-500/10 border-yellow-500/30 dark:bg-yellow-400/10 dark:border-yellow-400/30',
          pulse: 'bg-yellow-500 animate-pulse',
          text: 'text-yellow-600 dark:text-yellow-400',
          subText: 'text-yellow-700 dark:text-yellow-300',
          desc: 'text-yellow-600/70 dark:text-yellow-400/70'
        };
      } else {
        // Neutral/Green for tie or complete
        return {
          container: 'bg-green-500/10 border-green-500/30 dark:bg-green-400/10 dark:border-green-400/30',
          pulse: 'bg-green-500 animate-pulse',
          text: 'text-green-600 dark:text-green-400',
          subText: 'text-green-700 dark:text-green-300',
          desc: 'text-green-600/70 dark:text-green-400/70'
        };
      }
    }

    if (isWaitingToStart) {
      return {
        container: 'bg-yellow-500/10 border-yellow-500/30 dark:bg-yellow-400/10 dark:border-yellow-400/30',
        pulse: 'bg-yellow-500 animate-pulse',
        text: 'text-yellow-600 dark:text-yellow-400',
        subText: 'text-yellow-700 dark:text-yellow-300',
        desc: 'text-yellow-600/70 dark:text-yellow-400/70'
      };
    }

    // Fallback
    return {
      container: 'bg-green-500/10 border-green-500/30 dark:bg-green-400/10 dark:border-green-400/30',
      pulse: 'bg-green-500',
      text: 'text-green-600 dark:text-green-400',
      subText: 'text-green-700 dark:text-green-300',
      desc: 'text-green-600/70 dark:text-green-400/70'
    };
  };

  const theme = getThemeClasses();

  const renderDescription = (colorClass) => (
    !isScrolled && twapDescription && showDetails && (
      <p className={`text-xs ${colorClass} mt-2`}>
        {twapDescription}
      </p>
    )
  );

  // Collapsed header label and timer value
  const headerLabel = isWaitingToStart ? 'TWAP Starts In'
    : isActive ? 'TWAP Active'
    : hasEnded ? 'TWAP Complete'
    : 'TWAP';

  const headerTimer = isWaitingToStart && timeUntilStart
    ? `${timeUntilStart.days > 0 ? `${timeUntilStart.days}d ` : ''}${String(timeUntilStart.hours).padStart(2, '0')}h ${String(timeUntilStart.minutes).padStart(2, '0')}m ${String(timeUntilStart.seconds).padStart(2, '0')}s`
    : isActive && timeRemaining
    ? `${String(timeRemaining.hours).padStart(2, '0')}h ${String(timeRemaining.minutes).padStart(2, '0')}m ${String(timeRemaining.seconds).padStart(2, '0')}s`
    : null;

  return (
    <div className={`${isScrolled ? 'mt-0' : 'mt-4'} rounded-lg border transition-all duration-300 ${theme.container}`}>
      {/* Collapsed header — always visible, click to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-2 lg:p-3 flex items-center gap-2 cursor-pointer text-left"
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.pulse}`} />
        <div className="flex-1 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${theme.text}`}>
              {headerLabel}
            </span>
            {percentDiff && (isActive || hasEnded) && (
              <span className={`text-xs font-bold ${theme.text}`}>
                ({percentDiff}%)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerTimer && (
              <span className={`text-xs font-mono ${theme.subText}`}>
                {headerTimer}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 ${theme.text} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expandable body */}
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-2 lg:px-3 pb-2 lg:pb-3 space-y-2">
            {/* Description */}
            {!isScrolled && twapDescription && (
              <p className={`text-xs ${theme.desc}`}>
                {twapDescription}
              </p>
            )}

            {/* TWAP values grid */}
            {(isActive || hasEnded) && yesPoolConfig?.address && noPoolConfig?.address && (
              <div className="rounded-md bg-white/5 dark:bg-white/10 p-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/70 dark:text-white/60">
                  <span>{hasEnded ? 'Final TWAP Window' : 'Live TWAP Window'}</span>
                  {lastTwapUpdate && (
                    <span className="text-white/50 dark:text-white/40">
                      Updated {lastTwapUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>

                {twapError ? (
                  <p className="mt-2 text-xs text-red-400 dark:text-red-300">{twapError}</p>
                ) : (
                  <>
                    {twapLoading && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/70 dark:text-white/60">
                        <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                        Calculating TWAP…
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-black/10 dark:bg-white/5 p-2">
                        <p className="text-white/60 dark:text-white/70">YES TWAP</p>
                        <p className="font-mono text-sm text-white dark:text-white">
                          {formatTwapValue(twapResults.yes)}
                        </p>
                      </div>
                      <div className="rounded-md bg-black/10 dark:bg-white/5 p-2">
                        <p className="text-white/60 dark:text-white/70">NO TWAP</p>
                        <p className="font-mono text-sm text-white dark:text-white">
                          {formatTwapValue(twapResults.no)}
                        </p>
                      </div>
                    </div>
                    {leaderboardText && (
                      <p className="mt-2 text-[11px] text-white/80 dark:text-white/70">
                        {leaderboardText}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Move TradeHistoryTable outside of MarketPageShowcase
// Update TradeHistoryTable to use TRADE_HISTORY_DATA
const TradeHistoryTable = React.memo(({ tokenImages = { company: null, currency: null }, config }) => {
  const [trades, setTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Rename hook variables to avoid conflict with local state
  const { trades: tradesFromHook, loading: loadingFromHook, error: errorFromHook, fetchTrades: fetchTradesFromHook } = useTradeHistory(config);
  const scrollContainerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const hasReceivedInitialHookData = useRef(false);

  // Add new state to prevent infinite retry loops
  const [hasAttemptedInitialLoad, setHasAttemptedInitialLoad] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const [forceShowData, setForceShowData] = useState(false);

  // Performance tracking
  const pipelineStartTime = useRef(null);

  //lets force after 1 second timeout re rneder compaone 

  //lets do it below


  // Get wallet connection state directly with different variable names
  const { address: walletAddress, isConnected: walletConnected } = useAccount();
  // Track previous connection state to detect changes
  const [prevConnected, setPrevConnected] = useState(walletConnected);
  const [prevAddress, setPrevAddress] = useState(walletAddress);

  // Track wallet connection changes and clear trades when wallet disconnects or address changes
  useEffect(() => {
    if (prevConnected && !walletConnected) {
      // Wallet was disconnected
      console.log('[TRADE_HISTORY_DEBUG] Wallet disconnected, clearing trades.');
      setTrades([]);
      setIsLoading(false);
      hasReceivedInitialHookData.current = false; // Reset for next connection
      setHasAttemptedInitialLoad(false); // Reset retry state
      setRetryCount(0);
      setForceShowData(false); // Reset force flag
    } else if (prevAddress && prevAddress !== walletAddress && walletConnected) {
      // Address changed while connected
      console.log('[TRADE_HISTORY_DEBUG] Wallet address changed, clearing trades and reloading.');
      setTrades([]);
      setIsLoading(true);
      hasReceivedInitialHookData.current = false; // Reset for new address
      setHasAttemptedInitialLoad(false); // Reset retry state
      setRetryCount(0);
      setForceShowData(false); // Reset force flag
      // loadTrades will be called by the useEffect that depends on loadTrades
    }

    setPrevConnected(walletConnected);
    setPrevAddress(walletAddress);
  }, [walletConnected, walletAddress, prevConnected, prevAddress]);

  // Debug log for hook data
  useEffect(() => {
    const hookDataChangeTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎣 HOOK: Hook data changed:', {
      tradesFromHook: tradesFromHook?.length,
      loadingFromHook,
      errorFromHook,
      hookLoadingChanged: loadingFromHook ? 'LOADING' : 'NOT_LOADING',
      timestamp: hookDataChangeTime.toFixed(2)
    });
  }, [tradesFromHook, loadingFromHook, errorFromHook]);

  // Debug log for loading states
  useEffect(() => {
    const stateChangeTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎛️ STATES: Loading states:', {
      isLoading,
      loadingFromHook,
      tradesLength: trades.length,
      hasAttemptedInitialLoad,
      retryCount,
      renderCondition: (isLoading || loadingFromHook),
      timestamp: stateChangeTime.toFixed(2)
    });
  }, [isLoading, loadingFromHook, trades.length, hasAttemptedInitialLoad, retryCount]);

  // Safety mechanism: Clear loading states if they're stuck but we have data
  useEffect(() => {
    if ((isLoading || loadingFromHook) && trades.length > 0) {
      console.log('[TRADE_HISTORY_DEBUG] Loading states stuck but we have trades! Force clearing loading states.');
      setIsLoading(false);
      setRetryCount(0);

      // Set a timer to force show data if hook loading state stays stuck
      const forceTimer = setTimeout(() => {
        if (loadingFromHook && trades.length > 0) {
          console.log('[TRADE_HISTORY_DEBUG] Hook loading stuck after 3 seconds - forcing data display');
          setForceShowData(true);
        }
      }, 3000);

      return () => clearTimeout(forceTimer);
    }
  }, [isLoading, loadingFromHook, trades.length]);

  // Add back the OutcomeBadge component
  const OutcomeBadge = ({ actionText, tradeType }) => { // Changed props
    // const [action, type] = outcome.split(' - '); // Removed this line

    // Define width classes to ensure consistent size
    const containerWidth = "w-[160px]";
    const halfWidth = "w-[80px]";

    return (
      <div className={`inline-flex overflow-hidden ${containerWidth}`}>
        {/* Yes/No part */}
        <div
          className={`${halfWidth} px-3 py-1 text-sm font-medium text-center ${actionText.toLowerCase() === 'yes' // Use actionText
            ? 'bg-futarchyBlue4 text-futarchyBlue11 border border-futarchyBlue6 rounded-l-full dark:bg-transparent dark:text-futarchyBlue9 dark:border-futarchyBlue9'
            : 'bg-futarchyGold4 text-futarchyGold11 border border-futarchyGold6 rounded-l-full dark:bg-transparent dark:text-futarchyGold7 dark:border-futarchyGold7'
            }`}
        >
          {actionText} {/* Use actionText */}
        </div>

        {/* Buy/Sell part */}
        <div
          className={`${halfWidth} px-3 py-1 text-sm font-medium text-center ${ // Ensure this line number matches if editing only this line, adjust context if needed
            (tradeType && tradeType.toLowerCase() === 'sell') // Use tradeType with a check
              ? 'bg-futarchyCrimson4 text-futarchyCrimson11 border border-futarchyCrimson6 rounded-r-full dark:bg-transparent dark:text-futarchyCrimson9 dark:border-futarchyCrimson9'
              : 'bg-futarchyTeal3 text-futarchyTeal9 border border-futarchyTeal5 rounded-r-full dark:bg-transparent dark:text-futarchyTeal7 dark:border-futarchyTeal7'
            }`}
        >
          {tradeType} {/* Use tradeType */}
        </div>
      </div>
    );
  };

  // Use useCallback to memoize the loadTrades function
  const loadTrades = useCallback(async (isInitialLoad = false) => {
    try {
      console.log(`[TRADE_HISTORY_DEBUG] loadTrades called. isInitialLoad: ${isInitialLoad}, walletConnected: ${walletConnected}, walletAddress: ${walletAddress}`);
      setIsLoading(true);

      // Check if wallet is connected before trying to fetch
      if (!walletConnected || !walletAddress) {
        console.log(`[TRADE_HISTORY_DEBUG] Wallet not connected or no address, skipping loadTrades. walletConnected: ${walletConnected}, walletAddress: ${walletAddress}`);
        setTrades([]);
        setIsLoading(false);
        setHasAttemptedInitialLoad(true); // Mark as attempted even if skipped
        return [];
      }

      // Mark that we've attempted initial load
      if (isInitialLoad) {
        setHasAttemptedInitialLoad(true);
      }

      // Fetch trades using the renamed fetchTradesFromHook
      // This initial fetch is still useful for hydration or if websockets fail
      // Start pipeline timing
      if (!pipelineStartTime.current) {
        pipelineStartTime.current = performance.now();
        console.log(`[TRADE_HISTORY_DEBUG] ⏱️ PIPELINE: Starting pipeline timer at ${pipelineStartTime.current.toFixed(2)}ms`);
      }

      console.log(`[TRADE_HISTORY_DEBUG] About to call fetchTradesFromHook for ${walletAddress}`);
      const rawTrades = await fetchTradesFromHook();
      console.log(`[TRADE_HISTORY_DEBUG] fetchTradesFromHook returned ${rawTrades?.length || 0} trades`);

      // If no trades returned but wallet is connected, this might be a timing issue
      if ((!rawTrades || rawTrades.length === 0) && walletConnected && walletAddress && isInitialLoad) {
        console.log(`[TRADE_HISTORY_DEBUG] No trades returned on initial load but wallet is connected. This might be a timing issue. Will retry.`);
        // Don't set empty trades immediately, let the hook's useEffect handle it
        setIsLoading(false);
        return [];
      }

      //const rawTrades =[];

      // Helper function to format small numbers
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      // Format timestamp for display
      const formatDisplayTimestamp = (timestampStr) => {
        // timestampStr is like "2025-05-28 11:40:25.000 UTC"
        // We want to display as "MM/DD HH:mm"
        return dayjs(timestampStr).format('MM/DD HH:mm');
      };

      const formattedTrades = rawTrades.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: formatDisplayTimestamp(trade.timestamp)
      }));
      const mockTrades = formattedTrades

      // Process mockTrades to include formatted fields, similar to how rawTrades would be processed
      const processedMockTrades = mockTrades.map(trade => ({
        ...trade,
        formattedTimestamp: formatDisplayTimestamp(trade.timestamp),
        isNew: false // For potential animation/highlighting
      }));

      console.log('DEBUG (TradeHistoryTable): Trades for display (from loadTrades):', processedMockTrades);
      setTrades(processedMockTrades); // Set the fully processed mock trades
      setRetryCount(0); // Reset retry count on successful trade load
      setIsLoading(false); // Set loading to false on successful load
      return processedMockTrades;
    } catch (err) {
      console.error('DEBUG (TradeHistoryTable): Error in loadTrades:', err);
      setError(err.message);
      setIsLoading(false); // Also set loading to false on error
      return [];
    }
  }, [fetchTradesFromHook, walletConnected, walletAddress, tokenImages]); // Added wallet state to dependencies

  // Effect to process and set trades when tradesFromHook changes (real-time updates)
  useEffect(() => {
    const uiProcessStartTime = performance.now();
    console.log('[TRADE_HISTORY_DEBUG] 🎨 UI: tradesFromHook changed, processing for UI update.');

    // If this is the first time we're getting data from the hook (initial load)
    if (tradesFromHook && tradesFromHook.length > 0 && !hasReceivedInitialHookData.current) {
      const initialDataProcessTime = performance.now();
      console.log('[TRADE_HISTORY_DEBUG] 📥 UI: Received initial data from hook, updating trades.');
      hasReceivedInitialHookData.current = true;

      // Format and set trades
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      const formatStartTime = performance.now();
      const formattedTradesFromHook = tradesFromHook.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: dayjs(trade.timestamp).format('MM/DD HH:mm')
      }));
      const formatEndTime = performance.now();

      console.log(`[TRADE_HISTORY_DEBUG] 🎛️ UI: Setting initial trades from hook: ${formattedTradesFromHook.length}. Format time: ${(formatEndTime - formatStartTime).toFixed(2)}ms`);
      const setUITradesStartTime = performance.now();
      setTrades(formattedTradesFromHook);
      setIsLoading(false);
      setRetryCount(0); // Reset retry count on successful data load
      setForceShowData(false); // Reset force flag since we have legitimate data
      const setUITradesEndTime = performance.now();

      // Calculate total pipeline time
      const totalPipelineTime = pipelineStartTime.current ? (setUITradesEndTime - pipelineStartTime.current) : 0;
      console.log(`[TRADE_HISTORY_DEBUG] ✨ UI: Initial trades set in UI. Set time: ${(setUITradesEndTime - setUITradesStartTime).toFixed(2)}ms`);
      console.log(`[TRADE_HISTORY_DEBUG] 🏁 PIPELINE: TOTAL TIME from start to UI: ${totalPipelineTime.toFixed(2)}ms`);

      // Reset pipeline timer
      pipelineStartTime.current = null;
    }
    // Only update local trades if tradesFromHook has actual data (for real-time updates)
    // Don't overwrite existing trades if tradesFromHook is empty
    else if (tradesFromHook && tradesFromHook.length > 0 && hasReceivedInitialHookData.current) {
      console.log('DEBUG (TradeHistoryTable): Real-time update detected, merging new trades.');

      // Helper function to format small numbers (can be moved to a utility if used elsewhere)
      const formatSmallNumber = (num) => {
        if (!num) return '0.000000';
        const value = Number(num);
        if (isNaN(value)) return '0.000000';
        if (value === 0) return '0.000000';
        if (value < 0.000001) return '<0.000001';
        return value.toFixed(6);
      };

      const formattedTradesFromHook = tradesFromHook.map(trade => ({
        ...trade,
        amounts: {
          in: {
            value: formatSmallNumber(trade.amounts.in.value),
            token: trade.amounts.in.token,
            image: tokenImages.currency
          },
          out: {
            value: formatSmallNumber(trade.amounts.out.value),
            token: trade.amounts.out.token,
            image: tokenImages.company
          }
        },
        price: parseFloat(trade.price).toFixed(2),
        formattedTimestamp: dayjs(trade.timestamp).format('MM/DD HH:mm')
      }));

      console.log('DEBUG (TradeHistoryTable): Processed trades from tradesFromHook for UI:', formattedTradesFromHook);

      // Instead of replacing all trades, merge with existing trades
      setTrades(prevTrades => {
        console.log('DEBUG (TradeHistoryTable): Current trades count:', prevTrades.length);
        console.log('DEBUG (TradeHistoryTable): New trades count from hook:', formattedTradesFromHook.length);

        // Check if we should replace entirely (if new trades list is significantly larger) 
        // or merge (if it's just a few new trades)
        if (formattedTradesFromHook.length > prevTrades.length) {
          // Likely a full refresh, replace entirely
          console.log('DEBUG (TradeHistoryTable): Full refresh detected, replacing all trades.');
          return formattedTradesFromHook;
        } else {
          // Likely new trades to add, merge them
          console.log('DEBUG (TradeHistoryTable): Merging new trades with existing trades.');

          // Create a map of existing trades by unique identifier
          const existingTradesMap = new Map();
          prevTrades.forEach(trade => {
            const key = `${trade.txHash}_${trade.eventId}`;
            existingTradesMap.set(key, trade);
          });

          // Add new trades that don't already exist
          const newTradesToAdd = [];
          formattedTradesFromHook.forEach(trade => {
            const key = `${trade.txHash}_${trade.eventId}`;
            if (!existingTradesMap.has(key)) {
              console.log('DEBUG (TradeHistoryTable): Adding new trade:', trade.txHash, trade.eventId);
              newTradesToAdd.push({ ...trade, isNew: true }); // Mark as new for potential highlighting
            } else {
              console.log('DEBUG (TradeHistoryTable): Trade already exists, skipping:', trade.txHash, trade.eventId);
            }
          });

          if (newTradesToAdd.length > 0) {
            // Merge and sort by timestamp (newest first)
            const mergedTrades = [...newTradesToAdd, ...prevTrades];
            mergedTrades.sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf());
            console.log('DEBUG (TradeHistoryTable): Merged trades total:', mergedTrades.length);
            setRetryCount(0); // Reset retry count when new trades are successfully added
            return mergedTrades;
          } else {
            console.log('DEBUG (TradeHistoryTable): No new trades to add.');
            return prevTrades;
          }
        }
      });
    } else if (tradesFromHook && tradesFromHook.length === 0 && !loadingFromHook) {
      // Only clear trades if hook is not loading and explicitly returned empty array
      // This could happen if user disconnects wallet or switches to account with no trades
      console.log('DEBUG (TradeHistoryTable): tradesFromHook is empty and not loading, this might be a wallet change.');
      hasReceivedInitialHookData.current = false; // Reset for next wallet connection
    } else {
      console.log('DEBUG (TradeHistoryTable): tradesFromHook is empty or undefined, keeping existing trades.');
    }

    // Always update error state if there's an error from the hook
    if (errorFromHook) {
      setError(errorFromHook);
    }
  }, [tradesFromHook, tokenImages, loadingFromHook, errorFromHook]);

  // Initial load of trades - only if hook hasn't provided data yet
  useEffect(() => {
    if (!hasReceivedInitialHookData.current && walletConnected && walletAddress && !loadingFromHook) {
      console.log('DEBUG (TradeHistoryTable): Initial loadTrades call from useEffect (hook has no data yet).');
      loadTrades(true); // Pass true for initial load
    } else {
      console.log('DEBUG (TradeHistoryTable): Skipping manual loadTrades - hook is handling it.', {
        hasReceivedInitialHookData: hasReceivedInitialHookData.current,
        walletConnected,
        walletAddress: !!walletAddress,
        loadingFromHook
      });
    }
  }, [loadTrades, hasReceivedInitialHookData, walletConnected, walletAddress, loadingFromHook]); // loadTrades is memoized

  // Add a separate effect to retry loading trades if initial load failed but wallet is connected
  useEffect(() => {
    if (walletConnected && walletAddress && trades.length === 0 && !isLoading && hasAttemptedInitialLoad && retryCount < MAX_RETRIES) {
      console.log(`[TRADE_HISTORY_DEBUG] Wallet connected but no trades displayed. Setting up retry timer. Retry count: ${retryCount}/${MAX_RETRIES}`);

      const retryTimeout = setTimeout(() => {
        console.log(`[TRADE_HISTORY_DEBUG] Retry timer triggered - attempting to reload trades. Retry: ${retryCount + 1}/${MAX_RETRIES}`);
        setRetryCount(prev => prev + 1);
        loadTrades(false); // Retry as non-initial load
      }, 2000 + (retryCount * 1000)); // Progressive delay: 2s, 3s, 4s

      return () => {
        console.log('DEBUG (TradeHistoryTable): Clearing retry timeout.');
        clearTimeout(retryTimeout);
      };
    }
  }, [walletConnected, walletAddress, trades.length, isLoading, loadTrades, hasAttemptedInitialLoad, retryCount, MAX_RETRIES]);

  // Add periodic refresh (every 30 seconds) when connected
  useEffect(() => {
    if (walletConnected && walletAddress) {
      const interval = setInterval(() => {
        console.log('DEBUG (TradeHistoryTable): Periodic trades refresh (calling loadTrades).');
        loadTrades(); // This will call fetchTradesFromHook
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [walletConnected, walletAddress, loadTrades]);

  // Add these handlers to the TradeHistoryTable component
  const handleWheel = (e) => {
    e.preventDefault(); // Prevent page scroll
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTop += e.deltaY;
  };

  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
    setScrollTop(scrollContainerRef.current.scrollTop);
  };

  const handleTouchMove = (e) => {
    e.preventDefault(); // Prevent page scroll on mobile
    const touch = e.touches[0];
    const container = scrollContainerRef.current;
    if (!container) return;

    const deltaY = touch.clientY - startY;
    container.scrollTop = scrollTop - deltaY;
  };

  // Add this SVG component at the top of TradeHistoryTable
  const ExternalLinkIcon = () => (
    <svg
      className="w-4 h-4 text-black dark:text-white hover:text-futarchyGray11 dark:hover:text-futarchyGray5 transition-colors"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-futarchyGray62 dark:border-futarchyDarkGray42">
      {/* Header */}
      <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-futarchyGray62 dark:border-futarchyDarkGray42 dark:bg-futarchyDarkGray3 h-[60px]">
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[200px]">Outcome</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-left px-4 w-[180px]">Amount</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[100px]">Price</th>
              <th className="text-xs text-futarchyGray11 dark:text-futarchyGray112 font-semibold text-right px-4 w-[220px]">Date</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Scrollable body with fade effect */}
      <div className="relative">
        {!walletConnected ? (
          <div className="py-8 text-center text-futarchyGray11">
            Connect wallet to view trade history
          </div>
        ) : (isLoading || (loadingFromHook && trades.length === 0 && !forceShowData)) ? (
          <div className="py-8 text-center text-futarchyGray11">
            {retryCount > 0 ? `Retrying... (${retryCount}/${MAX_RETRIES})` : 'Loading trades...'}
            {SHOW_DATA_DEBUG && <div className="text-xs mt-1 text-futarchyGray8">
              Local: {isLoading ? 'loading' : 'ready'} | Hook: {loadingFromHook ? 'loading' : 'ready'} | Trades: {trades.length} | Force: {forceShowData ? 'yes' : 'no'}
            </div>}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-futarchyCrimson11">
            Error loading trades: {error}
            {retryCount >= MAX_RETRIES && (
              <div className="text-xs mt-2">
                Max retries reached. Try switching tabs or refreshing the page.
              </div>
            )}
          </div>
        ) : trades.length === 0 ? (
          <div className="py-8 text-center text-futarchyGray11">
            {retryCount >= MAX_RETRIES ? (
              <div>
                <div>No trades found</div>
                <div className="text-xs mt-2 text-futarchyGray8">
                  Try switching tabs or refreshing the page if this persists.
                </div>
              </div>
            ) : (
              <Spinner />
            )}
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto overscroll-contain scroll-smooth"
            style={{
              height: '181px', // 60px * 3 rows + 1px border bottom for each row
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              scrollBehavior: 'smooth',
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const renderStartTime = performance.now();
              console.log(`[TRADE_HISTORY_DEBUG] 🖼️ RENDER: Starting to render ${trades.length} trades at ${renderStartTime.toFixed(2)}ms`);
              return null;
            })()}
            <table className="w-full">
              <tbody>

                {trades.map((trade, index) => (
                  <tr
                    key={`trade-${index}-${trade.txHash}`}
                    className="border-b border-futarchyGray62 dark:border-futarchyDarkGray42 hover:bg-futarchyGray3 dark:hover:bg-futarchyGray3/20 transition-colors h-[60px]"
                  >
                    <td className="px-4 w-[200px]">
                      <OutcomeBadge actionText={trade.outcome} tradeType={trade.type} />
                    </td>
                    <td className="px-4 w-[180px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                          {/* Image removed */}
                          {`${trade.amounts.in.value} ${trade.amounts.in.token}`}
                          <span className="text-futarchyTeal7 ml-1">in</span>
                        </span>
                        <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 whitespace-nowrap flex items-center">
                          {/* Image removed */}
                          {`${trade.amounts.out.value} ${trade.amounts.out.token}`}
                          <span className="text-futarchyCrimson9 ml-1">out</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 w-[100px] text-right">
                      <span className="text-xs text-futarchyGray12 dark:text-futarchyGray112 block">{trade.price}</span>
                    </td>
                    <td className="px-4 w-[220px]">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">{trade.formattedTimestamp}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTransactionInExplorer(trade.txHash, config);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-futarchyGray4 dark:hover:bg-futarchyGray3/45 transition-colors"
                          title="View on Block Explorer"
                        >
                          <ExternalLinkIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if tokenImages or config change
  return JSON.stringify(prevProps.tokenImages) === JSON.stringify(nextProps.tokenImages) &&
    JSON.stringify(prevProps.config) === JSON.stringify(nextProps.config);
});

// PriceHeader component for mobile price display
const PriceHeader = ({ yesPrice, noPrice, currencySymbol }) => (
  <div className="fixed top-20 left-0 right-0 z-40 lg:hidden h-12">
    <div className="hidden bg-futarchyDarkGray3/95 backdrop-blur-sm h-full flex items-center">
      <div className="container mx-auto px-5 flex justify-between items-center">
        <h2 className="text-sm text-white font-semibold pr-4">Market Prices</h2>
        <div className="flex gap-3 text-sm flex-shrink-0">
          <span className="text-futarchyBlue9">YES: {yesPrice === null || yesPrice === undefined ? 'N/A' : `${yesPrice.toFixed(4)} ${currencySymbol}`}</span>
          <span className="text-futarchyGold8">NO: {noPrice === null || noPrice === undefined ? 'N/A' : `${noPrice.toFixed(4)} ${currencySymbol}`}</span>
        </div>
      </div>
    </div>
  </div>
);

const YourViewCard = ({ subject }) => (
  <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
    <div className="px-4 py-3 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
      <h3 className="font-oxanium text-sm font-semibold text-futarchyGray12 dark:text-white">
        Your view on {subject}
      </h3>
    </div>
    <div className="px-4 py-3">
      <table className="w-full table-fixed font-oxanium text-xs text-center">
        <thead>
          <tr className="text-futarchyGray11 dark:text-white/60">
            <th className="pb-2 text-left font-medium" />
            <th className="pb-2 font-medium">If YES</th>
            <th className="pb-2 font-medium">If NO</th>
          </tr>
        </thead>
        <tbody className="text-futarchyGray12 dark:text-white">
          <tr className="border-t border-futarchyGray62 dark:border-futarchyGray11/50">
            <th scope="row" className="py-2 text-left font-medium">
              <span className="inline-block w-2 h-2 mr-2 rounded-full bg-futarchyTeal9" />Bullish
            </th>
            <td className="py-2 font-semibold text-futarchyTeal9">BUY</td>
            <td className="py-2 font-semibold text-futarchyCrimson9">SELL</td>
          </tr>
          <tr className="border-t border-futarchyGray62 dark:border-futarchyGray11/50">
            <th scope="row" className="py-2 text-left font-medium">
              <span className="inline-block w-2 h-2 mr-2 rounded-full bg-futarchyCrimson9" />Bearish
            </th>
            <td className="py-2 font-semibold text-futarchyCrimson9">SELL</td>
            <td className="py-2 font-semibold text-futarchyTeal9">BUY</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

// Add this new component before the MarketPageShowcase component
const PredictionMarketModal = ({ isOpen, onClose, config }) => {
  if (!isOpen || !config) return null;

  const baseToken = config?.BASE_TOKENS_CONFIG?.currency;
  const yesTokenAddress = config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress;
  const noTokenAddress = config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress;

  const baseAddress = baseToken?.address;
  const baseSymbol = baseToken?.symbol || 'Base';

  const createSwapUrl = (inputToken, outputToken) => {
    if (!inputToken || !outputToken) return null;

    if (config?.chainId === 1) {
      return `https://app.uniswap.org/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
    }

    return `https://v3.swapr.eth.limo/#/swap?inputCurrency=${inputToken}&outputCurrency=${outputToken}`;
  };

  const poolLinks = [
    yesTokenAddress && baseAddress ? {
      title: `YES ${baseSymbol} Pool`,
      description: `Trade ${baseSymbol} ↔ YES ${baseSymbol}`,
      href: createSwapUrl(baseAddress, yesTokenAddress)
    } : null,
    noTokenAddress && baseAddress ? {
      title: `NO ${baseSymbol} Pool`,
      description: `Trade ${baseSymbol} ↔ NO ${baseSymbol}`,
      href: createSwapUrl(baseAddress, noTokenAddress)
    } : null
  ].filter(Boolean);

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <motion.div
        className="bg-white dark:bg-futarchyDarkGray3 dark:border dark:border-futarchyGray112/20 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-futarchyGray12 dark:text-futarchyGray3">Prediction Market</h2>
          <button
            onClick={onClose}
            className="text-futarchyGray11 hover:text-futarchyGray12 dark:text-futarchyGray112 dark:hover:text-futarchyGray3 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-futarchyGray11 dark:text-futarchyGray112 mb-6">
          Choose a pool to trade YES or NO tokens against {baseSymbol}. Links open the appropriate swap interface in a new tab.
        </div>

        <div className="space-y-2">
          {poolLinks.map((pool, index) => (
            <a
              key={index}
              href={pool.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray5 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">{pool.title}</span>
                  <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mt-1">{pool.description}</p>
                </div>
                <svg className="w-4 h-4 text-futarchyGray11 dark:text-futarchyGray112" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>

        {poolLinks.length === 0 && (
          <div className="text-center text-futarchyGray11 dark:text-futarchyGray112 py-8">
            Prediction market pools are not configured for this market.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// AddLiquidityModal has been moved to its own file
import AddLiquidityModal from './AddLiquidityModal';

// Results Breakdown Component for Snapshot Widget - Matches exact design from screenshot
const ResultsBreakdown = ({ items = [], totalCount = 0, quorumPercent = null, title = "VOTING RESULTS" }) => {
  // Helper to get border and background colors based on colorKey
  const getItemColors = (colorKey) => {
    const colorMap = {
      success: {
        border: 'border-futarchyTeal7',
        ring: 'ring-futarchyTeal7/60',
        bgFill: 'bg-futarchyTeal7/50 dark:bg-futarchyTeal7/35',
        iconBg: 'bg-futarchyTeal7/20 dark:bg-futarchyTeal7/35',
        iconRing: 'ring-futarchyTeal7/50',
        iconColor: 'text-futarchyTeal11 dark:text-futarchyTeal11', // Lighter teal for better visibility
        percentColor: 'text-futarchyTeal9',
      },
      danger: {
        border: 'border-futarchyCrimson7',
        ring: 'ring-futarchyCrimson7/60',
        bgFill: 'bg-futarchyCrimson7/50 dark:bg-futarchyCrimson7/35',
        iconBg: 'bg-futarchyCrimson7/20 dark:bg-futarchyCrimson7/35',
        iconRing: 'ring-futarchyCrimson7/50',
        iconColor: 'text-futarchyCrimson9',
        percentColor: 'text-futarchyCrimson9',
      },
      neutral: {
        border: 'border-futarchyGray62',
        ring: 'ring-futarchyGray62/70',
        bgFill: 'bg-futarchyGray112/60 dark:bg-futarchyGray112/45',
        iconBg: 'bg-futarchyGray112/40 dark:bg-white/15',
        iconRing: 'ring-futarchyGray62/60',
        iconColor: 'text-futarchyGray11 dark:text-futarchyGray122',
        percentColor: 'text-futarchyGray11 dark:text-futarchyGray112',
      },
    };
    return colorMap[colorKey] || colorMap.neutral;
  };

  // Helper to format count (e.g., 1300000000 → "1.3B", 1300000 → "1.3M", 47100 → "47.1k", 5000 → "5k")
  const formatCount = (count) => {
    if (count >= 1000000000) {
      const formatted = (count / 1000000000).toFixed(1);
      // Remove .0 if it's a whole number (1.0B → 1B)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'B' : formatted + 'B';
    } else if (count >= 1000000) {
      const formatted = (count / 1000000).toFixed(1);
      // Remove .0 if it's a whole number (1.0M → 1M)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'M' : formatted + 'M';
    } else if (count >= 1000) {
      const formatted = (count / 1000).toFixed(1);
      // Remove .0 if it's a whole number (5.0k → 5k)
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'k' : formatted + 'k';
    }
    return count.toLocaleString();
  };

  // Helper to parse percentage string to number (e.g., "67.57%" → 67.57)
  const parsePercentage = (percentageStr) => {
    if (typeof percentageStr === 'number') return percentageStr;
    return parseFloat(percentageStr.replace('%', ''));
  };

  return (
    <section className="w-full max-w-xl select-none font-oxanium" aria-labelledby="results-title">
      {/* Header with Snapshot Icon */}
      <div className="flex items-center gap-2 mb-3">
        <svg viewBox="0 0 105 126" aria-hidden="true" className="h-5 w-5 text-futarchyTeal9 dark:text-futarchyTeal7" fill="#FFAC33" xmlns="http://www.w3.org/2000/svg">
          <path d="M104.781694,54.7785 C104.270697,53.41 102.961707,52.5 101.498717,52.5 L59.2365129,52.5 L83.6138421,5.103 C84.3803368,3.612 83.9848395,1.7885 82.6653488,0.7525 C82.0283532,0.2485 81.2618586,0 80.498864,0 C79.6833697,0 78.8678754,0.287 78.21338,0.8505 L52.4990602,23.058 L1.21391953,67.3505 C0.107927276,68.306 -0.291069928,69.8495 0.219926491,71.218 C0.730922911,72.5865 2.03641376,73.5 3.49940351,73.5 L45.7616074,73.5 L21.3842782,120.897 C20.6177836,122.388 21.0132808,124.2115 22.3327715,125.2475 C22.9697671,125.7515 23.7362617,126 24.4992564,126 C25.3147506,126 26.1302449,125.713 26.7847403,125.1495 L52.4990602,102.942 L103.784201,58.6495 C104.893693,57.694 105.28919,56.1505 104.781694,54.7785 L104.781694,54.7785 Z" />
        </svg>
        <h2 id="results-title" className="text-sm tracking-wide text-futarchyGray11 dark:text-futarchyGray112">
          {title}
        </h2>
      </div>

      {/* Results List */}
      <div className="space-y-3">
        {items.map((item, index) => {
          const colors = getItemColors(item.colorKey);
          const percentageNum = parsePercentage(item.percentage);

          return (
            <div
              key={index}
              className={`relative overflow-hidden rounded-2xl border-2 ${colors.border} ring-1 ring-inset ${colors.ring} bg-transparent`}
              role="group"
              aria-label={`${item.label} ${item.percentage}`}
            >
              {/* Background fill bar */}
              <div
                className={`absolute inset-y-0 left-0 ${colors.bgFill}`}
                aria-hidden="true"
                style={{ width: `${percentageNum}%` }}
              />

              {/* Shine effect on hover */}
              <div className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-futarchyGray1/15 dark:via-white/10 to-transparent pointer-events-none"></div>

              {/* Content */}
              <div className="relative z-10 flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Icon circle */}
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${colors.iconBg} ring-1 ring-inset ${colors.iconRing}`}
                    aria-hidden="true"
                  >
                    <span className={colors.iconColor}>{item.icon}</span>
                  </span>

                  {/* Label */}
                  <span className="text-base font-medium text-futarchyGray12 dark:text-futarchyGray3 shadow-[0_0_1px_rgba(0,0,0,0.25)] dark:shadow-[0_0_1px_rgba(255,255,255,0.15)]">
                    {item.label}
                  </span>
                </div>

                {/* Count and Percentage */}
                <div className="flex items-baseline gap-3 tabular-nums">
                  <span className="text-sm text-futarchyGray11 dark:text-futarchyGray112">
                    {formatCount(item.count)}
                  </span>
                  <span className={`text-sm font-semibold ${colors.percentColor}`}>
                    {item.percentage}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quorum */}
      {quorumPercent !== null && (
        <p className="mt-4 text-sm text-futarchyGray11 dark:text-futarchyGray112">
          <span className="opacity-70">Quorum:</span>{' '}
          <span className="font-medium">{quorumPercent}</span>
        </p>
      )}
    </section>
  );
};

// Snapshot Results Widget Component
const SnapshotWidget = ({
  snapshotData,
  snapshotLoading,
  snapshotSource,
  snapshotProposalId,
  snapshotHighestResult
}) => {
  const [isWidgetExpanded, setIsWidgetExpanded] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // SVG Icon Components
  const CheckIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );

  const XIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  const LineIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
    </svg>
  );

  const renderIcon = (iconType) => {
    switch (iconType) {
      case 'check': return CheckIcon;
      case 'x': return XIcon;
      case 'line': return LineIcon;
      default: return null;
    }
  };

  // Use Snapshot data or fallback
  const snapshotResultsData = useMemo(() => {
    if (snapshotData && snapshotData.items) {
      return {
        items: snapshotData.items.map(item => ({
          ...item,
          icon: renderIcon(item.iconType),
        })),
        totalCount: snapshotData.totalCount,
        quorumPercent: snapshotData.quorumPercent,
      };
    }
    return null;
  }, [snapshotData]);

  const resultsWithPercentages = useMemo(() => {
    return snapshotResultsData?.items || [];
  }, [snapshotResultsData]);

  // Cycle through results
  useEffect(() => {
    if (!resultsWithPercentages.length) return;
    const intervalId = setInterval(() => {
      setCurrentResultIndex(prev => (prev + 1) % resultsWithPercentages.length);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [resultsWithPercentages]);

  const currentResult = resultsWithPercentages[currentResultIndex];

  // Color classes
  const getColorClasses = (colorKey) => {
    const colorMap = {
      success: {
        bg: 'bg-futarchyTeal7/20 dark:bg-futarchyTeal7/10',
        text: 'text-futarchyTeal11 dark:text-futarchyTeal9',
        icon: 'text-futarchyTeal11 dark:text-futarchyTeal7',
        border: 'border-futarchyTeal9',
      },
      danger: {
        bg: 'bg-futarchyCrimson7/20 dark:bg-futarchyCrimson7/10',
        text: 'text-futarchyCrimson11 dark:text-futarchyCrimson9',
        icon: 'text-futarchyCrimson11 dark:text-futarchyCrimson7',
        border: 'border-futarchyCrimson9',
      },
      neutral: {
        bg: 'bg-futarchyGray7/20 dark:bg-futarchyGray7/10',
        text: 'text-futarchyGray11 dark:text-white',
        icon: 'text-futarchyGray11 dark:text-futarchyGray7',
        border: 'border-futarchyGray11 dark:border-white',
      },
    };
    return colorMap[colorKey] || colorMap.neutral;
  };

  const colorClasses = currentResult ? getColorClasses(currentResult.colorKey) : getColorClasses('neutral');

  // Generate Snapshot proposal URL
  const snapshotProposalUrl = useMemo(() => {
    if (!snapshotProposalId) return null;
    const spaceId = snapshotData?.spaceId || 'gnosis.eth';
    return `https://snapshot.box/#/s:${spaceId}/proposal/${snapshotProposalId}`;
  }, [snapshotProposalId, snapshotData]);

  // Don't show widget if no data
  if (!snapshotResultsData) return null;

  // Check if proposal has ended
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const proposalEnd = snapshotData?.end;
  const proposalState = snapshotData?.state; // "active", "closed", "pending"
  const isProposalClosed = proposalState === 'closed' || (proposalEnd && currentTime >= proposalEnd);

  // Border color logic
  // If closed: use approved (green) or rejected (red) border
  // If active: use currently cycling result color
  let buttonBorderColor;
  if (isProposalClosed && snapshotData?.proposalApproved !== null) {
    buttonBorderColor = snapshotData.proposalApproved
      ? 'border-futarchyTeal9' // Approved = green
      : 'border-futarchyCrimson9'; // Rejected = red
  } else {
    // Active proposal: use cycling result color
    buttonBorderColor = currentResult ? getColorClasses(currentResult.colorKey).border : 'border-futarchyGray11 dark:border-white';
  }

  return (
    <div
      className="fixed z-50 transition-all duration-300 ease-in-out left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0"
      style={{
        bottom: '24px',
        ...(typeof window !== 'undefined' && window.innerWidth >= 768 ? { left: '24px' } : {}),
      }}
    >
      {/* Expanded Container - Only show if proposal is still active */}
      {isWidgetExpanded && !isProposalClosed && (
        <div className="bg-futarchyGray2 dark:bg-futarchyDarkGray2 rounded-3xl shadow-2xl backdrop-blur-sm border-2 border-futarchyGray62 dark:border-futarchyGray11/70 w-[95vw] md:w-[90vw] max-w-md animate-fadeIn mb-2 md:mb-3">
          <div className="p-3 md:p-4 max-h-[75vh] md:max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2 md:mb-3">
              <div className="flex items-center gap-2">
                {snapshotProposalUrl ? (
                  <a href={snapshotProposalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                    <h3 className="text-base md:text-lg font-semibold text-black dark:text-futarchyGray112 group-hover:text-black/80 dark:group-hover:text-white/80 font-oxanium transition-colors">
                      Snapshot Results
                    </h3>
                    <svg className="w-4 h-4 md:w-5 md:h-5 text-black/60 dark:text-white/60 group-hover:text-black dark:group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <h3 className="text-base md:text-lg font-semibold text-black dark:text-futarchyGray112 font-oxanium">Snapshot Results</h3>
                )}
              </div>
              <button onClick={() => setIsWidgetExpanded(false)} className="text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors" aria-label="Close snapshot results">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Snapshot Description */}
            <div className="mb-3 md:mb-4 pb-3 border-b border-futarchyGray62 dark:border-futarchyGray11/30">
              <p className="text-xs md:text-sm text-black/70 dark:text-white/70 leading-relaxed mb-2">
                Snapshot is a voting platform that allows DAOs, DeFi protocols, or NFT communities to vote easily and without gas fees.
              </p>
              <a href="https://snapshot.box/" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors inline-flex items-center gap-1 font-medium">
                Learn more about Snapshot
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <ResultsBreakdown
              items={snapshotResultsData.items}
              totalCount={snapshotResultsData.totalCount}
              quorumPercent={snapshotResultsData.quorumPercent}
              title="VOTING RESULTS"
            />
          </div>
        </div>
      )}

      {/* Floating Button */}
      {/* If proposal is closed, clicking goes to Snapshot page; if active, expands widget */}
      {isProposalClosed ? (
        <a
          href={snapshotProposalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`bg-futarchyGray2 dark:bg-futarchyDarkGray2 dark:text-white text-futarchyDarkGray3 font-oxanium font-semibold rounded-full transition-all duration-300 ease-in-out flex items-center justify-center border-2 ${buttonBorderColor} h-[48px] md:h-[52px] w-full md:w-[320px] px-3 pr-4 md:px-5 md:pr-6 gap-2 md:gap-3 hover:scale-105 active:scale-95`}
          aria-label="View final results on Snapshot"
        >
          <svg className="flex-shrink-0 transition-all duration-300 w-4 h-4 md:w-5 md:h-5" viewBox="0 0 105 126" fill="#FFAC33" xmlns="http://www.w3.org/2000/svg">
            <path d="M104.781694,54.7785 C104.270697,53.41 102.961707,52.5 101.498717,52.5 L59.2365129,52.5 L83.6138421,5.103 C84.3803368,3.612 83.9848395,1.7885 82.6653488,0.7525 C82.0283532,0.2485 81.2618586,0 80.498864,0 C79.6833697,0 78.8678754,0.287 78.21338,0.8505 L52.4990602,23.058 L1.21391953,67.3505 C0.107927276,68.306 -0.291069928,69.8495 0.219926491,71.218 C0.730922911,72.5865 2.03641376,73.5 3.49940351,73.5 L45.7616074,73.5 L21.3842782,120.897 C20.6177836,122.388 21.0132808,124.2115 22.3327715,125.2475 C22.9697671,125.7515 23.7362617,126 24.4992564,126 C25.3147506,126 26.1302449,125.713 26.7847403,125.1495 L52.4990602,102.942 L103.784201,58.6495 C104.893693,57.694 105.28919,56.1505 104.781694,54.7785 L104.781694,54.7785 Z" />
          </svg>

          <span className="text-xs md:text-sm whitespace-nowrap flex-shrink-0">
            Final Result
            {SHOW_DATA_DEBUG && snapshotSource === 'api' && (
              <span className="ml-1 text-[10px] text-futarchyViolet9 dark:text-futarchyViolet7">●</span>
            )}
          </span>

          {/* Show winning result - use proposalApproved to determine color */}
          {!snapshotLoading && snapshotData && (
            <div className="ml-auto flex items-center gap-1.5 md:gap-2">
              {snapshotData.proposalApproved === true ? (
                // APPROVED - Futarchy Green
                <div className="bg-futarchyTeal7/20 dark:bg-futarchyTeal7/10 rounded-full px-2 py-1 md:px-3 md:py-1.5 flex items-center gap-1.5 md:gap-2 transition-all duration-300">
                  <span className="flex items-center justify-center text-futarchyTeal11 dark:text-futarchyTeal7">
                    {CheckIcon}
                  </span>
                  <span className="text-xs md:text-sm font-bold tabular-nums text-futarchyTeal11 dark:text-futarchyTeal9">
                    APPROVED
                  </span>
                </div>
              ) : snapshotData.proposalApproved === false ? (
                // REJECTED - Futarchy Red
                <div className="bg-futarchyCrimson7/20 dark:bg-futarchyCrimson7/10 rounded-full px-2 py-1 md:px-3 md:py-1.5 flex items-center gap-1.5 md:gap-2 transition-all duration-300">
                  <span className="flex items-center justify-center text-futarchyCrimson11 dark:text-futarchyCrimson7">
                    {XIcon}
                  </span>
                  <span className="text-xs md:text-sm font-bold tabular-nums text-futarchyCrimson11 dark:text-futarchyCrimson9">
                    REJECTED
                  </span>
                </div>
              ) : snapshotHighestResult ? (
                // Fallback to highest result if proposalApproved is null
                <div className={`${getColorClasses(snapshotHighestResult.colorKey).bg} rounded-full px-2 py-1 md:px-3 md:py-1.5 flex items-center gap-1.5 md:gap-2 transition-all duration-300`}>
                  <span className={`flex items-center justify-center ${getColorClasses(snapshotHighestResult.colorKey).icon}`}>
                    {renderIcon(snapshotHighestResult.iconType)}
                  </span>
                  <span className={`text-xs md:text-sm font-bold tabular-nums ${getColorClasses(snapshotHighestResult.colorKey).text}`}>
                    {snapshotHighestResult.percentage}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </a>
      ) : (
        <button
          onClick={() => setIsWidgetExpanded(!isWidgetExpanded)}
          className={`bg-futarchyGray2 dark:bg-futarchyDarkGray2 dark:text-white text-futarchyDarkGray3 font-oxanium font-semibold rounded-full transition-all duration-300 ease-in-out flex items-center justify-center border-2 ${buttonBorderColor} ${isWidgetExpanded ? 'w-[48px] h-[48px] md:w-[52px] md:h-[52px] p-0 mt-2 md:mt-3' : 'h-[48px] md:h-[52px] w-full md:w-[320px] px-3 pr-4 md:px-5 md:pr-6 gap-2 md:gap-3'}`}
          aria-label={isWidgetExpanded ? 'Close snapshot results' : 'Open snapshot results'}
        >
          <svg className={`flex-shrink-0 transition-all duration-300 ${isWidgetExpanded ? 'rotate-180 w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5'}`} viewBox="0 0 105 126" fill="#FFAC33" xmlns="http://www.w3.org/2000/svg">
            <path d="M104.781694,54.7785 C104.270697,53.41 102.961707,52.5 101.498717,52.5 L59.2365129,52.5 L83.6138421,5.103 C84.3803368,3.612 83.9848395,1.7885 82.6653488,0.7525 C82.0283532,0.2485 81.2618586,0 80.498864,0 C79.6833697,0 78.8678754,0.287 78.21338,0.8505 L52.4990602,23.058 L1.21391953,67.3505 C0.107927276,68.306 -0.291069928,69.8495 0.219926491,71.218 C0.730922911,72.5865 2.03641376,73.5 3.49940351,73.5 L45.7616074,73.5 L21.3842782,120.897 C20.6177836,122.388 21.0132808,124.2115 22.3327715,125.2475 C22.9697671,125.7515 23.7362617,126 24.4992564,126 C25.3147506,126 26.1302449,125.713 26.7847403,125.1495 L52.4990602,102.942 L103.784201,58.6495 C104.893693,57.694 105.28919,56.1505 104.781694,54.7785 L104.781694,54.7785 Z" />
          </svg>

          {!isWidgetExpanded && (
            <>
              <span className="text-xs md:text-sm whitespace-nowrap flex-shrink-0">
                Snapshot Results
                {SHOW_DATA_DEBUG && snapshotSource === 'api' && (
                  <span className="ml-1 text-[10px] text-futarchyViolet9 dark:text-futarchyViolet7">●</span>
                )}
              </span>

              {/* Loading State */}
              {snapshotLoading && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full border-2 border-futarchyViolet9/40 dark:border-futarchyViolet7/40 border-t-futarchyViolet9 dark:border-t-futarchyViolet7 animate-spin" />
                </div>
              )}

              {/* Cycling Results Preview */}
              {!snapshotLoading && currentResult && (
                <div key={`${currentResult.key}-${currentResultIndex}`} className="ml-auto flex items-center gap-1.5 md:gap-2 animate-fadeIn">
                  <div className={`${colorClasses.bg} rounded-full px-2 py-1 md:px-3 md:py-1.5 flex items-center gap-1.5 md:gap-2 transition-all duration-300`}>
                    <span className={`flex items-center justify-center ${colorClasses.icon}`}>
                      {renderIcon(currentResult.iconType)}
                    </span>
                    <span className={`text-xs md:text-sm font-bold tabular-nums ${colorClasses.text}`}>
                      {currentResult.percentage}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </button>
      )}
    </div>
  );
};

const MarketPageShowcase = ({ hidden = false, debugMode = false, proposal = null }) => {
  const [safeToastVisible, setSafeToastVisible] = useState(false);

  // Read useSubgraph query parameter for chart display control
  // - No param or not set: Show only TripleChart (original behavior)
  // - useSubgraph=true: Show both TripleChart AND SubgraphChart
  // - useSubgraph=only: Show ONLY SubgraphChart (don't mount TripleChart)
  // Proposals that default to Subgraph Trades
  const PROPOSALS_USING_SUBGRAPH_TRADES = [
    '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC',
    '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa'  // AAVE proposal
  ];

  // Proposal-specific config for SubgraphChart and spot price
  const PROPOSAL_DEFAULTS = {
    '0x45e1064348fD8A407D6D1F59Fc64B05F633b28FC': {
      useSubgraph: 'only',
      useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
    },
    '0xFb45aE9d8e5874e85b8e23D735EB9718EfEF47Fa': {
      useSubgraph: 'only',
      useSpotPrice: 'composite::0xaa7a70070e7495fe86c67225329dbd39baa2f63b+0xc8cf54b0b70899ea846b70361e62f3f5b22b1f4binvert+0x3de27efa2f1aa663ae5d458857e731c129069f29invert-hour-100-eth'  // AAVE/GHO composite: USDC/GHO * AAVE/USDC(inv) * AAVE/GHO(inv)
    },
    '0xeCe80208CB8376Be311cE0f5Ea4eF73850a0dcF0': {
      useSubgraph: 'only',
      useSpotPrice: '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai'  // GNO/WXDAI pool + sDAI rate provider
    }
  };

  const searchParams = useSearchParams();

  // Get proposal ID from URL path (/markets/[address]) or query param (?proposalId=)
  // Use pathname for /markets/[address] format
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const pathMatch = pathname.match(/\/markets?\/([^/?]+)/i);
  const proposalIdFromPath = pathMatch?.[1] || null;

  // Get proposal ID early for defaults lookup
  const proposalIdForDefaults = proposalIdFromPath || proposal?.address || proposal?.id || searchParams.get('proposalId');
  const normalizedProposalIdForDefaults = proposalIdForDefaults?.toLowerCase?.();
  const proposalDefaults = Object.entries(PROPOSAL_DEFAULTS).find(
    ([address]) => address.toLowerCase() === normalizedProposalIdForDefaults
  )?.[1] || {};

  // Apply defaults: URL params override proposal defaults
  // If global toggle is enabled, force subgraph for all proposals
  const useSubgraphParam = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS
    ? 'only'  // Force SubgraphChart only
    : (searchParams.get('useSubgraph') || proposalDefaults.useSubgraph);
  const showTripleChart = useSubgraphParam !== 'only'; // Show unless 'only'
  const showSubgraphChart = useSubgraphParam === 'true' || useSubgraphParam === 'only';

  // External spot price from GeckoTerminal via spotClient
  // Priority: 1) URL param, 2) proposal defaults, 3) config.marketInfo.coingecko_ticker
  const useSpotPriceParam = searchParams.get('useSpotPrice') || proposalDefaults.useSpotPrice;

  // Check for tradeSource parameter to switch between Supabase and Subgraph for trades
  // - No param: Default to Supabase UNLESS in whitelist
  // - tradeSource=subgraph: Use Subgraph (SubgraphTradesDataLayer)
  // - tradeSource=supabase: Use Supabase (RecentTradesDataLayer)
  const tradeSourceParam = searchParams.get('tradeSource');

  // Logic moved below config definition...

  const handleSafeTransaction = useCallback(() => {
    setSafeToastVisible(true);
    // Auto-hide after 10 seconds
    setTimeout(() => setSafeToastVisible(false), 10000);
  }, []);
  const [marketHasClosed, setMarketHasClosed] = useState(false);
  const [isPredictionMarketModalOpen, setIsPredictionMarketModalOpen] = useState(false);
  const [isAddLiquidityModalOpen, setIsAddLiquidityModalOpen] = useState(false);
  const [isCreatePoolModalOpen, setIsCreatePoolModalOpen] = useState(false);
  const [isEditProposalModalOpen, setIsEditProposalModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

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


  // Scroll detection for minimized header - DESKTOP ONLY with animation lock
  useEffect(() => {
    let isAnimating = false;
    let animationTimeout = null;

    const handleScroll = () => {
      // Only apply on desktop (lg breakpoint = 1024px and up)
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        return;
      }

      // Don't update during animation to prevent feedback loop
      if (isAnimating) return;

      const shouldMinimize = window.scrollY > 0;

      // Only update if state actually changes
      setIsScrolled((prevScrolled) => {
        if (prevScrolled !== shouldMinimize) {
          // Lock updates during animation
          isAnimating = true;

          // Clear any existing timeout
          if (animationTimeout) clearTimeout(animationTimeout);

          // Unlock after animation completes (300ms)
          animationTimeout = setTimeout(() => {
            isAnimating = false;
          }, 350); // Slightly longer than CSS transition

          return shouldMinimize;
        }
        return prevScrolled;
      });
    };

    // Also check on resize
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        isAnimating = false;
      } else {
        handleScroll();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (animationTimeout) clearTimeout(animationTimeout);
    };
  }, []);


  // ...existing state...
  const [newYesPrice, setNewYesPrice] = useState(null);
  const [newNoPrice, setNewNoPrice] = useState(null);
  const [newThirdPrice, setNewThirdPrice] = useState(null); // Added state for the third price
  const [thirdCandles, setThirdCandles] = useState([]); // Event probability historical candles
  const [newBasePrice, setNewBasePrice] = useState(null); // Added state for base/spot price from pool_candles


  const { address: connectedAddress, isConnected: walletConnected } = useAccount();
  const contractAddress = searchParams.get('contractAddress');
  const { selectedCurrency } = useCurrency(); // Get selected currency from context
  const { rate: sdaiRate, isLoading: isLoadingRate, error: rateError } = useSdaiRate(); // Get sDAI rate

  // Prioritize URL query parameters over props/connected wallet
  const debugModeParam = searchParams.get('debugMode');
  const normalizedDebugParam = debugModeParam?.toLowerCase?.();
  const isDebugMode =
    normalizedDebugParam === 'true' ||
    normalizedDebugParam === '1' ||
    normalizedDebugParam === 'yes' ||
    normalizedDebugParam === 'on' ||
    normalizedDebugParam === 't' ||
    debugMode;
  const debugAddress = searchParams.get('debugAddress');
  const address = useMemo(() => debugAddress || connectedAddress, [debugAddress, connectedAddress]);
  const isConnected = useMemo(() => debugAddress ? true : walletConnected, [debugAddress, walletConnected]);

  // Add flag to force test pools - set to true to test with specific pool addresses
  const FORCE_TEST_POOLS = false; // Change to true to enable test pools

  // Use the new contract config hook - pass proposal prop if available, otherwise gets from URL parameters or path
  console.log('[MarketPageShowcase] DEBUG inputs:', { proposal, proposalIdForDefaults });
  const { config, loading: configLoading, error: configError, refetch: refetchConfig } = useContractConfig(proposal || proposalIdForDefaults, FORCE_TEST_POOLS);
  console.log('[MarketPageShowcase] DEBUG hook result:', { config, configLoading, configError });

  // DETERMINE TRADE SOURCE (Hybrid Default)
  // 1. If global toggle is enabled, always use subgraph.
  // 2. If param is explicit ('subgraph' or 'supabase'), respect it.
  // 3. If no param, check whitelist.
  const marketAddressForWhitelist = config?.MARKET_ADDRESS || config?.proposalId;
  const isWhitelisted = marketAddressForWhitelist && PROPOSALS_USING_SUBGRAPH_TRADES.some(addr => addr.toLowerCase() === marketAddressForWhitelist.toLowerCase());

  const useSubgraphTrades = ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS
    ? true  // Force subgraph trades when global toggle is enabled
    : (tradeSourceParam === 'subgraph' || (tradeSourceParam !== 'supabase' && isWhitelisted));

  // Update currency context based on this market's config
  useUpdateCurrencyFromConfig(config);

  // Validate user is on correct chain for this market (pass configLoading to wait for config)
  const chainValidation = useChainValidation(config, configLoading);

  // Get currency symbol from config (used for display throughout component)
  const currencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol ||
    config?.metadata?.currencyTokens?.base?.tokenSymbol ||
    (Number(config?.chainId || proposal?.chainId) === 1 ? 'USDS' : 'sDAI');
  const companySymbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG?.company?.symbol || 'GNO';

  // Check if connected user is the proposal owner (for edit permissions)
  const isProposalOwner = useMemo(() => {
    if (!connectedAddress || !config?.owner) return false;
    return connectedAddress.toLowerCase() === config.owner.toLowerCase();
  }, [connectedAddress, config?.owner]);

  // Get pool data for volume and liquidity
  const { data: poolData, loading: poolDataLoading, error: poolDataError } = useYesNoPoolData(config);

  const latestPrices = useLatestPrices(30000, config);

  // Compute effective spot price param now that config is available
  // Priority: 1) URL param, 2) proposal defaults, 3) config.marketInfo.coingecko_ticker from Registry
  const effectiveSpotPriceParam = useMemo(() => {
    return useSpotPriceParam || config?.marketInfo?.coingecko_ticker || null;
  }, [useSpotPriceParam, config?.marketInfo?.coingecko_ticker]);

  // Second hook call with effective param (will re-fetch when config loads and provides coingecko_ticker)
  const {
    spotData: configSpotData,
    spotPrice: configSpotPrice,
    refetch: refetchConfigSpot,
    loading: configSpotLoading
  } = useExternalSpotPrice(effectiveSpotPriceParam, config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp);

  // Nullify spot data for closed markets
  const isLocallyClosed = config && (() => {
    const ct = config?.closeTimestamp || config?.metadata?.closeTimestamp || config?.marketInfo?.closeTimestamp;
    return ct && typeof ct === 'number' && (Date.now() / 1000) > ct;
  })();

  const finalSpotData = isLocallyClosed ? null : configSpotData;
  const finalSpotPrice = isLocallyClosed ? null : configSpotPrice;
  const finalSpotLoading = isLocallyClosed ? false : configSpotLoading;

  // Stabilize spotData reference — only update when actual data values change
  const stableSpotData = useMemo(() => finalSpotData, [JSON.stringify(finalSpotData)]);

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

  // Extract proposalId from config for passing to child components
  const proposalId = config?.proposalId;

  // Token images for trade history rows; populated from on-chain metadata when available
  const [tokenImages, setTokenImages] = useState({
    company: null,
    currency: null
  });

  // Split Configuration
  useEffect(() => {
    if (config?.marketInfo) {
      // Check if market is resolved based on resolution status only
      if (config.marketInfo.resolved) {
        setMarketHasClosed(true);
        // Switch to redeem-tokens tab when market is resolved
        setActiveTab('redeem-tokens');
      } else {
        setMarketHasClosed(false);
      }
    }
  }, [config]);

  // Pull token images from the on-chain proposal metadata when present
  useEffect(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const images = meta?.token_images || meta?.tokenImages;
    if (images?.company || images?.currency) {
      setTokenImages({
        company: images.company || null,
        currency: images.currency || null
      });
    }
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

  // Extract config values from useContractConfig (with fallbacks only for essential router addresses)
  const MARKET_ADDRESS = config?.MARKET_ADDRESS; // This comes from the extracted proposal ID
  const FUTARCHY_ROUTER_ADDRESS = config?.FUTARCHY_ROUTER_ADDRESS || DEFAULT_FUTARCHY_ROUTER_ADDRESS;
  const MERGE_CONFIG = config?.MERGE_CONFIG; // This comes from Supabase metadata
  const POOL_CONFIG_YES = config?.POOL_CONFIG_YES; // This comes from Supabase metadata
  const POOL_CONFIG_NO = config?.POOL_CONFIG_NO; // This comes from Supabase metadata
  const POOL_CONFIG_THIRD = config?.POOL_CONFIG_THIRD; // This comes from Supabase metadata
  const PREDICTION_POOLS = config?.PREDICTION_POOLS; // This comes from Supabase metadata
  // Check if spot pool is explicitly disabled in metadata (via spotPool: "0x00")
  // otherwise fallback to checking if a base pool config exists (which might come from defaults)
  const hasSpot = !!config?.BASE_POOL_CONFIG?.address && config?.BASE_POOL_CONFIG?.address !== "0x00";



  // Snapshot integration - fetch Snapshot proposal ID from Supabase using MARKET_ADDRESS
  const useMockSnapshot = process.env.NEXT_PUBLIC_USE_MOCK_SNAPSHOT === 'true';

  const {
    loading: snapshotLoading,
    data: snapshotData,
    error: snapshotError,
    source: snapshotSource,
    highestResult: snapshotHighestResult,
    snapshotProposalId,
  } = useSnapshotData(config?._registryMetadata?.snapshot_id || null, {
    useMock: useMockSnapshot,
    autoFetch: true,
    refreshInterval: 60000, // Refresh every 60 seconds
  });

  // Process the market title with regex to extract components
  const rawMarketTitle = config?.marketInfo?.title || "What will be the impact on GNO price if GnosisPay reaches $5mil weekly volume?";
  // Updated regex to match everything after "if" regardless of what comes before it
  const titleMatch = rawMarketTitle.match(/.*if\s+(.*)/i);

  // Extract title components for display
  const marketTitlePrefix = "What will be the impact on GNO price if";
  const marketEvent = titleMatch ? titleMatch[1] : "GnosisPay reaches $5mil weekly volume?";

  // Get the full description for the smaller text
  const marketDescription = config?.marketInfo?.description || "";
  const marketOutcomes = config?.marketInfo?.outcomes || ["Yes", "No"];

  // Log the loaded configuration
  useEffect(() => {
    if (config) {
      console.log('🌐 Contract config loaded from API:', {
        marketAddress: MARKET_ADDRESS,
        routerAddress: FUTARCHY_ROUTER_ADDRESS,
        mergeConfigLoaded: !!MERGE_CONFIG,
        marketInfo: config.marketInfo,
        parsedTitle: { prefix: marketTitlePrefix, event: marketEvent }
      });
    }
  }, [config]);

  // Fetch latest prices from Supabase pool_candles - much simpler!
  useEffect(() => {
    let isMounted = true;
    let interval = null;

    async function fetchLatestPricesFromSupabase() {
      try {
        console.log('[MarketPageShowcase] Fetching latest prices from Supabase pool_candles:', {
          YES_POOL: config?.POOL_CONFIG_YES?.address,
          NO_POOL: config?.POOL_CONFIG_NO?.address,
          THIRD_POOL: config?.POOL_CONFIG_THIRD?.address,
          BASE_POOL: config?.BASE_POOL_CONFIG?.address
        });

        // Don't fetch if config is not loaded yet
        if (!config?.POOL_CONFIG_YES?.address || !config?.POOL_CONFIG_NO?.address) {
          console.log('[MarketPageShowcase] Pool addresses not yet loaded, skipping price fetch');
          return;
        }

        const subgraphChainId = config?.chainId || 100;

        // Fetch latest pool prices + THIRD pool candle history in parallel
        const [yesResult, noResult, thirdResult, baseResult] = await Promise.all([
          subgraphPoolFetcher.fetch('pools.price', {
            id: config.POOL_CONFIG_YES.address,
            chainId: subgraphChainId
          }),
          subgraphPoolFetcher.fetch('pools.price', {
            id: config.POOL_CONFIG_NO.address,
            chainId: subgraphChainId
          }),
          config.POOL_CONFIG_THIRD?.address
            ? subgraphPoolFetcher.fetch('pools.candles', {
              id: config.POOL_CONFIG_THIRD.address,
              limit: 500,
              chainId: subgraphChainId
            })
            : Promise.resolve(null),
          config.BASE_POOL_CONFIG?.address
            ? subgraphPoolFetcher.fetch('pools.price', {
              id: config.BASE_POOL_CONFIG.address,
              chainId: subgraphChainId
            })
            : Promise.resolve(null)
        ]);

        // Extract prices from latest candles
        let yesPrice = null;
        let noPrice = null;
        let thirdPrice = null;
        let basePrice = null;

        if (yesResult?.status === 'success' && yesResult.data.length > 0) {
          const rawYesPrice = yesResult.data[0].price;
          // Backend now handles token slot inversion, use raw price directly
          yesPrice = rawYesPrice;
          console.log('[MarketPageShowcase] YES price from pool_candles:', { raw: rawYesPrice, used: yesPrice });
        }

        if (noResult?.status === 'success' && noResult.data.length > 0) {
          const rawNoPrice = noResult.data[0].price;
          // Backend now handles token slot inversion, use raw price directly
          noPrice = rawNoPrice;
          console.log('[MarketPageShowcase] NO price from pool_candles:', { raw: rawNoPrice, used: noPrice });
        }

        if (thirdResult?.status === 'success' && thirdResult.data.length > 0) {
          const processedThirdCandles = thirdResult.data
            .map((candle) => ({
              time: candle.timestamp,
              value: Number(candle.price)
            }))
            .filter((candle) => !Number.isNaN(candle.value))
            .sort((a, b) => a.time - b.time);

          const rawThirdPrice = processedThirdCandles[processedThirdCandles.length - 1]?.value;
          // Event probability should use raw price without inversion
          thirdPrice = rawThirdPrice;
          setThirdCandles(processedThirdCandles);
          console.log('[MarketPageShowcase] THIRD price (event probability) from pool_candles:', {
            raw: rawThirdPrice,
            used: thirdPrice,
            candles: processedThirdCandles.length
          });
        } else {
          setThirdCandles([]);
        }

        if (baseResult?.status === 'success' && baseResult.data.length > 0) {
          const rawBasePrice = baseResult.data[0].price;
          // Backend now handles currency slot inversion, use raw price directly
          basePrice = rawBasePrice;
          console.log('[MarketPageShowcase] BASE price from pool_candles:', { raw: rawBasePrice, used: basePrice });
        }

        if (isMounted) {
          console.log('[MarketPageShowcase] Fetched prices from Supabase pool_candles:', {
            yesPrice, noPrice, thirdPrice, basePrice,
            yesTokenSlot: config.POOL_CONFIG_YES.tokenCompanySlot,
            noTokenSlot: config.POOL_CONFIG_NO.tokenCompanySlot,
            thirdTokenSlot: config.POOL_CONFIG_THIRD?.tokenCompanySlot,
            baseCurrencySlot: config.BASE_POOL_CONFIG?.currencySlot
          });
          setNewYesPrice(yesPrice);
          setNewNoPrice(noPrice);
          setNewThirdPrice(thirdPrice);
          setNewBasePrice(basePrice);
        }
      } catch (e) {
        console.error('[MarketPageShowcase] Failed to fetch prices from Supabase:', e);
        if (isMounted) {
          setNewYesPrice(null);
          setNewNoPrice(null);
          setNewThirdPrice(null);
          setNewBasePrice(null);
          setThirdCandles([]);
        }
      }
    }

    // Only start fetching if config is loaded
    if (config?.POOL_CONFIG_YES?.address && config?.POOL_CONFIG_NO?.address) {
      fetchLatestPricesFromSupabase();
      // Update every 30 seconds (more frequent since Supabase is faster)
      interval = setInterval(fetchLatestPricesFromSupabase, 30000);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [config?.POOL_CONFIG_YES?.address, config?.POOL_CONFIG_NO?.address, config?.POOL_CONFIG_THIRD?.address, config?.BASE_POOL_CONFIG?.address]); // Only depend on pool addresses

  // NOTE: The Supabase realtime pool_candles subscription that lived here was
  // removed — the Supabase backend is permanently gone. Prices refresh via the
  // 30s subgraph polling above.

  // Fallback: use subgraph-derived prices when Supabase pool_candles aren't available
  // (e.g., AAVE market has no POOL_CONFIG_YES/NO so Supabase fetch never runs)
  useEffect(() => {
    if (newYesPrice === null && poolData?.yesPool?.price != null) {
      setNewYesPrice(poolData.yesPool.price);
    }
    if (newNoPrice === null && poolData?.noPool?.price != null) {
      setNewNoPrice(poolData.noPool.price);
    }
  }, [newYesPrice, newNoPrice, poolData?.yesPool?.price, poolData?.noPool?.price]);

  // Connection state for tracking wallet connection changes
  const [previousConnectionState, setPreviousConnectionState] = useState(isConnected);

  // Track wallet connection state changes explicitly
  useEffect(() => {
    // If connection state changed
    if (previousConnectionState !== isConnected) {
      setPreviousConnectionState(isConnected);
      console.log('Wallet connection state changed:', {
        previous: previousConnectionState,
        current: isConnected,
        address
      });

      // Balance manager handles connection state changes automatically
    }
  }, [isConnected, address, previousConnectionState]);

  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalType, setCollateralModalType] = useState('add');
  const [isApproved, setIsApproved] = useState(false);
  // Use centralized balance manager
  const { balances: rawBalances, isLoading: isLoadingPositions, error: balanceError, refetch: refetchBalances } = useBalanceManager(config, address, isConnected);

  // Transform balances to match existing position structure for compatibility
  const positions = useMemo(() => ({
    currencyYes: {
      unwrapped: rawBalances.currencyYes,
      wrapped: rawBalances.wrappedCurrencyYes,
      total: rawBalances.totalCurrencyYes
    },
    currencyNo: {
      unwrapped: rawBalances.currencyNo,
      wrapped: rawBalances.wrappedCurrencyNo,
      total: rawBalances.totalCurrencyNo
    },
    companyYes: {
      unwrapped: rawBalances.companyYes,
      wrapped: rawBalances.wrappedCompanyYes,
      total: rawBalances.totalCompanyYes
    },
    companyNo: {
      unwrapped: rawBalances.companyNo,
      wrapped: rawBalances.wrappedCompanyNo,
      total: rawBalances.totalCompanyNo
    },
    wxdai: rawBalances.currency, // SDAI balance for compatibility
    faot: rawBalances.company,   // GNO balance for compatibility
    native: rawBalances.native   // Native xDAI balance
  }), [rawBalances]);

  // Balance manager handles wallet disconnection automatically

  const [showEventDetails, setShowEventDetails] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showProcessingToast, setShowProcessingToast] = useState(false);

  // Add state for active tab - default to redeem-tokens if market is resolved, otherwise recent-trades-sdk
  const [activeTab, setActiveTab] = useState(
    config?.marketInfo?.resolved ? 'redeem-tokens' : 'recent-trades-sdk'
  );

  // State for Recent Trades filter controls
  const [showMyTrades, setShowMyTrades] = useState(false);
  const [tradesLimit, setTradesLimit] = useState(30);

  const [prices, setPrices] = useState({
    yesPrice: null,
    noPrice: null,
    yesLegacyPrice: null,
    noLegacyPrice: null,
    lastUpdate: null,
    isLoading: false,
    error: null
  });

  // Dynamic market data state
  const [marketData, setMarketData] = useState({
    display_title_0: "What will be the impact on GNO price",
    display_title_1: "if GnosisPay reaches €2,000,000 weekly volume?",
    title: "Will GnosisPay process transactions exceeding €2,000,000 in volume within any complete calendar week (Monday 00:00 UTC through Sunday 23:59 UTC) concluding on or prior to June 30, 2025?",
    description: "This conditional market on Gnosis Chain evaluates whether GnosisPay will exceed €2M in EUR transaction volume in any complete calendar week before June 30, 2025. Participants can trade YES or NO outcomes using wrapped GNO and sDAI to speculate on its impact on GNO's price.",
    question_title: null,
    question_link: null,
    isLoading: true,
    error: null
  });

  const marketSubject = useMemo(() => {
    const displayTexts = [
      marketData.display_title_1,
      marketData.display_title_0,
      marketData.title,
      config?.marketInfo?.display_text_1,
      config?.marketInfo?.title
    ].filter(Boolean);
    const identifier = displayTexts.join(' ').match(/\b(?:EIP|GIP|KIP|ERC|RIP|SIP|AIP|MIP|TIP)[-\s]?\d+\b/i)?.[0];

    if (identifier) return identifier.replace(/\s+/, '-').toUpperCase();

    const fallback = String(displayTexts[0] || 'this market')
      .replace(/^\s*if\s+/i, '')
      .replace(/[?.!]+$/, '')
      .trim();
    return fallback.length > 48 ? `${fallback.slice(0, 45).trimEnd()}…` : fallback;
  }, [
    marketData.display_title_1,
    marketData.display_title_0,
    marketData.title,
    config?.marketInfo?.display_text_1,
    config?.marketInfo?.title
  ]);

  const [selectedToken, setSelectedToken] = useState('currency');

  // Function to fetch dynamic market data from Supabase
  const fetchMarketData = async () => {
    // Don't fetch if config is not loaded yet - we'll get the data from useContractConfig instead
    if (!config || !config.marketInfo) {
      console.log('Config not loaded yet, skipping fetchMarketData');
      return;
    }

    try {
      console.log('Using market data from config:', config.marketInfo);
      console.log('Checking for display_text fields:', {
        display_text_0: config.marketInfo?.display_text_0,
        display_text_1: config.marketInfo?.display_text_1
      });
      setMarketData(prev => ({ ...prev, isLoading: true, error: null }));

      // Use the market info from useContractConfig hook instead of querying again
      const marketInfo = config.marketInfo;

      // Parse the market event data to extract display titles
      let parsedData = {
        display_title_0: "What will be the impact on GNO price",
        display_title_1: "if Circle deploy native USDC on Gnosis Chain?",
        title: marketInfo.title || "Market Event",
        description: marketInfo.description || "This conditional market on Gnosis Chain evaluates whether Circle will will deploy native USDC on gnosis chain before December 31 2025",
        question_title: marketInfo.title || null,
        question_link: marketInfo.questionLink || null,
        isLoading: false,
        error: null
      };

      // Auto-generate Reality.eth link if not provided
      if (!parsedData.question_link && config?.MARKET_ADDRESS && config?.chainId) {
        try {
          const realityUrl = await getRealityQuestionUrl(config.chainId, config.MARKET_ADDRESS);
          if (realityUrl) {
            parsedData.question_link = realityUrl;
            console.log('[Reality] Auto-generated question link:', realityUrl);
          }
        } catch (e) {
          console.warn('[Reality] Failed to generate question link:', e);
        }
      }

      // First, try to use display_text_0 and display_text_1 from metadata if available
      if (marketInfo.display_text_0 && marketInfo.display_text_1) {
        parsedData.display_title_0 = marketInfo.display_text_0;
        parsedData.display_title_1 = marketInfo.display_text_1;
      } else if (marketInfo.title) {
        // Fallback: Try to split the title into two parts if it contains "if"
        const title = marketInfo.title;
        const ifIndex = title.toLowerCase().indexOf(' if ');

        if (ifIndex !== -1) {
          parsedData.display_title_0 = title.substring(0, ifIndex);
          parsedData.display_title_1 = "if " + title.substring(ifIndex + 4);
        } else {
          // If no "if" found, use the full title as display_title_0
          parsedData.display_title_0 = title;
          parsedData.display_title_1 = "";
        }
      }

      setMarketData(parsedData);

    } catch (error) {
      console.error('Failed to process market data from config:', error);
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to process market data'
      }));
    }
  };

  const checkAllowance = async () => {
    if (!address) return;

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const wxdaiContract = new ethers.Contract(
        DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS,
        WXDAI_ABI,
        provider
      );

      const allowance = await wxdaiContract.allowance(address, CONDITIONAL_TOKENS_ADDRESS);
      setIsApproved(allowance.gt(0));
    } catch (error) {
      console.error('Failed to check allowance:', error);
    }
  };

  // Check allowance when address changes
  useEffect(() => {
    if (address) {
      checkAllowance();
    }
  }, [address]);

  // Fetch market data when config is loaded
  useEffect(() => {
    if (config && config.marketInfo) {
      fetchMarketData();
    }
  }, [config]);

  // Surface config failures instead of leaving the hero stuck on
  // "Loading badges…" / "Loading description…" forever
  useEffect(() => {
    if (!configLoading && configError) {
      setMarketData(prev => ({
        ...prev,
        isLoading: false,
        error: configError.message || 'Market data unavailable'
      }));
    }
  }, [configLoading, configError]);

  const handleConnectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAddress(accounts[0]);

      // Check if we're on Gnosis Chain (100)
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0x64') { // 100 in hex
        try {
          // Try to switch to Gnosis Chain
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x64' }],
          });
        } catch (switchError) {
          // If chain hasn't been added to MetaMask
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x64',
                chainName: 'Gnosis Chain',
                nativeCurrency: {
                  name: 'xDAI',
                  symbol: 'xDAI',
                  decimals: 18
                },
                rpcUrls: ['https://rpc.gnosischain.com'],
                blockExplorerUrls: ['https://gnosisscan.io']
              }],
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleApproveCollateral = async () => {
    if (!address) {
      handleConnectWallet();
      return;
    }

    try {
      setIsApproving(true);

      // Approve WXDAI for ConditionalTokens
      await handleTokenApproval(
        BASE_TOKENS_CONFIG.currency.address,
        CONDITIONAL_TOKENS_ADDRESS,
        null,
        'WXDAI'
      );

      // Approve FAOT for ConditionalTokens
      await handleTokenApproval(
        BASE_TOKENS_CONFIG.company.address,
        CONDITIONAL_TOKENS_ADDRESS,
        null,
        'FAOT'
      );

      await checkAllowance();
      setIsApproving(false);
      console.log('All approvals successful!');
    } catch (error) {
      console.error('Failed to approve collateral:', error);
      setIsApproving(false);
      throw error;
    }
  };

  const handleQuickSplit = async () => {
    if (!window.ethereum) {
      console.error("ethereum object doesn't exist!");
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const tokenAddress = DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS;
      const amount = ethers.utils.parseEther('50');

      // Set state for processing animation
      setProcessingStep('split');
      setCurrentSubstep({ step: 1, substep: 1 });

      // Create contract instances
      const tokenContract = new ethers.Contract(
        tokenAddress,
        WXDAI_ABI,
        signer
      );

      // Check allowance first
      const userAddress = await signer.getAddress();
      const allowance = await tokenContract.allowance(userAddress, FUTARCHY_ROUTER_ADDRESS);

      // Approve tokens if needed
      if (allowance.lt(amount)) {
        console.log('Approving tokens...');
        const approveTx = await tokenContract.approve(FUTARCHY_ROUTER_ADDRESS, approvalAmountFor(amount));
        await approveTx.wait();
        console.log('Tokens approved');
      } else {
        console.log('Already approved');
      }

      setCurrentSubstep({ step: 1, substep: 2 });

      const futarchyRouter = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      console.log('Executing split position...');
      const splitTx = await futarchyRouter.splitPosition(
        MARKET_ADDRESS,
        tokenAddress,
        amount,
        {
          gasLimit: 2000000, // Increased to 2M
          type: 2, // Ensure EIP-1559 transaction type
          maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        }
      );

      await splitTx.wait();
      console.log('Split successful!');
    } catch (error) {
      console.error('Failed to split position:', error);
    } finally {
      setIsSplitting(false);
    }
  };

  const handleMerge = async () => {
    if (!address) {
      handleConnectWallet();
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const conditionalTokens = new ethers.Contract(
        CONDITIONAL_TOKENS_ADDRESS,
        CONDITIONAL_TOKENS_ABI,
        signer
      );

      // Use currency positions from merge config
      const partition = [1, 2].map(i => ethers.BigNumber.from(i));
      const amount = ethers.utils.parseEther("0.01");

      const tx = await conditionalTokens.mergePositions(
        DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS,
        ethers.constants.HashZero, // NULL_PARENT_ID
        '0x749999f945a203a70e46fbb92edd48e730d7be1bb1a232e2558228a4a43533d8', // conditionId from mergeConfig
        partition,
        amount
      );

      await tx.wait();
      console.log("Merge successful!");
    } catch (error) {
      console.error("Error merging positions:", error);
    }
  };

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', () => { });
      }
    };
  }, []);

  // Add wagmi account change effect
  useEffect(() => {
    if (address) {
      checkAllowance();
      // Balance fetching is handled by useBalanceManager
    }
  }, [address, isConnected]);

  // Modal handlers
  const handleOpenCollateralModal = (type) => {
    console.log('Opening modal:', type);
    setCollateralModalType(type);
    setIsCollateralModalOpen(true);
  };

  const handleCloseCollateralModal = () => {
    setIsCollateralModalOpen(false);
    // Reset all states when closing modal
    setProcessingStep(null);
    setCurrentSubstep({ step: 1, substep: 0 });
  };

  // Add processing state
  const [processingStep, setProcessingStep] = useState(null);
  const [currentSubstep, setCurrentSubstep] = useState({ step: 1, substep: 0 });

  // Modify handleCollateralAction
  const handleCollateralAction = async (tokenType, amount, action = 'add') => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      if (action === 'add') {
        // Use the new futarchySplitWrap flow for adding collateral
        await performFutarchySplitWrap(amount, tokenType);
        return;
      }

      // Convert amount to Wei for remove action
      const amountInWei = ethers.utils.parseEther(amount);

      // Get configs based on token type
      const configs = tokenType === 'currency'
        ? {
          yes: MERGE_CONFIG.currencyPositions.yes,
          no: MERGE_CONFIG.currencyPositions.no
        }
        : {
          yes: MERGE_CONFIG.companyPositions.yes,
          no: MERGE_CONFIG.companyPositions.no
        };

      // Get base token address
      const baseToken = tokenType === 'currency'
        ? BASE_TOKENS_CONFIG.currency.address
        : BASE_TOKENS_CONFIG.company.address;

      // 1. Approve YES token for router
      setProcessingStep('yesApproval');
      setCurrentSubstep({ step: 1, substep: 1 });
      await handleTokenApproval(
        configs.yes.wrap.wrappedCollateralTokenAddress,
        FUTARCHY_ROUTER_ADDRESS,
        amountInWei,
        'YES Token'
      );

      // 2. Approve NO token for router
      setProcessingStep('noApproval');
      setCurrentSubstep({ step: 1, substep: 2 });
      await handleTokenApproval(
        configs.no.wrap.wrappedCollateralTokenAddress,
        FUTARCHY_ROUTER_ADDRESS,
        amountInWei,
        'NO Token'
      );

      // 3. Call mergePositions on router to handle unwrap and merge in one transaction
      setProcessingStep('merge');
      setCurrentSubstep({ step: 1, substep: 3 });
      const routerContract = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      console.log('Merging positions via router...', {
        proposal: MARKET_ADDRESS,
        collateralToken: baseToken,
        amount: ethers.utils.formatEther(amountInWei)
      });

      const mergeTx = await routerContract.mergePositions(
        MARKET_ADDRESS,
        baseToken,
        amountInWei,
        { gasLimit: 700000 }
      );

      // Wait for transaction confirmation
      await mergeTx.wait();
      console.log('Merge successful');

      // Only mark as completed after transaction is confirmed
      setProcessingStep('completed');

      // Refresh balances after all operations
      refetchBalances();

    } catch (error) {
      console.error('Error handling collateral action:', error);
      throw error;
    }
  };

  // Add click outside handler
  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself, not the modal
    if (e.target === e.currentTarget) {
      handleCloseCollateralModal();
    }
  };

  // Add function to check balances
  // checkBalances is now handled by useBalanceManager hook

  // Balance fetching is now handled by useBalanceManager hook automatically

  // Add balance refresh after transactions
  const refreshBalances = useCallback(() => {
    if (isConnected && address) {
      console.log('Manual refresh of balances triggered');
      refetchBalances();
    } else {
      console.log('Cannot refresh balances: wallet not connected or no address', { isConnected, address });
    }
  }, [address, isConnected, refetchBalances]);

  // Add to transaction handlers
  const handleWrap = async () => {
    // ... existing wrap code ...
    refetchBalances(); // Refresh balances after wrap
  };

  const handleSplitWrap = async () => {
    // ... existing split-wrap code ...
    refetchBalances(); // Refresh balances after split-wrap
  };

  // Add handler for toast click
  const handleToastClick = () => {
    setIsCollateralModalOpen(true);
  };

  // Keep just the state and handler
  const [isSplitWrapping, setIsSplitWrapping] = useState(false);

  // Add approval check function
  const checkAndApproveToken = async (signer, tokenAddress, spenderAddress, amount) => {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      await signer.getAddress(),
      spenderAddress
    );

    if (currentAllowance.lt(amount)) {
      console.log('Approving tokens...');
      const approveTx = await tokenContract.approve(
        spenderAddress,
        approvalAmountFor(amount)
      );
      await approveTx.wait();
      console.log('Approval complete');
    }
  };

  // Add balance check function
  const checkBalance = async (signer, tokenAddress) => {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const address = await signer.getAddress();
    const balance = await tokenContract.balanceOf(address);
    return balance;
  };

  // Update the handler function with checks
  const handleFutarchySplitWrap = () => {
    if (!isConnected) return;
    setIsSplitWrapModalOpen(true);
  };

  // Add new function to perform the split wrap
  const performFutarchySplitWrap = async (amountValue, tokenType) => {
    if (!isConnected) return;

    try {
      setIsSplitWrapping(true);

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const amount = ethers.utils.parseEther(amountValue);
      const userAddress = await signer.getAddress();

      // Determine the token address based on selection
      const tokenAddress = tokenType === 'currency'
        ? config.BASE_TOKENS_CONFIG.currency.address
        : config.BASE_TOKENS_CONFIG.company.address;

      console.log('Starting futarchy split wrap flow...');

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        signer
      );

      const currentAllowance = await tokenContract.allowance(
        userAddress,
        FUTARCHY_ROUTER_ADDRESS
      );

      console.log('Allowance check:', {
        currentAllowance: ethers.utils.formatEther(currentAllowance),
        requiredAmount: ethers.utils.formatEther(amount),
        hasEnoughAllowance: currentAllowance.gte(amount)
      });

      // First step - Approval
      setProcessingStep('baseTokenApproval');
      console.log('Starting approval step...');

      if (currentAllowance.lt(amount)) {
        console.log('Need to approve token...');
        const approveTx = await tokenContract.approve(
          FUTARCHY_ROUTER_ADDRESS,
          approvalAmountFor(amount)
        );
        console.log('Waiting for approval confirmation...');
        await approveTx.wait();
        console.log('Token approved successfully');
      } else {
        console.log('Token already approved');
      }

      // Add small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Second step - Split Position
      console.log('Starting mint step...');
      setProcessingStep('mint');

      const futarchyRouter = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      console.log('Executing split position...');
      const splitTx = await futarchyRouter.splitPosition(
        MARKET_ADDRESS,
        tokenAddress,
        amount,
        {
          gasLimit: 2000000, // Increased to 2M
          type: 2, // Ensure EIP-1559 transaction type
          maxFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        }
      );

      console.log('Split position transaction sent:', splitTx.hash);
      console.log('Waiting for transaction confirmation...');

      const receipt = await splitTx.wait();

      if (receipt.status === 1) {
        console.log('Split position completed successfully');
        // Add small delay before showing completion
        await new Promise(resolve => setTimeout(resolve, 1000));
        setProcessingStep('completed');

        // Show success message
        // alert('Successfully added collateral!');
      } else {
        throw new Error('Transaction failed');
      }

      // Reset states
      setIsSplitWrapping(false);

    } catch (error) {
      console.error('Split wrap failed:', error);
      setProcessingStep(null);
      setIsSplitWrapping(false);
      // alert(`Failed to add collateral: ${error.message}`);
      throw error;
    }
  };

  const handleTokenApproval = async (tokenAddress, spenderAddress, amount, tokenName = '') => {
    if (!window.ethereum) {
      throw new Error("Please install MetaMask!");
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    // Create token contract instance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const requiredAmount = amount == null ? await tokenContract.balanceOf(userAddress) : amount;

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(userAddress, spenderAddress);
    console.log(`Current ${tokenName} allowance for ${spenderAddress}:`, ethers.utils.formatEther(currentAllowance));

    // If allowance is insufficient
    if (currentAllowance.lt(requiredAmount)) {
      console.log(`Approving ${tokenName} for ${spenderAddress}...`);
      try {
        const approveTx = await tokenContract.approve(spenderAddress, approvalAmountFor(requiredAmount));
        console.log('Approval transaction sent:', approveTx.hash);
        await approveTx.wait();
        console.log(`${tokenName} approved successfully`);

        // Verify allowance after approval
        const newAllowance = await tokenContract.allowance(userAddress, spenderAddress);
        console.log(`New ${tokenName} allowance:`, ethers.utils.formatEther(newAllowance));

        if (newAllowance.lt(requiredAmount)) {
          throw new Error('Allowance is still insufficient after approval');
        }
      } catch (error) {
        console.error(`Failed to approve ${tokenName}:`, error);
        throw error;
      }
    }
  };

  const handleCowSwapApprovals = async (tokenAddress, amount) => {
    // Approve both VaultRelayer and Settlement contracts
    await handleTokenApproval(tokenAddress, VAULT_RELAYER_ADDRESS, amount, 'Token for VaultRelayer');
    await handleTokenApproval(tokenAddress, COW_SETTLEMENT_ADDRESS, amount, 'Token for Settlement');
  };

  const handleRouterApproval = async (tokenAddress, amount) => {
    await handleTokenApproval(tokenAddress, FUTARCHY_ROUTER_ADDRESS, amount, 'Token for Router');
  };

  const handleWrapperApproval = async (tokenAddress, amount) => {
    await handleTokenApproval(tokenAddress, WRAPPER_SERVICE_ADDRESS, amount, 'Token for WrapperService');
  };

  // Add price fetching function
  const fetchSushiswapPrices = async () => {
    try {
      setPrices(prev => ({ ...prev, isLoading: true, error: null }));

      const GRAPH_API_URL = 'https://gateway.thegraph.com/api/ad33346033d83cabeefde10fbf8b482c/subgraphs/id/9LC6MvaFHXyY3dmxM7VCwGNA9dvM6g2AuZxEGCyfvck3';

      // Query for YES pool
      const yesPoolQuery = {
        query: `{
          swaps(
            where: {pool: "0xf513225d744464C95Df69f8cB5068CDAEB3278Db"}
            first: 1
            orderBy: timestamp
            orderDirection: desc
          ) {
            amountIn
            amountOut
            tokenIn {
              name
            }
            tokenOut {
              name
            }
          }
        }`
      };

      // Query for NO pool
      const noPoolQuery = {
        query: `{
          swaps(
            where: {pool: "0x963afAaAa665ABc1C2F89DB6448c42d0f694ea65b50796ed90ccad465a9f70a"}
            first: 1
            orderBy: timestamp
            orderDirection: desc
          ) {
            amountIn
            amountOut
            tokenIn {
              name
            }
            tokenOut {
              name
            }
          }
        }`
      };

      // Fetch both pools data in parallel
      const [yesResponse, noResponse] = await Promise.all([
        fetch(GRAPH_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(yesPoolQuery)
        }),
        fetch(GRAPH_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(noPoolQuery)
        })
      ]);

      const yesData = await yesResponse.json();
      const noData = await noResponse.json();

      let yesPrice = null;
      let noPrice = null;

      // Calculate YES price if swap data exists
      if (yesData.data?.swaps?.[0]) {
        const yesSwap = yesData.data.swaps[0];
        // Extract base token name without YES_ prefix and convert to lowercase
        const baseTokenInName = yesSwap.tokenIn.name.replace(/^YES_/, '').toLowerCase();
        const baseTokenOutName = yesSwap.tokenOut.name.replace(/^YES_/, '').toLowerCase();
        // Check if tokenIn is currency token (case-insensitive)
        const tokenInCurrency = baseTokenInName === 'sdai';
        if (tokenInCurrency) {
          yesPrice = Number(yesSwap.amountIn) / Number(yesSwap.amountOut);
        } else {
          yesPrice = Number(yesSwap.amountOut) / Number(yesSwap.amountIn);
        }
      }

      // Calculate NO price if swap data exists
      if (noData.data?.swaps?.[0]) {
        const noSwap = noData.data.swaps[0];
        // Extract base token name without NO_ prefix and convert to lowercase
        const noBaseTokenInName = noSwap.tokenIn.name.replace(/^NO_/, '').toLowerCase();
        const noBaseTokenOutName = noSwap.tokenOut.name.replace(/^NO_/, '').toLowerCase();
        // Check if tokenIn is currency token (case-insensitive)
        console.log('noBaseTokenInName', noBaseTokenInName);
        const noTokenInCurrency = noBaseTokenInName === 'sdai';
        console.log('isNoTokenInCurrency', noTokenInCurrency);
        if (noTokenInCurrency) {
          noPrice = Number(noSwap.amountIn) / Number(noSwap.amountOut);
        } else {
          noPrice = Number(noSwap.amountOut) / Number(noSwap.amountIn);
        }
      }

      setPrices(prev => ({
        ...prev,
        yesPrice,
        noPrice,
        lastUpdate: new Date(),
        isLoading: false,
        error: null
      }));

    } catch (error) {
      console.error('Failed to fetch prices from The Graph:', error);
      setPrices(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
    }
  };

  const fetchLegacySushiswapPrices = async (setPrices) => {
    // Set initial loading state
    setPrices(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));

    // Initialize provider with better fallback handling
    let provider = null;
    try {
      if (typeof window !== 'undefined') {
        // Check for MetaMask/Web3 provider first
        if (window.ethereum) {
          console.log("MarketPage: MetaMask detected, using Web3Provider");
          try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            console.log("MarketPage: Successfully initialized Web3Provider");
          } catch (web3Error) {
            console.error("MarketPage: Failed to initialize Web3Provider:", web3Error);
          }
        }

        // If no MetaMask or Web3Provider initialization failed, try RPC URL
        if (!provider) {
          const envRpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
          console.log(`MarketPage: Trying to use environment RPC URL: ${envRpcUrl}`);

          if (envRpcUrl) {
            try {
              // Create provider with timeout for better error handling
              provider = new ethers.providers.JsonRpcProvider({
                url: envRpcUrl,
                timeout: 10000, // 10 second timeout
              });

              // Verify the connection works
              const blockNumber = await provider.getBlockNumber();
              console.log(`MarketPage: Successfully connected to RPC with block number: ${blockNumber}`);
            } catch (rpcError) {
              console.error("MarketPage: Environment RPC connection failed:", rpcError);
              provider = null;
            }
          } else {
            console.warn("MarketPage: No NEXT_PUBLIC_RPC_URL found in environment variables");
          }

          // Final fallback to hardcoded URL if still no provider
          if (!provider) {
            console.log("MarketPage: Trying hardcoded fallback RPC URL");
            try {
              // Use a known public RPC URL for Gnosis Chain as final fallback
              provider = new ethers.providers.JsonRpcProvider({
                url: "https://rpc.gnosischain.com",
                timeout: 10000, // 10 second timeout
              });

              // Verify the connection works
              const blockNumber = await provider.getBlockNumber();
              console.log(`MarketPage: Successfully connected to fallback RPC with block number: ${blockNumber}`);
            } catch (fallbackError) {
              console.error("MarketPage: Fallback RPC connection failed:", fallbackError);
              provider = null;
            }
          }
        }
      } else {
        console.log("MarketPage: Running in server-side environment - cannot connect to blockchain");
      }
    } catch (providerError) {
      console.error("MarketPage: Critical error initializing provider:", providerError);
      provider = null;
    }

    // Check if we have a provider after all attempts
    if (!provider) {
      console.error('MarketPage: No Ethereum provider available after all fallback attempts');
      setPrices(prev => ({
        ...prev,
        isLoading: false,
        error: 'No Ethereum provider available. Please connect MetaMask or check your internet connection.'
      }));
      return;
    }

    console.log("MarketPage: Provider successfully initialized");

    // Rest of the function with SDAI rate fetching
    const currencyDecimals = 18; // Assuming 18 decimals for currency
    let sdaiRateRaw = ethers.utils.parseUnits("1.02", currencyDecimals); // Default fallback value
    try {
      if (SDAI_CONTRACT_RATE && SDAI_CONTRACT_RATE !== "0x") {
        console.log(`MarketPage: Attempting to fetch SDAI rate from contract: ${SDAI_CONTRACT_RATE}`);
        try {
          const sdaiRateContract = new ethers.Contract(SDAI_CONTRACT_RATE, SDAI_RATE_PROVIDER_ABI, provider);

          // Add timeout protection
          const getRate = async () => {
            return await Promise.race([
              sdaiRateContract.getRate(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("getRate timeout after 15 seconds")), 15000)
              )
            ]);
          };

          sdaiRateRaw = await getRate();
          console.log('MarketPage: SDAI rate successfully fetched:', sdaiRateRaw.toString());
        } catch (contractError) {
          console.error("MarketPage: Error creating or calling SDAI contract:", contractError);
          console.warn("MarketPage: Using default SDAI rate due to contract error");
        }
      } else {
        console.warn("MarketPage: Invalid SDAI contract address, using default rate");
      }
    } catch (rateError) {
      console.warn("MarketPage: Error fetching SDAI rate, using default:", rateError);
    }

    // Format the SDAI rate using the correct token decimals
    const sdaiRateFormatted = Number(ethers.utils.formatUnits(sdaiRateRaw, currencyDecimals));
    console.log('MarketPage: sdaiRateFormatted', sdaiRateFormatted);

    try {
      // Helper function to calculate price based on tokenBaseSlot
      const calculatePrice = (priceBN, tokenBaseSlot) => {
        const priceStr = ethers.utils.formatUnits(priceBN, 18); // Both tokens have 18 decimals
        const priceFloat = parseFloat(priceStr);
        if (priceFloat === 0) return null; // Avoid division by zero or invalid price

        // Business rule: Always return "SDAI per prediction token" regardless of token ordering
        // If tokenBaseSlot is 0, SDAI is token0 and prediction token is token1
        // If tokenBaseSlot is 1, SDAI is token1 and prediction token is token0
        return tokenBaseSlot === 1 ? priceFloat : 1 / priceFloat;
      };

      // Variables to store prices
      let yesLegacyPrice = null;
      let noLegacyPrice = null;
      console.log('MarketPage: Initial yesLegacyPrice', yesLegacyPrice);

      // Fetch YES pool price (YES_SDAI/SDAI)
      try {
        const yesPoolContract = new ethers.Contract(
          PREDICTION_POOLS.yes.address,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        const slot0Result = await Promise.race([
          yesPoolContract.slot0(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("YES pool slot0 timeout after 15 seconds")), 15000)
          )
        ]);

        const sqrtPriceX96Yes = slot0Result[0]; // Get sqrtPriceX96
        console.log('MarketPage: sqrtPriceX96Yes', sqrtPriceX96Yes);

        // Calculate price using the approach from futarchy.js
        // Convert to decimal string and use JavaScript math
        const sqrtPriceStr = ethers.utils.formatUnits(sqrtPriceX96Yes, 0);
        const sqrtPrice = parseFloat(sqrtPriceStr);
        const priceYesBN = ethers.BigNumber.from(
          Math.floor((sqrtPrice * sqrtPrice) / 2 ** 192 * 10 ** 18).toString()
        );

        console.log('MarketPage: priceYesBN', priceYesBN);
        yesLegacyPrice = calculatePrice(priceYesBN, PREDICTION_POOLS.yes.tokenBaseSlot);
        console.log('MarketPage: Final yesLegacyPrice', yesLegacyPrice);
      } catch (error) {
        console.error('MarketPage: Error fetching YES pool price:', error);
      }

      // Fetch NO pool price (NO_SDAI/SDAI)
      try {
        const noPoolContract = new ethers.Contract(
          PREDICTION_POOLS.no.address,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        const slot0Result = await Promise.race([
          noPoolContract.slot0(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("NO pool slot0 timeout after 15 seconds")), 15000)
          )
        ]);

        const sqrtPriceX96No = slot0Result[0]; // Get sqrtPriceX96
        console.log('MarketPage: sqrtPriceX96No', sqrtPriceX96No);

        // Calculate price using the approach from futarchy.js
        // Convert to decimal string and use JavaScript math
        const sqrtPriceStr = ethers.utils.formatUnits(sqrtPriceX96No, 0);
        const sqrtPrice = parseFloat(sqrtPriceStr);
        const priceNoBN = ethers.BigNumber.from(
          Math.floor((sqrtPrice * sqrtPrice) / 2 ** 192 * 10 ** 18).toString()
        );

        console.log('MarketPage: priceNoBN', priceNoBN);
        noLegacyPrice = calculatePrice(priceNoBN, PREDICTION_POOLS.no.tokenBaseSlot);
        console.log('MarketPage: Final noLegacyPrice', noLegacyPrice);
      } catch (error) {
        console.error('MarketPage: Error fetching NO pool price:', error);
      }

      console.log('MarketPage: Final yesLegacyPrice', yesLegacyPrice);

      // Update state with fetched prices
      setPrices(prev => ({
        ...prev,
        yesLegacyPrice, // SDAI per YES_SDAI
        noLegacyPrice,  // SDAI per NO_SDAI,
        sdaiRateRaw,
        sdaiRate: sdaiRateFormatted,
        lastUpdate: new Date(),
        isLoading: false,
        error: null
      }));
    } catch (error) {
      console.error('MarketPage: Error in fetchSushiswapLegacyPrices:', error);
      setPrices(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch prediction pool prices'
      }));
    }
  };

  // Fetch both current and legacy prices
  useEffect(() => {
    const fetchAllPrices = async () => {
      await Promise.all([
        fetchSushiswapPrices(),
        fetchLegacySushiswapPrices(setPrices)
      ]);
    };

    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Add Coinbase price fetching function
  // const fetchCoinbaseSpotPrice = async () => { ... }

  // Update the price update intervals to be longer for daily data
  useEffect(() => {
    // Initial fetch
    fetchSushiswapPrices();

    // Set up intervals - only Sushiswap now since spot price is handled by useLatestPrices
    const sushiswapInterval = setInterval(fetchSushiswapPrices, 3600000); // Every hour

    // Cleanup
    return () => {
      clearInterval(sushiswapInterval);
    };
  }, []);

  // Add new SushiSwapEstimateButton component
  const SushiSwapEstimateButton = () => {
    const [estimation, setEstimation] = useState({
      loading: false,
      error: null,
      outputAmount: null,
      outputAmountRaw: null
    });
    const [isSwapping, setIsSwapping] = useState(false);

    const fetchEstimation = async () => {
      try {
        setEstimation(prev => ({ ...prev, loading: true, error: null }));
        const provider = new ethers.providers.Web3Provider(window.ethereum);

        // Create factory contract instance
        const factory = new ethers.Contract(SUSHISWAP_V2_FACTORY, SUSHISWAP_V2_FACTORY_ABI, provider);

        // Get pair address for WXDAI and FAOT YES token
        console.log('DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS', DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS);
        console.log('MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress', MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress);
        const pairAddress = await factory.getPair(
          DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS,
          MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress
        );

        if (pairAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("No Sushiswap pair exists");
        }

        // Get pair contract
        const pair = new ethers.Contract(pairAddress, SUSHISWAP_V2_PAIR_ABI, provider);
        const token0 = await pair.token0();
        const [reserve0, reserve1] = await pair.getReserves();

        // Calculate expected output for 0.01 WXDAI
        const inputAmount = ethers.utils.parseEther("0.01");
        const inputReserve = token0.toLowerCase() === DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS.toLowerCase() ? reserve0 : reserve1;
        const outputReserve = token0.toLowerCase() === DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS.toLowerCase() ? reserve1 : reserve0;

        // Calculate output amount using constant product formula
        const inputAmountWithFee = inputAmount.mul(997);
        const numerator = inputAmountWithFee.mul(outputReserve);
        const denominator = inputReserve.mul(1000).add(inputAmountWithFee);
        const outputAmount = numerator.div(denominator);

        setEstimation({
          loading: false,
          error: null,
          outputAmount: ethers.utils.formatEther(outputAmount),
          outputAmountRaw: outputAmount.toString()
        });
      } catch (error) {
        console.error('Failed to fetch estimation:', error);
        setEstimation({
          loading: false,
          error: error.message,
          outputAmount: null,
          outputAmountRaw: null
        });
      }
    };

    // Fetch estimation on mount and every minute
    useEffect(() => {
      fetchEstimation();
      const interval = setInterval(fetchEstimation, 60000);
      return () => clearInterval(interval);
    }, []);

    const handleSwap = async () => {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      try {
        setIsSwapping(true);
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();

        // Create WXDAI contract instance
        const wxdaiContract = new ethers.Contract(DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS, WXDAI_ABI, signer);
        const amount = ethers.utils.parseEther("0.01");

        // Check WXDAI balance
        const balance = await wxdaiContract.balanceOf(userAddress);
        if (balance.lt(amount)) {
          throw new Error(`Insufficient WXDAI balance. You have ${ethers.utils.formatEther(balance)} WXDAI but need 0.01 WXDAI`);
        }

        // Get SushiSwap Router contract
        const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57C66A0423FeDBbB8a3BfB";
        const ROUTER_ABI = [
          "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
        ];
        const router = new ethers.Contract(SUSHISWAP_ROUTER, ROUTER_ABI, signer);

        // Check and approve WXDAI if needed
        const allowance = await wxdaiContract.allowance(userAddress, SUSHISWAP_ROUTER);
        if (allowance.lt(amount)) {
          const approveTx = await wxdaiContract.approve(SUSHISWAP_ROUTER, approvalAmountFor(amount));
          await approveTx.wait();
        }

        // Prepare swap parameters
        const path = [DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS, MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress];
        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
        const quotedAmountOut = ethers.BigNumber.from(estimation.outputAmountRaw || 0);
        if (quotedAmountOut.isZero()) throw new Error('A current pool quote is required');
        const amountOutMin = quotedAmountOut.mul(97).div(100);

        // Execute swap
        const swapTx = await router.swapExactTokensForTokens(
          amount,
          amountOutMin,
          path,
          userAddress,
          deadline,
          { gasLimit: 300000 }
        );

        await swapTx.wait();
        //  alert("Swap successful!");
      } catch (error) {
        console.error('Swap failed:', error);
        alert(`Swap failed: ${error.message}`);
      } finally {
        setIsSwapping(false);
      }
    };

    return (
      <button
        onClick={handleSwap}
        disabled={isSwapping || estimation.loading}
        className={`flex items-center gap-2 bg-futarchyGold text-white px-4 py-2 rounded-lg font-medium hover:bg-futarchyGold/90 transition-colors ${(isSwapping || estimation.loading) ? 'opacity-75 cursor-not-allowed' : ''
          }`}
      >
        {isSwapping || estimation.loading ? (
          <>
            <div className="w-4 h-4 border-2 border-futarchyGold border-t-transparent rounded-full animate-spin" />
            {isSwapping ? 'Swapping...' : 'Loading...'}
          </>
        ) : estimation.error ? (
          'Error loading estimate'
        ) : estimation.outputAmount ? (
          `Swap 0.01 WXDAI ≈ ${Number(estimation.outputAmount).toFixed(6)} FAOT YES`
        ) : (
          'Swap 0.01 WXDAI to FAOT YES'
        )}
      </button>
    );
  };

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleCloseModal = () => {
    setIsConfirmModalOpen(false);
    setProcessingStep(null);
  };

  // Pre-configured transaction data for "Sell YES to Close"
  const sellYesTransactionData = {
    outcome: 'Event Will Occur',  // Because it's YES
    amount: `0.01 ${companySymbol}`,  // Use company token for Sell
    action: 'Sell',              // Because it's "Sell YES to Close"
    timestamp: new Date().toISOString()
  };

  // Pre-configured transaction data for position closing
  const getTransactionData = (isYesPosition, diff, action = 'Sell', isCompanyPosition = true) => {
    try {
      // Convert diff to string while preserving its sign
      const diffStr = diff.toString();

      // Format the amount with the appropriate token
      const amount = `${diffStr} ${isCompanyPosition ? companySymbol : currencySymbol}`;

      // Determine the outcome based on position type
      const outcome = isYesPosition ? 'Event Will Occur' : 'Event Will Not Occur';

      return {
        amount,
        action,
        outcome,
        isClosingPosition: false,
        useExistingCollateral: true
      };
    } catch (error) {
      console.error('Error preparing transaction data:', { error, diff, isYesPosition, action, isCompanyPosition });
      return null;
    }
  };

  const [currentTransactionData, setCurrentTransactionData] = useState(null);

  // Add formatting helper function
  const formatNumber = (value) => {
    if (!value || isNaN(value)) return '0';
    return value.toString(); // Return raw value as string
  };

  const formatBalanceDisplay = (value) => {
    if (!isConnected) return '-';
    if (!value || isNaN(value)) return '0';
    // Return the raw string value without any formatting
    return value.toString();
  };

  const formatPrice = (price) => {
    if (price === null || isNaN(price)) return 'N/A';
    return price.toString(); // Return raw value as string
  };

  // Add these state variables near the other useState declarations
  const [isSplitWrapModalOpen, setIsSplitWrapModalOpen] = useState(false);
  const [splitWrapAmount, setSplitWrapAmount] = useState('');
  const [splitWrapTokenType, setSplitWrapTokenType] = useState('currency');

  // Add this new component before the MarketPageShowcase component
  const SplitWrapModal = ({ isOpen, onClose, onSubmit }) => {
    if (!isOpen) return null;

    const [balance, setBalance] = useState(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Function to get user's balance
    const fetchBalance = async () => {
      try {
        setIsLoadingBalance(true);
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();

        const tokenAddress = splitWrapTokenType === 'currency'
          ? BASE_TOKENS_CONFIG.currency.address
          : BASE_TOKENS_CONFIG.company.address;

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const userAddress = await signer.getAddress();
        const balanceWei = await tokenContract.balanceOf(userAddress);
        const balanceEth = ethers.utils.formatEther(balanceWei);

        setBalance(balanceEth);
      } catch (error) {
        console.error('Error fetching balance:', error);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Fetch balance when token type changes
    useEffect(() => {
      if (isOpen) {
        fetchBalance();
      }
    }, [splitWrapTokenType, isOpen]);

    const handleMaxClick = () => {
      if (balance) {
        setSplitWrapAmount(balance);
      }
    };

    const handleAmountChange = (e) => {
      const value = e.target.value;

      // Allow empty string for clearing input
      if (value === '') {
        setSplitWrapAmount('');
        return;
      }

      // Only allow numbers and one decimal point
      if (/^\d*\.?\d*$/.test(value)) {
        setSplitWrapAmount(value);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-futarchyDarkGray3 rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold">Split Wrap Tokens</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Token Type
              </label>
              <select
                value={splitWrapTokenType}
                onChange={(e) => setSplitWrapTokenType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="currency">Currency ({currencySymbol})</option>
                <option value="company">Company (GNO)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Amount to Split Wrap
                </label>
                <span className="text-sm text-gray-500">
                  Balance: {isLoadingBalance ? 'Loading...' : balance ? Number(balance).toFixed(6) : '0.000000'}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={splitWrapAmount}
                  onChange={handleAmountChange}
                  className="w-full p-2 pr-16 border rounded-md"
                  placeholder="0.0"
                />
                <button
                  onClick={handleMaxClick}
                  disabled={!balance || Number(balance) <= 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-futarchyGold text-white rounded hover:bg-futarchyGold/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                onSubmit(splitWrapAmount, splitWrapTokenType);
                onClose();
              }}
              disabled={!splitWrapAmount || Number(splitWrapAmount) <= 0 || Number(splitWrapAmount) > Number(balance)}
              className="w-full bg-futarchyGold text-white py-2 rounded-md hover:bg-futarchyGold/90 disabled:opacity-50 transition-colors"
            >
              Split Wrap
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add these state variables near the other useState declarations
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeAmount, setMergeAmount] = useState('');
  const [mergeTokenType, setMergeTokenType] = useState('currency');
  const [isMerging, setIsMerging] = useState(false);

  // Get token addresses from dynamic config
  const TOKEN_ADDRESSES = {
    currency: {
      yes: config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress || '0x2C7d00810FBBA8676954C66A0423FeDBbB8a3BfB', // YES_SDAI
      no: config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress || '0x25eC0A3e53df512694d0e7DDe57e962595a7b63',  // NO_SDAI
    },
    company: {
      yes: config?.MERGE_CONFIG?.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress || '0xffF46469298c1E285981217a3D247A085Ab3ebA6', // GNO_YES
      no: config?.MERGE_CONFIG?.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress || '0x0c485ED641dBCA4Ed797B189Cd674925B3437eDC',  // GNO_NO
    }
  };

  // Add merge handler function
  const performMergePosition = async (amountValue, tokenType) => {
    if (!window.ethereum) {
      console.error("ethereum object doesn't exist!");
      return;
    }

    try {
      setIsMerging(true);

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const baseToken = tokenType === 'currency' ? DEFAULT_BASE_CURRENCY_TOKEN_ADDRESS : DEFAULT_BASE_COMPANY_TOKEN_ADDRESS;

      // Parse input amount to wei
      const amountInWei = ethers.utils.parseEther(amountValue);

      setProcessingStep('merge');
      setCurrentSubstep({ step: 1, substep: 3 });
      const routerContract = new ethers.Contract(
        FUTARCHY_ROUTER_ADDRESS,
        FUTARCHY_ROUTER_ABI,
        signer
      );

      console.log('Merging positions via router...', {
        proposal: MARKET_ADDRESS,
        collateralToken: baseToken,
        amount: ethers.utils.formatEther(amountInWei)
      });

      const mergeTx = await routerContract.mergePositions(
        MARKET_ADDRESS,
        baseToken,
        amountInWei,
        { gasLimit: 700000 }
      );

      console.log('Merge transaction sent:', mergeTx.hash);
      await mergeTx.wait();
      console.log('Merge completed');

    } catch (error) {
      console.error('Merge failed:', error);
      setProcessingStep(null);
      setIsMerging(false);
      alert('Failed to merge position. Please check console for details.');
    } finally {
      setIsMerging(false);
    }
  };

  // Add new MergeModal component
  const MergeModal = ({ isOpen, onClose, onSubmit }) => {
    if (!isOpen) return null;

    const [yesBalance, setYesBalance] = useState(null);
    const [noBalance, setNoBalance] = useState(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Function to get user's balance for both YES and NO tokens
    const fetchBalances = async () => {
      try {
        setIsLoadingBalance(true);
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();

        // Get YES token balance
        const yesTokenContract = new ethers.Contract(
          TOKEN_ADDRESSES[mergeTokenType].yes,
          ERC20_ABI,
          signer
        );
        const yesBalanceWei = await yesTokenContract.balanceOf(userAddress);
        const yesBalanceEth = ethers.utils.formatEther(yesBalanceWei);
        setYesBalance(yesBalanceEth);

        // Get NO token balance
        const noTokenContract = new ethers.Contract(
          TOKEN_ADDRESSES[mergeTokenType].no,
          ERC20_ABI,
          signer
        );
        const noBalanceWei = await noTokenContract.balanceOf(userAddress);
        const noBalanceEth = ethers.utils.formatEther(noBalanceWei);
        setNoBalance(noBalanceEth);

      } catch (error) {
        console.error('Error fetching balances:', error);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Fetch balances when token type changes
    useEffect(() => {
      if (isOpen) {
        fetchBalances();
      }
    }, [mergeTokenType, isOpen]);

    const handleMaxClick = () => {
      if (yesBalance && noBalance) {
        // Use the minimum of YES and NO balances
        const maxAmount = Math.min(Number(yesBalance), Number(noBalance));
        setMergeAmount(maxAmount.toString());
      }
    };

    const handleAmountChange = (e) => {
      const value = e.target.value;

      if (value === '') {
        setMergeAmount('');
        return;
      }

      if (/^\d*\.?\d*$/.test(value)) {
        setMergeAmount(value);
      }
    };

    const getMaxMergeAmount = () => {
      if (!yesBalance || !noBalance) return 0;
      return Math.min(Number(yesBalance), Number(noBalance));
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold">Merge Positions</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Token Type
              </label>
              <select
                value={mergeTokenType}
                onChange={(e) => setMergeTokenType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="currency">Currency ({currencySymbol})</option>
                <option value="company">Company (GNO)</option>
              </select>
            </div>

            <div>
              <div className="flex flex-col gap-1 mb-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-700">
                    Amount to Merge
                  </label>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>YES Balance: {isLoadingBalance ? 'Loading...' : yesBalance ? Number(yesBalance).toFixed(6) : '0.000000'}</span>
                  <span>NO Balance: {isLoadingBalance ? 'Loading...' : noBalance ? Number(noBalance).toFixed(6) : '0.000000'}</span>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={mergeAmount}
                  onChange={handleAmountChange}
                  className="w-full p-2 pr-16 border rounded-md"
                  placeholder="0.0"
                />
                <button
                  onClick={handleMaxClick}
                  disabled={!yesBalance || !noBalance || getMaxMergeAmount() <= 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-futarchyGold text-white rounded hover:bg-futarchyGold/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                onSubmit(mergeAmount, mergeTokenType);
                onClose();
              }}
              disabled={
                !mergeAmount ||
                Number(mergeAmount) <= 0 ||
                Number(mergeAmount) > getMaxMergeAmount()
              }
              className="w-full bg-futarchyGold text-white py-2 rounded-md hover:bg-futarchyGold/90 disabled:opacity-50 transition-colors"
            >
              {isMerging ? 'Merging...' : 'Merge Positions'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add handler for transaction completion
  const handleTransactionComplete = (transactionDetails) => {
    // Refresh balances or any other state that needs updating
    refetchBalances();
  };

  // Add selectedAction state
  const [selectedAction, setSelectedAction] = useState('buy');
  // Add selectedOutcome state
  const [selectedOutcome, setSelectedOutcome] = useState('approved');
  // Add amount state
  const [amount, setAmount] = useState('1');

  const [moreDetailsToggle, setMoreDetailsToggle] = useState(false);

  // Add state for tracking last transaction
  const [lastTransaction, setLastTransaction] = useState(null);

  // Calculate the surplus for a position pair
  const calculateSurplus = (yesAmount, noAmount) => {
    try {
      // Convert strings to BigNumber to maintain full precision
      const yesBN = ethers.utils.parseUnits(yesAmount || '0', 18);
      const noBN = ethers.utils.parseUnits(noAmount || '0', 18);

      // Calculate difference maintaining full precision
      const surplusBN = yesBN.sub(noBN);

      // Convert back to string maintaining full precision
      return ethers.utils.formatUnits(surplusBN, 18);
    } catch (error) {
      console.error('Error calculating surplus:', {
        error,
        yesAmount,
        noAmount,
        message: 'Failed to calculate surplus with full precision'
      });
      return '0';
    }
  };

  // Add this function to get display values with differences
  const getPositionDisplayValues = () => {
    // Calculate differences with full precision
    const currencyDiff = calculateSurplus(
      positions?.currencyYes?.total || '0',
      positions?.currencyNo?.total || '0'
    );
    const companyDiff = calculateSurplus(
      positions?.companyYes?.total || '0',
      positions?.companyNo?.total || '0'
    );

    console.log('Position Calculations:', {
      currencyYes: positions?.currencyYes?.total,
      currencyNo: positions?.currencyNo?.total,
      companyYes: positions?.companyYes?.total,
      companyNo: positions?.companyNo?.total,
      currencyDiff,
      companyDiff,
      rawPositions: positions
    });

    // Convert to BigNumber for comparison (maintaining precision)
    const currencyDiffBN = ethers.utils.parseUnits(currencyDiff || '0', 18);
    const companyDiffBN = ethers.utils.parseUnits(companyDiff || '0', 18);

    return {
      currencyDiff,
      companyDiff,
      showCurrencyEarlyRedeem: !currencyDiffBN.isZero(),
      isCompanyYesSurplus: companyDiffBN.gt(0),
      isCurrencyYesSurplus: currencyDiffBN.gt(0)
    };
  };

  // Helper function to format small amounts for display only
  const formatSmallAmount = (value, symbol) => {
    if (!value || isNaN(value)) return `0 ${symbol}`;

    try {
      // Convert to BigNumber for precise comparison
      const valueBN = ethers.utils.parseUnits(value.toString(), 18);

      // If exactly zero
      if (valueBN.isZero()) {
        return `0 ${symbol}`;
      }

      // For very small numbers (less than 0.00001)
      if (valueBN.gt(0) && valueBN.lt(ethers.utils.parseUnits("0.00001", 18))) {
        return `< 0.00001 ${symbol}`;
      }

      // For small numbers (less than 0.1), show more decimals
      if (valueBN.lt(ethers.utils.parseUnits("0.1", 18))) {
        // Use 6 decimal places for small numbers
        return `${valueBN.toString()} ${symbol}`;
      }

      // For regular numbers, use standard formatting with 4 decimals
      return `${valueBN.toString()} ${symbol}`;
    } catch (error) {
      console.error('Error in formatSmallAmount:', {
        value,
        symbol,
        error: error.message
      });
      return `0 ${symbol}`;
    }
  };

  const isVisuallyZero = (value) => {
    if (!value || isNaN(value)) return true;
    const num = parseFloat(value);
    return num < 0.00001; // If it would display as "< 0.00001" or "0", consider it visually zero
  };

  // Add debugging for latestPrices
  useEffect(() => {
    console.log('[SPOT] latestPrices updated:', {
      loading: latestPrices.loading,
      error: latestPrices.error,
      spotPriceSDAI: latestPrices.spotPriceSDAI,
      yes: latestPrices.yes,
      no: latestPrices.no,
      base: latestPrices.base,
      source: latestPrices.source,
      timestamp: latestPrices.timestamp
    });
  }, [latestPrices]);

  // Market end time falls back to the on-chain closeTimestamp when
  // config.marketInfo.endTime is not set.
  const marketEndTime = useMemo(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const close = meta?.closeTimestamp;
    return close ? Number(close) : null;
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

  // ---> State for pending order check (count instead of ID) <---
  const [isLoadingPendingOrder, setIsLoadingPendingOrder] = useState(false);
  // const [pendingOrderId, setPendingOrderId] = useState(null); // Remove single ID state
  const [pendingOrderCount, setPendingOrderCount] = useState(0); // Add count state
  const [showPendingOrderToast, setShowPendingOrderToast] = useState(false);

  // ---> useEffect to check for pending CoW orders <---
  useEffect(() => {
    const checkPendingCowOrders = async () => {
      if (!isConnected || !address) {
        setShowPendingOrderToast(false); // Hide toast if disconnected
        setPendingOrderCount(0); // Reset count
        return;
      }

      console.log('[Pending Order Check] Starting check for address:', address);
      setIsLoadingPendingOrder(true);
      setPendingOrderCount(0); // Reset before check
      setShowPendingOrderToast(false);

      try {
        const chainId = 100; // Gnosis Chain
        const cowSdk = new CowSdk(chainId);
        const ordersData = await cowSdk.cowApi.getOrders({ owner: address, limit: 10 }); // Limit query slightly

        console.log('[Pending Order Check] Received orders:', ordersData);

        // ---> Filter for all pending orders and get count <----
        const pendingOrders = ordersData.filter(order =>
          order.status === 'open' || order.status === 'submitted'
        );
        const count = pendingOrders.length;

        if (count > 0) {
          console.log(`[Pending Order Check] Found ${count} pending order(s).`);
          setPendingOrderCount(count);
          setShowPendingOrderToast(true);
        } else {
          console.log('[Pending Order Check] No pending orders found.');
          setPendingOrderCount(0);
          setShowPendingOrderToast(false);
        }

      } catch (error) {
        console.error('[Pending Order Check] Error checking for pending CoW orders:', error);
        // Don't show toast on error, just log it
        setPendingOrderCount(0);
        setShowPendingOrderToast(false);
      } finally {
        setIsLoadingPendingOrder(false);
      }
    };

    checkPendingCowOrders();

  }, [address, isConnected]);

  // <-- Add state for the new modal -->
  const [isSwapNativeModalOpen, setIsSwapNativeModalOpen] = useState(false);

  // <-- Add functions to control the new modal -->
  const openSwapNativeModal = () => {
    setIsSwapNativeModalOpen(true);
  };

  const closeSwapNativeModal = () => {
    setIsSwapNativeModalOpen(false);
    // Optional: Refresh balances after closing the swap modal
    refetchBalances();
  };

  // Extract hero content for RootLayout
  const marketHero = (
    <div className={`relative bg-futarchyDarkGray2/90 dark:bg-futarchyDarkGray2/70  dark:border-futarchyGray112/40 backdrop-blur-sm font-oxanium flex flex-col border-b-2 border-futarchyDarkGray42 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:h-20' : ''
      }`}>
      <div className="container mx-auto px-5 flex-grow flex flex-col justify-center">
        <div className={`grid grid-cols-1 lg:grid-cols-3 transition-all duration-300 ease-in-out ${isScrolled ? 'py-8 lg:py-3' : 'py-4 lg:py-6'
          }`}>
          <div className={`lg:col-span-2 space-y-2 py-2 lg:space-y-3 border-b-2 border-futarchyDarkGray42 lg:border-b-0 lg:border-r lg:pr-6 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:py-0' : 'lg:py-3'
            }`}>
            <h1 className={`font-semibold text-white leading-tight min-h-[1.5rem] transition-all duration-300 ease-in-out ${isScrolled ? 'text-sm lg:text-base' : 'text-sm lg:text-xl'
              }`}>
              {marketData.isLoading && (
                <span className="inline-flex items-center gap-2 text-xs text-white/80">
                  <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                  Loading…
                </span>
              )}
              {!marketData.isLoading && !marketData.error && (
                <>
                  <span className="whitespace-nowrap">{marketData.display_title_0}</span>{' '}
                  <span className="text-futarchyViolet7">{marketData.display_title_1}</span>
                </>
              )}
              {!marketData.isLoading && marketData.error && (
                <span className="text-red-400/80">Market data unavailable</span>
              )}
            </h1>

            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-y-4 text-left transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              <StatDisplay
                label="Impact"
                value={(() => {
                  // Calculate impact using existing logic
                  if (newYesPrice === null || newNoPrice === null || typeof newYesPrice === 'undefined' || typeof newNoPrice === 'undefined') {
                    return 'Loading...';
                  }
                  if (typeof newYesPrice !== 'number' || typeof newNoPrice !== 'number' || newNoPrice === 0) {
                    return 'N/A';
                  }
                  const yes = Number(newYesPrice);
                  const no = Number(newNoPrice);
                  const denominator = Math.max(yes, no);
                  const impactValue = denominator > 0 ? ((yes - no) / denominator) * 100 : 0;

                  const prefix = impactValue > 0 ? '+' : '';
                  return `${prefix}${impactValue.toFixed(2)}%`;
                })()}
                valueClassName={(() => {
                  // Calculate impact to determine color
                  if (newYesPrice === null || newNoPrice === null || typeof newYesPrice === 'undefined' || typeof newNoPrice === 'undefined') {
                    return 'text-futarchyTeal7';
                  }
                  if (typeof newYesPrice !== 'number' || typeof newNoPrice !== 'number' || newNoPrice === 0) {
                    return 'text-futarchyTeal7';
                  }
                  const yes = Number(newYesPrice);
                  const no = Number(newNoPrice);
                  const denominator = Math.max(yes, no);
                  const impactValue = denominator > 0 ? ((yes - no) / denominator) * 100 : 0;

                  return impactValue >= 0 ? 'text-futarchyTeal7' : 'text-futarchyCrimson11';
                })()}
                Icon={ImpactIcon}
                isLoading={newYesPrice === null || newNoPrice === null}
              />

              <StatDisplay
                label="Status"
                value={config?.marketInfo?.resolved ? 'Resolved' : 'Active'}
                valueClassName="text-futarchyEmerald11"
                Icon={StatusIcon}
                isLoading={configLoading}
              />

              <AggregatedStatDisplay
                label={`Volume (Total; ${currencySymbol})`}
                yesValue={poolData?.yesPool?.volume ?? null}
                noValue={poolData?.noPool?.volume ?? null}
                Icon={VolumeIcon}
                isLoading={poolDataLoading || configLoading}
                formatFunction={formatVolume}
                tooltipLabels={{ yes: 'YES Volume', no: 'NO Volume' }}
                normalize={poolData?.source !== 'subgraph'}
              />

              <AggregatedStatDisplay
                label="Liquidity"
                yesValue={liquiditySummary.yes?.total ?? null}
                noValue={liquiditySummary.no?.total ?? null}
                Icon={LiquidityIcon}
                isLoading={poolDataLoading || configLoading}
                formatFunction={formatLiquidity}
                tooltipLabels={{ yes: 'YES Liquidity', no: 'NO Liquidity' }}
                tooltipBreakdown={liquiditySummary.breakdown}
                normalize={poolData?.source !== 'subgraph'}
              />

              <StatDisplay
                label={(() => {
                  // Check if market is resolved
                  if (config?.marketInfo?.resolved) {
                    return "Resolution Date";
                  }

                  // Check if end time has passed but not resolved
                  if (config?.marketInfo?.endTime || marketEndTime) {
                    const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                    // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                    const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                    const now = new Date().getTime();
                    const end = endTimeMs;
                    if (end <= now) {
                      return "Ended";
                    }
                    return "Remaining Time";
                  }
                  return "Trading Ends";
                })()}
                value={(() => {
                  // If resolved, show resolution time
                  if (config?.marketInfo?.resolved && config?.marketInfo?.resolvedTime) {
                    return new Date(config.marketInfo.resolvedTime).toLocaleDateString();
                  }

                  // Check if we have end time
                  if (config?.marketInfo?.endTime || marketEndTime) {
                    const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                    // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                    const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                    const now = new Date().getTime();
                    const end = endTimeMs;
                    const diff = end - now;

                    // If time has passed but not resolved, show opening time 
                    if (diff <= 0) {
                      return new Date(endTimeMs).toLocaleDateString();
                    }

                    // Still active, show remaining time
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return `${days}d ${hours}h ${minutes}m`;
                  }
                  return 'Unknown';
                })()}
                valueClassName="text-futarchyGold8"
                Icon={TimeIcon}
                isLoading={configLoading}
              />
            </div>

            <div className={`flex items-center gap-3 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              {marketData.isLoading && (
                <span className="inline-flex items-center gap-2 text-xs text-white/70">
                  <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                  Loading badges…
                </span>
              )}
              {!marketData.isLoading && !marketData.error && (
                <MarketBadgeList badges={(() => {
                  const badges = [];

                  // Only show time badge if market is active
                  if (!config?.marketInfo?.resolved) {
                    // Check if end time has passed but not resolved
                    if (config?.marketInfo?.endTime || marketEndTime) {
                      const rawEndTime = config?.marketInfo?.endTime || marketEndTime;
                      // Normalize: if endTime is a Unix timestamp in seconds, convert to ms
                      const endTimeMs = typeof rawEndTime === 'number' && rawEndTime < 10000000000 ? rawEndTime * 1000 : (typeof rawEndTime === 'number' ? rawEndTime : new Date(rawEndTime).getTime());
                      const now = new Date().getTime();
                      const end = endTimeMs;
                      const diff = end - now;

                      if (diff <= 0) {
                        // Show Awaiting Resolution at the end
                        // Don't add it here, add it after other badges
                      } else {
                        // Show Active status only
                        badges.push({ text: 'Active', colorScheme: 'emerald' });
                      }
                    } else {
                      badges.push({ text: 'Active', colorScheme: 'emerald' });
                    }
                  } else {
                    // Market is resolved - use appropriate color based on outcome
                    const outcome = config.marketInfo.finalOutcome;
                    let colorScheme = 'gray';
                    let text = `Resolved: ${outcome || 'Unknown'}`;

                    if (outcome === 'YES' || outcome === 'Yes' || outcome === 'yes') {
                      colorScheme = 'blue';  // Blue for YES
                      text = 'Resolved: YES';
                    } else if (outcome === 'NO' || outcome === 'No' || outcome === 'no') {
                      colorScheme = 'gold';  // Gold/yellow for NO
                      text = 'Resolved: NO';
                    }

                    badges.push({ text, colorScheme });
                  }

                  // Market Summary badge
                  if (config?.marketInfo?.trackProgressLink) {
                    badges.push({
                      text: 'Market Summary',
                      colorScheme: 'default',
                      link: config.marketInfo.trackProgressLink
                    });
                  }

                  // Prediction Market badge — opt-in via metadata flag (default off).
                  if (
                    config?.marketInfo?.showPredictionMarket === true &&
                    config?.BASE_TOKENS_CONFIG?.currency?.address && (
                      config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress ||
                      config?.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress
                    )
                  ) {
                    badges.push({
                      text: 'Prediction Market',
                      colorScheme: 'default',
                      onClick: () => setIsPredictionMarketModalOpen(true)
                    });
                  }

                  // Arbitrage Contract badge — links to Gnosisscan when set in metadata.
                  if (config?.marketInfo?.arbitrageContractAddress) {
                    badges.push({
                      text: 'Arbitrage Contract',
                      colorScheme: 'default',
                      link: `https://gnosisscan.io/address/${config.marketInfo.arbitrageContractAddress}`
                    });
                  }

                  // Resolve Question badge
                  if (marketData.question_link) {
                    badges.push({
                      text: 'Resolve Question',
                      colorScheme: 'violet',
                      link: marketData.question_link
                    });
                  }

                  // Snapshot Vote badge - link to Snapshot proposal
                  {
                    const effectiveSnapshotId = snapshotProposalId || config?._registryMetadata?.snapshot_id;
                    if (effectiveSnapshotId) {
                      const spaceId = snapshotData?.spaceId || 'gnosis.eth';
                      badges.push({
                        text: 'Snapshot Vote',
                        colorScheme: 'default',
                        link: `https://snapshot.box/#/s:${spaceId}/proposal/${effectiveSnapshotId}`
                      });
                    }
                  }

                  // Add Liquidity badge
                  badges.push({
                    text: 'Add Liquidity',
                    colorScheme: 'teal',
                    onClick: () => setIsAddLiquidityModalOpen(true)
                  });

                  // Create Pool badge - show when pools are missing (subgraph mode)
                  if (!config?.POOL_CONFIG_YES?.address || !config?.POOL_CONFIG_NO?.address) {
                    badges.push({
                      text: '+ Create Pool',
                      colorScheme: 'violet',
                      onClick: () => setIsCreatePoolModalOpen(true)
                    });
                  }

                  // Edit badge - show only for proposal owners
                  if (isProposalOwner && config?.proposalMetadataAddress) {
                    badges.push({
                      text: '✏️ Edit',
                      colorScheme: 'gray',
                      onClick: () => setIsEditProposalModalOpen(true)
                    });
                  }

                  return badges;
                })()} />
              )}
              {!marketData.isLoading && marketData.error && (
                <span className="text-xs text-red-400/80">Badges unavailable</span>
              )}
            </div>
          </div>

          <div className={`lg:col-span-1 transition-all duration-300 ease-in-out ${isScrolled ? 'lg:py-2 lg:pl-6' : 'py-2 lg:py-3 lg:pl-6'
            }`}>
            {/* Description - hides on scroll */}
            <div className={`transition-all duration-300 ease-in-out ${isScrolled ? 'lg:hidden' : ''
              }`}>
              {marketData.isLoading && (
                <p className="text-xs lg:text-sm text-white/80 inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                  Loading description…
                </p>
              )}
              {!marketData.isLoading && !marketData.error && marketData.description && (
                <p className="text-xs lg:text-sm text-white/70 leading-relaxed">{marketData.description}</p>
              )}
              {!marketData.isLoading && marketData.error && (
                <p className="text-xs lg:text-sm text-red-400/80">Description unavailable</p>
              )}
            </div>

            {/* TWAP Countdown Widget - always visible */}
            {!marketData.isLoading && config?.marketInfo?.twapStartTimestamp && (
              <TwapCountdown
                twapStartTimestamp={config.marketInfo.twapStartTimestamp}
                twapDurationHours={config.marketInfo.twapDurationHours || 24}
                twapDescription={config.marketInfo.twapDescription || DEFAULT_TWAP_DESCRIPTION}
                isScrolled={isScrolled}
                yesPoolConfig={config.POOL_CONFIG_YES}
                noPoolConfig={config.POOL_CONFIG_NO}
                invertTwapPoolYes={config.marketInfo.invertTwapPoolYes || false}
                invertTwapPoolNo={config.marketInfo.invertTwapPoolNo || config.marketInfo.invertTwapPoolNO || false}
                yesCompanyTokenAddress={config.metadata?.companyTokens?.yes?.wrappedCollateralTokenAddress || null}
                noCompanyTokenAddress={config.metadata?.companyTokens?.no?.wrappedCollateralTokenAddress || null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Wrong Network Modal */}
      <WrongNetworkModal
        requiredChainId={chainValidation.requiredChainId}
        isOpen={chainValidation.showModal}
        onClose={() => chainValidation.setShowModal(false)}
      />

      <PriceHeader yesPrice={newYesPrice} noPrice={newNoPrice} currencySymbol={currencySymbol} />
      <RootLayout headerConfig="app" footerConfig="main" useSnapScroll={false} heroContent={marketHero}>
        <PageLayout>
          {/* Main Content Area - Split Design */}
          <div className="relative flex-1">
            {/* Dark top half */}
            <div id="black-section-boundary" className="bg-black">
              <div className="absolute inset-0 background-gradient opacity-20" />
            </div>

            {/* White bottom half */}
            <div className="bg-white dark:bg-futarchyDarkGray2 w-full relative">
              {/* Content */}
              <div className="relative z-10">
                <div className="container mx-auto pt-10 pb-20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left side - Market iframe */}
                    <div className="md:col-span-2">
                      {/* Title */}


                      {/* Market Container - Only shows if TripleChart is enabled */}
                      {showTripleChart && (
                        <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden flex flex-col h-[550px]">
                          {/* Market Stats Header */}
                          <div className="h-16 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
                            <ChartParameters
                              tradingPair={`${config?.BASE_TOKENS_CONFIG?.company?.symbol || DEFAULT_BASE_TOKENS_CONFIG.company.symbol}/${selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}`}
                              spotPrice={(() => {
                                const value = Number(newBasePrice !== null ? newBasePrice : (latestPrices.spotPriceSDAI || 0));
                                const displayValue = selectedCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              yesPrice={(newYesPrice === null || typeof newYesPrice === 'undefined') ? null : (() => {
                                const value = Number(newYesPrice);
                                const displayCurrency = selectedCurrency;
                                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              noPrice={(newNoPrice === null || typeof newNoPrice === 'undefined') ? null : (() => {
                                const value = Number(newNoPrice);
                                const displayCurrency = selectedCurrency;
                                const displayValue = displayCurrency === 'WXDAI' && sdaiRate && !isLoadingRate && !rateError && sdaiRate > 0
                                  ? value * sdaiRate
                                  : value;
                                return displayValue;
                              })()}
                              eventProbability={(newThirdPrice === null || typeof newThirdPrice === 'undefined') ? null : typeof newThirdPrice === 'number' ? Math.min((Number(newThirdPrice)), 1) : 0}
                              currency={selectedCurrency === 'WXDAI' ? 'xDAI' : currencySymbol}
                              precision={config?.precisions?.main || 4}
                              showSpot={hasSpot}
                              chartFilters={chartFilters}
                              onFilterClick={handleChartFilterClick}
                              predictionMarketLink={config?.BASE_TOKENS_CONFIG?.currency?.address && config?.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress
                                ? (config?.chainId === 1
                                  ? `https://app.uniswap.org/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`
                                  : `https://v3.swapr.eth.limo/#/swap?inputCurrency=${config.BASE_TOKENS_CONFIG.currency.address}&outputCurrency=${config.MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress}`)
                                : null}
                              config={config}
                              resolutionDetails={(() => {
                                if (config?.marketInfo?.resolved && config?.marketInfo?.finalOutcome) {
                                  return {
                                    label: 'OUTCOME',
                                    value: config.marketInfo.finalOutcome.toUpperCase(),
                                    link: config.marketInfo.trackProgressLink
                                  };
                                }
                                return null;
                              })()}
                            />
                          </div>

                          {/* Chart Area */}
                          <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 flex-grow overflow-hidden">
                            <div className="w-full h-full flex flex-col">
                              <TripleChart
                                propYesData={latestPrices.yesData}
                                propNoData={latestPrices.noData}
                                propBaseData={latestPrices.baseData}
                                propEventProbabilityData={thirdCandles}
                                shouldFetchData={false}
                                // Pass down currency selection and rate info
                                selectedCurrency={selectedCurrency}
                                sdaiRate={sdaiRate}
                                isLoadingRate={isLoadingRate}
                                rateError={rateError}
                                // Pass dynamic config for pool addresses
                                config={config}
                                // Pass spot price for inversion logic
                                spotPrice={newBasePrice !== null ? newBasePrice : latestPrices.spotPriceSDAI}
                                // Pass chart filters
                                chartFilters={{ ...chartFilters, spot: hasSpot && chartFilters.spot }}
                                // Pass market status for smart data fetching
                                marketHasClosed={marketHasClosed}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SubgraphChart - Only renders when useSubgraph=true or useSubgraph=only */}
                      {showSubgraphChart && (
                        <div className={showTripleChart ? "mt-6" : ""}>
                          <SubgraphChart
                            proposalId={config?.proposalId || config?.MARKET_ADDRESS}
                            chainId={config?.chainId || 100}
                            height={448}
                            candleLimit={500}
                            config={config}
                            // External spot price from CoinGecko (via ?useSpotPrice=... or config.marketInfo.coingecko_ticker)
                            showSpot={!!effectiveSpotPriceParam}
                            spotData={stableSpotData}
                            spotPrice={finalSpotPrice}
                            onSpotRefresh={refetchConfigSpot}
                          />
                        </div>
                      )}

                      {/* Tabs Section */}
                      <div className="mt-8">
                        {/* Tab Headers */}
                        {/* NEW: Conditionally render the first button */}
                        <div className="flex flex-row gap-4">
                          {marketHasClosed ? (
                            <button
                              onClick={() => setActiveTab('redeem-tokens')}
                              className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'redeem-tokens'
                                ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                }`}
                            >
                              Redeem Tokens
                            </button>
                          ) : (
                            <>
                              {/* Recent Activity button - first */}
                              <button
                                onClick={() => setActiveTab('recent-trades-sdk')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'recent-trades-sdk'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                Recent Activity
                              </button>

                              {/* My Trades button - second */}
                              <button
                                onClick={() => setActiveTab('my-trades-sdk')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'my-trades-sdk'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                My Trades
                              </button>

                              {/* Position button - third */}
                              <button
                                onClick={() => setActiveTab('position')}
                                className={`pb-2 font-medium transition-colors duration-200 ${activeTab === 'position'
                                  ? 'text-futarchyViolet11 dark:text-futarchyViolet9 border-b-2 border-futarchyViolet9'
                                  : 'text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white border-b-2 border-transparent'
                                  }`}
                              >
                                Position
                              </button>
                            </>
                          )}
                        </div>

                        {/* Filter controls for Recent Activity - only show dropdown */}
                        {activeTab === 'recent-trades-sdk' && (
                          <div className="flex items-center justify-end mt-6 mb-4">
                            <select
                              value={tradesLimit}
                              onChange={(e) => setTradesLimit(Number(e.target.value))}
                              className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
                            >
                              <option value={30}>Last 30 trades</option>
                              <option value={60}>Last 60 trades</option>
                              <option value={90}>Last 90 trades</option>
                            </select>
                          </div>
                        )}

                        {/* Filter controls for My Trades tab - only show dropdown */}
                        {activeTab === 'my-trades-sdk' && (
                          <div className="flex items-center justify-end mt-6 mb-4">
                            <select
                              value={tradesLimit}
                              onChange={(e) => setTradesLimit(Number(e.target.value))}
                              className="text-xs text-futarchyGray11 dark:text-futarchyGray112 bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray62 dark:border-futarchyDarkGray42 rounded-lg px-3 py-1.5 cursor-pointer hover:text-futarchyGray12 dark:hover:text-white hover:border-futarchyGray7 dark:hover:border-futarchyDarkGray5 transition-colors"
                            >
                              <option value={30}>Last 30 trades</option>
                              <option value={60}>Last 60 trades</option>
                              <option value={90}>Last 90 trades</option>
                            </select>
                          </div>
                        )}

                        {/* Tab Content */}
                        <div className={activeTab === 'recent-trades-sdk' || activeTab === 'my-trades-sdk' ? 'mt-2' : 'mt-7'}>
                          {activeTab === 'position' && (
                            <PositionsTable
                              positions={positions}
                              selectedCurrency={selectedCurrency}
                              sdaiRate={sdaiRate}
                              isLoadingRate={isLoadingRate}
                              rateError={rateError}
                              setCurrentTransactionData={setCurrentTransactionData}
                              setIsConfirmModalOpen={setIsConfirmModalOpen}
                              config={config}
                              isLoadingPositions={isLoadingPositions}
                              balanceError={balanceError}
                              refetchBalances={refetchBalances}
                            />
                          )}
                          {activeTab === 'trade-history' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <TradeHistoryTable tokenImages={tokenImages} config={config} />
                            </div>
                          )}
                          {activeTab === 'recent-trades-sdk' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <SubgraphTradesDataLayer
                                tokenImages={tokenImages}
                                config={config}
                                showMyTrades={false}
                                limit={tradesLimit}
                              />
                            </div>
                          )}
                          {activeTab === 'my-trades-sdk' && (
                            <div className="rounded-2xl border border-futarchyGray62 dark:border-futarchyDarkGray42 bg-futarchyGray2 dark:bg-futarchyDarkGray3">
                              <SubgraphTradesDataLayer
                                tokenImages={tokenImages}
                                config={config}
                                showMyTrades={true}
                                limit={tradesLimit}
                              />
                            </div>
                          )}
                          {activeTab === 'redeem-tokens' && (
                            <RedeemTokens config={config} positions={positions} isLoadingPositions={isLoadingPositions} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side - Balance Panel */}
                    <div className="md:col-span-1">
                      <div className="sticky top-24 space-y-8">
                        {(
                          <div className="">
                            <ShowcaseSwapComponent
                              positions={positions}
                              prices={{
                                yesPrice: newYesPrice !== null ? newYesPrice : prices.yesPrice,
                                noPrice: newNoPrice !== null ? newNoPrice : prices.noPrice,
                                yesLegacyPrice: prices.yesLegacyPrice,
                                noLegacyPrice: prices.noLegacyPrice,
                                spotPrice: newBasePrice !== null ? newBasePrice : latestPrices.spotPriceSDAI, // Pass the actual spot price
                                isLoading: prices.isLoading,
                                error: prices.error
                              }}
                              walletBalances={{
                                sdaiBalance: rawBalances.currency,
                                wxdaiBalance: rawBalances.native, // Native xDAI balance
                                nativeBalance: rawBalances.native
                              }}
                              isLoadingBalances={isLoadingPositions}
                              account={address}
                              isConnected={isConnected}
                              onConnectWallet={handleConnectWallet}
                              proposalId={proposalId}
                              marketHasClosed={marketHasClosed}
                            />
                          </div>
                        )}

                        <YourViewCard subject={marketSubject} />

                        {/* Balance Stats Container */}
                        <MarketBalancePanel
                          positions={positions}
                          openSwapNativeModal={openSwapNativeModal}
                          address={address}
                          handleOpenCollateralModal={handleOpenCollateralModal}
                          isLoadingPositions={isLoadingPositions}
                          balanceError={balanceError}
                          refetchBalances={refetchBalances}
                          proposalId={proposalId}
                          devMode={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Add Processing Toast */}
          {showProcessingToast && processingStep && !isCollateralModalOpen && (
            <ProcessingToast
              step={processingStep}
              onToastClick={handleToastClick}
            />
          )}



          {/* Add the modal */}
          {isConfirmModalOpen && (
            <ConfirmSwapModal
              toggleHideCowSwap={!isDebugMode}
              onSafeTransaction={handleSafeTransaction}
              onClose={() => setIsConfirmModalOpen(false)}
              transactionData={{
                ...currentTransactionData,
                isClosingPosition: currentTransactionData?.isClosingPosition || false,
                useExistingCollateral: currentTransactionData?.useExistingCollateral || false
              }}
              existingBalance={selectedAction === 'buy'
                ? (selectedOutcome === 'approved'
                  ? positions?.currencyYes?.total
                  : positions?.currencyNo?.total)
                : (selectedOutcome === 'approved'
                  ? positions?.companyYes?.total
                  : positions?.companyNo?.total)
              }
              additionalCollateralNeeded={(() => {
                // If we're selling or using existing collateral, we don't need additional collateral
                if (currentTransactionData?.action === 'Sell' || currentTransactionData?.useExistingCollateral) {
                  return '0';
                }

                const existingBalance = selectedAction === 'buy'
                  ? (selectedOutcome === 'approved'
                    ? positions?.currencyYes?.total || '0'
                    : positions?.currencyNo?.total || '0')
                  : (selectedOutcome === 'approved'
                    ? positions?.companyYes?.total || '0'
                    : positions?.companyNo?.total || '0');

                try {
                  // Convert to BigNumber for precise calculation
                  const amountBN = ethers.utils.parseUnits(amount || '0', 18);
                  const existingBalanceBN = ethers.utils.parseUnits(existingBalance || '0', 18);

                  // Calculate difference
                  const diffBN = amountBN.sub(existingBalanceBN);

                  // Only return positive differences
                  if (diffBN.gt(ethers.constants.Zero)) {
                    return ethers.utils.formatUnits(diffBN, 18);
                  }
                  return '0';
                } catch (error) {
                  console.error('Error calculating needed amount:', error);
                  return '0';
                }
              })()}
              onTransactionComplete={handleTransactionComplete}
              proposalId={proposalId}
            />
          )}

          {/* Add Split Wrap Modal */}
          <SplitWrapModal
            isOpen={isSplitWrapModalOpen}
            onClose={() => {
              setIsSplitWrapModalOpen(false);
              setSplitWrapAmount('');
              setSplitWrapTokenType('currency');
            }}
            onSubmit={async (amount, tokenType) => {
              await performFutarchySplitWrap(amount, tokenType);
              setIsSplitWrapModalOpen(false);
              setSplitWrapAmount('');
              setSplitWrapTokenType('currency');
            }}
          />

          {/* Add Merge Modal */}
          <MergeModal
            isOpen={isMergeModalOpen}
            onClose={() => {
              setIsMergeModalOpen(false);
              setMergeAmount('');
              setMergeTokenType('currency');
            }}
            onSubmit={async (amount, tokenType) => {
              await performMergePosition(amount, tokenType);
              setIsMergeModalOpen(false);
              setMergeAmount('');
              setMergeTokenType('currency');
            }}
          />

          {/* Add merge button near the split wrap button */}
          <button
            onClick={() => setIsMergeModalOpen(true)}
            disabled={isMerging || !isConnected}
            className={`py-3 px-4 rounded-lg font-semibold transition-colors hidden ${isConnected && !isMerging
              ? 'bg-futarchyGold hover:bg-futarchyGold/80 text-black cursor-pointer'
              : 'bg-futarchyGray6 text-futarchyGray9 cursor-not-allowed'
              }`}
          >
            {isMerging ? 'Merging...' : 'Merge Positions'}
          </button>

          {/* Render Modals */}
          {/* ... existing CollateralModal rendering ... */}
          <AnimatePresence>
            {isCollateralModalOpen && (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
                onClick={handleBackdropClick}
              >
                <CollateralModal
                  onSafeTransaction={handleSafeTransaction}
                  // ... props ...
                  title={collateralModalType === 'add' ? 'Add Collateral' : 'Merge Collateral'}
                  supportText=""
                  handleClose={handleCloseCollateralModal}
                  handleActionButtonClick={(tokenType, amount) => handleCollateralAction(tokenType, amount, collateralModalType)}
                  connectedWalletAddress={address}
                  alertContainerTitle="Collateral Information"
                  alertSupportText="Only deposit funds you intend to use for interactions within this proposal. Your collateral remains yours and can be retrieved at any time when not actively used in ongoing trades."
                  tokenConfig={config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG}
                  balances={positions}
                  processingStep={processingStep}
                  action={collateralModalType}
                  proposalId={proposalId}
                  config={config}
                  configLoading={configLoading}
                />
              </div>
            )}
          </AnimatePresence>

          {/* ... existing ConfirmSwapModal rendering ... */}
          <AnimatePresence>
            {isConfirmModalOpen && currentTransactionData && (
              <ConfirmSwapModal
                toggleHideCowSwap={!isDebugMode}
                onSafeTransaction={handleSafeTransaction}
                // ... props ...
                onClose={() => setIsConfirmModalOpen(false)}
                transactionData={{
                  ...currentTransactionData,
                  isClosingPosition: currentTransactionData?.isClosingPosition || false,
                  useExistingCollateral: currentTransactionData?.useExistingCollateral || false
                }}
                existingBalance={selectedAction === 'buy'
                  ? (selectedOutcome === 'approved'
                    ? positions?.currencyYes?.total
                    : positions?.currencyNo?.total)
                  : (selectedOutcome === 'approved'
                    ? positions?.companyYes?.total
                    : positions?.companyNo?.total)
                }
                additionalCollateralNeeded={(() => {
                  // If we're selling or using existing collateral, we don't need additional collateral
                  if (currentTransactionData?.action === 'Sell' || currentTransactionData?.useExistingCollateral) {
                    return '0';
                  }

                  const existingBalance = selectedAction === 'buy'
                    ? (selectedOutcome === 'approved'
                      ? positions?.currencyYes?.total || '0'
                      : positions?.currencyNo?.total || '0')
                    : (selectedOutcome === 'approved'
                      ? positions?.companyYes?.total || '0'
                      : positions?.companyNo?.total || '0');

                  try {
                    // Convert to BigNumber for precise calculation
                    const amountBN = ethers.utils.parseUnits(amount || '0', 18);
                    const existingBalanceBN = ethers.utils.parseUnits(existingBalance || '0', 18);

                    // Calculate difference
                    const diffBN = amountBN.sub(existingBalanceBN);

                    // Only return positive differences
                    if (diffBN.gt(ethers.constants.Zero)) {
                      return ethers.utils.formatUnits(diffBN, 18);
                    }
                    return '0';
                  } catch (error) {
                    console.error('Error calculating needed amount:', error);
                    return '0';
                  }
                })()}
                onTransactionComplete={handleTransactionComplete}
                proposalId={proposalId}
              />
            )}
          </AnimatePresence>

          {/* <-- Render the new SwapNativeToCurrencyModal --> */}
          <AnimatePresence>
            {isSwapNativeModalOpen && (
              <SwapNativeToCurrencyModal
                isOpen={isSwapNativeModalOpen}
                onClose={closeSwapNativeModal}
              />
            )}
          </AnimatePresence>
          {isPredictionMarketModalOpen && (
            <PredictionMarketModal
              isOpen={isPredictionMarketModalOpen}
              onClose={() => setIsPredictionMarketModalOpen(false)}
              config={config}
            />
          )}
          <AddLiquidityModal
            isOpen={isAddLiquidityModalOpen}
            onClose={() => setIsAddLiquidityModalOpen(false)}
            config={config}
          />
          <CreatePoolModal
            isOpen={isCreatePoolModalOpen}
            onClose={() => setIsCreatePoolModalOpen(false)}
            config={config}
            onPoolCreated={refetchConfig}
          />
          {isEditProposalModalOpen && (
            <EditProposalModal
              isOpen={isEditProposalModalOpen}
              onClose={() => setIsEditProposalModalOpen(false)}
              proposalMetadataAddress={config?.proposalMetadataAddress}
            />
          )}

          {/* Other Modals like SplitWrapModal, MergeModal */}
          {/* ... existing modal rendering ... */}
          <SplitWrapModal
            isOpen={isSplitWrapModalOpen}
            onClose={() => {
              setIsSplitWrapModalOpen(false);
              setSplitWrapAmount('');
              setSplitWrapTokenType('currency');
            }}
            onSubmit={async (amount, tokenType) => {
              await performFutarchySplitWrap(amount, tokenType);
              setIsSplitWrapModalOpen(false);
              setSplitWrapAmount('');
              setSplitWrapTokenType('currency');
            }}
          />
          <MergeModal
            isOpen={isMergeModalOpen}
            onClose={() => {
              setIsMergeModalOpen(false);
              setMergeAmount('');
              setMergeTokenType('currency');
            }}
            onSubmit={async (amount, tokenType) => {
              await performMergePosition(amount, tokenType);
              setIsMergeModalOpen(false);
              setMergeAmount('');
              setMergeTokenType('currency');
            }}
          />

          {/* Snapshot Results Widget */}
          <SnapshotWidget
            snapshotData={snapshotData}
            snapshotLoading={snapshotLoading}
            snapshotSource={snapshotSource}
            snapshotProposalId={snapshotProposalId}
            snapshotHighestResult={snapshotHighestResult}
          />

          {/* Snapshot Debug Console - Shows when debug mode is active */}
          {SHOW_DATA_DEBUG && isDebugMode && (
            <div className="fixed top-4 right-4 z-50 bg-black/90 text-white p-4 rounded-lg max-w-md text-xs font-mono">
              <div className="font-bold mb-2 text-futarchyViolet9">📊 Snapshot Widget Debug</div>
              <div className="space-y-1">
                <div><span className="text-futarchyGray112">Market Address:</span> {MARKET_ADDRESS || 'N/A'}</div>
                <div><span className="text-futarchyGray112">Loading:</span> {snapshotLoading ? '⏳ Yes' : '✅ No'}</div>
                <div><span className="text-futarchyGray112">Error:</span> {snapshotError || 'None'}</div>
                <div><span className="text-futarchyGray112">Source:</span> {snapshotSource || 'N/A'}</div>
                <div><span className="text-futarchyGray112">Snapshot Proposal ID:</span> {snapshotProposalId || '❌ Not Found'}</div>
                <div><span className="text-futarchyGray112">Has Data:</span> {snapshotData ? '✅ Yes' : '❌ No'}</div>
                {snapshotData && (
                  <>
                    <div><span className="text-futarchyGray112">Items:</span> {snapshotData.items?.length || 0}</div>
                    <div><span className="text-futarchyGray112">Total Votes:</span> {snapshotData.totalCount || 0}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Market Analytics Toast - Hidden on Mobile and when debug mode is false */}
          {SHOW_DATA_DEBUG && isDebugMode && (
            <div className="hidden md:block">
              <MarketStatsDebugToast
                prices={prices}
                positions={positions}
                newYesPrice={newYesPrice}
                newNoPrice={newNoPrice}
                newThirdPrice={newThirdPrice}
                newBasePrice={newBasePrice}
                contractConfig={config}
              />
            </div>
          )}

          {/* Commenting out the debug display for new Algebra prices as they are now integrated into the main display */}
          {/* <div style={{marginTop: 16, marginBottom: 16, padding: 12, background: '#23272c', borderRadius: 8}}>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New Yes Price (Algebra): {newYesPrice !== null ? newYesPrice : 'Loading...'}</div>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New No Price (Algebra): {newNoPrice !== null ? newNoPrice : 'Loading...'}</div>
            <div style={{color: '#fff', fontWeight: 'bold'}}>New Third Price (Algebra): {newThirdPrice !== null ? newThirdPrice : 'Loading...'}</div>
            <div style={{color: '#aaa', fontSize: 12}}>These are from the Algebra pool. Old prices are still shown for comparison.</div>
          </div> */}

          {/* ---> Add Pending Order Toast Rendering <--- */}
          <PendingOrderToast count={pendingOrderCount} userAddress={address} />
          {/* Ensure this is rendered outside conditional blocks if needed,
              or adjust placement based on desired stacking context */}

          {safeToastVisible && (
            <SafeTransactionToast onClose={() => setSafeToastVisible(false)} />
          )}
        </PageLayout>
      </RootLayout>
    </>
  );
};

export default MarketPageShowcase;
