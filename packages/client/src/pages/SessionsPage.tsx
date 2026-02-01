import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { SessionList } from '@/components/sessions';

export function SessionsPage() {
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
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
      </div>
    </AppLayout>
  );
}

export default SessionsPage;
