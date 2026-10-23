import React, { useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { clearRpcCache, getBestRpc } from "../../utils/getBestRpc";
import Button from "../ui/Button";

/**
 * Drops the cached RPC and picks the best endpoint again. Without a className it is the header's
 * ghost icon button; a menu passes its own item className and showLabel.
 */
const RpcRefreshButton = ({ chain, className, showLabel = false }) => {
  const [isRefreshingRpc, setIsRefreshingRpc] = useState(false);

  const handleRefreshRpc = async () => {
    setIsRefreshingRpc(true);
    try {
      clearRpcCache();
      if (chain?.id) {
        await getBestRpc(chain.id);
      }
    } catch (error) {
      console.error("Failed to refresh RPC:", error);
    } finally {
      setIsRefreshingRpc(false);
    }
  };

  const icon = (
    <ArrowPathIcon
      className={`w-5 h-5 ${showLabel ? "text-seer-muted" : ""} ${isRefreshingRpc ? "animate-spin" : ""}`}
      aria-hidden="true"
    />
  );
  const label = isRefreshingRpc ? "Refreshing RPC" : "Refresh RPC connection";

  if (className) {
    return (
      <button type="button" onClick={handleRefreshRpc} disabled={isRefreshingRpc} className={className}>
        {icon}
        {showLabel && <span>{isRefreshingRpc ? "Refreshing RPC…" : "Refresh RPC"}</span>}
      </button>
    );
  }

  return (
    <Button variant="ghost" icon onClick={handleRefreshRpc} disabled={isRefreshingRpc} aria-label={label} title={label}>
      {icon}
    </Button>
  );
};

export default RpcRefreshButton;
