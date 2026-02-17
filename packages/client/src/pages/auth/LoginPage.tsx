import { LoginForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function LoginPage() {
  return (
    <AuthPageLayout
      title="登录 KnowledgeAgent"
      description="使用邮箱登录并继续你的知识工作流"
      footer={<AuthFooterLink text="还没有账号？" linkText="立即注册" linkTo="/auth/signup" />}
    >
      <LoginForm />
    </AuthPageLayout>
  );
}

export default LoginPage;
