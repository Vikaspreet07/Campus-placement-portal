/* ═══════════════════════════════════════════════════════════
   PlaceMe – Campus Placement Portal
   app.js — Supabase Auth + CRUD + Role-based UI
═══════════════════════════════════════════════════════════ */

// ─── Supabase Init ───────────────────────────────────────────
const SUPABASE_URL = 'https://pjnvkrletmiyaqxmvpqt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CO5j870Kh_2w2Pc54QNgTQ_PQxxPfOx';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── App State ───────────────────────────────────────────────
let currentUser   = null;
let currentProfile= null;
let currentPage   = 'home';
let allJobs       = [];
let allCompanies  = [];
let allNotices    = [];
let selectedJobId = null;
let applyJobId    = null;
let charts        = {};

// ─── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // hide loading screen after a brief delay
  await new Promise(r => setTimeout(r, 1800));
  document.getElementById('loading-screen').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('loading-screen').style.display = 'none';
  }, 400);

  // animate hero stats counter
  animateCounters();

  // check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);

  // listen for auth changes
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN'  && session) await onLogin(session.user);
    if (event === 'SIGNED_OUT') onLogout();
  });

  // load public data
  loadJobs();
  loadCompanies();
  loadNotices();
  loadStats();

  // close menus on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('user-menu');
    const btn  = document.getElementById('user-avatar-btn');
    if (menu && !menu.classList.contains('hidden') && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
});

// ─── Auth Helpers ─────────────────────────────────────────────
function openAuth(tab = 'login') {
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.remove('hidden');
  switchAuthTab(tab);
}

function closeAuth() {
  document.getElementById('auth-overlay').classList.add('hidden');
}

function switchAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  clearFormErrors();
}

function toggleRegisterFields() {
  const role = document.getElementById('reg-role').value;
  document.getElementById('student-extra-fields').style.display = role === 'student' ? 'flex' : 'none';
  document.getElementById('student-extra-fields').style.flexDirection = 'column';
  document.getElementById('company-extra-fields').classList.toggle('hidden', role !== 'company');
}

function togglePassword(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function clearFormErrors() {
  ['login-error','register-error','register-success','post-job-error','post-job-success','apply-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
  });
}

function showError(id, msg)   { const el = document.getElementById(id); if(el){ el.textContent = msg; el.classList.remove('hidden'); } }
function showSuccess(id, msg) { const el = document.getElementById(id); if(el){ el.textContent = msg; el.classList.remove('hidden'); } }
function setBtnLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.querySelector('span').style.display = loading ? 'none' : 'inline';
  btn.querySelector('.btn-loader').classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

// ─── Register ─────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  clearFormErrors();
  const role      = document.getElementById('reg-role').value;
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  const firstName = document.getElementById('reg-firstname').value.trim();
  const lastName  = document.getElementById('reg-lastname').value.trim();

  if (!role) { showError('register-error', 'Please select a role.'); return; }
  setBtnLoading('register-btn', true);

  const meta = {
    first_name: firstName, last_name: lastName, role,
    ...(role === 'student' ? {
      roll_number: document.getElementById('reg-roll').value.trim(),
      branch: document.getElementById('reg-branch').value,
      graduation_year: document.getElementById('reg-year').value,
    } : {}),
    ...(role === 'company' ? {
      company_name: document.getElementById('reg-company').value.trim(),
      designation: document.getElementById('reg-designation').value.trim(),
    } : {}),
  };

  const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta } });
  setBtnLoading('register-btn', false);

  if (error) { showError('register-error', error.message); return; }

  // Upsert into profiles table
  if (data.user) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      ...meta,
    });
  }

  showSuccess('register-success', '✅ Account created! Please verify your email and then sign in.');
  setTimeout(() => switchAuthTab('login'), 2000);
}

// ─── Login ────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearFormErrors();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  setBtnLoading('login-btn', true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  setBtnLoading('login-btn', false);

  if (error) { showError('login-error', error.message); return; }
  closeAuth();
  toast('Welcome back! 🎉', 'success');
}

// ─── Google Auth ──────────────────────────────────────────────
async function handleGoogleAuth() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}

// ─── Logout ───────────────────────────────────────────────────
async function handleLogout() {
  await sb.auth.signOut();
  toast('Signed out successfully.', 'info');
}

async function showForgotPassword() {
  const email = prompt('Enter your email address:');
  if (!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) toast(error.message, 'error');
  else toast('Password reset email sent! Check your inbox.', 'success');
}

// ─── Session Callbacks ────────────────────────────────────────
async function onLogin(user) {
  currentUser = user;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile || { role: user.user_metadata?.role || 'student', first_name: user.user_metadata?.first_name || 'User' };

  // Ensure profile exists
  if (!profile) {
    const meta = user.user_metadata || {};
    await sb.from('profiles').upsert({
      id: user.id,
      email: user.email,
      first_name: meta.first_name || '',
      last_name: meta.last_name || '',
      role: meta.role || 'student',
    });
    currentProfile = { ...meta, role: meta.role || 'student' };
  }

  updateNavForUser();
  document.getElementById('auth-overlay').classList.add('hidden');
}

function onLogout() {
  currentUser    = null;
  currentProfile = null;
  updateNavForGuest();
  showPage('home');
}

// ─── Nav Updates ──────────────────────────────────────────────
function updateNavForUser() {
  document.getElementById('guest-nav').classList.add('hidden');
  document.getElementById('user-nav').classList.remove('hidden');

  const name = currentProfile?.first_name || currentUser?.email?.split('@')[0] || 'User';
  document.getElementById('nav-username').textContent = name;
  document.getElementById('nav-avatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('dash-name').textContent = name;

  const role = currentProfile?.role;
  document.getElementById('admin-menu-link').classList.toggle('hidden', role !== 'admin');
  document.getElementById('post-job-menu-link').classList.toggle('hidden', role !== 'company');
}

function updateNavForGuest() {
  document.getElementById('guest-nav').classList.remove('hidden');
  document.getElementById('user-nav').classList.add('hidden');
}

function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('hidden');
}

function toggleMobileMenu() {
  document.getElementById('nav-links').classList.toggle('mobile-open');
}

// ─── Page Navigation ──────────────────────────────────────────
function showPage(name) {
  // hide all pages
  document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
  const page = document.getElementById(`page-${name}`);
  if (!page) return;
  page.classList.remove('hidden');
  page.classList.add('active');
  currentPage = name;

  // update nav active
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navLink = document.getElementById(`nav-${name}`);
  if (navLink) navLink.classList.add('active');

  // close mobile menu
  document.getElementById('nav-links').classList.remove('mobile-open');
  document.getElementById('user-menu').classList.add('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // page-specific init
  switch (name) {
    case 'dashboard': loadDashboard(); break;
    case 'profile':   loadProfile(); break;
    case 'admin':     if (currentProfile?.role === 'admin') loadAdminPanel(); break;
    case 'stats':     renderCharts(); break;
    case 'jobs':      renderJobs(); break;
    case 'companies': renderCompanies(); break;
    case 'notices':   renderNotices(); break;
  }
}

// ─── Toast Notification ───────────────────────────────────────
function toast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; setTimeout(() => el.remove(), 300); }, duration);
}

// ─── Counter Animation ────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = +el.dataset.target;
    let count = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      count = Math.min(count + step, target);
      el.textContent = Math.floor(count).toLocaleString();
      if (count >= target) clearInterval(timer);
    }, 20);
  });
}

// ═══════════════════════════════════════════════════════════════
//  SUPABASE DATA LAYER
// ═══════════════════════════════════════════════════════════════

// ─── JOBS ─────────────────────────────────────────────────────
async function loadJobs() {
  const { data, error } = await sb.from('jobs')
    .select('*, companies(name, logo_url, industry)')
    .order('created_at', { ascending: false });

  if (error) { console.warn('Jobs load error:', error.message); allJobs = getSampleJobs(); }
  else allJobs = data?.length ? data : getSampleJobs();

  renderJobs();
}

function getSampleJobs() {
  const now = new Date();
  const future = d => { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0]; };
  return [
    { id: 'j1', title: 'Software Development Engineer', company_id: 'c1', companies: { name: 'Google', logo_url: 'https://logo.clearbit.com/google.com', industry: 'Technology' }, job_type: 'Full-time', ctc: 28, location: 'Bangalore', description: 'Join Google\'s core engineering team to build products used by billions. You will work on challenging technical problems and collaborate with world-class engineers across Google\'s infrastructure, search, and cloud platforms.', skills: ['Data Structures', 'Algorithms', 'System Design', 'Python/Java'], min_cgpa: 7.5, deadline: future(20), eligible_branches: ['CSE','IT','ECE'], status: 'open', interview_process: 'Online Assessment → Technical Interview 1 → Technical Interview 2 → Hiring Committee → Offer', created_at: now.toISOString() },
    { id: 'j2', title: 'Software Engineer', company_id: 'c2', companies: { name: 'Microsoft', logo_url: 'https://logo.clearbit.com/microsoft.com', industry: 'Technology' }, job_type: 'Full-time', ctc: 25, location: 'Hyderabad', description: 'Microsoft is looking for passionate engineers to build next-generation cloud and AI products. You will be part of Azure, Office, or Teams teams, developing scalable software for millions of enterprise customers.', skills: ['C++/C#', 'Cloud', 'Problem Solving', 'System Design'], min_cgpa: 7.0, deadline: future(15), eligible_branches: ['CSE','ECE','IT','EE'], status: 'open', interview_process: 'Coding Test → 3 Technical Rounds → HR Round', created_at: new Date(now - 86400000).toISOString() },
    { id: 'j3', title: 'SDE-1', company_id: 'c3', companies: { name: 'Amazon', logo_url: 'https://logo.clearbit.com/amazon.com', industry: 'Technology' }, job_type: 'Full-time', ctc: 22, location: 'Bangalore / Chennai', description: 'Amazon is hiring SDE-1 engineers for multiple teams including Retail, AWS, Alexa, and Logistics. You will own features end-to-end and contribute to systems that handle millions of requests per second.', skills: ['Java', 'OOP', 'Distributed Systems', 'LLD/HLD'], min_cgpa: 7.0, deadline: future(10), eligible_branches: ['CSE','IT','ECE','ME','EE'], status: 'open', interview_process: 'Online Assessment → 2 Technical Interviews → Bar Raiser → HR', created_at: new Date(now - 2*86400000).toISOString() },
    { id: 'j4', title: 'Data Analyst Intern', company_id: 'c4', companies: { name: 'Goldman Sachs', logo_url: 'https://logo.clearbit.com/goldmansachs.com', industry: 'Finance' }, job_type: 'Internship', ctc: 2.5, location: 'Mumbai', description: 'Summer internship program in the Quantitative Strategies division. Work on real financial data, build analytical models, and present findings to senior management.', skills: ['Python', 'Statistics', 'SQL', 'Excel', 'Data Visualization'], min_cgpa: 8.0, deadline: future(25), eligible_branches: ['CSE','IT','ECE','CE'], status: 'open', interview_process: 'Aptitude Test → 2 Technical Rounds → HR Interview', created_at: new Date(now - 3*86400000).toISOString() },
    { id: 'j5', title: 'Systems Engineer', company_id: 'c5', companies: { name: 'Infosys', logo_url: 'https://logo.clearbit.com/infosys.com', industry: 'Technology' }, job_type: 'Full-time', ctc: 4.5, location: 'Pan India', description: 'Join Infosys as a Systems Engineer and work across diverse technology domains including digital transformation, AI/ML, and enterprise solutions for global clients.', skills: ['Programming Basics', 'Communication', 'Problem Solving'], min_cgpa: 6.5, deadline: future(30), eligible_branches: ['CSE','ECE','ME','CE','EE','IT'], status: 'open', interview_process: 'Online Test (Aptitude + Coding) → Technical Interview → HR', created_at: new Date(now - 4*86400000).toISOString() },
    { id: 'j6', title: 'Product Manager – Intern', company_id: 'c6', companies: { name: 'Adobe', logo_url: 'https://logo.clearbit.com/adobe.com', industry: 'Technology' }, job_type: 'PPO', ctc: 3, location: 'Noida', description: 'Adobe\'s APM Internship is a premier program for future product leaders. You will work on defining product strategy, collaborating with design and engineering, and shipping features to Adobe\'s creative suite products.', skills: ['Product Thinking', 'User Research', 'Data Analysis', 'Wireframing'], min_cgpa: 8.0, deadline: future(8), eligible_branches: ['CSE','IT','ME'], status: 'open', interview_process: 'Resume Screen → Case Study → 2 Rounds → Offer', created_at: new Date(now - 5*86400000).toISOString() },
    { id: 'j7', title: 'Mechanical Design Engineer', company_id: 'c7', companies: { name: 'Tata Motors', logo_url: 'https://logo.clearbit.com/tatamotors.com', industry: 'Manufacturing' }, job_type: 'Full-time', ctc: 7, location: 'Pune', description: 'Design and develop automotive components for the next generation of electric vehicles. Work with CAD/CAM tools, prototype testing, and manufacturing processes.', skills: ['AutoCAD', 'SolidWorks', 'CATIA', 'FEA', 'GD&T'], min_cgpa: 6.5, deadline: future(18), eligible_branches: ['ME','CE'], status: 'open', interview_process: 'Technical Test → 2 Technical Interviews → HR', created_at: new Date(now - 6*86400000).toISOString() },
    { id: 'j8', title: 'Cybersecurity Analyst', company_id: 'c8', companies: { name: 'Deloitte', logo_url: 'https://logo.clearbit.com/deloitte.com', industry: 'Consulting' }, job_type: 'Full-time', ctc: 12, location: 'Gurgaon / Bangalore', description: 'Join Deloitte\'s cyber risk practice to help Fortune 500 clients protect their digital assets. Responsibilities include penetration testing, security audits, and risk assessments.', skills: ['Network Security', 'SIEM', 'Ethical Hacking', 'CISSP/CEH'], min_cgpa: 7.0, deadline: future(12), eligible_branches: ['CSE','IT','ECE'], status: 'open', interview_process: 'Aptitude → Group Discussion → Technical Interview → Partner Round', created_at: new Date(now - 7*86400000).toISOString() },
  ];
}

function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!list) return;
  const filtered = getFilteredJobs();
  document.getElementById('jobs-count').textContent = `${filtered.length} job${filtered.length !== 1 ? 's' : ''} found`;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div style="font-size:3rem">🔍</div><h3>No jobs found</h3><p>Try adjusting your filters</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(job => jobCard(job)).join('');
}

function jobCard(job) {
  const co = job.companies || {};
  const logoHTML = co.logo_url
    ? `<img class="job-company-logo" src="${co.logo_url}" alt="${co.name}" onerror="this.outerHTML='<div class=\\'job-company-logo-placeholder\\'>${(co.name||'?').charAt(0)}</div>'" />`
    : `<div class="job-company-logo-placeholder">${(co.name||'?').charAt(0)}</div>`;

  const deadline = job.deadline ? new Date(job.deadline).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'TBD';
  const ctc = job.ctc ? (job.job_type === 'Internship' ? `₹${job.ctc}L/mo stipend` : `₹${job.ctc} LPA`) : 'As per norms';
  const branches = Array.isArray(job.eligible_branches) ? job.eligible_branches.join(', ') : (job.eligible_branches || 'All');

  return `
  <div class="job-card" onclick="showJobDetail('${job.id}')">
    <div class="job-card-header">
      ${logoHTML}
      <div class="job-title-block">
        <div class="job-title">${job.title}</div>
        <div class="job-company">${co.name || 'Company'}</div>
      </div>
      <div class="job-badges">
        <span class="badge badge-type">${job.job_type || 'Full-time'}</span>
        <span class="badge badge-${job.status === 'open' ? 'open' : 'closed'}">${job.status === 'open' ? '🟢 Open' : '🔴 Closed'}</span>
      </div>
    </div>
    <div class="job-card-body">
      <div class="job-meta">
        <span class="job-meta-item">📍 ${job.location || 'India'}</span>
        <span class="job-meta-item">🎓 Min. CGPA: ${job.min_cgpa || 'Any'}</span>
        <span class="job-meta-item">🏛 ${branches}</span>
      </div>
    </div>
    <div class="job-card-footer">
      <div class="job-package">${ctc}</div>
      <div class="job-deadline">⏰ ${deadline}</div>
    </div>
  </div>`;
}

function getFilteredJobs() {
  let jobs = [...allJobs];
  const search  = document.getElementById('job-search')?.value.toLowerCase() || '';
  const type    = document.getElementById('filter-type')?.value || '';
  const branch  = document.getElementById('filter-branch')?.value || '';
  const cgpa    = parseFloat(document.getElementById('filter-cgpa')?.value) || 0;
  const status  = document.getElementById('filter-status')?.value || '';
  const sort    = document.getElementById('jobs-sort')?.value || 'newest';

  if (search) jobs = jobs.filter(j => j.title?.toLowerCase().includes(search) || j.companies?.name?.toLowerCase().includes(search));
  if (type)   jobs = jobs.filter(j => j.job_type === type);
  if (branch) jobs = jobs.filter(j => !j.eligible_branches || j.eligible_branches.includes(branch) || j.eligible_branches === 'All');
  if (cgpa)   jobs = jobs.filter(j => !j.min_cgpa || j.min_cgpa <= cgpa);
  if (status) jobs = jobs.filter(j => j.status === status);

  if (sort === 'package') jobs.sort((a,b) => (b.ctc||0) - (a.ctc||0));
  else if (sort === 'deadline') jobs.sort((a,b) => new Date(a.deadline||'9999') - new Date(b.deadline||'9999'));
  else jobs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  return jobs;
}

function filterJobs() { renderJobs(); }
function clearJobFilters() {
  ['job-search','filter-type','filter-branch','filter-cgpa','filter-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  filterJobs();
}

// ─── JOB DETAIL ───────────────────────────────────────────────
async function showJobDetail(jobId) {
  selectedJobId = jobId;
  const job = allJobs.find(j => j.id == jobId);
  if (!job) return;
  const co = job.companies || {};
  const logoHTML = co.logo_url
    ? `<img style="width:64px;height:64px;border-radius:12px;background:white;padding:6px;object-fit:contain" src="${co.logo_url}" alt="${co.name}" onerror="this.outerHTML='<div style=\\'width:64px;height:64px;border-radius:12px;background:var(--gradient);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:900;color:white;\\'>${(co.name||'?').charAt(0)}</div>'" />`
    : `<div style="width:64px;height:64px;border-radius:12px;background:var(--gradient);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:900;color:white;">${(co.name||'?').charAt(0)}</div>`;

  const ctc = job.ctc ? (job.job_type === 'Internship' ? `₹${job.ctc}L/month` : `₹${job.ctc} LPA`) : 'As per norms';
  const deadline = job.deadline ? new Date(job.deadline).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }) : 'TBD';
  const branches = Array.isArray(job.eligible_branches) ? job.eligible_branches.join(', ') : (job.eligible_branches || 'All Branches');
  const skills = Array.isArray(job.skills) ? job.skills : (job.skills ? job.skills.split(',') : []);

  // Check if already applied
  let alreadyApplied = false;
  if (currentUser) {
    const { data } = await sb.from('applications').select('id').eq('job_id', jobId).eq('student_id', currentUser.id).single();
    alreadyApplied = !!data;
  }

  const applyBtn = currentUser
    ? (alreadyApplied
        ? `<button class="btn-ghost btn-full" disabled>✅ Already Applied</button>`
        : (currentProfile?.role === 'student'
            ? `<button class="btn-primary btn-full btn-lg" onclick="openApplyModal('${job.id}','${job.title}','${co.name}')">Apply Now →</button>`
            : `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center">Only students can apply</p>`))
    : `<button class="btn-primary btn-full btn-lg" onclick="openAuth('login')">Sign In to Apply</button>`;

  document.getElementById('job-detail-content').innerHTML = `
    <div class="job-detail-main">
      <div class="job-detail-header">
        <div style="display:flex;gap:1.25rem;align-items:flex-start;flex-wrap:wrap">
          ${logoHTML}
          <div style="flex:1">
            <h1 style="font-size:1.8rem;font-weight:800;margin-bottom:0.25rem">${job.title}</h1>
            <div style="color:var(--text-secondary);font-size:1rem;margin-bottom:0.75rem">${co.name || 'Company'} • ${co.industry || ''}</div>
            <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
              <span class="badge badge-type">${job.job_type}</span>
              <span class="badge badge-${job.status === 'open' ? 'open':'closed'}">${job.status === 'open' ? '🟢 Open':'🔴 Closed'}</span>
              <span class="badge" style="background:rgba(245,158,11,0.1);color:var(--orange)">⏰ ${deadline}</span>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-top:1.5rem">
          <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:1rem;text-align:center">
            <div style="font-size:1.5rem;font-weight:800;color:var(--green)">${ctc}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Package / Stipend</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center">
            <div style="font-size:1.2rem;font-weight:700">${job.location || 'Pan India'}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">📍 Location</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center">
            <div style="font-size:1.2rem;font-weight:700">${job.min_cgpa || 'Any'}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">🎓 Min CGPA</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center">
            <div style="font-size:1rem;font-weight:700">${branches}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">🏛 Eligible</div>
          </div>
        </div>
      </div>
      <div class="job-detail-body">
        <div class="job-detail-section">
          <h3>Job Description</h3>
          <p>${(job.description || '').replace(/\n/g,'<br/>')}</p>
        </div>
        ${skills.length ? `
        <div class="job-detail-section">
          <h3>Required Skills</h3>
          <div class="skills-tag-list">${skills.map(s => `<span class="skill-tag">${s.trim()}</span>`).join('')}</div>
        </div>` : ''}
        ${job.interview_process ? `
        <div class="job-detail-section">
          <h3>Interview Process</h3>
          <p>${job.interview_process}</p>
        </div>` : ''}
      </div>
    </div>
    <div class="job-detail-sidebar">
      <div class="job-detail-apply-card">
        <h3 style="margin-bottom:1rem;font-size:1.1rem">Apply for this Job</h3>
        ${applyBtn}
        <div style="margin-top:1.25rem;border-top:1px solid var(--border);padding-top:1.25rem">
          <div style="display:flex;flex-direction:column;gap:0.6rem">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem">
              <span style="color:var(--text-muted)">Deadline</span><span style="font-weight:600">${deadline}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem">
              <span style="color:var(--text-muted)">Job Type</span><span style="font-weight:600">${job.job_type}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem">
              <span style="color:var(--text-muted)">Location</span><span style="font-weight:600">${job.location || 'Pan India'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  showPage('job-detail');
}

// ─── APPLY MODAL ──────────────────────────────────────────────
function openApplyModal(jobId, jobTitle, companyName) {
  if (!currentUser) { openAuth('login'); return; }
  applyJobId = jobId;
  document.getElementById('apply-job-title').textContent = jobTitle;
  document.getElementById('apply-company-name').textContent = companyName;
  document.getElementById('apply-overlay').classList.remove('hidden');
  document.getElementById('apply-error').classList.add('hidden');
}

function closeApplyModal() {
  document.getElementById('apply-overlay').classList.add('hidden');
  applyJobId = null;
}

async function handleApply(e) {
  e.preventDefault();
  if (!currentUser || !applyJobId) return;
  setBtnLoading('apply-btn', true);

  const { error } = await sb.from('applications').insert({
    job_id: applyJobId,
    student_id: currentUser.id,
    cover_letter: document.getElementById('apply-cover').value.trim(),
    resume_link: document.getElementById('apply-resume').value.trim(),
    status: 'pending',
  });

  setBtnLoading('apply-btn', false);
  if (error) { showError('apply-error', error.message || 'Failed to apply. You may have already applied.'); return; }

  closeApplyModal();
  toast('Application submitted successfully! 🎉', 'success');
  showJobDetail(applyJobId); // refresh to show "already applied"
}

// ─── COMPANIES ────────────────────────────────────────────────
async function loadCompanies() {
  const { data, error } = await sb.from('companies').select('*').order('name');
  if (error || !data?.length) allCompanies = getSampleCompanies();
  else allCompanies = data;
  renderCompanies();
}

function getSampleCompanies() {
  return [
    { id:'c1', name:'Google', logo_url:'https://logo.clearbit.com/google.com', industry:'Technology', description:'Alphabet subsidiary specializing in internet services and AI.', total_offers:45, avg_ctc:28, highest_ctc:45 },
    { id:'c2', name:'Microsoft', logo_url:'https://logo.clearbit.com/microsoft.com', industry:'Technology', description:'Leading cloud and productivity solutions company.', total_offers:38, avg_ctc:25, highest_ctc:38 },
    { id:'c3', name:'Amazon', logo_url:'https://logo.clearbit.com/amazon.com', industry:'Technology', description:'E-commerce and cloud computing giant.', total_offers:52, avg_ctc:22, highest_ctc:35 },
    { id:'c4', name:'Goldman Sachs', logo_url:'https://logo.clearbit.com/goldmansachs.com', industry:'Finance', description:'Global investment banking and securities firm.', total_offers:18, avg_ctc:18, highest_ctc:28 },
    { id:'c5', name:'Infosys', logo_url:'https://logo.clearbit.com/infosys.com', industry:'Technology', description:'Global IT services and consulting company.', total_offers:120, avg_ctc:4.5, highest_ctc:8 },
    { id:'c6', name:'Adobe', logo_url:'https://logo.clearbit.com/adobe.com', industry:'Technology', description:'Creative software and digital experience solutions.', total_offers:22, avg_ctc:20, highest_ctc:30 },
    { id:'c7', name:'Tata Motors', logo_url:'https://logo.clearbit.com/tatamotors.com', industry:'Manufacturing', description:'Leading automotive company with electric vehicle focus.', total_offers:35, avg_ctc:7, highest_ctc:12 },
    { id:'c8', name:'Deloitte', logo_url:'https://logo.clearbit.com/deloitte.com', industry:'Consulting', description:'Global professional services and consulting network.', total_offers:60, avg_ctc:12, highest_ctc:18 },
    { id:'c9', name:'Meta', logo_url:'https://logo.clearbit.com/meta.com', industry:'Technology', description:'Social media and virtual reality technology company.', total_offers:28, avg_ctc:35, highest_ctc:52 },
    { id:'c10', name:'Oracle', logo_url:'https://logo.clearbit.com/oracle.com', industry:'Technology', description:'Enterprise software and cloud infrastructure provider.', total_offers:32, avg_ctc:14, highest_ctc:22 },
    { id:'c11', name:'TCS', logo_url:'https://logo.clearbit.com/tcs.com', industry:'Technology', description:'Tata Consultancy Services — IT services leader.', total_offers:200, avg_ctc:4, highest_ctc:7 },
    { id:'c12', name:'Wipro', logo_url:'https://logo.clearbit.com/wipro.com', industry:'Technology', description:'Global IT, consulting and business process services.', total_offers:90, avg_ctc:4.5, highest_ctc:8 },
  ];
}

function renderCompanies() {
  const grid = document.getElementById('companies-grid');
  if (!grid) return;
  const search   = document.getElementById('company-search')?.value.toLowerCase() || '';
  const industry = document.getElementById('company-industry')?.value || '';

  let companies = [...allCompanies];
  if (search)   companies = companies.filter(c => c.name?.toLowerCase().includes(search));
  if (industry) companies = companies.filter(c => c.industry === industry);

  grid.innerHTML = companies.map(c => companyCard(c)).join('');
}

function companyCard(c) {
  const logoHTML = c.logo_url
    ? `<img class="company-card-logo" src="${c.logo_url}" alt="${c.name}" onerror="this.outerHTML='<div class=\\'company-card-logo-ph\\'>${c.name.charAt(0)}</div>'" />`
    : `<div class="company-card-logo-ph">${c.name.charAt(0)}</div>`;

  return `
  <div class="company-card">
    ${logoHTML}
    <h3>${c.name}</h3>
    <div class="company-card-industry">${c.industry || 'Technology'}</div>
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;line-height:1.5">${(c.description||'').substring(0,80)}...</p>
    <div class="company-card-stats">
      <div class="company-stat"><div class="company-stat-num" style="color:var(--green)">${c.total_offers||0}</div><div class="company-stat-label">Offers</div></div>
      <div class="company-stat"><div class="company-stat-num">₹${c.avg_ctc||0}L</div><div class="company-stat-label">Avg CTC</div></div>
      <div class="company-stat"><div class="company-stat-num" style="color:var(--purple-light)">₹${c.highest_ctc||0}L</div><div class="company-stat-label">Highest</div></div>
    </div>
  </div>`;
}

function filterCompanies() { renderCompanies(); }

// ─── NOTICES ──────────────────────────────────────────────────
async function loadNotices() {
  const { data, error } = await sb.from('notices')
    .select('*, profiles(first_name, last_name)')
    .order('created_at', { ascending: false });

  if (error || !data?.length) allNotices = getSampleNotices();
  else allNotices = data;
  renderNotices();
}

function getSampleNotices() {
  const now = new Date();
  const ago = d => { const dt = new Date(now); dt.setDate(dt.getDate() - d); return dt.toISOString(); };
  return [
    { id:'n1', title:'🚨 Last Date to Register: Google Pre-Placement Talk', category:'urgent', content:'All students from CSE, IT, and ECE branches must register for the Google PPT by 18th October 2025. Failure to register will result in disqualification from Google campus hiring drive.', created_at: ago(0), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n2', title:'Microsoft Campus Drive – Date Announced', category:'drive', content:'Microsoft will be conducting its annual campus placement drive on 25th November 2025. Eligible branches: CSE, ECE, IT, EE. Minimum CGPA: 7.0. The drive includes an online assessment followed by 3 technical interview rounds and an HR round.', created_at: ago(1), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n3', title:'🏆 Amazon Placement Results Declared', category:'result', content:'Congratulations to 12 students who have been selected by Amazon in the recent campus drive! Offer letters will be shared via email by 30th October 2025. Selected students must complete pre-joining formalities on the Amazon portal.', created_at: ago(2), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n4', title:'Resume Submission Deadline Extended', category:'general', content:'The deadline for submitting resumes for shortlisting for the Deloitte drive has been extended to 22nd October 2025. Students are requested to update their profiles on the portal and upload the latest version of their resume.', created_at: ago(3), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n5', title:'Pre-Placement Talk: Goldman Sachs', category:'drive', content:'Goldman Sachs will be conducting a pre-placement talk on 20th October 2025 at Seminar Hall A at 10:00 AM. Attendance is mandatory for all registered students. Business formals are required.', created_at: ago(4), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n6', title:'Infosys Offer Letter Distribution', category:'result', content:'Students selected in the Infosys campus drive 2024 are requested to collect their physical offer letters from the Placement Office between 10 AM – 4 PM on weekdays. Please carry your college ID card.', created_at: ago(5), profiles:{first_name:'Placement', last_name:'Office'} },
    { id:'n7', title:'Mock Interview Sessions – Register Now', category:'general', content:'The Training & Placement Cell is organizing mock interview sessions with industry mentors for final year students. Sessions will be conducted every Saturday from 10 AM – 1 PM. Register via the portal. Limited slots available.', created_at: ago(7), profiles:{first_name:'T&P', last_name:'Cell'} },
  ];
}

function renderNotices(filterCategory = 'all') {
  const list = document.getElementById('notices-list');
  if (!list) return;
  const filtered = filterCategory === 'all' ? allNotices : allNotices.filter(n => n.category === filterCategory);

  list.innerHTML = filtered.map(n => {
    const author = n.profiles ? `${n.profiles.first_name} ${n.profiles.last_name}` : 'Placement Office';
    const date   = new Date(n.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    return `
    <div class="notice-card ${n.category}">
      <div class="notice-header">
        <div class="notice-title">${n.title}</div>
        <span class="notice-category-badge ${n.category}">${n.category}</span>
      </div>
      <div class="notice-content">${n.content}</div>
      <div class="notice-footer">
        <span class="notice-author">📝 ${author}</span>
        <span class="notice-date">📅 ${date}</span>
      </div>
    </div>`;
  }).join('');

  if (!filtered.length) list.innerHTML = `<div class="empty-state"><div style="font-size:3rem">📭</div><h3>No notices found</h3></div>`;
}

function filterNotices(cat, btn) {
  document.querySelectorAll('.notice-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNotices(cat);
}

// ─── STATISTICS ───────────────────────────────────────────────
async function loadStats() {
  // Try to get real data from Supabase
  const { data: placed } = await sb.from('applications').select('id').eq('status', 'selected');
  const { data: companies } = await sb.from('companies').select('id');
  const { data: jobsData } = await sb.from('jobs').select('ctc');

  const totalPlaced   = placed?.length  || 1284;
  const companyCount  = companies?.length || 198;
  const avgPkg        = jobsData?.length ? (jobsData.reduce((s,j)=>s+(j.ctc||0),0)/jobsData.length).toFixed(1) : '12.4';
  const highestPkg    = jobsData?.length ? Math.max(...jobsData.map(j=>j.ctc||0)) : 52;

  document.getElementById('kpi-total').textContent    = totalPlaced.toLocaleString();
  document.getElementById('kpi-avg-pkg').textContent  = `₹${avgPkg}L`;
  document.getElementById('kpi-highest').textContent  = `₹${highestPkg}L`;
  document.getElementById('kpi-companies').textContent= companyCount;

  // Top recruiters table
  const recruiters = getSampleCompanies().sort((a,b) => b.total_offers - a.total_offers).slice(0,8);
  document.getElementById('recruiters-tbody').innerHTML = recruiters.map((c,i) => `
    <tr>
      <td>${i+1}</td>
      <td><div style="display:flex;align-items:center;gap:0.5rem"><img src="${c.logo_url}" onerror="this.style.display='none'" style="width:24px;height:24px;border-radius:4px;background:white;padding:2px;object-fit:contain" />${c.name}</div></td>
      <td>${c.total_offers}</td>
      <td>₹${c.avg_ctc} LPA</td>
      <td style="color:var(--green);font-weight:700">₹${c.highest_ctc} LPA</td>
    </tr>`).join('');
}

function renderCharts() {
  renderYearlyChart();
  renderBranchChart();
  renderPackageChart();
}

function renderYearlyChart() {
  const ctx = document.getElementById('chart-yearly');
  if (!ctx) return;
  if (charts.yearly) charts.yearly.destroy();
  charts.yearly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['2020-21','2021-22','2022-23','2023-24','2024-25'],
      datasets: [
        { label: 'Students Placed', data: [680, 820, 920, 1080, 1284], backgroundColor: 'rgba(99,102,241,0.8)', borderRadius: 8, borderSkipped: false },
        { label: 'Companies Visited', data: [95, 120, 145, 168, 198], backgroundColor: 'rgba(168,85,247,0.8)', borderRadius: 8, borderSkipped: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      }
    }
  });
}

function renderBranchChart() {
  const ctx = document.getElementById('chart-branch');
  if (!ctx) return;
  if (charts.branch) charts.branch.destroy();
  charts.branch = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['CSE','ECE','ME','EE','CE','IT','MBA'],
      datasets: [{ data: [92,78,68,65,55,88,72], backgroundColor: ['#6366f1','#a855f7','#3b82f6','#06b6d4','#10b981','#f59e0b','#ec4899'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position:'bottom', labels: { color:'#94a3b8', padding:12 } } }
    }
  });
}

function renderPackageChart() {
  const ctx = document.getElementById('chart-package');
  if (!ctx) return;
  if (charts.package) charts.package.destroy();
  charts.package = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['< 5L','5-10L','10-20L','20-30L','30-40L','> 40L'],
      datasets: [{ label: 'Students', data: [120, 340, 480, 220, 85, 39], backgroundColor: ['#94a3b8','#6366f1','#a855f7','#3b82f6','#06b6d4','#10b981'], borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, indexAxis: 'y',
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,0.05)' } },
        y: { ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,0.05)' } },
      }
    }
  });
}

// ─── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  if (!currentUser) { openAuth('login'); return; }
  const role = currentProfile?.role || 'student';
  const name = currentProfile?.first_name || 'User';
  document.getElementById('dash-name').textContent = name;

  const content = document.getElementById('dashboard-content');
  if (role === 'student')  { await renderStudentDashboard(content); return; }
  if (role === 'company')  { await renderCompanyDashboard(content); return; }
  if (role === 'admin')    { await renderAdminDashboard(content); return; }
}

async function renderStudentDashboard(container) {
  const { data: apps } = await sb.from('applications')
    .select('*, jobs(title, ctc, job_type, companies(name, logo_url))')
    .eq('student_id', currentUser.id)
    .order('created_at', { ascending: false });

  const applications = apps || [];
  const pending     = applications.filter(a => a.status === 'pending').length;
  const shortlisted = applications.filter(a => a.status === 'shortlisted').length;
  const selected    = applications.filter(a => a.status === 'selected').length;

  document.getElementById('dash-subtitle').textContent = 'Track your applications and placement progress';

  container.innerHTML = `
    <div class="dashboard-kpis">
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--purple-light)">${applications.length}</div><div class="dash-kpi-label">Total Applied</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--orange)">${pending}</div><div class="dash-kpi-label">Pending</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--blue)">${shortlisted}</div><div class="dash-kpi-label">Shortlisted</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--green)">${selected}</div><div class="dash-kpi-label">Selected 🎉</div></div>
    </div>
    <div class="dashboard-sections">
      <div class="dash-section" style="grid-column:1/-1">
        <h3>My Applications <a href="#" onclick="showPage('jobs')">Browse more jobs →</a></h3>
        ${applications.length === 0 ? `<div style="text-align:center;padding:2rem;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:1rem">📭</div>
          <p>You haven't applied to any jobs yet.</p>
          <button class="btn-primary" style="margin-top:1rem" onclick="showPage('jobs')">Browse Jobs</button>
        </div>` : applications.map(a => {
          const job = a.jobs || {};
          const co  = job.companies || {};
          const logoHTML = co.logo_url ? `<img class="app-company-logo" src="${co.logo_url}" alt="${co.name}" onerror="this.style.display='none'" />` : '';
          return `
          <div class="application-item">
            ${logoHTML}
            <div class="app-info">
              <div class="app-job">${job.title || 'Job'}</div>
              <div class="app-company-name">${co.name || 'Company'}</div>
            </div>
            <span class="app-status ${a.status}">${a.status}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

async function renderCompanyDashboard(container) {
  const { data: myJobs } = await sb.from('jobs')
    .select('*, applications(count)')
    .eq('posted_by', currentUser.id)
    .order('created_at', { ascending: false });

  const jobs = myJobs || [];
  const totalApplications = jobs.reduce((s,j) => s + (j.applications?.[0]?.count || 0), 0);

  document.getElementById('dash-subtitle').textContent = 'Manage your job postings and applications';

  container.innerHTML = `
    <div class="dashboard-kpis">
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--purple-light)">${jobs.length}</div><div class="dash-kpi-label">Jobs Posted</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--blue)">${totalApplications}</div><div class="dash-kpi-label">Applications</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--green)">${jobs.filter(j=>j.status==='open').length}</div><div class="dash-kpi-label">Active Jobs</div></div>
    </div>
    <div class="dash-section" style="margin-top:2rem">
      <h3>Your Job Postings <a href="#" onclick="showPage('post-job')">+ Post new job</a></h3>
      ${jobs.length === 0 ? `<div style="text-align:center;padding:2rem;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:1rem">💼</div>
        <p>You haven't posted any jobs yet.</p>
        <button class="btn-primary" style="margin-top:1rem" onclick="showPage('post-job')">Post a Job</button>
      </div>` : `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Title</th><th>Type</th><th>CTC</th><th>Deadline</th><th>Apps</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${jobs.map(j => `
            <tr>
              <td style="font-weight:600">${j.title}</td>
              <td><span class="badge badge-type">${j.job_type}</span></td>
              <td style="color:var(--green);font-weight:700">₹${j.ctc}L</td>
              <td style="font-size:0.82rem">${j.deadline ? new Date(j.deadline).toLocaleDateString('en-IN') : 'TBD'}</td>
              <td>${j.applications?.[0]?.count || 0}</td>
              <td><span class="badge badge-${j.status === 'open' ? 'open':'closed'}">${j.status}</span></td>
              <td>
                <button class="btn-ghost btn-sm" onclick="viewJobApplications('${j.id}')">View Apps</button>
                <button class="btn-ghost btn-sm btn-danger" onclick="deleteJob('${j.id}')">Delete</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
}

async function renderAdminDashboard(container) {
  const [{ count: students }, { count: companies }, { count: jobs }, { count: applications }] = await Promise.all([
    sb.from('profiles').select('*', { count:'exact', head:true }).eq('role','student'),
    sb.from('profiles').select('*', { count:'exact', head:true }).eq('role','company'),
    sb.from('jobs').select('*', { count:'exact', head:true }),
    sb.from('applications').select('*', { count:'exact', head:true }),
  ]);

  document.getElementById('dash-subtitle').textContent = 'Placement management overview';
  container.innerHTML = `
    <div class="dashboard-kpis">
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--purple-light)">${students||0}</div><div class="dash-kpi-label">Students</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--blue)">${companies||0}</div><div class="dash-kpi-label">Companies</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--green)">${jobs||0}</div><div class="dash-kpi-label">Active Jobs</div></div>
      <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--orange)">${applications||0}</div><div class="dash-kpi-label">Applications</div></div>
    </div>
    <div style="margin-top:2rem;display:flex;gap:1rem;flex-wrap:wrap">
      <button class="btn-primary" onclick="showPage('admin')">⚙️ Open Admin Panel</button>
      <button class="btn-ghost" onclick="showPage('stats')">📊 View Statistics</button>
      <button class="btn-ghost" onclick="showPage('post-job')">📢 Post Notice</button>
    </div>`;
}

// ─── POST JOB ─────────────────────────────────────────────────
async function handlePostJob(e) {
  e.preventDefault();
  if (!currentUser) { openAuth('login'); return; }

  setBtnLoading('post-job-btn', true);
  clearFormErrors();

  const branchSelect = document.getElementById('pj-branches');
  const selectedBranches = Array.from(branchSelect.selectedOptions).map(o => o.value);

  // Get or create company record
  let companyId = null;
  const companyName = currentProfile?.company_name || 'Unknown Company';
  const { data: existingCo } = await sb.from('companies').select('id').eq('name', companyName).single();
  if (existingCo) {
    companyId = existingCo.id;
  } else {
    const { data: newCo } = await sb.from('companies').insert({ name: companyName, industry: 'Technology' }).select('id').single();
    companyId = newCo?.id;
  }

  const { error } = await sb.from('jobs').insert({
    title:             document.getElementById('pj-title').value.trim(),
    job_type:          document.getElementById('pj-type').value,
    ctc:               parseFloat(document.getElementById('pj-ctc').value),
    location:          document.getElementById('pj-location').value.trim(),
    description:       document.getElementById('pj-description').value.trim(),
    skills:            document.getElementById('pj-skills').value.split(',').map(s=>s.trim()).filter(Boolean),
    min_cgpa:          parseFloat(document.getElementById('pj-min-cgpa').value) || null,
    deadline:          document.getElementById('pj-deadline').value,
    eligible_branches: selectedBranches,
    interview_process: document.getElementById('pj-process').value.trim(),
    company_id:        companyId,
    posted_by:         currentUser.id,
    status:            'open',
  });

  setBtnLoading('post-job-btn', false);

  if (error) { showError('post-job-error', error.message); return; }

  showSuccess('post-job-success', '✅ Job posted successfully!');
  document.getElementById('post-job-form').reset();
  await loadJobs();
  setTimeout(() => showPage('dashboard'), 1500);
  toast('Job posted successfully! 🎉', 'success');
}

// ─── PROFILE ──────────────────────────────────────────────────
async function loadProfile() {
  if (!currentUser) { openAuth('login'); return; }
  const p = currentProfile || {};
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || currentUser.email;
  const initials = (p.first_name||'U').charAt(0).toUpperCase();

  document.getElementById('profile-content').innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-name">${name}</div>
      <div class="profile-role-badge">${(p.role || 'student').charAt(0).toUpperCase() + (p.role||'student').slice(1)}</div>
      <div class="profile-meta">
        <div>📧 ${currentUser.email}</div>
        ${p.roll_number ? `<div>🎓 ${p.roll_number}</div>` : ''}
        ${p.branch ? `<div>🏛 ${p.branch}</div>` : ''}
        ${p.graduation_year ? `<div>📅 Class of ${p.graduation_year}</div>` : ''}
        ${p.company_name ? `<div>🏢 ${p.company_name}</div>` : ''}
        ${p.designation ? `<div>💼 ${p.designation}</div>` : ''}
      </div>
    </div>
    <div class="profile-edit-form">
      <h2>Edit Profile</h2>
      <form id="profile-form" onsubmit="handleProfileUpdate(event)">
        <div class="form-row">
          <div class="form-group">
            <label>First Name</label>
            <input type="text" id="pf-firstname" value="${p.first_name||''}" />
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input type="text" id="pf-lastname" value="${p.last_name||''}" />
          </div>
        </div>
        ${p.role === 'student' ? `
        <div class="form-row">
          <div class="form-group">
            <label>Roll Number</label>
            <input type="text" id="pf-roll" value="${p.roll_number||''}" />
          </div>
          <div class="form-group">
            <label>CGPA</label>
            <input type="number" id="pf-cgpa" step="0.01" min="0" max="10" value="${p.cgpa||''}" placeholder="e.g. 8.5" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Branch</label>
            <select id="pf-branch">
              ${['CSE','ECE','ME','CE','EE','IT','MBA'].map(b => `<option value="${b}" ${p.branch===b?'selected':''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Graduation Year</label>
            <input type="number" id="pf-year" value="${p.graduation_year||''}" placeholder="2025" />
          </div>
        </div>
        <div class="form-group">
          <label>Skills (comma separated)</label>
          <input type="text" id="pf-skills" value="${Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills||'')}" placeholder="Python, Java, React..." />
        </div>
        <div class="form-group">
          <label>Resume Link</label>
          <input type="url" id="pf-resume" value="${p.resume_url||''}" placeholder="https://drive.google.com/..." />
        </div>
        <div class="form-group">
          <label>LinkedIn URL</label>
          <input type="url" id="pf-linkedin" value="${p.linkedin_url||''}" placeholder="https://linkedin.com/in/..." />
        </div>` : ''}
        ${p.role === 'company' ? `
        <div class="form-row">
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" id="pf-company" value="${p.company_name||''}" />
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="pf-designation" value="${p.designation||''}" />
          </div>
        </div>` : ''}
        <button type="submit" class="btn-primary" id="profile-save-btn">
          <span>Save Changes</span><div class="btn-loader hidden"></div>
        </button>
        <div id="profile-error" class="form-error hidden"></div>
        <div id="profile-success" class="form-success hidden"></div>
      </form>
    </div>`;
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  setBtnLoading('profile-save-btn', true);

  const updates = {
    first_name: document.getElementById('pf-firstname')?.value.trim(),
    last_name:  document.getElementById('pf-lastname')?.value.trim(),
    ...(currentProfile?.role === 'student' ? {
      roll_number:     document.getElementById('pf-roll')?.value.trim(),
      cgpa:            parseFloat(document.getElementById('pf-cgpa')?.value) || null,
      branch:          document.getElementById('pf-branch')?.value,
      graduation_year: document.getElementById('pf-year')?.value,
      skills:          document.getElementById('pf-skills')?.value.split(',').map(s=>s.trim()).filter(Boolean),
      resume_url:      document.getElementById('pf-resume')?.value.trim(),
      linkedin_url:    document.getElementById('pf-linkedin')?.value.trim(),
    } : {}),
    ...(currentProfile?.role === 'company' ? {
      company_name: document.getElementById('pf-company')?.value.trim(),
      designation:  document.getElementById('pf-designation')?.value.trim(),
    } : {}),
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('profiles').update(updates).eq('id', currentUser.id);
  setBtnLoading('profile-save-btn', false);

  if (error) { showError('profile-error', error.message); return; }

  currentProfile = { ...currentProfile, ...updates };
  updateNavForUser();
  showSuccess('profile-success', '✅ Profile updated successfully!');
  toast('Profile saved!', 'success');
}

// ─── ADMIN PANEL ──────────────────────────────────────────────
async function loadAdminPanel() {
  if (currentProfile?.role !== 'admin') { toast('Access denied.', 'error'); return; }
  adminSearchUsers();
  loadAdminJobs();
  loadAdminApplications();
  loadAdminNotices();
}

async function adminSearchUsers() {
  const search = document.getElementById('admin-user-search')?.value.toLowerCase() || '';
  const role   = document.getElementById('admin-user-role')?.value || '';

  let query = sb.from('profiles').select('*').order('created_at', { ascending: false });
  if (role)   query = query.eq('role', role);

  const { data: users, error } = await query;
  if (error) { toast('Failed to load users.', 'error'); return; }

  const filtered = search ? (users||[]).filter(u => u.first_name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search)) : (users||[]);

  document.getElementById('admin-users-tbody').innerHTML = filtered.map(u => `
    <tr>
      <td style="font-weight:600">${u.first_name||''} ${u.last_name||''}</td>
      <td style="color:var(--text-muted)">${u.email||''}</td>
      <td><span class="badge badge-type">${u.role||'student'}</span></td>
      <td>${u.branch||'—'}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—'}</td>
      <td><button class="btn-ghost btn-sm" onclick="adminDeleteUser('${u.id}')">Remove</button></td>
    </tr>`).join('') || `<tr><td colspan="6" class="loading-row">No users found</td></tr>`;
}

async function loadAdminJobs() {
  const { data: jobs } = await sb.from('jobs').select('*, companies(name), profiles(first_name, last_name)').order('created_at', { ascending: false });
  document.getElementById('admin-jobs-tbody').innerHTML = (jobs||[]).map(j => `
    <tr>
      <td style="font-weight:600">${j.title}</td>
      <td>${j.companies?.name||'—'}</td>
      <td><span class="badge badge-type">${j.job_type}</span></td>
      <td style="color:var(--green);font-weight:700">₹${j.ctc}L</td>
      <td style="font-size:0.82rem">${j.deadline ? new Date(j.deadline).toLocaleDateString('en-IN') : 'TBD'}</td>
      <td><span class="badge badge-${j.status==='open'?'open':'closed'}">${j.status}</span></td>
      <td>
        <button class="btn-ghost btn-sm" onclick="adminToggleJobStatus('${j.id}','${j.status}')">${j.status==='open'?'Close':'Reopen'}</button>
        <button class="btn-ghost btn-sm btn-danger" onclick="adminDeleteJob('${j.id}')">Delete</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="loading-row">No jobs found</td></tr>`;
}

async function loadAdminApplications() {
  const { data: apps } = await sb.from('applications')
    .select('*, jobs(title, companies(name)), profiles(first_name, last_name, email)')
    .order('created_at', { ascending: false })
    .limit(50);

  document.getElementById('admin-apps-tbody').innerHTML = (apps||[]).map(a => `
    <tr>
      <td>${a.profiles?.first_name||''} ${a.profiles?.last_name||''}<br/><span style="font-size:0.78rem;color:var(--text-muted)">${a.profiles?.email||''}</span></td>
      <td style="font-weight:600">${a.jobs?.title||'—'}</td>
      <td>${a.jobs?.companies?.name||'—'}</td>
      <td style="font-size:0.8rem">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : '—'}</td>
      <td><span class="app-status ${a.status}">${a.status}</span></td>
      <td>
        <select onchange="adminUpdateApplicationStatus('${a.id}', this.value)" style="padding:0.3rem;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:0.8rem">
          <option value="pending" ${a.status==='pending'?'selected':''}>Pending</option>
          <option value="shortlisted" ${a.status==='shortlisted'?'selected':''}>Shortlist</option>
          <option value="interview" ${a.status==='interview'?'selected':''}>Interview</option>
          <option value="selected" ${a.status==='selected'?'selected':''}>Select</option>
          <option value="rejected" ${a.status==='rejected'?'selected':''}>Reject</option>
        </select>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="loading-row">No applications found</td></tr>`;
}

async function loadAdminNotices() {
  const { data: notices } = await sb.from('notices')
    .select('*, profiles(first_name, last_name)')
    .order('created_at', { ascending: false });

  document.getElementById('admin-notices-tbody').innerHTML = (notices||[]).map(n => `
    <tr>
      <td style="font-weight:600">${n.title}</td>
      <td><span class="notice-category-badge ${n.category}">${n.category}</span></td>
      <td>${n.profiles?.first_name||''} ${n.profiles?.last_name||''}</td>
      <td style="font-size:0.8rem">${n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN') : '—'}</td>
      <td><button class="btn-ghost btn-sm btn-danger" onclick="adminDeleteNotice('${n.id}')">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="5" class="loading-row">No notices found</td></tr>`;
}

// Admin actions
async function adminUpdateApplicationStatus(appId, status) {
  const { error } = await sb.from('applications').update({ status }).eq('id', appId);
  if (error) toast('Update failed: ' + error.message, 'error');
  else toast(`Status updated to "${status}"`, 'success');
}

async function adminDeleteJob(jobId) {
  if (!confirm('Delete this job posting?')) return;
  await sb.from('applications').delete().eq('job_id', jobId);
  const { error } = await sb.from('jobs').delete().eq('id', jobId);
  if (error) toast('Delete failed: ' + error.message, 'error');
  else { toast('Job deleted', 'info'); loadAdminJobs(); loadJobs(); }
}

async function adminToggleJobStatus(jobId, current) {
  const newStatus = current === 'open' ? 'closed' : 'open';
  const { error } = await sb.from('jobs').update({ status: newStatus }).eq('id', jobId);
  if (error) toast('Update failed', 'error');
  else { toast(`Job ${newStatus}`, 'info'); loadAdminJobs(); }
}

async function adminDeleteUser(userId) {
  if (!confirm('Remove this user from the platform?')) return;
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) toast('Delete failed: ' + error.message, 'error');
  else { toast('User removed', 'info'); adminSearchUsers(); }
}

async function adminDeleteNotice(noticeId) {
  if (!confirm('Delete this notice?')) return;
  const { error } = await sb.from('notices').delete().eq('id', noticeId);
  if (error) toast('Delete failed: ' + error.message, 'error');
  else { toast('Notice deleted', 'info'); loadAdminNotices(); loadNotices(); }
}

async function handlePostNotice(e) {
  e.preventDefault();
  if (!currentUser) return;
  const { error } = await sb.from('notices').insert({
    title:      document.getElementById('notice-title').value.trim(),
    category:   document.getElementById('notice-category').value,
    content:    document.getElementById('notice-content').value.trim(),
    posted_by:  currentUser.id,
  });
  if (error) { showError('notice-error', error.message); return; }
  showSuccess('notice-success', '✅ Notice posted!');
  document.getElementById('notice-form').reset();
  await loadAdminNotices();
  await loadNotices();
}

// ─── Admin Tab Switch ──────────────────────────────────────────
function switchAdminTab(name, btn) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`admin-tab-${name}`).classList.add('active');
  btn.classList.add('active');
}

// ─── Company Job Actions ───────────────────────────────────────
async function viewJobApplications(jobId) {
  const { data: apps } = await sb.from('applications')
    .select('*, profiles(first_name, last_name, email, branch, cgpa, resume_url)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  const html = (apps||[]).map(a => {
    const p = a.profiles || {};
    return `<div class="application-item" style="padding:1rem;border:1px solid var(--border);border-radius:12px;margin-bottom:0.75rem;gap:1rem">
      <div style="flex:1">
        <div style="font-weight:600">${p.first_name||''} ${p.last_name||''}</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">${p.email} • ${p.branch||'—'} • CGPA: ${p.cgpa||'—'}</div>
        ${a.cover_letter ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.5rem">"${a.cover_letter.substring(0,120)}..."</div>` : ''}
        ${a.resume_link || p.resume_url ? `<a href="${a.resume_link||p.resume_url}" target="_blank" style="font-size:0.8rem;color:var(--purple-light)">📄 View Resume</a>` : ''}
      </div>
      <div>
        <select onchange="adminUpdateApplicationStatus('${a.id}', this.value)" style="padding:0.4rem;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:0.82rem">
          <option value="pending" ${a.status==='pending'?'selected':''}>Pending</option>
          <option value="shortlisted" ${a.status==='shortlisted'?'selected':''}>Shortlist</option>
          <option value="interview" ${a.status==='interview'?'selected':''}>Interview</option>
          <option value="selected" ${a.status==='selected'?'selected':''}>Select ✅</option>
          <option value="rejected" ${a.status==='rejected'?'selected':''}>Reject ❌</option>
        </select>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--text-muted);text-align:center;padding:2rem">No applications yet</p>';

  // Show in a simple overlay
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:600;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `<div style="background:rgba(15,15,26,0.98);border:1px solid var(--border);border-radius:20px;padding:2rem;max-width:700px;width:100%;max-height:80vh;overflow-y:auto;position:relative">
    <button onclick="this.closest('div[style*=fixed]').remove()" style="position:absolute;top:1rem;right:1rem;background:var(--bg-card);color:var(--text-muted);width:32px;height:32px;border-radius:50%;font-size:0.85rem;border:none;cursor:pointer">✕</button>
    <h2 style="margin-bottom:1.5rem;font-size:1.3rem">Applications (${apps?.length||0})</h2>
    ${html}
  </div>`;
  document.body.appendChild(modal);
}

async function deleteJob(jobId) {
  if (!confirm('Delete this job?')) return;
  await sb.from('applications').delete().eq('job_id', jobId);
  await sb.from('jobs').delete().eq('id', jobId);
  toast('Job deleted', 'info');
  loadDashboard();
  loadJobs();
}

// ─── Utility ──────────────────────────────────────────────────
document.getElementById('reg-password')?.addEventListener('input', function() {
  const strength = document.getElementById('pw-strength');
  if (!strength) return;
  const val = this.value;
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(val)).length;
  const colors = ['','#ef4444','#f59e0b','#10b981','#6366f1'];
  const widths = ['0%','25%','50%','75%','100%'];
  strength.style.background = `linear-gradient(90deg, ${colors[score]} ${widths[score]}, rgba(255,255,255,0.08) ${widths[score]})`;
});