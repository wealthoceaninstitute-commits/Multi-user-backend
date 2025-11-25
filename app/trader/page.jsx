'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Tabs, Tab, Button } from 'react-bootstrap';
import dynamic from 'next/dynamic';
import { getCurrentUser, clearCurrentUser } from '../../src/lib/userSession';

// Code-split tabs (faster initial load)
const TradeForm   = dynamic(() => import('../../components/TradeForm'),   { ssr: false });
const Orders      = dynamic(() => import('../../components/Orders'),      { ssr: false });
const Positions   = dynamic(() => import('../../components/Positions'),   { ssr: false });
const Holdings    = dynamic(() => import('../../components/Holdings'),    { ssr: false });
const Summary     = dynamic(() => import('../../components/Summary'),     { ssr: false });
const Clients     = dynamic(() => import('../../components/Clients'),     { ssr: false });
const CopyTrading = dynamic(() => import('../../components/CopyTrading'), { ssr: false });

export default function TraderPage() {
  const [key, setKey] = useState('trade');
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      // No user -> go back to login
      router.replace('/');
    } else {
      setUser(u);
    }
  }, [router]);

  const handleLogout = () => {
    clearCurrentUser();
    router.replace('/');
  };

  // While checking user / redirecting, avoid flicker
  if (!user) {
    return null;
  }

  return (
    <Container className="py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">Wealth Ocean – Multi-Broker Trader</h2>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted small">
            Logged in as <strong>{user}</strong>
          </span>
          <Button size="sm" variant="outline-secondary" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <Tabs
        id="trader-main-tabs"
        activeKey={key}
        onSelect={(k) => setKey(k || 'trade')}
        className="mb-3"
        mountOnEnter
        unmountOnExit
        justify
      >
        <Tab eventKey="trade"       title="Trade"><TradeForm /></Tab>
        <Tab eventKey="orders"      title="Orders"><Orders /></Tab>
        <Tab eventKey="positions"   title="Positions"><Positions /></Tab>
        <Tab eventKey="holdings"    title="Holdings"><Holdings /></Tab>
        <Tab eventKey="summary"     title="Summary"><Summary /></Tab>
        <Tab eventKey="clients"     title="Clients"><Clients /></Tab>
        <Tab eventKey="copytrading" title="Copy Trading"><CopyTrading /></Tab>
      </Tabs>
    </Container>
  );
}
