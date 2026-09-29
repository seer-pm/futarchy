import dynamic from 'next/dynamic';
import Head from 'next/head';

const CreateMarketFlow = dynamic(
  () => import('../../../components/futarchyFi/createMarket/CreateMarketFlow'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-futarchyDarkGray2">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-futarchyLavender" />
      </div>
    ),
  }
);

export default function NewMarketPage() {
  return (
    <>
      <Head>
        <title>Create a Market | Futarchy</title>
      </Head>
      <CreateMarketFlow />
    </>
  );
}
