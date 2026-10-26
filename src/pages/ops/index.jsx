import Head from 'next/head';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import OpsActionCard from '../../ops/components/OpsActionCard';
import { opsActions } from '../../ops/actions';
import { Surface } from '../../components/ui/Surface';

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

      <main className="min-h-screen bg-seer-page px-4 pb-16 pt-28 text-seer-text">
        <div className="mx-auto max-w-6xl">
          <section className="mb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[13px] font-semibold text-seer-muted">Futarchy ops</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-seer-text md:text-[28px]">
                  Typed action signer
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-seer-muted">
                  Connect the authorized wallet and sign only repo-backed administrative actions. This page does not
                  accept arbitrary calldata or mutable action definitions.
                </p>
              </div>
              <div className="shrink-0">
                <ConnectButton />
              </div>
            </div>
          </section>

          <Surface className="mb-6 p-4 text-sm leading-6 text-seer-muted">
            <h2 className="text-base font-semibold text-seer-text">Safety model</h2>
            <div className="mt-1">
              Action types, ABIs, target contracts, arguments, required signers, prechecks, and postchecks are defined
              in the repository. Signing is enabled only after wallet, chain, precheck, and simulation gates pass.
            </div>
          </Surface>

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
