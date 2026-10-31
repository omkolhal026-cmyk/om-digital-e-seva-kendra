import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { User as UserType } from '../types';

export type LoginTheme = 'navy' | 'light' | 'royal';

interface LoginPageProps {
  onLoginSuccess: (user: UserType, rememberMe: boolean) => void;
  officeLogo?: string;
  officeName?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [usernameOrMobile, setUsernameOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const inputVal = usernameOrMobile.trim();
    const passVal = password;

    if (!inputVal) {
      setError('कृपया वापरकर्ता नाव प्रविष्ट करा (Please enter username)');
      return;
    }

    if (!passVal) {
      setError('कृपया पासवर्ड प्रविष्ट करा (Please enter password)');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrMobile: inputVal, password: passVal }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'अवैध वापरकर्ता नाव किंवा पासवर्ड (Invalid credentials)');
      }

      if (data.token) {
        localStorage.setItem('om_eseva_token', data.token);
      }
      localStorage.setItem('mbocw_last_login_time', new Date().toISOString());
      setLoading(false);
      onLoginSuccess(data.user, true);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'अवैध वापरकर्ता नाव किंवा पासवर्ड (Invalid credentials)');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#e3e3e3] p-4 select-none">
      <form onSubmit={handleSubmit} className="card" id="uiverse-login-card">
        <div className="flex flex-col items-center">
          <div className="office-title">OM DIGITAL E-SEVA KENDRA</div>
          <span className="login">Log in</span>
        </div>

        <div className="inputBox">
          <input
            type="text"
            required
            value={usernameOrMobile}
            onChange={(e) => setUsernameOrMobile(e.target.value)}
            autoComplete="username"
            disabled={loading}
            id="login-username"
          />
          <span className="user">Username</span>
        </div>

        <div className="inputBox">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            id="login-password"
            className="password-input"
          />
          <span>Password</span>
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            className="toggle-eye"
            id="toggle-password-visibility"
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4 stroke-[2]" />
            ) : (
              <Eye className="w-4 h-4 stroke-[2]" />
            )}
          </button>
        </div>

        {error && (
          <div className="text-[11px] text-red-600 font-bold text-center px-4 max-w-[280px] -my-1 leading-tight">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`enter ${loading ? 'is-loading' : ''}`}
          id="login-submit-btn"
        >
          {loading ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              <span>Loading...</span>
            </>
          ) : (
            'Log in'
          )}
        </button>
      </form>
    </div>
  );
};
