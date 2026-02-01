import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AppLayout } from '@/components/layout/AppLayout';
import { UserSummary, QuickLinks } from '@/components/dashboard';

export function DashboardPage() {
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
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
      </div>
    </AppLayout>
  );
}

export default DashboardPage;
