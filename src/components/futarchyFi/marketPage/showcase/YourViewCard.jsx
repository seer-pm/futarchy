

// PriceHeader component for mobile price display
const YourViewCard = ({ subject }) => (
  <div className="bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
    <div className="px-4 py-3 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70">
      <h3 className="font-oxanium text-sm font-semibold text-futarchyGray12 dark:text-white">
        Your view on {subject}
      </h3>
    </div>
    <div className="px-4 py-3">
      <table className="w-full table-fixed font-oxanium text-xs text-center">
        <thead>
          <tr className="text-futarchyGray11 dark:text-white/60">
            <th className="pb-2 text-left font-medium" />
            <th className="pb-2 font-medium">If YES</th>
            <th className="pb-2 font-medium">If NO</th>
          </tr>
        </thead>
        <tbody className="text-futarchyGray12 dark:text-white">
          <tr className="border-t border-futarchyGray62 dark:border-futarchyGray11/50">
            <th scope="row" className="py-2 text-left font-medium">
              <span className="inline-block w-2 h-2 mr-2 rounded-full bg-futarchyTeal9" />Bullish
            </th>
            <td className="py-2 font-semibold text-futarchyTeal9">BUY</td>
            <td className="py-2 font-semibold text-futarchyCrimson9">SELL</td>
          </tr>
          <tr className="border-t border-futarchyGray62 dark:border-futarchyGray11/50">
            <th scope="row" className="py-2 text-left font-medium">
              <span className="inline-block w-2 h-2 mr-2 rounded-full bg-futarchyCrimson9" />Bearish
            </th>
            <td className="py-2 font-semibold text-futarchyCrimson9">SELL</td>
            <td className="py-2 font-semibold text-futarchyTeal9">BUY</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

export { YourViewCard };
