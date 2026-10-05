# SushiSwap Integration Documentation

## Overview
This documentation explains how the SushiSwap DEX integration is implemented in the Futarchy application. The integration uses SushiSwap's V5 API for route fetching and the V2 Router for executing swaps.

## Core Components

### 1. SushiSwap Helper (`sushiswapHelper.js`)
The main utility file that handles all SushiSwap-related operations.

#### Key Functions:

##### `fetchSushiSwapRoute`
```javascript
fetchSushiSwapRoute({
  tokenIn,      // Input token address
  tokenOut,     // Output token address
  amount,       // Amount in wei
  userAddress,  // User's wallet address
  feeReceiver,  // Fee receiver address
  options      // Optional parameters (slippage, gas price, etc.)
})
```

##### `executeSushiSwapRoute`
```javascript
executeSushiSwapRoute({
  signer,        // Ethers signer
  routerAddress, // SushiSwap router address
  routeData,     // Route data from fetchSushiSwapRoute
  options        // Transaction options
})
```

### 2. Route Construction Process

#### Step 1: API Request
- Constructs URL with parameters for SushiSwap V5 API
- Endpoint: `https://api.sushi.com/swap/v5/100`
- Parameters include:
  - Token addresses
  - Amount
  - Slippage
  - Gas price
  - Fee settings

#### Step 2: Route Bytes Construction
The route bytes are constructed in a specific format:

```
[numHops (2 bytes)]
For each hop:
  [tokenAddress (40 bytes)]
  [poolType (2 bytes)]
  [fee (4 bytes)]
  [poolAddress (40 bytes)]
  [nextHopIndicator (2 bytes)] // Only for non-last hops
[protocolId (6 bytes)]
```

#### Step 3: Route Validation
- Validates route format
- Checks protocol identifier (`000bb8` for V2)
- Verifies route length matches expected length
- Confirms token addresses match input/output

### 3. Integration in MarketPage

#### Swap Component Implementation
```javascript
const handleConfirmSwap = async () => {
  // 1. Token Approval
  await handleTokenApproval(
    tokenIn,
    SUSHISWAP_V2_ROUTER,
    amountInWei
  );

  // 2. Fetch Route
  const routeData = await fetchSushiSwapRoute({
    tokenIn,
    tokenOut,
    amount: amountInWei,
    userAddress,
    feeReceiver
  });

  // 3. Execute Swap
  const swapTx = await executeSushiSwapRoute({
    signer,
    routerAddress: SUSHISWAP_V2_ROUTER,
    routeData
  });
}
```

## Technical Details

### Route Format Breakdown
1. **Number of Hops**: First 2 bytes
   ```
   01 = Single hop
   02 = Two hops
   etc.
   ```

2. **Per Hop Data**:
   ```
   Token Address:  40 bytes (Ethereum address)
   Pool Type:      02 bytes (01 = SushiSwap V2)
   Fee:            04 bytes (ffff = standard fee)
   Pool Address:   40 bytes (Pool contract address)
   Next Indicator: 02 bytes (01 if more hops)
   ```

3. **Protocol Identifier**:
   ```
   000bb8 = SushiSwap V2 identifier
   ```

### Error Handling
- Validates API response status
- Checks transaction data format
- Verifies route construction
- Validates token addresses
- Handles approval failures
- Manages swap execution errors

## Usage Example

```javascript
// 1. Initialize swap parameters
const swapParams = {
  tokenIn: "0x...",  // Input token address
  tokenOut: "0x...", // Output token address
  amount: ethers.utils.parseEther("1.0"),
  userAddress: "0x...",
  feeReceiver: "0x..."
};

// 2. Fetch optimal route
const routeData = await fetchSushiSwapRoute(swapParams);

// 3. Execute swap
const tx = await executeSushiSwapRoute({
  signer: provider.getSigner(),
  routerAddress: SUSHISWAP_V2_ROUTER,
  routeData
});

// 4. Wait for confirmation
await tx.wait();
```

## Important Notes

1. **Gas Optimization**
   - Default gas limit: 400,000
   - Default gas price: 0.97 gwei
   - Customizable via options parameter

2. **Safety Checks**
   - Token approval verification
   - Route validation
   - Protocol identifier verification
   - Length validation
   - Token address matching

3. **Debugging**
   - Extensive console logging
   - Route breakdown information
   - Transaction parameter details
   - API response analysis

4. **Limitations**
   - Only supports SushiSwap V2 pools
   - Maximum route length determined by gas limits
   - Requires proper token approvals 