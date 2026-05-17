/**
 * 数据存储层 - localStorage 持久化，支持多标签页同步
 */
const Store = (() => {
  const KEY = 'meeting_assistant_data';

  const PERMISSION_ROLES = ['成员', '管理员', '观察者'];
  const DATA_SCHEMA_VERSION = 6;

  const SELF_ACCOUNT_EMAIL = 'zhangsan@company.com';
  const SELF_FALLBACK_MEMBER = () => ({
    id: 'u-zhangsan',
    name: '张三',
    email: SELF_ACCOUNT_EMAIL,
    role: '管理员',
    department: '产品部',
    jobTitle: '产品负责人',
  });

  /** 历史数据缺部门时，按姓名补全（常见演示名） */
  const TEAM_CANONICAL_BY_NAME = {
    张明: { department: '产品部', jobTitle: '产品经理' },
    李华: { department: '研发部', jobTitle: '开发工程师' },
    王芳: { department: '设计部', jobTitle: '设计师' },
    陈伟: { department: '项目部', jobTitle: '项目经理' },
  };

  const defaultPrefs = () => ({
    fontScale: 'm',
    tone: 'default',
    loggedInMock: true,
  });

  const defaultData = () => ({
    meetings: [],
    todos: [],
    trashBin: [],
    team: [
      { id: 't1', name: '张三', email: 'zhangsan@company.com', role: '管理员', department: '产品部', jobTitle: '产品负责人' },
      { id: 't2', name: '李四', email: 'lisi@company.com', role: '成员', department: '研发部', jobTitle: '后端工程师' },
      { id: 't3', name: '王五', email: 'wangwu@company.com', role: '成员', department: '设计部', jobTitle: 'UI 设计师' },
      { id: 't4', name: '王芳', email: 'wangfang@company.com', role: '成员', department: '产品部', jobTitle: '产品经理' },
      { id: 't5', name: '张明', email: 'zhangming@company.com', role: '成员', department: '产品部', jobTitle: '产品经理' },
      { id: 't6', name: '陈伟', email: 'chenwei@company.com', role: '成员', department: '项目部', jobTitle: '项目经理' },
      { id: 't7', name: '孙八', email: 'sunba@company.com', role: '成员', department: '运营部', jobTitle: '运营专员' },
      { id: 't8', name: '周九', email: 'zhoujiu@company.com', role: '观察者', department: '市场部', jobTitle: '市场分析' },
    ],
    settings: { reminderChannels: ['app', 'email'], prefs: defaultPrefs() },
  });

  const TRASH_MAX = 80;
  let cache = null;

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function normalizePrefsEntry(data) {
    const dflt = defaultData();
    if (!data.settings) data.settings = { ...dflt.settings };
    if (!Array.isArray(data.settings.reminderChannels)) data.settings.reminderChannels = dflt.settings.reminderChannels;
    data.settings.prefs = { ...defaultPrefs(), ...(data.settings.prefs || {}) };
  }

  function migrateTeamRoles(team) {
    if (!Array.isArray(team)) return [];
    return team.map((m) => {
      const r = (m.role || '').trim();
      if (PERMISSION_ROLES.includes(r)) {
        return {
          ...m,
          role: r,
          department: (m.department || '').trim() || '未分配部门',
          jobTitle: typeof m.jobTitle === 'string' ? m.jobTitle.trim() : '',
        };
      }
      const prevTitle = typeof m.jobTitle === 'string' ? m.jobTitle.trim() : '';
      const wronglyPlacedJob = r;
      const jobTitle = prevTitle || wronglyPlacedJob || '';
      return { ...m, role: '成员', jobTitle };
    });
  }

  function enrichTeamDeptByKnownNames(team) {
    let changed = false;
    const out = team.map((m) => {
      const d = (m.department || '').trim();
      const bad = !d || d === '未分配部门';
      const canon = TEAM_CANONICAL_BY_NAME[m.name];
      if (!bad || !canon) return m;
      const jt = (m.jobTitle || '').trim();
      changed = true;
      return { ...m, department: canon.department, jobTitle: jt || canon.jobTitle || '' };
    });
    return { team: out, changed };
  }

  function ensureDemoSelfMember(team) {
    const hasSelf = team.some((m) => (m.email || '').toLowerCase().trim() === SELF_ACCOUNT_EMAIL);
    if (hasSelf) return { team: [...team], changed: false };
    return { team: [SELF_FALLBACK_MEMBER(), ...team], changed: true };
  }

  function migrateIfNeeded(data) {
    let dirty = false;
    const v = data._schemaVersion || 0;
    if (v < DATA_SCHEMA_VERSION) {
      if (!Array.isArray(data.team)) data.team = defaultData().team;
      data.team = migrateTeamRoles(data.team);
      if (!Array.isArray(data.trashBin)) data.trashBin = [];
      normalizePrefsEntry(data);
      data._schemaVersion = DATA_SCHEMA_VERSION;
      dirty = true;
    }
    normalizePrefsEntry(data);
    if (!Array.isArray(data.trashBin)) {
      data.trashBin = [];
      dirty = true;
    }
    return dirty;
  }

  function repairTeamOnLoad(data) {
    let dirty = false;
    normalizePrefsEntry(data);
    if (!Array.isArray(data.trashBin)) {
      data.trashBin = [];
      dirty = true;
    }
    let team = Array.isArray(data.team) ? data.team : [];
    let r = ensureDemoSelfMember(team);
    team = r.team;
    if (r.changed) dirty = true;
    r = enrichTeamDeptByKnownNames(team);
    team = r.team;
    if (r.changed) dirty = true;
    data.team = team;
    return dirty;
  }

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
      normalizePrefsEntry(cache);
      let persist = migrateIfNeeded(cache);
      persist = repairTeamOnLoad(cache) || persist;
      if (persist) save();
    } catch {
      cache = defaultData();
    }
    return cache;
  }

  function save() {
    normalizePrefsEntry(cache);
    localStorage.setItem(KEY, JSON.stringify(cache));
    window.dispatchEvent(new CustomEvent('store-updated'));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function stashTrashRow(data, entry) {
    if (!Array.isArray(data.trashBin)) data.trashBin = [];
    data.trashBin.unshift({
      id: uid(),
      deletedAt: new Date().toISOString(),
      ...entry,
    });
    while (data.trashBin.length > TRASH_MAX) data.trashBin.pop();
  }

  function getTrashBin() {
    return [...(load().trashBin || [])];
  }

  function removeTrashRow(rowId) {
    const data = load();
    const idx = data.trashBin.findIndex((r) => r.id === rowId);
    if (idx === -1) return null;
    const [row] = data.trashBin.splice(idx, 1);
    save();
    return row;
  }

  function restoreFromTrash(rowId) {
    const data = load();
    const idx = data.trashBin.findIndex((r) => r.id === rowId);
    if (idx === -1) return false;
    const row = data.trashBin[idx];

    if (row.kind === 'member') {
      const m = deepClone(row.snapshot);
      const emailLc = (m.email || '').toLowerCase().trim();
      if (emailLc && data.team.some((x) => (x.email || '').toLowerCase().trim() === emailLc)) return false;
    }

    data.trashBin.splice(idx, 1);

    if (row.kind === 'todo') {
      let t = deepClone(row.snapshot);
      if (data.todos.some((x) => x.id === t.id)) t = { ...t, id: uid() };
      data.todos.unshift(t);
      save();
      return true;
    }

    if (row.kind === 'member') {
      data.team.unshift(deepClone(row.snapshot));
      save();
      return true;
    }

    if (row.kind === 'meeting_bundle') {
      let meeting = deepClone(row.meeting);
      const oldMid = meeting.id;
      let newMid = meeting.id;
      if (data.meetings.some((mm) => mm.id === meeting.id)) {
        newMid = uid();
        meeting = { ...meeting, id: newMid };
      }
      data.meetings.unshift(meeting);
      (row.todosSnapshot || []).forEach((raw) => {
        let t = deepClone(raw);
        if (t.meetingId === oldMid) t = { ...t, meetingId: newMid };
        if (data.todos.some((x) => x.id === t.id)) t = { ...t, id: uid() };
        data.todos.unshift(t);
      });
      save();
      return true;
    }

    save();
    return false;
  }

  function purgeTrashPermanent(rowId) {
    return !!removeTrashRow(rowId);
  }

  function getUIPrefs() {
    load();
    return { ...defaultPrefs(), ...(cache.settings.prefs || {}) };
  }

  function updateUIPrefs(partial) {
    load();
    cache.settings.prefs = { ...defaultPrefs(), ...cache.settings.prefs, ...partial };
    save();
  }

  function getMeeting(id) {
    return load().meetings.find((m) => m.id === id) || null;
  }

  function getMeetings() {
    return load().meetings.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  }

  function createMeeting(partial = {}) {
    const data = load();
    const meeting = {
      id: uid(),
      title: partial.title || '未命名会议',
      scheduledAt: partial.scheduledAt || new Date().toISOString(),
      status: partial.status || 'scheduled',
      agenda: partial.agenda || [],
      materials: [],
      invitees: partial.invitees || [],
      plannedDurationMinutes: partial.plannedDurationMinutes ?? 60,
      reminderMinutes: partial.reminderMinutes ?? 10,
      notes: Array.isArray(partial.notes) ? partial.notes : [],
      highlights: [],
      transcript: '',
      transcriptEn: '',
      transcriptBilingual: false,
      recording: false,
      minutes: '',
      minutesEdited: false,
      startedAt: partial.startedAt ?? null,
      endedAt: partial.endedAt ?? null,
      pausedSince: partial.pausedSince ?? null,
      createdAt: new Date().toISOString(),
    };
    data.meetings.unshift(meeting);
    save();
    return meeting;
  }

  function updateMeeting(id, updates) {
    const data = load();
    const idx = data.meetings.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    data.meetings[idx] = { ...data.meetings[idx], ...updates };
    save();
    return data.meetings[idx];
  }

  function deleteMeeting(id) {
    const data = load();
    const idx = data.meetings.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const meeting = deepClone(data.meetings[idx]);
    const cascadedTodos = data.todos.filter((t) => t.meetingId === id).map(deepClone);
    stashTrashRow(data, { kind: 'meeting_bundle', meeting, todosSnapshot: cascadedTodos });
    data.meetings = data.meetings.filter((m) => m.id !== id);
    data.todos = data.todos.filter((t) => t.meetingId !== id);
    save();
  }

  function getTodos(filters = {}) {
    let list = [...load().todos];
    if (filters.assigneeId) list = list.filter((t) => t.assigneeId === filters.assigneeId);
    if (filters.status) list = list.filter((t) => t.status === filters.status);
    if (filters.priority) list = list.filter((t) => (t.priority || '中') === filters.priority);
    if (filters.dueBefore) list = list.filter((t) => t.dueAt && new Date(t.dueAt) <= new Date(filters.dueBefore));
    return list.sort((a, b) => {
      const da = a.dueAt ? new Date(a.dueAt) : new Date('9999');
      const db = b.dueAt ? new Date(b.dueAt) : new Date('9999');
      return da - db;
    });
  }

  function createTodo(partial) {
    const data = load();
    const todo = {
      id: uid(),
      title: partial.title || '',
      description: partial.description || '',
      meetingId: partial.meetingId || null,
      assigneeId: partial.assigneeId || null,
      assigneeName: partial.assigneeName || '',
      priority: partial.priority || '中',
      status: 'pending',
      dueAt: partial.dueAt || null,
      reminderAt: partial.reminderAt || null,
      createdAt: new Date().toISOString(),
    };
    data.todos.unshift(todo);
    save();
    return todo;
  }

  function updateTodo(id, updates) {
    const data = load();
    const idx = data.todos.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    data.todos[idx] = { ...data.todos[idx], ...updates };
    save();
    return data.todos[idx];
  }

  function deleteTodo(id) {
    const data = load();
    const t = data.todos.find((x) => x.id === id);
    if (!t) return;
    stashTrashRow(data, { kind: 'todo', snapshot: deepClone(t) });
    data.todos = data.todos.filter((x) => x.id !== id);
    save();
  }

  function getTeam() {
    return load().team;
  }

  function addTeamMember(member) {
    const data = load();
    const perm = (member.role || '').trim();
    const role = PERMISSION_ROLES.includes(perm) ? perm : '成员';
    const m = {
      id: uid(),
      name: member.name || '',
      email: member.email || '',
      role,
      department: member.department || '未分配部门',
      jobTitle: member.jobTitle || '',
    };
    data.team.push(m);
    save();
    return m;
  }

  function deleteTeamMember(memberId) {
    const data = load();
    const m = data.team.find((x) => x.id === memberId);
    if (!m) return;
    stashTrashRow(data, { kind: 'member', snapshot: deepClone(m) });
    data.team = data.team.filter((x) => x.id !== memberId);
    save();
  }

  function invalidateCache() {
    cache = null;
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) invalidateCache();
  });

  return {
    load,
    save,
    uid,
    getMeetings,
    getMeeting,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    getTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    getTeam,
    addTeamMember,
    deleteTeamMember,
    invalidateCache,
    getTrashBin,
    restoreFromTrash,
    purgeTrashPermanent,
    getUIPrefs,
    updateUIPrefs,
  };
})();
