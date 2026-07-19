import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, Spinner } from './ui'

export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Если в проекте включено подтверждение email, сессии сразу не будет.
        if (!data.session) {
          setNotice('Аккаунт создан. Подтвердите email по ссылке из письма и войдите.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(translateAuthError(err.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <span className="font-display text-xl">Ziglish</span>
        </div>

        <Card className="p-6">
          <h1 className="text-xl font-semibold">
            {mode === 'signin' ? 'Вход' : 'Регистрация'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'signin'
              ? 'Войдите, чтобы открыть свои папки и наборы.'
              : 'Создайте аккаунт — данные будут доступны с любого устройства.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <Label>Пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="Минимум 6 символов"
              />
            </label>

            <ErrorText>{error}</ErrorText>
            {notice && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                {notice}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Spinner className="h-4 w-4" />}
              {mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            {mode === 'signin' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError('')
                setNotice('')
              }}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {mode === 'signin' ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </p>
        </Card>
      </div>
    </div>
  )
}

function translateAuthError(message = '') {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль.'
  if (m.includes('user already registered')) return 'Такой email уже зарегистрирован.'
  if (m.includes('email not confirmed')) return 'Email не подтверждён — проверьте почту.'
  if (m.includes('password should be')) return 'Пароль слишком короткий (минимум 6 символов).'
  if (m.includes('failed to fetch')) return 'Нет связи с Supabase. Проверьте SUPABASE_URL и интернет.'
  return message
}
