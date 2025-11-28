"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Tabs, Tab, Button } from "react-bootstrap";
import { getCurrentUser, clearCurrentUser } from "../../src/lib/userSession";

// Import your components (if you already have them)
import TradeForm from "../../src/components/TradeForm";
import Orders from "../../src/components/Orders";
import Positions from "../../src/components/Positions";
import Holdings from "../../src/components/Holdings";
import Summary from "../../src/components/Summary";
import Clients from "../../src/components/Clients";
import CopyTrading from "../../src/components/CopyTrading";

export default function TraderPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("trade");
  const [username, setUsername] = useState("");

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !user.username) {
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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Wealth Ocean – Multi Broker Dashboard</h4>
        <div>
          <strong>{username}</strong>{" "}
          <Button size="sm" variant="outline-danger" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-3"
        justify
      >
        <Tab eventKey="trade" title="Trade">
          <TradeForm />
        </Tab>

        <Tab eventKey="orders" title="Orders">
          <Orders />
        </Tab>

        <Tab eventKey="positions" title="Positions">
          <Positions />
        </Tab>

        <Tab eventKey="holdings" title="Holdings">
          <Holdings />
        </Tab>

        <Tab eventKey="summary" title="Summary">
          <Summary />
        </Tab>

        <Tab eventKey="clients" title="Clients">
          <Clients />
        </Tab>

        <Tab eventKey="copy" title="Copy Trading">
          <CopyTrading />
        </Tab>
      </Tabs>
    </Container>
  );
}
