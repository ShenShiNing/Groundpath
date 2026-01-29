import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { SessionList } from '@/components/sessions';

export function SessionsPage() {
  return (
    <AppLayout showFooter="simple">
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>
              Manage your active login sessions. You can revoke access from devices you no longer
              use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionList />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default SessionsPage;
