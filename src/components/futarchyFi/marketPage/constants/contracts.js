/**
 * Contracts Configuration (Gnosis Chain)
 * 
 * Centralized list of addresses and ABIs for the Futarchy v2 architecture (futarchy-complete-new).
 */

export const CONTRACT_ADDRESSES = {
    AGGREGATOR_FACTORY: '0xe7C27c932C80D30c9aaA30A856c0062208d269b4',
    ORGANIZATION_FACTORY: '0xCF3d0A6d7d85639fb012fA711Fef7286e6Db2808',
    PROPOSAL_METADATA_FACTORY: '0x899c70C37E523C99Bd61993ca434F1c1A82c106d',
    DEFAULT_AGGREGATOR: '0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1'
};

export const CONTRACT_ABIS = {
    AGGREGATOR_FACTORY: [{ "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }, { "internalType": "address", "name": "_organizationImplementation", "type": "address" }, { "internalType": "address", "name": "_proposalImplementation", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "FailedDeployment", "type": "error" }, { "inputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "InsufficientBalance", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "metadata", "type": "address" }, { "indexed": false, "internalType": "string", "name": "name", "type": "string" }], "name": "AggregatorMetadataCreated", "type": "event" }, { "inputs": [{ "internalType": "string", "name": "aggregatorName", "type": "string" }, { "internalType": "string", "name": "description", "type": "string" }, { "internalType": "string", "name": "metadata", "type": "string" }, { "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "createAggregatorMetadata", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "implementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "organizationImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "proposalImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],

    ORGANIZATION_FACTORY: [{ "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }, { "internalType": "address", "name": "_proposalImplementation", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "FailedDeployment", "type": "error" }, { "inputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "InsufficientBalance", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "metadata", "type": "address" }, { "indexed": false, "internalType": "string", "name": "name", "type": "string" }], "name": "OrganizationMetadataCreated", "type": "event" }, { "inputs": [{ "internalType": "string", "name": "companyName", "type": "string" }, { "internalType": "string", "name": "description", "type": "string" }, { "internalType": "string", "name": "metadata", "type": "string" }, { "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "createOrganizationMetadata", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "implementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "proposalImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],

    PROPOSAL_METADATA_FACTORY: [{ "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "FailedDeployment", "type": "error" }, { "inputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "InsufficientBalance", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "metadata", "type": "address" }, { "indexed": true, "internalType": "address", "name": "proposalAddress", "type": "address" }], "name": "ProposalMetadataCreated", "type": "event" }, { "inputs": [{ "internalType": "address", "name": "proposalAddress", "type": "address" }, { "internalType": "string", "name": "displayNameQuestion", "type": "string" }, { "internalType": "string", "name": "displayNameEvent", "type": "string" }, { "internalType": "string", "name": "description", "type": "string" }, { "internalType": "string", "name": "metadata", "type": "string" }, { "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "createProposalMetadata", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "implementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],

    AGGREGATOR: [{ "inputs": [], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "FailedDeployment", "type": "error" }, { "inputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "InsufficientBalance", "type": "error" }, { "inputs": [], "name": "InvalidInitialization", "type": "error" }, { "inputs": [], "name": "NotInitializing", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "OwnableInvalidOwner", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "OwnableUnauthorizedAccount", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "newName", "type": "string" }, { "indexed": false, "internalType": "string", "name": "newDescription", "type": "string" }], "name": "AggregatorInfoUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "oldEditor", "type": "address" }], "name": "EditorRevoked", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "newEditor", "type": "address" }], "name": "EditorSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "metadata", "type": "string" }, { "indexed": false, "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "ExtendedMetadataUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint64", "name": "version", "type": "uint64" }], "name": "Initialized", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "organizationMetadata", "type": "address" }], "name": "OrganizationAdded", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "organizationMetadata", "type": "address" }, { "indexed": false, "internalType": "string", "name": "companyName", "type": "string" }], "name": "OrganizationCreatedAndAdded", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "implementation", "type": "address" }], "name": "OrganizationImplementationSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "organizationMetadata", "type": "address" }], "name": "OrganizationRemoved", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "implementation", "type": "address" }], "name": "ProposalImplementationSet", "type": "event" }, { "inputs": [{ "internalType": "address", "name": "_organizationMetadata", "type": "address" }], "name": "addOrganizationMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "aggregatorName", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "companyName", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }, { "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "createAndAddOrganizationMetadata", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "description", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "editor", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "offset", "type": "uint256" }, { "internalType": "uint256", "name": "limit", "type": "uint256" }], "name": "getOrganizations", "outputs": [{ "internalType": "contract FutarchyOrganizationMetadata[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getOrganizationsCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }, { "internalType": "string", "name": "_aggregatorName", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }, { "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }, { "internalType": "address", "name": "_organizationImplementation", "type": "address" }, { "internalType": "address", "name": "_proposalImplementation", "type": "address" }], "name": "initialize", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "metadata", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "metadataURI", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "organizationImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "organizations", "outputs": [{ "internalType": "contract FutarchyOrganizationMetadata", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "proposalImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }], "name": "removeOrganizationMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "revokeEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_editor", "type": "address" }], "name": "setEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }], "name": "setOrganizationImplementation", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }], "name": "setProposalImplementation", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_newName", "type": "string" }, { "internalType": "string", "name": "_newDescription", "type": "string" }], "name": "updateAggregatorInfo", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "updateExtendedMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }],

    ORGANIZATION: [{ "inputs": [], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "FailedDeployment", "type": "error" }, { "inputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "InsufficientBalance", "type": "error" }, { "inputs": [], "name": "InvalidInitialization", "type": "error" }, { "inputs": [], "name": "NotInitializing", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "OwnableInvalidOwner", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "OwnableUnauthorizedAccount", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "newName", "type": "string" }, { "indexed": false, "internalType": "string", "name": "newDescription", "type": "string" }], "name": "CompanyInfoUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "oldEditor", "type": "address" }], "name": "EditorRevoked", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "newEditor", "type": "address" }], "name": "EditorSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "metadata", "type": "string" }, { "indexed": false, "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "ExtendedMetadataUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint64", "name": "version", "type": "uint64" }], "name": "Initialized", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "proposalMetadata", "type": "address" }], "name": "ProposalAdded", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "proposalMetadata", "type": "address" }, { "indexed": true, "internalType": "address", "name": "proposalAddress", "type": "address" }], "name": "ProposalCreatedAndAdded", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "implementation", "type": "address" }], "name": "ProposalImplementationSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "proposalMetadata", "type": "address" }], "name": "ProposalRemoved", "type": "event" }, { "inputs": [{ "internalType": "address", "name": "_proposalMetadata", "type": "address" }], "name": "addProposalMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "companyName", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "proposalAddress", "type": "address" }, { "internalType": "string", "name": "displayNameQuestion", "type": "string" }, { "internalType": "string", "name": "displayNameEvent", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }, { "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "createAndAddProposalMetadata", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "description", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "editor", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "offset", "type": "uint256" }, { "internalType": "uint256", "name": "limit", "type": "uint256" }], "name": "getProposals", "outputs": [{ "internalType": "contract FutarchyProposalMetadata[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getProposalsCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }, { "internalType": "string", "name": "_companyName", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }, { "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }, { "internalType": "address", "name": "_proposalImplementation", "type": "address" }], "name": "initialize", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "metadata", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "metadataURI", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "proposalImplementation", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "proposals", "outputs": [{ "internalType": "contract FutarchyProposalMetadata", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }], "name": "removeProposalMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "revokeEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_editor", "type": "address" }], "name": "setEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_implementation", "type": "address" }], "name": "setProposalImplementation", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_newName", "type": "string" }, { "internalType": "string", "name": "_newDescription", "type": "string" }], "name": "updateCompanyInfo", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "updateExtendedMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }],

    PROPOSAL: [{ "inputs": [], "stateMutability": "nonpayable", "type": "constructor" }, { "inputs": [], "name": "InvalidInitialization", "type": "error" }, { "inputs": [], "name": "NotInitializing", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "OwnableInvalidOwner", "type": "error" }, { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "OwnableUnauthorizedAccount", "type": "error" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "oldEditor", "type": "address" }], "name": "EditorRevoked", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "newEditor", "type": "address" }], "name": "EditorSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "metadata", "type": "string" }, { "indexed": false, "internalType": "string", "name": "metadataURI", "type": "string" }], "name": "ExtendedMetadataUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint64", "name": "version", "type": "uint64" }], "name": "Initialized", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "displayNameQuestion", "type": "string" }, { "indexed": false, "internalType": "string", "name": "displayNameEvent", "type": "string" }, { "indexed": false, "internalType": "string", "name": "description", "type": "string" }], "name": "MetadataUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "inputs": [], "name": "description", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "displayNameEvent", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "displayNameQuestion", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "editor", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }, { "internalType": "address", "name": "_proposalAddress", "type": "address" }, { "internalType": "string", "name": "_displayNameQuestion", "type": "string" }, { "internalType": "string", "name": "_displayNameEvent", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }, { "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "initialize", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "metadata", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "metadataURI", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "proposalAddress", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "revokeEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "_editor", "type": "address" }], "name": "setEditor", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_metadata", "type": "string" }, { "internalType": "string", "name": "_metadataURI", "type": "string" }], "name": "updateExtendedMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "_displayNameQuestion", "type": "string" }, { "internalType": "string", "name": "_displayNameEvent", "type": "string" }, { "internalType": "string", "name": "_description", "type": "string" }], "name": "updateMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]
};




// Contract Addresses
export const CONDITIONAL_TOKENS_ADDRESS = '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce';
export const WRAPPER_SERVICE_ADDRESS = '0xc14f5d2B9d6945EF1BA93f8dB20294b90FA5b5b1';
export const SUSHISWAP_V2_ROUTER = '0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55';
export const SUSHISWAP_V3_ROUTER = '0x592abc3734cd0d458e6e44a2db2992a3d00283a4'; // Official SushiSwap V3 Router on Gnosis Chain
export const VAULT_RELAYER_ADDRESS = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
export const COW_SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
export const FUTARCHY_ROUTER_ADDRESS = '0x7495a583ba85875d59407781b4958ED6e0E1228f';
export const BASE_CURRENCY_TOKEN_ADDRESS = '0xaf204776c7245bF4147c2612BF6e5972Ee483701';
export const BASE_COMPANY_TOKEN_ADDRESS = '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb';
// export const MARKET_ADDRESS = '0x81e8251f172b1bbac8473F69892212c1c43A0F00';
export const MARKET_ADDRESS = '0xe4E393894198E2b45D71F732CE0e74eB436d7380';

// Default Proposal ID for fallback when no URL params are provided
export const DEFAULT_PROPOSAL_ID = '0xDA36a35CA4Fe6214C37a452159C0C9EAd45D5919';

// Chain Configuration
export const REQUIRED_CHAIN_ID = '0x64'; // Gnosis Chain
export const REQUIRED_CHAIN_NAME = 'Gnosis Chain';
export const WXDAI_ADDRESS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';

// Contract ABIs
export const CONDITIONAL_TOKENS_ABI = [
    'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] calldata partition, uint amount) external',
    'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] calldata partition, uint amount) external',
    'function isApprovedForAll(address owner, address operator) external view returns (bool)',
    'function setApprovalForAll(address operator, bool approved) external',
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external'
];

export const WRAPPER_SERVICE_ABI = [
    'function wrap(address multiToken, uint256 tokenId, uint256 amount, address recipient, bytes data) external',
    'function unwrap(address multiToken, uint256 tokenId, uint256 amount, address recipient, bytes data) external'
];

export const SUSHISWAP_ROUTER_ABI = [
    'function processRouteWithTransferValueOutput(address transferValueTo, uint256 amountValueTransfer, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOutMin, address to, bytes route) external payable returns (uint256)'
];

export const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address recipient, uint256 amount) external returns (bool)',
    'function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)'
];

export const ERC1155_ABI = [
    'function balanceOf(address account, uint256 id) external view returns (uint256)',
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external'
];

export const FUTARCHY_ROUTER_ABI = [
    {
        "inputs": [
            {
                "internalType": "contract FutarchyProposal",
                "name": "proposal",
                "type": "address"
            },
            {
                "internalType": "contract IERC20",
                "name": "collateralToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "splitPosition",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "contract FutarchyProposal",
                "name": "proposal",
                "type": "address"
            },
            {
                "internalType": "contract IERC20",
                "name": "collateralToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "mergePositions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "contract FutarchyProposal",
                "name": "proposal",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "amount2",
                "type": "uint256"
            }
        ],
        "name": "redeemProposal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

// Add Uniswap V3 Pool ABI with slot0 function
export const UNISWAP_V3_POOL_ABI = [
    {
        "inputs": [],
        "name": "slot0",
        "outputs": [
            {
                "internalType": "uint160",
                "name": "sqrtPriceX96",
                "type": "uint160"
            },
            {
                "internalType": "int24",
                "name": "tick",
                "type": "int24"
            },
            {
                "internalType": "uint16",
                "name": "observationIndex",
                "type": "uint16"
            },
            {
                "internalType": "uint16",
                "name": "observationCardinality",
                "type": "uint16"
            },
            {
                "internalType": "uint16",
                "name": "observationCardinalityNext",
                "type": "uint16"
            },
            {
                "internalType": "uint8",
                "name": "feeProtocol",
                "type": "uint8"
            },
            {
                "internalType": "bool",
                "name": "unlocked",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Add SDAI Rate Provider ABI with getRate function
export const SDAI_RATE_PROVIDER_ABI = [
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

// Algebra (v3-style) Pool Minimal ABI
export const ALGEBRA_POOL_ABI = [
    {
        name: "globalState",
        outputs: [
            { type: "uint160", name: "price" },   // √price in Q64.96
            { type: "int24", name: "tick" },
            { type: "uint16", name: "lastFee" },
            { type: "uint8", name: "pluginConfig" },
            { type: "uint16", name: "communityFee" },
            { type: "bool", name: "unlocked" }
        ],
        inputs: [],
        stateMutability: "view",
        type: "function"
    },
    { name: "token0", inputs: [], outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
    { name: "token1", inputs: [], outputs: [{ type: "address" }], stateMutability: "view", type: "function" }
];

// Flag to indicate Algebra pool usage
export const USE_ALGEBRA_POOL = false; // Set to true to use Algebra pool logic

// Base Token Configuration
export const BASE_TOKENS_CONFIG = {
    currency: {
        address: "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
        symbol: "SDAI",
        name: "SDAI",
        decimals: 18
    },
    company: {
        address: "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
        symbol: "GNO",
        name: "Gnosis",
        decimals: 18
    }
};

// Fallback name still imported by ConfirmSwapModal and ShowcaseSwapComponent
export const DEFAULT_BASE_TOKENS_CONFIG = BASE_TOKENS_CONFIG;

// Split Configuration
export const SPLIT_CONFIG = {
    conditionId: '0x9c89eb71b3b54134a6099fdced88df75254606b9a08d0c9b5f96fa3905e2db3d',
    tokenAddress: BASE_CURRENCY_TOKEN_ADDRESS,
    outcomes: ['Yes', 'No'],
    description: 'Newtokw Gnosis Chain'
};

// Merge Configuration
export const MERGE_CONFIG = {
    currencyPositions: {
        yes: {
            wrap: {
                tokenName: 'YES_sDAI',
                tokenSymbol: 'YES_sDAI',
                // wrappedCollateralTokenAddress: '0x2C7d00810FBBA8676954C66A0423FeDBbB8a3BfB'
                wrappedCollateralTokenAddress: '0x2301e71f6c6dc4f8d906772f0551e488dd007a99'
            }
        },
        no: {
            wrap: {
                tokenName: 'NO_sDAI',
                tokenSymbol: 'NO_sDAI',
                //  wrappedCollateralTokenAddress: '0x25eC0A3eA53df512694d0e7DDe57e962595a7b63'
                wrappedCollateralTokenAddress: '0xb9d258c84589d47d9c4cab20a496255556337111'
            }
        }
    },
    companyPositions: {
        yes: {
            wrap: {
                tokenName: 'YES_GNO',
                tokenSymbol: 'YES_GNO',
                // wrappedCollateralTokenAddress: '0xffF46469298c1E285981217a3D247A085Ab3ebA6'
                wrappedCollateralTokenAddress: '0xb28dbe5cd5168d2d94194eb706eb6bcd81edb04e'
            }
        },
        no: {
            wrap: {
                tokenName: 'NO_GNO',
                tokenSymbol: 'NO_GNO',
                // wrappedCollateralTokenAddress: '0x0c485ED641dBCA4Ed797B189Cd674925B3437eDC'
                wrappedCollateralTokenAddress: '0xad34b43712588fa57d80e76c5c2bcbd274bdb5c0'
            }
        }
    }
};
export const SDAI_CONTRACT_RATE = "0x89C80A4540A00b5270347E02e2E144c71da2EceD"
export const POOL_CONFIG_YES = {
    address: '0x57a9C7d2b515CFa7c39036dC5af48e2b56fd7B22', // Updated YES pool address
    tokenCompanySlot: 1,
}

export const POOL_CONFIG_NO = {
    address: '0x39991F6e6D692F6c93C6AC17049c1Ab814E7217b', // Updated NO pool address
    tokenCompanySlot: 0,
}

export const POOL_CONFIG_THIRD = {
    address: '0x90e129943163F611C218CD56557D0e408609E588',
    tokenCompanySlot: 0, // Assuming 0, confirm if different or irrelevant for this pool
}

// Prediction pool configuration for Uniswap V3
export const PREDICTION_POOLS = {
    no: {
        address: "0x19109DB1e35a9Ba50807aedDa244dCfFc634EF6F",
        tokenBaseSlot: 0 // SDAI is token0, NO_SDAI is token1
    },
    yes: {
        address: "0xb0F38743e0d55D60d5F84112eDFb15d985a4415e",
        tokenBaseSlot: 0 // SDAI is token1, YES_SDAI is token0
    }
};

// Swap Configuration
export const SWAP_CONFIG = {
    fromToken: {
        name: 'YES_sDAI',
        address: '0x2301e71f6c6dc4f8d906772f0551e488dd007a99',
        decimals: 18
    },
    toToken: {
        name: 'YES_GNO',
        address: '0xb28dbe5cd5168d2d94194eb706eb6bcd81edb04e',
        decimals: 18
    },
    amount: '0.0001',
    chainId: 100, // Gnosis Chain
    cowSwap: {
        vaultRelayer: VAULT_RELAYER_ADDRESS,
        settlement: COW_SETTLEMENT_ADDRESS
    }
};

// Precision Configuration
export const PRECISION_CONFIG = {
    // Display precision for different scenarios
    display: {
        main: 1,          // Used in ChartParameters and main UI displays
        default: 2,
        price: 2,         // Used in ChartParameters for spot/yes/no prices
        swapPrice: 1,     // Used in ShowcaseSwapComponent for outcome price calculations
        amount: 6,
        balance: 4,
        percentage: 1,
        smallNumbers: 8  // For very small numbers (< 0.0001)
    },
    // Token decimals (matches blockchain configuration)
    tokens: {
        default: 18,
        SDAI: 18,
        GNO: 18
    },
    // Rounding configuration
    rounding: {
        floor: true,  // Whether to floor values by default
        multiplier: {
            default: 8,    // Default precision multiplier
            high: 20       // High precision multiplier for small numbers
        },
        tolerance: {
            balance: 1e-15,  // Tolerance for balance comparisons
            price: 1e-12,    // Tolerance for price comparisons
            amount: 1e-10    // Tolerance for amount comparisons
        }
    }
}; 