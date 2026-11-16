# Automatic Futarchy Pool Setup

This document explains how to use the automatic mode for setting up Futarchy pools without interactive prompts.

## Quick Start

1. **Create a configuration file** based on one of the examples:
   - `futarchy-config.example` (KEY=VALUE format)
   - `futarchy-config.example.json` (JSON format)

2. **Run the automatic setup**:
   ```bash
   node algebra-cli.js setupFutarchyPoolsAuto my-config.txt
   # or for JSON format
   node algebra-cli.js setupFutarchyPoolsAuto my-config.json
   ```

## Configuration Parameters

| Parameter | Required | Type | Description | Example |
|-----------|----------|------|-------------|---------|
| `PROPOSAL_ADDRESS` | ❌ | Address | The deployed Futarchy proposal contract address. **Leave empty to create new proposal automatically** | `0x1234...` or `` |
| `SPOT_PRICE` | ✅ | Number | Current price of company token in currency token | `119.77` |
| `EVENT_PROBABILITY` | ✅ | Number | Initial 'YES' outcome probability (0.0-1.0) | `0.5` |
| `IMPACT` | ✅ | Number | Expected price impact percentage if proposal passes | `10` |
| `LIQUIDITY_DEFAULT` | ✅ | Number | Default liquidity amount for each pool | `1000` |
| `ADAPTER_ADDRESS` | ❌ | Address | Futarchy adapter contract address | `0x7495...` |

## Configuration File Formats

### KEY=VALUE Format (`my-config.txt`)
```bash
# Futarchy Pool Setup Configuration
# Leave PROPOSAL_ADDRESS empty to create new proposal automatically
PROPOSAL_ADDRESS=
SPOT_PRICE=119.77
EVENT_PROBABILITY=0.5
IMPACT=10
LIQUIDITY_DEFAULT=1000
ADAPTER_ADDRESS=0x7495a583ba85875d59407781b4958ED6e0E1228f
```

### JSON Format (`my-config.json`)
```json
{
  "proposalAddress": "",
  "spotPrice": 119.77,
  "eventProbability": 0.5,
  "impact": 10,
  "liquidityDefault": 1000,
  "adapterAddress": "0x7495a583ba85875d59407781b4958ED6e0E1228f"
}
```

## New Proposal + Pool Setup (One Command)

You can create a new proposal and set up all 6 pools in one command:

```bash
# Using the new proposal example config
npm run futarchy:auto:new

# Or create your own config with empty proposalAddress
cp futarchy-config-new-proposal.example.json my-new-proposal.json
npm run futarchy:auto my-new-proposal.json
```

### Questions with several answers (categorical)

A question with N answers, such as an election, needs `"proposalType": "categorical"`
and an `outcomes` list; see `futarchy-config-categorical.example.json`. It is created on
`FutarchyCategoricalFactory` (`categoricalFactoryAddress` or `CATEGORICAL_FACTORY_ADDRESS`),
which adds Invalid as the last outcome. `tokenNames` are optional prefixes: each answer's
tokens are named `<NAME>_<collateral symbol>` (31 bytes at most), from the answer by default.
The interactive mode (`npm run futarchy:create`) asks for the question type first.

The six-pool setup below only handles Yes/No proposals: for a categorical proposal the
script creates it and stops before pool setup. `categorical-pools.js` then creates and
funds two pools per answer (conditional `ANSWER_<company>/ANSWER_<currency>` at the spot
price, prediction `ANSWER_<currency>/<currency>`); Invalid gets none. It prints the plan
and only sends with `--send`, and skips pools that already have liquidity:

```bash
npm run categorical:pools -- <proposal> --spot 1429 --split-company 0.0007 --split-currency 2 --prediction 0.9 --send
```

## What Happens in Automatic Mode

The script will automatically:

1. **Fetch proposal details** from the contract
2. **Resolve conditional token addresses** (YES_GNO, NO_GNO, YES_sDAI, NO_sDAI)
3. **Calculate optimal prices** for all 6 pools based on your configuration:
   - Pool 1: YES_GNO / YES_sDAI (Price-Correlated)
   - Pool 2: NO_GNO / NO_sDAI (Price-Correlated)
   - Pool 3: YES_GNO / sDAI (Expected Value)
   - Pool 4: NO_GNO / sDAI (Expected Value)
   - Pool 5: YES_sDAI / sDAI (Prediction Market) ⭐
   - Pool 6: NO_sDAI / sDAI (Prediction Market)
4. **Add liquidity** to all pools using the default amount
5. **Split tokens** automatically when needed (GNO → YES_GNO/NO_GNO, sDAI → YES_sDAI/NO_sDAI)
6. **Create pools** if they don't exist
7. **Generate a summary JSON** with all pool addresses and transaction links

## Price Calculation Formulas

The script uses these formulas to calculate pool prices:

- **YES Price**: `spotPrice × (1 + impact × (1 - probability))`
- **NO Price**: `spotPrice × (1 - impact × probability)`
- **YES Expected Value**: `spotPrice × probability`
- **NO Expected Value**: `spotPrice × (1 - probability)`
- **YES/NO Currency Prediction**: `probability` and `(1 - probability)`

## Example

With the configuration:
- Spot Price: 119.77 sDAI per GNO
- Event Probability: 50% (0.5)
- Impact: 10%

The calculated prices would be:
- YES_GNO price: 125.76 sDAI per YES_GNO
- NO_GNO price: 113.78 sDAI per NO_GNO
- YES_GNO expected value: 59.89 sDAI per YES_GNO
- NO_GNO expected value: 59.89 sDAI per NO_GNO
- YES_sDAI probability: 0.5 sDAI per YES_sDAI
- NO_sDAI probability: 0.5 sDAI per NO_sDAI

## Prerequisites

1. **Environment Setup**: Make sure you have `.env` file with `PRIVATE_KEY`
2. **Token Balances**: Ensure your wallet has sufficient GNO and sDAI for:
   - Splitting into conditional tokens
   - Adding liquidity to pools
3. **Gas**: Have enough xDAI for transaction fees

## Output

The script generates:
- **Console logs** showing progress and transaction links
- **JSON summary** saved to file with all pool addresses
- **Transaction history** with Gnosisscan links

## Troubleshooting

### "Insufficient balance" errors
- Check your GNO and sDAI balances
- Remember that conditional tokens are created by splitting underlying tokens

### "Invalid proposal address" error
- Verify the proposal contract address is correct
- Ensure the contract is deployed on Gnosis Chain

### "Pool already exists" messages
- The script will automatically add liquidity to existing pools
- This is normal behavior, not an error

## Advanced Usage

You can also use automatic mode programmatically:
```javascript
const config = {
  spotPrice: 119.77,
  eventProbability: 0.5,
  impact: 10,
  liquidityDefault: 1000,
  adapterAddress: "0x7495a583ba85875d59407781b4958ED6e0E1228f"
};

await setupPoolsFromFutarchyProposal(proposalAddress, config);
``` 