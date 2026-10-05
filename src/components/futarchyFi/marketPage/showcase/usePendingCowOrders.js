import { useEffect, useState } from 'react';

const usePendingCowOrders = (address, isConnected) => {
  // ---> State for pending order check (count instead of ID) <---
  const [isLoadingPendingOrder, setIsLoadingPendingOrder] = useState(false);
  // const [pendingOrderId, setPendingOrderId] = useState(null); // Remove single ID state
  const [pendingOrderCount, setPendingOrderCount] = useState(0); // Add count state
  const [showPendingOrderToast, setShowPendingOrderToast] = useState(false);

  // ---> useEffect to check for pending CoW orders <---
  useEffect(() => {
    const checkPendingCowOrders = async () => {
      if (!isConnected || !address) {
        setShowPendingOrderToast(false); // Hide toast if disconnected
        setPendingOrderCount(0); // Reset count
        return;
      }

      console.log('[Pending Order Check] Starting check for address:', address);
      setIsLoadingPendingOrder(true);
      setPendingOrderCount(0); // Reset before check
      setShowPendingOrderToast(false);

      try {
        // CoW orders only come from the WXDAI -> sDAI modal, which is Gnosis-only.
        const response = await fetch(`https://api.cow.fi/xdai/api/v1/account/${address}/orders?limit=10`);
        if (!response.ok) throw new Error(`CoW API responded ${response.status}`);
        const ordersData = await response.json();

        console.log('[Pending Order Check] Received orders:', ordersData);

        // ---> Filter for all pending orders and get count <----
        const pendingOrders = ordersData.filter(order =>
          order.status === 'open' || order.status === 'presignaturePending'
        );
        const count = pendingOrders.length;

        if (count > 0) {
          console.log(`[Pending Order Check] Found ${count} pending order(s).`);
          setPendingOrderCount(count);
          setShowPendingOrderToast(true);
        } else {
          console.log('[Pending Order Check] No pending orders found.');
          setPendingOrderCount(0);
          setShowPendingOrderToast(false);
        }

      } catch (error) {
        console.error('[Pending Order Check] Error checking for pending CoW orders:', error);
        // Don't show toast on error, just log it
        setPendingOrderCount(0);
        setShowPendingOrderToast(false);
      } finally {
        setIsLoadingPendingOrder(false);
      }
    };

    checkPendingCowOrders();

  }, [address, isConnected]);

  return { isLoadingPendingOrder, pendingOrderCount, showPendingOrderToast };
};

export { usePendingCowOrders };
