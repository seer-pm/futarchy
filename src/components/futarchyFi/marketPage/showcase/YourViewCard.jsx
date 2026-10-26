import { Surface, SurfaceHeader } from '../../../ui/Surface';

// How a view on the proposal maps onto trades in each conditional world. Buy and sell carry the
// positive and negative status colours; the words, not the colour, say which is which.
const YourViewCard = ({ subject }) => (
  <Surface>
    <SurfaceHeader as="h3" title={`Your view on ${subject}`} />
    <div className="px-4 py-2">
      <table className="w-full table-fixed text-[13px] text-center">
        <thead>
          <tr className="text-seer-muted">
            <th className="pb-2 text-left font-normal" />
            <th className="pb-2 font-normal">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-pass" aria-hidden="true" />If YES
              </span>
            </th>
            <th className="pb-2 font-normal">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-fail" aria-hidden="true" />If NO
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="text-seer-text">
          <tr className="border-t border-seer-border">
            <th scope="row" className="py-2.5 text-left font-semibold">Bullish</th>
            <td className="py-2.5 font-semibold text-seer-positive">BUY</td>
            <td className="py-2.5 font-semibold text-seer-negative">SELL</td>
          </tr>
          <tr className="border-t border-seer-border">
            <th scope="row" className="py-2.5 text-left font-semibold">Bearish</th>
            <td className="py-2.5 font-semibold text-seer-negative">SELL</td>
            <td className="py-2.5 font-semibold text-seer-positive">BUY</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Surface>
);

export { YourViewCard };
