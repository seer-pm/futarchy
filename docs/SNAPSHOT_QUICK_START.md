# Snapshot Widget - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Configure Environment
Edit your `.env` file:

```bash
# Use real Snapshot data
NEXT_PUBLIC_USE_MOCK_SNAPSHOT=false
NEXT_PUBLIC_SNAPSHOT_PROPOSAL_ID=0x40dbf611da3cb0dc1a5fd48140330e03f90214a9410ab2a25b782c1f3160eb0b
```

### Step 2: Start Dev Server
```bash
npm run dev
```

### Step 3: View Widget
Open http://localhost:3001/markets/new

## 📊 Widget Features at a Glance

### Collapsed State (Button)
```
┌─────────────────────────────────────┐
│ ⚡ Snapshot Results ● [✓ 80.2%]   │
└─────────────────────────────────────┘
  │         │           │       │
  Icon    Label      Live    Current
                     API     Result
```

### Expanded State (Panel)
```
┌──────────────────────────────────────┐
│ Snapshot Results 🔗        [×]      │
├──────────────────────────────────────┤
│                                      │
│ VOTING RESULTS                       │
│                                      │
│ ✓ For        20,414  80.2%  ████    │
│ × Against        10   0.0%  ░        │
│ ─ Abstain     5,032  19.8%  ██       │
│                                      │
│ Total: 25,456  |  85 votes            │
│                                      │
│ ✅ Quorum: 39.3% (MET)               │
└──────────────────────────────────────┘
```

## 🎯 Quick Actions

### Switch to Mock Data
```bash
# .env
NEXT_PUBLIC_USE_MOCK_SNAPSHOT=true
```
Restart server → Widget shows mock data

### Switch to Real Data
```bash
# .env
NEXT_PUBLIC_USE_MOCK_SNAPSHOT=false
```
Restart server → Widget fetches from Snapshot API

### Change Proposal
1. Find proposal on [Snapshot](https://snapshot.org/#/gnosis.eth)
2. Copy proposal ID from URL
3. Update `.env`:
```bash
NEXT_PUBLIC_SNAPSHOT_PROPOSAL_ID=YOUR_PROPOSAL_ID
```
4. Restart server

### Test API Connection
```bash
node test-snapshot-api.js
```

Expected output:
```
🔍 Testing Snapshot API...

📡 Fetching proposal data...

✅ Successfully fetched Snapshot data!

📊 Proposal Details:
────────────────────────────────────────────────────────────────────────────────
Title: GIP-139: Should GnosisDAO support ProbeLab...
Space: GnosisDAO (gnosis.eth)
State: active
Total Votes: 85
Total Score: 25456.50
Quorum: 10000
────────────────────────────────────────────────────────────────────────────────

📈 Voting Results:
────────────────────────────────────────────────────────────────────────────────
For              20414.40 (80.2%) ████████████████████████████████████████
Against             10.46 (0.0%)
Abstain           5031.64 (19.8%) █████████████████████
────────────────────────────────────────────────────────────────────────────────

✅ Quorum: 39.3% (MET)

🏆 Leading Option: For (80.2%)
```

## 🎨 Visual Indicators

| Indicator | Meaning |
|-----------|---------|
| ● (green dot) | Using live API data |
| ⚡ (lightning) | Snapshot results widget |
| 🔗 (external link) | Click to open on Snapshot |
| ⟳ (spinner) | Loading data |
| ✓ (check) | For/Yes/Approve |
| × (X mark) | Against/No/Reject |
| ─ (line) | Abstain |

## 🔄 Auto-Refresh

The widget automatically refreshes every **60 seconds** when using real API data.

To change the refresh interval, edit [MarketPage.jsx](../src/components/futarchyFi/marketPage/page/MarketPage.jsx):

```javascript
useSnapshotData(snapshotProposalId, {
  useMock: useMockSnapshot,
  autoFetch: true,
  refreshInterval: 30000, // Change to 30 seconds
});
```

## 🐛 Troubleshooting

### Widget shows old data
**Solution**: Wait 60 seconds for auto-refresh, or reload the page

### Widget shows mock instead of real data
**Check**:
1. ✅ `NEXT_PUBLIC_USE_MOCK_SNAPSHOT=false` in `.env`
2. ✅ Valid proposal ID in `.env`
3. ✅ Restarted dev server after changing `.env`

### External link doesn't work
**Check**:
1. Widget is expanded (click the button first)
2. Proposal ID is valid
3. Browser allows popups

### API errors in console
**Try**:
1. Test API: `node test-snapshot-api.js`
2. Check proposal exists on Snapshot
3. Verify network connection
4. Widget will auto-fallback to mock data

## 📖 Full Documentation

For complete documentation, see:
- [SNAPSHOT_INTEGRATION.md](./SNAPSHOT_INTEGRATION.md) - Full integration guide
- [SNAPSHOT_SUMMARY.md](./SNAPSHOT_SUMMARY.md) - Implementation summary

## 🎉 You're Ready!

The Snapshot widget is now integrated and working. Visit your market page and click the widget to see live voting results!

**Dev Server**: http://localhost:3001/markets/new
