import { useEffect, useState } from 'react';

const useTokenImages = (config) => {
  // Token images for trade history rows; populated from on-chain metadata when available
  const [tokenImages, setTokenImages] = useState({
    company: null,
    currency: null
  });

  // Pull token images from the on-chain proposal metadata when present
  useEffect(() => {
    const meta = config?._registryMetadata || config?.marketInfo?.metadata;
    const images = meta?.token_images || meta?.tokenImages;
    if (images?.company || images?.currency) {
      setTokenImages({
        company: images.company || null,
        currency: images.currency || null
      });
    }
  }, [config?._registryMetadata, config?.marketInfo?.metadata]);

  return tokenImages;
};

export { useTokenImages };
