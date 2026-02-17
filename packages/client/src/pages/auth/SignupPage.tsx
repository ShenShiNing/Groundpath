import { Link } from '@tanstack/react-router';
import { SignupForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function SignupPage() {
  return (
    <AuthPageLayout
      title="创建你的账号"
      description="开始搭建你的知识库 Agent 工作空间"
      footer={
        <>
          <AuthFooterLink text="已经有账号？" linkText="去登录" linkTo="/auth/login" />
          <p className="text-center text-xs text-muted-foreground mt-4">
            注册即代表你同意我们的{' '}
            <Link
              to="/about"
              className="underline underline-offset-4 hover:text-foreground cursor-pointer"
            >
              服务条款
            </Link>{' '}
            与{' '}
            <Link
              to="/about"
              className="underline underline-offset-4 hover:text-foreground cursor-pointer"
            >
              隐私政策
            </Link>
            。
          </p>
        </>
      }
    >
      <SignupForm />
    </AuthPageLayout>
  );
}

export default SignupPage;
