import React from 'react';

// The page ground and the content column. A hero brings its own clearance for the fixed 80px
// header; without one, the content clears it here.
const PageLayout = ({ hero, children, contentClassName = '' }) => {
  return (
    <div className="flex flex-col flex-grow bg-seer-page text-seer-text">
      {/* 1. Hero Section (Optional) */}
      {hero && (
        <header>
          {hero}
        </header>
      )}

      {/* 2. Main Content Area */}
      <main className={`w-full flex-grow flex flex-col ${hero ? '' : 'mt-20'}`}>
        <div className={`container mx-auto px-5 pb-16 ${contentClassName} flex-grow flex flex-col`}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;
