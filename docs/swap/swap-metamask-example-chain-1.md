# MetaMask Interaction Example: Chain 1 (Tesla Market)

This document illustrates the **exact function calls** a user will sign in MetaMask for the following scenario on Ethereum Mainnet.

## Scenario
*   **Market**: Tesla Shareholder Vote
*   **User Goal**: Swap **100 YES_USDS** for **YES_TSLAon**.
*   **Current Wallet**:
    *   **USDS**: 1000 (Sufficient collateral)
    *   **YES_USDS**: 5 (Existing position)
*   **Market Price**: ~400 USDS per TSLAon (Implied).

## Smart Split Logic
The system detects the user needs **100 YES_USDS** but already has **5**.
*   **Missing Amount**: 100 - 5 = **95 YES_USDS**.
*   **Action**: Split **95 USDS** (Collateral) to mint the missing 95 YES_USDS.

---

## Transaction Sequence

### 1. Approve USDS (If needed)
*Standard ERC20 Approval for the Futarchy Router to spend USDS.*

*   **Contract**: `0xdC035D45d973E3EC169d2276DDab16f1e407384F` (USDS)
*   **Function**: `approve`
*   **Spender**: `0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc` (FutarchyRouter)
*   **Amount**: `95000000000000000000` (95 USDS) or `MaxUint256`

### 2. Split Position (The "Smart Split")
*Splitting exactly 95 USDS to reach the target of 100 YES_USDS.*

*   **Contract**: `0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc` (FutarchyRouter)
*   **Function**: `splitPosition`
*   **Payload (Decoded)**:
    *   `proposal`: `[Market Address]`
    *   `collateralToken`: `0xdC035D45d973E3EC169d2276DDab16f1e407384F` (USDS)
    *   `amount`: `95000000000000000000` (**95 Ether**)

### 3. Approve Permit2 (One-Time Setup)
*Allowing Permit2 to control YES_USDS. Only done once per token.*

*   **Contract**: `0x87f94FaBA3e8FD5fbb9f49F7e9Ab24E8fC6E7B7E` (YES_USDS)
*   **Function**: `approve`
*   **Spender**: `0x000000000022D473030F116dDEE9F6B43aC78BA3` (Permit2)
*   **Amount**: `MaxUint256`

### 4. Permit2 Approval (Signature or Transaction)
*Authorizing Universal Router to spend 100 YES_USDS via Permit2.*

*   **Contract**: `0x000000000022D473030F116dDEE9F6B43aC78BA3` (Permit2)
*   **Function**: `approve`
*   **Payload (Decoded)**:
    *   `token`: `0x87f94FaBA3e8FD5fbb9f49F7e9Ab24E8fC6E7B7E` (YES_USDS)
    *   `spender`: `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` (Universal Router)
    *   `amount`: `1461501637330902918203684832716283019655932542975` (MaxUint160)
    *   `expiration`: `281474976710655` (Far future)

### 5. Execute Swap (Universal Router)
*Swapping the total 100 YES_USDS (5 existing + 95 split).*

*   **Contract**: `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` (Universal Router)
*   **Function**: `execute`
*   **Value**: `0 ETH`
*   **Inputs**:
    *   `commands`: `0x0004` (V3_SWAP_EXACT_IN + SWEEP)
    *   `inputs`: `[Bytes Array]`

#### Detailed Input Decoding:

**Command 0x00 (V3_SWAP_EXACT_IN):**
*   `recipient`: `0x0000000000000000000000000000000000000002` (Router internal buffer)
*   `amountIn`: `100000000000000000000` (**100 Ether** - Total Amount)
*   `amountOutMin`: `247500000000000000` (~0.2475 YES_TSLAon, assuming 1% slippage at 400 price)
*   `path`: `[YES_USDS] + [Fee: 500] + [YES_TSLAon]`
    *   `0x87f94FaBA3e8FD5fbb9f49F7e9Ab24E8fC6E7B7E` (YES_USDS)
    *   `0001F4` (500 = 0.05%)
    *   `0x192e4580d85dc767F81F8AD02428F042E3c1074e` (YES_TSLAon)
*   `payerIsUser`: `true` (Triggers Permit2 transferFrom)

**Command 0x04 (SWEEP):**
*   `token`: `0x192e4580d85dc767F81F8AD02428F042E3c1074e` (YES_TSLAon)
*   `recipient`: `[User Wallet Address]`
*   `amountMin`: `247500000000000000` (Same as swap min)
