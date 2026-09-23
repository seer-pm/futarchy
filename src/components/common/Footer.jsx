// components/common/Footer.jsx
import Image from "next/image";
import BrandLogo from "./BrandLogo";

const SOCIAL_LINKS = [
  { src: '/assets/x-logo.png', alt: 'X (Twitter)', href: 'https://x.com/seer_pm' },
  { src: '/assets/github-icon.svg', alt: 'GitHub', href: 'https://github.com/seer-pm/futarchy' },
];

const Footer = ({ className = '' }) => {
  return (
    <footer className={`w-full mt-auto ${className}`}>
      <div className="bg-futarchyDarkGray1 text-white py-8 w-full">
        <div className="container mx-auto px-5 flex flex-col space-y-6">
          {/* Top row: logo + social */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            {/* Logo and tagline */}
            <div>
              <BrandLogo />
              <div className="text-sm text-futarchyGray112 mt-4">
                Market-based evaluation of governance decisions and milestones
              </div>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <div className="text-sm text-futarchyGray10 font-medium">Social</div>
              <div className="flex flex-row gap-[10px]">
                {SOCIAL_LINKS.map((social) => (
                  <a
                    key={social.alt}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg border border-futarchyGray6 flex items-center justify-center hover:border-futarchyGray10 transition-colors"
                  >
                    <Image
                      src={social.src}
                      alt={social.alt}
                      width={24}
                      height={24}
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
