/**
 * Takes the place of the outcomes and trade panels while a categorical
 * proposal's family is read (useCategoricalMarket isCategoricalPending): the
 * proposal is known to be categorical, but its answers, chained questions
 * included, are not, so neither the YES/NO panels nor a partial list of
 * answers would be right. When the last read failed it says so; the hook
 * tries again by itself, and Retry does it now.
 */
const CategoricalStatusCard = ({ categorical, title = 'Outcomes' }) => {
  const { familyError, retryFamily } = categorical;
  return (
    <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      <div className="flex h-16 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">{title}</h3>
      </div>
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role={familyError ? 'alert' : 'status'}>
        {familyError ? (
          <>
            <p className="text-sm font-semibold text-futarchyCrimson9">Could not load the market&apos;s answers</p>
            <p className="max-w-md break-words text-xs text-futarchyGray11 dark:text-white/70">{familyError}</p>
            <p className="text-xs text-futarchyGray11 dark:text-white/70">Trying again every few seconds.</p>
            <button
              onClick={retryFamily}
              className="mt-1 px-4 py-2 rounded-lg text-xs font-semibold border-2 border-futarchyGray62 dark:border-futarchyGray11/70 text-futarchyGray12 dark:text-white hover:border-futarchyLavender transition-colors"
            >
              Retry now
            </button>
          </>
        ) : (
          <>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-futarchyGray62 border-t-futarchyLavender" />
            <p className="text-sm text-futarchyGray11 dark:text-white/70">Loading the market&apos;s answers…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default CategoricalStatusCard;
