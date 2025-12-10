'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Card, Button, Modal, Form, Table, Badge, ButtonGroup } from 'react-bootstrap';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:5001';

// ----- helpers -----
const LS_KEY_GROUPS = 'mb_groups_v2_groupMultiplier';
const readLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function Clients() {

  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [subtab, setSubtab] = useState('clients');

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [broker, setBroker] = useState('dhan');
  const [addForm, setAddForm] = useState({
    name: '', userid: '', mobile:'', pin:'', apikey:'', api_secret:'', totpkey:'', capital:''
  });

  const [editingKey, setEditingKey] = useState({ broker:null, userid:null });

  const [loggingNow, setLoggingNow] = useState(new Set());
  const pollingAbortRef = useRef(false);

  // Groups
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editGroupMode, setEditGroupMode] = useState(false);

  const [groupForm, setGroupForm] = useState({
    id:null, name:'', multiplier:'1', members:{}
  });

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyForm, setCopyForm] = useState({
    name:'', master:'', rows:{}
  });

  // Loaders
  async function loadClients() {
    try {
      const r = await fetch(`${API_BASE}/clients`, { cache:'no-store' });
      const j = await r.json();
      setClients(Array.isArray(j) ? j : (j.clients || []));
    } catch {
      setClients([]);
    }
  }

  async function loadGroups() {
    try {
      const r = await fetch(`${API_BASE}/groups`, { cache:'no-store' });
      if (r.ok) {
        const j = await r.json();
        const arr = Array.isArray(j) ? j : (j.groups || []);
        setGroups(arr);
        writeLS(LS_KEY_GROUPS, arr);
        return;
      }
      throw new Error('not ready');
    } catch {
      setGroups(readLS(LS_KEY_GROUPS, []));
    }
  }

  useEffect(() => { loadClients(); loadGroups(); }, []);

  const keyOf = (c) => `${(c.broker||'').toLowerCase()}::${c.userid||c.client_id||''}`;
  const allClientKeys = useMemo(() => clients.map(keyOf), [clients]);

  const toggleAllClients = (ch) => setSelectedClients(ch ? new Set(allClientKeys) : new Set());
  const toggleOneClient = (k,ch) =>
    setSelectedClients(prev => { const s=new Set(prev); ch?s.add(k):s.delete(k); return s; });

  const groupKey = (g) => g.id || g.name;
  const allGroupKeys = useMemo(() => groups.map(groupKey), [groups]);
  const toggleAllGroups = (ch) => setSelectedGroups(ch?new Set(allGroupKeys):new Set());
  const toggleOneGroup = (k,ch)=>
    setSelectedGroups(prev=>{ const s=new Set(prev); ch?s.add(k):s.delete(k); return s; });

  const statusBadge = (c) => {
    const k = keyOf(c);
    if (loggingNow.has(k)) return <Badge bg="warning">logging…</Badge>;
    const s = c.session_active === true ? 'logged_in'
      : c.session_active === false ? 'logged_out'
      : (c.status || 'pending');
    const v = s==='logged_in'?'success': s==='logged_out'?'secondary': s==='failed'?'danger':'warning';
    return <Badge bg={v}>{s}</Badge>;
  };

  const openAdd = () => {
    setEditMode(false);
    setBroker('dhan');
    setAddForm({name:'', userid:'', mobile:'', pin:'', apikey:'', api_secret:'', totpkey:'', capital:''});
    setEditingKey({broker:null, userid:null});
    setShowModal(true);
  };

  const openEdit = () => {
    if (selectedClients.size !== 1) return;
    const k = [...selectedClients][0];
    const row = clients.find(c=>keyOf(c)===k);
    if (!row) return;

    setEditMode(true);
    const b = (row.broker||'').toLowerCase();
    setBroker(b);

    setAddForm({
      name: row.name || row.display_name || '',
      userid: row.userid || row.client_id || '',
      mobile: row.mobile || '',
      pin: row.pin || '',
      apikey: row.apikey || '',
      api_secret: row.api_secret || '',
      totpkey: row.totpkey || '',
      capital: row.capital?.toString?.() || ''
    });
    setEditingKey({broker:b, userid: row.userid||row.client_id||''});
    setShowModal(true);
  };

  const onDelete = async () => {
    if (!selectedClients.size) return;
    if (!confirm(`Delete ${selectedClients.size} client(s)?`)) return;

    const items = [...selectedClients].map(k=>{
      const r = clients.find(c=>keyOf(c)===k);
      return {broker:(r?.broker||'').toLowerCase(), userid:r?.userid||r?.client_id||''};
    }).filter(Boolean);

    try{
      await fetch(`${API_BASE}/delete_client`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({items})
      });
      await loadClients();
    }catch{}
    setSelectedClients(new Set());
  };

  async function pollUntilLoggedIn(broker, userid, { intervalMs=1000, maxTries=15 }={}) {
    const targetKey = `${broker}::${userid}`;
    setLoggingNow(prev=>new Set(prev).add(targetKey));
    pollingAbortRef.current=false;

    let tries=0;
    while(!pollingAbortRef.current && tries<maxTries){
      try{
        const r=await fetch(`${API_BASE}/clients`,{cache:'no-store'});
        const j=await r.json();
        const list=Array.isArray(j)?j:(j.clients||[]);
        const hit=list.find(c=>(c.broker||'').toLowerCase()===broker && (c.userid||c.client_id||'')===userid);
        if(hit){
          setClients(list);
          if(hit.session_active===true) break;
        }
      }catch{}
      tries++;
      await new Promise(res=>setTimeout(res,intervalMs));
    }

    setLoggingNow(prev=>{const n=new Set(prev);n.delete(targetKey);return n;});
  }

  const onSubmit = async (e) => {
    e.preventDefault();

    if(broker==='dhan'){
      if(!addForm.mobile || !addForm.pin || !addForm.apikey || !addForm.api_secret || !addForm.totpkey){
        alert("All Dhan fields are required.");
        return;
      }
    }

    const capitalNum = addForm.capital===''?undefined:Number(addForm.capital)||0;

    const creds =
      broker==='dhan'
      ? {
          mobile: addForm.mobile,
          pin: addForm.pin,
          apikey: addForm.apikey,
          api_secret: addForm.api_secret,
          totpkey: addForm.totpkey,
        }
      : {};

    const bodyBase = {
      broker,
      name:addForm.name||undefined,
      userid:addForm.userid,
      capital:capitalNum,
      creds,
      ...creds
    };

    if(editMode && editingKey.userid){
      bodyBase._original={broker:editingKey.broker, userid:editingKey.userid};
      bodyBase.original_broker=editingKey.broker;
      bodyBase.original_userid=editingKey.userid;
    }

    const endpoint=editMode?'edit_client':'add_client';

    try{
      const r = await fetch(`${API_BASE}/${endpoint}`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(bodyBase),
      });

      setShowModal(false);
      setSelectedClients(new Set());
      await loadClients();

      const b = (editMode?editingKey.broker:broker)||broker;
      const id = editMode?editingKey.userid:addForm.userid;
      if(b && id) pollUntilLoggedIn(b,id);

      if(!r.ok){
        console.warn(`/${endpoint} failed`,await r.text().catch(()=>'')); 
      }
    }catch{
      setShowModal(false);
    }
  };

  const membersArrayFromForm = () => {
    const a=[];
    for(const k of Object.keys(groupForm.members||{})){
      if(!groupForm.members[k]) continue;
      const [b,id] = k.split('::');
      if(!b||!id) continue;
      a.push({broker:b,userid:id});
    }
    return a;
  };

  const prefillGroupForm=(g)=>{
    const map={};
    (g.members||[]).forEach(m=>{
      const k=`${(m.broker||'').toLowerCase()}::${m.userid||m.client_id||''}`;
      map[k]=true;
    });
    setGroupForm({
      id:g.id??null,
      name:g.name||'',
      multiplier:g.multiplier?.toString?.()||'1',
      members:map
    });
  };

  const openCreateGroup=()=>{
    setEditGroupMode(false);
    setGroupForm({id:null,name:'',multiplier:'1',members:{}});
    setShowGroupModal(true);
  };

  const openEditGroup=()=>{
    if(selectedGroups.size!==1) return;
    const k=[...selectedGroups][0];
    const g=groups.find(x=>groupKey(x)===k);
    if(!g) return;
    setEditGroupMode(true);
    prefillGroupForm(g);
    setShowGroupModal(true);
  };

  async function saveGroupsLocally(next){
    setGroups(next);
    writeLS(LS_KEY_GROUPS,next);
  }

  const onDeleteGroup=async()=>{
    if(!selectedGroups.size) return;
    if(!confirm(`Delete ${selectedGroups.size} group(s)?`)) return;
    const ids=[...selectedGroups];

    let ok=false;
    try{
      const r=await fetch(`${API_BASE}/delete_group`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids,names:ids})
      });
      ok=r.ok;
    }catch{}

    if(!ok){
      const next=groups.filter(g=>!ids.includes(groupKey(g)));
      await saveGroupsLocally(next);
    }else{
      await loadGroups();
    }
    setSelectedGroups(new Set());
  };

  const onSubmitGroup=async(e)=>{
    e.preventDefault();
    const members=membersArrayFromForm();
    const m = groupForm.multiplier===''?1:Number(groupForm.multiplier);
    if(!groupForm.name.trim()||members.length===0||!isFinite(m)||m<=0){
      alert('Enter name, select members & valid multiplier.');
      return;
    }

    const payload={id:groupForm.id||undefined,name:groupForm.name.trim(),multiplier:m,members};
    const endpoint=editGroupMode?'edit_group':'add_group';

    let ok=false;
    try{
      const r=await fetch(`${API_BASE}/${endpoint}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      ok=r.ok;
    }catch{}

    if(!ok){
      if(editGroupMode){
        const k=payload.id??groupForm.name;
        const next=groups.map(g=> groupKey(g)===k?{...payload}:g );
        await saveGroupsLocally(next);
      }else{
        const tid=`g_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        const newG={id:tid,name:payload.name,multiplier:payload.multiplier,members:payload.members};
        await saveGroupsLocally([newG,...groups]);
      }
    }else{
      await loadGroups();
    }
    setShowGroupModal(false); setEditGroupMode(false);
  };

  const openCopyModal=()=>{
    const rows={};
    clients.forEach(c=>{rows[keyOf(c)]={selected:false,mult:'1'}});
    setCopyForm({name:'',master:'',rows});
    setShowCopyModal(true);
  };

  const onSubmitCopy=async(e)=>{
    e.preventDefault();
    const name=(copyForm.name||'').trim();
    const master=(copyForm.master||'').trim();
    if(!name||!master){alert('Enter name & select master'); return;}

    const children=[]; const multipliers={};
    for(const [k,v] of Object.entries(copyForm.rows||{})){
      if(!v?.selected) continue;
      const [,id]=k.split('::');
      if(!id||id===master) continue;
      children.push(id);
      const m=parseFloat(v.mult);
      multipliers[id]=(!isFinite(m)||m<=0)?1:m;
    }
    if(children.length===0){
      alert('Select at least one Child.');
      return;
    }

    const body={
      name,setup_name:name,
      master,master_account:master,
      children,child_accounts:children,
      multipliers,enabled:false
    };

    try{
      const r=await fetch(`${API_BASE}/save_copytrading_setup`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      if(!r.ok){
        alert(`Error saving: ${r.status}`); return;
      }
      setShowCopyModal(false);
    }catch{
      alert('Network error');
    }
  };


  return (
    <Card className="p-3">

      {/* Toolbar */}
      <div className="d-flex mb-3" style={{gap:10}}>
        {subtab==='clients'?(
          <>
            <Button variant="success" onClick={openAdd}>Add Client</Button>
            <Button variant="secondary" disabled={selectedClients.size!==1} onClick={openEdit}>Edit</Button>
            <Button variant="danger" disabled={!selectedClients.size} onClick={onDelete}>Delete</Button>
          </>
        ):(
          <>
            <Button variant="success" onClick={openCreateGroup}>Create Group</Button>
            <Button variant="secondary" disabled={selectedGroups.size!==1} onClick={openEditGroup}>Edit</Button>
            <Button variant="danger" disabled={!selectedGroups.size} onClick={onDeleteGroup}>Delete</Button>
          </>
        )}
        <div className="ms-auto d-flex" style={{gap:8}}>
          <Button variant="outline-secondary" onClick={()=>{loadClients();loadGroups();}}>Refresh</Button>
          <Button variant="outline-info" onClick={openCopyModal}>Copy Setup</Button>
        </div>
      </div>

      {/* Subtabs */}
      <div className="mb-3">
        <ButtonGroup>
          <Button variant={subtab==='clients'?'primary':'outline-primary'} onClick={()=>setSubtab('clients')}>Clients</Button>
          <Button variant={subtab==='group'?'primary':'outline-primary'} onClick={()=>setSubtab('group')}>Group</Button>
        </ButtonGroup>
      </div>

      {/* Clients Table */}
      {subtab==='clients'?(
        <Table bordered hover responsive size="sm">
          <thead>
            <tr>
              <th style={{width:70}}>
                <Form.Check type="checkbox"
                  checked={selectedClients.size===clients.length && clients.length>0}
                  onChange={(e)=>toggleAllClients(e.target.checked)}
                />
              </th>
              <th>Name</th><th>Capital</th><th>Session</th>
            </tr>
          </thead>
          <tbody>
            {clients.length===0?(
              <tr><td colSpan={4} className="text-muted">No clients yet.</td></tr>
            ):clients.map(c=>{
              const k=keyOf(c);
              const disp=c.name||c.display_name||c.userid||c.client_id||'-';
              const capital=c.capital??'-';
              return(
                <tr key={k}>
                  <td><Form.Check checked={selectedClients.has(k)} onChange={(e)=>toggleOneClient(k,e.target.checked)} /></td>
                  <td>{disp}</td><td>{capital}</td><td>{statusBadge(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ):(
        <Table bordered hover responsive size="sm">
          <thead>
            <tr>
              <th style={{width:70}}>
                <Form.Check type="checkbox"
                  checked={selectedGroups.size===groups.length && groups.length>0}
                  onChange={(e)=>toggleAllGroups(e.target.checked)}
                />
              </th>
              <th>Group Name</th>
              <th>Multiplier</th>
              <th>Members</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {groups.length===0?(
              <tr><td colSpan={5} className="text-muted">No groups yet.</td></tr>
            ):groups.map(g=>{
              const k=groupKey(g);
              const mems=g.members||[];
              const prev=mems.slice(0,3).map(m=>`${m.userid}`).join(', ')
                + (mems.length>3?` +${mems.length-3}`:'');
              return(
                <tr key={k}>
                  <td><Form.Check checked={selectedGroups.has(k)} onChange={(e)=>toggleOneGroup(k,e.target.checked)} /></td>
                  <td>{g.name||'-'}</td>
                  <td>{g.multiplier??'-'}</td>
                  <td>{mems.length}</td>
                  <td className="text-muted">{mems.length?prev:'-'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* Client Modal */}
      <Modal show={showModal} onHide={()=>{setShowModal(false);pollingAbortRef.current=true;}}>
        <Form onSubmit={onSubmit}>
          <Modal.Header closeButton><Modal.Title>{editMode?'Edit Client':'Add Client'}</Modal.Title></Modal.Header>
          <Modal.Body>
            
            <Form.Group className="mb-3">
              <Form.Label>Broker</Form.Label>
              <Form.Select value={broker} disabled={editMode}
                onChange={(e)=>{
                  setBroker(e.target.value);
                  setAddForm({name:'',userid:'',mobile:'',pin:'',apikey:'',api_secret:'',totpkey:'',capital:''});
                }}>
                <option value="dhan">Dhan</option>
                <option value="motilal" disabled>Motilal Disabled</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Label>Name</Form.Label>
              <Form.Control value={addForm.name} onChange={(e)=>setAddForm(p=>({...p,name:e.target.value}))}/>
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Label>Client ID *</Form.Label>
              <Form.Control required disabled={editMode}
                value={addForm.userid}
                onChange={(e)=>setAddForm(p=>({...p,userid:e.target.value.trim()}))}
              />
            </Form.Group>

            {/* ======= NEW DHAN FORM ======= */}
            {broker==='dhan' && (
              <>
                <Form.Group className="mb-2">
                  <Form.Label>Mobile Number *</Form.Label>
                  <Form.Control required value={addForm.mobile}
                    onChange={(e)=>setAddForm(p=>({...p,mobile:e.target.value.trim()}))}
                    placeholder="Registered Mobile"
                  />
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>PIN *</Form.Label>
                  <Form.Control type="password" required value={addForm.pin}
                    onChange={(e)=>setAddForm(p=>({...p,pin:e.target.value.trim()}))}
                    placeholder="Trading PIN"
                  />
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>API Key *</Form.Label>
                  <Form.Control required value={addForm.apikey}
                    onChange={(e)=>setAddForm(p=>({...p,apikey:e.target.value.trim()}))}
                    placeholder="Dhan API Key"
                  />
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>API Secret *</Form.Label>
                  <Form.Control type="password" required value={addForm.api_secret}
                    onChange={(e)=>setAddForm(p=>({...p,api_secret:e.target.value.trim()}))}
                    placeholder="API Secret"
                  />
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>TOTP Key *</Form.Label>
                  <Form.Control type="password" required value={addForm.totpkey}
                    onChange={(e)=>setAddForm(p=>({...p,totpkey:e.target.value.trim()}))}
                    placeholder="Authenticator Secret Key"
                  />
                  <Form.Text muted>Used for auto login OTP generation.</Form.Text>
                </Form.Group>
              </>
            )}

            <Form.Group className="mb-2">
              <Form.Label>Capital</Form.Label>
              <Form.Control type="number" step="0.01" min="0"
                value={addForm.capital}
                onChange={(e)=>setAddForm(p=>({...p,capital:e.target.value}))}
                placeholder="e.g. 100000"
              />
            </Form.Group>

          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={()=>{setShowModal(false);pollingAbortRef.current=true;}}>Cancel</Button>
            <Button type="submit" variant="primary">{editMode?'Save & Login':'Save & Login'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Group Modal */}
      <Modal show={showGroupModal} onHide={()=>setShowGroupModal(false)} size="lg">
        <Form onSubmit={onSubmitGroup}>
          <Modal.Header closeButton><Modal.Title>{editGroupMode?'Edit Group':'Create Group'}</Modal.Title></Modal.Header>
          <Modal.Body>

            <Form.Group className="mb-3">
              <Form.Label>Group Name *</Form.Label>
              <Form.Control required value={groupForm.name}
                onChange={(e)=>setGroupForm(p=>({...p,name:e.target.value}))}
              />
            </Form.Group>

            <Form.Group className="mb-3" style={{maxWidth:200}}>
              <Form.Label>Multiplier *</Form.Label>
              <Form.Control required type="number" min="0.01" step="0.01"
                value={groupForm.multiplier}
                onChange={(e)=>setGroupForm(p=>({...p,multiplier:e.target.value}))}
              />
            </Form.Group>

            <div className="fw-semibold mb-2">Select Clients</div>
            <Table bordered hover size="sm">
              <thead><tr><th>Add</th><th>Client</th><th>Broker</th></tr></thead>
              <tbody>
                {clients.length===0?(
                  <tr><td colSpan={3}>No clients.</td></tr>
                ):clients.map(c=>{
                  const k=keyOf(c);
                  const checked=!!(groupForm.members||{})[k];
                  return(
                    <tr key={k}>
                      <td>
                        <Form.Check checked={checked}
                          onChange={(e)=>{
                            const v=e.target.checked;
                            setGroupForm(p=>{
                              const m={...(p.members||{})};
                              v?m[k]=true:delete m[k];
                              return {...p,members:m};
                            });
                          }}
                        />
                      </td>
                      <td>{c.name || c.userid}</td>
                      <td>{(c.broker||'').toLowerCase()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onClick={()=>setShowGroupModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editGroupMode?'Save':'Create'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Copy Trading Modal */}
      <Modal show={showCopyModal} onHide={()=>setShowCopyModal(false)} size="lg">
        <Form onSubmit={onSubmitCopy}>
          <Modal.Header closeButton><Modal.Title>Create Copy Trading Setup</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" style={{maxWidth:300}}>
              <Form.Label>Setup Name *</Form.Label>
              <Form.Control required value={copyForm.name}
                onChange={(e)=>setCopyForm(p=>({...p,name:e.target.value}))}
              />
            </Form.Group>

            <Form.Group className="mb-3" style={{maxWidth:300}}>
              <Form.Label>Master Account *</Form.Label>
              <Form.Select required value={copyForm.master}
                onChange={(e)=>{
                  const m=e.target.value;
                  setCopyForm(p=>{
                    const rows={...(p.rows||{})};
                    Object.keys(rows).forEach(k=>{
                      if(k.split('::')[1]===m) rows[k].selected=false;
                    });
                    return {...p,master:m,rows};
                  });
                }}>
                <option value="">-- Select --</option>
                {clients.map(c=>{
                  const id=c.userid||c.client_id;
                  return <option key={id} value={id}>{`${c.name||id} (${id})`}</option>;
                })}
              </Form.Select>
            </Form.Group>

            <div className="fw-semibold mb-2">Children</div>
            <Table bordered hover size="sm">
              <thead><tr><th>Select</th><th>Client</th><th>Broker</th><th>Multiplier</th></tr></thead>
              <tbody>
                {clients.length===0?(
                  <tr><td colSpan={4}>No clients.</td></tr>
                ):clients.map(c=>{
                  const k=keyOf(c);
                  const id=c.userid||c.client_id;
                  const isMaster = copyForm.master && id===copyForm.master;
                  const row=copyForm.rows[k]||{selected:false,mult:'1'};
                  return(
                    <tr key={k}>
                      <td>
                        <Form.Check disabled={isMaster} checked={!isMaster && row.selected}
                          onChange={(e)=>{
                            const v=e.target.checked;
                            setCopyForm(p=>{
                              const rows={...(p.rows||{})};
                              rows[k]={...(rows[k]||{mult:'1'}),selected:v};
                              return {...p,rows};
                            });
                          }}
                        />
                      </td>
                      <td>{c.name||id}</td>
                      <td>{c.broker}</td>
                      <td style={{width:100}}>
                        <Form.Control type="number" min="0.1" step="0.1"
                          disabled={isMaster||!row.selected}
                          value={row.mult}
                          onChange={(e)=>{
                            const val=e.target.value;
                            setCopyForm(p=>{
                              const rows={...(p.rows||{})};
                              rows[k]={...(rows[k]||{}),mult:val};
                              return {...p,rows};
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={()=>setShowCopyModal(false)}>Cancel</Button>
            <Button type="submit" variant="success">Save</Button>
          </Modal.Footer>
        </Form>
      </Modal>

    </Card>
  );
}
