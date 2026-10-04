// js/screens/home.js — dashboard
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  function statusLabel(v) {
    if (v === 'active') return 'Active';
    if (v === 'closed') return 'Closed';
    if (v === 'archived') return 'Archived';
    return v || '—';
  }

  function statusClass(v) {
    if (v === 'active') return 'badge badge--active';
    if (v === 'closed') return 'badge badge--closed';
    if (v === 'archived') return 'badge badge--archived';
    return 'badge';
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  async function safeRest(path, opts) {
    try {
      return await SB.rest(path, opts);
    } catch (e) {
      return null;
    }
  }

  shell.registerRoute('home', async function (ctx) {
    const user = ctx.user;

    // Parallel fetches
    const [matters, clients, docs, activities] = await Promise.all([
      safeRest('/lc_matters', {
        query: {
          select: 'id,title,matter_number,status,updated_at,lc_clients(name)',
          order: 'updated_at.desc',
          limit: '8',
        },
      }),
      safeRest('/lc_clients', {
        query: { select: 'id', limit: '1000' },
      }),
      safeRest('/lc_documents', {
        query: { select: 'id,status', limit: '1000' },
      }),
      safeRest('/lc_activities', {
        query: {
          select: 'id,icon,text,who,ref_type,ref_id,created_at',
          order: 'created_at.desc',
          limit: '6',
        },
      }),
    ]);

    const matterList = matters || [];
    const clientCount = (clients && clients.length) || 0;
    const docList = docs || [];
    const activityList = activities || [];

    let totalMatters = matterList.length;
    let activeMatters = matterList.filter(function (m) { return m.status === 'active'; }).length;
    try {
      const allMatters = await safeRest('/lc_matters', {
        query: { select: 'id,status', limit: '1000' },
      });
      if (allMatters) {
        totalMatters = allMatters.length;
        activeMatters = allMatters.filter(function (m) { return m.status === 'active'; }).length;
      }
    } catch (e) {}

    const needsReview = docList.filter(function (d) {
      return d.status === 'needs_review' || d.status === 'expiring';
    }).length;

    // ---- Stats row ----
    let statsHtml =
      '<div class="dash-stats">' +
        '<div class="dash-stat">' +
          '<div class="dash-stat__value">' + activeMatters + '</div>' +
          '<div class="dash-stat__label">Active matters</div>' +
        '</div>' +
        '<div class="dash-stat">' +
          '<div class="dash-stat__value">' + clientCount + '</div>' +
          '<div class="dash-stat__label">Clients</div>' +
        '</div>' +
        '<div class="dash-stat">' +
          '<div class="dash-stat__value">' + docList.length + '</div>' +
          '<div class="dash-stat__label">Documents</div>' +
        '</div>' +
        '<div class="dash-stat' + (needsReview ? ' dash-stat--warn' : '') + '">' +
          '<div class="dash-stat__value">' + needsReview + '</div>' +
          '<div class="dash-stat__label">Need review</div>' +
        '</div>' +
      '</div>';

    // ---- Quick actions ----
    const actionsHtml =
      '<div class="actions">' +
        '<a class="btn primary" href="#/clients/new">New client</a>' +
        '<a class="btn" href="#/matters/new">New matter</a>' +
        '<a class="btn" href="#/matters">All matters</a>' +
      '</div>';

    // ---- Recent matters ----
    let mattersHtml = '';
    if (matterList.length === 0) {
      mattersHtml = '<div class="empty">No matters yet. Open one from a client or use “New matter”.</div>';
    } else {
      mattersHtml = '<div class="list">';
      matterList.forEach(function (m) {
        const clientName = (m.lc_clients && m.lc_clients.name) ? m.lc_clients.name : '';
        mattersHtml +=
          '<a class="list-row" href="#/matters/' + esc(m.id) + '">' +
            '<div class="list-main">' +
              '<div class="list-title">' + esc(m.title) +
                ' <span class="' + statusClass(m.status) + '">' + esc(statusLabel(m.status)) + '</span>' +
              '</div>' +
              '<div class="list-sub">' +
                esc(clientName) +
                (m.matter_number ? ' · ' + esc(m.matter_number) : '') +
                (m.updated_at ? ' · ' + relativeTime(m.updated_at) : '') +
              '</div>' +
            '</div>' +
            '<div class="chev">›</div>' +
          '</a>';
      });
      mattersHtml += '</div>';
    }

    // ---- Activity feed ----
    let activityHtml = '';
    if (activityList.length === 0) {
      activityHtml = '<div class="empty">No recent activity yet.</div>';
    } else {
      activityHtml = '<div class="activity-list">';
      activityList.forEach(function (a) {
        let href = '';
        if (a.ref_type === 'matter' && a.ref_id) href = '#/matters/' + a.ref_id;
        else if (a.ref_type === 'client' && a.ref_id) href = '#/clients/' + a.ref_id;
        else if (a.ref_type === 'document' && a.ref_id) href = '#/documents/' + a.ref_id;

        const inner =
          '<div class="activity-icon">' + (a.icon ? esc(a.icon) : '•') + '</div>' +
          '<div class="activity-body">' +
            '<div class="activity-text">' + esc(a.text) + '</div>' +
            '<div class="activity-meta">' +
              (a.who ? esc(a.who) + ' · ' : '') +
              relativeTime(a.created_at) +
            '</div>' +
          '</div>';

        if (href) {
          activityHtml += '<a class="activity-row" href="' + esc(href) + '">' + inner + '</a>';
        } else {
          activityHtml += '<div class="activity-row">' + inner + '</div>';
        }
      });
      activityHtml += '</div>';
    }

    return (
      '<h1 class="page-title">' + greeting() + ', ' + esc((user.name || user.email || '').split(' ')[0] || 'there') + '</h1>' +
      '<p class="page-sub">Your filing room at a glance.</p>' +
      statsHtml +
      actionsHtml +
      '<section class="panel">' +
        '<div class="panel-head">' +
          '<h2>Recent matters</h2>' +
          '<a class="link-btn" href="#/matters">View all</a>' +
        '</div>' +
        mattersHtml +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head">' +
          '<h2>Recent activity</h2>' +
        '</div>' +
        activityHtml +
      '</section>'
    );
  });

  // ---- More screen (mobile bottom-nav target for non-admins) ----
  shell.registerRoute('more', async function (ctx) {
    const user = ctx.user;
    const isAdmin = Auth.isAdmin();

    let html =
      '<h1 class="page-title">More</h1>' +
      '<p class="page-sub">Account and shortcuts</p>' +
      '<section class="panel">' +
        '<div class="list">' +
          '<div class="list-row" style="cursor:default">' +
            '<div class="list-main">' +
              '<div class="list-title">' + esc(user.name || user.email) + '</div>' +
              '<div class="list-sub">' + esc(user.role || '') + (user.email ? ' · ' + esc(user.email) : '') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<div class="list">' +
          '<a class="list-row" href="#/clients"><div class="list-main"><div class="list-title">Clients</div></div><div class="chev">›</div></a>' +
          '<a class="list-row" href="#/matters"><div class="list-main"><div class="list-title">Matters</div></div><div class="chev">›</div></a>' +
          (isAdmin
            ? '<a class="list-row" href="#/settings"><div class="list-main"><div class="list-title">Settings</div></div><div class="chev">›</div></a>'
            : '') +
        '</div>' +
      '</section>';

    return html;
  });
})(window);
