// ================================================================
// social-graph.js — Instagram/Twitter-style one-tap Follow system
// (Point 4). Additive module: does NOT replace the existing follow
// buttons already wired up in app.js (feed cards, post detail,
// profile page) — those keep working exactly as before. This module
// gives every OTHER surface (comments, member lists, search cards) the
// same one-tap, optimistic-UI follow button, plus a lightweight
// Followers/Following drawer backed by the new paginated
// GET /api/users/:id/followers|following endpoints.
//
// Depends on globals already defined in app.js: getToken(), getStoredUser(),
// showToast(), escapeHtml(), renderAvatarInto(), openPublicProfile().
// ================================================================

(function (window, document) {
  'use strict';

  const API = {
    toggleFollow: (id) => `/api/users/${id}/follow`,
    followers: (id, page) => `/api/users/${id}/followers?page=${page}&limit=20`,
    following: (id, page) => `/api/users/${id}/following?page=${page}&limit=20`,
    removeFollower: (id) => `/api/users/followers/${id}`,
    unfollow: (id) => `/api/users/${id}/unfollow`
  };

  function authHeaders() {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('sg_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  /**
   * createFollowButton(userId, isFollowing, options?) -> HTMLButtonElement
   *
   * options:
   *   size: 'sm' | 'md'  (default 'sm') — controls padding/touch-target
   *   onChange(nowFollowing, followerCountDelta) — optional callback
   */
  function createFollowButton(userId, isFollowing, options = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sg-follow-btn ${options.size === 'md' ? 'sg-follow-btn--md' : 'sg-follow-btn--sm'}`;
    btn.dataset.userid = userId;
    btn.dataset.following = isFollowing ? 'true' : 'false';
    btn.textContent = isFollowing ? 'Following' : 'Follow';
    btn.classList.toggle('is-following', isFollowing);

    let busy = false;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (busy) return;

      const me = typeof getStoredUser === 'function' ? getStoredUser() : null;
      if (!me) {
        toast('Please log in to follow.', 'error');
        if (typeof openAuthModal === 'function') openAuthModal('login');
        return;
      }

      const wasFollowing = btn.dataset.following === 'true';

      // ── Optimistic UI update: flip instantly, no waiting on the network ──
      applyState(!wasFollowing);
      busy = true;

      try {
        const res = await fetch(API.toggleFollow(userId), {
          method: 'POST',
          headers: authHeaders()
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Could not update follow status.');
        }

        // Reconcile with the server's authoritative state (covers races where
        // two tabs/devices toggled the same relationship).
        applyState(!!data.following);
        if (typeof options.onChange === 'function') {
          options.onChange(!!data.following, data.followerCount);
        }
      } catch (err) {
        // ── Automatic rollback on failure ──
        applyState(wasFollowing);
        toast(err.message || 'Network error. Please try again.', 'error');
      } finally {
        busy = false;
      }
    });

    function applyState(following) {
      btn.dataset.following = following ? 'true' : 'false';
      btn.textContent = following ? 'Following' : 'Follow';
      btn.classList.toggle('is-following', following);
    }

    return btn;
  }

  /**
   * upgradeFollowButtons(root) — scans `root` (or the whole document) for any
   * element with `data-sg-follow-slot="<userId>" data-sg-following="true|false"`
   * and replaces it with a real optimistic follow button. Lets HTML templates
   * declare "a follow button goes here" without importing this module's JS API.
   */
  function upgradeFollowButtons(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-sg-follow-slot]').forEach((slot) => {
      const userId = slot.getAttribute('data-sg-follow-slot');
      const following = slot.getAttribute('data-sg-following') === 'true';
      const size = slot.getAttribute('data-sg-size') || 'sm';
      const btn = createFollowButton(userId, following, { size });
      slot.replaceWith(btn);
    });
  }

  // ----------------------------------------------------------------
  // Followers / Following Drawer (mobile: full-width bottom sheet,
  // desktop: centered modal) — paginated, one-tap Remove/Unfollow.
  // ----------------------------------------------------------------
  let drawerState = { userId: null, type: 'followers', page: 1, hasMore: false, loading: false };

  function ensureDrawerDom() {
    if (document.getElementById('sgDrawer')) return;

    const wrap = document.createElement('div');
    wrap.id = 'sgDrawer';
    wrap.className = 'sg-drawer-backdrop hidden';
    wrap.innerHTML = `
      <div class="sg-drawer-panel" role="dialog" aria-modal="true">
        <div class="sg-drawer-header">
          <p id="sgDrawerTitle" class="sg-drawer-title">Followers</p>
          <button type="button" id="sgDrawerClose" class="sg-drawer-close" aria-label="Close">✕</button>
        </div>
        <div id="sgDrawerList" class="sg-drawer-list"></div>
        <p id="sgDrawerEmpty" class="sg-drawer-empty hidden">Nobody here yet.</p>
        <button type="button" id="sgDrawerLoadMore" class="sg-drawer-loadmore hidden">Load more</button>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDrawer(); });
    wrap.querySelector('#sgDrawerClose').addEventListener('click', closeDrawer);
    wrap.querySelector('#sgDrawerLoadMore').addEventListener('click', () => loadDrawerPage(drawerState.page + 1));
  }

  function closeDrawer() {
    const el = document.getElementById('sgDrawer');
    if (el) el.classList.add('hidden');
    document.body.style.overflow = '';
  }

  async function openDrawer(userId, type) {
    ensureDrawerDom();
    drawerState = { userId, type, page: 1, hasMore: false, loading: false };

    const wrap = document.getElementById('sgDrawer');
    const title = document.getElementById('sgDrawerTitle');
    const list = document.getElementById('sgDrawerList');
    const empty = document.getElementById('sgDrawerEmpty');
    const loadMore = document.getElementById('sgDrawerLoadMore');

    title.textContent = type === 'followers' ? 'Followers' : 'Following';
    list.innerHTML = '<p class="sg-drawer-loading">Loading…</p>';
    empty.classList.add('hidden');
    loadMore.classList.add('hidden');

    wrap.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    await loadDrawerPage(1, true);
  }

  async function loadDrawerPage(page, isFirstLoad) {
    if (drawerState.loading) return;
    drawerState.loading = true;

    const list = document.getElementById('sgDrawerList');
    const empty = document.getElementById('sgDrawerEmpty');
    const loadMore = document.getElementById('sgDrawerLoadMore');
    const endpoint = drawerState.type === 'followers' ? API.followers : API.following;

    try {
      const res = await fetch(endpoint(drawerState.userId, page), { headers: authHeaders() });
      const data = await res.json();
      if (isFirstLoad) list.innerHTML = '';
      else list.querySelector('.sg-drawer-loading')?.remove();

      if (!data.success) throw new Error(data.message || 'Could not load list.');

      if (isFirstLoad && data.data.length === 0) {
        empty.classList.remove('hidden');
        drawerState.loading = false;
        return;
      }

      const me = typeof getStoredUser === 'function' ? getStoredUser() : null;
      const isOwnList = me && me.id === drawerState.userId;

      data.data.forEach((person) => list.appendChild(buildDrawerRow(person, isOwnList)));

      drawerState.page = page;
      drawerState.hasMore = !!data.hasMore;
      loadMore.classList.toggle('hidden', !drawerState.hasMore);
    } catch (err) {
      if (isFirstLoad) list.innerHTML = `<p class="sg-drawer-error">${escapeHtml(err.message || 'Could not load list.')}</p>`;
      toast(err.message || 'Could not load list.', 'error');
    } finally {
      drawerState.loading = false;
    }
  }

  function buildDrawerRow(person, isOwnList) {
    const row = document.createElement('div');
    row.className = 'sg-drawer-row';

    const avatar = document.createElement('button');
    avatar.type = 'button';
    avatar.className = 'sg-drawer-avatar';
    row.appendChild(avatar);

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'sg-drawer-info';
    info.innerHTML = `
      <span class="sg-drawer-name">${escapeHtml(person.name)}</span>
      <span class="sg-drawer-username">@${escapeHtml(person.username || '')}</span>
    `;
    row.appendChild(info);

    if (typeof renderAvatarInto === 'function') {
      renderAvatarInto(avatar, { name: person.name, avatarColor: person.avatarColor, profilePicture: person.profilePicture });
    }

    const goToProfile = () => {
      closeDrawer();
      if (typeof openPublicProfile === 'function') openPublicProfile(person.id);
    };
    avatar.addEventListener('click', goToProfile);
    info.addEventListener('click', goToProfile);

    // Own list → one-tap Remove (followers) / Unfollow (following).
    // Someone else's list → a normal optimistic Follow button.
    if (isOwnList) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'sg-drawer-action-btn';
      actionBtn.textContent = drawerState.type === 'followers' ? 'Remove' : 'Unfollow';
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        const original = actionBtn.textContent;
        actionBtn.textContent = '…';
        try {
          const endpoint = drawerState.type === 'followers' ? API.removeFollower(person.id) : API.unfollow(person.id);
          const res = await fetch(endpoint, { method: 'DELETE', headers: authHeaders() });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message || 'Action failed.');
          row.remove();
          toast(drawerState.type === 'followers' ? 'Removed follower.' : 'Unfollowed.', 'success');
        } catch (err) {
          actionBtn.disabled = false;
          actionBtn.textContent = original;
          toast(err.message || 'Action failed.', 'error');
        }
      });
      row.appendChild(actionBtn);
    } else {
      row.appendChild(createFollowButton(person.id, !!person.isFollowing, { size: 'sm' }));
    }

    return row;
  }

  window.SocialGraph = {
    createFollowButton,
    upgradeFollowButtons,
    openDrawer,
    closeDrawer
  };

  document.addEventListener('DOMContentLoaded', () => upgradeFollowButtons(document));
})(window, document);
