"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Tabs, Tab, Button } from "react-bootstrap";
import { getCurrentUser, clearCurrentUser } from "../../src/lib/userSession";

export default function TraderPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("trade");
  const [username, setUsername] = useState("");

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !user.username) {
      // Not logged in → send to login ONCE
      router.replace("/login");
    } else {
      setUsername(user.username);
    }
  }, [router]);

  const handleLogout = () => {
    clearCurrentUser();
    router.replace("/login");
  };

  return (
    <Container fluid className="mt-3">
      <header className="d-flex justify-content-between align-items-center mb-3">
        <h1>Wealth Ocean – Multi-Broker Trader</h1>
        <div>
          Logged in as <strong>{username}</strong>{" "}
          <Button variant="outline-secondary" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <Tabs
        id="trader-tabs"
        activeKey={activeTab}
        onSelect={(key) => key && setActiveTab(key)}
        className="mb-3"
        justify
      >
        <Tab eventKey="trade" title="Trade">
          {/* Put your existing TradeForm component here */}
          <div>Trade form goes here</div>
        </Tab>
        <Tab eventKey="orders" title="Orders">
          <div>Orders view goes here</div>
        </Tab>
        <Tab eventKey="positions" title="Positions">
          <div>Positions view goes here</div>
        </Tab>
        <Tab eventKey="holdings" title="Holdings">
          <div>Holdings view goes here</div>
        </Tab>
        <Tab eventKey="summary" title="Summary">
          <div>Summary view goes here</div>
        </Tab>
        <Tab eventKey="clients" title="Clients">
          <div>Clients view goes here</div>
        </Tab>
        <Tab eventKey="copy" title="Copy Trading">
          <div>Copy trading view goes here</div>
        </Tab>
      </Tabs>
    </Container>
  );
}
