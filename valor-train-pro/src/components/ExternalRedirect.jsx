import { useEffect } from 'react';

/** Sends the visitor to another site (e.g. /book goes to the site's free assessment form). */
export default function ExternalRedirect({ to }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}
