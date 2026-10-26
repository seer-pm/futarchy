// components/common/Footer.jsx
//
// The footer every Seer site closes with, from @seer-pm/ui-kit, with Futarchy's own column first.
// The Ecosystem and Resources columns and the social links come from the kit.

import { EcosystemFooter } from "@seer-pm/ui-kit/react";
import { seerApps } from "@seer-pm/ui-kit";

const FUTARCHY_LINKS = [
  { name: 'Organizations', url: '/companies' },
  { name: 'Source code', url: 'https://github.com/seer-pm/futarchy' },
];

const TAGLINE = seerApps.find((app) => app.id === 'futarchy')?.summary;

const Footer = ({ className = '' }) => (
  <div className={`w-full mt-auto ${className}`}>
    <EcosystemFooter
      appName="Futarchy"
      homeUrl="/"
      tagline={TAGLINE}
      groups={[{ title: 'Futarchy', links: FUTARCHY_LINKS }]}
    />
  </div>
);

export default Footer;
