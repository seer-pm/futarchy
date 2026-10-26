import React from "react";
import Image from "next/image";

// A page's heading on the page ground: the logo beside the title, then whatever the page adds
// (badges, a description, a count). It clears the fixed 80px header itself and ends on a hairline,
// so the content below starts on the same ground without a band of colour between them.
const PageHeader = ({
  title,
  logoSrc,
  logoAlt,
  children,
}) => {
  return (
    <div className="bg-seer-page text-seer-text pt-20">
      <div className="container mx-auto px-5">
        <div className="flex flex-col sm:flex-row items-start gap-5 md:gap-6 pt-8 md:pt-12 pb-8 border-b border-seer-border">
          {logoSrc && (
            <span className="relative shrink-0 w-16 h-16 md:w-24 md:h-24 rounded-surface overflow-hidden border border-seer-border bg-seer-surface">
              <Image
                src={logoSrc}
                alt={logoAlt}
                fill
                sizes="(min-width: 768px) 96px, 64px"
                className="object-cover"
                priority
              />
            </span>
          )}
          <div className="flex flex-col flex-1 min-w-0 items-start text-left">
            <h1 className="text-[26px] md:text-[32px] leading-[1.15] font-semibold tracking-tight text-seer-text [text-wrap:balance] break-words max-w-full">
              {title}
            </h1>
            {/* Children render the page's own details: badges, a description, counts. */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
