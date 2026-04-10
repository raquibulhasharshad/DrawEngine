import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { 
  Plus, 
  Layout, 
  Trash2, 
  ExternalLink, 
  Clock, 
  LogOut, 
  User as UserIcon,
  Search,
  Layers,
  Sparkles,
  ChevronRight,
  X,
  Type,
  Box,
  Palette,
  ArrowRight,
  Settings,
  Shield,
  Key,
  AlertTriangle,
  Mail,
  UserCheck,
  CheckCircle2,
  Circle
} from 'lucide-react';

const Dashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState('profile'); // profile, password, delete
  const [editName, setEditName] = useState(user?.fullName || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [deleteForm, setDeleteForm] = useState({ email: '', password: '', confirmDelete: '' });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Multi-Select & Custom Modal State
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmModal, setConfirmModal] = useState({ 
    isOpen: false, 
    title: '', 
    message: '', 
    onConfirm: null, 
    type: 'danger' 
  });

  const navigate = useNavigate();

  useEffect(() => {
    fetchDesigns();
  }, []);

  const fetchDesigns = async () => {
    try {
      const response = await api.get('/designs');
      setDesigns(response.data);
    } catch (error) {
      console.error('Failed to fetch designs', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    if (!newDesignName.trim()) {
      setFieldErrors({ newDesign: 'Project identity label required' });
      return;
    }
    
    setIsCreating(true);
    try {
      const response = await api.post('/designs', {
        name: newDesignName,
        data: { objects: [] }
      });
      setIsModalOpen(false);
      navigate(`/editor/${response.data.id}`);
    } catch (error) {
      alert('Failed to create design');
    } finally {
      setIsCreating(false);
    }
  };

  const triggerConfirm = (title, message, onConfirm, type = 'danger') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, type });
  };

  const handleDelete = (e, id) => {
    if (e) e.stopPropagation();
    triggerConfirm(
      'Purge Design',
      'This will permanently erase this vector project from the Visual Registry.',
      async () => {
        try {
          await api.delete(`/designs/${id}`);
          setDesigns(prev => prev.filter(d => d.id !== id));
          setSelectedIds(prev => prev.filter(sid => sid !== id));
        } catch (error) {
          alert('Failed to delete design');
        }
      }
    );
  };

  const handleBulkDelete = () => {
    triggerConfirm(
      'Batch Purge',
      `Are you sure you want to permanently delete ${selectedIds.length} projects? This action is irreversible.`,
      async () => {
        try {
          await api.post('/designs/batch-delete', { ids: selectedIds });
          setDesigns(prev => prev.filter(d => !selectedIds.includes(d.id)));
          setSelectedIds([]);
        } catch (error) {
          alert('Bulk deletion failed');
        }
      }
    );
  };

  const toggleSelect = (e, id) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredDesigns.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDesigns.map(d => d.id));
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsError('');
    setFieldErrors({});

    if (!editName.trim()) {
      setFieldErrors({ fullName: 'Identity label cannot be empty' });
      setSettingsLoading(false);
      return;
    }

    try {
      const res = await api.post('/user/profile', { fullName: editName, email: editEmail });
      updateUser({ fullName: editName, email: editEmail });
      setSettingsSuccess('Profile synchronized successfully.');
      setTimeout(() => setSettingsSuccess(''), 3000);
    } catch (err) {
      setSettingsError(err.response?.data?.error || 'Update failed');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    
    let errors = {};
    if (!passForm.current) errors.current = 'Authentication required';
    if (!passForm.next || passForm.next.length < 8) errors.next = 'Security key must be at least 8 characters';
    if (passForm.next !== passForm.confirm) errors.confirm = 'Security keys do not match';
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSettingsLoading(true);
    setSettingsError('');
    try {
      await api.post('/user/password', { currentPassword: passForm.current, newPassword: passForm.next });
      setSettingsSuccess('Password rotated successfully.');
      setPassForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setSettingsSuccess(''), 3000);
    } catch (err) {
      const serverError = err.response?.data?.error || 'Rotation failed';
      if (serverError.toLowerCase().includes('current password')) {
        setFieldErrors({ current: serverError });
      } else {
        setSettingsError(serverError);
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    let errors = {};
    if (!deleteForm.email) errors.email = 'Registry email required';
    if (!deleteForm.password) errors.password = 'Verification key required';
    if (deleteForm.confirmDelete.toUpperCase() !== 'DELETE') errors.confirmDelete = 'Type DELETE to confirm protocol';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSettingsLoading(true);
    setSettingsError('');
    
    // Initial client-side verification
    if (deleteForm.email !== user.email) {
      setFieldErrors({ email: 'Email address does not match your active identity' });
      setSettingsLoading(false);
      return;
    }

    triggerConfirm(
      'Nuclear Purge',
      'Executing this protocol will permanently destroy your identity and all associated vector clusters. This action is irreversible.',
      async () => {
        try {
          await api.post('/user/delete', { email: deleteForm.email, password: deleteForm.password });
          logout();
          navigate('/login');
        } catch (err) {
          const serverError = err.response?.data?.error || 'Purge failed';
          if (serverError.toLowerCase().includes('email')) {
            setFieldErrors({ email: serverError });
          } else if (serverError.toLowerCase().includes('password') || serverError.toLowerCase().includes('key')) {
            setFieldErrors({ password: serverError });
          } else {
            setSettingsError(serverError);
          }
        } finally {
          setSettingsLoading(false);
        }
      }
    );
  };

  const filteredDesigns = designs.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden selection:bg-primary-500/30">
      {/* Dynamic Background */}
      <div className="bg-glow"></div>
      <div className="noise-overlay"></div>
      <div className="blob top-[-10%] left-[-10%] animate-pulse-slow"></div>
      <div className="blob bottom-[-10%] right-[-10%] opacity-40" style={{ animationDelay: '2s' }}></div>

      {/* Premium Navbar */}
      <nav className="sticky top-0 z-50 px-6 py-6 mx-auto max-w-7xl">
        <div className="glass-plus rounded-[24px] px-8 py-4 flex items-center justify-between border-primary-500/10 shadow-2xl">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary-500/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
              <Layers className="text-slate-950 w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-black tracking-tighter block leading-none text-white">DrawEngine</span>
              <span className="text-[10px] uppercase tracking-[0.4em] text-primary-400 font-bold">Azure Horizon</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden md:flex items-center gap-4 px-5 py-2 bg-primary-500/5 rounded-full border border-primary-500/10">
              <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse-cyan"></div>
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Operator: <span className="text-primary-400 ml-1">{user?.fullName || user?.email?.split('@')[0]}</span>
              </span>
            </div>
            <button 
              onClick={() => {
                setEditName(user?.fullName || '');
                setEditEmail(user?.email || '');
                setIsSettingsOpen(true);
              }}
              className="p-3 hover:bg-primary-500/10 text-slate-500 hover:text-primary-400 rounded-2xl transition-all group border border-transparent hover:border-primary-500/20"
              title="Identity Terminal"
            >
              <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
            </button>
            <button 
              onClick={logout}
              className="p-3 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-2xl transition-all group border border-transparent hover:border-rose-500/20"
              title="Terminate Session"
            >
              <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-12 pb-24 relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 mb-24">
          <div className="max-w-3xl animate-slide-up">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-primary-500/5 text-primary-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 border border-primary-500/20">
              <div className="w-1 h-1 rounded-full bg-primary-500 animate-ping"></div>
              Next-Gen Visual Laboratory
            </div>
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-white">
              Architecting <span className="text-primary-500 italic">Vision</span> <br />
              Into Reality.
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium max-w-xl leading-relaxed">
              Assemble complex vector designs with precision engineering and high-fidelity rendering.
            </p>
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="animate-slide-up stagger-1 group relative flex items-center justify-center gap-4 bg-primary-500 hover:bg-primary-400 text-slate-950 px-12 py-6 rounded-3xl font-black text-xl shadow-[0_20px_50px_rgba(6,182,212,0.3)] transition-all hover:-translate-y-2 active:scale-95"
          >
            <Plus className="w-7 h-7" />
            <span>Launch Design</span>
            <div className="w-10 h-10 rounded-2xl bg-black/10 flex items-center justify-center ml-2 group-hover:translate-x-1 transition-transform">
              <ArrowRight className="w-5 h-5" />
            </div>
          </button>
        </div>

        {/* Search Matrix */}
        <div className="max-w-3xl mb-20 animate-slide-up stagger-2">
          <div className="relative group">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary-400 w-6 h-6 transition-colors" />
            <input 
              type="text"
              placeholder="Search design registry..."
              className="w-full bg-primary-500/[0.02] border border-white/5 rounded-3xl pl-16 pr-8 py-6 outline-none focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/30 focus:bg-primary-500/[0.05] transition-all text-white text-xl font-bold placeholder:text-slate-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-96 bg-primary-500/5 rounded-[48px] animate-pulse-cyan border border-primary-500/10"></div>
            ))}
          </div>
        ) : filteredDesigns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {filteredDesigns.map((design, index) => (
              <div 
                key={design.id}
                onClick={() => selectedIds.length === 0 ? navigate(`/editor/${design.id}`) : toggleSelect(null, design.id)}
                className={`animate-slide-up group relative glass p-6 rounded-[48px] border-primary-500/5 hover:border-primary-500/30 bg-primary-500/[0.01] hover:bg-primary-500/[0.04] transition-all duration-700 cursor-pointer flex flex-col h-full stagger-${(index % 4) + 1} shadow-2xl ${
                  selectedIds.includes(design.id) ? 'border-primary-500/50 bg-primary-500/[0.08]' : ''
                }`}
              >
                {/* Selection Overlay */}
                <div 
                  className={`absolute top-8 left-8 z-20 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 border-2 ${
                    selectedIds.includes(design.id) 
                    ? 'bg-primary-500 border-primary-500 shadow-lg shadow-primary-500/20' 
                    : 'border-white/10 group-hover:border-primary-500/30'
                  }`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(e, design.id); }}
                >
                  {selectedIds.includes(design.id) ? (
                    <CheckCircle2 className="w-5 h-5 text-slate-950" />
                  ) : (
                    <Circle className="w-4 h-4 text-transparent group-hover:text-primary-500/20" />
                  )}
                </div>
                <div className="h-64 bg-slate-950 rounded-[36px] mb-8 flex items-center justify-center group-hover:scale-[1.02] transition-all duration-700 ease-out border border-white/5 overflow-hidden relative group-hover:shadow-[0_0_40px_rgba(6,182,212,0.1)]">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-transparent opacity-50"></div>
                  <Layout className="w-20 h-20 text-slate-800 group-hover:text-primary-500/40 transition-all duration-700" />
                  
                  <div className="absolute inset-0 bg-primary-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                    <div className="bg-primary-500 text-slate-950 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs scale-90 group-hover:scale-100 transition-all duration-500 shadow-2xl shadow-primary-500/40">
                      Open Project
                    </div>
                  </div>
                </div>
                
                <div className="px-4 pb-4 flex-grow flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <h3 className="text-3xl font-black text-white/95 tracking-tighter truncate group-hover:text-primary-400 transition-colors">
                      {design.name}
                    </h3>
                    <button 
                      onClick={(e) => handleDelete(e, design.id)}
                      className="p-3 text-slate-700 hover:text-rose-400 hover:bg-rose-400/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-500/20"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                         <Clock className="w-4 h-4 text-primary-400" />
                      </div>
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{new Date(design.updated_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-[10px] font-black text-primary-500/40 uppercase tracking-[0.3em]">SECURE_STORAGE</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 glass rounded-[64px] border border-primary-500/10 animate-slide-up stagger-3 bg-primary-500/[0.01]">
            <div className="w-32 h-32 bg-primary-500/10 rounded-[48px] flex items-center justify-center mx-auto mb-10 animate-float border border-primary-500/20">
              <Layers className="w-16 h-16 text-primary-500" />
            </div>
            <h3 className="text-4xl font-black text-white mb-4 tracking-tighter">Registry Empty</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-12 text-lg font-medium leading-relaxed">The design terminal is awaiting initialization instructions.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-12 py-5 bg-primary-500 hover:bg-primary-400 text-slate-950 rounded-3xl font-black text-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-4 mx-auto shadow-2xl shadow-primary-500/20"
            >
              <Plus className="w-6 h-6" />
              Begin Experiment
            </button>
          </div>
        )}
      </main>

      {/* Beautiful Azure Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div 
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl animate-in fade-in duration-500"
            onClick={() => setIsModalOpen(false)}
          ></div>
          <div className="relative w-full max-w-xl glass-plus rounded-[48px] p-12 border border-primary-500/20 shadow-[0_0_150px_rgba(6,182,212,0.15)] overflow-hidden animate-slide-up">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-shimmer"></div>
            
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-primary-500 rounded-[20px] flex items-center justify-center shadow-2xl shadow-primary-500/20">
                  <Sparkles className="w-7 h-7 text-slate-950" />
                </div>
                <div>
                  <h3 className="text-3xl font-black text-white tracking-tighter">New Project</h3>
                  <p className="text-[10px] text-primary-400 uppercase tracking-[0.4em] font-black">Initialize Vector Core</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-12 h-12 flex items-center justify-center hover:bg-primary-500/10 text-slate-500 hover:text-white rounded-2xl transition-all border border-transparent hover:border-primary-500/20"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Label Your Creation</label>
                  <div className="relative group">
                    <Type className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700 group-focus-within:text-primary-500 transition-colors" />
                    <input 
                      autoFocus
                      type="text"
                      className={`w-full glass-input pl-16 pr-8 py-6 font-bold text-xl placeholder:text-slate-800 ${fieldErrors.newDesign ? 'border-rose-500/50' : ''}`}
                      placeholder="Project Alpha..."
                      value={newDesignName}
                      onChange={(e) => setNewDesignName(e.target.value)}
                    />
                  </div>
                  {fieldErrors.newDesign && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.newDesign}</p>}
                </div>

                <div className="grid grid-cols-1">
                   <div className="p-8 rounded-3xl bg-primary-500/5 border border-primary-500/10 hover:border-primary-500/40 transition-all cursor-pointer group flex flex-col items-center text-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                        <Box className="w-8 h-8 text-primary-500" />
                      </div>
                      <div className="space-y-1">
                        <span className="block text-sm font-black text-slate-200 uppercase tracking-widest leading-none">Blank Slate</span>
                        <span className="block text-[8px] font-bold text-primary-500/50 uppercase tracking-[0.3em]">Pure Vector Core</span>
                      </div>
                   </div>
                </div>

                <button 
                  disabled={isCreating || !newDesignName.trim()}
                  className="w-full bg-primary-500 hover:bg-primary-400 disabled:bg-slate-900 disabled:text-slate-700 py-6 rounded-3xl font-black text-xl text-slate-950 transition-all shadow-2xl shadow-primary-500/20 active:scale-[0.98] flex items-center justify-center gap-4 group"
                >
                  {isCreating ? (
                    <div className="w-6 h-6 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>Initialize Studio</span>
                      <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-500" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Identity & Security Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div 
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl animate-in fade-in duration-500"
            onClick={() => setIsSettingsOpen(false)}
          ></div>
          <div className="relative w-full max-w-2xl glass-plus rounded-[48px] border border-white/10 shadow-[0_0_150px_rgba(6,182,212,0.1)] overflow-hidden animate-slide-up">
            <div className="flex flex-row h-[500px]">
              {/* Sidebar Tabs */}
              <div className="w-52 bg-white/[0.02] border-r border-white/5 p-8 flex flex-col gap-3">
                {[
                  { id: 'profile', icon: UserIcon, label: 'Identity' },
                  { id: 'password', icon: Shield, label: 'Security' },
                  { id: 'delete', icon: AlertTriangle, label: 'Danger Zone' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setSettingsView(tab.id); setSettingsError(''); setSettingsSuccess(''); }}
                    className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all text-sm font-bold ${
                      settingsView === tab.id 
                      ? 'bg-primary-500 text-slate-950 shadow-2xl shadow-primary-500/20' 
                      : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* View Content */}
              <div className="flex-1 p-10 relative overflow-y-auto scrollbar-hide">
                <div className="flex justify-between items-start mb-8">
                   <div>
                      <h3 className="text-2xl font-black text-white tracking-tighter">
                        {settingsView === 'profile' ? 'Vector Identity' : settingsView === 'password' ? 'Security Protocol' : 'Nuclear Purge'}
                      </h3>
                      <p className="text-[10px] text-primary-400 uppercase tracking-[0.3em] font-black mt-1">Management Terminal</p>
                   </div>
                   <button onClick={() => setIsSettingsOpen(false)} className="text-slate-600 hover:text-white"><X /></button>
                </div>

                {settingsError && <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-2xl animate-shake">{settingsError}</div>}
                {settingsSuccess && <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-2xl animate-bounce-subtle">{settingsSuccess}</div>}

                {settingsView === 'profile' && (
                  <form onSubmit={handleUpdateProfile} className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                        <div className="relative group">
                          <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 group-focus-within:text-primary-500" />
                          <input 
                            className={`w-full glass-input pl-14 pr-6 py-4 text-sm font-bold ${fieldErrors.fullName ? 'border-rose-500/50' : ''}`} 
                            value={editName} 
                            onChange={e => setEditName(e.target.value)} 
                          />
                       </div>
                       {fieldErrors.fullName && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.fullName}</p>}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex justify-between">
                         Email Address
                         <span className="text-primary-500/50 text-[8px]">Primary ID</span>
                       </label>
                       <div className="relative group opacity-60">
                          <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700" />
                          <input 
                            readOnly
                            className="w-full glass-input pl-14 pr-6 py-4 text-sm font-bold cursor-not-allowed selection:bg-transparent" 
                            value={editEmail} 
                          />
                       </div>
                    </div>
                    <button disabled={settingsLoading} className="w-full bg-primary-500 hover:bg-primary-400 text-slate-950 py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-primary-500/10 mt-4 active:scale-95">
                       {settingsLoading ? 'Syncing...' : 'Sync Identity'}
                    </button>
                  </form>
                )}

                {settingsView === 'password' && (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Current Password</label>
                       <input 
                          type="password"
                          className={`w-full glass-input px-6 py-4 text-sm font-bold ${fieldErrors.current ? 'border-rose-500/50' : ''}`} 
                          placeholder="••••••••"
                          value={passForm.current} 
                          onChange={e => setPassForm({...passForm, current: e.target.value})} 
                       />
                       {fieldErrors.current && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.current}</p>}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">New Password</label>
                       <input 
                          type="password"
                          className={`w-full glass-input px-6 py-4 text-sm font-bold ${fieldErrors.next ? 'border-rose-500/50' : ''}`} 
                          placeholder="Minimum 8 characters"
                          value={passForm.next} 
                          onChange={e => setPassForm({...passForm, next: e.target.value})} 
                       />
                       {fieldErrors.next && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.next}</p>}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirm New Password</label>
                       <input 
                          type="password"
                          className={`w-full glass-input px-6 py-4 text-sm font-bold ${fieldErrors.confirm ? 'border-rose-500/50' : ''}`} 
                          placeholder="Re-type password"
                          value={passForm.confirm} 
                          onChange={e => setPassForm({...passForm, confirm: e.target.value})} 
                       />
                       {fieldErrors.confirm && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.confirm}</p>}
                    </div>
                    <button disabled={settingsLoading} className="w-full bg-primary-500 hover:bg-primary-400 text-slate-950 py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-primary-500/10 mt-6 active:scale-95">
                       {settingsLoading ? 'Rotating...' : 'Rotate Security Key'}
                    </button>
                  </form>
                )}

                {settingsView === 'delete' && (
                  <form onSubmit={handleDeleteAccount} className="space-y-4">
                    <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl mb-6">
                       <div className="flex gap-3 text-rose-400">
                          <AlertTriangle className="w-5 h-5 shrink-0" />
                          <p className="text-[11px] font-bold leading-relaxed">
                            PURGE WARNING: This action clones the account deletion protocol. All projects, clusters, and vector data will be permanently wiped from the Visual Registry. This cannot be undone.
                          </p>
                       </div>
                    </div>
                    <div className="space-y-2">
                       <input 
                          type="email"
                          placeholder="Verify Email"
                          className={`w-full glass-input px-6 py-4 text-sm font-bold ${fieldErrors.email ? 'border-rose-500/50' : ''}`} 
                          value={deleteForm.email} 
                          onChange={e => setDeleteForm({...deleteForm, email: e.target.value})} 
                       />
                       {fieldErrors.email && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.email}</p>}
                    </div>
                    <div className="space-y-2">
                       <input 
                          type="password"
                          placeholder="Verify Password"
                          className={`w-full glass-input px-6 py-4 text-sm font-bold ${fieldErrors.password ? 'border-rose-500/50' : ''}`} 
                          value={deleteForm.password} 
                          onChange={e => setDeleteForm({...deleteForm, password: e.target.value})} 
                       />
                       {fieldErrors.password && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.password}</p>}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-rose-500 uppercase tracking-widest ml-1">Type "DELETE" to confirm terminal purge</label>
                       <input 
                          type="text"
                          className={`w-full glass-input px-6 py-4 text-sm font-black text-rose-500 border-rose-500/20 ${fieldErrors.confirmDelete ? 'border-rose-500/50' : ''}`} 
                          value={deleteForm.confirmDelete} 
                          onChange={e => setDeleteForm({...deleteForm, confirmDelete: e.target.value})} 
                       />
                       {fieldErrors.confirmDelete && <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest ml-1 animate-in fade-in slide-in-from-top-1">{fieldErrors.confirmDelete}</p>}
                    </div>
                    <button disabled={settingsLoading} className="w-full bg-rose-500 hover:bg-rose-400 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-rose-500/20 mt-4 active:scale-95">
                       {settingsLoading ? 'Purging...' : 'Execute Account Deletion'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="max-w-7xl mx-auto px-10 py-16 border-t border-white/5 mt-32 flex flex-col md:flex-row items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">
          &copy; 2026 DrawEngine Visual Labs &bull; Azure Horizon Core
        </div>
        <div className="flex items-center gap-12 mt-8 md:mt-0">
          {['Identity', 'Security', 'Telemetry'].map(link => (
            <a key={link} href="#" className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-700 hover:text-primary-500 transition-colors">
              {link}
            </a>
          ))}
        </div>
      </footer>

      {/* Floating Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[90] w-full max-w-2xl px-6 animate-slide-up">
           <div className="glass-plus bg-slate-950/80 rounded-[32px] p-4 border border-primary-500/30 flex items-center justify-between shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-6 pl-4">
                 <div className="flex flex-col">
                    <span className="text-xl font-black text-white leading-none">{selectedIds.length} <span className="text-primary-500">Selected</span></span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Vector Collection</span>
                 </div>
                 <div className="h-8 w-px bg-white/10"></div>
                 <button 
                  onClick={selectAll}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                >
                  {selectedIds.length === filteredDesigns.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                 <button 
                  onClick={() => setSelectedIds([])}
                  className="px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                 >
                   Cancel
                 </button>
                 <button 
                  onClick={handleBulkDelete}
                  className="px-8 py-4 bg-rose-500 hover:bg-rose-400 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-rose-500/20 active:scale-95 flex items-center gap-3"
                 >
                   <Trash2 className="w-4 h-4" />
                   Purge Collection
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Custom Confirmation HUD */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"></div>
          <div className="relative w-full max-w-md glass-plus rounded-[40px] p-10 border border-white/10 shadow-2xl animate-scale-up">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 ${confirmModal.type === 'danger' ? 'bg-rose-500/10 text-rose-500' : 'bg-primary-500/10 text-primary-500'}`}>
               <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-3xl font-black text-white tracking-tighter mb-4">{confirmModal.title}</h3>
            <p className="text-slate-400 font-medium leading-relaxed mb-10">{confirmModal.message}</p>
            <div className="flex gap-4">
               <button 
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="flex-1 py-5 rounded-2xl font-black text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
               >
                 Abort
               </button>
               <button 
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className={`flex-1 py-5 rounded-2xl font-black text-sm text-white transition-all shadow-xl active:scale-95 ${confirmModal.type === 'danger' ? 'bg-rose-500 hover:bg-rose-400 shadow-rose-500/20' : 'bg-primary-500 hover:bg-primary-400 shadow-primary-500/20'}`}
               >
                 Confirm
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
