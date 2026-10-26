'use client';

import React, { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

import { ProposalsCard } from '../cards/ProposalsCards';

// Carousel navigation button
const NavigationButton = ({ direction, onClick, className }) => (
  <button
    onClick={onClick}
    aria-label={direction === 'next' ? 'Next milestones' : 'Previous milestones'}
    className={`seer-button seer-button-outline seer-button-icon absolute top-1/2 -translate-y-1/2 z-10 bg-seer-surface ${className}`}
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
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

const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-[200px]">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-seer-border border-t-seer-purple" role="status" aria-label="Loading milestones"></div>
    </div>
);

const ProposalsListCarousel = ({ proposals, isLoading }) => {
  const [swiper, setSwiper] = useState(null);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);

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
  }, [swiper, proposals]); // Re-run when proposals change to update nav status

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!proposals || proposals.length === 0) {
    return (
      <div className="flex justify-center items-center h-[200px] text-sm text-seer-muted">
        No proposals available.
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
        watchOverflow={true}
        navigation={false}
        className="!overflow-hidden"
        wrapperClass="!items-stretch"
      >
        {proposals.map((proposal) => (
          <SwiperSlide key={proposal.proposalID} className="md:!w-auto">
            <ProposalsCard {...proposal} />
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

export default ProposalsListCarousel;
