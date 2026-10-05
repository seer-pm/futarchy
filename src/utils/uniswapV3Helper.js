import { ethers } from 'ethers';

/**
 * Uniswap V3 position reads for the Add Liquidity dialog.
 */

export const UNISWAP_V3_NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // NFT Position Manager

/**
 * Uniswap V3 NonfungiblePositionManager ABI
 */
export const NFPM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

/**
 * Get user's Uniswap V3 positions for a specific pool
 * @param {Object} params - Parameters
 * @param {Object} params.provider - Ethers provider
 * @param {string} params.userAddress - User address
 * @param {string} params.token0 - Token 0 address
 * @param {string} params.token1 - Token 1 address
 * @param {number} params.fee - Fee tier
 * @returns {Promise<Array>} Array of position objects with tokenId, liquidity, and link
 */
export const getUserPositions = async ({
  provider,
  userAddress,
  token0,
  token1,
  fee = 500,
  managerAddress = UNISWAP_V3_NFT_POSITION_MANAGER // Allow overriding the manager address (e.g. for Swapr)
}) => {
  if (!provider || !userAddress || !token0 || !token1) return [];

  try {
    const nfpmContract = new ethers.Contract(managerAddress, NFPM_ABI, provider);
    const balance = await nfpmContract.balanceOf(userAddress);

    if (balance.eq(0)) return [];

    // Safety check: deeply iterating many positions (RPC heavy) causes timeouts/lag.
    // If user has > 50 positions, we abort and ask them to check manually.
    if (balance.gt(50)) {
      throw new Error("TOO_MANY_POSITIONS");
    }

    const positions = [];
    const targetA = token0.toLowerCase();
    const targetB = token1.toLowerCase();
    const targetFee = Number(fee);

    // Loop through all positions
    for (let i = 0; i < balance.toNumber(); i++) {
      try {
        const tokenId = await nfpmContract.tokenOfOwnerByIndex(userAddress, i);
        const position = await nfpmContract.positions(tokenId);

        const posToken0 = position.token0.toLowerCase();
        const posToken1 = position.token1.toLowerCase();
        const posFee = Number(position.fee);

        // Check match
        const isMatch =
          (posFee === targetFee) &&
          ((posToken0 === targetA && posToken1 === targetB) ||
            (posToken0 === targetB && posToken1 === targetA));

        if (isMatch && position.liquidity.gt(0)) {
          // Also check if liquidity > 0 to only show active positions? 
          // Or show all. The user requested "remove liquidity", so likely active ones.
          // Let's include 0 liquidity ones too as "Closed" if needed, but for now filtering liquidity > 0 is safer for "manage" context.
          // Actually, let's return all matching positions.
          positions.push({
            tokenId: tokenId.toString(),
            liquidity: position.liquidity.toString(),
            token0: posToken0,
            token1: posToken1,
            fee: posFee,
            link: `https://app.uniswap.org/pools/${tokenId}`
          });
        }
      } catch (err) {
        console.warn(`Error fetching position at index ${i}`, err);
      }
    }

    return positions;
  } catch (error) {
    console.error("Error fetching user positions:", error);
    return [];
  }
};
