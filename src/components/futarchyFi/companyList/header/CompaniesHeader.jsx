import React from "react";
import Link from "next/link";
import BrandLogo from "../../../common/BrandLogo";

const CompaniesHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-white/10">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo />
          </Link>
          
          <div className="flex items-center gap-4">
            <button className="px-4 py-2 text-white border border-white/20 hover:bg-white/10 transition-colors">
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default CompaniesHeader; 