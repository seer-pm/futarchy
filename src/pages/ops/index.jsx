import Head from 'next/head';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import OpsActionCard from '../../ops/components/OpsActionCard';
import { opsActions } from '../../ops/actions';

export default function OpsPage() {
  return (
    <>
      <Head>
        <title>Ops Signer | Futarchy</title>
        <meta
          name="description"
          content="Futarchy administrative signer for typed, prechecked owner actions."
        />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <Header />

      <main className="min-h-screen bg-futarchyGray2 px-4 pb-16 pt-28 text-futarchyGray12">
        <div className="mx-auto max-w-6xl">
          <section className="mb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-futarchyGray11">Futarchy ops</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-futarchyGray12 md:text-4xl">
                  Typed action signer
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-futarchyGray11">
                  Connect the authorized wallet and sign only repo-backed administrative actions. This page does not
                  accept arbitrary calldata or mutable action definitions.
                </p>
              </div>
              <div className="rounded-lg border border-futarchyGray5 bg-white p-3 shadow-sm">
                <ConnectButton />
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-futarchyGray5 bg-white p-4 text-sm leading-6 text-futarchyGray11">
            <div className="font-semibold text-futarchyGray12">Safety model</div>
            <div className="mt-1">
              Action types, ABIs, target contracts, arguments, required signers, prechecks, and postchecks are defined
              in the repository. Signing is enabled only after wallet, chain, precheck, and simulation gates pass.
            </div>
          </section>

          <div className="space-y-6">
            {opsActions.map((action) => (
              <OpsActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
