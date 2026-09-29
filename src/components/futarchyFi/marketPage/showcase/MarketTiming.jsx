import { useEffect, useState } from 'react';

// Add a Banner Timestamp component
const BannerTimestamp = ({ endTime, resolutionStatus }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const updateRemainingTime = () => {
      if (!endTime) {
        setRemainingTime("");
        return;
      }

      // Convert endTime to Unix timestamp (seconds)
      let endTimeSeconds;
      if (typeof endTime === 'string') {
        endTimeSeconds = new Date(endTime).getTime() / 1000;
      } else if (typeof endTime === 'number') {
        endTimeSeconds = endTime < 10000000000 ? endTime : endTime / 1000;
      } else {
        setRemainingTime("");
        return;
      }

      if (isNaN(endTimeSeconds)) {
        setRemainingTime("");
        return;
      }

      const now = Date.now() / 1000;
      const timeLeft = endTimeSeconds - now;
      const endDate = new Date(endTimeSeconds * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (timeLeft <= 0) {
        if (resolutionStatus !== 'open') {
          setRemainingTime(`Ended on: ${endDate}`);
        } else {
          setRemainingTime(`Open: ${endDate}`);
        }
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
    const interval = setInterval(updateRemainingTime, 60000);
    return () => clearInterval(interval);
  }, [endTime, resolutionStatus]);

  return remainingTime ? (
    <div className="py-1 px-2 bg-yellow-400/15 rounded-full text-yellow-400 text-sm leading-4 whitespace-nowrap text-center self-center items-center">
      {remainingTime}
    </div>
  ) : null;
};

const FormattedEndDate = ({ endTime2 }) => {
  const endTime = endTime2; // Use the actual parameter

  if (!endTime) {
    return null; // Or some fallback UI
  }

  let date;

  // Handle different date formats
  if (typeof endTime === 'string') {
    // ISO 8601 format (e.g., "2025-12-31T23:59:59Z")
    date = new Date(endTime);
  } else if (typeof endTime === 'number') {
    // Unix timestamp - could be seconds or milliseconds
    // If the number is small, it's likely seconds, otherwise milliseconds
    const timestamp = endTime < 10000000000 ? endTime * 1000 : endTime;
    date = new Date(timestamp);
  } else {
    return null;
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return null;
  }

  const formattedDate = date.toLocaleString('en-US', {
    month: 'long', // e.g., "June"
    day: 'numeric', // e.g., "14"
    year: 'numeric', // e.g., "2024"
    hour: 'numeric', // e.g., "5"
    minute: '2-digit', // e.g., "30"
    hour12: true // e.g., "PM"
  });

  return (
    <div className="flex flex-row mb-6">
      <div className="font-semibold text-lg mr-1">
        <span className="text-white">End Time: </span>
        <span className="text-yellow-400">{formattedDate}</span>
      </div>
    </div>
  );
};

// Add this spinner component before the TradeHistoryTable component
const Spinner = () => (
  <div className="flex justify-center items-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyBlue9"></div>
  </div>
);

export { BannerTimestamp, FormattedEndDate, Spinner };
