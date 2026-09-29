// components/layout/RootLayout.jsx
import React, { useState, useEffect } from "react";
import Header from "../common/Header";
import Footer from "../common/Footer";
import { Oxanium } from "next/font/google";

const oxanium = Oxanium({
  subsets: ["latin"],
  display: "swap",
});

const RootLayout = ({
  children,
  headerConfig = "landing",
  footerConfig, // kept for backward compat, Footer is now unified
  useSnapScroll = false,
  heroContent = null,
  secondaryHeader = null,
}) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check localStorage first
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) {
      const darkModeEnabled = savedMode === 'true';
      setIsDarkMode(darkModeEnabled);
      
      // Apply or remove dark class based on saved preference
      if (darkModeEnabled) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      // If no saved preference, check system preference
      const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(prefersDarkMode);
      
      // Apply dark class based on system preference
      if (prefersDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  // The key issue: we need to pass a toggleDarkMode function to Header
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
    
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (useSnapScroll) {
    return (
      <>
        {/* Mobile-only Snap Scroll Layout */}
        <div className={`${oxanium.className} lg:hidden h-screen overflow-y-scroll snap-y snap-mandatory`}>
          <>
            {/* Section 1: Header + Hero */}
            <section className="snap-start h-screen flex flex-col">
              <Header 
                config={headerConfig} 
                darkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
              />
              <div className="flex-grow overflow-y-auto">
                {heroContent}
              </div>
            </section>

            {/* Section 2: Main Content */}
            <section className="snap-start h-screen flex flex-col relative">
              {secondaryHeader}
              <main className="flex-grow overflow-y-auto pt-20 flex flex-col">
                {children}
              </main>
            </section>

            {/* Section 3: Footer */}
            <section className="snap-start h-screen flex flex-col relative pt-20">
              {secondaryHeader}
              <Footer className="flex-grow" />
            </section>
          </>
        </div>
        
        {/* Desktop Layout (Original) */}
        <div className={`${oxanium.className} hidden lg:flex flex-col min-h-screen`}>
          <>
            <Header 
              config={headerConfig} 
              darkMode={isDarkMode}
              toggleDarkMode={toggleDarkMode}
            />
            {secondaryHeader}
            <div className="sticky top-20 z-30">
              {heroContent}
            </div>
            <main className="flex-grow">
              {children}
            </main>
            <Footer />
          </>
        </div>
      </>
    );
  }

  return (
    <div className={`${oxanium.className} flex flex-col min-h-screen`}>
      <>
        <Header
          config={headerConfig}
          darkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode} // Pass the toggle function
        />
        {secondaryHeader}
        {/* Sticky only on lg+, where the hero collapses to a compact bar on
            scroll. On phones and tablets the full hero (~500px) would pin
            over most of the viewport, so it scrolls away with the page;
            mt-20 clears the fixed header that top-20 cleared before. */}
        {heroContent && (
          <div className="relative z-30 mt-20 lg:mt-0 lg:sticky lg:top-20">
            {heroContent}
          </div>
        )}
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </>
    </div>
  );
};

export default RootLayout;
