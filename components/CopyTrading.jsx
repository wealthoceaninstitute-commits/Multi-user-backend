"use client";

import React, { useEffect, useState } from "react";
import {
  Modal,
  Button,
  Table,
  Form,
  Row,
  Col,
  Badge,
} from "react-bootstrap";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// ------------------------------------------------------------
// Helper: authenticated headers
// ------------------------------------------------------------
function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-auth-token": localStorage.getItem("woi_token") || "",
  };
}

// ------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------
export default function CopyTrading() {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);

  const [setups, setSetups] = useState([]);

  // FORM STATE
  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState({
    setup_name: "",
    master: "",
    members: [],
    multipliers: {},
    enabled: false,
  });

  // ------------------------------------------------------------
  // Redirect if not logged in + load initial data
  // ------------------------------------------------------------
  useEffect(() => {
    const token = localStorage.getItem("woi_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    loadClients();
    loadGroups();
    loadSetups();
  }, []);

  // ------------------------------------------------------------
  // Load clients for the logged-in user
  // ------------------------------------------------------------
  async function loadClients() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/users/clients`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // Load groups (per user)
  // ------------------------------------------------------------
  async function loadGroups() {
    try {
      const res = await fetch(`${API_BASE}/users/groups`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!res.ok) return;

      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error(err);
    }
  }

  // ------------------------------------------------------------
  // Load copy trading setups (per user)
  // ------------------------------------------------------------
  async function loadSetups() {
    try {
      const res = await fetch(`${API_BASE}/users/copy/setups`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setSetups(data.setups || []);
    } catch (err) {
      console.error(err);
    }
  }

  // ------------------------------------------------------------
  // Save a new setup
  // ------------------------------------------------------------
  async function saveSetup() {
    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/users/copy/save`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error(await res.text());

      setShowAdd(false);
      setForm({
        setup_name: "",
        master: "",
        members: [],
        multipliers: {},
        enabled: false,
      });

      loadSetups();
    } catch (err) {
      alert("Failed to save setup: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // Delete setup
  // ------------------------------------------------------------
  async function deleteSetup(setup_name) {
    if (!confirm("Delete this setup?")) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/users/copy/delete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ setup_name }),
      });

      if (!res.ok) throw new Error(await res.text());

      loadSetups();
    } catch (err) {
      alert("Failed to delete: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // Enable
  // ------------------------------------------------------------
  async function enableSetup(setup_name) {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/users/copy/enable`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ setup_name }),
      });

      if (!res.ok) throw new Error(await res.text());

      loadSetups();
    } catch (err) {
      alert("Enable failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // Disable
  // ------------------------------------------------------------
  async function disableSetup(setup_name) {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/users/copy/disable`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ setup_name }),
      });

      if (!res.ok) throw new Error(await res.text());

      loadSetups();
    } catch (err) {
      alert("Disable failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------
  return (
    <div className="container mt-4">
      <h2 className="mb-3">Copy Trading</h2>

      <Button className="mb-3" onClick={() => setShowAdd(true)}>
        ➕ Add Setup
      </Button>

      <Table bordered hover>
        <thead>
          <tr>
            <th>Setup Name</th>
            <th>Master</th>
            <th>Members</th>
            <th>Status</th>
            <th style={{ width: "220px" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {setups.map((s, i) => (
            <tr key={i}>
              <td>{s.setup_name}</td>
              <td>{s.master}</td>

              <td>
                {(s.members || []).map((m, j) => (
                  <Badge key={j} className="me-1 bg-primary">
                    {m}
                  </Badge>
                ))}
              </td>

              <td>
                {s.enabled ? (
                  <Badge bg="success">Enabled</Badge>
                ) : (
                  <Badge bg="secondary">Disabled</Badge>
                )}
              </td>

              <td>
                {!s.enabled && (
                  <Button
                    size="sm"
                    variant="success"
                    className="me-2"
                    onClick={() => enableSetup(s.setup_name)}
                  >
                    Enable
                  </Button>
                )}

                {s.enabled && (
                  <Button
                    size="sm"
                    variant="warning"
                    className="me-2"
                    onClick={() => disableSetup(s.setup_name)}
                  >
                    Disable
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteSetup(s.setup_name)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {/* ------------------------------------------------------------
          Add Setup Modal
      ------------------------------------------------------------ */}
      <Modal show={showAdd} onHide={() => setShowAdd(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Create Copy-Trading Setup</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>Setup Name</Form.Label>
              <Form.Control
                value={form.setup_name}
                onChange={(e) =>
                  setForm({ ...form, setup_name: e.target.value })
                }
              />
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Label>Master Client</Form.Label>
              <Form.Select
                value={form.master}
                onChange={(e) =>
                  setForm({ ...form, master: e.target.value })
                }
              >
                <option value="">Select Master</option>
                {clients.map((c, i) => (
                  <option key={i} value={c.client_id}>
                    {c.display_name} ({c.client_id})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Label>Member Clients</Form.Label>
              <Form.Select
                multiple
                value={form.members}
                onChange={(e) =>
                  setForm({
                    ...form,
                    members: Array.from(
                      e.target.selectedOptions,
                      (opt) => opt.value
                    ),
                  })
                }
              >
                {clients.map((c, i) => (
                  <option key={i} value={c.client_id}>
                    {c.display_name} ({c.client_id})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAdd(false)}>
            Cancel
          </Button>

          <Button variant="primary" onClick={saveSetup}>
            Save Setup
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
