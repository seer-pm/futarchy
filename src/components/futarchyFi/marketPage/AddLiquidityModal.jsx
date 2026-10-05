import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, usePublicClient } from 'wagmi';
import { ethers } from 'ethers';
import { getUserPositions } from '../../../utils/uniswapV3Helper';
import { getEthersProvider } from '../../../utils/ethersAdapters';

const AddLiquidityModal = ({ isOpen, onClose, config }) => {
    const { address, isConnected } = useAccount();
    // Positions are read on the market's chain. Without the chainId this was
    // the wallet's chain, so a wallet on another network scanned the wrong
    // chain and every lookup failed.
    const publicClient = usePublicClient({ chainId: config?.chainId });
    const [positions, setPositions] = useState([]);
    const [isLoadingPositions, setIsLoadingPositions] = useState(false);
    const [fetchError, setFetchError] = useState(null);

    // Fetch positions when modal opens
    useEffect(() => {
        const fetchPositions = async () => {
            if (!isOpen || !isConnected || !config || !publicClient || config.chainId !== 1) {
                setPositions([]);
                return;
            }

            setIsLoadingPositions(true);
            try {
                const provider = getEthersProvider(publicClient);

                // Check ALL pools (Conditional, Prediction, Company)
                const allPoolsToCheck = [
                    ...conditionalPools,
                    ...predictionPools,
                    ...tokenPools
                ];

                // Swapr NFPM on Gnosis Chain
                const SWAPR_NFPM_ADDRESS_GNOSIS = '0x91fD594c46D8B01E62dBDeBed2401dde01817834';

                const positionsPromises = allPoolsToCheck.map(pool =>
                    getUserPositions({
                        provider,
                        userAddress: address,
                        token0: pool.tokenA,
                        token1: pool.tokenB,
                        fee: 500,
                        // Use Swapr contract if on Gnosis (100), otherwise default to Uniswap (Mainnet)
                        managerAddress: config?.chainId == 100 ? SWAPR_NFPM_ADDRESS_GNOSIS : undefined
                    })
                );

                const results = await Promise.all(positionsPromises);

                // Flatten and deduplicate
                const uniquePositions = [];
                const seenIds = new Set();

                results.flat().forEach(pos => {
                    if (!seenIds.has(pos.tokenId)) {
                        seenIds.add(pos.tokenId);
                        uniquePositions.push(pos);
                    }
                });

                setPositions(uniquePositions);
                setFetchError(null);

            } catch (error) {
                console.error("Failed to fetch positions", error);
                if (error.message === "TOO_MANY_POSITIONS" || error.message?.includes("TOO_MANY_POSITIONS")) {
                    setFetchError("TOO_MANY_POSITIONS");
                } else {
                    setFetchError("GENERIC_ERROR");
                }
            } finally {
                setIsLoadingPositions(false);
            }
        };

        fetchPositions();
    }, [isOpen, isConnected, config, publicClient, address, config?.chainId]);

    if (!isOpen || !config) return null;

    const conditionalPools = [
        {
            name: `YES ${config.BASE_TOKENS_CONFIG?.company?.symbol || 'Company'} / YES ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
        },
        {
            name: `NO ${config.BASE_TOKENS_CONFIG?.company?.symbol || 'Company'} / NO ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
        }
    ].filter(p => p.tokenA && p.tokenB);

    const predictionPools = [
        {
            name: `YES ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'} / ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.BASE_TOKENS_CONFIG?.currency?.address,
        },
        {
            name: `NO ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'} / ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.BASE_TOKENS_CONFIG?.currency?.address,
        }
    ].filter(p => p.tokenA && p.tokenB);

    const tokenPools = [
        {
            name: `YES ${config.BASE_TOKENS_CONFIG?.company?.symbol || 'Company'} / ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.BASE_TOKENS_CONFIG?.currency?.address,
        },
        {
            name: `NO ${config.BASE_TOKENS_CONFIG?.company?.symbol || 'Company'} / ${config.BASE_TOKENS_CONFIG?.currency?.symbol || 'Currency'}`,
            tokenA: config.MERGE_CONFIG?.companyPositions?.no?.wrap?.wrappedCollateralTokenAddress,
            tokenB: config.BASE_TOKENS_CONFIG?.currency?.address,
        }
    ].filter(p => p.tokenA && p.tokenB);

    const createLiquidityUrl = (tokenA, tokenB) => {
        // Use Uniswap V3 for Ethereum mainnet (chain 1), Swapr for other chains
        if (config?.chainId === 1) {
            // Uniswap V3 add liquidity URL format with proper fee structure
            const feeParam = encodeURIComponent(JSON.stringify({ feeAmount: 500, tickSpacing: 10, isDynamic: false }));
            const priceRangeParam = encodeURIComponent(JSON.stringify({ priceInverted: false, fullRange: true, minPrice: "", maxPrice: "", initialPrice: "" }));
            const depositParam = encodeURIComponent(JSON.stringify({ exactField: "TOKEN0", exactAmounts: {} }));
            return `https://app.uniswap.org/positions/create/v3?currencyA=${tokenA}&currencyB=${tokenB}&chain=ethereum&fee=${feeParam}&hook=undefined&priceRangeState=${priceRangeParam}&depositState=${depositParam}`;
        }
        return `https://v3.swapr.eth.limo/#/add/${tokenA}/${tokenB}/select-pair`;
    };

    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 }
    };

    const modalVariants = {
        hidden: { opacity: 0, scale: 0.8 },
        visible: { opacity: 1, scale: 1 }
    };

    const getPositionsForSection = (sectionPools) => {
        if (!positions || positions.length === 0) return [];
        return positions.filter(pos =>
            sectionPools.some(pool =>
                (pool.tokenA.toLowerCase() === pos.token0.toLowerCase() && pool.tokenB.toLowerCase() === pos.token1.toLowerCase()) ||
                (pool.tokenA.toLowerCase() === pos.token1.toLowerCase() && pool.tokenB.toLowerCase() === pos.token0.toLowerCase())
            )
        );
    };

    const renderPoolSection = (title, pools) => {
        const sectionPositions = getPositionsForSection(pools);

        // Show section if there are pools OR positions (though positions imply pools exist usually)
        if (pools.length === 0 && sectionPositions.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-futarchyGray12 dark:text-futarchyGray3 mb-3">{title}</h3>

                {/* Add Liquidity Links */}
                {pools.length > 0 && (
                    <div className="space-y-2 mb-4">
                        {pools.map((pool, index) => (
                            <a
                                key={index}
                                href={createLiquidityUrl(pool.tokenA, pool.tokenB)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3 bg-futarchyGray3 dark:bg-futarchyDarkGray4 hover:bg-futarchyGray4 dark:hover:bg-futarchyDarkGray5 rounded-lg border border-futarchyGray6 dark:border-futarchyGray112/20 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium">{pool.name}</span>
                                    <svg className="w-4 h-4 text-futarchyGray11 dark:text-futarchyGray112" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                {/* Manage Positions Links - Categorized */}
                {sectionPositions.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-futarchyBlue/30">
                        <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112 mb-2 font-medium">Your Positions ({sectionPositions.length})</p>
                        <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 snap-x no-scrollbar">
                            {sectionPositions.map((pos, index) => (
                                <a
                                    key={index}
                                    href={pos.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-[260px] snap-center flex-shrink-0 p-3 bg-futarchyBlue/10 hover:bg-futarchyBlue/20 rounded-lg border border-futarchyBlue/30 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-futarchyGray12 dark:text-futarchyGray3 font-medium text-sm">Position #{pos.tokenId}</span>
                                            <span className="text-xs text-futarchyGray11 dark:text-futarchyGray112">Liquidity: {pos.liquidityFormatted || parseFloat(ethers.utils.formatUnits(pos.liquidity, 18)).toFixed(4)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-futarchyBlue">
                                            <span className="text-xs font-medium">Manage</span>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
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
                            <h2 className="text-xl font-bold text-futarchyGray12 dark:text-futarchyGray3">Add Liquidity</h2>
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
                            Add liquidity to earn fees from trades.
                            {config?.chainId === 1
                                ? " Click on any pool to open Uniswap V3 and add liquidity."
                                : " Click on any pool to open Swapr and add liquidity."
                            }
                        </div>

                        {config?.chainId === 1 && isLoadingPositions && (
                            <div className="text-center py-2 text-xs text-futarchyGray11 animate-pulse">Scanning for your positions...</div>
                        )}



                        {renderPoolSection("Conditional Pools", conditionalPools)}
                        {renderPoolSection("Prediction Pools", predictionPools)}
                        {renderPoolSection("Company Token Pools", tokenPools)}

                        {fetchError === "TOO_MANY_POSITIONS" ? (
                            <div className="text-center text-futarchyYellow text-sm py-8 px-4">
                                <span className="block font-bold mb-1">Found too many positions ({'>'}50)</span>
                                Automatic scanning is disabled to prevent timeouts.
                                <br />Please ensure you are connected to the correct wallet.
                            </div>
                        ) : conditionalPools.length === 0 && predictionPools.length === 0 && tokenPools.length === 0 ? (
                            <div className="text-center text-futarchyGray11 dark:text-futarchyGray112 py-8">
                                No liquidity pools available for this market.
                            </div>
                        ) : null}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AddLiquidityModal;
