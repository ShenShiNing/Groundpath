import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AppLayout } from '@/components/layout/AppLayout';
import { UserSummary, QuickLinks } from '@/components/dashboard';

export function DashboardPage() {
  return (
    <AppLayout showFooter="simple">
      <div className="container max-w-4xl py-8">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

        <div className="space-y-6">
          {/* User Summary */}
          <Card>
            <CardContent className="p-6">
              <UserSummary />
            </CardContent>
          </Card>

          <Separator />

          {/* Quick Links */}
          <QuickLinks />
        </div>
      </div>
    </AppLayout>
  );
}

export default DashboardPage;
