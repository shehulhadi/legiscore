/**
 * LegisCore — pages/settings.js
 * Settings page with three tabs: Firm, Staff, Activity.
 * Exposes window.LegisCoreSettings.render(container).
 *
 * Admin-only — the route in app.js restricts to role 'administrator'.
 * No staff creation here: adding a new staff member is a manual step,
 * documented in README, because client-side signup would end the
 * admin's own session.
 */

(function(window) {
    'use strict';

    const settingsApi = window.LegisCoreSettingsApi;
    const state       = window.LegisCoreState;

    if (!settingsApi || !state) {
        console.error('[LegisCoreSettings] api and state must load first.');
        return;
    }

    const TABS = [
        { id: 'firm',     label: 'Firm' },
        { id: 'staff',    label: 'Staff' },
        { id: 'activity', label: 'Activity record' },
    ];

    const ROLES = [
        { v: 'administrator', label: 'Administrator' },
        { v: 'secretary',     label: 'Secretary' },
    ];

    let activeTab = 'firm';
    let orgCache = null;
    let staffCache = null;

    // ---- helpers ------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function initials(name) {
        if (!name) return '?';
        return name.split(/\s+/).slice(0, 2)
            .map(function(p) { return (p[0] || '').toUpperCase(); })
            .join('') || '?';
    }

    function fmtDateTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function fmtRelative(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const diff = Date.now() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }

    function roleBadge(role) {
        if (role === 'administrator') return '<span class="badge badge-primary">Administrator</span>';
        if (role === 'secretary')     return '<span class="badge badge-muted">Secretary</span>';
        return '<span class="badge badge-muted">' + esc(role || '—') + '</span>';
    }

    function activeBadge(active) {
        return active
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-danger">Deactivated</span>';
    }

    // ---- tabs ---------------------------------------------------------

    function tabsHtml() {
        return '<div class="tabs">' +
            TABS.map(function(t) {
                const active = t.id === activeTab ? ' active' : '';
                return '<button class="tab' + active + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
            }).join('') +
        '</div>';
    }

    function wireTabs(container) {
        container.querySelectorAll('[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const id = btn.getAttribute('data-tab');
                if (id === activeTab) return;
                activeTab = id;
                render(container);
            });
        });
    }

    // ---- FIRM TAB -----------------------------------------------------

    function renderFirmTab(container) {
        const el = container.querySelector('#settings-body');
        if (!orgCache) {
            el.innerHTML = skeletonCard('Firm profile');
        } else {
            const o = orgCache;
            el.innerHTML =
                '<div class="card">' +
                    '<div class="card-header">' +
                        '<h3 class="card-title">Firm profile</h3>' +
                    '</div>' +
                    '<div class="card-body">' +
                        '<div class="form-group">' +
                            '<label for="st-firm-name">Firm name</label>' +
                            '<input type="text" id="st-firm-name" class="form-control" value="' + esc(o.name || '') + '" required>' +
                        '</div>' +
                        '<div class="form-row">' +
                            '<div class="form-group">' +
                                '<label for="st-firm-country">Country</label>' +
                                '<input type="text" id="st-firm-country" class="form-control" value="' + esc(o.country || '') + '" placeholder="e.g. Nigeria">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="st-firm-industry">Industry</label>' +
                                '<input type="text" id="st-firm-industry" class="form-control" value="' + esc(o.industry || 'Legal Services') + '">' +
                            '</div>' +
                        '</div>' +
                        '<div class="form-hint">' +
                            'The firm name appears in the sidebar footer and on the login screen.' +
                        '</div>' +
                        '<div style="margin-top:var(--s-5);display:flex;justify-content:flex-end">' +
                            '<button class="btn btn-primary" id="st-firm-save">Save changes</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="card" style="margin-top:var(--s-5)">' +
                    '<div class="card-header">' +
                        '<h3 class="card-title">What is not here yet</h3>' +
                    '</div>' +
                    '<div class="card-body text-sm text-muted" style="line-height:1.7">' +
                        'Folder labels and document types are currently fixed in the app. ' +
                        'Automatic backups are a feature of the local (desk) version. ' +
                        'Both are on the roadmap.' +
                    '</div>' +
                '</div>';

            const saveBtn = el.querySelector('#st-firm-save');
            saveBtn.addEventListener('click', async function() {
                const name = (document.getElementById('st-firm-name').value || '').trim();
                const country = (document.getElementById('st-firm-country').value || '').trim();
                const industry = (document.getElementById('st-firm-industry').value || '').trim();
                if (!name) { alert('Firm name is required.'); return; }
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                try {
                    const updated = await settingsApi.updateOrganization({ name: name, country: country, industry: industry });
                    orgCache = updated || Object.assign({}, orgCache, { name: name, country: country, industry: industry });
                    render(container);
                } catch (err) {
                    alert('Could not save: ' + (err.message || 'unknown error'));
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save changes';
                }
            });
        }
    }

    // ---- STAFF TAB ----------------------------------------------------

    function renderStaffTab(container) {
        const el = container.querySelector('#settings-body');
        if (!staffCache) {
            el.innerHTML = skeletonCard('Staff');
            return;
        }

        const rows = staffCache.map(function(u) {
            const me = (state.get('user') || {}).id === u.id;

            // Line 1: name + role badge, side by side.
            // Line 2: email + joined date. Deactivated staff show a small badge here.
            const subParts = [esc(u.email)];
            if (u.active === false) subParts.push('Deactivated');
            subParts.push(fmtRelative(u.created_at));

            return (
                '<div class="doc-row st-edit-user" data-user-id="' + esc(u.id) + '" style="cursor:pointer' + (u.active === false ? ';opacity:0.7' : '') + '">' +
                    '<div class="user-avatar">' + esc(initials(u.name)) + '</div>' +
                    '<div class="doc-meta">' +
                        '<div style="display:flex;align-items:center;gap:var(--s-2);min-width:0">' +
                            '<div class="doc-name" style="flex:1;min-width:0">' +
                                esc(u.name) +
                                (me ? ' <span class="text-xs text-muted">(you)</span>' : '') +
                            '</div>' +
                            roleBadge(u.role) +
                        '</div>' +
                        '<div class="doc-sub">' +
                            subParts.map(function(p, i) {
                                return (i > 0 ? '<span class="dot-sep"></span>' : '') + '<span>' + p + '</span>';
                            }).join('') +
                        '</div>' +
                    '</div>' +
                    '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>'
            );
        }).join('');

        el.innerHTML =
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Staff (' + staffCache.length + ')</h3>' +
                '</div>' +
                '<div class="card-body" style="padding:var(--s-2) var(--s-3)">' +
                    (rows || '<div class="empty-state" style="padding:var(--s-6)"><p class="empty-state-desc">No staff yet.</p></div>') +
                '</div>' +
            '</div>' +
            '<div class="card" style="margin-top:var(--s-5)">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Adding new staff</h3>' +
                '</div>' +
                '<div class="card-body text-sm text-muted" style="line-height:1.7">' +
                    'New staff accounts are created by the firm administrator through the LegisCore setup process. ' +
                    'Until that flow is automated, add new staff by contacting your LegisCore installer. ' +
                    'Existing staff can be edited here — change their role, or deactivate their account.' +
                '</div>' +
            '</div>';

        el.querySelectorAll('.st-edit-user').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const id = btn.getAttribute('data-user-id');
                const user = staffCache.filter(function(u) { return u.id === id; })[0];
                if (user) openStaffEditModal(user, container);
            });
        });
    }

    function openStaffEditModal(user, container) {
        const me = (state.get('user') || {}).id === user.id;

        const bd = document.createElement('div');
        bd.className = 'modal-backdrop';
        bd.innerHTML =
            '<div class="modal" role="dialog" aria-modal="true">' +
                '<div class="modal-header">' +
                    '<h2 class="modal-title">Edit staff</h2>' +
                    '<button class="topbar-icon-btn" id="st-close" aria-label="Close">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    '<div class="form-group">' +
                        '<label>Name</label>' +
                        '<input type="text" id="st-name" class="form-control" value="' + esc(user.name) + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Email</label>' +
                        '<input type="text" class="form-control" value="' + esc(user.email) + '" disabled>' +
                        '<div class="form-hint">Email cannot be changed here.</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="st-role">Role</label>' +
                        '<select id="st-role" class="form-control">' +
                            ROLES.map(function(r) {
                                return '<option value="' + esc(r.v) + '"' + (r.v === user.role ? ' selected' : '') + '>' + esc(r.label) + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Status</label>' +
                        '<div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3);background:var(--surface-muted);border-radius:var(--r)">' +
                            '<span class="text-sm">' + (user.active ? 'Account is active' : 'Account is deactivated') + '</span>' +
                            (me
                                ? '<span class="text-xs text-muted" style="margin-left:auto">You cannot deactivate yourself</span>'
                                : '<button class="btn ' + (user.active ? 'btn-danger-ghost' : 'btn-secondary') + ' btn-sm" id="st-toggle-active" style="margin-left:auto">' +
                                    (user.active ? 'Deactivate' : 'Reactivate') +
                                  '</button>'
                            ) +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="modal-footer">' +
                    '<button class="btn btn-secondary" id="st-cancel">Cancel</button>' +
                    '<button class="btn btn-primary" id="st-save">Save</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(bd);

        let pendingActive = user.active;

        function close() {
            if (bd.parentNode) bd.parentNode.removeChild(bd);
        }

        bd.querySelector('#st-close').addEventListener('click', close);
        bd.querySelector('#st-cancel').addEventListener('click', close);
        bd.addEventListener('click', function(e) { if (e.target === bd) close(); });

        const toggle = bd.querySelector('#st-toggle-active');
        if (toggle) {
            toggle.addEventListener('click', function() {
                pendingActive = !pendingActive;
                const label = bd.querySelector('#st-toggle-active');
                if (pendingActive) {
                    label.textContent = 'Deactivate';
                    label.className = 'btn btn-danger-ghost btn-sm';
                } else {
                    label.textContent = 'Reactivate';
                    label.className = 'btn btn-secondary btn-sm';
                }
                bd.querySelector('.text-sm').textContent = pendingActive ? 'Account is active' : 'Account is deactivated';
            });
        }

        bd.querySelector('#st-save').addEventListener('click', async function() {
            const name = (bd.querySelector('#st-name').value || '').trim();
            const role = bd.querySelector('#st-role').value;
            if (!name) { alert('Name is required.'); return; }

            // Guard: cannot leave the firm with zero active admins
            if (user.role === 'administrator' && (role !== 'administrator' || !pendingActive)) {
                const adminCount = await settingsApi.countAdmins();
                if (adminCount <= 1) {
                    alert('Cannot change: this is the only active administrator. Promote someone else first.');
                    return;
                }
            }
            if (me && !pendingActive) {
                alert('You cannot deactivate your own account.');
                return;
            }

            const saveBtn = bd.querySelector('#st-save');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try {
                await settingsApi.updateStaff(user.id, { name: name, role: role, active: pendingActive });
                close();
                staffCache = null;
                render(container);
            } catch (err) {
                alert('Could not save: ' + (err.message || 'unknown error'));
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        });
    }

    // ---- ACTIVITY TAB -------------------------------------------------

    let activityState = { ref_type: '', limit: 100 };

    async function loadActivity() {
        const el = document.getElementById('settings-body');
        if (!el) return;
        el.innerHTML = skeletonCard('Activity');
        try {
            const rows = await settingsApi.listActivity(activityState);
            renderActivityRows(el, rows || []);
        } catch (err) {
            el.innerHTML = '<div class="alert alert-error">' + esc(err.message || 'Could not load activity.') + '</div>';
        }
    }

    function renderActivityRows(el, rows) {
        const types = [
            { v: '',          label: 'All' },
            { v: 'document',  label: 'Documents' },
            { v: 'client',    label: 'Clients' },
            { v: 'matter',    label: 'Matters' },
            { v: 'deadline',  label: 'Deadlines' },
            { v: 'physical_file', label: 'Physical files' },
        ];

        const chips = '<div class="chip-row" id="st-act-chips">' +
            types.map(function(t) {
                const active = activityState.ref_type === t.v ? ' active' : '';
                return '<button class="chip' + active + '" data-type="' + esc(t.v) + '">' + esc(t.label) + '</button>';
            }).join('') +
        '</div>';

        const list = rows.length === 0
            ? '<div class="empty-state" style="padding:var(--s-6)"><div class="empty-state-icon">&#128220;</div><p class="empty-state-desc">No activity to show.</p></div>'
            : rows.map(function(a) {
                return (
                    '<div style="display:grid;grid-template-columns:140px 1fr;gap:var(--s-3);padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft);align-items:start">' +
                        '<div class="text-xs text-muted" style="padding-top:3px">' + esc(fmtDateTime(a.created_at)) + '</div>' +
                        '<div>' +
                            '<div class="text-sm">' + esc(a.text) + '</div>' +
                            '<div class="text-xs text-muted" style="margin-top:2px">' +
                                esc(a.who || 'system') +
                                (a.ref_type ? ' &middot; ' + esc(a.ref_type) : '') +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );
            }).join('');

        el.innerHTML =
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Activity record (' + rows.length + ')</h3>' +
                '</div>' +
                '<div class="card-body">' +
                    chips +
                    '<div style="margin-top:var(--s-3)">' + list + '</div>' +
                '</div>' +
            '</div>';

        el.querySelectorAll('#st-act-chips .chip').forEach(function(c) {
            c.addEventListener('click', function() {
                activityState.ref_type = c.getAttribute('data-type');
                loadActivity();
            });
        });
    }

    // ---- skeletons ----------------------------------------------------

    function skeletonCard(title) {
        let body = '';
        for (let i = 0; i < 3; i++) {
            body +=
                '<div style="padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div class="skeleton skeleton-line" style="width:60%"></div>' +
                    '<div class="skeleton skeleton-line short" style="margin-top:6px"></div>' +
                '</div>';
        }
        return (
            '<div class="card">' +
                '<div class="card-header"><h3 class="card-title">' + esc(title) + '</h3></div>' +
                '<div class="card-body">' + body + '</div>' +
            '</div>'
        );
    }

    // ---- main render --------------------------------------------------

    async function render(container) {
        if (!container) return;

        const orgId = state.get('orgId');
        if (!orgId) {
            container.innerHTML = '<div class="alert alert-error">Your profile is not linked to an organization.</div>';
            return;
        }

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<div class="uppercase">Administrator</div>' +
                    '<h1>Settings</h1>' +
                    '<p class="page-subtitle">Manage your firm, your staff, and the activity record.</p>' +
                '</div>' +
            '</div>' +
            tabsHtml() +
            '<div id="settings-body"></div>';

        wireTabs(container);

        if (activeTab === 'firm') {
            if (!orgCache) {
                try {
                    orgCache = await settingsApi.getOrganization();
                } catch (err) {
                    container.querySelector('#settings-body').innerHTML =
                        '<div class="alert alert-error">' + esc(err.message || 'Could not load firm profile.') + '</div>';
                    return;
                }
            }
            renderFirmTab(container);
        } else if (activeTab === 'staff') {
            if (!staffCache) {
                container.querySelector('#settings-body').innerHTML = skeletonCard('Staff');
                try {
                    staffCache = await settingsApi.listStaff();
                } catch (err) {
                    container.querySelector('#settings-body').innerHTML =
                        '<div class="alert alert-error">' + esc(err.message || 'Could not load staff.') + '</div>';
                    return;
                }
            }
            renderStaffTab(container);
        } else if (activeTab === 'activity') {
            await loadActivity();
        }
    }

    window.LegisCoreSettings = { render: render };

})(window);
