# 🔍 Swapr Debug Panel

## Overview
A visual debug component that displays real-time stats about Swapr SDK calls, helping identify excessive RPC usage and duplicate calls.

## Location
The debug panel appears as a fixed button in the bottom-right corner of the Market Page.

## Features

### 1. Collapsed View (Default)
- Shows total call count
- Color-coded indicator:
  - 🔵 **Blue**: Normal (< 10 calls)
  - 🔴 **Red**: High call count (≥ 10 calls)
- Click to expand

### 2. Expanded View
Shows detailed information:

#### Stats Summary
- **Total Calls**: Number of times `getSwaprV3QuoteWithPriceImpact()` was called
- **Unique Pools**: Number of different pool addresses accessed
- **Token Pairs**: Number of different token pair combinations

#### Controls
- **⏸️ Pause / ▶️ Auto**: Toggle auto-refresh (every 2 seconds)
- **🔄 Refresh**: Manual refresh of stats
- **📋 Copy**: Copy all stats to clipboard
- **✕**: Close panel

#### Warnings
- **⚠️ High Call Count**: Appears when total calls > 10
- **⚠️ Duplicate Calls**: Appears when same token pairs called multiple times

#### Token Pairs
- List of all unique token pairs that have been swapped
- Format: `tokenIn->tokenOut`

#### Recent Calls
- Last 10 calls with:
  - Call number
  - Icon indicating status:
    - 🚀 Function entry
    - ✅ Completed
    - ❌ Failed
    - 📊 Other events
  - Token pair
  - Duration (if available)
  - Timestamp
- Duplicate calls highlighted in orange

## Usage

### Normal Operation
1. Navigate to a market page
2. The debug panel will appear in bottom-right
3. Shows call count in collapsed view
4. Click to expand for details

### When Problems Occur
If you see high call counts or warnings:

1. **Click the panel** to expand
2. **Check Recent Calls** for patterns:
   - Are the same token pairs being called repeatedly?
   - How long is each call taking?
3. **Click Copy** to save stats for debugging
4. Check the browser console for detailed logs with 🔍 emoji

### Copy Format
When you click **Copy**, the clipboard contains:
```
🔍 SWAPR SDK DEBUG STATS
========================
Total Calls: X
Unique Pools: Y
Unique Token Pairs: Z

📊 TOKEN PAIRS:
  - tokenA->tokenB
  - tokenB->tokenA

📊 POOL ADDRESSES:
  - 0xabc...
  - 0xdef...

📊 RECENT 10 CALLS:
1. [timestamp]
   Message: ...
   Token Pair: ...
   Pool: ...
```

## Understanding the Data

### Normal Behavior
- **1-2 calls** per swap interaction
- **Short duration** (< 1 second per call)
- **Few duplicates** for same token pair

### Problem Indicators
- **10+ calls** in quick succession
- **Same token pair** appearing many times
- **Long durations** (> 3 seconds per call)
- **Multiple warnings** displayed

## Integration

### Files Modified
1. **Created**: `src/components/futarchyFi/marketPage/SwaprDebugPanel.jsx`
2. **Modified**: `src/components/futarchyFi/marketPage/MarketPageShowcase.jsx`
   - Added import for `SwaprDebugPanel`
   - Rendered component at end of page

### Dependencies
- Imports `getSwaprDebugStats` from `src/utils/swaprSdk.js`
- Works with the debug tracking system in swaprSdk.js
- No external dependencies (pure React)

## Disabling the Panel

### Temporary (for testing)
Comment out in `MarketPageShowcase.jsx`:
```jsx
{/* <SwaprDebugPanel /> */}
```

### Permanent
Remove the import and component from `MarketPageShowcase.jsx`

## Troubleshooting

### Panel Not Appearing
1. Check browser console for errors
2. Verify `getSwaprDebugStats` is exported from swaprSdk.js
3. Check if component is commented out

### No Stats Showing
1. Make sure you've performed at least one swap operation
2. Check that `DEBUG_SWAPR_CALLS = true` in swaprSdk.js
3. Try clicking Refresh button

### Copy Not Working
1. Check browser permissions for clipboard access
2. Try clicking Copy again
3. Manually select and copy from console using `window.getSwaprDebugStats()`

## Browser Console Alternative

You can also access stats via browser console:
```javascript
// Get stats
window.getSwaprDebugStats()

// Get raw call history
window.getSwaprDebugStats().callHistory

// Filter for specific token pair
window.getSwaprDebugStats().callHistory.filter(c => c.tokenPair.includes('YOUR_TOKEN'))
```

## Performance Impact

- **Minimal overhead**: Component only updates every 2 seconds (when auto-refresh is on)
- **Memory**: Stores call history in memory (< 1MB for 1000 calls)
- **Can be disabled**: Set auto-refresh to pause to stop updates
