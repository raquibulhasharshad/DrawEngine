import React, { useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, UserPlus, AlertCircle, ShieldCheck, ArrowRight, Layers, Fingerprint } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    let errors = {};
    if (!email.trim()) errors.email = 'Registry email required';
    if (!password) errors.password = 'Authentication key required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Access denied');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white relative overflow-hidden">
      {/* Background Decor */}
      <div className="bg-glow"></div>
      <div className="noise-overlay"></div>
      <div className="blob top-[-15%] left-[-10%] animate-pulse-cyan"></div>
      <div className="blob bottom-[-15%] right-[-10%] opacity-40" style={{ animationDelay: '2s' }}></div>

      <div className="glass-plus w-full max-w-[480px] p-12 rounded-[48px] animate-slide-up relative z-10 border border-primary-500/10 shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center mb-12 text-center">
          <div className="flex items-center gap-3 mb-10 group cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary-500/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
              <Layers className="text-slate-950 w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-black tracking-tighter block leading-none text-white">DrawEngine</span>
              <span className="text-[10px] uppercase tracking-[0.4em] text-primary-400 font-bold">Azure Horizon</span>
            </div>
          </div>
          
          <h1 className="text-4xl font-extrabold text-white tracking-tighter mb-4 leading-none">
            Welcome Back<span className="text-primary-500">.</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium max-w-[300px] leading-relaxed">
            Enter your credentials to access your high-performance design workspace.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-200 px-5 py-4 rounded-2xl flex items-center gap-4 mb-8 animate-in slide-in-from-top-4 duration-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <p className="text-[13px] font-bold tracking-tight">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.3em] font-black text-slate-500 ml-1">
              Email ID
            </label>
            <input
              type="email"
              required
              className={`w-full glass-input ${fieldErrors.email ? 'border-rose-500/50' : ''}`}
              placeholder="email@horizon.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.email}</p>}
          </div>
          
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.3em] font-black text-slate-500 ml-1">
              Password
            </label>
            <input
              type="password"
              required
              className={`w-full glass-input ${fieldErrors.password ? 'border-rose-500/50' : ''}`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 hover:bg-primary-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-5 rounded-2xl shadow-2xl shadow-primary-500/20 transition-all hover:-translate-y-1 active:scale-95 mt-6 flex items-center justify-center gap-4 group"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></div>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span className="text-lg">Access Studio</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5 text-center">
          <p className="text-slate-500 text-sm font-bold">
            New to the engine?{' '}
            <Link to="/signup" className="text-primary-400 hover:text-primary-300 transition-all inline-flex items-center gap-2 group ml-1">
              Initialize Profile
              <UserPlus className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </p>
        </div>
      </div>
      
      {/* Branding Footer */}
      <div className="absolute bottom-10 text-slate-600 text-[9px] font-black uppercase tracking-[0.4em] opacity-40">
        &copy; 2026 DrawEngine Visual Labs &bull; Core System
      </div>
    </div>
  );
};

export default Login;
