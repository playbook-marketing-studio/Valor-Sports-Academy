import React from 'react';
import { AlertTriangle } from 'lucide-react';

const UserNotRegisteredError = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-lg">
        <div className="text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-warning-surface">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          <h1 className="mb-4 text-3xl font-bold">Access restricted</h1>
          <p className="mb-8 text-muted-foreground">
            This login isn't set up for the Valor app yet. Ask the Valor staff to send you an invite.
          </p>
          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            <p>If you think this is a mistake:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Check you're signed in with the right email</li>
              <li>Sign out and back in</li>
              <li>Text the Valor staff</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
