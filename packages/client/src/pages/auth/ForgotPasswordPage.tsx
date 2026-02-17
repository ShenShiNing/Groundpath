import { ForgotPasswordForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function ForgotPasswordPage() {
  return (
    <AuthPageLayout
      title="忘记密码"
      description="通过邮箱验证码安全重置你的账号密码"
      footer={<AuthFooterLink text="已经想起来了？" linkText="返回登录" linkTo="/auth/login" />}
    >
      <ForgotPasswordForm />
    </AuthPageLayout>
  );
}

export default ForgotPasswordPage;
