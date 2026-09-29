'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { fetchEventHighlightData } from '../page/EventsHighlightDataTransformer';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import EventHighlightCard from '../cards/highlightCards/EventHighlightCard';
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

const EventsHighlightCarousel = ({ companyId, useNewCard = false, aggregatorAddress = null, connectedWallet = null, onEditProposal = null }) => {
  const [swiper, setSwiper] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debugMode') === 'true';
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Pass aggregator and wallet for subgraph integration
        const data = await fetchEventHighlightData(companyId, {
          aggregatorAddress,
          connectedWallet
        });
        setEvents(data);
      } catch (error) {
        console.error('Error loading event highlights:', error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [companyId, aggregatorAddress, connectedWallet, reloadKey]);

  useEffect(() => {
    const newFilteredEvents = debugMode
      ? events
      : events.filter(event => event.status !== 'pending_review');
    setFilteredEvents(newFilteredEvents);
  }, [events, debugMode]);

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

      // Force swiper to recalculate when cards are loaded
      swiper.update();

      swiper.on('slideChange', updateNav);
      swiper.on('resize', updateNav);
      swiper.on('update', updateNav);

      // Delay initial check to ensure cards are rendered
      setTimeout(() => {
        swiper.update();
        updateNav();
      }, 100);

      return () => {
        if (swiper && !swiper.destroyed) {
          swiper.off('slideChange', updateNav);
          swiper.off('resize', updateNav);
          swiper.off('update', updateNav);
        }
      };
    }
  }, [swiper, filteredEvents]); // Re-run when events change

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-futarchyLavender"></div>
      </div>
    );
  }


  if (loadError) {
    return (
      <div className="flex flex-col justify-center items-center gap-3 h-[200px] text-futarchyGray11">
        <div className="text-sm">Event data is unavailable right now.</div>
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
      <div className="flex justify-center items-center h-[200px] text-futarchyGray11">
        No upcoming events
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
          <SwiperSlide key={index} className="md:!w-auto">
            {useNewCard ? (
              <HighlightCard
                useMockData={true}
              />
            ) : (
              <EventHighlightCard
                eventId={event.eventId}
                companyLogo={event.companyLogo}
                proposalTitle={event.eventTitle}
                authorName={event.authorName}
                initialStats={event.stats}
                predictionPools={event.predictionPools}
                poolAddresses={event.poolAddresses}
                timeProgress={event.timeProgress}
                startTime={event.startTime}
                endTime={event.endTime}
                countdownFinish={event.status === "approved" || event.status === "refused"}
                status={event.status}
                approvalStatus={event.approvalStatus}
                metadata={event.metadata}
                resolutionStatus={event.resolutionStatus}
                chainId={event.chainId}
                prefetchedPrices={event.prefetchedPrices}
                isOwner={event.isOwner}
                isEditor={event.isEditor}
                visibility={event.visibility || 'public'}
                fromSubgraph={event.fromSubgraph}
                proposalMetadataAddress={event.proposalMetadataAddress}
                onEditProposal={onEditProposal}
              />
            )}
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

export default EventsHighlightCarousel; 