import React from 'react';

const CircularProgressBar = ({
  currentProgress,
  totalProgress,
  radius = 50,         // Default value set to 50
  strokeWidth = 2      // Default value set to 2
}) => {
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * 2 * Math.PI;

    // The stroke-dashoffset CSS transition below animates changes. A JS
    // tween here used to step 1/50 of the remaining gap every 20ms, which
    // never quite converges and kept every card re-rendering.
    const progress = currentProgress;

    const strokeDashoffset = circumference - (progress / totalProgress) * circumference;

    return (
        <svg
            height={radius * 2}
            width={radius * 2}
            className="mx-auto"
            style={{ transform: 'rotate(-90deg)' }}  // Rotate the SVG to start from the top
        >
            <circle
                fill="transparent"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference + ' ' + circumference}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                className="stroke-[#E8E8E8] dark:stroke-[#636363B3]"
            />
            <circle
                fill="transparent"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference + ' ' + circumference}
                style={{
                    strokeDashoffset,
                    transition: 'stroke-dashoffset 0.35s ease-out',
                    strokeLinecap: 'round'
                }}
                className="animate-pulsate-color"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
            />
        </svg>
    );
};

export default CircularProgressBar;
