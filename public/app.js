/* Smart City Management System - Frontend Controller */
"use strict";

const state = {
  user: null,
  screen: "overview",
  departments: [],
  citizensSubTab: "accounts",
  adminSubTab: "departments",
  selectedDeviceId: null,
  analyticsQueryId: 1,
  analyticsMeta: [],
};

const NAV_ITEMS = [
  { id: "overview", label: "Operations overview", roles: ["admin", "employee", "technical_staff", "citizen"] },
  { id: "requests", label: "Service requests", roles: ["admin", "employee", "technical_staff", "citizen"] },
  { id: "work-orders", label: "Work orders", roles: ["admin", "employee", "technical_staff"] },
  { id: "devices", label: "IoT devices & sensors", roles: ["admin", "employee", "technical_staff"] },
  { id: "citizens", label: "Citizens & utilities", roles: ["admin", "employee", "citizen"] },
  { id: "admin", label: "Departments, users & roles", roles: ["admin"] },
  { id: "analytics", label: "Analytics & PL/SQL lab", roles: ["admin", "employee", "technical_staff"] },
];

const SCREEN_COPY = {
  overview: {
    title: "Operations overview",
    subtitle: "Live city service metrics, urgent tickets, and IoT alerts.",
  },
  requests: {
    title: "Service requests",
    subtitle: "Citizen complaints, prioritization, and technician dispatch.",
  },
  "work-orders": {
    title: "Maintenance work orders",
    subtitle: "Field technician assignments, cost tracking, and completion cascade.",
  },
  devices: {
    title: "IoT devices & sensor readings",
    subtitle: "Urban telemetry thresholds and automated anomaly detection.",
  },
  citizens: {
    title: "Citizens & utility accounts",
    subtitle: "Resident directory, utility meters, and bill payments.",
  },
  admin: {
    title: "Departments, users & roles",
    subtitle: "Municipal directory, authentication accounts, and role groups.",
  },
  analytics: {
    title: "Analytics & PL/SQL lab",
    subtitle: "Seven management SQL queries and live stored function evaluations.",
  },
};

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  const num = Number(value ?? 0);
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function badgeClass(value) {
  const v = String(value ?? "").toLowerCase();
  if (["active", "resolved", "closed", "completed", "normal", "low"].includes(v)) return "badge-teal";
  if (["in progress", "assigned", "pending", "maintenance", "medium", "high"].includes(v)) return "badge-amber";
  if (["critical", "alert", "overdue", "suspended", "offline", "cancelled", "anomaly"].includes(v)) return "badge-crimson";
  return "badge-slate";
}

function renderBadge(label) {
  return `<span class="badge ${badgeClass(label)}">${escapeHtml(label)}</span>`;
}

function toast(message, kind = "success") {
  const region = document.getElementById("toast-region");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 4200);
}

async function api(method, url, body) {
  const opts = {
    method,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user && !url.startsWith("/api/auth/")) {
      state.user = null;
      renderAuthShell();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function isStaffOrAdmin() {
  return state.user && ["admin", "employee"].includes(state.user.role_name);
}

/* Drawer */
function openDrawer(title, subtitle, bodyHtml, onMount) {
  document.getElementById("drawer-title").textContent = title;
  document.getElementById("drawer-subtitle").textContent = subtitle || "";
  const body = document.getElementById("drawer-body");
  body.innerHTML = bodyHtml;
  document.getElementById("drawer-backdrop").hidden = false;
  if (typeof onMount === "function") onMount(body);
}

function closeDrawer() {
  document.getElementById("drawer-backdrop").hidden = true;
  document.getElementById("drawer-body").innerHTML = "";
}

/* Auth Shell */
function renderAuthShell() {
  document.getElementById("auth-screen").hidden = false;
  document.getElementById("app-shell").hidden = true;
}

function renderAppShell() {
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;

  document.getElementById("sidebar-user-name").textContent = state.user.full_name;
  document.getElementById("sidebar-user-role").textContent = `${state.user.role_name} · @${state.user.username}`;

  const allowedScreens = NAV_ITEMS.filter((item) => item.roles.includes(state.user.role_name));
  if (!allowedScreens.some((s) => s.id === state.screen)) {
    state.screen = allowedScreens[0]?.id || "overview";
  }

  const navEl = document.getElementById("sidebar-nav");
  navEl.innerHTML = allowedScreens
    .map(
      (item) => `
      <button type="button" class="nav-item ${item.id === state.screen ? "active" : ""}" data-nav="${item.id}">
        ${escapeHtml(item.label)}
      </button>
    `,
    )
    .join("");

  navEl.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.screen = btn.getAttribute("data-nav");
      document.getElementById("sidebar").classList.remove("open");
      renderAppShell();
    });
  });

  const copy = SCREEN_COPY[state.screen] || SCREEN_COPY.overview;
  document.getElementById("page-title").textContent = copy.title;
  document.getElementById("page-subtitle").textContent = copy.subtitle;

  loadCurrentScreen();
}

async function ensureDepartments() {
  if (state.departments.length > 0) return state.departments;
  const data = await api("GET", "/api/departments");
  state.departments = data.departments || [];
  return state.departments;
}

async function loadCurrentScreen() {
  const body = document.getElementById("workspace-body");
  const actions = document.getElementById("topbar-actions");
  actions.innerHTML = "";
  body.innerHTML = `<div class="panel"><div class="empty-state">Loading workspace data...</div></div>`;

  try {
    if (state.screen === "overview") await renderOverview(body, actions);
    else if (state.screen === "requests") await renderRequests(body, actions);
    else if (state.screen === "work-orders") await renderWorkOrders(body, actions);
    else if (state.screen === "devices") await renderDevices(body, actions);
    else if (state.screen === "citizens") await renderCitizensScreen(body, actions);
    else if (state.screen === "admin") await renderAdminScreen(body, actions);
    else if (state.screen === "analytics") await renderAnalyticsScreen(body, actions);
  } catch (err) {
    body.innerHTML = `<div class="panel"><div class="panel-body"><p class="form-error">${escapeHtml(err.message)}</p></div></div>`;
  }
}

/* Screen 2: Operations Overview */
async function renderOverview(body, actions) {
  actions.innerHTML = `<button type="button" class="btn btn-secondary" id="refresh-overview-btn">Refresh</button>`;
  document.getElementById("refresh-overview-btn").addEventListener("click", () => loadCurrentScreen());

  const data = await api("GET", "/api/overview");
  const pill = document.getElementById("db-status-pill");
  const pillText = document.getElementById("db-status-text");
  pill.classList.remove("ok", "err");
  if (data.dbStatus?.connected) {
    pill.classList.add("ok");
    pillText.textContent = data.dbStatus.detail || "PostgreSQL connected";
  } else {
    pill.classList.add("err");
    pillText.textContent = "Database disconnected";
  }

  const k = data.kpis || {};
  const cards =
    data.roleScope === "citizen"
      ? [
          { label: "Active requests", value: k.openRequests ?? 0, note: "Open or in progress" },
          { label: "Resolved requests", value: k.resolvedRequests ?? 0, note: "Completed municipal tickets" },
          { label: "Utility accounts", value: k.utilityAccounts ?? 0, note: "Linked residential meters" },
          { label: "Total balance due", value: formatMoney(k.totalBalanceDue ?? 0), note: "Across all utility services" },
        ]
      : [
          { label: "Open & active requests", value: k.openRequests ?? 0, note: "Awaiting or in progress" },
          { label: "Active work orders", value: k.activeWorkOrders ?? 0, note: "Assigned to field crews" },
          { label: "IoT alert / maintenance", value: k.alertDevices ?? 0, note: "Sensors requiring review" },
          { label: "Overdue utility arrears", value: formatMoney(k.overdueBalance ?? 0), note: "Unpaid overdue accounts" },
          { label: "Avg resolution time", value: `${k.avgResolutionHours ?? 0} hrs`, note: "avg_resolution_hours()" },
          { label: "Municipal departments", value: k.totalDepartments ?? 0, note: `${k.totalCitizens ?? 0} registered citizens` },
        ];

  const reqRows = (data.recentRequests || [])
    .map(
      (r) => `
      <tr>
        <td class="num">#${r.request_id}</td>
        <td><strong>${escapeHtml(r.title)}</strong><br><span class="kpi-note">${escapeHtml(r.department_name)}</span></td>
        <td>${renderBadge(r.priority)}</td>
        <td>${renderBadge(r.status)}</td>
        <td>${formatDateTime(r.created_at)}</td>
      </tr>
    `,
    )
    .join("");

  const alertRows = (data.recentAlerts || [])
    .map(
      (a) => `
      <tr>
        <td><strong>${escapeHtml(a.device_code)}</strong><br><span class="kpi-note">${escapeHtml(a.device_type)} · ${escapeHtml(a.district_name)}</span></td>
        <td class="num"><strong>${escapeHtml(a.reading_value)} ${escapeHtml(a.unit)}</strong></td>
        <td class="num">&gt; ${escapeHtml(a.threshold_value)}</td>
        <td>${renderBadge(a.device_status)}</td>
      </tr>
    `,
    )
    .join("");

  body.innerHTML = `
    <section class="kpi-grid">
      ${cards
        .map(
          (c) => `
        <article class="kpi-card">
          <p class="kpi-label">${escapeHtml(c.label)}</p>
          <p class="kpi-value num">${escapeHtml(c.value)}</p>
          <p class="kpi-note">${escapeHtml(c.note)}</p>
        </article>
      `,
        )
        .join("")}
    </section>

    <section class="${data.roleScope === "staff" ? "split-2" : ""}">
      <article class="panel">
        <header class="panel-header">
          <h2>${data.roleScope === "citizen" ? "My recent requests" : "Priority service backlog"}</h2>
          <button type="button" class="btn btn-secondary btn-sm" id="goto-requests-btn">Open requests</button>
        </header>
        <div class="table-wrap">
          ${
            reqRows
              ? `<table><thead><tr><th>ID</th><th>Request</th><th>Priority</th><th>Status</th><th>Logged</th></tr></thead><tbody>${reqRows}</tbody></table>`
              : `<div class="empty-state">No service requests to display.</div>`
          }
        </div>
      </article>

      ${
        data.roleScope === "staff"
          ? `
        <article class="panel">
          <header class="panel-header">
            <h2>Recent IoT threshold anomalies</h2>
            <button type="button" class="btn btn-secondary btn-sm" id="goto-devices-btn">Open sensors</button>
          </header>
          <div class="table-wrap">
            ${
              alertRows
                ? `<table><thead><tr><th>Device</th><th>Reading</th><th>Limit</th><th>Status</th></tr></thead><tbody>${alertRows}</tbody></table>`
                : `<div class="empty-state">No threshold breaches recorded.</div>`
            }
          </div>
        </article>
      `
          : ""
      }
    </section>
  `;

  document.getElementById("goto-requests-btn")?.addEventListener("click", () => {
    state.screen = "requests";
    renderAppShell();
  });
  document.getElementById("goto-devices-btn")?.addEventListener("click", () => {
    state.screen = "devices";
    renderAppShell();
  });
}

/* Screen 3: Service Requests */
async function renderRequests(body, actions) {
  const canCreate = ["admin", "employee", "citizen"].includes(state.user.role_name);
  if (canCreate) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-request-btn">New service request</button>`;
  }

  const depts = await ensureDepartments();
  let citizensList = [];
  if (isStaffOrAdmin()) {
    const cRes = await api("GET", "/api/citizens");
    citizensList = cRes.citizens || [];
  }

  body.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div class="filter-bar">
          <input id="req-search" type="search" placeholder="Search title or citizen..." />
          <select id="req-status-filter">
            <option value="">All statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
          <select id="req-priority-filter">
            <option value="">All priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select id="req-dept-filter">
            <option value="">All departments</option>
            ${depts.map((d) => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="requests-table-wrap" class="table-wrap"></div>
    </section>
  `;

  const loadRows = async () => {
    const params = new URLSearchParams();
    const s = document.getElementById("req-status-filter").value;
    const p = document.getElementById("req-priority-filter").value;
    const d = document.getElementById("req-dept-filter").value;
    const q = document.getElementById("req-search").value.trim();
    if (s) params.set("status", s);
    if (p) params.set("priority", p);
    if (d) params.set("department_id", d);
    if (q) params.set("search", q);

    const data = await api("GET", `/api/requests?${params.toString()}`);
    const list = data.requests || [];
    const wrap = document.getElementById("requests-table-wrap");

    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No service requests match the active filters.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title &amp; Category</th>
            <th>Citizen</th>
            <th>Department</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Resolved</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((r) => {
              const isCitizenEditable = state.user.role_name === "citizen" && r.status === "Open";
              const canEdit = isStaffOrAdmin() || isCitizenEditable;
              const canAssign = isStaffOrAdmin() && ["Open", "In Progress"].includes(r.status);
              return `
                <tr>
                  <td class="num">#${r.request_id}</td>
                  <td>
                    <strong>${escapeHtml(r.title)}</strong><br>
                    <span class="kpi-note">${escapeHtml(r.category)} · ${formatDateTime(r.created_at)}</span>
                  </td>
                  <td>${escapeHtml(r.citizen_name)}</td>
                  <td>${escapeHtml(r.department_name)}</td>
                  <td>${renderBadge(r.priority)}</td>
                  <td>${renderBadge(r.status)}</td>
                  <td>${formatDateTime(r.resolved_at)}</td>
                  <td>
                    <div class="cell-actions">
                      ${canAssign ? `<button type="button" class="btn btn-secondary btn-sm" data-assign="${r.request_id}">Assign tech</button>` : ""}
                      ${canEdit ? `<button type="button" class="btn btn-secondary btn-sm" data-edit-req="${r.request_id}">Edit</button>` : ""}
                      ${canEdit ? `<button type="button" class="btn btn-danger btn-sm" data-del-req="${r.request_id}">Delete</button>` : ""}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-edit-req]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = list.find((x) => x.request_id === Number(btn.getAttribute("data-edit-req")));
        if (item) openRequestDrawer(item, depts, citizensList, loadRows);
      });
    });

    wrap.querySelectorAll("[data-assign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = list.find((x) => x.request_id === Number(btn.getAttribute("data-assign")));
        if (item) openAssignTechDrawer(item, loadRows);
      });
    });

    wrap.querySelectorAll("[data-del-req]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-del-req"));
        if (!confirm(`Delete service request #${id}?`)) return;
        try {
          await api("DELETE", `/api/requests/${id}`);
          toast(`Service request #${id} deleted.`);
          await loadRows();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  };

  document.getElementById("req-status-filter").addEventListener("change", loadRows);
  document.getElementById("req-priority-filter").addEventListener("change", loadRows);
  document.getElementById("req-dept-filter").addEventListener("change", loadRows);
  document.getElementById("req-search").addEventListener("input", loadRows);

  document.getElementById("new-request-btn")?.addEventListener("click", () => {
    openRequestDrawer(null, depts, citizensList, loadRows);
  });

  await loadRows();
}

function openRequestDrawer(existing, depts, citizensList, reload) {
  const isEdit = Boolean(existing);
  const categories = ["Pothole", "Street Lighting", "Waste Collection", "Water Leak", "Traffic Signal", "Air Quality", "Utility Billing"];
  const priorities = ["Low", "Medium", "High", "Critical"];
  const statuses = ["Open", "In Progress", "Resolved", "Closed"];

  const citizenField =
    !isEdit && isStaffOrAdmin()
      ? `
      <div class="field">
        <label for="dr-citizen">Citizen</label>
        <select id="dr-citizen" name="citizen_id" required>
          ${citizensList.map((c) => `<option value="${c.citizen_id}">${escapeHtml(c.full_name)} (${escapeHtml(c.national_id)})</option>`).join("")}
        </select>
      </div>`
      : "";

  const statusField =
    isEdit && isStaffOrAdmin()
      ? `
      <div class="field">
        <label for="dr-status">Workflow status (Resolved auto-stamps resolved_at)</label>
        <select id="dr-status" name="status">
          ${statuses.map((s) => `<option value="${s}" ${existing.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>`
      : "";

  openDrawer(
    isEdit ? `Edit request #${existing.request_id}` : "New service request",
    isEdit ? "Changes update PostgreSQL immediately." : "Submits a new citizen service request.",
    `
      <form id="drawer-req-form" class="stack-form">
        ${citizenField}
        <div class="field">
          <label for="dr-dept">Municipal department</label>
          <select id="dr-dept" name="department_id" required>
            ${depts.map((d) => `<option value="${d.department_id}" ${existing?.department_id === d.department_id ? "selected" : ""}>${escapeHtml(d.department_name)} (${escapeHtml(d.district_name)})</option>`).join("")}
          </select>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="dr-cat">Category</label>
            <select id="dr-cat" name="category" required>
              ${categories.map((c) => `<option value="${c}" ${existing?.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="dr-prio">Priority</label>
            <select id="dr-prio" name="priority" required>
              ${priorities.map((p) => `<option value="${p}" ${(existing?.priority || "Medium") === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </div>
        </div>
        ${statusField}
        <div class="field">
          <label for="dr-title">Title</label>
          <input id="dr-title" name="title" type="text" required minlength="3" value="${escapeHtml(existing?.title || "")}" />
        </div>
        <div class="field">
          <label for="dr-desc">Description</label>
          <textarea id="dr-desc" name="description" rows="4" required minlength="5">${escapeHtml(existing?.description || "")}</textarea>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save changes" : "Submit request"}</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-req-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());
        try {
          if (isEdit) {
            await api("PATCH", `/api/requests/${existing.request_id}`, payload);
            toast("Service request updated.");
          } else {
            await api("POST", "/api/requests", payload);
            toast("Service request submitted.");
          }
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

async function openAssignTechDrawer(reqItem, reload) {
  const { technicians } = await api("GET", "/api/work-orders/technicians");
  openDrawer(
    `Assign technician to #${reqItem.request_id}`,
    "Executes PL/pgSQL CALL assign_technician(...) and opens a work order.",
    `
      <form id="drawer-assign-form" class="stack-form">
        <p class="kpi-note"><strong>${escapeHtml(reqItem.title)}</strong> (${escapeHtml(reqItem.department_name)})</p>
        <div class="field">
          <label for="as-tech">Field technician</label>
          <select id="as-tech" name="technician_id" required>
            ${technicians.map((t) => `<option value="${t.user_id}">${escapeHtml(t.full_name)} (@${escapeHtml(t.username)} · ${escapeHtml(t.role_name)})</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="as-cost">Estimated cost ($)</label>
          <input id="as-cost" name="estimated_cost" type="number" step="0.01" min="0" value="150.00" required />
        </div>
        <div class="field">
          <label for="as-notes">Dispatch notes</label>
          <textarea id="as-notes" name="notes" rows="3" placeholder="Parts and inspection checklist..."></textarea>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">Assign technician</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-assign-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const res = await api("POST", `/api/requests/${reqItem.request_id}/assign`, Object.fromEntries(fd.entries()));
          toast(res.message);
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

/* Screen 4: Work Orders */
async function renderWorkOrders(body, actions) {
  if (isStaffOrAdmin()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-wo-btn">New work order</button>`;
  }

  const [{ technicians }, reqData] = await Promise.all([
    api("GET", "/api/work-orders/technicians"),
    isStaffOrAdmin() ? api("GET", "/api/requests") : Promise.resolve({ requests: [] }),
  ]);

  body.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div class="filter-bar">
          <select id="wo-status-filter">
            <option value="">All statuses</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div id="wo-table-wrap" class="table-wrap"></div>
    </section>
  `;

  const loadRows = async () => {
    const status = document.getElementById("wo-status-filter").value;
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await api("GET", `/api/work-orders${qs}`);
    const list = data.workOrders || [];
    const wrap = document.getElementById("wo-table-wrap");

    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No work orders found.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Service request</th>
            <th>Technician</th>
            <th>Status</th>
            <th>Est. / Actual</th>
            <th>Completed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((w) => {
              const isMine = state.user.user_id === w.technician_id;
              const canEdit = isStaffOrAdmin() || (state.user.role_name === "technical_staff" && isMine);
              const canQuickComplete = canEdit && !["Completed", "Cancelled"].includes(w.status);
              return `
                <tr>
                  <td class="num">#${w.order_id}</td>
                  <td>
                    <strong>#${w.request_id} ${escapeHtml(w.request_title)}</strong><br>
                    <span class="kpi-note">${escapeHtml(w.department_name)} · Request: ${escapeHtml(w.request_status)}</span>
                  </td>
                  <td>${escapeHtml(w.technician_name)}</td>
                  <td>${renderBadge(w.status)}</td>
                  <td class="num">${formatMoney(w.estimated_cost)} / ${formatMoney(w.actual_cost)}</td>
                  <td>${formatDateTime(w.completed_at)}</td>
                  <td>
                    <div class="cell-actions">
                      ${canQuickComplete ? `<button type="button" class="btn btn-primary btn-sm" data-complete-wo="${w.order_id}">Mark completed</button>` : ""}
                      ${canEdit ? `<button type="button" class="btn btn-secondary btn-sm" data-edit-wo="${w.order_id}">Edit</button>` : ""}
                      ${isStaffOrAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del-wo="${w.order_id}">Delete</button>` : ""}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-complete-wo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = list.find((x) => x.order_id === Number(btn.getAttribute("data-complete-wo")));
        if (!item) return;
        const rawCost = prompt("Actual maintenance cost ($):", String(item.actual_cost || item.estimated_cost || 0));
        if (rawCost === null) return;
        try {
          const res = await api("PATCH", `/api/work-orders/${item.order_id}`, {
            status: "Completed",
            actual_cost: Number(rawCost),
          });
          toast(`Work order #${item.order_id} completed; parent request is now '${res.parentRequestStatus}'.`);
          await loadRows();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });

    wrap.querySelectorAll("[data-edit-wo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = list.find((x) => x.order_id === Number(btn.getAttribute("data-edit-wo")));
        if (item) openWorkOrderDrawer(item, technicians, reqData.requests || [], loadRows);
      });
    });

    wrap.querySelectorAll("[data-del-wo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-del-wo"));
        if (!confirm(`Delete work order #${id}?`)) return;
        try {
          await api("DELETE", `/api/work-orders/${id}`);
          toast(`Work order #${id} deleted.`);
          await loadRows();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  };

  document.getElementById("wo-status-filter").addEventListener("change", loadRows);
  document.getElementById("new-wo-btn")?.addEventListener("click", () => {
    openWorkOrderDrawer(null, technicians, reqData.requests || [], loadRows);
  });

  await loadRows();
}

function openWorkOrderDrawer(existing, technicians, requestsList, reload) {
  const isEdit = Boolean(existing);
  const statuses = ["Assigned", "In Progress", "Completed", "Cancelled"];

  openDrawer(
    isEdit ? `Edit work order #${existing.order_id}` : "New work order",
    "Trigger enforces technical_staff/admin role and syncs completion to parent request.",
    `
      <form id="drawer-wo-form" class="stack-form">
        ${
          !isEdit
            ? `
          <div class="field">
            <label for="wo-req">Service request</label>
            <select id="wo-req" name="request_id" required>
              ${requestsList.map((r) => `<option value="${r.request_id}">#${r.request_id} ${escapeHtml(r.title)} (${escapeHtml(r.status)})</option>`).join("")}
            </select>
          </div>`
            : ""
        }
        ${
          isStaffOrAdmin()
            ? `
          <div class="field">
            <label for="wo-tech">Technician</label>
            <select id="wo-tech" name="technician_id" required>
              ${technicians.map((t) => `<option value="${t.user_id}" ${existing?.technician_id === t.user_id ? "selected" : ""}>${escapeHtml(t.full_name)} (@${escapeHtml(t.username)})</option>`).join("")}
            </select>
          </div>`
            : ""
        }
        <div class="field">
          <label for="wo-status">Work order status</label>
          <select id="wo-status" name="status" required>
            ${statuses.map((s) => `<option value="${s}" ${(existing?.status || "Assigned") === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="wo-est">Estimated cost ($)</label>
            <input id="wo-est" name="estimated_cost" type="number" step="0.01" min="0" value="${escapeHtml(existing?.estimated_cost ?? 0)}" required />
          </div>
          <div class="field">
            <label for="wo-act">Actual cost ($)</label>
            <input id="wo-act" name="actual_cost" type="number" step="0.01" min="0" value="${escapeHtml(existing?.actual_cost ?? 0)}" required />
          </div>
        </div>
        <div class="field">
          <label for="wo-notes">Notes</label>
          <textarea id="wo-notes" name="notes" rows="3">${escapeHtml(existing?.notes || "")}</textarea>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save work order" : "Create work order"}</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-wo-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api("PATCH", `/api/work-orders/${existing.order_id}`, Object.fromEntries(fd.entries()));
            toast("Work order updated.");
          } else {
            await api("POST", "/api/work-orders", Object.fromEntries(fd.entries()));
            toast("Work order created.");
          }
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

/* Screen 5: IoT Devices & Sensor Readings */
async function renderDevices(body, actions) {
  actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-device-btn">Register device</button>`;
  const depts = await ensureDepartments();

  body.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>Registered sensors</h2>
        <div class="filter-bar">
          <select id="dev-status-filter">
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Alert">Alert</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
      </div>
      <div id="devices-table-wrap" class="table-wrap"></div>
    </section>

    <section id="readings-panel" class="panel">
      <div class="empty-state">Select any device row to inspect or log sensor readings.</div>
    </section>
  `;

  const loadDevices = async () => {
    const status = document.getElementById("dev-status-filter").value;
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await api("GET", `/api/devices${qs}`);
    const list = data.devices || [];

    if (!state.selectedDeviceId && list.length > 0) {
      state.selectedDeviceId = list[0].device_id;
    }

    const wrap = document.getElementById("devices-table-wrap");
    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No devices registered.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Type &amp; Location</th>
            <th>Department</th>
            <th>Threshold</th>
            <th>Latest reading</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (d) => `
            <tr class="${d.device_id === state.selectedDeviceId ? "selected-row" : ""}">
              <td><strong>${escapeHtml(d.device_code)}</strong></td>
              <td>${escapeHtml(d.device_type)}<br><span class="kpi-note">${escapeHtml(d.district_name)} · ${escapeHtml(d.location_label)}</span></td>
              <td>${escapeHtml(d.department_name)}</td>
              <td class="num">${escapeHtml(d.threshold_value)}</td>
              <td class="num">${d.latest_reading !== null ? `${escapeHtml(d.latest_reading)} ${escapeHtml(d.latest_unit)}` : "—"}</td>
              <td>${renderBadge(d.status)}</td>
              <td>
                <div class="cell-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-inspect-dev="${d.device_id}">Readings</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-edit-dev="${d.device_id}">Edit</button>
                  <button type="button" class="btn btn-danger btn-sm" data-del-dev="${d.device_id}">Delete</button>
                </div>
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-inspect-dev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedDeviceId = Number(btn.getAttribute("data-inspect-dev"));
        loadDevices();
      });
    });

    wrap.querySelectorAll("[data-edit-dev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = list.find((x) => x.device_id === Number(btn.getAttribute("data-edit-dev")));
        if (item) openDeviceDrawer(item, depts, loadDevices);
      });
    });

    wrap.querySelectorAll("[data-del-dev]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-del-dev"));
        if (!confirm(`Delete device #${id} and all its readings?`)) return;
        try {
          await api("DELETE", `/api/devices/${id}`);
          if (state.selectedDeviceId === id) state.selectedDeviceId = null;
          toast(`Device #${id} deleted.`);
          await loadDevices();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });

    if (state.selectedDeviceId) {
      await loadReadings(state.selectedDeviceId, loadDevices);
    }
  };

  document.getElementById("dev-status-filter").addEventListener("change", loadDevices);
  document.getElementById("new-device-btn").addEventListener("click", () => {
    openDeviceDrawer(null, depts, loadDevices);
  });

  await loadDevices();
}

async function loadReadings(deviceId, reloadDevices) {
  const panel = document.getElementById("readings-panel");
  const data = await api("GET", `/api/devices/${deviceId}/readings`);
  const d = data.device;
  const readings = data.readings || [];

  panel.innerHTML = `
    <header class="panel-header">
      <div>
        <h2>Readings for ${escapeHtml(d.device_code)} (${escapeHtml(d.device_type)})</h2>
        <p class="kpi-note">Threshold: <strong class="num">${escapeHtml(d.threshold_value)}</strong> · Readings above threshold fire Trigger 2 (flag anomaly &amp; set device Alert).</p>
      </div>
      <form id="log-reading-form" class="filter-bar">
        <input name="reading_value" type="number" step="0.01" required placeholder="Value (e.g. 95)" style="width:140px" />
        <input name="unit" type="text" required value="${escapeHtml(d.latest_unit || "units")}" placeholder="Unit" style="width:110px" />
        <button type="submit" class="btn btn-primary btn-sm">Log reading</button>
      </form>
    </header>
    <div class="table-wrap">
      ${
        readings.length
          ? `
        <table>
          <thead><tr><th>ID</th><th>Value</th><th>Unit</th><th>Anomaly</th><th>Recorded at</th><th>Action</th></tr></thead>
          <tbody>
            ${readings
              .map(
                (r) => `
              <tr>
                <td class="num">#${r.reading_id}</td>
                <td class="num"><strong>${escapeHtml(r.reading_value)}</strong></td>
                <td>${escapeHtml(r.unit)}</td>
                <td>${r.is_anomaly ? renderBadge("Anomaly") : renderBadge("Normal")}</td>
                <td>${formatDateTime(r.recorded_at)}</td>
                <td><button type="button" class="btn btn-danger btn-sm" data-del-reading="${r.reading_id}">Delete</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>`
          : `<div class="empty-state">No readings logged yet for this device.</div>`
      }
    </div>
  `;

  document.getElementById("log-reading-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api("POST", `/api/devices/${deviceId}/readings`, Object.fromEntries(fd.entries()));
      toast(res.message, res.reading?.is_anomaly ? "error" : "success");
      await reloadDevices();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  panel.querySelectorAll("[data-del-reading]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const readingId = Number(btn.getAttribute("data-del-reading"));
      try {
        await api("DELETE", `/api/devices/readings/${readingId}`);
        toast(`Reading #${readingId} deleted.`);
        await reloadDevices();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

function openDeviceDrawer(existing, depts, reload) {
  const isEdit = Boolean(existing);
  const types = ["Air Quality", "Traffic", "Street Light", "Water Meter", "Noise"];
  const statuses = ["Active", "Maintenance", "Alert", "Offline"];

  openDrawer(
    isEdit ? `Edit device ${existing.device_code}` : "Register IoT device",
    "Hardware sensors linked to municipal departments.",
    `
      <form id="drawer-dev-form" class="stack-form">
        <div class="form-row-2">
          <div class="field">
            <label for="dv-code">Device code</label>
            <input id="dv-code" name="device_code" type="text" required value="${escapeHtml(existing?.device_code || "")}" placeholder="AQ-CENT-09" />
          </div>
          <div class="field">
            <label for="dv-type">Device type</label>
            <select id="dv-type" name="device_type" required>
              ${types.map((t) => `<option value="${t}" ${existing?.device_type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="dv-dept">Department</label>
          <select id="dv-dept" name="department_id" required>
            ${depts.map((d) => `<option value="${d.department_id}" ${existing?.department_id === d.department_id ? "selected" : ""}>${escapeHtml(d.department_name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="dv-dist">District</label>
            <input id="dv-dist" name="district_name" type="text" required value="${escapeHtml(existing?.district_name || "")}" />
          </div>
          <div class="field">
            <label for="dv-loc">Location label</label>
            <input id="dv-loc" name="location_label" type="text" required value="${escapeHtml(existing?.location_label || "")}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="dv-thresh">Alert threshold (&gt; 0)</label>
            <input id="dv-thresh" name="threshold_value" type="number" step="0.01" min="0.01" required value="${escapeHtml(existing?.threshold_value ?? 50)}" />
          </div>
          <div class="field">
            <label for="dv-status">Status</label>
            <select id="dv-status" name="status" required>
              ${statuses.map((s) => `<option value="${s}" ${(existing?.status || "Active") === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save device" : "Register device"}</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-dev-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api("PATCH", `/api/devices/${existing.device_id}`, Object.fromEntries(fd.entries()));
            toast("Device updated.");
          } else {
            await api("POST", "/api/devices", Object.fromEntries(fd.entries()));
            toast("Device registered.");
          }
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

/* Screen 6: Citizens & Utility Accounts */
async function renderCitizensScreen(body, actions) {
  body.innerHTML = `
    <div class="tab-bar">
      <button type="button" class="tab-btn ${state.citizensSubTab === "accounts" ? "active" : ""}" data-ctab="accounts">Utility accounts</button>
      <button type="button" class="tab-btn ${state.citizensSubTab === "citizens" ? "active" : ""}" data-ctab="citizens">Citizen profiles</button>
    </div>
    <section id="citizens-subpanel" class="panel"></section>
  `;

  body.querySelectorAll("[data-ctab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.citizensSubTab = btn.getAttribute("data-ctab");
      renderCitizensScreen(body, actions);
    });
  });

  const panel = document.getElementById("citizens-subpanel");
  if (state.citizensSubTab === "accounts") {
    await renderUtilityAccountsTab(panel, actions);
  } else {
    await renderCitizenProfilesTab(panel, actions);
  }
}

async function renderUtilityAccountsTab(panel, actions) {
  const { citizens } = await api("GET", "/api/citizens");
  if (isStaffOrAdmin()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-acct-btn">New utility account</button>`;
  } else {
    actions.innerHTML = "";
  }

  const { accounts } = await api("GET", "/api/utility-accounts");
  panel.innerHTML = `
    <div class="table-wrap">
      ${
        accounts.length
          ? `
        <table>
          <thead><tr><th>Meter</th><th>Citizen</th><th>Service</th><th>Balance due</th><th>Status</th><th>Last billed</th><th>Actions</th></tr></thead>
          <tbody>
            ${accounts
              .map(
                (a) => `
              <tr>
                <td><strong>${escapeHtml(a.meter_number)}</strong></td>
                <td>${escapeHtml(a.citizen_name)}<br><span class="kpi-note">${escapeHtml(a.district_name)}</span></td>
                <td>${escapeHtml(a.service_type)}</td>
                <td class="num"><strong>${formatMoney(a.balance_due)}</strong></td>
                <td>${renderBadge(a.status)}</td>
                <td>${formatDateTime(a.last_billed_at)}</td>
                <td>
                  <div class="cell-actions">
                    ${Number(a.balance_due) > 0 ? `<button type="button" class="btn btn-primary btn-sm" data-pay-acct="${a.account_id}">Record payment</button>` : ""}
                    ${isStaffOrAdmin() ? `<button type="button" class="btn btn-secondary btn-sm" data-edit-acct="${a.account_id}">Edit</button>` : ""}
                    ${isStaffOrAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del-acct="${a.account_id}">Delete</button>` : ""}
                  </div>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>`
          : `<div class="empty-state">No utility accounts found.</div>`
      }
    </div>
  `;

  const reload = () => loadCurrentScreen();

  document.getElementById("new-acct-btn")?.addEventListener("click", () => {
    openAccountDrawer(null, citizens, reload);
  });

  panel.querySelectorAll("[data-pay-acct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acct = accounts.find((x) => x.account_id === Number(btn.getAttribute("data-pay-acct")));
      if (acct) openPaymentDrawer(acct, reload);
    });
  });

  panel.querySelectorAll("[data-edit-acct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acct = accounts.find((x) => x.account_id === Number(btn.getAttribute("data-edit-acct")));
      if (acct) openAccountDrawer(acct, citizens, reload);
    });
  });

  panel.querySelectorAll("[data-del-acct]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del-acct"));
      if (!confirm(`Delete utility account #${id}?`)) return;
      try {
        await api("DELETE", `/api/utility-accounts/${id}`);
        toast(`Utility account #${id} deleted.`);
        await reload();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

function openPaymentDrawer(acct, reload) {
  openDrawer(
    `Pay meter ${acct.meter_number}`,
    `Calls PL/pgSQL CALL record_utility_payment(${acct.account_id}, amount).`,
    `
      <form id="drawer-pay-form" class="stack-form">
        <p class="kpi-note">Current balance due: <strong class="num">${formatMoney(acct.balance_due)}</strong> (${escapeHtml(acct.status)})</p>
        <div class="field">
          <label for="pay-amount">Payment amount ($)</label>
          <input id="pay-amount" name="amount" type="number" step="0.01" min="0.01" value="${escapeHtml(acct.balance_due)}" required />
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">Record payment</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-pay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const res = await api("POST", `/api/utility-accounts/${acct.account_id}/pay`, Object.fromEntries(fd.entries()));
          toast(res.message);
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

function openAccountDrawer(existing, citizens, reload) {
  const isEdit = Boolean(existing);
  const services = ["Water", "Electricity", "Waste", "Gas"];
  const statuses = ["Active", "Overdue", "Suspended"];

  openDrawer(
    isEdit ? `Edit account ${existing.meter_number}` : "New utility account",
    "Links municipal utility metering to a citizen.",
    `
      <form id="drawer-acct-form" class="stack-form">
        ${
          !isEdit
            ? `
          <div class="field">
            <label for="ac-cit">Citizen</label>
            <select id="ac-cit" name="citizen_id" required>
              ${citizens.map((c) => `<option value="${c.citizen_id}">${escapeHtml(c.full_name)} (${escapeHtml(c.national_id)})</option>`).join("")}
            </select>
          </div>`
            : ""
        }
        <div class="form-row-2">
          <div class="field">
            <label for="ac-type">Service type</label>
            <select id="ac-type" name="service_type" required>
              ${services.map((s) => `<option value="${s}" ${existing?.service_type === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="ac-meter">Meter number</label>
            <input id="ac-meter" name="meter_number" type="text" required value="${escapeHtml(existing?.meter_number || "")}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="ac-bal">Balance due ($)</label>
            <input id="ac-bal" name="balance_due" type="number" step="0.01" min="0" required value="${escapeHtml(existing?.balance_due ?? 0)}" />
          </div>
          <div class="field">
            <label for="ac-st">Status</label>
            <select id="ac-st" name="status" required>
              ${statuses.map((s) => `<option value="${s}" ${(existing?.status || "Active") === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save account" : "Create account"}</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-acct-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api("PATCH", `/api/utility-accounts/${existing.account_id}`, Object.fromEntries(fd.entries()));
            toast("Utility account updated.");
          } else {
            await api("POST", "/api/utility-accounts", Object.fromEntries(fd.entries()));
            toast("Utility account created.");
          }
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

async function renderCitizenProfilesTab(panel, actions) {
  let availableUsers = [];
  if (isStaffOrAdmin()) {
    const avail = await api("GET", "/api/citizens/available-users");
    availableUsers = avail.users || [];
    actions.innerHTML = availableUsers.length
      ? `<button type="button" class="btn btn-primary" id="new-cit-btn">Add citizen profile</button>`
      : "";
  } else {
    actions.innerHTML = "";
  }

  const { citizens } = await api("GET", "/api/citizens");
  panel.innerHTML = `
    <div class="table-wrap">
      ${
        citizens.length
          ? `
        <table>
          <thead><tr><th>Name</th><th>National ID</th><th>District</th><th>Address</th><th>Phone</th><th>Actions</th></tr></thead>
          <tbody>
            ${citizens
              .map(
                (c) => `
              <tr>
                <td><strong>${escapeHtml(c.full_name)}</strong><br><span class="kpi-note">@${escapeHtml(c.username)}</span></td>
                <td>${escapeHtml(c.national_id)}</td>
                <td>${escapeHtml(c.district_name)}</td>
                <td>${escapeHtml(c.address)}</td>
                <td>${escapeHtml(c.phone)}</td>
                <td>
                  <div class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-edit-cit="${c.citizen_id}">Edit</button>
                    ${isStaffOrAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del-cit="${c.citizen_id}">Delete</button>` : ""}
                  </div>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>`
          : `<div class="empty-state">No citizen profiles found.</div>`
      }
    </div>
  `;

  const reload = () => loadCurrentScreen();
  document.getElementById("new-cit-btn")?.addEventListener("click", () => {
    openCitizenDrawer(null, availableUsers, reload);
  });

  panel.querySelectorAll("[data-edit-cit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cit = citizens.find((x) => x.citizen_id === Number(btn.getAttribute("data-edit-cit")));
      if (cit) openCitizenDrawer(cit, availableUsers, reload);
    });
  });

  panel.querySelectorAll("[data-del-cit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del-cit"));
      if (!confirm(`Delete citizen profile #${id}?`)) return;
      try {
        await api("DELETE", `/api/citizens/${id}`);
        toast(`Citizen profile #${id} deleted.`);
        await reload();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

function openCitizenDrawer(existing, availableUsers, reload) {
  const isEdit = Boolean(existing);
  const canEditNationalId = !isEdit || isStaffOrAdmin();

  openDrawer(
    isEdit ? `Edit profile: ${existing.full_name}` : "Add citizen profile",
    "Links residential profile details to a citizen user account.",
    `
      <form id="drawer-cit-form" class="stack-form">
        ${
          !isEdit
            ? `
          <div class="field">
            <label for="ct-user">User account</label>
            <select id="ct-user" name="user_id" required>
              ${availableUsers.map((u) => `<option value="${u.user_id}">${escapeHtml(u.full_name)} (@${escapeHtml(u.username)})</option>`).join("")}
            </select>
          </div>`
            : ""
        }
        ${
          canEditNationalId
            ? `
          <div class="field">
            <label for="ct-nid">National ID</label>
            <input id="ct-nid" name="national_id" type="text" required value="${escapeHtml(existing?.national_id || "")}" />
          </div>`
            : ""
        }
        <div class="form-row-2">
          <div class="field">
            <label for="ct-dist">District</label>
            <input id="ct-dist" name="district_name" type="text" required value="${escapeHtml(existing?.district_name || "")}" />
          </div>
          <div class="field">
            <label for="ct-phone">Phone</label>
            <input id="ct-phone" name="phone" type="text" required value="${escapeHtml(existing?.phone || "")}" />
          </div>
        </div>
        <div class="field">
          <label for="ct-addr">Address</label>
          <input id="ct-addr" name="address" type="text" required value="${escapeHtml(existing?.address || "")}" />
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save profile" : "Create profile"}</button>
      </form>
    `,
    (container) => {
      container.querySelector("#drawer-cit-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api("PATCH", `/api/citizens/${existing.citizen_id}`, Object.fromEntries(fd.entries()));
            toast("Citizen profile updated.");
          } else {
            await api("POST", "/api/citizens", Object.fromEntries(fd.entries()));
            toast("Citizen profile created.");
          }
          closeDrawer();
          await reload();
        } catch (err) {
          const errEl = container.querySelector("#drawer-err");
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    },
  );
}

/* Screen 7: Admin (Departments, Users & Roles) */
async function renderAdminScreen(body, actions) {
  body.innerHTML = `
    <div class="tab-bar">
      <button type="button" class="tab-btn ${state.adminSubTab === "departments" ? "active" : ""}" data-atab="departments">Municipal departments</button>
      <button type="button" class="tab-btn ${state.adminSubTab === "users" ? "active" : ""}" data-atab="users">Users</button>
      <button type="button" class="tab-btn ${state.adminSubTab === "roles" ? "active" : ""}" data-atab="roles">User groups (roles)</button>
    </div>
    <section id="admin-subpanel" class="panel"></section>
  `;

  body.querySelectorAll("[data-atab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.adminSubTab = btn.getAttribute("data-atab");
      renderAdminScreen(body, actions);
    });
  });

  const panel = document.getElementById("admin-subpanel");
  if (state.adminSubTab === "departments") {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-dept-btn">New department</button>`;
    const { departments } = await api("GET", "/api/departments");
    state.departments = departments;
    panel.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Department</th><th>District</th><th>Head</th><th>Phone</th><th>Annual budget</th><th>Actions</th></tr></thead>
          <tbody>
            ${departments
              .map(
                (d) => `
              <tr>
                <td><strong>${escapeHtml(d.department_name)}</strong></td>
                <td>${escapeHtml(d.district_name)}</td>
                <td>${escapeHtml(d.head_name)}</td>
                <td>${escapeHtml(d.contact_phone)}</td>
                <td class="num">${formatMoney(d.annual_budget)}</td>
                <td>
                  <div class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-edit-dept="${d.department_id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" data-del-dept="${d.department_id}">Delete</button>
                  </div>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    const reload = () => {
      state.departments = [];
      return loadCurrentScreen();
    };

    document.getElementById("new-dept-btn").addEventListener("click", () => openDepartmentDrawer(null, reload));
    panel.querySelectorAll("[data-edit-dept]").forEach((b) =>
      b.addEventListener("click", () => {
        const d = departments.find((x) => x.department_id === Number(b.getAttribute("data-edit-dept")));
        if (d) openDepartmentDrawer(d, reload);
      }),
    );
    panel.querySelectorAll("[data-del-dept]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-del-dept"));
        if (!confirm(`Delete department #${id}?`)) return;
        try {
          await api("DELETE", `/api/departments/${id}`);
          toast(`Department #${id} deleted.`);
          await reload();
        } catch (err) {
          toast(err.message, "error");
        }
      }),
    );
  } else if (state.adminSubTab === "users") {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-user-btn">Create user</button>`;
    const [{ users }, { roles }] = await Promise.all([api("GET", "/api/users"), api("GET", "/api/roles")]);
    panel.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Full name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${users
              .map(
                (u) => `
              <tr>
                <td><strong>@${escapeHtml(u.username)}</strong></td>
                <td>${escapeHtml(u.full_name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${renderBadge(u.role_name)}</td>
                <td>${renderBadge(u.status)}</td>
                <td>
                  <div class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-edit-user="${u.user_id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" data-del-user="${u.user_id}">Delete</button>
                  </div>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    const reload = () => loadCurrentScreen();
    document.getElementById("new-user-btn").addEventListener("click", () => openUserDrawer(null, roles, reload));
    panel.querySelectorAll("[data-edit-user]").forEach((b) =>
      b.addEventListener("click", () => {
        const u = users.find((x) => x.user_id === Number(b.getAttribute("data-edit-user")));
        if (u) openUserDrawer(u, roles, reload);
      }),
    );
    panel.querySelectorAll("[data-del-user]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-del-user"));
        if (!confirm(`Delete user #${id}?`)) return;
        try {
          await api("DELETE", `/api/users/${id}`);
          toast(`User #${id} deleted.`);
          await reload();
        } catch (err) {
          toast(err.message, "error");
        }
      }),
    );
  } else {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="new-role-btn">Create role</button>`;
    const { roles } = await api("GET", "/api/roles");
    panel.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Role name</th><th>Access level</th><th>Description</th><th>Users</th><th>Actions</th></tr></thead>
          <tbody>
            ${roles
              .map(
                (r) => `
              <tr>
                <td><strong>${escapeHtml(r.role_name)}</strong></td>
                <td class="num">${escapeHtml(r.access_level)}</td>
                <td>${escapeHtml(r.description)}</td>
                <td class="num">${escapeHtml(r.user_count)}</td>
                <td>
                  <div class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-edit-role="${r.role_id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" data-del-role="${r.role_id}">Delete</button>
                  </div>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    const reload = () => loadCurrentScreen();
    document.getElementById("new-role-btn").addEventListener("click", () => openRoleDrawer(null, reload));
    panel.querySelectorAll("[data-edit-role]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = roles.find((x) => x.role_id === Number(b.getAttribute("data-edit-role")));
        if (r) openRoleDrawer(r, reload);
      }),
    );
    panel.querySelectorAll("[data-del-role]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-del-role"));
        if (!confirm(`Delete user group #${id}?`)) return;
        try {
          await api("DELETE", `/api/roles/${id}`);
          toast(`Role #${id} deleted.`);
          await reload();
        } catch (err) {
          toast(err.message, "error");
        }
      }),
    );
  }
}

function openDepartmentDrawer(existing, reload) {
  const isEdit = Boolean(existing);
  openDrawer(
    isEdit ? `Edit ${existing.department_name}` : "New municipal department",
    "Departments anchor districts, IoT sensors, and service request routing.",
    `
      <form id="drawer-dept-form" class="stack-form">
        <div class="field"><label>Department name</label><input name="department_name" required value="${escapeHtml(existing?.department_name || "")}" /></div>
        <div class="form-row-2">
          <div class="field"><label>District</label><input name="district_name" required value="${escapeHtml(existing?.district_name || "")}" /></div>
          <div class="field"><label>Head name</label><input name="head_name" required value="${escapeHtml(existing?.head_name || "")}" /></div>
        </div>
        <div class="form-row-2">
          <div class="field"><label>Contact phone</label><input name="contact_phone" required value="${escapeHtml(existing?.contact_phone || "")}" /></div>
          <div class="field"><label>Annual budget ($)</label><input name="annual_budget" type="number" step="0.01" min="0" required value="${escapeHtml(existing?.annual_budget ?? 100000)}" /></div>
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save department" : "Create department"}</button>
      </form>
    `,
    (c) => {
      c.querySelector("#drawer-dept-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
          if (isEdit) await api("PATCH", `/api/departments/${existing.department_id}`, payload);
          else await api("POST", "/api/departments", payload);
          toast(isEdit ? "Department updated." : "Department created.");
          closeDrawer();
          await reload();
        } catch (err) {
          const el = c.querySelector("#drawer-err");
          el.textContent = err.message;
          el.hidden = false;
        }
      });
    },
  );
}

function openUserDrawer(existing, roles, reload) {
  const isEdit = Boolean(existing);
  const statuses = ["active", "pending", "suspended"];
  openDrawer(
    isEdit ? `Edit user @${existing.username}` : "Create user account",
    "Passwords are salted and hashed with bcrypt before storage.",
    `
      <form id="drawer-user-form" class="stack-form">
        <div class="form-row-2">
          <div class="field"><label>Username</label><input name="username" required minlength="3" value="${escapeHtml(existing?.username || "")}" /></div>
          <div class="field"><label>Full name</label><input name="full_name" required value="${escapeHtml(existing?.full_name || "")}" /></div>
        </div>
        <div class="field"><label>Email</label><input name="email" type="email" required value="${escapeHtml(existing?.email || "")}" /></div>
        <div class="form-row-2">
          <div class="field">
            <label>Role</label>
            <select name="role_id" required>
              ${roles.map((r) => `<option value="${r.role_id}" ${existing?.role_id === r.role_id ? "selected" : ""}>${escapeHtml(r.role_name)} (${r.access_level})</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select name="status" required>
              ${statuses.map((s) => `<option value="${s}" ${(existing?.status || "active") === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label>${isEdit ? "New password (leave blank to keep current)" : "Password (min 8 chars)"}</label>
          <input name="password" type="password" ${isEdit ? "" : 'required minlength="8"'} />
        </div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save user" : "Create user"}</button>
      </form>
    `,
    (c) => {
      c.querySelector("#drawer-user-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        if (isEdit && !payload.password) delete payload.password;
        try {
          if (isEdit) await api("PATCH", `/api/users/${existing.user_id}`, payload);
          else await api("POST", "/api/users", payload);
          toast(isEdit ? "User updated." : "User created.");
          closeDrawer();
          await reload();
        } catch (err) {
          const el = c.querySelector("#drawer-err");
          el.textContent = err.message;
          el.hidden = false;
        }
      });
    },
  );
}

function openRoleDrawer(existing, reload) {
  const isEdit = Boolean(existing);
  openDrawer(
    isEdit ? `Edit role ${existing.role_name}` : "Create user group (role)",
    "Supports custom user groups as required by CMPE344.",
    `
      <form id="drawer-role-form" class="stack-form">
        <div class="form-row-2">
          <div class="field"><label>Role name (lowercase_snake)</label><input name="role_name" required value="${escapeHtml(existing?.role_name || "")}" placeholder="auditor" /></div>
          <div class="field"><label>Access level (1–100)</label><input name="access_level" type="number" min="1" max="100" required value="${escapeHtml(existing?.access_level ?? 30)}" /></div>
        </div>
        <div class="field"><label>Description</label><textarea name="description" rows="3">${escapeHtml(existing?.description || "")}</textarea></div>
        <p id="drawer-err" class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save role" : "Create role"}</button>
      </form>
    `,
    (c) => {
      c.querySelector("#drawer-role-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
          if (isEdit) await api("PATCH", `/api/roles/${existing.role_id}`, payload);
          else await api("POST", "/api/roles", payload);
          toast(isEdit ? "Role updated." : "User group created.");
          closeDrawer();
          await reload();
        } catch (err) {
          const el = c.querySelector("#drawer-err");
          el.textContent = err.message;
          el.hidden = false;
        }
      });
    },
  );
}

/* Screen 8: Analytics & PL/SQL Lab */
async function renderAnalyticsScreen(body, _actions) {
  const [depts, metaRes] = await Promise.all([
    ensureDepartments(),
    state.analyticsMeta.length ? Promise.resolve({ queries: state.analyticsMeta }) : api("GET", "/api/analytics"),
  ]);
  state.analyticsMeta = metaRes.queries || [];

  body.innerHTML = `
    <section class="split-2">
      <article class="panel">
        <header class="panel-header"><h2>PL/pgSQL function: avg_resolution_hours()</h2></header>
        <div class="panel-body stack-form">
          <div class="filter-bar">
            <select id="fn-dept-select">
              <option value="">All departments (city-wide)</option>
              ${depts.map((d) => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="run-avg-fn-btn">Run function</button>
          </div>
          <p id="fn-avg-output" class="kpi-value num">—</p>
        </div>
      </article>

      <article class="panel">
        <header class="panel-header"><h2>PL/pgSQL function: count_overdue_requests(days)</h2></header>
        <div class="panel-body stack-form">
          <div class="filter-bar">
            <input id="fn-days-input" type="number" min="0" value="7" style="width:100px" />
            <button type="button" class="btn btn-primary btn-sm" id="run-overdue-fn-btn">Check overdue</button>
          </div>
          <div id="fn-overdue-output" class="table-wrap"></div>
        </div>
      </article>
    </section>

    <section class="panel">
      <header class="panel-header">
        <h2>Management SQL queries (7 required reports)</h2>
        <div class="filter-bar">
          <select id="query-selector">
            ${state.analyticsMeta.map((q) => `<option value="${q.id}" ${q.id === state.analyticsQueryId ? "selected" : ""}>Q${q.id}: ${escapeHtml(q.title)}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-primary btn-sm" id="run-query-btn">Run query</button>
        </div>
      </header>
      <div id="query-result-body" class="panel-body"></div>
    </section>
  `;

  const runAvgFn = async () => {
    const deptId = document.getElementById("fn-dept-select").value;
    const qs = deptId ? `?department_id=${encodeURIComponent(deptId)}` : "";
    const data = await api("GET", `/api/analytics/fn/avg-resolution${qs}`);
    document.getElementById("fn-avg-output").textContent = `${data.avg_resolution_hours} hours`;
  };

  const runOverdueFn = async () => {
    const days = document.getElementById("fn-days-input").value || "7";
    const data = await api("GET", `/api/analytics/fn/overdue?days=${encodeURIComponent(days)}`);
    const out = document.getElementById("fn-overdue-output");
    if (!data.rows.length) {
      out.innerHTML = `<p class="kpi-note">No open requests older than ${escapeHtml(data.days)} days.</p>`;
      return;
    }
    out.innerHTML = `
      <table>
        <thead><tr><th>Department</th><th>Overdue count</th></tr></thead>
        <tbody>
          ${data.rows.map((r) => `<tr><td>${escapeHtml(r.department_name)}</td><td class="num"><strong>${escapeHtml(r.overdue_count)}</strong></td></tr>`).join("")}
        </tbody>
      </table>
    `;
  };

  const runSelectedQuery = async () => {
    const qId = Number(document.getElementById("query-selector").value);
    state.analyticsQueryId = qId;
    const res = await api("GET", `/api/analytics/${qId}`);
    const container = document.getElementById("query-result-body");
    const rows = res.rows || [];
    const cols = rows.length ? Object.keys(rows[0]) : [];

    // Find first numeric column after label column for quick visual bar chart
    let chartHtml = "";
    if (rows.length > 0 && cols.length >= 2) {
      const labelCol = cols[0];
      const numericCol = cols.slice(1).find((c) => rows.some((r) => !Number.isNaN(Number(r[c])) && r[c] !== null));
      if (numericCol) {
        const maxVal = Math.max(...rows.map((r) => Math.abs(Number(r[numericCol]) || 0)), 1);
        chartHtml = `
          <div class="chart-bars">
            ${rows
              .slice(0, 8)
              .map((r) => {
                const val = Number(r[numericCol]) || 0;
                const pct = Math.max(2, Math.round((Math.abs(val) / maxVal) * 100));
                return `
                  <div class="chart-row">
                    <span class="chart-label" title="${escapeHtml(r[labelCol])}">${escapeHtml(r[labelCol])}</span>
                    <div class="chart-track"><div class="chart-fill" style="width:${pct}%"></div></div>
                    <span class="num">${escapeHtml(r[numericCol])}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }
    }

    const tableHtml = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `<tr>${cols.map((c) => `<td class="${!Number.isNaN(Number(r[c])) && r[c] !== null && r[c] !== "" ? "num" : ""}">${escapeHtml(r[c])}</td>`).join("")}</tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      : `<div class="empty-state">Query returned 0 rows for the current dataset.</div>`;

    container.innerHTML = `
      <div class="stack-form">
        <div>
          <p>${escapeHtml(res.query.description)}</p>
          <div class="cell-actions" style="margin-top:8px">
            ${res.query.sqlTechniques.map((t) => `<span class="badge badge-teal">${escapeHtml(t)}</span>`).join("")}
            <span class="badge badge-slate">${res.rowCount} row(s)</span>
          </div>
        </div>
        ${chartHtml}
        ${tableHtml}
        <details>
          <summary style="cursor:pointer;font-weight:600;color:var(--accent-civic)">Inspect SQL source</summary>
          <pre class="sql-block">${escapeHtml(res.query.sql)}</pre>
        </details>
      </div>
    `;
  };

  document.getElementById("run-avg-fn-btn").addEventListener("click", runAvgFn);
  document.getElementById("run-overdue-fn-btn").addEventListener("click", runOverdueFn);
  document.getElementById("run-query-btn").addEventListener("click", runSelectedQuery);
  document.getElementById("query-selector").addEventListener("change", runSelectedQuery);

  await Promise.all([runAvgFn(), runOverdueFn(), runSelectedQuery()]);
}

/* Bootstrap & Event Wiring */
async function boot() {
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-auth-tab");
      document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("login-form").hidden = tab !== "login";
      document.getElementById("register-form").hidden = tab !== "register";
    });
  });

  document.querySelectorAll("[data-demo-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector('[data-auth-tab="login"]').click();
      document.getElementById("login-username").value = btn.getAttribute("data-demo-user");
      document.getElementById("login-password").value = "Passw0rd!";
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    errEl.hidden = true;
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const data = await api("POST", "/api/auth/login", payload);
      state.user = data.user;
      state.departments = [];
      toast(data.message);
      renderAppShell();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("register-error");
    errEl.hidden = true;
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const data = await api("POST", "/api/auth/register", payload);
      state.user = data.user;
      state.departments = [];
      toast(data.message);
      renderAppShell();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("POST", "/api/auth/logout").catch(() => undefined);
    state.user = null;
    state.departments = [];
    state.screen = "overview";
    state.citizensSubTab = "accounts";
    state.adminSubTab = "departments";
    closeDrawer();
    renderAuthShell();
  });

  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "drawer-backdrop") closeDrawer();
  });

  document.getElementById("open-nav-btn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
  });
  document.getElementById("close-nav-btn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
  });

  try {
    const me = await api("GET", "/api/auth/me");
    state.user = me.user;
    renderAppShell();
  } catch {
    renderAuthShell();
  }
}

boot();
