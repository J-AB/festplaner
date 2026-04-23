const firebaseConfig = {
    apiKey: "AIzaSyBgEL-pylLEkGJfv7g5NxMsupH-teoD7wA",
    authDomain: "musikfest-planer.firebaseapp.com",
    databaseURL: "https://musikfest-planer-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "musikfest-planer"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const CATEGORIES = {
    location:    { label: "Location",     color: "#c8a45a", icon: "⛺" },
    amt:         { label: "Amt",          color: "#7ab8d4", icon: "🏛️" },
    programm:    { label: "Programm",     color: "#9b7ec8", icon: "🎵" },
    werbung:     { label: "Werbung",      color: "#6bbf8e", icon: "📰" },
    bestellungen:{ label: "Bestellungen", color: "#e07b5a", icon: "🍺" },
    finanzen:    { label: "Finanzen",     color: "#d4a847", icon: "💰" },
    sonstiges:   { label: "Sonstiges",    color: "#888888", icon: "⚙️" }
};

let state = { events: {}, users: {}, currentUser: null, currentEventId: 'home', catFilter: 'all', userFilter: 'all' };
let activeTaskId = null, activeTaskEventId = null;
let hasAutoLoggedIn = false;

// Daten laden & Auto-Login
db.ref('festplaner_v4').on('value', snap => {
    state.events = snap.val()?.events || {};
    state.users = snap.val()?.users || {};
    
    if (!state.currentUser && !hasAutoLoggedIn) {
        const sU = localStorage.getItem('festplaner_user');
        const sP = localStorage.getItem('festplaner_pass');
        if (sU && sP) {
            hasAutoLoggedIn = true;
            document.getElementById("login-user").value = sU;
            document.getElementById("login-pass").value = sP;
            handleLogin();
        }
    }
    render();
});

function handleLogin() {
    const u = document.getElementById("login-user").value.toLowerCase().trim();
    const p = document.getElementById("login-pass").value.trim();
    const adminUser = (u === 'admin' && p === '1234') ? {name:'admin', pass:'1234', isAdmin: true} : null;
    const user = adminUser || state.users[u];
    if(user && user.pass === p) {
        state.currentUser = user;
        localStorage.setItem('festplaner_user', u);
        localStorage.setItem('festplaner_pass', p);
        document.getElementById("login-screen").style.display = "none";
        if(user.isAdmin) document.getElementById("admin-tools").style.display = "block";
        document.getElementById("user-info").innerHTML = `User: <b>${user.name}</b>`;
        render();
    } else {
        alert("Login falsch!");
        localStorage.clear();
    }
}

function getMyRole(evId) {
    if(state.currentUser?.isAdmin) return 'planer';
    return state.events[evId]?.roles?.[state.currentUser.name] || 'keine';
}

function getDaysUntilDeadline(evDate, t) {
    if (!evDate || !t.weeks) return 999;
    const deadline = new Date(new Date(evDate).getTime() - (t.weeks * 7 * 86400000));
    const diffTime = deadline - new Date();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function render() {
    if(!state.currentUser) return;
    const sortedEvents = Object.entries(state.events).sort((a,b) => new Date(a[1].date||0) - new Date(b[1].date||0));
    
    document.getElementById("event-list-ui").innerHTML = sortedEvents.map(([id, ev]) => {
        const role = getMyRole(id);
        const myTasks = (ev.tasks || []).filter(t => t.assignee === state.currentUser.name && !t.done);
        if(!state.currentUser.isAdmin && role === 'keine' && myTasks.length === 0) return '';
        return `<div style="padding:10px; background:#1a1a30; border-radius:8px; margin-bottom:5px; cursor:pointer; border:1px solid ${id===state.currentEventId?'var(--accent)':'transparent'}" onclick="selectEvent('${id}')">
            <div style="font-weight:bold; font-size:13px">${ev.name}</div>
            <div style="font-size:9px; color:var(--accent)">${role} ${myTasks.length>0?'• '+myTasks.length:''}</div>
        </div>`;
    }).join('');

    const taskList = document.getElementById("task-list");
    const filterArea = document.getElementById("filter-container");
    const statsArea = document.getElementById("stats-ui");

    if(state.currentEventId === 'home') {
        document.getElementById("current-event-name").textContent = "Meine Aufgaben";
        filterArea.style.display = "none"; statsArea.style.display = "none";
        document.getElementById("admin-ev-edit").style.display = "none";
        document.getElementById("add-btn").style.display = "none";
        let html = "";
        sortedEvents.forEach(([evId, ev]) => {
            const role = getMyRole(evId);
            let my = (ev.tasks || []).filter(t => t.assignee === state.currentUser.name && !t.done);
            if(role !== 'planer') my = my.filter(t => t.category !== 'finanzen');
            if(my.length > 0) {
                html += `<div style="color:var(--accent); margin:15px 0 5px; font-size:11px; border-bottom:1px solid #222; padding-bottom:3px;">${ev.name}</div>`;
                my.sort((a,b) => getDaysUntilDeadline(ev.date, a) - getDaysUntilDeadline(ev.date, b)).forEach(t => html += renderTaskCard(t, evId, ev.date));
            }
        });
        taskList.innerHTML = html || "<p style='text-align:center; opacity:0.5; margin-top:40px;'>Alles erledigt! 😎</p>";
    } else {
        const ev = state.events[state.currentEventId];
        const role = getMyRole(state.currentEventId);
        document.getElementById("current-event-name").textContent = ev.name;
        filterArea.style.display = "block"; statsArea.style.display = "grid";
        document.getElementById("admin-ev-edit").style.display = (role === 'planer') ? "block" : "none";
        document.getElementById("add-btn").style.display = (role !== 'keine') ? "block" : "none";
        document.getElementById("stat-budget-card").style.display = (role === 'planer') ? "block" : "none";

        let catHtml = `<div class="icon-filter ${state.catFilter==='all'?'active':''}" onclick="state.catFilter='all';render()">🌍</div>`;
        Object.entries(CATEGORIES).forEach(([k, c]) => {
            if(k === 'finanzen' && role !== 'planer') return;
            catHtml += `<div class="icon-filter ${state.catFilter===k?'active':''}" onclick="state.catFilter='${k}';render()">${c.icon}</div>`;
        });
        document.getElementById("cat-filters").innerHTML = catHtml;

        const allTasks = ev.tasks || [];
        const activeUsers = [...new Set(allTasks.map(t => t.assignee).filter(Boolean))];
        let userHtml = `<div class="user-filter ${state.userFilter==='all'?'active':''}" onclick="state.userFilter='all';render()">Alle</div>`;
        userHtml += `<div class="user-filter ${state.userFilter==='me'?'active':''}" onclick="state.userFilter='me';render()">Meine</div>`;
        activeUsers.forEach(u => { if(u !== state.currentUser.name) userHtml += `<div class="user-filter ${state.userFilter===u?'active':''}" onclick="state.userFilter='${u}';render()">${u}</div>`; });
        document.getElementById("user-filters").innerHTML = userHtml;

        let tasks = allTasks.map(t => {
            if (t.preTask) { const pre = allTasks.find(p => p.id == t.preTask); t.isLocked = (pre && !pre.done); } else t.isLocked = false;
            return t;
        });

        if(role !== 'planer') {
            tasks = tasks.filter(t => t.category !== 'finanzen');
            if(role === 'helfer') tasks = tasks.filter(t => t.assignee === state.currentUser.name);
            tasks = tasks.filter(t => !t.isLocked || t.assignee === state.currentUser.name);
        }

        if(state.catFilter !== 'all') tasks = tasks.filter(t => t.category === state.catFilter);
        if(state.userFilter === 'me') tasks = tasks.filter(t => t.assignee === state.currentUser.name);
        else if(state.userFilter !== 'all') tasks = tasks.filter(t => t.assignee === state.userFilter);

        tasks.sort((a, b) => { if (a.done !== b.done) return a.done - b.done; return getDaysUntilDeadline(ev.date, a) - getDaysUntilDeadline(ev.date, b); });
        
        document.getElementById("stat-progress").textContent = `${allTasks.filter(t => t.done).length} / ${allTasks.length}`;
        document.getElementById("stat-budget").textContent = `${allTasks.reduce((sum, t) => sum + (parseFloat(t.cost) || 0), 0).toFixed(0)} €`;
        const dL = ev.date ? Math.ceil((new Date(ev.date) - new Date()) / 86400000) : '-';
        document.getElementById("stat-days").innerHTML = `${ev.date?(dL/7).toFixed(1):'-'} <small style="font-size:8px">Wo.</small> / ${dL} <small style="font-size:8px">Tg.</small>`;

        taskList.innerHTML = tasks.length ? tasks.map(t => renderTaskCard(t, state.currentEventId, ev.date)).join('') : "Keine Aufgaben sichtbar.";
    }
}

function renderTaskCard(t, evId, evDate) {
    const role = getMyRole(evId);
    const isLocked = t.isLocked;
    const canEdit = (role === 'planer') || (t.assignee === state.currentUser.name) || (!t.assignee && role !== 'keine');
    const cat = CATEGORIES[t.category] || CATEGORIES.sonstiges;
    const diff = getDaysUntilDeadline(evDate, t);
    let sCls = "", cdL = "Offen", cdC = "";
    if (isLocked) sCls = "status-locked";
    else if (t.done) { sCls = "status-done"; cdL = "✓"; }
    else if (evDate && t.weeks) {
        if (diff < 0) { sCls = "status-overdue"; cdL = "Fällig!"; cdC = "overdue"; }
        else if (diff <= 7) { sCls = "status-urgent"; cdL = diff + " Tg."; cdC = "urgent"; }
        else cdL = diff + " Tg.";
    }
    const stamp = t.lastChanged ? `<span style="color:${t.done?'var(--safe)':'#505070'}; font-size:9px; margin-left:auto; opacity:0.7;">✍️ ${t.lastChanged}</span>` : '';
    return `
      <div class="task-card ${sCls}">
        <input type="checkbox" ${t.done?'checked':''} ${isLocked?'disabled':''} onchange="toggleTask('${evId}', ${t.id})" style="width:22px; height:22px">
        <div class="cat-box" style="background:${cat.color}22; color:${cat.color}">${isLocked?'🔒':cat.icon}</div>
        <div class="task-info" onclick="${(canEdit && (role==='planer'||!isLocked))?`openEdit('${evId}', ${t.id})`:''}">
          <div style="font-weight:bold; font-size:14px; display:flex; justify-content:space-between;">
            <span>${t.title}</span>
            ${(t.cost && role === 'planer') ? `<span style="color:var(--safe); font-size:11px;">${t.cost}€</span>` : ''}
          </div>
          ${t.notes ? `<div style="font-size:11px; color:#a0a0b0; margin:4px 0; font-style:italic; border-left:2px solid #3a3a6a; padding-left:8px;">${t.notes}</div>` : ''}
          <div class="meta-row">
            ${isLocked ? `<span style="color:var(--danger); font-size:9px;">🔒 Wartet auf Vorgänger</span>` : `<span class="cd-badge ${cdC}">${cdL}</span>`}
            <span style="color:#707090">${t.assignee || 'Offen'}</span>
            ${stamp}
          </div>
        </div>
      </div>`;
}

function toggleTask(evId, id) {
    const tasks = [...state.events[evId].tasks];
    const idx = tasks.findIndex(x => x.id === id);
    tasks[idx].done = !tasks[idx].done;
    const now = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    tasks[idx].lastChanged = `${tasks[idx].done?now:'Offen'} - ${state.currentUser.name}`;
    db.ref(`festplaner_v4/events/${evId}/tasks`).set(tasks);
}

function saveEdit() {
    const tasks = [...state.events[activeTaskEventId].tasks];
    const idx = tasks.findIndex(x => x.id === activeTaskId);
    tasks[idx].title = document.getElementById("ed-title").value;
    tasks[idx].category = document.getElementById("ed-cat").value;
    tasks[idx].weeks = parseInt(document.getElementById("ed-weeks").value) || 0;
    if(document.getElementById("ed-cost-field").style.display !== 'none') tasks[idx].cost = parseFloat(document.getElementById("ed-cost").value) || 0;
    tasks[idx].notes = document.getElementById("ed-notes").value;
    tasks[idx].assignee = document.getElementById("ed-assignee").value;
    tasks[idx].preTask = document.getElementById("ed-pretask").value;
    tasks[idx].lastChanged = `${new Date().toLocaleDateString('de-DE')} - ${state.currentUser.name}`;
    db.ref(`festplaner_v4/events/${activeTaskEventId}/tasks`).set(tasks);
    closeModals();
}

function openEdit(evId, taskId) {
    activeTaskEventId = evId; activeTaskId = taskId;
    const ev = state.events[evId];
    const t = ev.tasks.find(x => x.id === taskId);
    const role = getMyRole(evId);
    document.getElementById("ed-title").value = t.title;
    document.getElementById("ed-weeks").value = t.weeks || 0;
    document.getElementById("ed-cost").value = t.cost || 0;
    document.getElementById("ed-notes").value = t.notes || "";
    document.getElementById("ed-cost-field").style.display = (role === 'planer') ? "block" : "none";
    document.getElementById("ed-cat").innerHTML = Object.entries(CATEGORIES).filter(([k]) => role === 'planer' || k !== 'finanzen').map(([k,c]) => `<option value="${k}" ${t.category===k?'selected':''}>${c.icon} ${c.label}</option>`).join('');
    const uList = Object.keys(ev.roles || {}).filter(n => ev.roles[n] !== 'keine');
    document.getElementById("ed-assignee").innerHTML = '<option value="">Offen</option>' + uList.map(u => `<option value="${u}" ${t.assignee===u?'selected':''}>${u}</option>`).join('');
    let preHtml = '<option value="">Sofort verfügbar</option>';
    ev.tasks.filter(x => x.id !== taskId).forEach(ot => { preHtml += `<option value="${ot.id}" ${t.preTask == ot.id ? 'selected':''}>${ot.title}</option>`; });
    document.getElementById("ed-pretask").innerHTML = preHtml;
    document.getElementById("edit-modal").style.display = "flex";
}

function openEventEdit() {
    const ev = state.events[state.currentEventId];
    document.getElementById("ev-edit-name").value = ev.name;
    document.getElementById("ev-edit-date").value = ev.date || "";
    let h = "";
    Object.values(state.users).forEach(u => {
        const r = ev.roles?.[u.name] || 'keine';
        h += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; background:#1a1a30; padding:8px; border-radius:5px; font-size:12px;">
            <span>${u.name}</span>
            <select onchange="db.ref('festplaner_v4/events/${state.currentEventId}/roles/${u.name}').set(this.value)" style="background:#000; color:#fff;">
                <option value="keine" ${r==='keine'?'selected':''}>Aus</option>
                <option value="planer" ${r==='planer'?'selected':''}>Planer</option>
                <option value="helferVIP" ${r==='helferVIP'?'selected':''}>Helfer VIP</option>
                <option value="helfer" ${r==='helfer'?'selected':''}>Helfer</option>
            </select></div>`;
    });
    document.getElementById("event-roles-list").innerHTML = h;
    document.getElementById("event-edit-modal").style.display = "flex";
}

function selectEvent(id) { state.currentEventId = id; state.catFilter = 'all'; state.userFilter = 'all'; render(); if(window.innerWidth < 1024) toggleMenu(); }
function toggleMenu() { document.getElementById("sidebar").classList.toggle("sidebar-hidden"); document.getElementById("overlay").style.display = document.getElementById("sidebar").classList.contains("sidebar-hidden") ? "none" : "block"; }
function closeModals() { document.querySelectorAll('[id$="-modal"]').forEach(m => m.style.display = "none"); if(document.getElementById("edit-modal")) document.getElementById("edit-modal").style.display = "none"; }
function addTask() {
    const tasks = state.events[state.currentEventId].tasks || [];
    const id = Date.now();
    tasks.push({ id, title: "Neue Aufgabe", category: state.catFilter==='all'?'sonstiges':state.catFilter, done: false, assignee: (getMyRole(state.currentEventId)==='planer'?'':state.currentUser.name) });
    db.ref(`festplaner_v4/events/${state.currentEventId}/tasks`).set(tasks);
    openEdit(state.currentEventId, id);
}
function saveEventEdit() { db.ref(`festplaner_v4/events/${state.currentEventId}`).update({name: document.getElementById("ev-edit-name").value, date: document.getElementById("ev-edit-date").value}); closeModals(); }
function deleteEvent() { if(confirm("Löschen?")) { db.ref(`festplaner_v4/events/${state.currentEventId}`).remove(); selectEvent('home'); closeModals(); } }
function deleteTask() { if(confirm("Löschen?")) { const tasks = state.events[activeTaskEventId].tasks.filter(x => x.id !== activeTaskId); db.ref(`festplaner_v4/events/${activeTaskEventId}/tasks`).set(tasks); closeModals(); } }
function openUserMgmt() {
    document.getElementById("user-list-admin").innerHTML = Object.values(state.users).map(u => `<div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #222; font-size:12px;"><span>${u.name}</span><button onclick="db.ref('festplaner_v4/users/${u.name}').remove()" style="color:red; background:none; border:none">✖</button></div>`).join('');
    document.getElementById("user-mgmt-modal").style.display = "flex";
}
function createNewUser() {
    const n = document.getElementById("new-u-name").value.toLowerCase().trim();
    const p = document.getElementById("new-u-pass").value.trim();
    if(n && p && n !== 'admin') db.ref('festplaner_v4/users/'+n).set({name:n, pass:p});
    document.getElementById("new-u-name").value=""; document.getElementById("new-u-pass").value="";
}
function openEventModal() { const n = prompt("Name?"); if(n) db.ref('festplaner_v4/events/ev_'+Date.now()).set({name:n, tasks: [], roles: {}}); }
