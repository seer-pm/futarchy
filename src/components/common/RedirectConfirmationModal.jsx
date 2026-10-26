import React, { useState, useEffect, useRef } from 'react';
import { Dialog } from '@seer-pm/ui-kit/react';

const RedirectConfirmationModal = ({ showModal, onClose, onAccept, title = 'Confirm Redirect' }) => {
  const [countdown, setCountdown] = useState(4);
  const timerRef = useRef(null);
  const hasAcceptedRef = useRef(false);

  useEffect(() => {
    if (showModal) {
      setCountdown(4);
      hasAcceptedRef.current = false;
      timerRef.current = setInterval(() => {
        setCountdown(prevCountdown => prevCountdown - 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [showModal]);

  useEffect(() => {
    if (countdown === 0 && !hasAcceptedRef.current) {
      clearInterval(timerRef.current);
      hasAcceptedRef.current = true;
      onAccept();
    }
  }, [countdown, onAccept]);

  const handleClose = () => {
    clearInterval(timerRef.current);
    onClose();
  };

  return (
    <Dialog open={showModal} onClose={handleClose} title={title}>
      <p className="text-sm text-seer-text">
        You will be redirected to a page to redeem your conditional tokens in {countdown} second{countdown === 1 ? '' : 's'}.
      </p>
    </Dialog>
  );
};

export default RedirectConfirmationModal; 