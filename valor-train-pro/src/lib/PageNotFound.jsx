import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center text-card-foreground">
        <p className="stat-number text-6xl text-primary">404</p>
        <h1 className="mt-4 text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There's nothing at <span className="font-medium text-foreground">{location.pathname}</span>. It may have moved, or the link has a typo.
        </p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </div>
    </div>
  );
}
