/* ================================================================
   SANATAN GYAN — MOBILE-FIRST JS ENHANCEMENTS
   mobile.js — loaded after app.js
   ================================================================
   Adds:
   1. Wisdom Book icon → slide-in overlay with back button
   2. History API for hardware back button support
   3. Instagram-style full-screen Reels feed (scroll-snap)
   4. Reel: Like / Comment / Share / Mute on tap
   5. Mobile bottom nav profile button handler
   6. Feed "Video" filter → opens Reels overlay
   ================================================================ */

(function () {
  'use strict';

  /* ── Constants ── */
  const isMobile = () => window.innerWidth < 768;
  const gold = '#d4a437';

  /* ────────────────────────────────────────────────────────────────
     STEP 1 — Inject new DOM elements (Wisdom overlay + Reels feed)
     This runs once at DOMContentLoaded.
  ──────────────────────────────────────────────────────────────── */
  function injectMobileDom() {

    /* ── 1a. Wisdom Book button in top bar ── */
    const topBarActions = document.querySelector('.mobile-top-bar-actions');
    if (topBarActions && !document.getElementById('mobTopWisdomBtn')) {
      const wisdomBtn = document.createElement('button');
      wisdomBtn.id = 'mobTopWisdomBtn';
      wisdomBtn.title = 'Explore Wisdom';
      wisdomBtn.setAttribute('aria-label', 'Explore Wisdom');
      wisdomBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${gold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>`;
      // Insert before the notification button (first child)
      topBarActions.insertBefore(wisdomBtn, topBarActions.firstChild);
    }

    /* ── 1b. Wisdom slide-in overlay ── */
    if (!document.getElementById('wisdomOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'wisdomOverlay';
      overlay.innerHTML = `
        <div id="wisdomOverlayTopBar">
          <button id="wisdomOverlayBackBtn" aria-label="Go back">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span id="wisdomOverlayTitle">Explore Wisdom</span>
        </div>
        <div id="wisdomOverlayContent"></div>`;
      document.body.appendChild(overlay);
    }

    /* ── 1c. Reels full-screen container ── */
    if (!document.getElementById('reelsFeedContainer')) {
      const reelsContainer = document.createElement('div');
      reelsContainer.id = 'reelsFeedContainer';
      reelsContainer.innerHTML = `
        <div id="reelsFeedTopBar">
          <button id="reelsFeedCloseBtn" aria-label="Close Reels">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span id="reelsFeedLabel">ज्ञान प्रवाह · Reels</span>
        </div>
        <div id="reelsSnapWrapper"></div>`;
      document.body.appendChild(reelsContainer);
    }
  }

  /* ────────────────────────────────────────────────────────────────
     STEP 2 — WISDOM OVERLAY  (Book icon → slide-in panel)
  ──────────────────────────────────────────────────────────────── */
  let wisdomOpen = false;

  function openWisdomOverlay() {
    if (!isMobile()) {
      /* On desktop, just navigate to wisdom section */
      window.location.hash = '#wisdom';
      return;
    }

    const overlay = document.getElementById('wisdomOverlay');
    const contentEl = document.getElementById('wisdomOverlayContent');
    if (!overlay || !contentEl) return;

    /* Clone the wisdom section into the overlay */
    const wisdomSection = document.getElementById('wisdom');
    if (wisdomSection && contentEl.children.length === 0) {
      const clone = wisdomSection.cloneNode(true);
      clone.id = 'wisdom-clone';
      clone.classList.remove('hidden');
      clone.style.paddingTop = '1rem';
      contentEl.appendChild(clone);

      /* The cloned markup carries the same id="wisdomContent" as the
         hidden desktop copy still in the document. That duplicate id
         made document.getElementById('wisdomContent') always resolve to
         the ORIGINAL (off-screen) element, so tapping a tab in the
         overlay never touched what the user could actually see — the
         cover image, title, and description stayed stuck on whatever
         scripture was last rendered on desktop (Gita, by default).
         Give the clone's content container its own id and always target
         it explicitly below. */
      const cloneContent = clone.querySelector('#wisdomContent');
      if (cloneContent) cloneContent.id = 'wisdomContentMobile';

      /* Re-attach tab click handlers on the clone — actually re-render
         the scripture's image/title/description/features into the
         overlay's own container, not just toggle the active pill style. */
      clone.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          clone.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active', 'text-gold-400');
            b.classList.add('text-gray-300');
          });
          btn.classList.add('active', 'text-gold-400');
          btn.classList.remove('text-gray-300');
          if (typeof renderWisdomTab === 'function' && cloneContent) {
            renderWisdomTab(btn.dataset.tab, cloneContent);
          }
        });
      });

      /* Render whichever tab is active right now (defaults to Gita) into
         the overlay's own container, so it's correct from the first open. */
      const activeTab = clone.querySelector('.tab-btn.active')?.dataset.tab || 'gita';
      if (typeof renderWisdomTab === 'function' && cloneContent) {
        renderWisdomTab(activeTab, cloneContent);
      }
    }

    /* Push history state so hardware back button closes this */
    if (!wisdomOpen) {
      history.pushState({ wisdomOverlay: true }, '', window.location.href);
    }

    overlay.classList.add('wisdom-visible');
    wisdomOpen = true;
    document.body.style.overflow = 'hidden';
  }

  function closeWisdomOverlay() {
    const overlay = document.getElementById('wisdomOverlay');
    if (!overlay) return;
    overlay.classList.remove('wisdom-visible');
    wisdomOpen = false;
    document.body.style.overflow = '';
  }

  /* Exposed so any "Explore Wisdom" entry point on the page (hero CTA,
     nav link, daily recommendation card, etc.) can route through the same
     book-icon overlay on mobile instead of navigating to a separate
     standalone #wisdom page — see attachEventListeners() below and the
     daily-rec card handler in app.js. */
  window.openWisdomOverlay = openWisdomOverlay;

  /* ────────────────────────────────────────────────────────────────
     STEP 3 — REELS FEED  (full-screen vertical scroll-snap)
  ──────────────────────────────────────────────────────────────── */
  let reelsOpen = false;
  let reelsMuted = true;
  let reelsData = [];
  let reelsLoaded = false;
  let currentReelVideo = null;

  function buildAvatarStyle(author) {
    if (author && author.profilePicture) {
      return `background-image: url('${author.profilePicture}'); background-size: cover; background-position: center;`;
    }
    const color = (author && author.avatarColor) || '#d4a437';
    const initials = (author && author.name) ? author.name.charAt(0).toUpperCase() : '?';
    return `background-color: ${color}; color: #0a0704; font-weight:700; font-size:0.8rem;`;
  }

  function buildReelCard(post, index) {
    const { _id, mediaUrl, mediaType, caption, author, likeCount = 0 } = post;
    const isVideo = mediaType === 'reel';
    const authorStyle = buildAvatarStyle(author);
    const authorName = (author && author.name) ? author.name : 'Spiritual Seeker';
    const token = localStorage.getItem('sg_token');

    const card = document.createElement('div');
    card.className = 'reel-card';
    card.dataset.postId = _id;
    card.dataset.index = index;

    card.innerHTML = `
      ${isVideo
        ? `<video class="reel-media" src="${mediaUrl}" playsinline muted loop preload="metadata"></video>`
        : `<img class="reel-media" src="${mediaUrl}" alt="${caption || ''}" loading="lazy" />`
      }

      <!-- Mute feedback overlay -->
      <div class="reel-mute-overlay" id="reel-mute-${_id}">
        <div class="reel-mute-icon">🔇</div>
      </div>

      <!-- Bottom-left: author + title + description + sound -->
      <div class="reel-overlay-text">
        <div class="reel-author">
          <div class="reel-author-avatar" style="${authorStyle}">
            ${(author && author.profilePicture) ? '' : (author && author.name ? author.name.charAt(0).toUpperCase() : '?')}
          </div>
          <span class="reel-author-name">@${(author && author.username) || authorName}</span>
        </div>
        <div class="reel-title">${caption || 'ज्ञान प्रवाह'}</div>
        ${isVideo ? `
          <button class="reel-sound-badge" data-reel-id="${_id}">
            <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
              <path class="sound-wave" d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <span class="sound-label">${reelsMuted ? 'Tap for sound' : 'Sound on'}</span>
          </button>` : ''}
      </div>

      <!-- Right-side action buttons -->
      <div class="reel-actions">
        <button class="reel-action-btn" data-action="like" data-post-id="${_id}" data-liked="false">
          <div class="reel-action-icon">🤍</div>
          <span class="reel-action-count">${likeCount}</span>
        </button>
        <button class="reel-action-btn" data-action="comment" data-post-id="${_id}">
          <div class="reel-action-icon">💬</div>
          <span class="reel-action-count">${post.commentCount || 0}</span>
        </button>
        <button class="reel-action-btn" data-action="share" data-post-id="${_id}">
          <div class="reel-action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </div>
          <span class="reel-action-count">Share</span>
        </button>
        ${isVideo ? `
        <button class="reel-action-btn" data-action="mute" data-post-id="${_id}" aria-label="Toggle sound">
          <div class="reel-action-icon reel-mute-toggle-icon">${reelsMuted ? '🔇' : '🔊'}</div>
          <span class="reel-action-count">${reelsMuted ? 'Muted' : 'Sound'}</span>
        </button>` : ''}
      </div>`;

    /* Tap to mute/unmute on video area */
    if (isVideo) {
      const videoEl = card.querySelector('video');
      card.addEventListener('click', (e) => {
        /* Don't fire if clicking action buttons or sound badge */
        if (e.target.closest('.reel-actions') || e.target.closest('.reel-sound-badge')) return;
        toggleReelMute(videoEl, card, _id);
      });

      /* Sound badge */
      const soundBadge = card.querySelector('.reel-sound-badge');
      if (soundBadge) {
        soundBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleReelMute(videoEl, card, _id);
        });
      }

      /* Dedicated Audio/Mute toggle button on the right action rail */
      const muteBtn = card.querySelector('.reel-action-btn[data-action="mute"]');
      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleReelMute(videoEl, card, _id);
        });
      }
    }

    /* Like button */
    card.querySelector('[data-action="like"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      if (!token) {
        if (typeof showToast === 'function') showToast('Please log in to like', 'info');
        return;
      }
      const isLiked = btn.dataset.liked === 'true';
      const countEl = btn.querySelector('.reel-action-count');
      const iconEl = btn.querySelector('.reel-action-icon');
      const currentCount = parseInt(countEl.textContent) || 0;

      btn.dataset.liked = isLiked ? 'false' : 'true';
      iconEl.textContent = isLiked ? '🤍' : '❤️';
      countEl.textContent = isLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
      btn.classList.toggle('liked', !isLiked);

      try {
        await fetch(`/api/posts/${_id}/like`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (_) {}
    });

    /* Comment button */
    card.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openCommentsModal === 'function') {
        openCommentsModal(_id, caption || 'Reel');
      } else if (typeof openPostDetail === 'function') {
        openPostDetail(post, reelsData, index);
      }
    });

    /* Share button */
    card.querySelector('[data-action="share"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const shareUrl = `${window.location.origin}${window.location.pathname}#feed`;
      try {
        if (navigator.share) {
          await navigator.share({ title: caption || 'Sanatan Gyan Reel', url: shareUrl });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          if (typeof showToast === 'function') showToast('Link copied!', 'success');
        }
      } catch (_) {}
    });

    return card;
  }

  function toggleReelMute(videoEl, card, postId) {
    reelsMuted = !reelsMuted;
    videoEl.muted = reelsMuted;

    /* Flash mute icon */
    const muteOverlay = document.getElementById(`reel-mute-${postId}`);
    const muteIcon = muteOverlay?.querySelector('.reel-mute-icon');
    if (muteIcon) muteIcon.textContent = reelsMuted ? '🔇' : '🔊';

    if (muteOverlay) {
      muteOverlay.classList.add('show');
      clearTimeout(muteOverlay._hideTimer);
      muteOverlay._hideTimer = setTimeout(() => muteOverlay.classList.remove('show'), 900);
    }

    /* Update all sound badges */
    card.querySelectorAll('.sound-label').forEach(el => {
      el.textContent = reelsMuted ? 'Tap for sound' : 'Sound on';
    });

    /* Sync all reel videos mute state */
    document.querySelectorAll('#reelsSnapWrapper video').forEach(v => {
      v.muted = reelsMuted;
    });

    /* Sync the dedicated Audio/Mute action-rail button across all reels */
    document.querySelectorAll('.reel-action-btn[data-action="mute"]').forEach(btn => {
      const icon = btn.querySelector('.reel-mute-toggle-icon');
      const count = btn.querySelector('.reel-action-count');
      if (icon) icon.textContent = reelsMuted ? '🔇' : '🔊';
      if (count) count.textContent = reelsMuted ? 'Muted' : 'Sound';
    });
  }

  /* IntersectionObserver for autoplay as cards scroll into view */
  let reelObserver = null;

  function setupReelObserver() {
    if (reelObserver) reelObserver.disconnect();

    reelObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          /* Pause previous */
          if (currentReelVideo && currentReelVideo !== video) {
            currentReelVideo.pause();
          }
          video.muted = reelsMuted;
          video.play().catch(() => {
            /* Autoplay blocked — stay muted and try again */
            video.muted = true;
            video.play().catch(() => {});
          });
          currentReelVideo = video;
        } else {
          video.pause();
        }
      });
    }, {
      root: document.getElementById('reelsSnapWrapper'),
      threshold: 0.7
    });

    document.querySelectorAll('#reelsSnapWrapper .reel-card').forEach(card => {
      reelObserver.observe(card);
    });
  }

  async function loadAndOpenReels() {
    const container = document.getElementById('reelsFeedContainer');
    const wrapper = document.getElementById('reelsSnapWrapper');
    if (!container || !wrapper) return;

    /* Push history so hardware back closes reels */
    if (!reelsOpen) {
      history.pushState({ reelsFeed: true }, '', window.location.href);
    }

    container.classList.add('reels-open');
    reelsOpen = true;
    document.body.style.overflow = 'hidden';

    /* Load reels data if not already loaded */
    if (!reelsLoaded) {
      wrapper.innerHTML = `
        <div class="reel-skeleton">
          <div class="reel-skeleton-pulse">🕉️</div>
        </div>`;

      try {
        const res = await fetch('/api/posts?type=reel&limit=20');
        const data = await res.json();
        reelsData = (data.success && (data.reels || data.data)) ?
          (data.reels || data.data).filter(p => p.mediaType === 'reel') : [];
      } catch (_) {
        reelsData = [];
      }

      reelsLoaded = true;
      wrapper.innerHTML = '';

      if (reelsData.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'reels-empty-state';
        empty.innerHTML = `
          <div style="font-size:3rem;">🎬</div>
          <p>No reels yet.<br>Be the first to share a ज्ञान प्रवाह video!</p>`;
        wrapper.appendChild(empty);
      } else {
        reelsData.forEach((post, i) => {
          wrapper.appendChild(buildReelCard(post, i));
        });
        setupReelObserver();
      }
    }
  }

  function closeReelsFeed() {
    const container = document.getElementById('reelsFeedContainer');
    if (!container) return;

    /* Pause all videos */
    container.querySelectorAll('video').forEach(v => v.pause());
    currentReelVideo = null;

    container.classList.remove('reels-open');
    reelsOpen = false;
    document.body.style.overflow = '';
  }

  /* ────────────────────────────────────────────────────────────────
     STEP 4 — HISTORY API (hardware back button support)
  ──────────────────────────────────────────────────────────────── */
  window.addEventListener('popstate', (e) => {
    /* Reels overlay */
    if (reelsOpen) {
      closeReelsFeed();
      return;
    }
    /* Wisdom overlay */
    if (wisdomOpen) {
      closeWisdomOverlay();
      return;
    }
    /* Fall through to default hash routing handled by app.js */
  });

  /* ────────────────────────────────────────────────────────────────
     STEP 5 — EVENT LISTENERS (Wire up new UI elements)
  ──────────────────────────────────────────────────────────────── */
  function attachEventListeners() {

    /* ── Wisdom book button ── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#mobTopWisdomBtn');
      if (btn) {
        e.preventDefault();
        openWisdomOverlay();
      }
    });

    /* ── Any other "Explore Wisdom" entry point (hero CTA, nav link,
       section heading link) — on mobile these should open the same
       overlay instead of routing to a standalone #wisdom page, so
       Wisdom is reachable through one consistent mobile UI. ── */
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href="#wisdom"]');
      if (link && isMobile()) {
        e.preventDefault();
        openWisdomOverlay();
      }
    });

    /* ── Wisdom overlay back button ── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#wisdomOverlayBackBtn');
      if (btn) {
        e.preventDefault();
        if (wisdomOpen) history.back();
        else closeWisdomOverlay();
      }
    });

    /* ── Reels feed close button ── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#reelsFeedCloseBtn');
      if (btn) {
        e.preventDefault();
        if (reelsOpen) history.back();
        else closeReelsFeed();
      }
    });

    /* ── Feed "Video" filter pill → open Reels on mobile ── */
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('.feed-filter-tab[data-filter="reel"]');
      if (pill && isMobile()) {
        e.preventDefault();
        e.stopPropagation();
        loadAndOpenReels();
      }
    });

    /* ── Bottom nav feed/reel button — when on feed tab, clicking
       the camera icon again on mobile opens reels ── */
    const feedNavBtn = document.querySelector('.mob-nav-btn[data-nav="feed"]');
    if (feedNavBtn) {
      feedNavBtn.addEventListener('click', () => {
        /* Only intercept if already on feed tab and mobile */
        if (!isMobile()) return;
        /* Let normal navigation run first, then check if we should open reels */
        /* We do NOT force reels here — user needs to use the "Video" filter pill */
      });
    }

    /* ── Profile nav button ── */
    const profBtn = document.getElementById('mobProfileBtn');
    if (profBtn) {
      profBtn.addEventListener('click', () => {
        const token = localStorage.getItem('sg_token');
        if (!token) {
          if (typeof openAuthModal === 'function') openAuthModal();
          else document.getElementById('authModal')?.classList.remove('hidden');
        } else {
          if (typeof openProfileModal === 'function') openProfileModal();
          else if (typeof openPublicProfileModal === 'function') {
            const user = JSON.parse(localStorage.getItem('sg_user') || '{}');
            openPublicProfileModal(user.id || user._id, true);
          } else {
            document.getElementById('profileModal')?.classList.remove('hidden');
          }
        }
      });
    }

    /* ── Swipe-right-to-close on wisdom overlay ── */
    const wisdomOverlay = document.getElementById('wisdomOverlay');
    if (wisdomOverlay) {
      let touchStartX = 0;
      wisdomOverlay.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      wisdomOverlay.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (dx > 80 && touchStartX < 50) {
          /* Swipe right from left edge = go back */
          if (wisdomOpen) history.back();
        }
      }, { passive: true });
    }
  }

  /* ────────────────────────────────────────────────────────────────
     STEP 6 — MOBILE NAV ACTIVE STATE SYNC
     (extends app.js updateMobileNav with feed active class)
  ──────────────────────────────────────────────────────────────── */
  const _origUpdateMobileNav = window.updateMobileNav;
  window.updateMobileNav = function (section) {
    if (typeof _origUpdateMobileNav === 'function') {
      _origUpdateMobileNav(section);
    }
    /* Sync our extended state */
  };

  /* ────────────────────────────────────────────────────────────────
     STEP 7 — INIT
  ──────────────────────────────────────────────────────────────── */
  function init() {
    injectMobileDom();
    attachEventListeners();

    /* Reset reels cache when user logs in/out so fresh data loads */
    window.addEventListener('sg:authChanged', () => {
      reelsLoaded = false;
      reelsData = [];
      const wrapper = document.getElementById('reelsSnapWrapper');
      if (wrapper) wrapper.innerHTML = '';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
