// ================================================================
    // UTILITY: HTML escape to prevent XSS
    // ================================================================
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    // Alias used through codebase
    const escapeHtmlPublic = escapeHtml;

    // ================================================================
    // UTILITY: Relative time
    // ================================================================
    function timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
      return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const timeAgoFeed = timeAgo;

    // ================================================================
    // UTILITY: Get name initials
    // ================================================================
    function getInitials(name) {
      if (!name) return '?';
      return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    }

    // ================================================================
    // TOAST NOTIFICATION
    // ================================================================
    let toastTimer = null;
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      const toastBox = document.getElementById('toastBox');
      const icon = document.getElementById('toastIcon');
      const msg = document.getElementById('toastMessage');

      msg.textContent = message;

      if (type === 'success') {
        icon.textContent = '✅';
        toastBox.classList.remove('border-red-500');
        toastBox.classList.add('border-gold-500');
      } else {
        icon.textContent = '⚠️';
        toastBox.classList.remove('border-gold-500');
        toastBox.classList.add('border-red-500');
      }

      // Show
      toast.classList.remove('translate-x-[150%]', 'opacity-0');
      toast.classList.add('translate-x-0', 'opacity-100');
      toast.classList.remove('pointer-events-none');

      // Auto-dismiss after 4.5s (cancel any pending)
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.add('translate-x-[150%]', 'opacity-0');
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('pointer-events-none');
      }, 4500);
    }

    // ================================================================
    // MOBILE MENU
    // ================================================================
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');

    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      mobileMenu.classList.toggle('flex');
    });
    // Close mobile menu when a nav link is tapped
    document.querySelectorAll('#mobileMenu a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenu.classList.remove('flex');
      });
    });

    // ================================================================
    // AUTHENTICATION — LocalStorage helpers
    // ================================================================
    const AUTH_TOKEN_KEY = 'sg_token';
    const AUTH_USER_KEY = 'sg_user';

    function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
    function getStoredUser() {
      try {
        const raw = localStorage.getItem(AUTH_USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }
    function saveAuth(token, user) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }

    /**
     * clearAuth — wipes token and user from localStorage, used on sign-out.
     */
    function clearAuth() {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }

    // ================================================================
    // RENDER AVATAR (profile picture or colored initials)
    // ================================================================
    function renderAvatarInto(el, user) {
      if (!el || !user) return;
      if (user.profilePicture) {
        // Apply via a temporary Image so we can catch load failures
        // before writing to the element's backgroundImage.
        const probe = new Image();
        probe.onload = () => {
          el.style.backgroundImage = `url('${user.profilePicture}')`;
          el.style.backgroundColor = 'transparent';
          el.textContent = '';
        };
        probe.onerror = () => {
          // Fall back gracefully to colored initials
          el.style.backgroundImage = 'none';
          el.style.backgroundColor = user.avatarColor || '#d4a437';
          el.textContent = getInitials(user.name);
        };
        probe.src = user.profilePicture;
      } else {
        el.style.backgroundImage = 'none';
        el.style.backgroundColor = user.avatarColor || '#d4a437';
        el.textContent = getInitials(user.name);
      }
    }

    /**
     * mediaFallback(imgEl)
     * Call as the onerror handler on any dynamically created post <img>.
     * Replaces the broken image element with a styled placeholder div so
     * the card layout is preserved and no browser broken-image icon shows.
     */
    function mediaFallback(imgEl) {
      const parent = imgEl.parentNode;
      if (!parent) return;
      const fallback = document.createElement('div');
      fallback.className = 'media-fallback';
      // Copy sizing/layout classes from the original img so the slot is preserved
      fallback.className += ' ' + imgEl.className;
      fallback.classList.add('media-fallback');
      fallback.innerHTML = '🖼️<span>Image unavailable</span>';
      parent.replaceChild(fallback, imgEl);
    }

    // ================================================================
    // UPDATE NAV / UI BASED ON AUTH STATE
    // ================================================================
    function updateAuthUI() {
      const user = getStoredUser();
      const isLoggedIn = !!user;

      // Desktop
     const authBtns = document.getElementById('authButtons');
if (authBtns) {
  authBtns.classList.toggle('auth-hide', isLoggedIn);
}
      const userMenuEl = document.getElementById('userMenu');
      userMenuEl.classList.toggle('hidden', !isLoggedIn);
      if (isLoggedIn) userMenuEl.classList.add('flex');
      else userMenuEl.classList.remove('flex');

      // Chat icon
      document.getElementById('chatToggleBtn').classList.toggle('hidden', !isLoggedIn);
      document.getElementById('mobChatBtn').classList.toggle('auth-hide', !isLoggedIn);
      document.getElementById('mobFeedNotifBtn').classList.toggle('auth-hide', !isLoggedIn);
      document.getElementById('mobTopNotifBtn').classList.toggle('auth-hide', !isLoggedIn);
      document.getElementById('mobTopNewPostBtn').classList.toggle('auth-hide', !isLoggedIn);

      // Notification bell
      document.getElementById('notifWrap').classList.toggle('hidden', !isLoggedIn);
      if (isLoggedIn) document.getElementById('notifWrap').classList.add('flex');
      else document.getElementById('notifWrap').classList.remove('flex');

      // Feed create post button & login prompt
      // NOTE: no 'important' here — on mobile/tablet (≤767px) the CSS media query rule
      // (#createPostBtn { display: none !important; }) must stay in control, since
      // that button is replaced by #mobTopNewPostBtn in the persistent top bar there.
      const createBtn = document.getElementById('createPostBtn');
if (createBtn) {
  createBtn.style.display = isLoggedIn ? 'inline-flex' : 'none';
}
      document.getElementById('feedLoginPrompt').classList.toggle('hidden', isLoggedIn);

      // "Share Post / Video" buttons across #home, #wisdom, #sloka,
      // #community, #thoughts, #join — always visible, but their tooltip
      // reflects whether the click will open the post composer or the
      // login modal (actual routing is handled by handleSharePostBtnClick).
      document.querySelectorAll('.share-post-section-btn').forEach(btn => {
        btn.title = isLoggedIn ? 'Share a new post or video' : 'Log in to share a post or video';
      });

      // Mobile
      document.getElementById('mobileAuthButtons').classList.toggle('hidden', isLoggedIn);
      document.getElementById('mobileUserMenu').classList.toggle('hidden', !isLoggedIn);

      // Admin portal (backend-controlled flag)
      const isAdmin = user?.isAdmin === true;
      document.getElementById('adminPortalBtn').classList.toggle('hidden', !isAdmin);
      document.getElementById('mobileAdminPortalBtn').classList.toggle('hidden', !isAdmin);

      if (user) {
        // Populate name labels
        document.getElementById('userNameLabel').textContent = user.name;
        document.getElementById('dropdownUserName').textContent = user.name;
        document.getElementById('mobileUserNameLabel').textContent = user.name;

        // Render avatars
        renderAvatarInto(document.getElementById('userAvatar'), user);
        renderAvatarInto(document.getElementById('mobileAvatar'), user);
        renderAvatarInto(document.getElementById('mobProfileAvatarSlot'), user);

        // Start socket & load conversations
        connectSocket();
        loadConversations();
        loadNotifications();
      } else {
        disconnectSocket();
        const slot = document.getElementById('mobProfileAvatarSlot');
        if (slot) { slot.style.backgroundImage = ''; slot.style.background = ''; slot.textContent = '👤'; }
      }
    }

    // ================================================================
    // SIGN OUT
    // ================================================================
    function doLogout() {
      // 1. Clear storage
      clearAuth();

      // 2. Disconnect socket
      disconnectSocket();

      // 3. Close any open drawers / dropdowns
      document.getElementById('userDropdown').classList.add('hidden');
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');

      // 4. Update navigation to logged-out state
      updateAuthUI();

      // 5. Reload community feed (shows un-liked state)
      loadCommunityThoughts();
      loadFeed(true);

      showToast('You have been signed out.', 'success');
    }

    // Wire all sign-out buttons
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    document.getElementById('mobileLogoutBtn').addEventListener('click', doLogout);

    // ── "More Settings" panel inside own profile page (mobile) ──
    document.getElementById('ppMoreSettingsToggle').addEventListener('click', () => {
      const panel = document.getElementById('ppMoreSettingsPanel');
      const chevron = document.getElementById('ppMoreSettingsChevron');
      const open = panel.classList.toggle('hidden') === false;
      chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    });
    document.querySelectorAll('.pp-more-link').forEach(link => {
      link.addEventListener('click', () => closePublicProfile());
    });
    document.getElementById('ppMoreEditProfileBtn').addEventListener('click', () => {
      closePublicProfile();
      openEditProfileModal();
    });
    document.getElementById('ppMoreChangePasswordBtn').addEventListener('click', () => {
      closePublicProfile();
      openChangePasswordModal();
    });
    document.getElementById('ppMoreLogoutBtn').addEventListener('click', () => {
      closePublicProfile();
      doLogout();
    });

    // ================================================================
    // AUTH MODAL — open / close / tab switch
    // ================================================================
    const authModal = document.getElementById('authModal');

    function openAuthModal(tab = 'login') {
      authModal.classList.remove('hidden');
      // Switch tabs
      document.querySelectorAll('.auth-tab-btn').forEach(b => {
        const isActive = b.dataset.authtab === tab;
        b.classList.toggle('active', isActive);
        b.classList.toggle('text-gray-400', !isActive);
      });
      document.getElementById('loginFormAuth').classList.toggle('hidden', tab !== 'login');
      document.getElementById('signupFormAuth').classList.toggle('hidden', tab !== 'signup');
    }
    function closeAuthModal() {
      authModal.classList.add('hidden');
      document.getElementById('loginFormAuth').reset();
      document.getElementById('signupFormAuth').reset();
    }

    document.getElementById('loginNavBtn').addEventListener('click', () => openAuthModal('login'));
    document.getElementById('signupNavBtn').addEventListener('click', () => openAuthModal('signup'));
    document.getElementById('mobileLoginBtn').addEventListener('click', () => { mobileMenu.classList.add('hidden'); mobileMenu.classList.remove('flex'); openAuthModal('login'); });
    document.getElementById('mobileSignupBtn').addEventListener('click', () => { mobileMenu.classList.add('hidden'); mobileMenu.classList.remove('flex'); openAuthModal('signup'); });
    document.getElementById('closeAuthModal').addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', e => { if (e.target === authModal) closeAuthModal(); });

    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => openAuthModal(btn.dataset.authtab));
    });

    // ================================================================
    // AUTH MODAL — Login submit
    // ================================================================
    document.getElementById('loginFormAuth').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Logging in…';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
        });
        const data = await res.json();

        if (res.ok && data.success) {
          saveAuth(data.token, data.user);
          updateAuthUI();
          closeAuthModal();
          showToast(data.message, 'success');
          loadCommunityThoughts();
          loadFeed(true);
        } else {
          showToast(data.message || 'Login failed.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // AUTH MODAL — Signup submit
    // ================================================================
    document.getElementById('signupFormAuth').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('signupSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Creating account…';

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
        });
        const data = await res.json();

        if (res.ok && data.success) {
          saveAuth(data.token, data.user);
          updateAuthUI();
          closeAuthModal();
          showToast(data.message, 'success');
          loadCommunityThoughts();
          loadFeed(true);
        } else {
          showToast(data.message || 'Sign up failed.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // USER DROPDOWN MENU
    // ================================================================
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });

    // ================================================================
    // EDIT PROFILE PICTURE MODAL
    // ================================================================
    const editProfileModal = document.getElementById('editProfileModal');

    function openEditProfileModal() {
      userDropdown.classList.add('hidden');
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');

      const user = getStoredUser();
      const imgEl = document.getElementById('profilePicPreview');
      const initEl = document.getElementById('profilePicPreviewInitials');

      if (user?.profilePicture) {
        imgEl.src = user.profilePicture;
        imgEl.classList.remove('hidden');
        initEl.classList.add('hidden');
      } else if (user) {
        initEl.textContent = getInitials(user.name);
        initEl.style.backgroundColor = user.avatarColor || '#d4a437';
        initEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
      }
      editProfileModal.classList.remove('hidden');
    }
    function closeEditProfileModal() {
      editProfileModal.classList.add('hidden');
      document.getElementById('profilePicForm').reset();
    }

    document.getElementById('editProfileNavBtn').addEventListener('click', openEditProfileModal);
    document.getElementById('mobileEditProfileBtn').addEventListener('click', openEditProfileModal);

    // View Profile (own) — desktop & mobile
    document.getElementById('viewProfileNavBtn').addEventListener('click', () => {
      document.getElementById('userDropdown').classList.add('hidden');
      const me = getStoredUser();
      if (me) openPublicProfile(me.id);
    });
    document.getElementById('mobileViewProfileBtn').addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');
      const me = getStoredUser();
      if (me) openPublicProfile(me.id);
    });
    document.getElementById('closeEditProfileModal').addEventListener('click', closeEditProfileModal);
    editProfileModal.addEventListener('click', e => { if (e.target === editProfileModal) closeEditProfileModal(); });

    // Preview selected image before upload
    document.getElementById('profilePicInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const imgEl = document.getElementById('profilePicPreview');
      const initEl = document.getElementById('profilePicPreviewInitials');
      imgEl.src = URL.createObjectURL(file);
      imgEl.classList.remove('hidden');
      initEl.classList.add('hidden');
    });

    // Upload submit
    document.getElementById('profilePicForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token) return;
      const file = document.getElementById('profilePicInput').files[0];
      if (!file) return;

      const btn = document.getElementById('profilePicSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Uploading…';

      const formData = new FormData();
      formData.append('avatar', file);

      try {
        const res = await fetch('/api/users/profile-picture', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();

        if (res.status === 401) { handleAuthExpiry(); closeEditProfileModal(); return; }

        if (res.ok && data.success) {
          const user = getStoredUser();
          user.profilePicture = data.profilePicture;
          saveAuth(token, user);
          updateAuthUI();
          showToast(data.message, 'success');
          closeEditProfileModal();
        } else {
          showToast(data.message || 'Upload failed.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // CHANGE PASSWORD MODAL
    // ================================================================
    const changePasswordModal = document.getElementById('changePasswordModal');

    function openChangePasswordModal() {
      userDropdown.classList.add('hidden');
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');
      changePasswordModal.classList.remove('hidden');
    }
    function closeChangePasswordModal() {
      changePasswordModal.classList.add('hidden');
      document.getElementById('changePasswordForm').reset();
    }

    document.getElementById('changePasswordNavBtn').addEventListener('click', openChangePasswordModal);
    document.getElementById('mobileChangePasswordBtn').addEventListener('click', openChangePasswordModal);
    document.getElementById('closeChangePasswordModal').addEventListener('click', closeChangePasswordModal);
    changePasswordModal.addEventListener('click', e => { if (e.target === changePasswordModal) closeChangePasswordModal(); });

    document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token) { showToast('Please log in first.', 'error'); return; }

      const fd = new FormData(e.target);
      const currentPassword = fd.get('currentPassword');
      const newPassword = fd.get('newPassword');
      const confirmNewPassword = fd.get('confirmNewPassword');

      if (newPassword !== confirmNewPassword) {
        showToast('Passwords do not match.', 'error');
        return;
      }
      if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters.', 'error');
        return;
      }

      const btn = document.getElementById('changePasswordSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Updating…';

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();

        if (res.status === 401) { handleAuthExpiry(); closeChangePasswordModal(); return; }

        if (res.ok && data.success) {
          showToast(data.message, 'success');
          closeChangePasswordModal();
        } else {
          showToast(data.message || 'Failed to update password.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // SHARED: Handle expired session (401)
    // ================================================================
    function handleAuthExpiry() {
      showToast('Session expired. Please log in again.', 'error');
      clearAuth();
      updateAuthUI();
      openAuthModal('login');
    }

    // ================================================================
    // EXPLORE WISDOM — Tab data & rendering
    // ================================================================
    // TODO: replace with the real deployed URL of the reading/scripture site
    // (the separate app with the Gita / Vedas / Ramayan panels).
    const READING_SITE_URL = 'https://your-reading-site-url.com/';

    const wisdomData = {
      gita: {
        title: 'Bhagavad Gita',
        image: 'gita.png',
        desc: 'The Bhagavad Gita is a 700-verse dialogue between Prince Arjuna and Lord Krishna on the battlefield of Kurukshetra. It addresses the moral and philosophical dilemmas of duty (dharma), righteous action (karma yoga), devotion (bhakti yoga), and the path to self-realization (jnana yoga).',
        points: ['18 Chapters, 700 Verses', 'Core of Karma, Bhakti & Jnana Yoga', 'Dialogue between Krishna & Arjuna'],
        readLink: READING_SITE_URL + '#gita'
      },
      vedas: {
        title: 'The Vedas',
        image: 'vedas.png',
        desc: 'The Vedas are the oldest sacred texts of Sanatan Dharma, composed of four collections — Rigveda, Yajurveda, Samaveda, and Atharvaveda. They contain hymns, rituals, philosophy, and cosmological insights that form the bedrock of Vedic civilization.',
        points: ['Rigveda, Yajurveda, Samaveda, Atharvaveda', 'Oldest scriptures of Sanatan Dharma', 'Foundation of ritual & philosophical thought'],
        readLink: READING_SITE_URL + '#vedas'
      },
      upanishads: {
        title: 'The Upanishads',
        image: 'upanishad.png',
        desc: 'The Upanishads are philosophical texts that form the concluding portion of the Vedas (Vedanta). They explore the nature of ultimate reality (Brahman), the individual self (Atman), and the union between the two — laying the intellectual foundation for later Indian philosophical schools.',
        points: ['108 principal Upanishads', 'Explores Atman & Brahman', 'Foundation of Vedanta philosophy'],
        // No dedicated Upanishad panel on the reading site yet — sending to Vedas for now.
        readLink: READING_SITE_URL + '#vedas'
      },
      philosophy: {
        title: 'Sanatan Philosophy',
        image: 'philosophy.png',
        desc: 'Sanatan philosophy encompasses six classical schools of thought (Shad Darshana) — Nyaya, Vaisheshika, Samkhya, Yoga, Mimamsa, and Vedanta — each offering distinct approaches to understanding reality, knowledge, ethics, and liberation (moksha).',
        points: ['Shad Darshana: Six schools of thought', 'Concepts of Dharma, Karma & Moksha', 'A living tradition of inquiry'],
        // No dedicated Philosophy panel on the reading site yet — sending to Glossary for now.
        readLink: READING_SITE_URL + '#glossary'
      }
    };

    function renderWisdomTab(tab) {
      const data = wisdomData[tab];
      const container = document.getElementById('wisdomContent');
      container.classList.remove('fade-in');
      void container.offsetWidth; // reflow to restart animation
      container.classList.add('fade-in');

      container.innerHTML = `
    <div class="rounded-3xl overflow-hidden shadow-2xl">
      <img src="${data.image}" alt="${data.title}" class="w-full h-80 object-cover" />
    </div>
    <div class="glass-card rounded-3xl p-8">
      <h3 class="font-serif text-2xl font-bold gold-text mb-4">${data.title}</h3>
      <p class="text-gray-300 leading-relaxed mb-6 text-sm">${data.desc}</p>
      <ul class="space-y-2.5 mb-2">
        ${data.points.map(p => `
          <li class="flex items-center gap-2.5 text-sm text-gray-300">
            <span class="text-gold-400 text-xs shrink-0">✦</span>${p}
          </li>`).join('')}
      </ul>
      <a href="${data.readLink}" class="read-book-btn" title="Read the full ${data.title}">
        <span class="read-book-icon" aria-hidden="true">📖</span>
        <span>Read Full Book</span>
        <span class="read-book-arrow" aria-hidden="true">→</span>
      </a>
    </div>
  `;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active');
          b.classList.add('text-gray-300');
        });
        btn.classList.add('active');
        btn.classList.remove('text-gray-300');
        renderWisdomTab(btn.dataset.tab);
      });
    });
    renderWisdomTab('gita');

    // ================================================================
    // DAILY SLOKA GENERATOR
    // ================================================================
    const slokas = [
      {
        sanskrit: 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन। मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥',
        transliteration: 'karmaṇy-evādhikāras te mā phaleṣu kadācana',
        english: 'You have the right to perform your duty, but never to the fruits of your actions.',
        hindi: 'तुम्हारा अधिकार केवल कर्म करने में है, फल में कभी नहीं।',
        source: 'Bhagavad Gita, Chapter 2, Verse 47'
      },
      {
        sanskrit: 'योगः कर्मसु कौशलम्।',
        transliteration: 'yogaḥ karmasu kauśalam',
        english: 'Yoga is skill and excellence in action.',
        hindi: 'योग ही कर्मों में कुशलता है।',
        source: 'Bhagavad Gita, Chapter 2, Verse 50'
      },
      {
        sanskrit: 'असतो मा सद्गमय। तमसो मा ज्योतिर्गमय। मृत्योर्मा अमृतं गमय॥',
        transliteration: 'asato mā sad gamaya, tamaso mā jyotir gamaya',
        english: 'Lead me from untruth to truth, from darkness to light, from death to immortality.',
        hindi: 'हमें असत्य से सत्य, अंधकार से प्रकाश, मृत्यु से अमरता की ओर ले चलो।',
        source: 'Brihadaranyaka Upanishad, 1.3.28'
      },
      {
        sanskrit: 'वसुधैव कुटुम्बकम्।',
        transliteration: 'vasudhaiva kuṭumbakam',
        english: 'The whole world is one family.',
        hindi: 'सारा संसार एक परिवार है।',
        source: 'Maha Upanishad, Chapter 6, Verse 71'
      },
      {
        sanskrit: 'सत्यं वद। धर्मं चर।',
        transliteration: 'satyaṁ vada, dharmaṁ cara',
        english: 'Speak the truth. Follow the path of righteousness.',
        hindi: 'सत्य बोलो। धर्म का पालन करो।',
        source: 'Taittiriya Upanishad, 1.11.1'
      },
      {
        sanskrit: 'अहिंसा परमो धर्मः।',
        transliteration: 'ahiṁsā paramo dharmaḥ',
        english: 'Non-violence is the highest virtue.',
        hindi: 'अहिंसा सबसे बड़ा धर्म है।',
        source: 'Mahabharata, Anushasana Parva'
      },
      {
        sanskrit: 'सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः।',
        transliteration: 'sarve bhavantu sukhinaḥ sarve santu nirāmayāḥ',
        english: 'May all beings be happy; may all beings be free from illness.',
        hindi: 'सभी सुखी हों, सभी रोगमुक्त हों।',
        source: 'Brihadaranyaka Upanishad (Peace Invocation)'
      },
      {
        sanskrit: 'उद्धरेदात्मनात्मानं नात्मानमवसादयेत्।',
        transliteration: 'uddhared ātmanātmānaṁ nātmānam avasādayet',
        english: 'Elevate yourself by your own self; the self is both your best friend and your worst enemy.',
        hindi: 'स्वयं अपने द्वारा अपना उद्धार करना चाहिए।',
        source: 'Bhagavad Gita, Chapter 6, Verse 5'
      }
    ];

    function displayRandomSloka() {
      const s = slokas[Math.floor(Math.random() * slokas.length)];
      document.getElementById('slokaSanskrit').textContent = s.sanskrit;
      document.getElementById('slokaTransliteration').textContent = s.transliteration;
      document.getElementById('slokaEnglish').textContent = s.english;
      document.getElementById('slokaHindi').textContent = s.hindi;
      document.getElementById('slokaSource').textContent = `— ${s.source}`;
    }
    document.getElementById('newSlokaBtn').addEventListener('click', displayRandomSloka);
    displayRandomSloka();

    // ================================================================
    // CONTACT FORM SUBMISSION
    // ================================================================
    document.getElementById('contactForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('contactSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast(data.message, 'success');
          e.target.reset();
        } else {
          showToast(data.message || 'Something went wrong.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // THOUGHT FORM SUBMISSION
    // BUG FIX: validates login, blocks empties, prepends card instantly
    // ================================================================
    document.getElementById('thoughtForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      // 1. Login guard
      const token = getToken();
      if (!token) {
        showToast('Please log in to submit a thought.', 'error');
        openAuthModal('login');
        return;
      }

      // 2. Empty field guard
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      if (!payload.authorName?.trim() || !payload.email?.trim() ||
        !payload.title?.trim() || !payload.category ||
        !payload.content?.trim()) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      const btn = document.getElementById('thoughtSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const res = await fetch('/api/thoughts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast(data.message, 'success');
          e.target.reset();

          // 3. Instant optimistic card — pending state, greyed badge
          const user = getStoredUser();
          const optimisticThought = {
            _id: data.data?._id || `temp-${Date.now()}`,
            authorName: payload.authorName,
            title: payload.title,
            category: payload.category,
            content: payload.content,
            createdAt: new Date().toISOString(),
            likeCount: 0,
            commentCount: 0,
            likedByMe: false,
            _pending: true // flag for pending styling
          };
          const grid = document.getElementById('communityGrid');
          const emptyMsg = document.getElementById('communityEmptyMsg');
          emptyMsg.classList.add('hidden');
          // Prepend (newest first)
          const card = buildThoughtCard(optimisticThought);
          grid.insertBefore(card, grid.firstChild);
        } else {
          showToast(data.message || 'Submission failed.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // COMMUNITY THOUGHTS — Load, build card, like, comment
    // ================================================================
    const categoryColors = {
      Philosophy: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
      Gita: 'bg-saffron-500/15 text-saffron-400 border-saffron-500/30',
      History: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      General: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    };

    // Pagination state for community thoughts
    let _thoughtsPage = 1;
    const _thoughtsLimit = 6;
    let _thoughtsLoading = false;

    async function loadCommunityThoughts(reset = true) {
      if (_thoughtsLoading) return;
      _thoughtsLoading = true;

      const grid = document.getElementById('communityGrid');
      const emptyMsg = document.getElementById('communityEmptyMsg');
      const loadingMsg = document.getElementById('communityLoadingMsg');
      const loadMoreBtn = document.getElementById('loadMoreThoughtsBtn');

      if (reset) {
        _thoughtsPage = 1;
        grid.innerHTML = '';
        emptyMsg.classList.add('hidden');
        loadMoreBtn.classList.add('hidden');
      }

      loadingMsg.classList.remove('hidden');

      try {
        const token = getToken();
        const res = await fetch(`/api/thoughts/approved?page=${_thoughtsPage}&limit=${_thoughtsLimit}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        loadingMsg.classList.add('hidden');

        if (!data.success) {
          if (reset) {
            emptyMsg.textContent = 'Could not load thoughts. Please refresh the page.';
            emptyMsg.classList.remove('hidden');
          }
          return;
        }

        if (reset && data.count === 0) {
          emptyMsg.classList.remove('hidden');
          loadMoreBtn.classList.add('hidden');
          return;
        }

        data.data.forEach(t => grid.appendChild(buildThoughtCard(t)));

        if (data.hasMore) {
          _thoughtsPage += 1;
          loadMoreBtn.classList.remove('hidden');
        } else {
          loadMoreBtn.classList.add('hidden');
        }
      } catch (err) {
        // Don't leave "Loading…" stuck — show error state cleanly
        loadingMsg.classList.add('hidden');
        if (reset) {
          emptyMsg.textContent = 'Could not load thoughts. Please refresh the page.';
          emptyMsg.classList.remove('hidden');
        }
      } finally {
        _thoughtsLoading = false;
      }
    }

    // Wire Load More button
    document.getElementById('loadMoreThoughtsBtn').addEventListener('click', () => {
      loadCommunityThoughts(false);
    });

    /**
     * buildThoughtCard — builds a community thought card element.
     * Conditional likes/comments: count badges are hidden when value is 0.
     */
    function buildThoughtCard(t) {
      const card = document.createElement('div');
      card.className = 'glass-card card-hover rounded-2xl p-6 flex flex-col fade-in';
      card.dataset.id = t._id;

      const badgeClass = categoryColors[t.category] || categoryColors.General;

      // Pending badge for optimistically inserted thoughts
      const pendingBadge = t._pending
        ? `<span class="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-gray-500/20 text-gray-400 border border-gray-500/20">Pending Review</span>`
        : '';

      // ── Conditional count display ──
      const likeCountClass = t.likeCount > 0 ? '' : 'count-zero';
      const commentCountClass = t.commentCount > 0 ? '' : 'count-zero';

      card.innerHTML = `
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-3 py-1 rounded-full text-xs border ${badgeClass} font-medium">${escapeHtml(t.category)}</span>
        ${pendingBadge}
      </div>
      <span class="text-xs text-gray-500 shrink-0 ml-2">${timeAgo(t.createdAt)}</span>
    </div>
    <h3 class="font-serif text-base font-bold text-gray-100 mb-2.5 leading-snug">${escapeHtml(t.title)}</h3>
    <p class="text-gray-400 text-sm leading-relaxed mb-4 flex-1">
      ${escapeHtml(t.content.substring(0, 200))}${t.content.length > 200 ? '…' : ''}
    </p>
    <p class="text-xs text-gold-400/80 mb-4">✍️ ${escapeHtml(t.authorName)}</p>
    <div class="flex items-center gap-5 pt-4 border-t border-gold-500/10">
      <button class="like-btn flex items-center gap-1.5 text-sm transition-colors ${t.likedByMe ? 'text-red-400' : 'text-gray-400 hover:text-red-400'}" data-id="${t._id}">
        <span class="like-icon">${t.likedByMe ? '❤️' : '🤍'}</span>
        <span class="like-count-badge text-xs ${likeCountClass}">${t.likeCount}</span>
      </button>
      <button class="comment-btn flex items-center gap-1.5 text-sm text-gray-400 hover:text-gold-400 transition-colors" data-id="${t._id}" data-title="${escapeHtml(t.title)}">
        <span>💬</span>
        <span class="comment-count-label text-xs ${commentCountClass}">${t.commentCount}</span>
      </button>
      <button class="save-thought-btn ml-auto flex items-center text-sm transition-colors ${t.savedByMe ? 'text-gold-400' : 'text-gray-400 hover:text-gold-400'}" data-id="${t._id}" title="Save">
        <span class="save-thought-icon">${t.savedByMe ? '🔖' : '📑'}</span>
      </button>
    </div>
  `;

      card.querySelector('.like-btn').addEventListener('click', () => handleLike(t._id, card));
      card.querySelector('.comment-btn').addEventListener('click', () => openCommentsModal(t._id, t.title));
      card.querySelector('.save-thought-btn').addEventListener('click', () => handleSaveThought(t._id, card));

      return card;
    }

    // ── Toggle save/bookmark on a thought ──
    async function handleSaveThought(thoughtId, cardEl) {
      const token = getToken();
      if (!token) {
        showToast('Please log in to save a thought.', 'error');
        openAuthModal('login');
        return;
      }

      const saveBtn = cardEl.querySelector('.save-thought-btn');
      saveBtn.disabled = true;
      try {
        const res = await fetch(`/api/thoughts/${thoughtId}/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) { handleAuthExpiry(); return; }

        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
          // Response wasn't JSON (e.g. route missing or an unexpected server error page)
          showToast('Something went wrong saving this. Please try again.', 'error');
          return;
        }

        if (res.ok && data.success) {
          const iconEl = saveBtn.querySelector('.save-thought-icon');
          if (data.saved) {
            saveBtn.classList.replace('text-gray-400', 'text-gold-400');
            saveBtn.classList.remove('hover:text-gold-400');
            iconEl.textContent = '🔖';
            showToast('Saved to your profile.', 'success');
          } else {
            saveBtn.classList.replace('text-gold-400', 'text-gray-400');
            saveBtn.classList.add('hover:text-gold-400');
            iconEl.textContent = '📑';
          }
        } else {
          showToast(data.message || 'Failed to save.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    }

    // ── Toggle like on a thought ──
    async function handleLike(thoughtId, cardEl) {
      const token = getToken();
      if (!token) {
        showToast('Please log in to like a thought.', 'error');
        openAuthModal('login');
        return;
      }

      const likeBtn = cardEl.querySelector('.like-btn');
      likeBtn.disabled = true;

      try {
        const res = await fetch(`/api/thoughts/${thoughtId}/like`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.status === 401) { handleAuthExpiry(); return; }

        if (data.success) {
          const iconEl = likeBtn.querySelector('.like-icon');
          const countEl = likeBtn.querySelector('.like-count-badge');

          // Toggle color & icon
          if (data.liked) {
            likeBtn.classList.replace('text-gray-400', 'text-red-400');
            likeBtn.classList.remove('hover:text-red-400');
            iconEl.textContent = '❤️';
            // Pulse animation
            iconEl.classList.remove('like-pulse');
            void iconEl.offsetWidth;
            iconEl.classList.add('like-pulse');
          } else {
            likeBtn.classList.replace('text-red-400', 'text-gray-400');
            likeBtn.classList.add('hover:text-red-400');
            iconEl.textContent = '🤍';
          }

          // Update count — hide if zero
          countEl.textContent = data.likeCount;
          countEl.classList.toggle('count-zero', data.likeCount === 0);
        } else {
          showToast(data.message || 'Failed to update like.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        likeBtn.disabled = false;
      }
    }

    // ================================================================
    // COMMENTS MODAL
    // ================================================================
    const commentsModal = document.getElementById('commentsModal');
    let activeThoughtId = null;

    function openCommentsModal(thoughtId, title) {
      activeThoughtId = thoughtId;
      document.getElementById('commentsModalTitle').textContent = title;
      commentsModal.classList.remove('hidden');
      loadComments(thoughtId);

      const token = getToken();
      document.getElementById('addCommentForm').classList.toggle('hidden', !token);
      document.getElementById('commentLoginPrompt').classList.toggle('hidden', !!token);
    }
    function closeCommentsModal() {
      commentsModal.classList.add('hidden');
      activeThoughtId = null;
      document.getElementById('commentInput').value = '';
    }

    document.getElementById('closeCommentsModal').addEventListener('click', closeCommentsModal);
    commentsModal.addEventListener('click', e => { if (e.target === commentsModal) closeCommentsModal(); });
    document.getElementById('commentLoginLink').addEventListener('click', (e) => {
      e.preventDefault();
      closeCommentsModal();
      openAuthModal('login');
    });

    async function loadComments(thoughtId) {
      const list = document.getElementById('commentsList');
      const emptyMsg = document.getElementById('commentsEmptyMsg');
      list.innerHTML = '<p class="text-center text-gray-500 text-sm py-6">Loading comments…</p>';
      emptyMsg.classList.add('hidden');

      try {
        const res = await fetch(`/api/thoughts/${thoughtId}/comments`);
        const data = await res.json();
        list.innerHTML = '';

        document.getElementById('commentsModalCount').textContent =
          `${data.count} comment${data.count === 1 ? '' : 's'}`;

        if (!data.success || data.count === 0) {
          emptyMsg.classList.remove('hidden');
          return;
        }

        data.data.forEach(c => {
          const item = document.createElement('div');
          item.className = 'flex gap-3 fade-in';
          item.innerHTML = `
        <span class="w-9 h-9 rounded-full bg-gold-500/15 border border-gold-500/25 flex items-center justify-center text-gold-400 font-serif font-bold text-xs shrink-0">
          ${getInitials(c.userName)}
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <p class="text-sm font-medium text-gray-100">${escapeHtml(c.userName)}</p>
            <p class="text-xs text-gray-500">${timeAgo(c.createdAt)}</p>
          </div>
          <p class="text-sm text-gray-300 leading-relaxed">${escapeHtml(c.text)}</p>
        </div>
      `;
          list.appendChild(item);
        });
      } catch {
        list.innerHTML = '<p class="text-center text-red-400 text-sm py-6">Failed to load comments.</p>';
      }
    }

    document.getElementById('addCommentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token || !activeThoughtId) return;

      const input = document.getElementById('commentInput');
      const text = input.value.trim();
      if (!text) {
        showToast('Comment cannot be empty.', 'error');
        return;
      }

      const btn = document.getElementById('commentSubmitBtn');
      btn.disabled = true;

      try {
        const res = await fetch(`/api/thoughts/${activeThoughtId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text })
        });
        const data = await res.json();

        if (res.status === 401) { handleAuthExpiry(); closeCommentsModal(); return; }

        if (data.success) {
          input.value = '';
          loadComments(activeThoughtId);

          // Update comment count badge on the thought card
          const countEl = document.querySelector(`.comment-btn[data-id="${activeThoughtId}"] .comment-count-label`);
          if (countEl) {
            countEl.textContent = data.commentCount;
            countEl.classList.toggle('count-zero', data.commentCount === 0);
          }
        } else {
          showToast(data.message || 'Failed to post comment.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // ================================================================
    // FEED — Photos (दिव्य चित्र) & Reels (ज्ञान प्रवाह)
    // ================================================================
    let feedPage = 1;
    const FEED_LIMIT = 6;
    let feedHasMore = true;
    let feedLoading = false;
    let feedObserver = null;
    let feedFilterType = 'all'; // all | photo | reel
    let currentFeedPosts = []; // all posts currently loaded in the feed — used for lightbox prev/next
    let feedSearchTerm = '';

    async function loadFeed(reset = false) {
      if (feedLoading) return;
      feedLoading = true;

      if (reset) {
        feedPage = 1;
        feedHasMore = true;
        document.getElementById('feedList').innerHTML = '';
      }

      const loadingMsg = document.getElementById('feedLoadingMsg');
      const emptyMsg = document.getElementById('feedEmptyMsg');
      const loadMoreBtn = document.getElementById('loadMorePostsBtn');

      loadingMsg.classList.remove('hidden');
      emptyMsg.classList.add('hidden');

      try {
        const token = getToken();
        const params = new URLSearchParams({ page: feedPage, limit: FEED_LIMIT });
        if (feedFilterType !== 'all') params.set('type', feedFilterType);
        if (feedSearchTerm.trim()) params.set('search', feedSearchTerm.trim());

        const res = await fetch(`/api/posts?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        loadingMsg.classList.add('hidden');

        if (!data.success) {
          emptyMsg.textContent = 'Could not load feed. Please refresh.';
          emptyMsg.classList.remove('hidden');
          return;
        }

        if (feedPage === 1 && data.count === 0) {
          emptyMsg.textContent = 'No posts match your search.';
          emptyMsg.classList.remove('hidden');
          loadMoreBtn.classList.add('hidden');
          return;
        }

        const list = document.getElementById('feedList');
        data.data.forEach(p => list.appendChild(buildPostCard(p)));
        currentFeedPosts = reset ? data.data : currentFeedPosts.concat(data.data);

        feedHasMore = data.hasMore;
        loadMoreBtn.classList.toggle('hidden', !feedHasMore);
        feedPage += 1;
      } catch {
        // BUG FIX: clear spinner, show error text
        document.getElementById('feedLoadingMsg').classList.add('hidden');
        document.getElementById('feedEmptyMsg').textContent = 'Could not load feed. Please refresh.';
        document.getElementById('feedEmptyMsg').classList.remove('hidden');
      } finally {
        feedLoading = false;
      }
    }

    document.getElementById('loadMorePostsBtn').addEventListener('click', () => loadFeed(false));
    document.getElementById('feedLoginLink').addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('login');
    });

    // Feed filter tabs (All / Photos / Reels)
    document.querySelectorAll('.feed-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.feed-filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        feedFilterType = btn.dataset.filter;
        loadFeed(true);
      });
    });

    // Feed search (debounced)
    let feedSearchDebounce = null;
    document.getElementById('feedSearchInput').addEventListener('input', (e) => {
      feedSearchTerm = e.target.value;
      clearTimeout(feedSearchDebounce);
      feedSearchDebounce = setTimeout(() => loadFeed(true), 400);
    });

    // ================================================================
    // EXPLORE TAB (Instagram Explore-style top-content grid)
    // ================================================================
    let exploreLoaded = false;
    let exploreList = [];

    document.getElementById('feedTopTabBtn').addEventListener('click', () => {
      document.getElementById('feedTopTabBtn').classList.add('active', 'text-gold-400', 'border-gold-500');
      document.getElementById('feedTopTabBtn').classList.remove('text-gray-400', 'border-transparent');
      document.getElementById('exploreTopTabBtn').classList.remove('active', 'text-gold-400', 'border-gold-500');
      document.getElementById('exploreTopTabBtn').classList.add('text-gray-400', 'border-transparent');
      document.getElementById('feedTabContent').classList.remove('hidden');
      document.getElementById('exploreTabContent').classList.add('hidden');
    });

    document.getElementById('exploreTopTabBtn').addEventListener('click', () => {
      document.getElementById('exploreTopTabBtn').classList.add('active', 'text-gold-400', 'border-gold-500');
      document.getElementById('exploreTopTabBtn').classList.remove('text-gray-400', 'border-transparent');
      document.getElementById('feedTopTabBtn').classList.remove('active', 'text-gold-400', 'border-gold-500');
      document.getElementById('feedTopTabBtn').classList.add('text-gray-400', 'border-transparent');
      document.getElementById('exploreTabContent').classList.remove('hidden');
      document.getElementById('feedTabContent').classList.add('hidden');
      if (!exploreLoaded) loadExplore();
    });

    async function loadExplore() {
      const loading = document.getElementById('exploreLoadingMsg');
      const empty = document.getElementById('exploreEmptyMsg');
      const grid = document.getElementById('exploreGrid');
      loading.classList.remove('hidden');
      empty.classList.add('hidden');
      grid.innerHTML = '';

      try {
        const token = getToken();
        const res = await fetch('/api/posts/most-liked?limit=24', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        loading.classList.add('hidden');

        if (!data.success) {
          empty.textContent = 'Could not load Explore. Please refresh.';
          empty.classList.remove('hidden');
          return;
        }

        // Merge photos + reels, rank by a score that favors both high engagement
        // and content from accounts the user follows (matches the daily-rec ranking logic)
        exploreList = [...(data.photos || []), ...(data.reels || [])]
          .sort((a, b) => {
            const scoreA = (a.likeCount || 0) + (a.followedByMe ? 1000 : 0);
            const scoreB = (b.likeCount || 0) + (b.followedByMe ? 1000 : 0);
            return scoreB - scoreA;
          });

        exploreLoaded = true;

        if (exploreList.length === 0) {
          empty.classList.remove('hidden');
          return;
        }

        exploreList.forEach(p => grid.appendChild(buildExploreItem(p)));
      } catch {
        loading.classList.add('hidden');
        empty.textContent = 'Could not load Explore. Please refresh.';
        empty.classList.remove('hidden');
      }
    }

    function buildExploreItem(p) {
      const el = document.createElement('div');
      el.className = 'ig-explore-item';

      el.innerHTML = p.mediaType === 'reel'
        ? `<video src="${p.mediaUrl}" preload="metadata" muted playsinline></video>
       <span class="ig-explore-badge">🎬</span>`
        : `<img src="${p.mediaUrl}" loading="lazy" alt="" onerror="mediaFallback(this)" />`;

      if (p.followedByMe) {
        const followBadge = document.createElement('span');
        followBadge.className = 'ig-explore-following-badge';
        followBadge.textContent = 'Following';
        el.appendChild(followBadge);
      }

      const overlay = document.createElement('div');
      overlay.className = 'ig-explore-overlay';
      overlay.innerHTML = `<span>❤️ ${p.likeCount || 0}</span>`;
      el.appendChild(overlay);

      el.addEventListener('click', () => openPostDetail(p, p.author, exploreList));
      return el;
    }

    // IntersectionObserver for autoplay/pause video reels
    function getFeedObserver() {
      if (feedObserver) return feedObserver;
      feedObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const video = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            video.play().catch(() => { });
          } else {
            video.pause();
          }
        });
      }, { threshold: [0, 0.6, 1] });
      return feedObserver;
    }

    /**
     * buildPostCard — builds a feed post card.
     * Labels reel as ज्ञान प्रवाह, photo as दिव्य चित्र.
     * Conditional like/comment badges (hidden when 0).
     * Clickable author avatar/name → opens public profile.
     */
function buildPostCard(p) {
  const card = document.createElement('div');
  card.className = 'feed-grid-card feed-card';
  card.dataset.id = p._id;

  const mediaHtml = p.mediaType === 'reel'
    ? `<video src="${p.mediaUrl}" playsinline preload="metadata"></video>`
    : `<img src="${p.mediaUrl}" loading="lazy" alt="Post" onerror="mediaFallback(this)" />`;

  const heartSvg = `<svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" style="display:inline-block; vertical-align:middle;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  const bookmarkSvg = `<svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

  const myUser = getStoredUser();
  const isOwnPost = myUser && p.author && p.author.id === myUser.id;

  card.innerHTML = `
    <div class="feed-grid-media" style="position: relative;">
      ${mediaHtml}
      
      <!-- Top-Right: Highly Visible Save/Bookmark Button -->
      <button class="fg-top-save-btn ig-bookmark-btn ${p.savedByMe ? 'saved' : ''}" data-id="${p._id}" title="Save" style="position: absolute; top: 10px; right: 10px; z-index: 20; background: rgba(18, 13, 8, 0.85); border: 1px solid rgba(212, 164, 55, 0.5); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; color: #d4a437; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        ${bookmarkSvg}
      </button>
    </div>

    <!-- Bottom Footer Row: Left Side (User & Follow) | Right Side (Like, Comment, Share) -->
    <div class="feed-grid-footer" style="padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(18, 13, 8, 0.95);">
      
      <!-- Left: Avatar, Name & Follow -->
      <div class="feed-grid-footer-left" style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
        <button class="post-author-avatar w-7 h-7 rounded-full flex items-center justify-center font-serif font-bold text-dark-900 text-xs bg-cover bg-center shrink-0 ring-1 ring-gold-500/30" data-userid="${p.author.id}"></button>
        <button class="post-author-name text-xs font-semibold text-gray-100 hover:text-gold-400 transition-colors truncate text-left" data-userid="${p.author.id}">${escapeHtml(p.author.name)}</button>
        ${!isOwnPost ? `<button class="fg-follow-btn ${p.followedByMe ? 'following' : ''}" data-userid="${p.author.id}" style="font-size: 0.65rem; padding: 2px 8px;">${p.followedByMe ? 'Following' : 'Follow'}</button>` : ''}
      </div>

      <!-- Right: Like, Comment, Share Buttons -->
      <div class="feed-grid-footer-right" style="display: flex; align-items: center; gap: 10px; shrink-0;">
        <button class="ig-action-btn post-like-btn ${p.likedByMe ? 'liked' : ''}" data-id="${p._id}" title="Like" style="font-size: 0.8rem; display: flex; align-items: center; gap: 3px;">
          ${heartSvg} <span class="post-like-count${!p.likeCount ? ' count-zero' : ''}">${p.likeCount || 0}</span>
        </button>
        <button class="ig-action-btn post-comment-btn" title="Comment" style="font-size: 0.8rem; display: flex; align-items: center; gap: 3px;">
          💬 <span>${p.commentCount || 0}</span>
        </button>
        <button type="button" class="fg-share-btn ig-action-btn" title="Share" style="font-size: 0.85rem;">
          ↗️
        </button>
      </div>

    </div>
  `;

  // Render Author Avatar
  const avatarEl = card.querySelector('.post-author-avatar');
  renderAvatarInto(avatarEl, { name: p.author.name, avatarColor: p.author.avatarColor, profilePicture: p.author.profilePicture });
  avatarEl.addEventListener('click', (e) => { e.stopPropagation(); openPublicProfile(p.author.id); });
  card.querySelector('.post-author-name').addEventListener('click', (e) => { e.stopPropagation(); openPublicProfile(p.author.id); });

  // Follow Button Event
  const followBtn = card.querySelector('.fg-follow-btn');
  if (followBtn) {
    followBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const token = getToken();
      if (!token) { openAuthModal('login'); return; }
      followBtn.disabled = true;
      try {
        const res = await fetch(`/api/users/${p.author.id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
          followBtn.textContent = data.following ? 'Following' : 'Follow';
          followBtn.classList.toggle('following', data.following);
        }
      } catch { showToast('Error updating follow status', 'error'); }
      finally { followBtn.disabled = false; }
    });
  }

  // Like & Save Actions
  const likeBtn = card.querySelector('.post-like-btn');
  likeBtn.addEventListener('click', (e) => { e.stopPropagation(); igHandlePostLike(p._id, card, p); });

  const bookmarkBtn = card.querySelector('.ig-bookmark-btn');
  bookmarkBtn.addEventListener('click', (e) => { e.stopPropagation(); igHandlePostSave(p._id, card); });

  // Share Action
  card.querySelector('.fg-share-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#feed?post=${p._id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('Post link copied!', 'success'));
    }
  });

  // Modal Lightbox Open
  card.addEventListener('click', () => openPostDetail(p, null, currentFeedPosts));

  // Video Hover Play With Sound
  const videoEl = card.querySelector('video');
  if (videoEl) {
    card.addEventListener('mouseenter', () => {
      videoEl.muted = false;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        });
      }
    });

    card.addEventListener('mouseleave', () => {
      videoEl.pause();
      videoEl.currentTime = 0;
    });
  }

  return card;

}
     

    async function igHandlePostLike(postId, cardEl, postData) {
      const token = getToken();
      if (!token) { showToast('Please log in to like.', 'error'); openAuthModal('login'); return; }

      const btn = cardEl.querySelector('.post-like-btn');
      btn.disabled = true;
      try {
        const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.status === 401) { handleAuthExpiry(); return; }
        if (data.success) {
          // Immediate UI state: heart fill color is driven by the .liked class
          // via CSS (.ig-action-btn.liked svg.heart-icon)
          btn.classList.toggle('liked', data.liked);

          // Update the like count, hiding the badge entirely at zero
          const countEl = btn.querySelector('.post-like-count');
          if (countEl) {
            countEl.textContent = data.likeCount;
            countEl.classList.toggle('count-zero', data.likeCount === 0);
          }

          // Pulse animation on the heart icon when liking (not on unlike)
          if (data.liked) {
            const heartIcon = btn.querySelector('.heart-icon');
            if (heartIcon) {
              heartIcon.classList.remove('like-pulse');
              void heartIcon.offsetWidth; // force reflow so the animation restarts every click
              heartIcon.classList.add('like-pulse');
            }
          }
        } else {
          showToast(data.message || 'Failed to update like.', 'error');
        }
      } catch { showToast('Network error.', 'error'); }
      finally { btn.disabled = false; }
    }

    // Legacy wrapper kept for post detail modal compatibility
    async function handlePostLike(postId, cardEl) {
      await igHandlePostLike(postId, cardEl, {});
    }

    async function igHandlePostSave(postId, cardEl) {
      const token = getToken();
      if (!token) { showToast('Please log in to save.', 'error'); openAuthModal('login'); return; }

      const btn = cardEl.querySelector('.ig-bookmark-btn');
      btn.disabled = true;
      try {
        const res = await fetch(`/api/posts/${postId}/save`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.status === 401) { handleAuthExpiry(); return; }
        if (data.success) {
          btn.classList.toggle('saved', data.saved);
          showToast(data.saved ? 'Saved to your profile.' : 'Removed from saved.', 'success');
        } else {
          showToast(data.message || 'Failed to save.', 'error');
        }
      } catch { showToast('Network error.', 'error'); }
      finally { btn.disabled = false; }
    }

    // POST DETAIL MODAL (lightbox) — with prev/next navigation
    // ================================================================
    const postDetailModal = document.getElementById('postDetailModal');
    let activePostDetail = null;
    let pdList = [];   // full list of posts being browsed (feed page or profile grid)
    let pdIndex = -1;   // current position within pdList
    let pdAuthorOverride = null; // fixed author (profile grid posts don't embed author per-post)

    function openPostDetail(post, authorOverride, list) {
      // Prefer an explicit override; otherwise fall back to whichever profile is
      // currently open (profile grid items don't always embed the full author object)
      pdAuthorOverride = authorOverride || currentProfileAuthorInfo || null;
      pdList = (list && list.length) ? list : [post];
      pdIndex = pdList.findIndex(x => x._id === post._id);
      if (pdIndex === -1) pdIndex = 0;

      document.body.style.overflow = 'hidden';
      postDetailModal.classList.remove('hidden');
      renderPostDetailAtIndex();
    }

    function renderPostDetailAtIndex() {
      const post = pdList[pdIndex];
      if (!post) return;

      // Safe fallback chain: embedded author -> explicit override -> whichever
      // profile is currently open -> empty object (never undefined, so nothing downstream throws)
      const author = post.author || pdAuthorOverride || currentProfileAuthorInfo || {};
      activePostDetail = { ...post, author };

      document.getElementById('pdMediaWrap').innerHTML = post.mediaType === 'reel'
        ? `<video src="${post.mediaUrl}" class="max-w-full max-h-full object-contain" controls loop playsinline></video>`
        : `<img src="${post.mediaUrl}" class="max-w-full max-h-full object-contain" alt="Post" onerror="mediaFallback(this)" />`;

      document.getElementById('pdAuthorName').textContent = author.name || 'Unknown User';
      document.getElementById('pdPostTime').textContent = post.createdAt ? timeAgoFeed(post.createdAt) : '';
      renderAvatarInto(document.getElementById('pdAuthorAvatar'), {
        name: author.name, avatarColor: author.avatarColor, profilePicture: author.profilePicture
      });

      const captionEl = document.getElementById('pdCaption');
      captionEl.textContent = post.caption || '';
      captionEl.classList.toggle('hidden', !post.caption);

      const likeBtn = document.getElementById('pdLikeBtn');
      document.getElementById('pdLikeIcon').textContent = post.likedByMe ? '❤️' : '🤍';
      document.getElementById('pdLikeCount').textContent = post.likeCount || 0;
      likeBtn.classList.toggle('text-red-400', !!post.likedByMe);
      likeBtn.classList.toggle('text-gray-400', !post.likedByMe);

      document.getElementById('pdCommentCount').textContent = post.commentCount || 0;

      const goToAuthor = () => { if (author.id) { closePostDetail(); openPublicProfile(author.id); } };
      document.getElementById('pdAuthorName').onclick = goToAuthor;

      setupPdMenuAndFollow(post, author);

      const token = getToken();
      document.getElementById('pdAddCommentForm').classList.toggle('hidden', !token);
      document.getElementById('pdCommentLoginPrompt').classList.toggle('hidden', !!token);

      // Prev/Next arrows — hidden at list boundaries or when there's only one post
      document.getElementById('pdPrevBtn').classList.toggle('hidden', pdIndex <= 0);
      document.getElementById('pdNextBtn').classList.toggle('hidden', pdIndex >= pdList.length - 1);

      loadPostDetailComments(post._id);
      // Modal khulne par video auto-play karein
const pdVideo = document.querySelector('#pdMediaWrap video');
if (pdVideo) {
  pdVideo.muted = false;
  pdVideo.play().catch(err => {
    pdVideo.muted = true;
    pdVideo.play().catch(() => {});
  });
}
    }

    function showPrevPost() { if (pdIndex > 0) { pdIndex--; renderPostDetailAtIndex(); } }
    function showNextPost() { if (pdIndex < pdList.length - 1) { pdIndex++; renderPostDetailAtIndex(); } }

    document.getElementById('pdPrevBtn').addEventListener('click', showPrevPost);
    document.getElementById('pdNextBtn').addEventListener('click', showNextPost);

    // Keyboard arrows while lightbox is open
    document.addEventListener('keydown', (e) => {
      if (postDetailModal.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') showPrevPost();
      if (e.key === 'ArrowRight') showNextPost();
      if (e.key === 'Escape') closePostDetail();
    });

    function closePostDetail() {
      postDetailModal.classList.add('hidden');
      document.getElementById('pdMediaWrap').innerHTML = '';
      document.getElementById('pdCommentInput').value = '';
      document.getElementById('pdMenuDropdown').classList.add('hidden');
      document.getElementById('pdMenuDropdown').innerHTML = '';
      activePostDetail = null;
      pdList = [];
      pdIndex = -1;
      // Only unlock background scroll if the full-page profile isn't open underneath
      if (document.getElementById('publicProfileModal').classList.contains('hidden')) {
        document.body.style.overflow = '';
      }
    }

    document.getElementById('closePostDetail').addEventListener('click', closePostDetail);
    postDetailModal.addEventListener('click', e => { if (e.target === postDetailModal) closePostDetail(); });
    document.getElementById('pdCommentLoginLink').addEventListener('click', (e) => {
      e.preventDefault();
      closePostDetail();
      openAuthModal('login');
    });

    document.getElementById('pdLikeBtn').addEventListener('click', async () => {
      if (!activePostDetail) return;
      const token = getToken();
      if (!token) { showToast('Please log in to like a post.', 'error'); openAuthModal('login'); return; }

      try {
        const res = await fetch(`/api/posts/${activePostDetail._id}/like`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.status === 401) { handleAuthExpiry(); return; }
        if (!data.success) return;

        activePostDetail.likedByMe = data.liked;
        activePostDetail.likeCount = data.likeCount;
        document.getElementById('pdLikeIcon').textContent = data.liked ? '❤️' : '🤍';
        document.getElementById('pdLikeCount').textContent = data.likeCount;
        document.getElementById('pdLikeBtn').classList.toggle('text-red-400', data.liked);
        document.getElementById('pdLikeBtn').classList.toggle('text-gray-400', !data.liked);

        // Keep the underlying feed card (if visible) in sync
        const cardBtn = document.querySelector(`.post-like-btn[data-id="${activePostDetail._id}"]`);
        if (cardBtn) {
          cardBtn.classList.toggle('liked', data.liked); // drives the SVG heart fill color via CSS

          const cardCountEl = cardBtn.querySelector('.post-like-count');
          if (cardCountEl) {
            cardCountEl.textContent = data.likeCount;
            cardCountEl.classList.toggle('count-zero', data.likeCount === 0);
          }

          if (data.liked) {
            const cardHeartIcon = cardBtn.querySelector('.heart-icon');
            if (cardHeartIcon) {
              cardHeartIcon.classList.remove('like-pulse');
              void cardHeartIcon.offsetWidth;
              cardHeartIcon.classList.add('like-pulse');
            }
          }
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      }
    });

    // ================================================================
    // POST DETAIL — 3-dot menu (Edit/Delete own post, Report others'), Follow/Unfollow
    // ================================================================
    document.getElementById('pdMenuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('pdMenuDropdown').classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('pdMenuDropdown');
      if (!dropdown.classList.contains('hidden') && !e.target.closest('#pdMenuDropdown, #pdMenuBtn')) {
        dropdown.classList.add('hidden');
      }
    });
    document.getElementById('pdMenuDropdown').addEventListener('click', (e) => {
      const btn = e.target.closest('.pd-menu-item');
      if (!btn || !activePostDetail) return;
      document.getElementById('pdMenuDropdown').classList.add('hidden');

      const action = btn.dataset.action;
      if (action === 'delete') deleteActivePostDetail();
      else if (action === 'edit') startEditCaption();
      else if (action === 'report') reportActivePost();
      else if (action === 'share') sharePostDetailLink();
      else if (action === 'save') togglePostDetailSave();
    });

    function setupPdMenuAndFollow(post, author) {
      const myUser = getStoredUser();
      const isOwn = !!(myUser && author?.id === myUser.id);
      const saved = !!(activePostDetail?.savedByMe ?? post.savedByMe);
      const saveItemHtml = `<button type="button" id="pdMenuSaveItem" data-action="save" class="pd-menu-item w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gold-500/10 hover:text-gold-400 transition-colors flex items-center gap-2">🔖 ${saved ? 'Saved' : 'Save Post'}</button>`;
      const shareItemHtml = `<button type="button" data-action="share" class="pd-menu-item w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gold-500/10 hover:text-gold-400 transition-colors flex items-center gap-2">↗️ Share Link</button>`;

      const dropdown = document.getElementById('pdMenuDropdown');
      dropdown.classList.add('hidden');

      if (isOwn) {
        dropdown.innerHTML = `
      <button type="button" data-action="edit" class="pd-menu-item w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gold-500/10 hover:text-gold-400 transition-colors flex items-center gap-2">✏️ Edit Caption</button>
      ${saveItemHtml}
      ${shareItemHtml}
      <button type="button" data-action="delete" class="pd-menu-item w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">🗑️ Delete Post</button>
    `;
      } else if (myUser) {
        dropdown.innerHTML = `
      ${saveItemHtml}
      ${shareItemHtml}
      <button type="button" data-action="report" class="pd-menu-item w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">🚩 Report Post</button>
    `;
      } else {
        dropdown.innerHTML = `
      ${shareItemHtml}
      <p class="px-4 py-2 text-xs text-gray-500 border-t border-gold-500/10 mt-1">Log in for more options.</p>
    `;
      }

      // Follow / Unfollow button — only for other people's posts, when logged in
      const followBtn = document.getElementById('pdFollowBtn');
      if (!isOwn && author?.id && myUser) {
        followBtn.classList.remove('hidden');
        followBtn.disabled = true;
        followBtn.textContent = '…';

        const token = getToken();
        fetch(`/api/users/${author.id}/profile`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then(r => r.json())
          .then(d => {
            followBtn.disabled = false;
            followBtn.textContent = (d.success && d.data.isFollowing) ? 'Following' : 'Follow';
          })
          .catch(() => { followBtn.disabled = false; followBtn.textContent = 'Follow'; });

        followBtn.onclick = async () => {
          const t = getToken();
          if (!t) { openAuthModal('login'); return; }
          followBtn.disabled = true;
          try {
            const r = await fetch(`/api/users/${author.id}/follow`, {
              method: 'POST', headers: { Authorization: `Bearer ${t}` }
            });
            if (r.status === 401) { handleAuthExpiry(); return; }
            const d = await r.json();
            if (d.success) {
              followBtn.textContent = d.following ? 'Following' : 'Follow';
            } else {
              showToast(d.message || 'Could not update follow status.', 'error');
            }
          } catch {
            showToast('Network error. Please try again.', 'error');
          }
          followBtn.disabled = false;
        };
      } else {
        followBtn.classList.add('hidden');
      }
    }

    function sharePostDetailLink() {
      if (!activePostDetail) return;
      const url = `${window.location.origin}${window.location.pathname}#feed?post=${activePostDetail._id}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('Post link copied!', 'success'));
      }
    }

    async function togglePostDetailSave() {
      if (!activePostDetail) return;
      const token = getToken();
      if (!token) { showToast('Please log in to save.', 'error'); openAuthModal('login'); return; }

      try {
        const res = await fetch(`/api/posts/${activePostDetail._id}/save`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) { handleAuthExpiry(); return; }
        const data = await res.json();

        if (data.success) {
          activePostDetail.savedByMe = data.saved;

          // Keep the pdList entry in sync too, so the menu shows the right
          // state if the user reopens this same post from the lightbox nav
          const listEntry = pdList[pdIndex];
          if (listEntry) listEntry.savedByMe = data.saved;

          const saveItem = document.getElementById('pdMenuSaveItem');
          if (saveItem) saveItem.textContent = data.saved ? '🔖 Saved' : '🔖 Save Post';

          showToast(data.saved ? 'Saved to your profile.' : 'Removed from saved.', 'success');

          // Sync the underlying feed card's bookmark button, if it's still on the page
          const postId = activePostDetail._id;
          const feedCardEl = document.querySelector(`.feed-card[data-id="${postId}"], .feed-grid-card[data-id="${postId}"]`);
          if (feedCardEl) {
            const cardSaveBtn = feedCardEl.querySelector('.fg-top-save-btn, .ig-bookmark-btn');
            if (cardSaveBtn) cardSaveBtn.classList.toggle('saved', data.saved);
          }

          // Keep currentFeedPosts (the array backing the main feed) in sync too,
          // so scrolling the feed again or reopening the lightbox reflects the change
          const feedEntry = currentFeedPosts.find(p => p._id === postId);
          if (feedEntry) feedEntry.savedByMe = data.saved;
        } else {
          showToast(data.message || 'Failed to save.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      }
    }

    async function deleteActivePostDetail() {
      if (!activePostDetail) return;
      if (!confirm('Delete this post? This cannot be undone.')) return;

      const deletedId = activePostDetail._id;
      try {
        const token = getToken();
        const res = await fetch(`/api/posts/${deletedId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) { showToast(data.message || 'Could not delete post.', 'error'); return; }

        // Clean up wherever this post is currently visible
        const feedCard = document.querySelector(`.feed-card[data-id="${deletedId}"]`);
        if (feedCard) feedCard.remove();
        currentFeedPosts = currentFeedPosts.filter(p => p._id !== deletedId);
        allProfilePosts = allProfilePosts.filter(p => p._id !== deletedId);

        if (!document.getElementById('publicProfileModal').classList.contains('hidden')) {
          const activeTab = document.querySelector('.pp-tab-btn.active')?.dataset.pptab || 'all';
          renderProfilePosts(activeTab);
        }

        showToast('Post deleted.', 'success');
        closePostDetail();
      } catch {
        showToast('Network error while deleting post.', 'error');
      }
    }

    function startEditCaption() {
      if (!activePostDetail) return;
      const captionEl = document.getElementById('pdCaption');
      const original = activePostDetail.caption || '';

      captionEl.classList.remove('hidden');
      captionEl.innerHTML = `
    <textarea id="pdCaptionEditInput" rows="2" maxlength="500"
      class="w-full bg-dark-700/60 border border-gold-500/25 rounded-xl px-3 py-2 text-sm text-gray-100 glow-input transition resize-none mb-2"></textarea>
    <div class="flex gap-2">
      <button type="button" id="pdCaptionSaveBtn" class="btn-primary px-4 py-1.5 rounded-full text-xs">Save</button>
      <button type="button" id="pdCaptionCancelBtn" class="btn-ghost px-4 py-1.5 rounded-full text-xs">Cancel</button>
    </div>
  `;
      document.getElementById('pdCaptionEditInput').value = original;

      document.getElementById('pdCaptionCancelBtn').addEventListener('click', () => {
        captionEl.textContent = original;
        captionEl.classList.toggle('hidden', !original);
      });

      document.getElementById('pdCaptionSaveBtn').addEventListener('click', async () => {
        const newCaption = document.getElementById('pdCaptionEditInput').value.trim();
        const token = getToken();
        try {
          const res = await fetch(`/api/posts/${activePostDetail._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ caption: newCaption })
          });
          const data = await res.json();
          if (!data.success) { showToast(data.message || 'Could not update caption.', 'error'); return; }

          activePostDetail.caption = data.caption;
          [pdList, currentFeedPosts, allProfilePosts].forEach(arr => {
            const item = arr.find(p => p._id === activePostDetail._id);
            if (item) item.caption = data.caption;
          });

          captionEl.textContent = data.caption;
          captionEl.classList.toggle('hidden', !data.caption);
          showToast('Caption updated.', 'success');
        } catch {
          showToast('Network error while updating caption.', 'error');
        }
      });
    }

    async function reportActivePost() {
      if (!activePostDetail) return;
      const token = getToken();
      if (!token) { openAuthModal('login'); return; }

      const reason = prompt('Why are you reporting this post? (optional)') || '';

      try {
        const res = await fetch(`/api/posts/${activePostDetail._id}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason })
        });
        const data = await res.json();
        showToast(data.message || (data.success ? 'Post reported.' : 'Could not report post.'), data.success ? 'success' : 'error');
      } catch {
        showToast('Network error while reporting post.', 'error');
      }
    }

    async function loadPostDetailComments(postId) {
      const list = document.getElementById('pdCommentsList');
      const empty = document.getElementById('pdCommentsEmpty');
      list.innerHTML = '<p class="text-center text-gray-500 text-sm py-4">Loading comments...</p>';
      empty.classList.add('hidden');

      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        const data = await res.json();
        list.innerHTML = '';

        if (!data.success || data.count === 0) {
          empty.classList.remove('hidden');
          return;
        }
        data.data.forEach(c => list.appendChild(buildPostCommentEl(c)));
      } catch {
        list.innerHTML = '<p class="text-center text-red-400 text-sm py-4">Could not load comments.</p>';
      }
    }

    function buildPostCommentEl(c) {
      const el = document.createElement('div');
      el.className = 'flex gap-3';
      el.innerHTML = `
    <span class="w-8 h-8 rounded-full bg-gold-500/15 border border-gold-500/25 flex items-center justify-center text-gold-400 font-serif font-bold text-xs shrink-0">
      ${getInitials(c.userName)}
    </span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-0.5">
        <p class="text-sm font-medium text-gray-100">${escapeHtml(c.userName)}</p>
        <p class="text-xs text-gray-500">${timeAgo(c.createdAt)}</p>
      </div>
      <p class="text-sm text-gray-300 leading-relaxed break-words">${escapeHtml(c.text)}</p>
    </div>
  `;
      return el;
    }

    document.getElementById('pdAddCommentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activePostDetail) return;

      const token = getToken();
      if (!token) { showToast('Please log in to comment.', 'error'); openAuthModal('login'); return; }

      const textarea = document.getElementById('pdCommentInput');
      const text = textarea.value.trim();
      if (!text) { showToast('Comment cannot be empty.', 'error'); return; }

      try {
        const res = await fetch(`/api/posts/${activePostDetail._id}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (res.status === 401) { handleAuthExpiry(); return; }

        if (data.success) {
          document.getElementById('pdCommentsEmpty').classList.add('hidden');
          const list = document.getElementById('pdCommentsList');
          list.appendChild(buildPostCommentEl(data.data));
          list.scrollTop = list.scrollHeight;
          document.getElementById('pdCommentCount').textContent = data.commentCount;
          activePostDetail.commentCount = data.commentCount;
          textarea.value = '';

          // Keep the underlying feed card (if visible) in sync
          const cardCount = document.querySelector(`.feed-card[data-id="${activePostDetail._id}"] .post-comment-count`);
          if (cardCount) {
            cardCount.textContent = data.commentCount;
            cardCount.classList.remove('count-zero');
          }
        } else {
          showToast(data.message || 'Could not post comment.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      }
    });

    // ================================================================
    // CREATE POST MODAL
    // ================================================================
    const createPostModal = document.getElementById('createPostModal');

    function openCreatePostModal() {
      createPostModal.classList.remove('hidden');
    }
    function closeCreatePostModal() {
      createPostModal.classList.add('hidden');
      document.getElementById('createPostForm').reset();
      document.getElementById('postMediaPreviewWrap').classList.add('hidden');
      document.getElementById('postMediaError').classList.add('hidden');
    }

    document.getElementById('createPostBtn').addEventListener('click', openCreatePostModal);
    document.getElementById('closeCreatePostModal').addEventListener('click', closeCreatePostModal);
    createPostModal.addEventListener('click', e => { if (e.target === createPostModal) closeCreatePostModal(); });

    // ── "Share Post / Video" buttons in #home, #wisdom, #sloka, #community,
    // #thoughts, #join — each checks auth, then opens the create-post modal
    // or the login modal accordingly. Wired generically via a shared class
    // so future sections only need the same class + markup to hook in. ──
    function handleSharePostBtnClick() {
      if (getStoredUser()) {
        openCreatePostModal();
      } else {
        openAuthModal('login');
      }
    }
    document.querySelectorAll('.share-post-section-btn').forEach(btn => {
      btn.addEventListener('click', handleSharePostBtnClick);
    });

    // Media preview + 60s duration check
    document.getElementById('postMediaInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const previewWrap = document.getElementById('postMediaPreviewWrap');
      const imgPreview = document.getElementById('postImagePreview');
      const vidPreview = document.getElementById('postVideoPreview');
      const errorMsg = document.getElementById('postMediaError');
      const submitBtn = document.getElementById('createPostSubmitBtn');

      errorMsg.classList.add('hidden');
      if (!file) { previewWrap.classList.add('hidden'); return; }

      if (file.type.startsWith('image/')) {
        imgPreview.src = URL.createObjectURL(file);
        imgPreview.classList.remove('hidden');
        vidPreview.classList.add('hidden');
        previewWrap.classList.remove('hidden');
        submitBtn.disabled = false;
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        vidPreview.src = url;
        vidPreview.classList.remove('hidden');
        imgPreview.classList.add('hidden');
        previewWrap.classList.remove('hidden');

        vidPreview.addEventListener('loadedmetadata', function check() {
          if (vidPreview.duration > 60) {
            errorMsg.textContent = `⚠️ This video is ${Math.round(vidPreview.duration)}s. Reels must be 60s or shorter.`;
            errorMsg.classList.remove('hidden');
            submitBtn.disabled = true;
          } else {
            submitBtn.disabled = false;
          }
          vidPreview.removeEventListener('loadedmetadata', check);
        });
      }
    });

    document.getElementById('createPostForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token) { openAuthModal('login'); return; }

      const file = document.getElementById('postMediaInput').files[0];
      if (!file) return;

      const btn = document.getElementById('createPostSubmitBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sharing…';

      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: new FormData(e.target)
        });
        const data = await res.json();

        if (res.status === 401) { handleAuthExpiry(); closeCreatePostModal(); return; }

        if (res.ok && data.success) {
          showToast(data.message, 'success');
          closeCreatePostModal();
          loadFeed(true);
        } else {
          showToast(data.message || 'Failed to share post.', 'error');
        }
      } catch {
        showToast('Network error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ================================================================
    // PUBLIC PROFILE MODAL
    // ================================================================
    let currentProfileUserId = null;
    let allProfilePosts = [];
    let profileIsOwn = false;
    let currentProfileAuthorInfo = null; // { id, name, avatarColor, profilePicture } — for post detail lightbox
    let currentProfileFollowers = [];   // cached from the last-loaded profile, used by the follow list modal
    let currentProfileFollowing = [];

    // Safely normalize a raw follower/following entry from the profile API into
    // the { id, name, avatarColor, profilePicture } shape the follow list modal needs —
    // handles populated Mongoose docs (_id vs id), a nested profilePicture object
    // ({ url }) vs a flat string, and drops any null/malformed entries.
    function normalizeFollowListUser(entry) {
      if (!entry) return null;
      const id = entry.id || entry._id;
      if (!id) return null;
      const profilePicture = (entry.profilePicture && typeof entry.profilePicture === 'object')
        ? (entry.profilePicture.url || null)
        : (entry.profilePicture || null);
      return {
        id,
        name: entry.name || 'Unknown User',
        avatarColor: entry.avatarColor || '#d4a437',
        profilePicture
      };
    }

    async function openPublicProfile(userId) {
      const myUser = getStoredUser();
      const isOwnProfile = !!(myUser && myUser.id === userId);
      profileIsOwn = isOwnProfile;   // expose to renderProfilePosts()
      currentProfileUserId = userId;
      const modal = document.getElementById('publicProfileModal');
      modal.classList.remove('hidden');
      modal.scrollTop = 0;
      document.body.style.overflow = 'hidden'; // full-page profile — lock background scroll

      // Reset state
      document.getElementById('ppPostsGrid').innerHTML = '';
      document.getElementById('ppPostsEmpty').classList.add('hidden');
      document.getElementById('ppPostsLoading').classList.remove('hidden');
      document.getElementById('ppName').textContent = '';
      document.getElementById('ppTopBarName').textContent = '';
      document.getElementById('ppFollowerCount').textContent = '0';
      document.getElementById('ppFollowingCount').textContent = '0';
      document.getElementById('ppPostCount').textContent = '0';
      document.getElementById('ppFriendBtn').disabled = false;
      document.getElementById('ppFriendBtn').textContent = 'Add Friend';
      document.getElementById('ppFriendBtn').classList.remove('hidden');
      document.getElementById('ppUnfriendBtn')?.classList.add('hidden');
      document.getElementById('ppMessageBtn').classList.add('hidden');

      // Reset pp-tab-btns
      document.querySelectorAll('.pp-tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
        b.classList.remove('text-gray-300');
      });
      document.getElementById('ppSavedTabBtn').classList.add('hidden');
      document.getElementById('ppSavedSection').classList.add('hidden');
      document.getElementById('ppPostsGrid').classList.remove('hidden');
      document.getElementById('ppMoreSettings').classList.add('hidden');
      document.getElementById('ppMoreSettingsPanel').classList.add('hidden');

      try {
        const token = getToken();
        const res = await fetch(`/api/users/${userId}/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!data.success) { showToast('Could not load profile.', 'error'); closePublicProfile(); return; }

        const u = data.data;
        currentProfileAuthorInfo = {
          id: u.id, name: u.name, avatarColor: u.avatarColor, profilePicture: u.profilePicture
        };
        document.getElementById('ppName').textContent = u.name;
        document.getElementById('ppTopBarName').textContent = u.name;
        document.getElementById('ppFollowerCount').textContent = u.followerCount ?? 0;
        document.getElementById('ppFollowingCount').textContent = u.followingCount ?? 0;
        document.getElementById('ppPostCount').textContent = (u.posts && u.posts.length) || u.postCount || 0;
        currentProfileFollowers = Array.isArray(u.followers)
          ? u.followers.map(normalizeFollowListUser).filter(Boolean)
          : [];
        currentProfileFollowing = Array.isArray(u.following)
          ? u.following.map(normalizeFollowListUser).filter(Boolean)
          : [];
        renderAvatarInto(document.getElementById('ppAvatar'), {
          name: u.name, avatarColor: u.avatarColor, profilePicture: u.profilePicture
        });

        // ── Follow button ──
        const followBtn = document.getElementById('ppFollowBtn');

        if (isOwnProfile) {
          // Own profile: no Follow/Friend/Message actions — just an Edit Profile shortcut
          followBtn.textContent = 'Edit Profile';
          followBtn.onclick = () => { closePublicProfile(); openEditProfileModal(); };
          document.getElementById('ppFriendBtn').classList.add('hidden');
          document.getElementById('ppMessageBtn').classList.add('hidden');
          document.getElementById('ppSavedTabBtn').classList.remove('hidden');
          document.getElementById('ppMoreSettings').classList.remove('hidden');
          document.getElementById('ppMoreAdminPortalBtn').classList.toggle('hidden', u?.isAdmin !== true);
          allProfilePosts = u.posts;
          document.getElementById('ppPostsLoading').classList.add('hidden');
          renderProfilePosts('all');
          return;
        }

        followBtn.textContent = u.isFollowing ? 'Unfollow' : 'Follow';
        followBtn.onclick = async () => {
          const t = getToken();
          if (!t) { openAuthModal('login'); return; }
          const r = await fetch(`/api/users/${userId}/follow`, {
            method: 'POST', headers: { Authorization: `Bearer ${t}` }
          });
          const d = await r.json();
          if (d.success) {
            followBtn.textContent = d.following ? 'Unfollow' : 'Follow';
            document.getElementById('ppFollowerCount').textContent = d.followerCount ?? u.followerCount ?? 0;
          }
        };

        // ── Friend / Message button ──
        const friendBtn = document.getElementById('ppFriendBtn');
        const messageBtn = document.getElementById('ppMessageBtn');

        if (u.friendStatus === 'friends') {
          friendBtn.classList.add('hidden');
          messageBtn.classList.remove('hidden');
          messageBtn.onclick = () => {
            closePublicProfile();
            openChatDrawer();
            openChatThread(userId, u.name, u.avatarColor, u.profilePicture);
          };
        } else if (u.friendStatus === 'pending_sent') {
          friendBtn.textContent = 'Request Sent';
          friendBtn.disabled = true;
        } else if (u.friendStatus === 'pending_received') {
          friendBtn.textContent = 'Respond to Request';
          friendBtn.onclick = () => showFriendRequestToast(userId, u.name);
        } else {
          friendBtn.textContent = 'Add Friend';
          friendBtn.onclick = async () => {
            const t = getToken();
            if (!t) { openAuthModal('login'); return; }
            const r = await fetch(`/api/users/${userId}/friend-request`, {
              method: 'POST', headers: { Authorization: `Bearer ${t}` }
            });
            const d = await r.json();
            showToast(d.message, d.success ? 'success' : 'error');
            if (d.success) { friendBtn.textContent = 'Request Sent'; friendBtn.disabled = true; }
          };
        }

        // ── Posts grid ──
        allProfilePosts = u.posts;
        document.getElementById('ppPostsLoading').classList.add('hidden');
        renderProfilePosts('all');

      } catch {
        document.getElementById('ppPostsLoading').textContent = 'Failed to load profile.';
      }
    }

    function renderProfilePosts(filter) {
      const grid = document.getElementById('ppPostsGrid');
      const empty = document.getElementById('ppPostsEmpty');
      grid.innerHTML = '';

      const posts = filter === 'all'
        ? allProfilePosts
        : allProfilePosts.filter(p => p.mediaType === filter);

      if (posts.length === 0) { empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');

      posts.forEach(p => {
        const el = document.createElement('div');
        el.className = 'relative aspect-square overflow-hidden rounded-lg bg-dark-700 cursor-pointer group';
        el.innerHTML = p.mediaType === 'reel'
          ? `<video src="${p.mediaUrl}" class="w-full h-full object-cover"  preload="metadata"></video>
         <span class="absolute top-1 right-1 text-[10px] bg-black/60 rounded px-1 py-0.5 text-white">🎬</span>`
          : `<img src="${p.mediaUrl}" class="w-full h-full object-cover" loading="lazy" onerror="mediaFallback(this)" />`;

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs font-medium';
        overlay.innerHTML = `<span>❤️ ${p.likeCount}</span><span>💬 ${p.commentCount}</span>`;
        el.appendChild(overlay);

        // Clicking a thumbnail opens the detail lightbox (delete button stops propagation itself)
        el.addEventListener('click', () => openPostDetail(p, currentProfileAuthorInfo, posts));

        // Delete button — owner-only
        if (profileIsOwn) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-400 hover:scale-110 transition-all duration-150 z-10 shadow-lg';
          delBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>`;
          delBtn.title = 'Delete post';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProfilePost(p._id, el);
          });
          el.appendChild(delBtn);
        }

        grid.appendChild(el);
      });
    }

    async function deleteProfilePost(postId, cardEl) {
      if (!confirm('Delete this post? This cannot be undone.')) return;

      try {
        const token = getToken();
        const res = await fetch(`/api/posts/${postId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (!data.success) {
          showToast(data.message || 'Could not delete post.', 'error');
          return;
        }

        allProfilePosts = allProfilePosts.filter(p => p._id !== postId);
        cardEl.remove();

        if (allProfilePosts.length === 0) {
          document.getElementById('ppPostsEmpty').classList.remove('hidden');
        }

        showToast('Post deleted.', 'success');
      } catch (err) {
        console.error('Delete post error:', err);
        showToast('Network error while deleting post.', 'error');
      }
    }

    function closePublicProfile() {
      document.getElementById('publicProfileModal').classList.add('hidden');
      document.body.style.overflow = '';
      currentProfileUserId = null;
      allProfilePosts = [];
    }

    document.getElementById('closePublicProfile').addEventListener('click', closePublicProfile);

    // ================================================================
    // FOLLOWERS / FOLLOWING LIST MODAL
    // ================================================================
    function openFollowListModal(type) {
      // type: 'followers' | 'following'
      const list = type === 'followers' ? currentProfileFollowers : currentProfileFollowing;
      const modal = document.getElementById('followListModal');
      const items = document.getElementById('followListItems');
      const empty = document.getElementById('followListEmpty');

      document.getElementById('followListTitle').textContent = type === 'followers' ? 'Followers' : 'Following';
      empty.textContent = type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
      items.innerHTML = '';

      if (!Array.isArray(list) || list.length === 0) {
        empty.classList.remove('hidden');
      } else {
        empty.classList.add('hidden');
        list.forEach(person => {
          if (!person || !person.id) return; // skip malformed entries rather than throwing

          const row = document.createElement('div');
          row.className = 'follow-list-item';

          const avatar = document.createElement('span');
          avatar.className = 'follow-list-avatar';
          renderAvatarInto(avatar, { name: person.name, avatarColor: person.avatarColor, profilePicture: person.profilePicture });
          avatar.addEventListener('click', () => { closeFollowListModal(); openPublicProfile(person.id); });

          const name = document.createElement('button');
          name.type = 'button';
          name.className = 'follow-list-name';
          name.textContent = person.name || 'Unknown User';
          name.addEventListener('click', () => { closeFollowListModal(); openPublicProfile(person.id); });

          row.appendChild(avatar);
          row.appendChild(name);

          // Editing your own followers/following is only allowed on your own profile
          if (profileIsOwn && getToken()) {
            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'follow-list-action-btn';
            actionBtn.textContent = type === 'followers' ? 'Remove' : 'Unfollow';
            actionBtn.addEventListener('click', async () => {
              actionBtn.disabled = true;
              const ok = type === 'followers'
                ? await removeFollowerApi(person.id)
                : await unfollowApi(person.id);
              if (ok) {
                if (type === 'followers') {
                  currentProfileFollowers = currentProfileFollowers.filter(p => p.id !== person.id);
                  document.getElementById('ppFollowerCount').textContent = currentProfileFollowers.length;
                } else {
                  currentProfileFollowing = currentProfileFollowing.filter(p => p.id !== person.id);
                  document.getElementById('ppFollowingCount').textContent = currentProfileFollowing.length;
                }
                row.remove();
                if ((type === 'followers' ? currentProfileFollowers : currentProfileFollowing).length === 0) {
                  empty.classList.remove('hidden');
                }
              } else {
                actionBtn.disabled = false;
                showToast('Something went wrong. Please try again.', 'error');
              }
            });
            row.appendChild(actionBtn);
          }

          items.appendChild(row);
        });
      }

      modal.classList.remove('hidden');
    }

    function closeFollowListModal() {
      document.getElementById('followListModal').classList.add('hidden');
    }

    async function unfollowApi(targetId) {
      const token = getToken();
      if (!token) return false;
      try {
        const res = await fetch(`/api/users/${targetId}/unfollow`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
        });
        const d = await res.json();
        return d.success === true;
      } catch { return false; }
    }

    async function removeFollowerApi(followerId) {
      const token = getToken();
      if (!token) return false;
      try {
        const res = await fetch(`/api/users/followers/${followerId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
        });
        const d = await res.json();
        return d.success === true;
      } catch { return false; }
    }

    document.getElementById('ppFollowersBtn').addEventListener('click', () => openFollowListModal('followers'));
    document.getElementById('ppFollowingBtn').addEventListener('click', () => openFollowListModal('following'));
    document.getElementById('closeFollowListModal').addEventListener('click', closeFollowListModal);

    // ================================================================
    // PROFILE PHOTO ZOOM VIEWER — Instagram-style full-screen avatar view
    // ================================================================
    function openProfilePhotoZoom(userOrAvatarData) {
      if (!userOrAvatarData) return;

      const img = document.getElementById('profilePhotoZoomImg');
      const initials = document.getElementById('profilePhotoZoomInitials');

      // Handle either a flat URL string or a { url } object, matching the
      // defensive shape-normalization used elsewhere for avatar data
      const raw = userOrAvatarData.profilePicture;
      const profilePicUrl = (raw && typeof raw === 'object') ? (raw.url || null) : (raw || null);

      if (profilePicUrl) {
        img.src = profilePicUrl;
        img.classList.remove('hidden');
        initials.classList.add('hidden');
      } else {
        img.classList.add('hidden');
        img.removeAttribute('src');
        initials.textContent = getInitials(userOrAvatarData.name);
        initials.style.backgroundColor = userOrAvatarData.avatarColor || '#d4a437';
        initials.classList.remove('hidden');
      }

      document.getElementById('profilePhotoZoomModal').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    function closeProfilePhotoZoom() {
      document.getElementById('profilePhotoZoomModal').classList.add('hidden');
      document.getElementById('profilePhotoZoomImg').removeAttribute('src');

      // Only release the scroll lock if no other full-page modal is still open underneath
      const profileOpen = !document.getElementById('publicProfileModal').classList.contains('hidden');
      const postDetailOpen = !document.getElementById('postDetailModal').classList.contains('hidden');
      if (!profileOpen && !postDetailOpen) {
        document.body.style.overflow = '';
      }
    }

    document.getElementById('closeProfilePhotoZoom').addEventListener('click', closeProfilePhotoZoom);
    document.getElementById('profilePhotoZoomModal').addEventListener('click', (e) => {
      if (e.target.id === 'profilePhotoZoomModal') closeProfilePhotoZoom();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('profilePhotoZoomModal').classList.contains('hidden')) {
        closeProfilePhotoZoom();
      }
    });

    // Public Profile avatar — always reflects the profile currently loaded
    document.getElementById('ppAvatar').addEventListener('click', () => {
      if (currentProfileAuthorInfo) openProfilePhotoZoom(currentProfileAuthorInfo);
    });

    // Post Lightbox author avatar
    document.getElementById('pdAuthorAvatar').addEventListener('click', () => {
      if (activePostDetail && activePostDetail.author) openProfilePhotoZoom(activePostDetail.author);
    });

    // Navbar user menu avatar — stop propagation so it doesn't also toggle the dropdown
    document.getElementById('userAvatar').addEventListener('click', (e) => {
      e.stopPropagation();
      const user = getStoredUser();
      if (user) openProfilePhotoZoom(user);
    });

    // Profile tabs
    document.querySelectorAll('.pp-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pp-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.classList.add('text-gray-300');
        });
        btn.classList.add('active');
        btn.classList.remove('text-gray-300');

        if (btn.dataset.pptab === 'saved') {
          document.getElementById('ppPostsGrid').classList.add('hidden');
          document.getElementById('ppPostsEmpty').classList.add('hidden');
          document.getElementById('ppSavedSection').classList.remove('hidden');
          loadSavedItems();
        } else {
          document.getElementById('ppSavedSection').classList.add('hidden');
          document.getElementById('ppPostsGrid').classList.remove('hidden');
          renderProfilePosts(btn.dataset.pptab);
        }
      });
    });

    // ── Saved items (own profile) ──
    async function loadSavedItems() {
      const token = getToken();
      if (!token) return;

      const postsGrid = document.getElementById('ppSavedPostsGrid');
      const thoughtsList = document.getElementById('ppSavedThoughtsList');
      const loading = document.getElementById('ppSavedLoading');
      const empty = document.getElementById('ppSavedEmpty');

      postsGrid.innerHTML = '';
      thoughtsList.innerHTML = '';
      empty.classList.add('hidden');
      loading.classList.remove('hidden');

      try {
        const res = await fetch('/api/users/me/saved', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        loading.classList.add('hidden');
        if (!data.success) { showToast('Could not load saved items.', 'error'); return; }

        const { posts, thoughts } = data.data;

        // Main empty state — only when both subsections are empty
        if (posts.length === 0 && thoughts.length === 0) {
          empty.classList.remove('hidden');
          return;
        }

        // Per-subsection empty states so neither container is left blank
        if (posts.length === 0) {
          postsGrid.innerHTML = '<p class="text-center text-gray-500 text-xs py-6 col-span-3">No saved posts yet.</p>';
        }
        if (thoughts.length === 0) {
          thoughtsList.innerHTML = '<p class="text-center text-gray-500 text-xs py-4">No saved thoughts yet.</p>';
        }

        posts.forEach(p => {
          const el = document.createElement('div');
          el.className = 'relative aspect-square overflow-hidden rounded-lg bg-dark-700 cursor-pointer group';
          el.innerHTML = p.mediaType === 'reel'
            ? `<video src="${p.mediaUrl}" class="w-full h-full object-cover" preload="metadata"></video>
           <span class="absolute top-1 right-1 text-[10px] bg-black/60 rounded px-1 py-0.5 text-white">🎬</span>`
            : `<img src="${p.mediaUrl}" class="w-full h-full object-cover" loading="lazy" onerror="mediaFallback(this)" />`;
          el.addEventListener('click', () => openPostDetail(p, p.author, posts));

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.title = 'Remove from saved';
          removeBtn.className = 'absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-400 transition-all z-10';
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const t = getToken();
            try {
              const r = await fetch(`/api/posts/${p._id}/save`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
              const d = await r.json();
              if (d.success) { el.remove(); checkSavedEmptyState(); }
            } catch { showToast('Network error.', 'error'); }
          });
          el.appendChild(removeBtn);
          postsGrid.appendChild(el);
        });

        thoughts.forEach(t => {
          const row = document.createElement('div');
          row.className = 'glass-card rounded-xl p-4 flex items-start justify-between gap-3';
          row.innerHTML = `
        <div class="min-w-0">
          <p class="text-xs text-gold-400 mb-1">${escapeHtml(t.category)}</p>
          <p class="text-sm font-semibold text-gray-100 truncate">${escapeHtml(t.title)}</p>
          <p class="text-xs text-gray-500 mt-1">✍️ ${escapeHtml(t.authorName)}</p>
        </div>
      `;
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.title = 'Remove from saved';
          removeBtn.className = 'shrink-0 text-gray-400 hover:text-red-400 transition-colors text-sm';
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', async () => {
            const t2 = getToken();
            try {
              const r = await fetch(`/api/thoughts/${t._id}/save`, { method: 'POST', headers: { Authorization: `Bearer ${t2}` } });
              const d = await r.json();
              if (d.success) { row.remove(); checkSavedEmptyState(); }
            } catch { showToast('Network error.', 'error'); }
          });
          row.appendChild(removeBtn);
          thoughtsList.appendChild(row);
        });
      } catch {
        loading.classList.add('hidden');
        showToast('Network error while loading saved items.', 'error');
      }
    }

    function checkSavedEmptyState() {
      const postsGrid = document.getElementById('ppSavedPostsGrid');
      const thoughtsList = document.getElementById('ppSavedThoughtsList');
      const empty = document.getElementById('ppSavedEmpty');

      const noPostItems = postsGrid.children.length === 0;
      const noThoughtItems = thoughtsList.children.length === 0;

      if (noPostItems && noThoughtItems) {
        // Both empty — show the main full-section empty state
        empty.classList.remove('hidden');
      } else {
        // At least one subsection has content; show per-subsection placeholders
        // for whichever is now empty (e.g. user removed their last saved post)
        if (noPostItems) {
          postsGrid.innerHTML = '<p class="text-center text-gray-500 text-xs py-6 col-span-3">No saved posts yet.</p>';
        }
        if (noThoughtItems) {
          thoughtsList.innerHTML = '<p class="text-center text-gray-500 text-xs py-4">No saved thoughts yet.</p>';
        }
      }
    }

    // ================================================================
    // FRIEND REQUEST TOAST (real-time notification)
    // ================================================================
    let pendingFriendRequestFromId = null;

    function showFriendRequestToast(fromId, fromName) {
      pendingFriendRequestFromId = fromId;
      document.getElementById('friendReqToastName').textContent = fromName;
      const toast = document.getElementById('friendReqToast');
      toast.classList.remove('hidden');
      // Auto-dismiss after 15s
      setTimeout(() => toast.classList.add('hidden'), 15000);
    }

    document.getElementById('acceptFriendReqBtn').addEventListener('click', async () => {
      if (!pendingFriendRequestFromId) return;
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(`/api/users/friend-request/${pendingFriendRequestFromId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'accept' })
        });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
      } catch {
        showToast('Network error.', 'error');
      }
      document.getElementById('friendReqToast').classList.add('hidden');
    });

    document.getElementById('rejectFriendReqBtn').addEventListener('click', async () => {
      if (!pendingFriendRequestFromId) return;
      const token = getToken();
      if (!token) return;
      try {
        await fetch(`/api/users/friend-request/${pendingFriendRequestFromId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'reject' })
        });
      } catch { /* silent */ }
      document.getElementById('friendReqToast').classList.add('hidden');
    });

    // ================================================================
    // PRIVATE CHAT — Socket.io
    // ================================================================
    let socket = null;
    let activeChatUserId = null;
    let socketNetworkToastShown = false; // avoid stacking repeated toasts while offline/retrying

    function connectSocket() {
      const token = getToken();
      if (!token || socket) return;

      socket = io({ auth: { token } });
      window.socket = socket; // expose for other modules (IG DM bridge, notifications)

      // Successful (re)connection — clear the offline flag so a future drop
      // shows a fresh toast instead of staying silent forever.
      socket.on('connect', () => {
        socketNetworkToastShown = false;
      });

      // Fired when the underlying transport can't reach the server (offline,
      // server down, etc.) — socket.io keeps retrying automatically, so we
      // just need to let the user know rather than let this fail silently.
      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err?.message || err);
        if (!socketNetworkToastShown) {
          socketNetworkToastShown = true;
          showToast('Network disconnected. Retrying...', 'error');
        }
      });

      // Fired when an already-connected socket drops (network change, server
      // restart, etc.).
      socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
        if (!socketNetworkToastShown) {
          socketNetworkToastShown = true;
          showToast('Network disconnected. Retrying...', 'error');
        }
      });

      socket.on('notification', (n) => {
        prependNotification(n);
      });

      socket.on('receive_message', (msg) => {
        // Legacy chat drawer thread (kept for compatibility)
        if (activeChatUserId === msg.sender) {
          appendMessageBubble(msg, false);
          scrollChatToBottom();
        } else {
          document.getElementById('chatUnreadDot').classList.remove('hidden');
          document.getElementById('mobChatUnreadDot')?.classList.remove('hidden');
        }
        // Instagram-style DM thread (the UI actually in use)
        if (document.getElementById('igDmPage')?.classList.contains('dm-open') && igActiveChatUserId === msg.sender) {
          appendIgBubble(msg, false);
          document.getElementById('igDmMessagesList').scrollTop = document.getElementById('igDmMessagesList').scrollHeight;
        }
        loadConversations();
        loadIgConversations();
      });

      socket.on('message_sent', (msg) => {
        if (activeChatUserId === msg.receiver) {
          appendMessageBubble(msg, true);
          scrollChatToBottom();
        }
        if (document.getElementById('igDmPage')?.classList.contains('dm-open') && igActiveChatUserId === msg.receiver) {
          appendIgBubble(msg, true);
          document.getElementById('igDmMessagesList').scrollTop = document.getElementById('igDmMessagesList').scrollHeight;
        }
        loadConversations();
        loadIgConversations();
      });

      socket.on('message_error', (err) => {
        showToast(err.message || 'Failed to send message.', 'error');
      });

      // Friend request real-time notification
      socket.on('friend_request', ({ from }) => {
        showFriendRequestToast(from.id, from.name);
      });
    }

    function disconnectSocket() {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      window.socket = null;
      activeChatUserId = null;
    }

    // ================================================================
    // NOTIFICATIONS
    // ================================================================
    let allNotifications = [];

    function timeAgoNotif(dateStr) {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'now';
      if (mins < 60) return `${mins}m`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h`;
      const days = Math.floor(hrs / 24);
      if (days < 7) return `${days}d`;
      return new Date(dateStr).toLocaleDateString();
    }

    function notifIcon(type) {
      switch (type) {
        case 'like': return '❤️';
        case 'comment': return '💬';
        case 'follow': return '➕';
        case 'friend_request': return '🤝';
        case 'friend_accept': return '✅';
        default: return '🔔';
      }
    }

    async function loadNotifications() {
      const token = getToken();
      if (!token) return;
      document.getElementById('notifListLoading').classList.remove('hidden');
      document.getElementById('notifListEmpty').classList.add('hidden');
      try {
        const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        document.getElementById('notifListLoading').classList.add('hidden');
        if (!data.success) return;
        allNotifications = data.data;
        renderNotifList();
        updateNotifBadge();
      } catch {
        document.getElementById('notifListLoading').classList.add('hidden');
      }
    }

    function updateNotifBadge() {
      const unreadCount = allNotifications.filter(n => !n.read).length;
      const badge = document.getElementById('notifUnreadBadge');
      const mobDot = document.getElementById('mobFeedNotifDot');
      const topDot = document.getElementById('mobTopNotifDot');
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
        badge.classList.remove('hidden');
        mobDot.classList.remove('hidden');
        topDot?.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
        mobDot.classList.add('hidden');
        topDot?.classList.add('hidden');
      }
    }

    function renderNotifList() {
      const list = document.getElementById('notifList');
      const empty = document.getElementById('notifListEmpty');
      list.innerHTML = '';
      if (allNotifications.length === 0) { empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');

      allNotifications.forEach(n => {
        const item = document.createElement('div');
        item.className = `notif-item${n.read ? '' : ' unread'}`;

        const avatar = document.createElement('span');
        avatar.className = 'notif-item-avatar';
        renderAvatarInto(avatar, {
          name: n.sender?.name, avatarColor: n.sender?.avatarColor, profilePicture: n.sender?.profilePicture
        });

        const textWrap = document.createElement('div');
        textWrap.className = 'flex-1 min-w-0';
        textWrap.innerHTML = `
      <p class="notif-item-text"><span class="mr-1">${notifIcon(n.type)}</span>${escapeHtml(n.message)}</p>
      <p class="notif-item-time">${timeAgoNotif(n.createdAt)}</p>
    `;

        item.appendChild(avatar);
        item.appendChild(textWrap);
        item.addEventListener('click', () => handleNotifClick(n));
        list.appendChild(item);
      });
    }

    function prependNotification(n) {
      allNotifications.unshift(n);
      renderNotifList();
      updateNotifBadge();
      showToast(n.message, 'success');
    }

    async function markNotifRead(id) {
      const token = getToken();
      if (!token) return;
      const n = allNotifications.find(x => x._id === id);
      if (n) n.read = true;
      updateNotifBadge();
      renderNotifList();
      try {
        await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      } catch { /* silent — will resync on next loadNotifications() */ }
    }

    async function handleNotifClick(n) {
      if (!n.read) await markNotifRead(n._id);
      document.getElementById('notifDropdown').classList.add('hidden');

      // Follow / friend notifications → go to the sender's profile
      if (n.type === 'follow' || n.type === 'friend_request' || n.type === 'friend_accept') {
        if (n.sender?.id) openPublicProfile(n.sender.id);
        return;
      }

      // Like / comment notifications → jump straight to that exact post
      if ((n.type === 'like' || n.type === 'comment') && n.postId) {
        try {
          const token = getToken();
          const res = await fetch(`/api/posts/${n.postId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          const data = await res.json();
          if (data.success) {
            window.location.hash = '#feed';
            setTimeout(() => openPostDetail(data.data, data.data.author, [data.data]), 200);
            return;
          }
        } catch { /* fall through to feed */ }
        window.location.hash = '#feed';
        showToast('That post is no longer available.', 'error');
      }
    }

    document.getElementById('notifBellBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notifDropdown').classList.toggle('hidden');
    });
    document.getElementById('mobTopNotifBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notifBellBtn')?.click();
    });
    document.getElementById('mobTopNewPostBtn').addEventListener('click', () => {
      if (!getToken()) { openAuthModal('login'); return; }
      openCreatePostModal();
    });
    document.getElementById('mobProfileBtn').addEventListener('click', () => {
      const user = getStoredUser();
      if (!user) { openAuthModal('login'); return; }
      openPublicProfile(user.id);
    });
    document.getElementById('notifCloseBtn').addEventListener('click', () => {
      document.getElementById('notifDropdown').classList.add('hidden');
    });
    document.getElementById('notifMarkAllReadBtn').addEventListener('click', async () => {
      const token = getToken();
      if (!token) return;
      allNotifications.forEach(n => n.read = true);
      updateNotifBadge();
      renderNotifList();
      try {
        await fetch('/api/notifications/read-all', { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      } catch { /* silent */ }
    });
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('notifDropdown');
      const bellWrap = document.getElementById('notifWrap');
      const mobBtn = document.getElementById('mobFeedNotifBtn');
      if (!dd.classList.contains('hidden') && !dd.contains(e.target) &&
        !bellWrap.contains(e.target) && !mobBtn.contains(e.target)) {
        dd.classList.add('hidden');
      }
    });

    // ── Chat Drawer UI ──
    const chatDrawer = document.getElementById('chatDrawer');

    function openChatDrawer() {
      chatDrawer.classList.remove('hidden');
      requestAnimationFrame(() => chatDrawer.classList.add('chat-open'));
      document.getElementById('chatUnreadDot').classList.add('hidden');
      showConversationsList();
      loadConversations();
    }
    function closeChatDrawerFn() {
      chatDrawer.classList.remove('chat-open');
      setTimeout(() => chatDrawer.classList.add('hidden'), 320);
    }

    document.getElementById('chatToggleBtn').addEventListener('click', openChatDrawer);
    document.getElementById('closeChatDrawer').addEventListener('click', closeChatDrawerFn);
    document.getElementById('closeChatDrawer2').addEventListener('click', closeChatDrawerFn);
    document.getElementById('chatOverlay').addEventListener('click', closeChatDrawerFn);

    function showConversationsList() {
      const listView = document.getElementById('chatListView');
      const threadView = document.getElementById('chatThreadView');
      listView.classList.remove('hidden');
      listView.classList.add('flex');
      threadView.classList.add('hidden');
      threadView.classList.remove('flex');
      activeChatUserId = null;
    }
    document.getElementById('backToConversations').addEventListener('click', showConversationsList);

    async function loadConversations() {
      const token = getToken();
      if (!token) return;

      const list = document.getElementById('conversationsList');
      const emptyMsg = document.getElementById('conversationsEmptyMsg');

      try {
        const res = await fetch('/api/messages/conversations', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) return;

        list.innerHTML = '';

        if (data.data.length === 0) {
          emptyMsg.classList.remove('hidden');
          return;
        }
        emptyMsg.classList.add('hidden');

        let anyUnread = false;
        data.data.forEach(c => {
          if (c.unreadCount > 0) anyUnread = true;
          const item = document.createElement('button');
          item.className = 'w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gold-500/5 transition-colors text-left border-b border-gold-500/8';
          item.innerHTML = `
        <span class="convo-avatar w-11 h-11 rounded-full flex items-center justify-center font-serif font-bold text-dark-900 text-sm bg-cover bg-center shrink-0"></span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-100 truncate">${escapeHtml(c.name)}</p>
          <p class="text-xs text-gray-500 truncate mt-0.5">${escapeHtml(c.lastMessage)}</p>
        </div>
        ${c.unreadCount > 0
              ? `<span class="w-5 h-5 rounded-full bg-saffron-500 text-dark-900 text-[10px] font-bold flex items-center justify-center shrink-0">${c.unreadCount}</span>`
              : ''}
      `;
          renderAvatarInto(item.querySelector('.convo-avatar'), {
            name: c.name, avatarColor: c.avatarColor, profilePicture: c.profilePicture
          });
          item.addEventListener('click', () => openChatThread(c.userId, c.name, c.avatarColor, c.profilePicture));
          list.appendChild(item);
        });

        document.getElementById('chatUnreadDot').classList.toggle('hidden', !anyUnread);
        document.getElementById('mobChatUnreadDot')?.classList.toggle('hidden', !anyUnread);
      } catch {
        console.error('Failed to load conversations');
      }
    }

    async function openChatThread(userId, name, avatarColor, profilePicture) {
      activeChatUserId = userId;

      const listView = document.getElementById('chatListView');
      const threadView = document.getElementById('chatThreadView');
      listView.classList.add('hidden');
      listView.classList.remove('flex');
      threadView.classList.remove('hidden');
      threadView.classList.add('flex');

      document.getElementById('chatThreadName').textContent = name;
      document.getElementById('chatThreadStatus').textContent = 'Private conversation';
      renderAvatarInto(document.getElementById('chatThreadAvatar'), { name, avatarColor, profilePicture });

      const messagesList = document.getElementById('chatMessagesList');
      messagesList.innerHTML = '<p class="text-center text-gray-500 text-sm py-6">Loading messages…</p>';

      try {
        const token = getToken();
        const res = await fetch(`/api/messages/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        messagesList.innerHTML = '';

        if (data.success) {
          const myId = getStoredUser()?.id;
          data.data.forEach(m => appendMessageBubble(m, m.sender === myId, false));
          scrollChatToBottom();
        }
      } catch {
        messagesList.innerHTML = '<p class="text-center text-red-400 text-sm py-6">Failed to load messages.</p>';
      }
    }

    // ================================================================
    // BUG FIX: loadMessages — complete, syntactically correct function
    // (alias used when opening a chat thread from outside)
    // ================================================================
    async function loadMessages(userId) {
      await openChatThread(
        userId,
        activeChatUserId?.name || '',
        activeChatUserId?.avatarColor || '#d4a437',
        activeChatUserId?.profilePicture || null
      );
    }

    function appendMessageBubble(msg, isMine, animate = true) {
      const list = document.getElementById('chatMessagesList');
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble ${isMine ? 'mine' : 'theirs'}`;
      if (!animate) bubble.style.animation = 'none';
      bubble.textContent = msg.text;
      list.appendChild(bubble);
    }

    function scrollChatToBottom() {
      const list = document.getElementById('chatMessagesList');
      list.scrollTop = list.scrollHeight;
    }

    document.getElementById('chatSendForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chatMessageInput');
      const text = input.value.trim();
      if (!text || !activeChatUserId || !socket) return;
      if (e.target.dataset.sending === '1') return; // prevent double-submit firing twice
      e.target.dataset.sending = '1';

      try {
        if (!socket.connected) throw new Error('Socket is offline');
        socket.emit('send_message', { receiverId: activeChatUserId, text });
        input.value = '';
        setTimeout(() => { e.target.dataset.sending = '0'; }, 250);
      } catch (err) {
        console.error('Failed to send message:', err);
        showToast('Message failed to send. Please check your connection.', 'error');
        e.target.dataset.sending = '0'; // don't leave the send button stuck in a loading state
      }
    });

    // Enter to send, Shift+Enter for a new line
    document.getElementById('chatMessageInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = document.getElementById('chatSendForm');
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    // ================================================================
    // CLIENT-SIDE ROUTER (SPA Navigation + Back Button Support)
    // ================================================================

    // Pure app ke sabhi valid sections
    const validSections = ['home', 'wisdom', 'sloka', 'community', 'feed', 'thoughts', 'join'];

    // On mobile/tablet (≤767px) the bottom nav only has 5 tabs: Wisdom is
    // merged into Home and Sloka is merged into Community. This maps a
    // "child" route to the "parent" tab it now lives inside of, so a route
    // like #wisdom renders the Home tab (with Wisdom left visible right
    // below it for a natural scroll) instead of being its own screen.
    const mobileMergedParent = { wisdom: 'home', sloka: 'community' };

    function handleRouting() {
      // Hash me se '#' hata kar current route nikalen (default: 'home')
      const currentRoute = window.location.hash.replace('#', '') || 'home';

      if (!validSections.includes(currentRoute)) return;

      const isMobileOrTablet = window.matchMedia('(max-width: 767px)').matches;

      // On mobile/tablet, a direct link to #wisdom or #sloka (old bookmarks,
      // the "Begin Your Journey" hero button, the Profile "More Settings"
      // panel, etc.) should land on the merged parent tab rather than an
      // orphan screen with no matching bottom-nav button — then we scroll
      // down to the specific section once it's rendered. Desktop keeps
      // Wisdom/Sloka as their own separate tabs, unaffected.
      const mergeChild = isMobileOrTablet ? mobileMergedParent[currentRoute] : null;
      const renderRoute = mergeChild || currentRoute;

      // 1. Sabhi sections ko hide/show karein (class-based, no inline styles)
      validSections.forEach(sectionId => {
        const sectionEl = document.getElementById(sectionId);
        if (sectionEl) {
          if (sectionId === renderRoute) {
            sectionEl.classList.remove('hidden');
            sectionEl.classList.add('fade-in');
          } else {
            sectionEl.classList.add('hidden');
            sectionEl.classList.remove('fade-in');
          }
        }
      });

      // 1c. Mobile/tablet page merging — keep the child section visible
      //     right after its parent so scrolling down naturally reveals it:
      //     Home → Wisdom, and Community → Sloka (Sloka on top, Community
      //     posts below, since #sloka already sits before #community in
      //     the DOM).
      if (isMobileOrTablet) {
        if (renderRoute === 'home') {
          document.getElementById('wisdom')?.classList.remove('hidden');
        } else if (renderRoute === 'community') {
          document.getElementById('sloka')?.classList.remove('hidden');
        }
      }

      // 1b. Daily Greeting Banner layout: vertical card mounted inside the
      //     hero on Home, full-width horizontal strip below the navbar on
      //     every other page. Only one #dailyGreetingBanner element exists
      //     in the DOM — we swap its layout classes AND physically move the
      //     single #globalBannerWrap node between the two mount points, so
      //     it never renders as a stray top bar on the Home route.
      const bannerWrap = document.getElementById('globalBannerWrap');
      const banner = document.getElementById('dailyGreetingBanner');
      const heroBannerSlot = document.getElementById('heroBannerSlot');
      const bannerAnchor = document.getElementById('globalBannerAnchor');
      if (bannerWrap && banner) {
        if (renderRoute === 'home') {
          bannerWrap.classList.remove('gbw-page');
          bannerWrap.classList.add('gbw-home');
          banner.classList.remove('dgb-horizontal');
          banner.classList.add('dgb-vertical');
          if (heroBannerSlot && bannerWrap.parentElement !== heroBannerSlot) {
            heroBannerSlot.appendChild(bannerWrap);
          }
        } else {
          bannerWrap.classList.remove('gbw-home');
          bannerWrap.classList.add('gbw-page');
          banner.classList.remove('dgb-vertical');
          banner.classList.add('dgb-horizontal');
          if (bannerAnchor && bannerAnchor.parentElement && bannerWrap.parentElement !== bannerAnchor.parentElement) {
            bannerAnchor.parentElement.insertBefore(bannerWrap, bannerAnchor.nextSibling);
          }
        }
      }

      // 2b. Bottom mobile nav ka active state bhi yahin sync kar dein
      updateMobileNav(renderRoute);

      // 2. Active Header/Navbar link ko highlight karein
      document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === `#${currentRoute}`) {
          link.classList.add('text-gold-400');
          link.classList.remove('text-gray-300');
        } else {
          link.classList.remove('text-gold-400');
          link.classList.add('text-gray-300');
        }
      });

      // 3. Page ke top par scroll karayein — unless we redirected a child
      //    route to its merged parent, in which case scroll straight to the
      //    child section so the link still lands where the user expected.
      if (mergeChild) {
        requestAnimationFrame(() => {
          document.getElementById(currentRoute)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    // Browser Back/Forward button aur link click handle karne ke liye listeners:
    // ================================================================
    // INSTAGRAM STORIES ROW — shows recent active users
    // ================================================================
    async function loadIgStories() {
      try {
        const res = await fetch('/api/posts?limit=20');
        const data = await res.json();
        if (!data.success) return;

        const row = document.getElementById('igStoriesRow');
        if (!row) return;
        row.innerHTML = '';

        // Collect unique authors
        const seen = new Set();
        const authors = [];
        data.data.forEach(p => {
          if (!seen.has(p.author.id)) {
            seen.add(p.author.id);
            authors.push(p.author);
          }
        });

        authors.slice(0, 12).forEach(a => {
          const item = document.createElement('div');
          item.className = 'ig-story-item';
          item.innerHTML = `
        <div class="ig-story-ring">
          <div class="ig-story-inner story-avatar-slot"></div>
        </div>
        <span class="ig-story-label">${escapeHtml(a.name.split(' ')[0])}</span>
      `;
          renderAvatarInto(item.querySelector('.story-avatar-slot'), a);
          item.addEventListener('click', () => openPublicProfile(a.id));
          row.appendChild(item);
        });

        if (authors.length === 0) row.innerHTML = '<p class="text-xs text-gray-600 py-3">No activity yet.</p>';
      } catch { /* silent */ }
    }

    // ================================================================
    // DAILY HOME RECOMMENDATIONS
    // ================================================================
    async function loadDailyRecommendations() {
      const grid = document.getElementById('dailyRecGrid');
      const dateEl = document.getElementById('dailyRecDate');
      if (!grid) return;

      const today = new Date();
      if (dateEl) dateEl.textContent = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

      // Seeded shuffle — same order all day
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      const seededRand = (n) => { let x = Math.sin(seed + n) * 10000; return x - Math.floor(x); };

      try {
        const [postsRes, thoughtsRes] = await Promise.all([
          fetch('/api/posts/most-liked?limit=10').then(r => r.json()).catch(() => ({ success: false })),
          fetch('/api/thoughts/approved').then(r => r.json()).catch(() => ({ success: false }))
        ]);

        grid.innerHTML = '';

        const makeCard = (badge, icon, title, meta, imgUrl, videoUrl, onClick) => {
          const card = document.createElement('div');
          card.className = 'daily-rec-card';
          if (imgUrl || videoUrl) {
            if (videoUrl) {
              card.innerHTML = `<video src="${videoUrl}" muted loop playsinline preload="metadata" class="w-full h-full object-cover"></video>`;
            } else {
              card.innerHTML = `<img src="${imgUrl}" class="w-full h-full object-cover" loading="lazy" onerror="mediaFallback(this)" />`;
            }
          } else {
            card.style.background = 'linear-gradient(135deg, #1c140c, #2a1e12)';
            card.innerHTML = `<div class="w-full h-full flex items-center justify-center text-4xl">${icon}</div>`;
          }
          card.innerHTML += `
        <div class="daily-rec-overlay">
          <div class="daily-rec-badge">${icon} ${badge}</div>
          <div class="daily-rec-title">${escapeHtml(title)}</div>
          <div class="daily-rec-meta">${meta}</div>
        </div>`;
          card.addEventListener('click', onClick);
          return card;
        };

        // Pick 1 top photo
        const photos = postsRes.success ? (postsRes.photos || []) : [];
        const photoIdx = Math.floor(seededRand(1) * Math.max(1, photos.length));
        const topPhoto = photos[photoIdx] || null;
        if (topPhoto) {
          grid.appendChild(makeCard('Top Photo', '📸', topPhoto.author?.name || 'Post', `❤️ ${topPhoto.likeCount}`, topPhoto.mediaUrl, null, () => { window.location.hash = '#feed'; }));
        } else {
          grid.appendChild(makeCard('Top Photo', '📸', 'Share a moment', 'Be the first!', null, null, () => { window.location.hash = '#feed'; }));
        }

        // Pick 1 top reel
        const reels = postsRes.success ? (postsRes.reels || []) : [];
        const reelIdx = Math.floor(seededRand(2) * Math.max(1, reels.length));
        const topReel = reels[reelIdx] || null;
        if (topReel) {
          grid.appendChild(makeCard('Top Reel', '🎬', topReel.author?.name || 'Video', `❤️ ${topReel.likeCount}`, null, topReel.mediaUrl, () => { window.location.hash = '#feed'; }));
        } else {
          grid.appendChild(makeCard('Top Reel', '🎬', 'Watch reels', 'Explore now', null, null, () => { window.location.hash = '#feed'; }));
        }

        // Wisdom card (static rotating)
        const wisdomItems = [
          { title: 'Bhagavad Gita', sub: 'Chapter 2 · Sankhya Yoga', icon: '📜' },
          { title: 'Upanishads', sub: 'Ancient wisdom texts', icon: '🪔' },
          { title: 'Daily Sloka', sub: 'Sanskrit wisdom', icon: '🕉️' },
          { title: 'Vedas', sub: 'Sacred knowledge', icon: '📖' },
        ];
        const wItem = wisdomItems[Math.floor(seededRand(3) * wisdomItems.length)];
        grid.appendChild(makeCard('Wisdom', wItem.icon, wItem.title, wItem.sub, null, null, () => { window.location.hash = '#wisdom'; }));

        // Community thought
        const thoughts = thoughtsRes.success ? thoughtsRes.data : [];
        const thIdx = Math.floor(seededRand(4) * Math.max(1, thoughts.length));
        const topThought = thoughts[thIdx] || null;
        if (topThought) {
          grid.appendChild(makeCard('Community', '💭', topThought.title, `by ${topThought.authorName} · ❤️ ${topThought.likeCount}`, null, null, () => { window.location.hash = '#community'; }));
        } else {
          grid.appendChild(makeCard('Community', '💭', 'Share a Thought', 'Join the conversation', null, null, () => { window.location.hash = '#thoughts'; }));
        }

        // Autoplay videos in cards
        grid.querySelectorAll('video').forEach(v => {
          const obs = new IntersectionObserver(entries => {
            entries.forEach(e => e.isIntersecting ? v.play().catch(() => { }) : v.pause());
          }, { threshold: 0.3 });
          obs.observe(v);
        });

      } catch (e) {
        console.error('Daily rec error:', e);
        grid.innerHTML = '<div class="col-span-2 sm:col-span-4 text-center text-gray-600 text-sm py-6">Could not load recommendations.</div>';
      }
    }

    // ================================================================
    // INSTAGRAM DM PAGE
    // ================================================================
    let igActiveChatUserId = null;
    let igActiveChatName = '';
    let igActiveChatColor = '#d4a437';
    let igActiveChatPic = null;

    function openIgDm() {
      document.getElementById('igDmPage').classList.add('dm-open');
      document.body.style.overflow = 'hidden';
      loadIgConversations();
    }
    function closeIgDm() {
      document.getElementById('igDmPage').classList.remove('dm-open');
      document.body.style.overflow = '';
    }

    // Wire chat toggle btn to open IG DM
    document.getElementById('chatToggleBtn').addEventListener('click', openIgDm);
    document.getElementById('igDmCloseBtn').addEventListener('click', closeIgDm);

    async function loadIgConversations() {
      const token = getToken();
      if (!token) return;
      const list = document.getElementById('igDmConvoList');
      const empty = document.getElementById('igDmConvoEmpty');
      list.innerHTML = '';
      try {
        const res = await fetch('/api/messages/conversations', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.success || !data.data.length) { empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        data.data.forEach(c => {
          const item = document.createElement('div');
          item.className = 'ig-dm-convo-item';
          item.innerHTML = `
        <span class="ig-dm-avatar w-12 h-12 rounded-full flex items-center justify-center font-serif font-bold text-dark-900 text-sm bg-cover bg-center shrink-0"></span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-100 truncate">${escapeHtml(c.name)}</p>
          <p class="text-xs text-gray-500 truncate mt-0.5">${escapeHtml(c.lastMessage || '')}</p>
        </div>
        ${c.unreadCount > 0 ? `<span class="w-5 h-5 rounded-full bg-saffron-500 text-dark-900 text-[10px] font-bold flex items-center justify-center shrink-0">${c.unreadCount}</span>` : ''}
      `;
          renderAvatarInto(item.querySelector('.ig-dm-avatar'), { name: c.name, avatarColor: c.avatarColor, profilePicture: c.profilePicture });
          item.addEventListener('click', () => openIgThread(c.userId, c.name, c.avatarColor, c.profilePicture));
          list.appendChild(item);
        });
        const anyUnread = data.data.some(c => c.unreadCount > 0);
        document.getElementById('chatUnreadDot')?.classList.toggle('hidden', !anyUnread);
        document.getElementById('mobChatUnreadDot')?.classList.toggle('hidden', !anyUnread);
      } catch { empty.classList.remove('hidden'); }
    }

    async function openIgThread(userId, name, avatarColor, profilePicture) {
      igActiveChatUserId = userId;
      igActiveChatName = name;
      igActiveChatColor = avatarColor;
      igActiveChatPic = profilePicture;

      // Mobile: hide sidebar
      document.getElementById('igDmSidebar').classList.add('dm-thread-open');

      const emptyState = document.getElementById('igDmEmptyState');
      const thread = document.getElementById('igDmThread');
      emptyState.classList.add('hidden');
      thread.classList.remove('hidden');
      thread.classList.add('flex');

      document.getElementById('igDmThreadName').textContent = name;
      renderAvatarInto(document.getElementById('igDmThreadAvatar'), { name, avatarColor, profilePicture });

      const msgList = document.getElementById('igDmMessagesList');
      msgList.innerHTML = '<p class="text-center text-gray-500 text-sm py-6">Loading…</p>';

      try {
        const token = getToken();
        const res = await fetch(`/api/messages/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        msgList.innerHTML = '';
        if (data.success) {
          const myId = getStoredUser()?.id;
          data.data.forEach(m => appendIgBubble(m, m.sender === myId, false));
          msgList.scrollTop = msgList.scrollHeight;
        }
      } catch {
        msgList.innerHTML = '<p class="text-center text-red-400 text-sm py-6">Failed to load messages.</p>';
      }

      // Check block status
      try {
        const token = getToken();
        const r = await fetch(`/api/users/${userId}/block-status`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        document.getElementById('igChatBlockUserBtn').classList.toggle('hidden', d.isBlocked);
        document.getElementById('igChatUnblockUserBtn').classList.toggle('hidden', !d.isBlocked);
      } catch { /* silent */ }
    }

    function appendIgBubble(msg, isMine, animate = true) {
      const list = document.getElementById('igDmMessagesList');
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble ${isMine ? 'mine' : 'theirs'}`;
      if (!animate) bubble.style.animation = 'none';
      bubble.textContent = msg.text;
      list.appendChild(bubble);
    }

    // Back button (mobile)
    document.getElementById('igDmBackBtn').addEventListener('click', () => {
      document.getElementById('igDmSidebar').classList.remove('dm-thread-open');
      document.getElementById('igDmThread').classList.add('hidden');
      document.getElementById('igDmThread').classList.remove('flex');
      document.getElementById('igDmEmptyState').classList.remove('hidden');
    });

    // IG DM send form
    document.getElementById('igDmSendForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('igDmInput');
      const text = input.value.trim();
      if (!text || !igActiveChatUserId || !socket) return;
      if (e.target.dataset.sending === '1') return; // prevent double-submit firing twice
      e.target.dataset.sending = '1';

      try {
        if (!socket.connected) throw new Error('Socket is offline');
        socket.emit('send_message', { receiverId: igActiveChatUserId, text });
        input.value = '';
        setTimeout(() => { e.target.dataset.sending = '0'; }, 250);
      } catch (err) {
        console.error('Failed to send message:', err);
        showToast('Message failed to send. Please check your connection.', 'error');
        e.target.dataset.sending = '0'; // don't leave the send button stuck in a loading state
      }
    });

    // Enter to send, Shift+Enter for a new line
    document.getElementById('igDmInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = document.getElementById('igDmSendForm');
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    // IG Chat options dropdown
    document.getElementById('igChatOptionsBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('igChatOptionsDropdown').classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#igChatOptionsBtn, #igChatOptionsDropdown'))
        document.getElementById('igChatOptionsDropdown').classList.add('hidden');
    });

    document.getElementById('igChatDeleteConvoBtn').addEventListener('click', async () => {
      if (!igActiveChatUserId || !confirm('Delete this conversation?')) return;
      document.getElementById('igChatOptionsDropdown').classList.add('hidden');
      const token = getToken();
      const r = await fetch(`/api/messages/conversation/${igActiveChatUserId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        document.getElementById('igDmMessagesList').innerHTML = '';
        document.getElementById('igDmBackBtn').click();
        loadIgConversations();
        showToast('Conversation deleted.', 'success');
      }
    });
    document.getElementById('igChatBlockUserBtn').addEventListener('click', async () => {
      if (!igActiveChatUserId || !confirm('Block this user?')) return;
      document.getElementById('igChatOptionsDropdown').classList.add('hidden');
      const token = getToken();
      const r = await fetch(`/api/users/${igActiveChatUserId}/block`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      showToast(d.message, d.success ? 'success' : 'error');
      if (d.success) { document.getElementById('igChatBlockUserBtn').classList.add('hidden'); document.getElementById('igChatUnblockUserBtn').classList.remove('hidden'); }
    });
    document.getElementById('igChatUnblockUserBtn').addEventListener('click', async () => {
      if (!igActiveChatUserId) return;
      document.getElementById('igChatOptionsDropdown').classList.add('hidden');
      const token = getToken();
      const r = await fetch(`/api/users/${igActiveChatUserId}/unblock`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      showToast(d.message, d.success ? 'success' : 'error');
      if (d.success) { document.getElementById('igChatUnblockUserBtn').classList.add('hidden'); document.getElementById('igChatBlockUserBtn').classList.remove('hidden'); }
    });

    // NOTE: IG DM thread updates are now handled directly inside connectSocket()'s
    // single receive_message / message_sent listeners above — this avoids attaching
    // a second set of listeners to the same socket (which was causing every message
    // to render twice).

const dailyGodData = [
  {
    day: "Sunday",
    symbol: "☀️",
    mantra: "ॐ सूर्यदेवाय नमः",
    sub: "Surya Dev is the source of all energy and life. May His brightness illuminate your path."
  },
  {
    day: "Monday",
    symbol: "🌙 🔱",
    mantra: "ॐ नमः शिवाय - हर हर महादेव",
    sub: "Shiva is the infinite consciousness - may His grace guide your day."
  },
  {
    day: "Tuesday",
    symbol: "🚩 🔱",
    mantra: "जय श्री राम - ॐ हं हनुमते नमः",
    sub: "Hanuman Ji gives courage and strength. May He protect you from all obstacles."
  },
  {
    day: "Wednesday",
    symbol: "🐘 🔱",
    mantra: "ॐ गं गणपतये नमः",
    sub: "Lord Ganesha is the remover of obstacles and lord of wisdom."
  },
  {
    day: "Thursday",
    symbol: "🐚 🔱",
    mantra: "ॐ नमो भगवते वासुदेवाय",
    sub: "Lord Vishnu is the preserver of the universe. May He bring peace and prosperity."
  },
  {
    day: "Friday",
    symbol: "🪷 🔱",
    mantra: "ॐ श्रीं महालक्ष्म्यै नमः",
    sub: "Maa Lakshmi brings prosperity, beauty, and inner light into our lives."
  },
  {
    day: "Saturday",
    symbol: "⚖️ 🔱",
    mantra: "ॐ शं शनैश्चराय नमः",
    sub: "Shani Dev teaches discipline, hard work, and justice."
  }
];

function updateDailyGreeting() {
  const todayIndex = new Date().getDay(); // Friday = 5
  const todayData = dailyGodData[todayIndex];

  if (!todayData) return;

  const dayElem = document.getElementById("dgbDayLabel");
  const mantraElem = document.getElementById("dgbMantra");
  const subElem = document.getElementById("dgbSub");
  const symbolElem = document.getElementById("dgbSymbol");

  if (dayElem) dayElem.innerText = todayData.day;
  if (mantraElem) mantraElem.innerText = todayData.mantra;
  if (subElem) subElem.innerText = todayData.sub;
  if (symbolElem) symbolElem.innerText = todayData.symbol;
}

// Immediately Run & Event Listeners (Dual Check)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateDailyGreeting);
} else {
  updateDailyGreeting();
}
    // ================================================================
    // MOBILE BOTTOM NAV — active state sync
    // ================================================================
    function updateMobileNav(section) {
      document.querySelectorAll('.mob-nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.nav === section);
      });
    }
    // Single hashchange listener — handleRouting() already syncs the mobile nav too
    window.addEventListener('hashchange', handleRouting);

    // ================================================================
    // OPEN CHAT THREAD FROM PROFILE (bridge to IG DM)
    // ================================================================
    // Override the legacy openChatThread/openChatDrawer to use IG DM page
    function openChatDrawer() { openIgDm(); }
    function closeChatDrawerFn() { closeIgDm(); }
    function openChatThread(userId, name, avatarColor, profilePicture) {
      openIgDm();
      setTimeout(() => openIgThread(userId, name, avatarColor, profilePicture), 50);
    }

    // ================================================================
    // BOOTSTRAP — run on page load
    // ================================================================
    updateAuthUI();
    handleRouting();
    loadCommunityThoughts();
    loadFeed(true);
    loadIgStories();
    loadDailyRecommendations();