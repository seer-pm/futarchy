import React from "react";
import Image from "next/image";

const PageHeader = ({
  title,
  logoSrc,
  logoAlt,
  children,
  watermark = true,
}) => {
  return (
    <div className="relative bg-gradient-to-r from-futarchyDarkGray2 via-futarchyDarkGray2 to-futarchyDarkGray2/90 pt-20 font-oxanium">
      <div className="container mx-auto px-5">
        {watermark && (
          <div className="absolute top-1/2 right-[100px] -translate-y-1/2 pointer-events-none hidden lg:block">
            <Image
              src="/assets/seer-logo.svg"
              alt="Futarchy Watermark"
              width={286}
              height={286}
              className="opacity-[0.03]"
              priority
            />
          </div>
        )}

        <div className="flex flex-col py-12 md:py-20">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            {logoSrc && (
              <div className="min-w-[120px] lg:min-w-[180px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={120}
                  height={120}
                  className="rounded-[12px] lg:w-[180px] lg:h-[180px]"
                  priority
                />
              </div>
            )}
            <div className="flex flex-col flex-1 items-start text-left">
              <h2 className="text-4xl lg:text-[57px] font-oxanium text-white mb-2 font-semibold leading-tight">
                {title}
              </h2>
              {/* Children will render additional content like descriptions, stats, etc. */}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader; 