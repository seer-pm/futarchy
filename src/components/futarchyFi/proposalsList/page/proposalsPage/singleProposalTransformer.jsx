import axios from "axios";

// Mock data for debug mode
const mockSingleProposal = {
  company: {
    name: "Futarchy DAO",
    logo: "/assets/seer-logo.svg",
    status: "Active Protocol",
    description:
      "Futarchy is revolutionizing DAO governance through market-driven decision making.",
    tokens: ["SDAI"],
  },
  title: "GIP-89: Gnosis Chain Bridge Upgrade",
  status: "Active",
  createdAt: "2024-03-15",
  endTime: "2024-03-22",
  creator: "0x1234...5678",
  content: `
# Executive Summary

This proposal aims to implement a comprehensive upgrade to the Gnosis Chain bridge infrastructure, enhancing security, efficiency, and cross-chain interoperability. The upgrade includes new validation mechanisms, improved gas optimization, and support for emerging token standards.

**Key Metrics:**
- 🟣 45% Gas Optimization
- 🔷 2x Transaction Speed
- 🟠 100% ERC Standards Support

## Motivation

The current bridge implementation faces several challenges:

* High gas costs during peak network congestion
* Limited support for new token standards (ERC-1155, ERC-721)
* Increasing demand for faster cross-chain message verification

## Technical Specification

\`\`\`
Ethereum -------- Bridge -------- Gnosis
\`\`\`

### Key Components

#### Message Verification
Enhanced ZK-proof validation system for cross-chain messages

#### Token Standards
Extended support for ERC-721, ERC-1155, and future standards

## Implementation Timeline

| Phase | Duration |
|-------|----------|
| Phase 1 | Week 1-2 |
| Phase 2 | Week 3-4 |
| Phase 3 | Week 5-6 |
`,
  marketStats: {
    totalVolume: "$2.1M",
    approval: {
      price: "$1.12",
      volume: "$1.2M",
      traders: 156,
    },
    refusal: {
      price: "$0.88",
      volume: "$900K",
      traders: 98,
    },
  },
};

// Function to simulate API delay (reused from dataTransformer)
const simulateDelay = () => {
  const minDelay = 500;
  const maxDelay = 2000;
  const randomDelay =
    Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  return new Promise((resolve) => setTimeout(resolve, randomDelay));
};

// Helper function to format address
const formatAddress = (address) => {
  if (!address) return "0x0000...0000";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Main function to fetch and transform single proposal data
export const fetchAndTransformSingleProposal = async (proposalId) => {
  try {
    const isDebugMode =
      process.env.NEXT_PUBLIC_DEBUG_MODE?.toLowerCase() === "true";

    if (isDebugMode) {
      await simulateDelay();
      return mockSingleProposal;
    }

    if (!process.env.NEXT_PUBLIC_API_URL) {
      throw new Error("API URL not configured");
    }

    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/v3/single_proposal?proposal_id=${proposalId}`
    );

    const proposalData = response.data.proposals_data[0];

    // Transform API data to match the ReadProposalPage format
    const transformedProposal = {
      company: {
        name: "Futarchy DAO", // Default company info
        logo: "/assets/seer-logo.svg",
        status: "Active Protocol",
        description:
          "Futarchy is revolutionizing DAO governance through market-driven decision making.",
        tokens: ["SDAI"],
      },
      title: `${proposalId}: ${proposalData.proposal_title}`,
      status: proposalData.approval_status.replace("fake_", ""),
      createdAt: new Date(proposalData.timestamp).toISOString().split("T")[0],
      endTime: new Date(proposalData.timestamp).toISOString().split("T")[0], // You might want to calculate this based on your business logic
      creator: formatAddress(proposalData.proposer_id?.address),
      content: `
# Executive Summary

This proposal aims to implement a comprehensive upgrade to the Gnosis Chain bridge infrastructure, enhancing security, efficiency, and cross-chain interoperability. The upgrade includes new validation mechanisms, improved gas optimization, and support for emerging token standards.

**Key Metrics:**
- 🟣 45% Gas Optimization
- 🔷 2x Transaction Speed
- 🟠 100% ERC Standards Support

## Motivation

The current bridge implementation faces several challenges:

* High gas costs during peak network congestion
* Limited support for new token standards (ERC-1155, ERC-721)
* Increasing demand for faster cross-chain message verification

## Technical Specification

\`\`\`
Ethereum -------- Bridge -------- Gnosis
\`\`\`

### Key Components

#### Message Verification
Enhanced ZK-proof validation system for cross-chain messages

#### Token Standards
Extended support for ERC-721, ERC-1155, and future standards

## Implementation Timeline

| Phase | Duration |
|-------|----------|
| Phase 1 | Week 1-2 |
| Phase 2 | Week 3-4 |
| Phase 3 | Week 5-6 |
`,
      marketStats: {
        totalVolume: "$2.1M", // You might want to calculate this based on your business logic
        approval: {
          price: proposalData.prices.approval_price.replace("fake_", ""),
          volume: "$1.2M", // You might want to calculate this based on your business logic
          traders: proposalData.participating_users.length,
        },
        refusal: {
          price: proposalData.prices.refusal_price.replace("fake_", ""),
          volume: "$900K", // You might want to calculate this based on your business logic
          traders: proposalData.participating_users.length,
        },
      },
    };

    return transformedProposal;
  } catch (error) {
    console.error("Error fetching or transforming single proposal:", error);
    throw error;
  }
};

// Optional: Export helper functions for testing
export const helpers = {
  formatAddress,
};
