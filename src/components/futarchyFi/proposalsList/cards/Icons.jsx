import React from 'react';

export const TooltipArrow = ({ className }) => (
  <svg
    className={className}
    width="17"
    height="9"
    viewBox="0 0 17 9"
    fill="#31403C"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14.5711 0.485289C15.462 0.485289 15.9081 1.56243 15.2782 2.1924L9.20711 8.26347C8.81658 8.654 8.18342 8.654 7.79289 8.26347L1.72183 2.1924C1.09187 1.56243 1.53803 0.485289 2.42894 0.485289L14.5711 0.485289Z"
      fill="#31403C"
    />
  </svg>
);

export const SupportIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g clipPath="url(#clip0_12033_1905)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.00002 1.16669C4.22607 1.16669 1.16669 4.22607 1.16669 8.00002C1.16669 11.774 4.22607 14.8334 8.00002 14.8334C11.774 14.8334 14.8334 11.774 14.8334 8.00002C14.8334 4.22607 11.774 1.16669 8.00002 1.16669ZM0.166687 8.00002C0.166687 3.67379 3.67379 0.166687 8.00002 0.166687C12.3263 0.166687 15.8334 3.67379 15.8334 8.00002C15.8334 12.3263 12.3263 15.8334 8.00002 15.8334C3.67379 15.8334 0.166687 12.3263 0.166687 8.00002Z"
        fill="currentColor"
      />
      <path
        d="M7.99998 12.6666C8.36817 12.6666 8.66665 12.3682 8.66665 12C8.66665 11.6318 8.36817 11.3333 7.99998 11.3333C7.63179 11.3333 7.33331 11.6318 7.33331 12C7.33331 12.3682 7.63179 12.6666 7.99998 12.6666Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.60387 4.51342C8.02964 4.45952 7.35802 4.57118 6.77078 4.8307L6.31345 5.0328L5.90924 4.11813L6.36657 3.91603C7.09934 3.59221 7.94172 3.44687 8.69733 3.5178C9.44071 3.58758 10.1975 3.88051 10.6054 4.54053C11.3781 5.79102 10.7712 7.15285 9.68391 8.07417C8.67488 8.92915 8.50001 9.25362 8.50001 9.6667V10.1667H7.50001V9.6667C7.50001 8.74644 8.04648 8.1509 9.03745 7.31122C9.95013 6.53787 10.1486 5.7037 9.75467 5.0662C9.57918 4.78221 9.19032 4.56848 8.60387 4.51342Z"
        fill="currentColor"
      />
    </g>
    <defs>
      <clipPath id="clip0_12033_1905">
        <rect width="16" height="16" fill="currentColor" />
      </clipPath>
    </defs>
  </svg>
);

export const CheckIcon = ({ fill = "currentColor", ...props }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M13.3337 4L6.00033 11.3333L2.66699 8" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  
export const CancelIcon = ({ fill = "currentColor", ...props }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 4L4 12" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 4L12 12" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  
export const NewspaperIcon = (props) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path d="M16.6663 5.00065H3.33301V17.5007H16.6663V5.00065Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.5 9.16602H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.5 13.334H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.83301 5.00065V3.33398C5.83301 2.89196 5.99969 2.46807 6.31225 2.15551C6.62481 1.84295 7.0487 1.66663 7.49967 1.66663H15.833C16.2739 1.66663 16.6978 1.84295 17.0104 2.15551C17.3229 2.46807 17.4997 2.89196 17.4997 3.33398V14.1673C17.4997 14.6093 17.3229 15.0332 17.0104 15.3458C16.6978 15.6583 16.2739 15.8346 15.833 15.8346H15.0003" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
  );
  
export const EyeIcon = (props) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path d="M1.66699 10.0007C1.66699 10.0007 4.16699 4.16732 10.0003 4.16732C15.8337 4.16732 18.3337 10.0007 18.3337 10.0007C18.3337 10.0007 15.8337 15.834 10.0003 15.834C4.16699 15.834 1.66699 10.0007 1.66699 10.0007Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
  );
  
export const LoadingSpinner = ({ className = "h-4 w-4 text-seer-muted" }) => (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2"/>
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  );