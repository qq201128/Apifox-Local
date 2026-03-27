'use client'

import { useState } from 'react'

import { Button, Card, Form, Input, Typography, message } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router'

import { resolveAuthRedirectTarget } from '@/router/auth-redirect'

interface AuthFormProps {
  mode: 'login' | 'register'
}

interface AuthResponse {
  ok: boolean
  error: string | null
}

export function AuthForm(props: AuthFormProps) {
  const { mode } = props
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { search } = useLocation()
  const redirectTo = resolveAuthRedirectTarget(new URLSearchParams(search).get('redirect'))
  const peerAuthPath = `${mode === 'login' ? '/register' : '/login'}?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <Typography.Title level={3}>
          {mode === 'login' ? '登录' : '注册'}
        </Typography.Title>

        <Form<{ username: string, password: string }>
          layout="vertical"
          onFinish={async (values) => {
            setSubmitting(true)

            try {
              const response = await fetch(`/api/v1/auth/${mode}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
              })

              const payload = await response.json() as AuthResponse

              if (!response.ok || !payload.ok) {
                throw new Error(payload.error ?? `${mode} 失败`)
              }

              message.success(mode === 'login' ? '登录成功' : '注册成功')
              navigate(redirectTo, { replace: true })
            }
            catch (error) {
              message.error((error as Error).message)
            }
            finally {
              setSubmitting(false)
            }
          }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '至少 3 个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '至少 6 个字符' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item>
            <Button block htmlType="submit" loading={submitting} type="primary">
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>

        <Typography.Text type="secondary">
          {mode === 'login' ? '没有账号？' : '已有账号？'}
          {' '}
          <Link to={peerAuthPath}>
            {mode === 'login' ? '去注册' : '去登录'}
          </Link>
        </Typography.Text>
      </Card>
    </div>
  )
}
