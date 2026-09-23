import React, { useState } from "react";
import Image from "next/image";
import FutarchyTileAnimation from "../../components/FutarchyTileAnimation";
import { generateFallbackImage } from "../../../../../utils/imageUtils";
import EditCompanyModal from "../../../../debug/EditCompanyModal";
import { SHOW_DATA_DEBUG } from "../../../../../config/featureFlags";

const getStorybookUrl = (companyId) => {
  // Map company IDs to their proper Storybook story names
  const storyNameMap = {
    'futarchyfi': 'futarchy-fi',
    'skymavis': 'sky-mavis',
    'gnosis': 'gnosis-dao'
  };

  // Get the mapped story name or use a default transformation
  const storyName = storyNameMap[companyId] || companyId;

  return `/?path=/story/futarchy-fi-proposals-proposalspage--${storyName}`;
};

// Helper function to get numeric company ID from company name
const getCompanyId = (companyName) => {
  const nameMap = {
    'gnosis dao': 9,
    'gnosis': 9,
    'kleros': 10,
    'tesla': 11,
    'starbucks': 12,
  };

  const normalizedName = companyName.toLowerCase().replace(/\s+/g, ' ').trim();
  return nameMap[normalizedName] || 9; // Default to Gnosis if not found
};

export const CompaniesCard = ({
  name,
  stats,
  useStorybookUrl = false,
  image, // ✅ Accept image prop from parent
  colors, // ✅ Accept colors from metadata
  companyID, // ✅ Accept companyID from parent
  fromSubgraph = false, // ✅ Show badge if from subgraph
  owner = null, // ✅ Organization owner address
  connectedAddress = null, // ✅ Connected wallet address for owner check
  organizationAddress = null, // ✅ For EditCompanyModal
}) => {
  // Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Check if connected wallet is the owner
  const isOwner = owner && connectedAddress &&
    owner.toLowerCase() === connectedAddress.toLowerCase();
  const companyId = name.toLowerCase().replace(/\s+/g, '');
  const numericCompanyId = companyID || getCompanyId(name); // ✅ Use provided ID first

  const href = useStorybookUrl
    ? getStorybookUrl(companyId)
    : `/milestones?company_id=${numericCompanyId}`;

  const animationSeed = companyId || name;

  // ❌ NO FALLBACK - Only use provided image
  const displayImage = image;

  if (!displayImage) {
    console.error(`❌ [CompaniesCard] MISSING IMAGE for: ${name} (ID: ${numericCompanyId})`);
  }

  // ✅ Use background color from metadata
  const heroContainerStyle = colors?.primary ? { backgroundColor: colors.primary } : undefined;

  // Handle edit button click
  const handleEditClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  return (
    <>
      <a href={href} className="group relative block border-2 border-futarchyGray62 dark:border-futarchyGray11/70 rounded-3xl w-full md:w-[340px] shadow-sm hover:shadow-lg transition-colors duration-300 overflow-hidden bg-futarchyGray3 dark:bg-futarchyDarkGray2">
        {/* Badges Container */}
        {((SHOW_DATA_DEBUG && fromSubgraph) || isOwner) && (
          <div className="absolute top-2 right-2 z-30 flex flex-col gap-1">
            {SHOW_DATA_DEBUG && fromSubgraph && (
              <div className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                📊 Subgraph
              </div>
            )}
            {isOwner && (
              <>
                <div className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  👑 Owner
                </div>
                <button
                  onClick={handleEditClick}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg transition-colors"
                >
                  ✏️ Edit
                </button>
              </>
            )}
          </div>
        )}
        {/* This container sets the height and positioning context */}
        <div className="relative w-full h-[260px] md:h-[300px]">
          {/* Top Section: Positioned behind and moves up on hover */}
          <div className="absolute top-0 left-0 right-0 z-0 transition-transform duration-300 ease-in-out group-hover:-translate-y-4">
            <div className="bg-futarchyGray2 dark:bg-transparent p-4 pb-0">
              <div
                className="relative h-[160px] md:h-[195px] overflow-hidden rounded-t-2xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70"
                style={heroContainerStyle}
              >
                {/* Background Image Layer */}
                <div className="absolute inset-0 z-0">
                  <Image
                    src={displayImage} // ✅ Use dynamic image from prop or fallback
                    alt={`${name} Background`}
                    layout="fill"
                    objectFit="cover"
                    onError={(e) => {
                      // ❌ NO FALLBACK - Show broken image
                      console.error(`❌ [CompaniesCard] Image failed to load for: ${name}`);
                      e.target.style.display = 'none'; // Hide broken image
                    }}
                  />
                </div>
                {/* Animation Layer (Desktop only) */}
                <div className="relative z-[5] hidden md:block">
                  <FutarchyTileAnimation seed={animationSeed} />
                </div>
                {/* Centered Futarchy Logo Layer (Desktop only) */}
                <div className="absolute inset-0 z-10 items-center justify-center opacity-30 group-hover:opacity-40 transition-opacity hidden md:flex">
                  <div className="w-1/2">
                    <Image
                      src="/assets/seer-logo.svg"
                      alt="Futarchy Logo"
                      width={100}
                      height={100}
                      className="object-contain"
                    />
                  </div>
                </div>
                {/* Shine Effect Layer */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full -skew-x-12 group-hover:translate-x-full transition-transform duration-700 ease-in-out z-20"></div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Positioned on top and static */}
          <div className="absolute bottom-0 left-0 right-0 z-10">
            {/* Divider */}
            <div className="border-t-2 border-futarchyGray62 dark:border-futarchyGray11/70"></div>

            {/* Bottom Section Content */}
            <div className="p-4 bg-futarchyGray3 dark:bg-futarchyDarkGray3">
              <div className="flex flex-col gap-3">
                <h3
                  className="text-base font-semibold font-oxanium text-futarchyGray12 dark:text-white leading-6 truncate"
                  data-testid={`company-card-title-${name.toLowerCase()}`}
                >
                  {name || "Unknown Company"}
                </h3>

                {/* Stats wrapper */}
                <div className="flex flex-col border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 rounded-2xl">
                  <div className="flex flex-col items-center flex-1 py-2 px-4">
                    <span className="text-xs text-futarchyGray11 dark:text-white/80 leading-4 font-medium">Milestones</span>
                    <span className="text-sm font-semibold text-futarchyGray12 dark:text-white">
                      {stats?.proposals || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </a>

      {/* Edit Company Modal */}
      <EditCompanyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        organizationAddress={organizationAddress}
        initialData={{ companyName: name }}
      />
    </>
  );
};
