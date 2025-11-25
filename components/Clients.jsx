'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Card, Button, Modal, Form, Table, Badge, ButtonGroup } from 'react-bootstrap';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:5001';

// ----- helpers (frontend-only fallbacks) -----
const LS_KEY_GROUPS = 'mb_groups_v2_groupMultiplier';
const readLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function Clients() {
  // ===== Clients state =====
  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [loading, setLoading] = useState(false);

  // ===== Add/Edit client modal =====
  const [showClientModal, setShowClientModal] = useState(false);
  const [editClientMode, setEditClientMode] = useState(false);

  const [broker, setBroker] = useState('dhan');
  const [addForm, setAddForm] = useState({
    name: '',
    userid: '',
    capital: '',
    access_token: '',
    apikey: '',
    password: '',
    pan: '',
    totpkey: '',
  });

  // ===== Groups state =====
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editGroupMode, setEditGroupMode] = useState(false);
  const [groupForm, setGroupForm] = useState({
    id: null,
    name: '',
    multiplier: '1',
    members: [],
  });

  // ===== Copy-trading setup =====
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyForm, setCopyForm] = useState({
    master: '',
    children: [],
  });

  const masterRef = useRef(null);

  // ===== Helpers =====
  const resetClientForm = () => {
    setAddForm({
      name: '',
      userid: '',
      capital: '',
      access_token: '',
      apikey: '',
      password: '',
      pan: '',
      totpkey: '',
    });
    setBroker('dhan');
  };

  const handleClientInputChange = (field, value) => {
    setAddForm(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBrokerChange = (value) => {
    setBroker(value);
  };

  // ===== Fetch clients from backend =====
  const fetchClients = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/get_clients`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const data = await r.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  // Poll /get_clients until given userid is logged in
  const pollClientSession = async (userid, maxAttempts = 20, intervalMs = 3000) => {
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const r = await fetch(`${API_BASE}/get_clients`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`poll status ${r.status}`);
        const data = await r.json();
        const arr = Array.isArray(data) ? data : [];
        const found = arr.find(c => c.userid === userid);
        if (found && found.session_status === 'ACTIVE') {
          return found;
        }
      } catch (err) {
        console.error('Polling /get_clients error:', err);
      }
      await new Promise(res => setTimeout(res, intervalMs));
    }
    return null;
  };

  useEffect(() => {
    fetchClients().then(() => {
      // After fetching clients, load groups from server (if any)
      loadGroups();
      loadCopySetups();
    });
  }, []);

  // ===== Groups API =====
  const loadGroups = async () => {
    try {
      const r = await fetch(`${API_BASE}/groups`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        setGroups(data);
        writeLS(LS_KEY_GROUPS, data);
      } else {
        // fallback: localStorage
        const local = readLS(LS_KEY_GROUPS, []);
        setGroups(local);
      }
    } catch (err) {
      console.error('Failed to load groups, falling back to localStorage:', err);
      const local = readLS(LS_KEY_GROUPS, []);
      setGroups(local);
    }
  };

  const saveGroup = async () => {
    const members = Array.from(selectedClients);
    const multiplierNum = Number(groupForm.multiplier || '1');
    if (!groupForm.name.trim() || !members.length || multiplierNum <= 0) {
      alert('Please enter a group name, select at least one client, and set a positive multiplier.');
      return;
    }

    const payload = {
      id: groupForm.id || undefined,
      name: groupForm.name.trim(),
      multiplier: multiplierNum,
      members
    };

    const endpoint = editGroupMode ? 'edit_group' : 'add_group';
    let ok = false;
    try {
      const r = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      ok = true;
    } catch (err) {
      console.error('Group save error, writing to localStorage', err);
      // fallback: localStorage
      const old = readLS(LS_KEY_GROUPS, []);
      if (editGroupMode) {
        const idx = old.findIndex(g => String(g.id) === String(groupForm.id));
        if (idx >= 0) old[idx] = { ...old[idx], ...payload };
      } else {
        const newId = old.length ? Math.max(...old.map(g => Number(g.id || 0))) + 1 : 1;
        old.push({ ...payload, id: newId });
      }
      writeLS(LS_KEY_GROUPS, old);
    }

    if (ok) {
      await loadGroups();
    } else {
      const local = readLS(LS_KEY_GROUPS, []);
      setGroups(local);
    }

    setShowGroupModal(false);
    setSelectedClients(new Set());
    setGroupForm({ id: null, name: '', multiplier: '1', members: [] });
    setEditGroupMode(false);
  };

  const deleteGroup = async () => {
    if (!selectedGroupId) {
      alert('Please select a group to delete.');
      return;
    }

    const group = groups.find(g => String(g.id) === String(selectedGroupId));
    if (!group) return;

    const confirmMsg = `Delete group "${group.name}"?`;
    if (!window.confirm(confirmMsg)) return;

    let ok = false;
    try {
      const r = await fetch(`${API_BASE}/delete_group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: group.id }),
      });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      ok = true;
    } catch (err) {
      console.error('Group delete error, deleting locally.', err);
      const old = readLS(LS_KEY_GROUPS, []);
      const filtered = old.filter(g => String(g.id) !== String(group.id));
      writeLS(LS_KEY_GROUPS, filtered);
    }

    if (ok) {
      await loadGroups();
    } else {
      const local = readLS(LS_KEY_GROUPS, []);
      setGroups(local);
    }

    setSelectedGroupId(null);
  };

  const openEditGroup = () => {
    if (!selectedGroupId) {
      alert('Please select a group to edit.');
      return;
    }

    const group = groups.find(g => String(g.id) === String(selectedGroupId));
    if (!group) return;

    setGroupForm({
      id: group.id,
      name: group.name,
      multiplier: String(group.multiplier ?? '1'),
      members: group.members || [],
    });

    setSelectedClients(new Set(group.members || []));
    setEditGroupMode(true);
    setShowGroupModal(true);
  };

  const openAddGroup = () => {
    setGroupForm({ id: null, name: '', multiplier: '1', members: [] });
    setSelectedClients(new Set());
    setEditGroupMode(false);
    setShowGroupModal(true);
  };

  const toggleClientSelection = (userid) => {
    setSelectedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userid)) newSet.delete(userid);
      else newSet.add(userid);
      return newSet;
    });
  };

  const isClientSelected = (userid) => selectedClients.has(userid);

  const allClientsSelected = useMemo(
    () => clients.length > 0 && clients.every(c => selectedClients.has(c.userid)),
    [clients, selectedClients]
  );

  const toggleSelectAllClients = () => {
    if (allClientsSelected) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(clients.map(c => c.userid)));
    }
  };

  // ===== Copy-trading Setup =====
  const loadCopySetups = async () => {
    try {
      const r = await fetch(`${API_BASE}/copy_setups`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const data = await r.json();
      // You can store these in state if needed; for now we just ensure backend is reachable
      console.log('Loaded copy setups:', data);
    } catch (err) {
      console.error('Failed to load copy setups:', err);
    }
  };

  const openCopyModal = () => {
    if (!clients.length) {
      alert('No clients available to configure copy trading.');
      return;
    }

    // Default master is first client
    setCopyForm({
      master: clients[0]?.userid || '',
      children: [],
    });
    setShowCopyModal(true);
  };

  const handleCopyChange = (field, value) => {
    setCopyForm(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const toggleChildSelection = (userid) => {
    setCopyForm(prev => {
      const set = new Set(prev.children);
      if (set.has(userid)) set.delete(userid);
      else set.add(userid);
      return { ...prev, children: Array.from(set) };
    });
  };

  const isChildSelected = (userid) => copyForm.children.includes(userid);

  const saveCopySetup = async (e) => {
    e.preventDefault();

    if (!copyForm.master) {
      alert('Please select a master client.');
      return;
    }
    if (!copyForm.children.length) {
      alert('Please select at least one child client.');
      return;
    }
    if (copyForm.children.includes(copyForm.master)) {
      alert('Master client cannot be a child.');
      return;
    }

    const payload = {
      master: copyForm.master,
      children: copyForm.children,
    };

    try {
      const r = await fetch(`${API_BASE}/set_copy_setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      alert('Copy setup saved.');
      await loadCopySetups();
    } catch (err) {
      console.error('Failed to save copy setup:', err);
      alert('Failed to save copy setup. Check console/logs.');
    } finally {
      setShowCopyModal(false);
    }
  };

  // ===== Add/Edit Client submission =====
  const onSubmit = async (e) => {
    e.preventDefault();

    if (broker === 'dhan' && !(addForm.access_token || addForm.apikey)) {
      alert('Access Token is required for Dhan.');
      return;
    }

    const capitalNum = addForm.capital === '' ? undefined : Number(addForm.capital) || 0;

    const creds =
      broker === 'dhan'
        ? { access_token: addForm.access_token || addForm.apikey }
        : {
            password: addForm.password || undefined,
            pan: addForm.pan || undefined,
            apikey: addForm.apikey || undefined,
            totpkey: addForm.totpkey || undefined,
          };

    const bodyBase = {
      broker,
      display_name: addForm.name || undefined,
      userid: addForm.userid,
      capital: capitalNum,
      creds,
    };

    if (broker === 'dhan') {
      bodyBase.apikey = addForm.access_token || addForm.apikey;
      bodyBase.access_token = addForm.access_token || addForm.apikey;
    } else {
      bodyBase.password = addForm.password || undefined;
      bodyBase.pan = addForm.pan || undefined;
      bodyBase.apikey = addForm.apikey || undefined;
      bodyBase.totpkey = addForm.totpkey || undefined;
    }

    const endpoint = editClientMode ? 'edit_client' : 'add_client';

    try {
      const r = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyBase),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Status ${r.status}: ${txt}`);
      }

      if (!editClientMode) {
        // For add, poll until login is active
        const loggedIn = await pollClientSession(addForm.userid, 20, 3000);
        if (!loggedIn) {
          alert('Client added, but session did not become ACTIVE within timeout.');
        }
      }

      await fetchClients();
      setShowClientModal(false);
      resetClientForm();
      setEditClientMode(false);
    } catch (err) {
      console.error('Client add/edit error:', err);
      alert(`Client add/edit failed: ${err.message}`);
    }
  };

  const openAddClient = () => {
    resetClientForm();
    setEditClientMode(false);
    setShowClientModal(true);
  };

  const openEditClient = () => {
    if (selectedClients.size !== 1) {
      alert('Please select exactly one client to edit.');
      return;
    }

    const userid = Array.from(selectedClients)[0];
    const client = clients.find(c => c.userid === userid);
    if (!client) return;

    setBroker(client.broker || 'dhan');

    setAddForm({
      name: client.display_name || '',
      userid: client.userid,
      capital: client.capital != null ? String(client.capital) : '',
      access_token: client.creds?.access_token || '',
      apikey: client.creds?.apikey || '',
      password: client.creds?.password || '',
      pan: client.creds?.pan || '',
      totpkey: client.creds?.totpkey || '',
    });

    setEditClientMode(true);
    setShowClientModal(true);
  };

  const deleteClients = async () => {
    if (!selectedClients.size) {
      alert('Please select at least one client to delete.');
      return;
    }

    const arr = Array.from(selectedClients);
    const confirmMsg = `Delete ${arr.length} client(s)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const r = await fetch(`${API_BASE}/delete_clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userids: arr }),
      });
      if (!r.ok) throw new Error(`Status ${r.status}`);

      await fetchClients();
      setSelectedClients(new Set());
    } catch (err) {
      console.error('Delete clients failed:', err);
      alert('Failed to delete clients. Check logs.');
    }
  };

  // ===== Render helpers =====
  const renderBrokerBadge = (broker) => {
    if (broker === 'dhan') return <Badge bg="success">Dhan</Badge>;
    if (broker === 'motilal') return <Badge bg="primary">Motilal</Badge>;
    return <Badge bg="secondary">{broker || 'Unknown'}</Badge>;
  };

  const renderSessionBadge = (session) => {
    if (session === 'ACTIVE') return <Badge bg="success">ACTIVE</Badge>;
    if (session === 'FAILED') return <Badge bg="danger">FAILED</Badge>;
    if (session === 'PENDING') return <Badge bg="warning" text="dark">PENDING</Badge>;
    return <Badge bg="secondary">{session || 'UNKNOWN'}</Badge>;
  };

  const selectedGroup = useMemo(
    () => groups.find(g => String(g.id) === String(selectedGroupId)),
    [groups, selectedGroupId]
  );

  const groupMembersSet = useMemo(
    () => new Set(selectedGroup?.members || []),
    [selectedGroup]
  );

  // ===== JSX =====
  return (
    <Card className="mt-3">
      <Card.Body>
        {/* Top controls */}
        <div className="d-flex justify-content-between mb-3">
          <div>
            <Button variant="success" className="me-2" onClick={openAddClient}>
              Add Client
            </Button>
            <Button variant="secondary" className="me-2" onClick={openEditClient}>
              Edit
            </Button>
            <Button variant="danger" onClick={deleteClients}>
              Delete
            </Button>
          </div>
          <div>
            <Button variant="outline-secondary" className="me-2" onClick={fetchClients}>
              Refresh
            </Button>
            <Button variant="outline-info" onClick={openCopyModal}>
              Copy Setup
            </Button>
          </div>
        </div>

        {/* Tabs: Clients / Group */}
        <ButtonGroup className="mb-3">
          <Button variant="primary">Clients</Button>
          <Button variant="outline-primary" onClick={openAddGroup}>
            Group
          </Button>
        </ButtonGroup>

        {/* Clients Table */}
        <Table striped bordered hover size="sm">
          <thead>
            <tr>
              <th style={{ width: 35, textAlign: 'center' }}>
                <Form.Check
                  type="checkbox"
                  checked={allClientsSelected}
                  onChange={toggleSelectAllClients}
                />
              </th>
              <th>Client Name</th>
              <th>Capital</th>
              <th>Broker</th>
              <th>User ID</th>
              <th>Session</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center">
                  No clients yet.
                </td>
              </tr>
            )}
            {!loading &&
              clients.map((c) => (
                <tr key={c.userid}>
                  <td style={{ textAlign: 'center' }}>
                    <Form.Check
                      type="checkbox"
                      checked={isClientSelected(c.userid)}
                      onChange={() => toggleClientSelection(c.userid)}
                    />
                  </td>
                  <td>{c.display_name || c.userid}</td>
                  <td>{c.capital ?? '-'}</td>
                  <td>{renderBrokerBadge(c.broker)}</td>
                  <td>{c.userid}</td>
                  <td>{renderSessionBadge(c.session_status)}</td>
                </tr>
              ))}
          </tbody>
        </Table>

        {/* ===== Group Modal ===== */}
        <Modal show={showGroupModal} onHide={() => setShowGroupModal(false)} size="lg">
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              saveGroup();
            }}
          >
            <Modal.Header closeButton>
              <Modal.Title>{editGroupMode ? 'Edit Group' : 'Add Group'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Group Name</Form.Label>
                <Form.Control
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Multiplier</Form.Label>
                <Form.Control
                  type="number"
                  value={groupForm.multiplier}
                  onChange={(e) =>
                    setGroupForm((prev) => ({ ...prev, multiplier: e.target.value }))
                  }
                />
              </Form.Group>
              <Table striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th style={{ width: 35, textAlign: 'center' }}>Sel</th>
                    <th>Client Name</th>
                    <th>Broker</th>
                    <th>User ID</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center">
                        No clients to assign.
                      </td>
                    </tr>
                  )}
                  {clients.map((c) => (
                    <tr key={c.userid}>
                      <td style={{ textAlign: 'center' }}>
                        <Form.Check
                          type="checkbox"
                          checked={isClientSelected(c.userid)}
                          onChange={() => toggleClientSelection(c.userid)}
                        />
                      </td>
                      <td>{c.display_name || c.userid}</td>
                      <td>{renderBrokerBadge(c.broker)}</td>
                      <td>{c.userid}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Group
              </Button>
              {editGroupMode && (
                <Button variant="danger" onClick={deleteGroup}>
                  Delete Group
                </Button>
              )}
            </Modal.Footer>
          </Form>
        </Modal>

        {/* ===== Copy Trading Modal ===== */}
        <Modal show={showCopyModal} onHide={() => setShowCopyModal(false)} size="lg">
          <Form onSubmit={saveCopySetup}>
            <Modal.Header closeButton>
              <Modal.Title>Copy Trading Setup</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Master Client</Form.Label>
                <Form.Select
                  ref={masterRef}
                  value={copyForm.master}
                  onChange={(e) => handleCopyChange('master', e.target.value)}
                >
                  <option value="">-- Select Master --</option>
                  {clients.map((c) => (
                    <option key={c.userid} value={c.userid}>
                      {c.display_name || c.userid}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group>
                <Form.Label>Child Clients</Form.Label>
                <Table striped bordered hover size="sm">
                  <thead>
                    <tr>
                      <th style={{ width: 35, textAlign: 'center' }}>Sel</th>
                      <th>Client Name</th>
                      <th>Broker</th>
                      <th>User ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients
                      .filter((c) => c.userid !== copyForm.master)
                      .map((c) => (
                        <tr key={c.userid}>
                          <td style={{ textAlign: 'center' }}>
                            <Form.Check
                              type="checkbox"
                              checked={isChildSelected(c.userid)}
                              onChange={() => toggleChildSelection(c.userid)}
                            />
                          </td>
                          <td>{c.display_name || c.userid}</td>
                          <td>{renderBrokerBadge(c.broker)}</td>
                          <td>{c.userid}</td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  Tip: Master cannot be a child. Each child can have its own Multiplier.
                </div>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowCopyModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="success">
                Save Setup
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* ===== Add/Edit Client Modal ===== */}
        <Modal show={showClientModal} onHide={() => setShowClientModal(false)}>
          <Form onSubmit={onSubmit}>
            <Modal.Header closeButton>
              <Modal.Title>{editClientMode ? 'Edit Client' : 'Add Client'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Broker</Form.Label>
                <div>
                  <Form.Check
                    inline
                    label="Dhan"
                    type="radio"
                    id="broker-dhan"
                    name="broker"
                    value="dhan"
                    checked={broker === 'dhan'}
                    onChange={(e) => handleBrokerChange(e.target.value)}
                  />
                  <Form.Check
                    inline
                    label="Motilal"
                    type="radio"
                    id="broker-motilal"
                    name="broker"
                    value="motilal"
                    checked={broker === 'motilal'}
                    onChange={(e) => handleBrokerChange(e.target.value)}
                  />
                </div>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Client Name (optional)</Form.Label>
                <Form.Control
                  value={addForm.name}
                  onChange={(e) => handleClientInputChange('name', e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Client ID / User ID</Form.Label>
                <Form.Control
                  value={addForm.userid}
                  onChange={(e) => handleClientInputChange('userid', e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Capital (optional)</Form.Label>
                <Form.Control
                  type="number"
                  value={addForm.capital}
                  onChange={(e) => handleClientInputChange('capital', e.target.value)}
                />
              </Form.Group>

              {broker === 'dhan' ? (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Access Token (required)</Form.Label>
                    <Form.Control
                      value={addForm.access_token}
                      onChange={(e) =>
                        handleClientInputChange('access_token', e.target.value)
                      }
                      required={!editClientMode}
                    />
                  </Form.Group>
                </>
              ) : (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Password</Form.Label>
                    <Form.Control
                      value={addForm.password}
                      onChange={(e) => handleClientInputChange('password', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>PAN (optional)</Form.Label>
                    <Form.Control
                      value={addForm.pan}
                      onChange={(e) => handleClientInputChange('pan', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>API Key (optional)</Form.Label>
                    <Form.Control
                      value={addForm.apikey}
                      onChange={(e) => handleClientInputChange('apikey', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>TOTP Key (optional)</Form.Label>
                    <Form.Control
                      value={addForm.totpkey}
                      onChange={(e) => handleClientInputChange('totpkey', e.target.value)}
                    />
                  </Form.Group>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowClientModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editClientMode ? 'Save Changes' : 'Add Client'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </Card.Body>
    </Card>
  );
}
