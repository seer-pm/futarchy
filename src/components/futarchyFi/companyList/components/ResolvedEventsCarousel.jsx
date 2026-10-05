'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchResolvedEventHighlightData } from '../page/ResolvedEventsDataTransformer';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import HighlightCard from '../cards/highlightCards/HighlightCards';

const NavigationButton = ({ direction, onClick, className }) => (
  <button
    onClick={onClick}
    className={`absolute top-1/2 -translate-y-1/2 z-10 md:w-[48px] md:h-[48px] flex items-center justify-center md:rounded-xl rounded-lg bg-[#FCFCFC] border border-[#D9D9D9] shadow-sm dark:bg-[#191919] dark:border-futarchyGray112/40 hover:bg-futarchyGray2 dark:hover:bg-futarchyGray11/70 transition-colors text-[#1F1F1F] dark:text-white ${className}`}
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={direction === 'next' ? 'rotate-180' : ''}
    >
      <path
        d="M15 18L9 12L15 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);

const ResolvedEventsCarousel = ({ companyId = "all", limit = 10, aggregatorAddress = null, connectedWallet = null, onEditProposal = null }) => {
  const [swiper, setSwiper] = useState(null);
  const [resolvedEvents, setResolvedEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debugMode') === 'true';
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    const loadResolvedEvents = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchResolvedEventHighlightData(companyId, limit, { connectedWallet, aggregatorAddress });
        setResolvedEvents(data);
      } catch (error) {
        console.error('Error loading closed event highlights:', error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };

    loadResolvedEvents();
  }, [companyId, limit, connectedWallet, aggregatorAddress, reloadKey]);

  useEffect(() => {
    // Closed/completed events should show regardless of debug mode.
    setFilteredEvents(resolvedEvents);
  }, [resolvedEvents, debugMode]);

  useEffect(() => {
    if (swiper) {
      const updateNav = () => {
        if (swiper.isLocked) {
          setShowPrev(false);
          setShowNext(false);
        } else {
          setShowPrev(!swiper.isBeginning);
          setShowNext(!swiper.isEnd);
        }
      };

      swiper.on('slideChange', updateNav);
      swiper.on('resize', updateNav);

      updateNav(); // Initial check

      return () => {
        if (swiper && !swiper.destroyed) {
          swiper.off('slideChange', updateNav);
          swiper.off('resize', updateNav);
        }
      };
    }
  }, [swiper, filteredEvents]); // Re-run when events change

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }


  if (loadError) {
    return (
      <div className="flex flex-col justify-center items-center gap-3 h-[200px] text-futarchyGray11">
        <div className="text-sm">Market data is unavailable right now.</div>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-3 py-1.5 text-xs rounded-lg border border-futarchyGray62 dark:border-futarchyGray112/40 hover:text-futarchyGray12 dark:hover:text-white transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!filteredEvents || filteredEvents.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[200px] text-futarchyGray11">
        <div className="text-4xl mb-2">🏁</div>
        <div className="text-sm">No closed markets yet</div>
      </div>
    );
  }

  return (
    <div className="relative md:px-[60px] md:-mx-[60px]">
      {showPrev && (
        <NavigationButton
          direction="prev"
          className="left-0"
          onClick={() => swiper?.slidePrev()}
        />
      )}
      <Swiper
        modules={[Navigation]}
        spaceBetween={24}
        slidesPerView={1}
        breakpoints={{
          768: {
            slidesPerView: 'auto',
          },
        }}
        onSwiper={setSwiper}
        navigation={false}
        watchOverflow={true}
        className="!overflow-hidden"
        wrapperClass="!items-stretch"
      >
        {filteredEvents.map((event, index) => (
          <SwiperSlide key={`${event.eventId}-${index}`} className="md:!w-auto">
            <HighlightCard
              marketId={event.eventId}
              marketName={event.eventTitle}
              companyLogoUrl={event.companyLogo}
              endTime={event.endTime}
              proposalCreationTimestamp={event.endTime} // For closed events, use endTime as proposal time
              status="Done"
              marketStatus={event.marketStatus}
              impact={event.impact}
              companySymbol={event.companySymbol}
              poolAddresses={event.poolAddresses}
              metadata={event.metadata}
              chainId={event.chainId}
              prefetchedPrices={event.prefetchedPrices}
              isOwner={event.isOwner}
              isEditor={event.isEditor}
              fromSubgraph={event.fromSubgraph}
              proposalMetadataAddress={event.proposalMetadataAddress || event.id}
              onEditProposal={onEditProposal}
              visibility={event.visibility}
            />
          </SwiperSlide>
        ))}
      </Swiper>
      {showNext && (
        <NavigationButton
          direction="next"
          className="right-0"
          onClick={() => swiper?.slideNext()}
        />
      )}
    </div>
  );
};

export default ResolvedEventsCarousel; 
