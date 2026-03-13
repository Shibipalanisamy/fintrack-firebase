import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      if (isLogin) { await login(form.email, form.password); toast.success('Welcome back!'); }
      else { await register(form.name, form.email, form.password); toast.success('Account created! 🎉'); }
      navigate('/');
    } catch (err) {
      toast.error(err.message.replace('Firebase: ', '').replace(/\(.*?\)\./g, ''));
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">💰</div>
          <div className="auth-title">FinTrack</div>
          <div className="auth-sub">{isLogin ? 'Sign in to your account' : 'Create your free account'}</div>
        </div>
        <form onSubmit={submit}>
          {!isLogin && (
            <div className="fg">
              <label className="fl">Full Name</label>
              <input className="fi" type="text" name="name" value={form.name} onChange={ch} placeholder="John Doe" required />
            </div>
          )}
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" type="email" name="email" value={form.email} onChange={ch} placeholder="you@example.com" required />
          </div>
          <div className="fg">
            <label className="fl">Password</label>
            <input className="fi" type="password" name="password" value={form.password} onChange={ch} placeholder="••••••••" required minLength={6} />
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            {loading ? <span className="spin" /> : null}
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <div className="auth-switch">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          {' '}<button onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Sign up free' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}
