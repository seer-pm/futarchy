import React, { useState, useEffect } from "react";
import { LoadingSpinner } from './Icons';
import Badge from "../../../ui/Badge";
import { getMarketUrl } from "../../../../utils/urlUtils";

// The carousel's milestone card, on the same kit surface as the list's cards (ProposalsCard.jsx).

// --- SUB-COMPONENTS ---
const Timestamp = ({ endTime }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    if (!endTime) return;

    const updateRemainingTime = () => {
      const now = Date.now() / 1000;
      const timeLeft = endTime - now;

      if (timeLeft <= 0) {
        const endDate = new Date(endTime * 1000).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        setRemainingTime(`Ended on: ${endDate}`);
      } else {
        const days = Math.floor(timeLeft / 86400);
        const hours = Math.floor((timeLeft % 86400) / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);

        let timeString = '';
        if (days > 0) timeString += `${days}d `;
        if (hours > 0 || days > 0) timeString += `${hours}h `;
        timeString += `${minutes}m`;

        setRemainingTime(`Remaining Time: ${timeString}`);
      }
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <p className="text-[13px] text-seer-muted tabular-nums whitespace-nowrap">
      {remainingTime || '...'}
    </p>
  );
};

const ProposalStatus = ({ approvalStatus }) => {
  const { tone, statusText } = (() => {
    switch (approvalStatus) {
      case "approved": return { tone: "pass", statusText: "Approved" };
      case "refused": return { tone: "fail", statusText: "Refused" };
      default: return { tone: "accent", statusText: "Ongoing" };
    }
  })();

  return <Badge tone={tone}>{statusText}</Badge>;
};

const Figure = ({ label, valueClassName = "text-seer-text", children }) => (
  <div className="min-w-0">
    <p className="text-seer-muted">{label}</p>
    <div className={`mt-0.5 min-h-[20px] flex items-center font-semibold tabular-nums ${valueClassName}`}>{children}</div>
  </div>
);

const ProposalsPrices = ({ approvalPrice, refusalPrice, approvalStatus, isLoading }) => {
  const displayApproval = isLoading ? <LoadingSpinner /> : (typeof approvalPrice === 'number' ? `$${approvalPrice.toFixed(2)}` : "N/A");
  const displayRefusal = isLoading ? <LoadingSpinner /> : (typeof refusalPrice === 'number' ? `$${refusalPrice.toFixed(2)}` : "N/A");

  return (
    <div className="grid grid-cols-2 gap-3">
      <Figure label="If it passes" valueClassName="text-pass-text">{displayApproval}</Figure>
      <Figure label="If it fails" valueClassName="text-fail-text">{displayRefusal}</Figure>
    </div>
  );
};

const ProposalActions = ({ proposalID }) => (
  <a
    href={getMarketUrl(proposalID)}
    className="relative z-10 shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-seer-accent-text hover:underline underline-offset-4"
  >
    <span>View Market</span>
    <span aria-hidden="true">&rarr;</span>
  </a>
);

const impactClassName = (impact) => {
  const value = parseFloat(impact);
  if (!Number.isFinite(value)) return "text-seer-text";
  return value >= 0 ? "text-seer-positive" : "text-seer-negative";
};


// --- MAIN COMPONENT ---
export const ProposalsCard = ({
  proposalID,
  proposalTitle,
  approvalStatus = 'ongoing',
  endTime,
  image,
  approvalPrice,
  refusalPrice,
  impact,
  eventProbability,
  isLoading = false,
}) => {

  return (
    <article className="relative flex flex-col gap-4 h-full w-full md:w-[340px] p-5 bg-seer-surface border border-seer-border rounded-surface transition-colors hover:border-seer-accent-text/50 focus-within:border-seer-accent-text">
      <div className="flex items-center justify-between gap-3">
        <Timestamp endTime={endTime} />
        <ProposalStatus approvalStatus={approvalStatus} />
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight text-seer-text line-clamp-2" data-testid={`proposal-card-title-${proposalID}`} title={proposalTitle}>
        <a href={getMarketUrl(proposalID)} className="after:absolute after:inset-0 after:rounded-surface focus-visible:outline-none">
          {proposalTitle}
        </a>
      </h3>
      <div className="mt-auto flex flex-col gap-3 text-[13px]">
        <ProposalsPrices approvalPrice={approvalPrice} refusalPrice={refusalPrice} approvalStatus={approvalStatus} isLoading={isLoading} />
        <div className="grid grid-cols-2 gap-3">
          <Figure label="Impact" valueClassName={impactClassName(impact)}>
            {isLoading ? <LoadingSpinner /> : (impact || "N/A")}
          </Figure>
          <Figure label="Event Probability">
            {isLoading ? <LoadingSpinner /> : (eventProbability || "N/A")}
          </Figure>
        </div>
      </div>
      <div className="flex justify-end pt-3 border-t border-seer-border">
        <ProposalActions proposalID={proposalID} />
      </div>
    </article>
  );
};


// --- MOCK DATA ---
export const mockProposal = {
  proposalID: '0x123456789',
  proposalTitle: 'Should Futarchy Labs increase the marketing budget by 20% for Q3?',
  approvalStatus: 'ongoing',
  endTime: Math.floor(Date.now() / 1000) + (5 * 24 * 60 * 60), // 5 days from now
  image: '/assets/shareDashboard/BG.png', // Placeholder image
  approvalPrice: 0.58,
  refusalPrice: 0.42,
  impact: '+8.50%',
  eventProbability: '58.00%',
  isLoading: false,
};

export const mockProposalLoading = {
  ...mockProposal,
  isLoading: true,
};

export const mockProposalApproved = {
  ...mockProposal,
  approvalStatus: 'approved',
  endTime: Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60), // Ended 2 days ago
};
