import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProfileForm } from '@/components/profile';

export function ProfilePage() {
  return (
    <AppLayout showFooter="simple">
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
            <CardDescription>Update your personal information and avatar</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              onSuccess={() => {
                toast.success('Profile updated successfully');
              }}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default ProfilePage;
